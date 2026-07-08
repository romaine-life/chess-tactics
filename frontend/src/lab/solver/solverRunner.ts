// The solver stepper's stateful orchestrator (mirrors bender-world's engine/algorithm-runner.ts).
// Wraps the PURE engine entrypoints — `solveStepWithPhases` (retrograde, ADR-0068 §7/F7) and
// `stepSearchWithPhases` (search) — into the reference-repo runner shape the buffer/hook drive:
// one micro-step per `runStepWithPhases()` call, coarse `runSweep()`/`runDepth()` batches,
// lightweight index-based snapshots for undo/redo, and `reset(config)`.
//
// It also REPLAYS a pre-recorded SolveStep[] trace (a cluster run's persisted trace — the
// Phase-3 seam) through the exact same interface, so watching a recorded solve is
// indistinguishable from stepping a live one.
//
// Determinism + snapshots: solves are deterministic (node-count-only budgets, seeded RNG), and
// the engine generators are collect-then-yield, so every pulled step is cached here. A snapshot
// is just `{ stepIndex }`; restore rewinds (or fast-forwards) the cursor over the cache and
// refolds the view — no engine re-run, no heavy copies (the bender "seed + counters" pattern,
// cheaper still because the trace itself is the state).
//
// NOTE on `seed`: the retrograde engine entrypoint pins seed 0 internally (matching runSolve);
// `config.seed` reaches the search-mode input build. Keep seed 0 for parity across modes.

import type { Level } from '../../core/level';
import type {
  DecidedPosition, OrderedMove, PieceValueReport, RootBounds, SearchWindow,
  SolveBounds, SolveMode, SolvePhaseName, SolveStep, Value,
} from '../../core/solver';
import {
  estimateFeasibility, solveStepWithPhases, stepSearchWithPhases,
  toSolverInput, weakBoundsFromSolveBounds,
} from '../../core/solver';
import { assertNever, phaseDataFromStep, phaseIndexOfName, type SolverPhaseData } from './phaseData';

// ─── Config ──────────────────────────────────────────────────────────────────────────────

export interface SolverStepConfig {
  level: Level;
  bounds: SolveBounds;
  seed: number;
  /** Which vocabulary to run live. Absent ⇒ `estimateFeasibility(level).recommendedMode`
   * (tiny boards retrograde, bigger ones bounded search — the safe default for the browser). */
  mode?: SolveMode;
  /** Search-mode iterative-deepening ceiling (plies), so a live in-browser trace stays
   * watchably short. Ignored in retrograde/trace modes. */
  searchDepthPlies?: number;
  /** Replay this recorded SolveStep[] (e.g. a cluster run's persisted trace) instead of
   * running the engine live. `mode` is derived from the steps' `kind`. */
  trace?: SolveStep[];
}

// ─── View state + the pure fold ──────────────────────────────────────────────────────────

export interface SolvedCounts { win: number; loss: number; draw: number; undecided: number }

/** The cumulative board-frame view the panels/board read — everything a panel needs beyond
 * the current step's own payload. Built by folding consumed steps (pure, replay-identical). */
export interface SolverViewState {
  /** Which vocabulary the trace speaks (null until the first step lands). */
  mode: SolveMode | null;
  /** Steps folded so far (== the runner's cursor). */
  stepIndex: number;
  phase: SolvePhaseName | null;
  /** Latest Propagate/Converge sweep number (retrograde); 0 in search. */
  sweep: number;
  enumerated: number;
  terminals: number;
  remainingUnknown: number;
  solvedCounts: SolvedCounts;
  /** Latest frontier: seeded terminals / newly-decided positions (retrograde). */
  frontier: DecidedPosition[];
  /** Latest αβ window (search). */
  window: SearchWindow | null;
  /** Current line from the root (search). */
  line: OrderedMove[];
  rootBounds: RootBounds | null;
  rootValue: Value | null;
  pieceValues: PieceValueReport | null;
  atFixpoint: boolean;
}

export function initialViewState(mode: SolveMode | null): SolverViewState {
  return {
    mode,
    stepIndex: 0,
    phase: null,
    sweep: 0,
    enumerated: 0,
    terminals: 0,
    remainingUnknown: 0,
    solvedCounts: { win: 0, loss: 0, draw: 0, undecided: 0 },
    frontier: [],
    window: null,
    line: [],
    rootBounds: null,
    rootValue: null,
    pieceValues: null,
    atFixpoint: false,
  };
}

/** Fold one contract SolveStep into the cumulative view. PURE (returns a new state), so undo
 * is a refold and determinism is testable directly. Exhaustive: a new SolveStep variant is a
 * compile error here (assertNever), not a silently-unchanged view. */
export function foldStepIntoView(view: SolverViewState, step: SolveStep): SolverViewState {
  const next: SolverViewState = {
    ...view,
    stepIndex: view.stepIndex + 1,
    phase: step.phase,
    mode: view.mode ?? (step.kind === 'retrograde' ? 'retrograde' : 'search'),
  };
  if (step.kind === 'retrograde') {
    switch (step.phase) {
      case 'Enumerate':
        next.enumerated = step.enumerated;
        next.remainingUnknown = step.enumerated; // nothing proven yet
        return next;
      case 'SeedTerminals':
        next.terminals = step.totalTerminals;
        next.frontier = step.seeded;
        // Terminals are proven at distance 0 — the census starts here, not at sweep 1.
        next.remainingUnknown = Math.max(0, view.enumerated - step.totalTerminals);
        if (step.seedCounts) {
          next.solvedCounts = { ...step.seedCounts, undecided: next.remainingUnknown };
        }
        return next;
      case 'Propagate':
        next.sweep = step.sweep;
        next.frontier = step.newlyDecided;
        next.remainingUnknown = step.remainingUnknown;
        return next;
      case 'Converge':
        next.sweep = step.sweep;
        next.atFixpoint = step.atFixpoint;
        // At the fixpoint the undecided→draw drain fires: everything still unknown is now a
        // proven DRAW (already inside step.proven.draw), so unknown drops to zero — the
        // counters below the panel must not contradict the drain story.
        if (step.atFixpoint) next.remainingUnknown = 0;
        next.solvedCounts = {
          win: step.proven.win,
          loss: step.proven.loss,
          draw: step.proven.draw,
          undecided: next.remainingUnknown,
        };
        return next;
      case 'ReadValue':
        next.rootValue = step.rootValue;
        next.pieceValues = step.pieceValues ?? null;
        next.rootBounds = {
          lower: step.rootValue.outcome,
          upper: step.rootValue.outcome,
          ...(step.rootValue.distancePlies !== undefined ? { bestDistancePlies: step.rootValue.distancePlies } : {}),
          proven: step.rootValue.outcome !== 'unknown',
        };
        return next;
      default:
        return assertNever(step);
    }
  }
  // Search: `window.ply` is the node under discussion's depth from the root, so phases that
  // carry no line of their own (Order/Quiesce/BackUp) TRIM the running line to that ply —
  // during a multi-level back-up cascade the board walks back UP the tree with the values,
  // instead of freezing at the deepest leaf while the panel narrates ancestors.
  switch (step.phase) {
    case 'Generate':
      next.window = step.window;
      next.line = step.line;
      return next;
    case 'Order':
      next.window = step.window;
      next.line = view.line.slice(0, step.window.ply);
      return next;
    case 'Descend':
      next.window = step.window;
      next.line = step.line;
      return next;
    case 'Quiesce':
      next.window = step.window;
      next.line = view.line.slice(0, step.window.ply);
      return next;
    case 'BackUp':
      next.window = step.window;
      next.line = view.line.slice(0, step.window.ply);
      if (step.rootBounds) {
        next.rootBounds = step.rootBounds;
        if (step.rootBounds.proven) {
          // A rootBounds-carrying BackUp's childValue IS the root value (the driver emits it
          // that way), so prefer it — it carries the winner side the bounds alone drop.
          next.rootValue = step.childValue.outcome === step.rootBounds.lower
            ? step.childValue
            : {
              outcome: step.rootBounds.lower,
              ...(step.rootBounds.bestDistancePlies !== undefined ? { distancePlies: step.rootBounds.bestDistancePlies } : {}),
            };
        }
      }
      return next;
    default:
      return assertNever(step);
  }
}

// ─── Step result + snapshot ──────────────────────────────────────────────────────────────

/** One consumed micro-step: the contract step itself plus the cumulative headline counters
 * a panel/control row reads without re-deriving the fold. */
export interface SolverStepResult {
  /** 0-based index of this step in the run's deterministic step sequence. */
  index: number;
  step: SolveStep;
  phase: SolvePhaseName;
  /** PhaseBar segment 0..4 within this step's vocabulary. */
  phaseIndex: number;
  sweep: number;
  solvedCounts: SolvedCounts;
  rootValue: Value | null;
  /** True when the trace is exhausted after this step. */
  done: boolean;
}

/** Lightweight snapshot for undo/redo — the trace index alone. Restore refolds the cached
 * deterministic trace; nothing else is state (bender's seed-plus-counters pattern). */
export interface SolverSnapshot {
  stepIndex: number;
}

// ─── Runner ──────────────────────────────────────────────────────────────────────────────

export class SolverRunner {
  private config!: SolverStepConfig;
  private mode!: SolveMode;
  private source!: Generator<SolveStep, void, void>;
  private sourceDone!: boolean;
  private cache!: SolveStep[];
  private cursor!: number;
  private view!: SolverViewState;

  constructor(config: SolverStepConfig) {
    this.reset(config);
  }

  /** (Re)build from config. Absent config ⇒ rerun the current one from step 0. */
  reset(config?: SolverStepConfig): void {
    if (config) this.config = config;
    const cfg = this.config;
    this.mode = cfg.trace
      ? (cfg.trace[0]?.kind === 'search' ? 'search' : 'retrograde')
      : cfg.mode ?? estimateFeasibility(cfg.level).recommendedMode;
    this.source = this.makeSource();
    this.sourceDone = false;
    this.cache = [];
    this.cursor = 0;
    this.view = initialViewState(this.mode);
  }

  private makeSource(): Generator<SolveStep, void, void> {
    const cfg = this.config;
    if (cfg.trace) return replayTrace(cfg.trace.slice());
    if (this.mode === 'search') {
      const weak = {
        ...weakBoundsFromSolveBounds(cfg.bounds),
        ...(cfg.searchDepthPlies !== undefined ? { maxDepthPlies: cfg.searchDepthPlies } : {}),
      };
      return stepSearchWithPhases(toSolverInput(cfg.level, cfg.seed), weak);
    }
    return solveStepWithPhases(cfg.level, cfg.bounds);
  }

  /** Fill the cache through index i; true iff cache[i] exists. */
  private ensure(i: number): boolean {
    while (this.cache.length <= i && !this.sourceDone) {
      const r = this.source.next();
      if (r.done) { this.sourceDone = true; break; }
      this.cache.push(r.value);
    }
    return i < this.cache.length;
  }

  private buildResult(step: SolveStep): SolverStepResult {
    return {
      index: this.cursor - 1,
      step,
      phase: step.phase,
      phaseIndex: phaseIndexOfName(step.phase),
      sweep: this.view.sweep,
      solvedCounts: this.view.solvedCounts,
      rootValue: this.view.rootValue,
      done: this.ended,
    };
  }

  private advance(): SolverStepResult | null {
    if (!this.ensure(this.cursor)) return null;
    const step = this.cache[this.cursor];
    this.cursor += 1;
    this.view = foldStepIntoView(this.view, step);
    return this.buildResult(step);
  }

  /** One micro-step with full per-phase detail; null when the trace is exhausted. */
  runStepWithPhases(): { stepResult: SolverStepResult; phases: SolverPhaseData } | null {
    const stepResult = this.advance();
    if (!stepResult) return null;
    return { stepResult, phases: phaseDataFromStep(stepResult.step) };
  }

  /** One micro-step without the per-phase view-model, for fast playback. */
  runCoarseStep(): SolverStepResult | null {
    return this.advance();
  }

  /** Coarse batch: consume through the next sweep boundary — retrograde `Converge` (or the
   * final `ReadValue`), search `BackUp`. Returns the LAST consumed result; null at end. */
  runSweep(): SolverStepResult | null {
    let last: SolverStepResult | null = null;
    for (;;) {
      const r = this.runCoarseStep();
      if (!r) return last;
      last = r;
      const s = r.step;
      const boundary = s.kind === 'retrograde'
        ? s.phase === 'Converge' || s.phase === 'ReadValue'
        : s.phase === 'BackUp';
      if (boundary || r.done) return last;
    }
  }

  /** Peek at the next step without consuming it (may lazily pull the source once). */
  peekStep(): SolveStep | null {
    return this.ensure(this.cursor) ? this.cache[this.cursor] : null;
  }

  /** Coarser batch: one whole round — retrograde to the fixpoint `Converge` (or `ReadValue`);
   * search one ITERATIVE-DEEPENING iteration (every emitted window inside iteration d has
   * `depth + ply === d`, so the batch stops before the first step whose sum grows). Returns
   * the LAST consumed result; null at end. */
  runDepth(): SolverStepResult | null {
    let last: SolverStepResult | null = null;
    let iteration: number | null = null;
    for (;;) {
      const peeked = this.peekStep();
      if (!peeked) return last;
      if (peeked.kind === 'search') {
        const iter = peeked.window.depth + peeked.window.ply;
        if (iteration === null) iteration = iter;
        else if (iter > iteration) return last; // next deepening iteration begins here
      }
      const r = this.runCoarseStep();
      if (!r) return last;
      last = r;
      if (r.step.kind === 'retrograde') {
        const s = r.step;
        if ((s.phase === 'Converge' && s.atFixpoint) || s.phase === 'ReadValue') return last;
      }
      if (r.done) return last;
    }
  }

  /** The cumulative board-frame view (immutable — folds replace it). */
  getCurrentState(): SolverViewState {
    return this.view;
  }

  getSnapshot(): SolverSnapshot {
    return { stepIndex: this.cursor };
  }

  /** Rewind (or fast-forward) to a snapshot. Rewind refolds the cached prefix; forward pulls
   * the deterministic source up to the target. Cheap either way — no engine re-run. */
  restoreSnapshot(snapshot: SolverSnapshot): void {
    const target = Math.max(0, Math.floor(snapshot.stepIndex));
    if (target > 0) this.ensure(target - 1);
    this.cursor = Math.min(target, this.cache.length);
    let view = initialViewState(this.mode);
    for (let i = 0; i < this.cursor; i += 1) view = foldStepIntoView(view, this.cache[i]);
    this.view = view;
  }

  /** True when no step remains (probing may lazily pull the source once). */
  get ended(): boolean {
    return !this.ensure(this.cursor);
  }

  get phase(): SolvePhaseName | null { return this.view.phase; }
  get sweepIndex(): number { return this.view.sweep; }
  get solved(): SolvedCounts { return this.view.solvedCounts; }
  get stepIndex(): number { return this.cursor; }
  get seed(): number { return this.config.seed; }
  get solveMode(): SolveMode { return this.mode; }
  get level(): Level { return this.config.level; }
}

function* replayTrace(steps: SolveStep[]): Generator<SolveStep, void, void> {
  for (const s of steps) yield s;
}
