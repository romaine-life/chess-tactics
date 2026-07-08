# Board Solver — Unified Implementation Plan

Implements **ADR-0068 — Board solving is the front of the per-board AI pipeline** (`docs/adr/0068-board-solver-is-the-front-of-the-per-board-ai-pipeline.md`). The ADR decides we build a bounded, anytime, cluster-backed board solver with an interactive stepper, sharing one pure engine core. Given any board it (a) estimates feasibility (ADR §2), (b) runs a bounded anytime solve — strong (retrograde tablebase) when small enough, weak (iterative-deepening αβ) otherwise (ADR §1/§3/§4) — and (c) reports the proven game value, a partial/complete tablebase, and honest piece values by ablation. It has two faces over one pure engine: an in-browser phase-by-phase **stepper** (the learning surface, the `bender-world`/`eight-queens` idiom) and a **cluster-backed run** cloned from the `train-runs` Job lifecycle.

This plan merges four build parts (ADR §"Build phases") plus the shared-contracts module that binds them:

- **Shared contracts** — `frontend/src/core/solver/types.ts`, the single source of truth for every cross-phase interface.
- **Phase 1 — Pure engine**: feasibility estimator + retrograde strong-solver + ablation, under `frontend/src/core/solver/`.
- **Phase 2 — Interactive stepper**: in-browser phase-decomposed replayable stepper, in the one Studio.
- **Phase 3 — Cluster `solve-runs`**: DB/API/Job/worker/client/Run-tab, cloned from `train-runs`.
- **Phase 4 — Search mode**: anytime weak-solver (iterative-deepening αβ + TT + cycle detection; PN optional).

All paths are relative to `D:/repos/chess-tactics/.claude/worktrees/strange-feynman-143c34/`.

---

## Repo-verified facts (read these before touching any file)

Every fact below was confirmed against the worktree during planning. They correct specific errors in the draft; do not re-derive them from memory or stale comments.

- **F1 — Terminal/victory evaluation MUST route through `resolveVictory` with the level's victory override, not `evaluateObjective`.** `evaluateObjective(state, objective, ctx)` (objectives.ts:186) only expands the *preset* `victoryRulesForObjective(objective, ctx)` and **never reads `level.victory`**. The live store evaluates victory as `resolveVictory(game, victoryOverride ?? victoryRulesForObjective(objective, ctx), ctx)` where `victoryOverride = level.victory ?? null` (store.ts:466, 533, 619, 688, 708, 753). `level.victory` is a real optional `VictoryRules` field (ADR-0064, shipped). A solver using `evaluateObjective` silently solves authored levels against the WRONG win conditions. See §"Victory-rule terminal oracle" below.
- **F2 — `objectiveContextForLevel(level)` returns ONLY `{ surviveTurns }` (survive) / `{ reachCells }` (reach) / `{}` (else)** (objectives.ts:203). It does **not** include `kingSide` and does **not** include `turnsElapsed`. Self-play/store layer `kingSide` on with a spread: `{ ...objectiveContextForLevel(level), kingSide: kingSideOf(pieces) }` (selfplay.ts:80), and thread the live clock per-ply as `{ ...ctx, turnsElapsed }`. For a `capture-king`/`rival-kings` board, omitting `kingSide` mis-decides which side's king-loss is terminal.
- **F3 — Trainer engine bundle output path is `frontend/trainer-bundle/engine.mjs`.** Verified: `vite.trainer.config.js` sets `outDir: 'trainer-bundle'` + `entryFileNames: 'engine.mjs'`; `Dockerfile:22` copies `frontend/trainer-bundle`. The config's *header comment* still says `dist-trainer/engine.mjs` — **stale, ignore it**. The worker import is a **relative path from `backend/`**: `train-worker.mjs:17` imports `from '../frontend/trainer-bundle/engine.mjs'`. `solve-worker.mjs` uses the identical relative specifier.
- **F4 — The list query and the get query have DIFFERENT projections.** `dbListTrainRuns` (server.js:2393) selects `id, spec, status, created_at, updated_at` — **no `body`, no `job_name`**, `ORDER BY created_at DESC LIMIT 100`. `dbGetTrainRun` (server.js:2402) selects `id, spec, body, status, job_name, created_at, updated_at`. `TrainRunSummary` (trainRuns.ts:34) is `{ id, spec, status, created_at, updated_at }`; `TrainRunDoc extends TrainRunSummary` adds `{ body, job_name }`. The solver's DB helpers + client types must preserve this split.
- **F5 — `ClusterRuns` signature is `ClusterRuns({ level, levelId, onAdopt })` with `onAdopt` REQUIRED** (ClusterRuns.tsx:24) and `levelId` woven through. The adopt/ship machinery (`verdictLabel` at module top, `shipAiWeights`, `isAdmin`, `champTheta`) is threaded through the render, not an isolated block. The solver's `SolveRuns` drops these — a prop-shape change, not a delete-a-block edit.
- **F6 — `legalMoves` GENERATES en-passant moves from `env.lastMove`** (rules.ts:207 `const last = env?.lastMove`, rules.ts:221 `moves.push({ x, y, capture: last.pieceId, enPassant: true })`). `gameEnv(state)` returns **no** `lastMove` (rules.ts:88–92); callers spread `{ ...gameEnv(state), lastMove }` per ply. A decoded position with no `lastMove` therefore **cannot** produce the en-passant capture the live engine would — a silent move-graph divergence on pawn-adjacent boards. See §"En passant" for the mandatory refusal gate.
- **F7 — ADR-0068 exists on this branch** (`docs/adr/0068-board-solver-is-the-front-of-the-per-board-ai-pipeline.md`) and §6 names the three engine entrypoints **verbatim**: `estimateFeasibility(level) → FeasibilityReport`, `runSolve(level, bounds, onProgress) → SolveResult`, `solveStepWithPhases(...)`. All three are named contracts; Phase 1's barrel must export all three. The ADR's own header (line 3) flags the number as provisional (0063/0064 already collide across parallel branches) — reconcile at merge.
- **F8 — This repo has NO repetition/50-move rule** (ADR §1, verified in rules/objectives/selfplay). "Draw" = neither side can force a king-capture in finite plies. This is why win-distance/DTM labels + explicit cycle detection are load-bearing, not an artificial ply cap.
- **F9 — `random-rock` does not appear in `game/setup.ts` or `game/__fixtures__/breakLine.ts`.** The three tiny test boards and BtL do not use it. Confirm any *new* target board before assuming rocks are a static frame (§"Determinism / random-rock").

---

## Contract-reconciliation rulings (applied throughout)

The **Shared contracts** section is authoritative for every interface exchanged across phases. Where the four part-plans disagreed, these rulings resolved it:

1. **`RootBounds` is `{ lower: Outcome; upper: Outcome; bestDistancePlies?; proven }`** (contracts), **not** the `[number, number]` tuple the Phase-3 client draft used, nor `{ lower: SolveValue; upper: SolveValue }` of the Phase-4 draft. Phase 3's `net/solveRuns.ts` and Phase 4's `WeakSolveResult` bind to the contract shape.
2. **The game-theoretic value type is `Value { outcome; winner?; distancePlies? }`** (contracts). Phase 1's internal `PositionLabel`/`RootValue` and Phase 4's internal `SolveValue` union are **engine-internal representations** that convert to/from `Value` at the module boundary (public results carry `Value`, per `SolveResult.rootValue: Value`). Phase 4's `SolveValue.kind:'unknown'` maps to `Value.outcome:'unknown'`.
3. **Feasibility verdict strings are `'solvable' | 'hard' | 'infeasible'`** (contract `SolveVerdict`), a normalization of the ADR §2 prose labels `solvable-exactly · hard · infeasible`. Phase 1's `estimateFeasibility` returns the contract `FeasibilityReport` with `verdict: SolveVerdict`; the human-readable ADR phrasing ("solvable exactly in secs/mins") lives in `FeasibilityReport.notes`, not the enum.
4. **`FeasibilityReport` is the contract shape** (`stateSpaceUpperBound`, `branchingRoot`, `branchingSampled`, `tablebaseBytesEstimate`, `verdict`, `etaSeconds`, `recommendedMode`, `notes`). Phase 1's richer draft fields (`boardCells`, `pieces`, `bytesPerEntry`, `reachableSampleEstimate`) are permitted as **additive optional** fields but the eight contract fields are the guaranteed surface every consumer reads.
5. **Three public engine entrypoints per ADR §6 (verified F7):** `estimateFeasibility(level)`, `runSolve(level, bounds, onProgress)`, and `solveStepWithPhases(...)`. All three are exported from `core/solver/index.ts` (the draft barrel omitted `solveStepWithPhases` — corrected in §Phase 1). The Phase-2 `SolverRunner.runStepWithPhases()` is the *browser stepper's stateful wrapper* that drives the pure `solveStepWithPhases` — not the engine entrypoint. If Phase 1's first cut ships `solveStepWithPhases` as a thin coroutine over `runSolve`'s `onProgress`, that is acceptable **provided the named export exists** so Phase 2 imports a real symbol.
6. **Mode selection:** `FeasibilityReport.verdict === 'solvable'` → `mode:'retrograde'` (Phase 1); `'hard' | 'infeasible'` → `mode:'search'` (Phase 4). `runSolve` dispatches on `SolveSpec.mode` (prefilled from `recommendedMode`).
7. **Engine bundle path (F3, resolved):** the output is **`frontend/trainer-bundle/engine.mjs`** (`vite.trainer.config.js` `outDir:'trainer-bundle'` + `entryFileNames:'engine.mjs'`, copied at `Dockerfile:22`). The stale `dist-trainer` comment is wrong; do not import `dist-trainer`. `solve-worker.mjs` imports `from '../frontend/trainer-bundle/engine.mjs'` — the exact relative specifier `train-worker.mjs:17` uses. Stage 0.5 re-verifies before Phase 3 wires the import.
8. **DELETE is cancel-not-purge (ADR §5, mandated).** ADR §5 literally says "**`DELETE`** cancels (delete Job + keep the partial body)." The trainer's `DELETE` deletes the row; the solver's must keep it (`status='cancelled'`, keep `body`). This is an ADR requirement, not a discretionary divergence.

---

## Shared contracts

The single source of truth is **`frontend/src/core/solver/types.ts`** — pure, DOM-free, dependency-light TypeScript (types + `const` literal arrays + narrowing helpers only, no engine logic). Consumed by the feasibility estimator, retrograde solver, search solver, interactive stepper, cluster worker, DB body patches, the client (`net/solveRuns.ts`), and every panel component. Because the streamed `SolveProgress` shape is patched into a Postgres JSONB `body` and re-read by a polling client (ADR §5), **every type here is JSON-serializable** — no class instances, functions, `Map`/`Set`, or `bigint` on the wire.

Imports (all `import type` except the value-guards it defines):
```ts
import type { Level, ObjectiveType, VictoryRules } from '../level';
import type { BoardSize, GameState, Move, PieceType, Side, Winner } from '../types';
import type { ObjectiveContext } from '../objectives';
```

### Game-theoretic value (ADR §1, DTM-style)

```ts
/** Game-theoretic outcome of a position under perfect play (ADR-0068 §1). `unknown`
 * is the still-undecided label a PARTIAL solve carries; a proven win/loss/draw is
 * final and never regresses to `unknown`. `win`/`loss` are from the perspective of
 * the side to move at that position unless a `winner` side is given (see Value). */
export type Outcome = 'win' | 'loss' | 'draw' | 'unknown';

/**
 * The definite value of a position under perfect play (Zermelo — ADR-0068 §1).
 * - `outcome`: win / loss / draw / unknown.
 * - `winner`: the SIDE that wins under perfect play, present iff outcome is win|loss.
 *   Redundant with side-to-move for a well-formed position but stored so a Value read
 *   in isolation (a panel, a tablebase entry) is unambiguous which faction it favours.
 * - `distancePlies`: DTM — plies from THIS position to the king-capture that settles it
 *   under perfect play (0 = already terminal). Present for a proven win|loss; ABSENT for
 *   a draw (loopy game: "neither side forces a capture in finite moves" has no finite
 *   distance — ADR-0068 §1) and for `unknown`. Mirrors ai.ts's `WIN_SCORE - ply` ranking
 *   made a first-class integer instead of a score offset.
 */
export interface Value {
  outcome: Outcome;
  winner?: Side;
  distancePlies?: number;
}

/** The value of a position from the OTHER side's view: win↔loss, draw/unknown fixed,
 * distance preserved. The single negamax flip both solvers share (retrograde Propagate,
 * search BackUp). Pure. */
export function flipOutcome(v: Value): Value {
  if (v.outcome === 'win') return { outcome: 'loss', winner: v.winner, distancePlies: v.distancePlies };
  if (v.outcome === 'loss') return { outcome: 'win', winner: v.winner, distancePlies: v.distancePlies };
  return v;
}
```

### Feasibility (ADR §2/§4)

```ts
export const SOLVE_VERDICTS = ['solvable', 'hard', 'infeasible'] as const;
/** The feasibility verdict (ADR-0068 §2, normalized from the prose labels): `solvable` =
 * strong-solve exactly in secs/mins; `hard` = too big to enumerate, weak-solve bounded
 * (search mode); `infeasible` = heuristic territory, a full tablebase would exceed the
 * Job memory cap. */
export type SolveVerdict = (typeof SOLVE_VERDICTS)[number];

/**
 * The instant, pre-commit feasibility read (ADR-0068 §2). Every number is cheap
 * (combinatorial estimate + a shallow legalMoves sample), computed WITHOUT starting
 * the heavy solve. This is the number that answers "toy vs chess" by computation.
 */
export interface FeasibilityReport {
  /** Reachable-state upper bound: piece-types × squares discounted for illegal/duplicate/
   * pawn-rank constraints, ×2 side-to-move, × promotion expansion (ADR-0068 §2). An
   * UPPER bound, not the exact reachable count. Number (not bigint) for JSON; may be
   * Infinity-ish large, so it is carried as an order-of-magnitude estimate. */
  stateSpaceUpperBound: number;
  /** legalMoves(...) count at the root position. */
  branchingRoot: number;
  /** Mean legal-move count over a shallow sample of reachable states. */
  branchingSampled: number;
  /** states × bytes-per-entry estimate for a full tablebase, compared against
   * bounds.maxMemoryBytes to pick the verdict (ADR-0068 §2, §5 "caps the tablebase
   * to the Job memory limit before it starts"). */
  tablebaseBytesEstimate: number;
  /** The recommended method (ADR-0068 §2). */
  verdict: SolveVerdict;
  /** Rough wall-clock estimate to a COMPLETE solve, in seconds; a lower-confidence
   * hint, not a promise (the run is anytime and bounded regardless). */
  etaSeconds: number;
  /** The mode the verdict implies, so the caller can prefill SolveSpec.mode. */
  recommendedMode: SolveMode;
  /** True when the board can trigger en passant (a pawn could be en-passant-captured):
   * the solver's decoded move graph would diverge from live rules (F6). When true the
   * verdict is forced to at best `hard` and a REFUSAL note is added — a retrograde strong
   * solve on such a board is UNSOUND. See §"En passant". */
  enPassantUnsound?: boolean;
  /** Human-readable caveats: which discounts were applied, why it fell to `hard`,
   * whether the tablebase estimate blew the memory cap, en-passant refusal, etc. */
  notes: string[];
}
```
Phase 1 MAY add optional fields (`boardCells`, `pieces`, `bytesPerEntry`, `reachableSampleEstimate`) additively; the fields above are the guaranteed cross-phase surface.

### Mode, bounds, spec (ADR §4/§5)

```ts
export const SOLVE_MODES = ['retrograde', 'search'] as const;
/** Which algorithm the solver runs (ADR-0068 §1): `retrograde` = strong solve / full
 * tablebase by backward induction (small boards); `search` = iterative-deepening
 * alpha-beta anytime weak-solve (too big to enumerate). */
export type SolveMode = (typeof SOLVE_MODES)[number];

/** Hard caps every run carries — never a runaway (ADR-0068 §4). The solver checks these
 * on a fixed cadence and exits cleanly with its partial result persisted. */
export interface SolveBounds {
  /** Wall-clock ceiling in ms. */
  wallClockMs: number;
  /** Node/state ceiling — states enumerated (retrograde) or nodes expanded (search). */
  maxStates: number;
  /** Memory ceiling in bytes for in-core tablebase/TT growth; feasibility refuses a
   * full tablebase above this and falls to search (ADR-0068 §5). Set comfortably UNDER
   * the container memory limit so the self-check trips before an OOM-kill. */
  maxMemoryBytes: number;
}

/** The complete, serializable job description POSTed to /api/solve-runs (ADR-0068 §5).
 * `level` is the whole authored document; the worker re-derives objective + victory rules
 * from it (level.victory ?? victoryRulesForObjective(...) — F1), exactly as the store does. */
export interface SolveSpec {
  level: Level;
  bounds: SolveBounds;
  mode: SolveMode;
  /** Determinism seed for any sampled/tie-broken step (rng.ts) and for createFromLevel.
   * Absent ⇒ a fixed default, so a spec replays identically. */
  seed?: number;
  /** Run the fast random-playout / shallow-MCTS "looks like a draw / looks winning" pass
   * first (ADR-0068 §1 "instant read"). Default true; the estimate is advisory, never a proof. */
  instantRead?: boolean;
}
```

> **Bounds field-name note:** the contract is `SolveBounds { wallClockMs; maxStates; maxMemoryBytes }` and is authoritative. The Phase-3/Phase-4 drafts used `{ wallClockSecs, maxNodes, maxMemoryBytes }` / `{ maxDepthPlies?, maxNodes?, wallClockMs?, ttEntryLimit? }`. Reconciliation: the **shared** wire/spec type is `SolveBounds` (ms + states + bytes). Phase 4's `WeakSolveBounds` (with `maxDepthPlies`, `ttEntryLimit`, `prover`) is a **search-mode-internal** superset derived from `SolveBounds` inside `runSolve`'s search branch; it is not on the wire. Phase 3's worker/UI construct `SolveBounds` in ms/states/bytes.

### Streamed progress (ADR §3/§5)

```ts
/** Counts of positions PROVEN to each terminal value so far — the partial tablebase's
 * census (ADR-0068 §3, §5). */
export interface ProvenCounts {
  win: number;
  loss: number;
  draw: number;
}

/** Tightening upper/lower bounds on the ROOT position's value (ADR-0068 §3). As the
 * anytime solve runs, the interval [lower, upper] narrows; when it collapses to a single
 * proven outcome the root is solved. */
export interface RootBounds {
  /** Best proven LOWER bound on the root outcome (worst case the side-to-move can force). */
  lower: Outcome;
  /** Best proven UPPER bound (best case not yet refuted). */
  upper: Outcome;
  /** Best DTM found for the currently-leading outcome, if any (plies). */
  bestDistancePlies?: number;
  /** True once lower === upper on a decided outcome ⇒ the root value is proven. */
  proven: boolean;
}

/** The streamed progress record (ADR-0068 §5, verbatim fields). Patched into the solve_runs
 * JSONB body on a cadence and re-read by the polling client (net/solveRuns.ts). Flat +
 * JSON-safe: no Maps/Sets/functions. The interactive stepper's Run tab renders this live; a
 * cluster run's stepper REPLAYS a recorded SolveStep trace, but the headline dashboard is this. */
export interface SolveProgress {
  /** The phase the solver is currently in (ADR §7 phase names). */
  phase: SolvePhaseName;
  /** Positions enumerated (retrograde) / nodes visited (search). */
  statesEnumerated: number;
  /** Positions given a proven value so far. */
  statesSolved: number;
  proven: ProvenCounts;
  rootBounds: RootBounds;
  /** Progress 0..100. RETROGRADE: statesSolved / feasibility-upper-bound ×100 (an estimate;
   * the denominator is the feasibility bound and may be loose). SEARCH: the feasibility bound
   * can be Infinity, so search-mode coverage is NOT states/total (that is degenerate 0). It is
   * a bounded-progress proxy — max(depth/maxDepthPlies, nodes/maxStates, bounds-collapse
   * fraction) ×100, clamped [0,100] — so the bar advances. Which proxy was used is noted in body. */
  coveragePct: number;
  /** Seconds of wall-clock elapsed in this run. */
  secs: number;
  /** Iterative-deepening depth reached (search mode); omitted in retrograde. */
  depth?: number;
  /** Backward-induction sweep number (retrograde Converge); omitted in search. */
  sweep?: number;
}
```

### Result, tablebase ref, piece values (ADR §1/§3/§5)

```ts
/** Pointer to a full tablebase written to blob storage when too big for the JSONB row
 * (ADR-0068 §5). Absent ⇒ the partial tablebase (if any) lives inline / was not persisted. */
export interface TablebaseRef {
  /** Blob URL of the serialized tablebase. */
  url: string;
  /** Entry count and on-disk byte size, for the Results tab summary. */
  entries: number;
  bytes: number;
  /** Serialization format tag, so a reader validates before parsing. */
  format: 'solver-tablebase-v1';
}

/** One piece TYPE's ablation result (ADR-0068 §1). Removing every piece of `type` from
 * the root and re-solving yields `ablatedValue`; the DIFFERENCE from the unablated root
 * value is the piece's honest, board-specific worth — in OUTCOME + win-distance terms,
 * measured against perfect play. */
export interface PieceValueEntry {
  type: PieceType;
  /** The side whose piece was ablated. */
  side: Side;
  /** Root value with this piece type present (the baseline; identical across entries). */
  baselineValue: Value;
  /** Root value after ablation. */
  ablatedValue: Value;
  /** Signed change in win-distance plies attributable to the piece (ablatedValue vs
   * baseline), when both share an outcome; undefined when ablation FLIPS the outcome. */
  distanceDeltaPlies?: number;
  /** True when removing the piece flips win↔loss/draw. */
  outcomeFlipped: boolean;
  /** The authored EvalWeights scalar for this type (ai.ts DEFAULT_EVAL_WEIGHTS), carried
   * for side-by-side comparison with the derived worth. Optional. */
  authoredScalar?: number;
}

/** Honest per-piece-type values for a SOLVED board (ADR-0068 §1). Only meaningful when the
 * root is strongly (or at least weakly) solved. */
export interface PieceValueReport {
  /** Root value the ablations are measured against. */
  rootValue: Value;
  entries: PieceValueEntry[];
  /** True when ablation was SKIPPED because the run's budget was exhausted before it could
   * re-solve every removable piece (ablation is post-solve best-effort — see Phase 1 §ablation). */
  partial?: boolean;
}

/** The terminal deliverable of a run (ADR-0068 §1/§3). At ANY stop (budget, memory, cancel)
 * this is well-formed: `complete` false + a partial tablebase + tightening rootBounds is the
 * anytime guarantee. */
export interface SolveResult {
  /** The proven value of the ROOT position. When the run did not finish, this carries the
   * best bound so far — outcome may be 'unknown'. */
  rootValue: Value;
  /** True iff the whole reachable space was solved to a fixpoint (strong solve) OR the root
   * was proven (weak solve); false for a bounded/partial stop. */
  complete: boolean;
  /** How many positions were proven — the partial tablebase size (ADR-0068 §3). */
  provenCount: number;
  proven: ProvenCounts;
  /** Final tightened bounds on the root (mirrors SolveProgress.rootBounds at stop). */
  rootBounds: RootBounds;
  /** Coverage at stop (see SolveProgress.coveragePct semantics). */
  coveragePct: number;
  /** Present iff a full tablebase was written to blob (ADR-0068 §5). */
  tablebaseRef?: TablebaseRef;
  /** Present once solved: ablation-derived piece values (ADR-0068 §1). May carry partial:true. */
  pieceValues?: PieceValueReport;
  /** Which mode actually ran. */
  mode: SolveMode;
}
```

### Phase names + stepper `SolveStep` unions (ADR §7)

```ts
export const RETROGRADE_PHASES = ['Enumerate', 'SeedTerminals', 'Propagate', 'Converge', 'ReadValue'] as const;
export type RetrogradePhaseName = (typeof RETROGRADE_PHASES)[number];

export const SEARCH_PHASES = ['Generate', 'Order', 'Descend', 'Quiesce', 'BackUp'] as const;
export type SearchPhaseName = (typeof SEARCH_PHASES)[number];

export type SolvePhaseName = RetrogradePhaseName | SearchPhaseName;

/** A serialized position key (a canonical, order-independent string over occupied squares +
 * side-to-move + any terminality-affecting field — see §"Position key contract"). Positions
 * travel as keys on the wire; a panel resolves a key back to a board only when it needs to
 * render one (the optional `state` fields below carry that board inline). */
export type PositionKey = string;

/** One newly-decided position during a Propagate sweep — the board-view frontier highlight. */
export interface DecidedPosition {
  key: PositionKey;
  value: Value;
  /** Inline board for rendering this frontier cell, when the emitter chose to attach it. */
  state?: GameState;
}

export type RetrogradeStep =
  | { kind: 'retrograde'; phase: 'Enumerate';
      enumerated: number;
      current?: { key: PositionKey; state?: GameState; branching: number }; }
  | { kind: 'retrograde'; phase: 'SeedTerminals';
      seeded: DecidedPosition[]; totalTerminals: number; }
  | { kind: 'retrograde'; phase: 'Propagate';
      sweep: number; newlyDecided: DecidedPosition[]; remainingUnknown: number; }
  | { kind: 'retrograde'; phase: 'Converge';
      sweep: number; decidedThisSweep: number; atFixpoint: boolean; proven: ProvenCounts; }
  | { kind: 'retrograde'; phase: 'ReadValue';
      rootValue: Value; pieceValues?: PieceValueReport; };

/** Alpha-beta window at a node, plies deep, for the panel's bounds readout (ai.ts negamax). */
export interface SearchWindow { alpha: number; beta: number; depth: number; ply: number; }

/** A move under consideration, with the MVV ordering key ai.ts uses (captureValue). */
export interface OrderedMove {
  pieceId: string;
  move: Move;
  /** captureValue(move) — victim piece value, -1 for a non-capture. */
  orderKey: number;
}

export type SearchStep =
  | { kind: 'search'; phase: 'Generate';
      window: SearchWindow; line: OrderedMove[]; generated: number; }
  | { kind: 'search'; phase: 'Order';
      window: SearchWindow; ordered: OrderedMove[]; ttHit?: { key: PositionKey; value: Value }; }
  | { kind: 'search'; phase: 'Descend';
      window: SearchWindow; into: OrderedMove; line: OrderedMove[]; }
  | { kind: 'search'; phase: 'Quiesce';
      window: SearchWindow; standPat: number; pending: OrderedMove[]; }
  | { kind: 'search'; phase: 'BackUp';
      window: SearchWindow; childValue: Value; cutoff: boolean; rootBounds?: RootBounds; };

/** The full step vocabulary the stepper consumes and the worker records (ADR §7). A cluster
 * run's stepper replays a persisted SolveStep[] trace so the watch experience is identical. */
export type SolveStep = RetrogradeStep | SearchStep;

export function isRetrogradeStep(s: SolveStep): s is RetrogradeStep { return s.kind === 'retrograde'; }
export function isSearchStep(s: SolveStep): s is SearchStep { return s.kind === 'search'; }
```

### Position key contract (soundness-critical)

`PositionKey` is a **canonical** string — two positions the solver may treat as game-theoretically equal MUST produce the same key, and two positions with different values MUST produce different keys. This binds Phase 1 (encoding), Phase 4 (TT + cycle detection key on it), and any tablebase serialization. The key MUST fold in **every field that affects legality, terminality, or successor generation**:

1. **Occupied squares + piece type per living piece + side-to-move** (the base).
2. **Same-type/same-side interchangeable pieces must be canonicalized** (sort occupied-square lists within each `(side,type)` class), so two identical pawns swapping squares yield ONE key. A slot-identity-indexed key is *order-dependent* and inflates the space AND breaks Phase 4's cycle detection (a repetition-by-piece-swap goes undetected). See Phase 1 §encode risk.
3. **`turnsElapsed`** whenever the objective makes terminality clock-dependent (`survive`/`turnLimit`/`reach-with-turnLimit`; objectives.ts thread `turnsElapsed` via `{ ...ctx, turnsElapsed }`). Two identical boards at different `turnsElapsed` can have DIFFERENT true values on such objectives — the key MUST distinguish them or the TB/TT conflates them (wrong proofs). For `capture-all`/`capture-king`/`rival-kings` the clock is inert and the key omits it (documented in `FeasibilityReport.notes`).
4. **`lastMove` / en-passant state is deliberately OUT of the key** — but see §"En passant": boards where that matters are REFUSED (verdict downgraded + `enPassantUnsound`), not silently solved.

### Contract determinism + serialization invariants

- **JSON-safe on the wire:** positions are `PositionKey = string` (not `Set`), counts are `ProvenCounts { win; loss; draw }` (not `Map`), the state-space bound is `number` (not `bigint`). `bigint` position keys used *inside* the Phase-1 encoder never appear in any type here — they are stringified at the boundary.
- **`stateSpaceUpperBound` is an order-of-magnitude estimate** (may be `Infinity`), not a live counter; the exact counter `SolveProgress.statesEnumerated` stays within safe-integer range because it is bounded by `SolveBounds.maxStates`.
- **One meaning for `distancePlies`:** plies-to-settling-capture-under-perfect-play, `0` at terminal. Retrograde produces exact DTM; the search solver translates its `WIN_SCORE - ply` score offset into that integer at the boundary. `draw`/`unknown` carry NO `distancePlies`.
- **Phase-name / step-union sync:** the `const` arrays `RETROGRADE_PHASES`/`SEARCH_PHASES` are the single source both the PhaseBar and the discriminated unions derive from; the contract test's `assertNever` exhaustiveness check turns any drift into a compile error.

### Trainer engine bundle re-export (integration seam)

Append to `frontend/src/trainer/engine.ts` so the worker bundle sees the solver vocabulary (only the `const` arrays/helpers are runtime; everything else is `export type`, so nothing pulls DOM into the SSR bundle):
```ts
export type {
  Value, Outcome, FeasibilityReport, SolveVerdict, SolveMode, SolveBounds, SolveSpec,
  SolveProgress, ProvenCounts, RootBounds, SolveResult, PieceValueReport, PieceValueEntry,
  TablebaseRef, SolveStep, RetrogradeStep, SearchStep, SolvePhaseName,
} from '../core/solver/types';
export { RETROGRADE_PHASES, SEARCH_PHASES, SOLVE_VERDICTS, SOLVE_MODES, flipOutcome, isRetrogradeStep, isSearchStep } from '../core/solver/types';
```

### Contract deliverables

- **File to create:** `frontend/src/core/solver/types.ts` + co-located `frontend/src/core/solver/types.test.ts` (Vitest).
- **File to touch:** `frontend/src/trainer/engine.ts` (append the re-export block above; Phase 3 appends the value re-exports to the SAME block).
- Contract test invariants: (1) JSON round-trip of a fully-populated `SolveProgress`/`SolveResult`/each `SolveStep` variant (the wire guard against `Map`/`Set`/`bigint`/function); (2) `switch (step.phase)` exhaustiveness with `assertNever` over each union; (3) `isRetrogradeStep`/`isSearchStep` partition a mixed `SolveStep[]` and `RETROGRADE_PHASES`/`SEARCH_PHASES` are disjoint; (4) `flipOutcome` is an involution (win↔loss, draw/unknown fixed, distance/winner preserved); (5) `draw`/`unknown` values carry no `distancePlies`.

---

## Phase 1 — Pure engine (feasibility + retrograde strong-solver + ablation)

Ship a pure, deterministic, DOM-free `frontend/src/core/solver/` that: (1) `estimateFeasibility(level): FeasibilityReport`; (2) a **retrograde/backward-induction strong solver** producing the perfect value of every reachable position of a small board, correctly handling this **loopy, no-repetition** game (F8) via **win-distance labels**; (3) root-value read + **piece values by ablation**; (4) Vitest unit tests on tiny hand-checkable boards (K vs K → draw; K+Q vs K → forced win; K+P vs K).

It plays by *exactly* the live rules — every move, terminal, promotion, and check-legality decision routes through the existing pure engine. **Terminal/victory detection routes through the SAME victory oracle the store uses (F1), not `evaluateObjective`.** It never re-implements movement or terminality. Out of scope: stepper (Phase 2), cluster/API (Phase 3), search-mode αβ (Phase 4).

### Victory-rule terminal oracle (F1 — correctness-critical)

The solver's terminal check MUST reproduce the store's exact decision. Implement a small helper `terminalOutcome(state, input): Winner` in `input.ts`/`retrograde.ts` that mirrors store.ts:466/533/619:

```ts
// input.ts carries the resolved rule set + ctx once (they are static per level):
input.victoryRules = level.victory ?? victoryRulesForObjective(level.objective, input.ctx);
// per position (input.ctx augmented with per-position turnsElapsed where it matters):
const { winner } = resolveVictory(state, input.victoryRules, { ...input.ctx, turnsElapsed });
```

The full terminal decision is the store/AI/self-play **triple**: (a) `applyMove`'s last-side-standing `winner` (piece-count only — does NOT flag a king capture), (b) `resolveVictory(state, victoryRules, ctx)` (this is what decides king-capture / objective wins, using `level.victory` when present), and (c) the stuck-side rule (no legal move ⇒ checkmate/loss if `sideInCheck` else stalemate/draw). Using `evaluateObjective` instead of `resolveVictory(...,victoryRules,...)` is the F1 bug and is forbidden.

### Files

New files under `frontend/src/core/solver/`:

- **`index.ts`** — barrel re-export (the public surface Phase 2/3/4 import). **Must export all three ADR §6 entrypoints** including `solveStepWithPhases` (the draft omitted it — F7/ruling 5):
  ```ts
  export type * from './types';
  export { flipOutcome, isRetrogradeStep, isSearchStep, RETROGRADE_PHASES, SEARCH_PHASES, SOLVE_VERDICTS, SOLVE_MODES } from './types';
  export { estimateFeasibility } from './feasibility';
  export { enumerateReachable, encodePosition, decodePosition, canonicalKey } from './encode';
  export type { SolverPosition, PieceSlot, PositionSpace } from './encode';
  export { retrogradeSolve, runSolve, solveStepWithPhases } from './retrograde';
  export { pieceValuesByAblation } from './ablation';
  export type { AblationResult } from './ablation';
  export { toSolverInput } from './input';
  export type { SolverInput } from './input';
  ```
  Note: `Value`, `FeasibilityReport`, `SolveResult`, etc. all come from `./types` (the contract), NOT redeclared. `solveStepWithPhases` is the named §7 stepper entrypoint; if the first cut implements it as a coroutine over `runSolve`'s `onProgress`, the named export still exists.

- **`input.ts`** — bridge from an authored `Level` to the solver's working state, reusing `createFromLevel` so the start is byte-identical to self-play/the store. **`ctx` is built the selfplay.ts:80 way (F2): spread `objectiveContextForLevel` then add `kingSide`; `turnsElapsed` is threaded per-position, not stored here.** Also resolves and caches the victory rule set (F1).
  ```ts
  import type { Level } from '../level';
  import type { GameState, Vec, Winner } from '../types';
  import type { MoveEnv } from '../rules';
  import type { ObjectiveContext, VictoryRules } from '../objectives';
  import type { PieceSlot } from './encode';

  export interface SolverInput {
    level: Level;
    start: GameState;          // createFromLevel(level, seed) — canonical start
    env: MoveEnv;              // gameEnv(start): static terrain + fences, reused per ply (NO lastMove)
    ctx: ObjectiveContext;     // { ...objectiveContextForLevel(level), kingSide: kingSideOf(start.pieces) }
    victoryRules: VictoryRules; // level.victory ?? victoryRulesForObjective(level.objective, ctx) — F1
    clockMatters: boolean;     // objective ∈ {survive, reach-with-turnLimit, ...} ⇒ turnsElapsed in key
    slots: PieceSlot[];        // stable per-piece descriptor list, index = bit lane
    passableCells: Vec[];      // squares a piece may legally occupy (terrain-pruned)
  }
  export function toSolverInput(level: Level, seed?: number): SolverInput;
  ```

- **`encode.ts`** — the position ENCODING/enumeration scheme (the crux). See §"Position key contract" for the canonicalization requirement.
  ```ts
  import type { GameState, Piece, PieceType, Side, Vec } from '../types';
  import type { SolverInput } from './input';
  import type { PositionKey } from './types';   // = string on the wire; bigint internally

  export interface PieceSlot {
    index: number;            // 0..N-1, this piece's lane in the packed key
    id: string;               // the createFromLevel id, for decode → GameState
    side: Side;               // fixed
    origType: PieceType;      // type at start; only 'pawn' can change (→ 'queen')
    canPromote: boolean;      // origType === 'pawn'
    isRoyal: boolean;         // origType === 'king'
    pawnForward?: Piece['pawnForward'];
    startX: number; startY: number;
  }

  export interface SolverPosition {
    cell: Int16Array;         // per slot: passable-cell index, or -1 if dead
    promoted: Uint8Array;     // per slot: 1 if a promotable pawn is currently a queen
    turn: Side;               // 'player' | 'enemy'
    turnsElapsed: number;     // folded into the key only when input.clockMatters (§position key contract)
  }

  /** Internal packed key is a mixed-radix bigint; PositionKey (the contract wire type) is
   * its stringification. encode/decode use bigint; anything exported cross-phase is the string. */
  export interface PositionSpace {
    input: SolverInput;
    index: Map<bigint, number>;   // key → dense ordinal (0..M-1)
    keys: bigint[];               // ordinal → key (for decode + iteration)
    truncated: boolean;           // hit the enumeration cap
  }

  export function encodePosition(pos: SolverPosition, input: SolverInput): bigint;
  export function decodePosition(key: bigint, input: SolverInput): GameState;   // → real GameState
  export function canonicalKey(state: GameState, input: SolverInput): bigint;    // GameState → key
  export function enumerateReachable(input: SolverInput, cap: number): PositionSpace;
  ```
  > **Wire-vs-internal key + canonicalization reconciliation:** the contract's `PositionKey = string`. The encoder is fastest with a `bigint` mixed-radix key. Ruling: use `bigint` **internally**; stringify to `PositionKey` (`key.toString()`) only at a phase boundary. The retrograde hot loop operates on **dense `number` ordinals** (`PositionSpace.index`), touching `bigint` only at encode/decode. **Canonicalization (soundness): `canonicalKey` MUST sort occupied cells within each `(side, effective-type)` class before packing**, so interchangeable same-type pieces produce one key (§position key contract). Slot-index-identity keying is the draft's bug — it is order-dependent, inflates the space, and defeats Phase-4 cycle detection. If a target board provably has no two interchangeable same-type same-side pieces, identity keying is a permitted fast path recorded in `notes`; otherwise class-sorted canonicalization is mandatory.

- **`feasibility.ts`** — the instant pre-solve read.
  ```ts
  import type { Level } from '../level';
  import type { FeasibilityReport } from './types';   // contract shape (authoritative)
  export function estimateFeasibility(level: Level, opts?: { memoryCapBytes?: number; sampleWalks?: number }): FeasibilityReport;
  ```
  Returns the **contract `FeasibilityReport`**. MUST set `enPassantUnsound:true` and downgrade the verdict to at best `hard` when the board can trigger en passant (F6 — see §"En passant").

- **`retrograde.ts`** — the strong solver **and** the shared `runSolve` orchestrator **and** the `solveStepWithPhases` stepper entrypoint (F7/ruling 5).
  ```ts
  import type { PositionSpace } from './encode';
  import type { SolverInput } from './input';
  import type { Level } from '../level';
  import type { Value, SolveBounds, SolveResult, SolveProgress, SolveStep } from './types';

  export interface SolveResultInternal {
    space: PositionSpace;
    labels: Int32Array;       // packed label per ordinal (2 bits outcome + distance)
    rootValue: Value;         // contract Value (converted from internal label)
    stats: { states: number; terminals: number; sweeps: number; solvedWin: number; solvedLoss: number; drawn: number };
  }

  export function retrogradeSolve(
    space: PositionSpace,
    input: SolverInput,
    onSweep?: (sweep: number, newlySolved: number) => void,  // Phase-2 stepper hook
  ): SolveResultInternal;

  /** The bounded, anytime orchestrator the ADR §6 names. Dispatches on mode (retrograde here;
   * search branch registered by Phase 4), threads bounds + onProgress, stitches feasibility →
   * enumerate → retrograde → ablation into one bounded run, returns the contract SolveResult
   * (well-formed even on a bounded/partial stop). */
  export function runSolve(level: Level, bounds: SolveBounds, onProgress?: (p: SolveProgress) => void): SolveResult;

  /** The phase-decomposed stepper entrypoint the ADR §7 names (F7). Yields/emits SolveStep
   * records the browser stepper (Phase 2) drives and the cluster worker records for replay.
   * First cut MAY be a generator/coroutine over runSolve's progression; the named export is
   * the contract. */
  export function solveStepWithPhases(level: Level, bounds: SolveBounds): Iterator<SolveStep> | AsyncIterator<SolveStep>;
  ```
  > **`runSolve`/`solveStepWithPhases` ownership reconciliation:** **Phase 1 owns and ships `runSolve` AND `solveStepWithPhases` in `retrograde.ts`.** Phase 4 adds the `mode:'search'` branch inside `runSolve` by delegating to `runWeakSolve`. One dispatcher, one stepper entrypoint. The internal `SolveResultInternal` (typed-array labels + `PositionSpace`) is engine-internal; the public `SolveResult` (contract) is what `runSolve` returns.

- **`ablation.ts`** — piece values by ablation against ground truth. **Ablation is post-solve best-effort and budget-aware (see Risks): it re-solves once per removable non-king slot (N× the base solve), which can dominate wall-clock. It runs only within remaining budget and sets `PieceValueReport.partial:true` if it runs out. Each ablated board is rebuilt from the `Level` and re-run through `toSolverInput`/`enumerateReachable` (a FRESH slot map), never by poking the existing `SolverInput` (which would desync slot indices).**
  ```ts
  import type { Level } from '../level';
  import type { Value, PieceType, SolveBounds } from './types';   // Value from contract
  export interface AblationResult {
    baseline: Value;
    partial: boolean;
    perPiece: Array<{
      slotIndex: number; side: 'player' | 'enemy'; type: PieceType;
      removedValue: Value;                   // root value with this piece removed at start
      deltaOutcome: 'flip' | 'same';
      deltaDistance?: number;                // change in distance-to-mate (plies) when still decided
    }>;
  }
  export function pieceValuesByAblation(level: Level, remainingBudget: SolveBounds, seed?: number): AblationResult;
  ```
  `pieceValuesByAblation` maps to the contract `PieceValueReport`/`PieceValueEntry` when surfaced through `SolveResult.pieceValues`.

- **`solver.test.ts`** (splittable into `retrograde.test.ts`/`feasibility.test.ts`/`encode.test.ts`).

Existing files consumed (read-only, no edits): `core/rules.ts` (`legalMoves`, `applyMove`, `gameEnv`, `livingPieces`, `sideInCheck`, `MoveEnv`), `core/objectives.ts` (`resolveVictory`, `victoryRulesForObjective`, `objectiveContextForLevel`, `kingSideOf`, `ObjectiveContext`, `VictoryRules`), `game/setup.ts` (`createFromLevel`), `core/types.ts`, `core/level.ts`, `core/terrain.ts` (`isPassableTerrain`, `buildTerrainIndex`), `core/rng.ts` (`createRng`), `game/__fixtures__/breakLine.ts` (`breakLineLevel`).

### Ordered tasks

1. **`input.ts` — materialize the fixed frame.** `toSolverInput(level, seed=0)`: `start = createFromLevel(level, seed)`; `env = gameEnv(start)` (no `lastMove`); `ctx = { ...objectiveContextForLevel(level), kingSide: kingSideOf(start.pieces) }` (F2 — the spread is mandatory, `objectiveContextForLevel` alone omits `kingSide`); `victoryRules = level.victory ?? victoryRulesForObjective(level.objective, ctx)` (F1); `clockMatters = objective needs turnsElapsed` (survive / reach-with-turnLimit / anything whose `conditionHolds` reads `turnsElapsed`). Build one `PieceSlot` per **non-neutral, non-obstacle** piece (`side === 'player'|'enemy'`, `type !== 'rock' && !== 'random-rock'`), `index` in stable deterministic order (sort by `id`). Neutral rocks are terrain, folded into `passableCells` exclusion. `passableCells`: every in-bounds cell with passable terrain (`isPassableTerrain`; water passable) not permanently occupied by a rock/obstacle, row-major.

2. **`encode.ts` — encoding, enumeration, decode.** The piece set is fixed (the board only ever loses pieces or promotes a pawn — no piece is ever added). A position = per slot (dead) OR (square-index + promoted flag), plus one side-to-move bit, plus `turnsElapsed` **only when `input.clockMatters`** (§position key contract, clause 3). Mixed-radix bigint key; **occupied cells sorted within each `(side, effective-type)` class before packing** (clause 2, canonicalization). No-overlap enforced by enumeration (only `applyMove`-produced positions materialized). `decodePosition` rebuilds `pieces` from start pieces (alive, x/y from cell, type=`origType` or `'queen'` if promoted, carry `pawnForward`/`startX`/`startY`/`facing`), reattaches invariant rocks, sets `size`/`terrain`/`fences`/`turn`/`winner:null`, and **NO `lastMove`** (F6 — en-passant successors will therefore be missing; boards where that matters are refused upstream by feasibility). `enumerateReachable(input, cap)`: forward closure from `canonicalKey(start)`; pop → decode → if terminal record no successors, else for side-to-move × `livingPieces` × `legalMoves` → `applyMove` → `canonicalKey` → assign next ordinal if unseen; increment `turnsElapsed` on the child when `clockMatters`. Bound with `cap`; mark `truncated` on overflow.

3. **`retrograde.ts` — backward induction.** **Terminal test uses the §"Victory-rule terminal oracle" triple** — `applyMove` `winner` (piece-count) + `resolveVictory(state, input.victoryRules, {...ctx, turnsElapsed})` (F1, decides king-capture/objective) + the stuck-side `sideInCheck` rule. **Seed** every terminal `distance=0`, outcome from `Winner` relative to side-to-move. **Backward pass — ITERATE TO FIXPOINT (explicit loop, not one sweep):** repeat sweeps until a full sweep decides zero new positions. In a sweep, a still-undecided non-terminal with side S becomes: a **WIN in `d+1`** if *some* successor is proven loss-for-opponent (child distance `d` = the minimal such), a **LOSS in `d+1`** if *every* successor is **already proven** win-for-opponent (parent distance = max child distance + 1). **Invariant (prevents premature draw-collapse): a node with ANY still-undecided successor stays undecided this sweep — LOSS requires all successors decided-and-winning; never label LOSS/DRAW while a successor is unknown.** `onSweep(sweep, newlySolved)` reports the frontier (Phase-2 hook). **Only after the fixpoint** run the **undecided→draw pass** (loopy-game resolution, F8): every position still undecided is a DRAW (no `distancePlies`). Bound the sweep count (≤ state count) as a runaway guard. Label packing: `Int32Array` per ordinal (2 bits outcome `0 unknown/1 win/2 loss/3 draw` + distance). Root read: ordinal 0 (side-to-move = player). Convert internal label → contract `Value`. First cut is iterate-to-fixpoint (recompute successors per sweep); note the predecessor-counter optimization as the Phase-3 scaling path.

4. **`runSolve` + `solveStepWithPhases` orchestrators** (in `retrograde.ts`): `runSolve` = feasibility → (if `verdict==='solvable'` and under cap) `enumerateReachable` → `retrogradeSolve` → `pieceValuesByAblation` (within remaining budget) → assemble contract `SolveResult`; thread `bounds` (check on a cadence, exit cleanly with partial on cap) and `onProgress`; `mode:'search'` delegates to Phase 4's `runWeakSolve` (registered when Phase 4 lands; stub throws `not-implemented` until then). `solveStepWithPhases` = the §7 named stepper entrypoint emitting `RetrogradeStep`s (first cut may generate over the same progression).

5. **`feasibility.ts`.** Compute `passableCells` + slot counts via `toSolverInput` (cheap, no enumeration). **State-space upper bound:** loose ceiling = encoder radix product `2 · Π_i r_i` (× a `turnsElapsed` factor when `clockMatters`); report the no-overlap-corrected figure (falling factorials over alive subsets), keep the loose one in `notes`. **Branching:** `branchingRoot = Σ legalMoves` at start; `branchingSampled` = mean over a seeded random walk (`createRng`, `opts.sampleWalks` default ~200), deterministic. **Memory:** `tablebaseBytesEstimate = stateSpaceUpperBound · bytesPerEntry` (bytesPerEntry default 4), compared to `opts.memoryCapBytes` (default ~3 GiB in Phase 1; wired to the Job limit in Phase 3). **En passant (F6):** detect whether any pawn could be en-passant-captured (two opposing pawns on adjacent files that can reach the double-step geometry); if so set `enPassantUnsound:true`, force `verdict` to at best `hard`, add a REFUSAL note. **Verdict:** `'solvable'` when bound+memory fit a small threshold AND not `enPassantUnsound`; `'hard'` when finite-but-large or en-passant-unsound; `'infeasible'` when the ceiling dwarfs any cap. **The Break the Line number is produced here.**

6. **`ablation.ts`.** `baseline = runSolve(level).rootValue`. For each removable non-king slot: build a **modified `Level`** with that unit deleted, run it through `toSolverInput` + `enumerateReachable` + `retrogradeSolve` afresh (fresh slot map — never mutate the base `SolverInput`), record `deltaOutcome`/`deltaDistance`. Budget-aware: stop and set `partial:true` if remaining budget is exhausted.

7. **Tests** (below).

### Tests

Vitest, mirroring `core/ai.test.ts`/`core/objectives.test.ts` idioms. Helper `tinyLevel(units, {cols, rows, objective})` from `createBlankLevel` overwriting `layers.units`/`objective`/`board`.

- **K vs K → draw** (4×4, `rival-kings`): `runSolve(...).rootValue.outcome === 'draw'`; enumeration terminates; `stats.drawn === stats.states`. The load-bearing loopy test (kings can never be adjacent — king-safety filter).
- **K+Q vs K → forced win, small mate distance** (4×4/5×5, `rival-kings`, mate-in-1–3): `rootValue.outcome === 'win'`, `rootValue.winner === 'player'`, `rootValue.distancePlies` = the hand-computed ply count.
- **K+P vs K**: a queening/winning variant (exercises the promotion radix + `promoted` flag round-trip) and a blockade-draw variant.
- **Victory-override terminal test (F1):** a tiny level with a non-preset `level.victory` rule (e.g. eliminate a specific piece) — assert the solver's terminal decision matches `resolveVictory(state, level.victory, ctx)`, and that swapping to `evaluateObjective` would give a different (wrong) answer. Guards the F1 fix.
- **kingSide terminal test (F2):** a `capture-king` board where omitting `kingSide` mis-decides — assert `ctx.kingSide` is populated and the king-capture is terminal for the right side.
- **Encoding round-trips**: `decodePosition(encodePosition(pos))` reproduces the canonical key across alive/dead/promoted/both-turns permutations; **same-type canonicalization**: two identical same-side pawns swapped produce the SAME key (guards §position key contract clause 2); promotion round-trip.
- **Clock-in-key test (if a survive/turnLimit fixture is cheap):** two identical boards at different `turnsElapsed` on a `survive` objective get DIFFERENT keys and can get different values (guards clause 3); on `rival-kings` the same two boards get the SAME key (clock inert).
- **Fixpoint / no-premature-draw test:** a mate-in-3 board — assert the win is found at the correct sweep and no position is drawn before the fixpoint (guards the §3 invariant).
- **En-passant refusal (F6):** a board with two opposing pawns positioned for en passant → `estimateFeasibility(...).enPassantUnsound === true` and `verdict !== 'solvable'`.
- **Feasibility**: on the three tiny boards `stateSpaceUpperBound ≥ actual stats.states` and `verdict === 'solvable'`; `estimateFeasibility(breakLineLevel)` returns a finite bound, `branchingRoot` = actual legal-move count at BtL start, a `verdict`, and internal consistency — magnitude reported, not asserted.
- **Ablation**: on K+Q vs K the queen's removal reports `deltaOutcome: 'flip'` (win→draw); on K+P vs K winning variant removing the pawn flips win→draw.
- **Determinism**: two `retrogradeSolve`/`runSolve` runs on the same level produce byte-identical labels + root value.

### Integration (produced / consumed)

- **Produced** (the surface Phases 2–4 consume): `estimateFeasibility`, `enumerateReachable`, `retrogradeSolve(space, input, onSweep?)`, `runSolve(level, bounds, onProgress) → SolveResult`, `solveStepWithPhases(...)` (F7); `encodePosition`/`decodePosition`/`canonicalKey`/`PositionSpace`; `pieceValuesByAblation`. The `onSweep(sweep, newlySolved)` frontier hook is the Phase-2/3 seam.
- **Consumed**: `createFromLevel`; `gameEnv`/`legalMoves`/`applyMove`/`livingPieces`/`sideInCheck` (rules.ts); `resolveVictory`/`victoryRulesForObjective`/`objectiveContextForLevel`/`kingSideOf` (objectives.ts — F1/F2); `isPassableTerrain` (terrain.ts); `createRng` (rng.ts); the **contract types** from `./types`.
- **Bundle boundary**: `core/solver/*` stays strictly DOM/React/pixi-free (only imports `core/*` + `game/setup.ts`, both in the pure graph) so Phase 3's re-export in `trainer/engine.ts` is a graph-clean change.

### Risks / de-risking

1. **State-space blowup / OOM.** Feasibility gate runs first and refuses/truncates past `cap`/`memoryCapBytes`; `enumerateReachable` takes a hard `cap` and marks `truncated`; Phase-1 tests use ≤5×5 ≤4-piece boards.
2. **Terminal-detection divergence (F1 — the highest-severity draft bug).** `evaluateObjective` ignores `level.victory`; the solver MUST use `resolveVictory(state, level.victory ?? victoryRulesForObjective(...), ctx)`. `applyMove` alone does NOT flag king capture (piece-count only). The oracle triple + the F1/F2 tests guard it.
3. **Loopy non-termination in enumeration.** Only unseen ordinals are enqueued — the node set is finite even though play is infinite. K vs K is the canary.
4. **Premature draw-collapse / mislabeling a cyclic draw.** LOSS requires **every** successor already proven win-for-opponent; a node with any undecided successor stays undecided; the undecided→draw pass runs ONLY after fixpoint. Explicit fixpoint loop + the no-premature-draw test guard it.
5. **`lastMove`/en passant not in the key (F6).** Boards where en passant can fire are REFUSED by feasibility (`enPassantUnsound`), not silently solved against a divergent move graph. Recorded in `notes`; full en-passant support is a Phase-4/extension item.
6. **Same-type piece canonicalization (soundness).** The key sorts occupied cells within each `(side,type)` class; identity keying is a fast path only when provably no interchangeable pieces exist. The same-type round-trip test guards it.
7. **bigint key perf.** bigint only for the canonical key (map lookups); sweeps operate on dense `number` ordinals + typed arrays.
8. **Ablation cost.** N× the base solve; runs post-solve within remaining budget, sets `partial:true` when out of budget; each ablated board rebuilt from the `Level` (fresh slot map).
9. **Determinism regressions.** Slots sorted by stable id, `passableCells` row-major, `legalMoves` deterministic, zero RNG in enumeration/retrograde (RNG only in feasibility's sampled branching, seeded). Determinism test gates it.
10. **`random-rock` in a target board (F9).** Not present in the three test boards or BtL. If a NEW target uses it, confirm `createFromLevel(level, seed)` resolves rocks deterministically for a fixed seed and fold the resolved rock cells into the fixed frame explicitly. Do not assume rocks are static without checking.
11. **Worktree tooling.** `frontend/node_modules` may be partial — `npm install` in the worktree or typecheck via the main checkout's `tsc` (per CLAUDE.md); no backend needed for these pure tests.

---

## Phase 2 — Interactive stepper (in-browser, phase-decomposed, replayable)

Build the ADR §7 learning surface: an in-browser, phase-decomposed, deterministically-replayable stepper to watch the retrograde solve *think*, one named phase at a time, on a small board. It reproduces the owner's established `bender-world`/`eight-queens` idiom: a pure runner exposing `runStepWithPhases()`, a lookahead **buffer**, a rAF **animation-clock**, a driving **hook** (refs for high-frequency state, React state on boundaries, snapshot undo/redo), a **PhaseBar**, **per-phase panels**, a **HelpBar/glossary**, Play/Pause/Step/Step-N/Back/speed **Controls**, and deterministic replay. Retrograde phases: **Enumerate → SeedTerminals → Propagate → Converge → ReadValue**; each `Propagate` sweep highlights the frontier of newly-solved positions.

**The load-bearing reconciliation:** this is DEV tooling, so — exactly like Game Lab (`ui/GameLab.tsx`) and the Training Gym (`ui/Gym.tsx`) — it lives **inside the one Studio** as a `catalogCategories` entry + a `ViewerKind`, reached by clicking its catalog card → "Open Solver" (ADR-0058). It is **NOT** bender's standalone app shell and does **NOT** import bender's `colors.ts` (chess-tactics has none). Styling is a scoped inline CSS string like `GYM_CSS`/`GL_CSS`. Out of scope: the `core/solver/*` engine (Phase 1), the cluster Run tab (Phase 3), Search-mode phases (Phase 4).

### Files

New — stepper engine adapter under `frontend/src/lab/solver/` (browser-only machinery, beside `lab/gymStep.ts`; NOT the pure `core/solver/` engine):

- **`solverRunner.ts`** — the stepper's stateful orchestrator wrapping the pure engine (mirrors bender's `algorithm-runner.ts`).
  - `class SolverRunner`:
    - `constructor(config: SolverStepConfig)` where `SolverStepConfig = { level: Level; bounds: SolveBounds; seed: number }`.
    - `runStepWithPhases(): { stepResult: SolverStepResult; phases: SolverPhaseData } | null` — one call advances one **micro-step** (within `Propagate` a micro-step is one backward-induction sweep; `Enumerate`/`SeedTerminals`/`Converge`/`ReadValue` are single micro-steps); returns `null` at convergence. Drives the engine's `solveStepWithPhases` (F7 — a real named export) / a coroutine over `runSolve`'s `onProgress`.
    - `runCoarseStep(): SolverStepResult | null` — one phase without full detail, for fast playback.
    - `getCurrentState(): SolverViewState` — `{ level, frontierPositions, solvedCounts, rootBounds, phase }` board-frame snapshot.
    - `getSnapshot(): SolverSnapshot` / `restoreSnapshot(s): void` — lightweight deterministic snapshot for undo/redo.
    - `reset(config?): void`; getters `phase`, `sweepIndex`, `solved`, `seed`.

- **`phaseData.ts`** — per-phase view-model structures (mirrors bender's `phase-data.ts`).
  - `enum SolverPhase { Enumerate=0, SeedTerminals=1, Propagate=2, Converge=3, ReadValue=4 }`, `const PHASE_COUNT = 5`, `const PHASE_LABELS = ['Enumerate','Seed terminals','Propagate','Converge','Read value'] as const`.
  - `interface EnumeratePhaseData { statesEnumerated: number; branchingSampled: number; upperBound: number; sampleBoards: SolverBoardSnapshot[] }`
  - `interface SeedTerminalsPhaseData { terminalCount: number; terminals: TerminalLabel[] }`, `TerminalLabel = { positionKey: string; winner: Side; distance: 0 }`
  - `interface PropagatePhaseData { sweepIndex: number; flippedThisSweep: number; frontier: FrontierEntry[]; newlyWon: number; newlyLost: number; rule: 'some-move-wins'|'all-moves-lose' }`, `FrontierEntry = { positionKey: string; result: 'win'|'loss'; distancePlies: number }`
  - `interface ConvergePhaseData { totalSweeps: number; reachedFixpoint: boolean; undecidedRemaining: number }`
  - `interface ReadValuePhaseData { rootResult: 'win'|'loss'|'draw'; rootDistancePlies: number | null; pieceValues: PieceAblation[] }`, `PieceAblation = { pieceId: string; type: PieceType; deltaPlies: number | null; changedResult: boolean }`
  - `interface SolverPhaseData { enumerate?: …; seedTerminals?: …; propagate?: …; converge?: …; readValue?: … }` — a **partial record keyed by phase** (retrograde phases are heterogeneous/non-simultaneous, unlike bender's five-per-step; documented divergence).
  - These view-models **adapt** the contract `SolveStep`/`RetrogradeStep` trace into panel-ready form, mapping 1:1 from the contract union rather than redefining semantics.

- **`solverBuffer.ts`** — rolling lookahead buffer, background producer via `setTimeout(0)` (mirrors bender's `episode-buffer.ts`). `interface WalkthroughPhaseStep { step: SolverStepResult; viewSnapshot: SolverViewState; phases: SolverPhaseData }`. `class SolverBuffer` with `constructor(config, maxSize=18)`, `startProducing`/`stopProducing`, `setBatchSize`, `available`/`ended`, `peek(offset)`, `consume()`, `prefill(entries)`, `computeImmediate(count)`, `computeOne()`, `getSnapshot`/`restoreSnapshot`, `getRunnerState()`, `reset(config)`, `trimConsumedTo(len)`, `clearBuffer()`, `onBufferReady`. `captureSteps` flag (full `WalkthroughPhaseStep[]` vs coarse `runCoarseStep()`). Buffer unit = one phase micro-step (episodes→phase-steps, documented). **The buffer is `prefill`-able so Phase 3 can swap it for a persisted-trace replay source.**

- **`animationClock.ts`** — rAF fractional playhead, **reused verbatim** from bender's `animation-clock.ts` (domain-agnostic): `start`/`stop`/`setSpeed`/`setPlayhead`/`stopAtNextBoundary`/`startSweep`/`finishSweepImmediate`/`reset`, `onBoundary`/`onTick`/`onSweepComplete`, `maxPlayhead`, `playhead`, `running`.

New — driving hook:
- **`useSolverStepper.ts`** — binds buffer+clock+undo/redo (mirrors bender's `use-buffered-algorithm.ts`). Refs: `bufferRef`, `clockRef`, `undoStackRef: HistorySnapshot[]`, `redoStackRef: WalkthroughPhaseStep[]`, `chartPlayheadRef`, `allStepsRef`. React state (boundary-only): `running`, `speed`, `phase`, `sweepIndex`, `solvedCounts` (`{win,loss,draw,undecided}`), `rootBounds`, `viewState`, `phaseTrace`, `solved`, `canGoBack`, `lastStepHistory`. Actions: `start(config)`, `resume()`, `pause()`, `step()`, `stepN(count)`, `goBack()`, `reset()`, `setSpeed(uiSpeed)`, `setClockSpeed(uiSpeed)`, `setCaptureSteps(enabled)`. `interface HistorySnapshot { solverSnapshot: SolverSnapshot; stepsLength: number }`, `const MAX_UNDO = 50`.

New — UI under `frontend/src/ui/`:
- **`Solver.tsx`** — the Studio catalog + viewer, structured exactly like `GameLab.tsx`/`Gym.tsx`.
  - `export function SolverCatalog({ search, selected, onSelect })` — copy of `GameLabCatalog` (levels grid, `LevelThumbnail`, `useCampaigns`/`ensureCampaignsHydrated`, `MODE_NAME`).
  - `export function SolverViewer({ levelId, header })` — the bench. Tab state `tab: 'feasibility' | 'step' | 'run' | 'results' | 'glossary'` (segmented control like Gym's `.gym-modebar`; ADR §7 tabs). **Feasibility tab**: `estimateFeasibility(level)` → renders `FeasibilityReport` (state-space upper bound, branching, est. memory, verdict + ETA, en-passant refusal note if any) + bounds config + **Play**. **Step tab** (the star): `<PhaseBar>`, `<SolverControls>`, the current-phase panel, and the **board** (`ViewPane kind="board"` + `StudioReadOnlyBoard`) with the `Propagate` frontier highlighted. **Run tab**: mounts Phase 3's `<SolveRuns level={level} />` (Phase 3 provides the component; this tab is the mount point). **Results tab**: proven value + partial tablebase summary + piece values (reads the same `body` shape Phase 3 persists). **Glossary tab**: static term list (retrograde analysis, tablebase, win-distance/DTM, weak/strong solve, minimax back-up rule, fixpoint, GHI). Inline `const SOLVER_CSS = \`…\`` scoped to `.solver-main` etc.
- **`ui/solver/PhaseBar.tsx`** — 5-segment phase pipeline. Port of bender's `PhaseBar.tsx`, reading `PHASE_LABELS`/`PHASE_COUNT` from `lab/solver/phaseData.ts`, classNames scoped in `SOLVER_CSS`. Counters `Sweep n` / `Solved x/est`.
- **`ui/solver/SolverControls.tsx`** — Play/Pause/Back/Step/+N/Reset + batch + speed. Port of bender's `Controls.tsx` (keyboard Space/→/Shift+→/←, `EditableValue`, log-scale sliders), scoped CSS.
- **`ui/solver/HelpBar.tsx`** — hover-help + `S` to pin + "See in Glossary". Port of bender's `HelpBar.tsx` (`data-help`/`data-help-glossary`), scoped CSS.
- **`ui/solver/phasePanels.tsx`** — one component per phase reading `SolverPhaseData`: `EnumeratePanel`, `SeedTerminalsPanel`, `PropagatePanel` (sweep index, flipped-this-sweep, the minimax rule fired, win/loss frontier counts), `ConvergePanel`, `ReadValuePanel` (root result + win-distance + the piece-ablation table). Each row carries `data-help`/`data-help-glossary`.
- **`ui/solver/FrontierBoard.tsx`** (or inline) — takes `SolverViewState` → `EditorBoard` for `StudioReadOnlyBoard`, overlaying the frontier. Uses `levelToEditorBoard(level)` + `unitsForGamePieces(...)` (from `core/levelBoard.ts`, the GameLab/Gym replay path) + a highlight layer for newly-solved cells.

Modified — the single Studio registration point **`ui/TilePreview.tsx`** (mirrors the existing `gamelab`/`gym` wiring; ADR-0058 click-reachability). **Anchor every edit by SYMBOL, not by line number — `TilePreview.tsx` is large and line numbers drift; a cold agent following stale line numbers edits the wrong spot.** The ten edits:
1. Import `import { SolverCatalog, SolverViewer } from './Solver';` (beside the `GameLab` import).
2. `type StudioCategory`: add `| 'solver'`.
3. `type ViewerKind`: add `| 'solver'`.
4. Route state: add `selectedSolverLevelId?: string;` (beside `selectedGameLabLevelId`) and extend the `ViewerKind` guard union.
5. URL parse: `selectedSolverLevelId: solvlvl || undefined,` reading a new `solvlvl` param; add `vk === 'solver'` to the viewer-kind guard.
6. URL serialize: catalog param `if (route.category === 'solver' && route.selectedSolverLevelId) catalogParams.set('solvlvl', …)`; viewer param `else if (route.viewerKind === 'solver' && route.selectedSolverLevelId) params.set('solvlvl', …)`.
7. State: `const [solverSearch, setSolverSearch] = useState('');` and `const [selectedSolverLevelId, setSelectedSolverLevelId] = useState<string|undefined>(initialRoute.selectedSolverLevelId);`; include both in the route-memo deps and `applyRoute` setters.
8. `catalogCategories` array: add one entry after `gym`, copied from the `gamelab` block:
   ```
   { id: 'solver', label: 'Board Solver',
     hint: 'Solve a board exactly by retrograde analysis — watch the value spread from terminals, phase by phase; feasibility read + honest piece values.',
     main: <SolverCatalog search={solverSearch} selected={selectedSolverLevelId} onSelect={setSelectedSolverLevelId} />,
     controls: (<>
       <label className="tileset-catalog-search"><span>Search</span>
         <input type="search" value={solverSearch} onChange={e=>setSolverSearch(e.target.value)} placeholder="level, mode…" /></label>
       <button type="button" className="tileset-view-action" onClick={()=>openViewer('solver')} disabled={!selectedSolverLevelId}>Open Solver</button>
     </>) }
   ```
9. `viewerKindSelect` dropdown: add `<option value="solver">Board Solver</option>`.
10. Viewer render ternary: add `: viewerKind === 'solver' ? <SolverViewer levelId={selectedSolverLevelId} header={studioViewerHeader} />`.

These ten edits are the entire click-reachability wiring: catalog card → "Open Solver" → `openViewer('solver')`.

### Ordered tasks

1. **Confirm the consumed contract** with Phase-1: `SolverStepConfig`/`SolveBounds`, the engine stepping entrypoint (`solveStepWithPhases` — a real named export per F7, else a coroutine over `runSolve`), `FeasibilityReport`, the `SolveStep`/`PositionKey` encoding.
2. **`lab/solver/animationClock.ts`** — copy bender's clock verbatim; boundary-ordering unit test. Zero engine dependency, lands first.
3. **`lab/solver/phaseData.ts`** — `SolverPhase`, `PHASE_LABELS`, per-phase view-models mapping from the contract `RetrogradeStep`.
4. **`lab/solver/solverRunner.ts`** — `SolverRunner` over the Phase-1 engine (`solveStepWithPhases`): `runStepWithPhases`, `runCoarseStep`, `getCurrentState`, snapshot/restore, reset.
5. **`lab/solver/solverBuffer.ts`** — port `EpisodeBuffer` → `SolverBuffer` (episode→phase-step unit, `captureSteps`, producer loop, `prefill` seam).
6. **`lab/solver/useSolverStepper.ts`** — port `use-buffered-algorithm.ts`; keep undo/redo + sweep-clock machinery intact.
7. **Unit tests** for runner + buffer + hook-reducer determinism.
8. **UI ports:** `PhaseBar.tsx`, `SolverControls.tsx`, `HelpBar.tsx`, `phasePanels.tsx`, `FrontierBoard.tsx` — bender `colors`/`styles` → `SOLVER_CSS`.
9. **`ui/Solver.tsx`** — assemble `SolverCatalog` + `SolverViewer` (Feasibility/Step/Run/Results/Glossary), wire `useSolverStepper`, render board via `ViewPane`+`StudioReadOnlyBoard`, add `SOLVER_CSS`.
10. **Register in `ui/TilePreview.tsx`** — the ten symbol-anchored edits. Part of the build (ADR-0058), not after.
11. **Manual verification** on a tiny board (K+P vs K) and `off-l-break-line`: step all five phases, confirm frontier animation, Back/redo, deterministic replay, and the Open-Solver click path. Screenshot via `npm run shot` on `http://127.0.0.1:5199/studio?mode=viewer&vk=solver&solvlvl=off-l-break-line`.

### Tests

Node-run `*.test.ts` beside source (per `lab/gymStep.test.ts`).
- **`solverRunner.test.ts`**: driving `runStepWithPhases()` to `null` on K+P vs K yields phases in order `Enumerate, SeedTerminals, Propagate×N, Converge, ReadValue`, and final `ReadValuePhaseData.rootResult`/`rootDistancePlies` equals known ground truth. **Determinism**, **snapshot round-trip**, **frontier monotonicity** (each `Propagate` sweep `flippedThisSweep ≥ 0`, solved counts non-decreasing, `Converge.reachedFixpoint` ⇒ next step enters `ReadValue`).
- **`solverBuffer.test.ts`**: `computeImmediate(n)` vs `computeOne()`×n same sequence; `captureSteps` true/false; `prefill`/`consume`/`trimConsumedTo`/`clearBuffer` bookkeeping.
- **`animationClock.test.ts`**: `onBoundary` once per integer crossing ascending; `stopAtNextBoundary`; `startSweep`+`finishSweepImmediate` lands on target.
- **Reducer determinism**: extract any pure step-fold and test directly.
- No backend/DB needed.

### Integration (produced / consumed)

- **Consumed**: Phase-1 engine (`estimateFeasibility`, `solveStepWithPhases`); the contract `SolveStep`/`RetrogradeStep`/`FeasibilityReport`/`SolveBounds`; render primitives (`Level`, `LevelUnit`; `levelToEditorBoard`, `unitsForGamePieces`; `StudioReadOnlyBoard`; `LevelThumbnail`; `ViewPane`; `MODE_NAME`; `useCampaigns`/`ensureCampaignsHydrated`); bender's `animation-clock.ts` (copied in).
- **Produced**: the stepper viewer surface + `SolverPhaseData`/`SolverViewState` view-models — **Phase 3 replays the recorded phase trace into this same viewer** (ADR §7); `useSolverStepper` is shaped so the `SolverBuffer` is swappable for a `prefill`-able replay source (the Phase-3 seam). **Phase 4** adds Search-mode phase enums/panels behind the same PhaseBar/Controls/HelpBar shell. **Studio registration** (`solver` category + `ViewerKind` + `solvlvl` URL param + `openViewer('solver')`) is the "navigate to the solver" contract. The **Run/Results tabs are mount points** for Phase 3's `SolveRuns` + the persisted `body` readout.

### Risks / de-risking

- **Phase-1 stepping API may drift.** Task 1 pins it; `SolverRunner` is the single adapter. Build `animationClock.ts` + `phaseData.ts` first (zero engine dependency).
- **Heterogeneous retrograde phases** (not bender's uniform five-per-step): `SolverPhaseData` is a partial record keyed by phase; buffer/clock unit is a phase-step; `Converge` loops the bar back to `Propagate` until fixpoint. Documented divergence.
- **Enumerate can be large on "small" boards** — the feasibility gate refuses over-cap boards before Play; the board view renders only a representative/sampled frontier position; the `setTimeout(0)` producer keeps enumeration off the paint path.
- **No `colors.ts`** — every ported component drops the `colors` import for `SOLVER_CSS` classNames.
- **Determinism under undo/redo + speed changes** — snapshot round-trip + node determinism tests gate it.
- **Reachability regression (ADR-0058)** — the `catalogCategories` entry + "Open Solver" button are part of the build (Task 10), verified by clicking Catalog → Board Solver → Open Solver.
- **Stale line numbers in `TilePreview.tsx`** — every edit is symbol-anchored (`type ViewerKind`, `catalogCategories`, `viewerKindSelect`), never line-number-anchored.

---

## Phase 3 — Cluster `solve-runs` (clone of `train-runs`)

Stand up the async, cluster-backed face: a `solve-runs` REST surface, DB table, k8s Job launcher, headless worker, engine-bundle export, network client, and a "Run" tab — each **cloned from the verified `train-runs` machinery** (ADR §5, Appendix). A user opens the Run tab for a level, clicks Launch, a bounded/anytime solve Job spins up on the existing `workload=trainer` node pool running `node backend/solve-worker.mjs`, the worker streams `SolveProgress` by JSONB body-patching its `solve_runs` row on a cadence, the UI polls every ~6s, and Cancel deletes the Job while keeping the partial body. Large tablebases go to blob storage referenced by URL; everything else lives in the JSONB `body`, gated by the feasibility memory cap before the run starts.

In scope: run-lifecycle plumbing (API/DB/Job/worker/bundle/client/Run-tab). Out of scope: the pure engine (Phase 1), the stepper (Phase 2), search mode (Phase 4). This phase **consumes** the contract types opaquely — it passes `spec` through and patches `body` without decoding shapes beyond what it must plumb.

### Files

Backend — new:
- **`backend/solve/k8s.mjs`** — near-verbatim clone of `backend/train/k8s.mjs`.
  - `export function inCluster(): boolean` — identical to trainer's; reuses the **same** `TRAINER_IMAGE`/`TRAINER_SA` env (`k8s/templates/deployment.yaml`) and the **same** batch/v1 RBAC — no new infra.
  - `export async function createSolverJob(runId: string): Promise<string>` — clone of `createTrainerJob`. Differences: Job name prefix `solve-`; labels `app:'chess-solver'`, `solve-run:<id>`; container `command:['node','backend/solve-worker.mjs']`; env `SOLVE_RUN_ID` (+ the same `POSTGRES_HOST/DATABASE/USER` trio); **memory-forward resources** `requests:{cpu:'6',memory:'6Gi'}, limits:{cpu:'8',memory:'12Gi'}` (retrograde is memory-bound; the container memory limit is the number feasibility compares the tablebase estimate against). Keeps `backoffLimit:0`, `ttlSecondsAfterFinished:3600`, `activeDeadlineSeconds:10800`, `nodeSelector:{workload:'trainer'}`, matching toleration, `azure.workload.identity/use:'true'`.
  - `export async function deleteSolverJob(name: string): Promise<void>` — clone of `deleteTrainerJob`; background propagation, 404-tolerant.
  - The private `apiRequest`/`read`/`namespace` helpers are copied in (trainer keeps them file-private).

- **`backend/solve-worker.mjs`** — cloned from `backend/train-worker.mjs`.
  - `async function loadSpec(): Promise<SolveSpec>` — clone of `loadSpec`: `process.env.SOLVE_SPEC` (JSON) else `SELECT spec FROM solve_runs WHERE id=$1` via `getTrainerPool()` from `./train/db.mjs` (reused verbatim; engine-agnostic).
  - `async function persist(runId, patch): Promise<void>` — clone: `UPDATE solve_runs SET body = body || $2::jsonb, status = $3, updated_at = now() WHERE id = $1`. (When `SOLVE_RUN_ID` is unset — the local smoke path — `persist` no-ops, matching `train-worker.mjs`.)
  - `async function main()`: load spec, `level = spec.level`, `bounds` from `spec`, then: (1) **feasibility first** `const report = estimateFeasibility(level)`; `persist(runId,{status:'running', body:{ phase:'feasibility', feasibility: report, startedAt }})`; (2) **anytime solve** `const result = runSolve(level, bounds, onProgress)` where `onProgress(p: SolveProgress)` calls a **throttled** `persist` (cadence ~every 2-4s or every K nodes — patch top-level keys, do NOT accumulate history arrays); the progress patch carries `{ phase, statesEnumerated, statesSolved, proven, rootBounds, coveragePct, secs }`; (3) **tablebase sink decision**: if a serialized tablebase exceeds `SOLVE_TB_INLINE_MAX_BYTES` (~1 MB) upload to blob and store `{ tablebaseUrl }`, else inline; (4) final `persist(runId,{ status:'done', body:{ finishedAt, secs, rootValue: result.rootValue, pieceValues: result.pieceValues, coveragePct: result.coveragePct, ...tablebaseRef }})`.
  - `function serializeTablebase(result): Buffer` — the tablebase serializer (nothing in the trainer produces this; it is NEW surface, not a clone). Emits the `format:'solver-tablebase-v1'` payload (proven ordinals → `Value`), gzipped by the caller. The worker "decides the sink"; this function produces the bytes.
  - `async function uploadTablebase(runId, buf): Promise<string>` — lazy `import('@azure/storage-blob')` + `DefaultAzureCredential` (the `server.js` blob-**reader** pattern adapted for a **writer** — a writer needs `getBlockBlobClient().uploadData(...)` and the **Storage Blob Data Contributor** role, NOT just the reader role; verify the exact writer call against `@azure/storage-blob` before asserting it's a clone). `SOLVE_ARTIFACTS_URL` container, gzip via `node:zlib`, `solve/<runId>/tablebase.json.gz`, returns the blob URL. **Guarded**: if `SOLVE_ARTIFACTS_URL` unset, truncate the tablebase (keep proven summary + strongest line) and set `body.tablebaseTruncated = true` rather than fail. **v1 ships blob-off** (see DoD).
  - `main().catch(...) => process.exit(1)` — identical tail to `train-worker.mjs`.
  - Import: `import { estimateFeasibility, runSolve } from '../frontend/trainer-bundle/engine.mjs'` — the **verified** relative path (F3/ruling 7; exactly what `train-worker.mjs:17` uses).

Backend — edits to `backend/server.js`:
- **Migration (version 12)** — append to the `MIGRATIONS` array (currently ends at version 11). A new numbered migration so `REQUIRED_SCHEMA_MIGRATION_VERSIONS` (`.map(m=>m.version)`) picks it up and `checkMigrations` enforces it in prod while dev applies it via `runMigrations`. Mirror the `train_runs` DDL:
  ```
  { version: 12, name: 'solve runs',
    sql: `CREATE TABLE IF NOT EXISTS solve_runs (
            id text PRIMARY KEY, owner_email text NOT NULL, spec jsonb NOT NULL,
            body jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'pending',
            job_name text, created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now());
          CREATE INDEX IF NOT EXISTS solve_runs_owner_idx ON solve_runs (owner_email, created_at DESC);` }
  ```
- **DB helpers** — clone the `train_runs` helpers as `dbListSolveRuns`, `dbGetSolveRun`, `dbInsertSolveRun`, `dbSetSolveRunJob`, `dbDeleteSolveRun` (F4 — **preserve the two DISTINCT projections**): `dbListSolveRuns` selects `id, spec, status, created_at, updated_at` (NO `body`, NO `job_name`), `ORDER BY created_at DESC LIMIT 100`; `dbGetSolveRun` selects `id, spec, body, status, job_name, created_at, updated_at`. Same `ensureDbReady()` gate, owner-scoped queries. **Note: `dbDeleteSolveRun` is NOT a row delete — see the DELETE route (cancel-not-purge).** Instead of a delete helper, add `dbCancelSolveRun(ownerEmail, id)` → `UPDATE solve_runs SET status='cancelled', updated_at=now() WHERE owner_email=$1 AND id=$2` (keeps `body`).
- **Routes** — clone the four `/api/train-runs` handlers as `/api/solve-runs`:
  - `POST /api/solve-runs` — `requireUser` → validate `spec.level` is an object (400 `invalid_solve_spec`) → `dbInsertSolveRun` → `import('./solve/k8s.mjs')`; if `inCluster()` → `createSolverJob(id)` + `dbSetSolveRunJob(id, jobName, 'running')` → `{ok,id,status:'running',job}`; else `{ok,id,status:'pending',note}`. Error → status `'error'`, 502 `solve_launch_failed`.
  - `GET /api/solve-runs` — `{ runs: await dbListSolveRuns(user.email) }`, `dbUnavailable(...,'solve_runs_unavailable')`.
  - `GET /api/solve-runs/:id` — `dbGetSolveRun` → 404 `run_not_found` or the row.
  - `DELETE /api/solve-runs/:id` — **cancel-not-purge (ADR §5, ruling 8):** if `run.job_name`, `deleteSolverJob(run.job_name)` (best-effort), then `dbCancelSolveRun(user.email, id)` (keep `body`), `{ok:true}`. The client/UI treat a cancelled run as still-viewable.

  > **Cancel-semantics reconciliation (ruling 8):** the trainer's `DELETE` deletes the Job **and the row** (losing the body). ADR §5 literally says cancel = "delete Job + keep the partial body." So the solver's `DELETE` is cancel-not-purge — this is an ADR requirement, not a discretionary divergence. A separate hard-purge can be added later if needed.

Frontend — new/edit:
- **`frontend/src/trainer/engine.ts`** (edit) — the **same** file the contracts section appends its `export type` block to. Phase 3 additionally appends the value/function re-export so the worker bundle carries the runtime engine:
  ```ts
  export { estimateFeasibility, runSolve } from '../core/solver';
  export type { SolveSpec, SolveBounds, FeasibilityReport, SolveProgress, SolveResult } from '../core/solver';
  ```
  `vite.trainer.config.js` needs **no change** — its `noExternal:true` SSR build inlines the whole reachable TS graph from `src/trainer/engine.ts`, and `core/solver` builds on `core/rules.ts`/`core/objectives.ts` (already DOM-free, in-graph). **Verification task:** confirm `core/solver` pulls in nothing browser-only; a DOM import is a Phase-1 purity bug to flag, not a bundle-config change.
- **`frontend/src/net/solveRuns.ts`** (new) — cloned from `net/trainRuns.ts`. Imports contract types (`import type { SolveSpec, FeasibilityReport, SolveProgress, SolveResult, RootBounds, ProvenCounts } from '../core/solver'`) rather than redefining them.
  - `interface SolveRunBody { phase?: string; feasibility?: FeasibilityReport; statesEnumerated?: number; statesSolved?: number; proven?: ProvenCounts; rootBounds?: RootBounds; coveragePct?: number; secs?: number; rootValue?: SolveResult['rootValue']; pieceValues?: SolveResult['pieceValues']; tablebase?: unknown; tablebaseUrl?: string; tablebaseTruncated?: boolean; startedAt?: string; finishedAt?: string }` — permissive/optional. **`rootBounds` is `RootBounds` (the contract object), NOT a `[number, number]` tuple** (ruling 1).
  - `interface SolveRunSummary { id: string; spec: SolveSpec; status: string; created_at: string; updated_at: string }` — **matches `dbListSolveRuns` exactly (F4): no `body`, no `job_name`.**
  - `interface SolveRunDoc extends SolveRunSummary { body: SolveRunBody; job_name: string | null }` — **matches `dbGetSolveRun` (F4).**
  - `async function request<T>(method, path, body?)` — copy verbatim from `trainRuns.ts` (uses `HttpError` from `./http`, `credentials:'include'`).
  - `launchSolveRun(spec: SolveSpec): Promise<{id;status}>` → POST; `listSolveRuns(): Promise<SolveRunSummary[]>` → GET; `getSolveRun(id): Promise<SolveRunDoc>` → GET `:id`; `cancelSolveRun(id): Promise<void>` → DELETE `:id`.
- **`frontend/src/ui/SolveRuns.tsx`** (new) — cloned from `ui/ClusterRuns.tsx`. The **Run tab** body. **F5: `ClusterRuns` is `({ level, levelId, onAdopt })` with `onAdopt` REQUIRED and adopt/ship threaded throughout — this is a prop-shape change, not a block delete.**
  - `export function SolveRuns({ level }: { level?: Level }): ReactElement`. **Drop `levelId` and `onAdopt` from the prop shape; remove every reference to `onAdopt`, `shipAiWeights`, `verdictLabel`, `isAdmin`, `champTheta`, `canAdopt`** (the solver's output is a proven value + tablebase, not an eval vector to adopt). Confirm the removed `levelId` is not referenced by the two polling effects' deps (they key on run-id/`openId`, not `levelId`).
  - Reuse the trainer's two polling effects: run-list poll every 8s, open-run detail poll every **6s** until terminal. `openId`/`detail`/`launching`/`error` state identical.
  - `launch` calls `launchSolveRun({ level, mode: 'retrograde', bounds: { wallClockMs: 300_000, maxStates: 50_000_000, maxMemoryBytes: 8*2**30 } })` (contract `SolveBounds` shape; `mode` prefilled from feasibility's `recommendedMode` when known; `maxMemoryBytes` set UNDER the 12Gi container limit so the self-check trips first). Sensible default budget the user can dial up.
  - Detail render (replace the champion/holdout block): while `running` — `phase`, `statesSolved / statesEnumerated`, `coveragePct`, `proven {win/loss/draw}`, `rootBounds` (the tightening bounds), `secs`; a `feasibility` line (verdict + est. states + est. memory vs cap + en-passant refusal if any) as soon as the first patch lands; `done` — `rootValue`, `pieceValues` if present, and either an inline note or a **download link** to `body.tablebaseUrl` (or "tablebase truncated at cap" when `tablebaseTruncated`).
  - Cancel button (`running`|`pending`) → `cancelSolveRun`.
  - Reuse the existing `.cluster-runs*` CSS classes (no new stylesheet).
- **Solver route host** — the Run tab mounts inside the solver's Studio tab shell Phase 2 builds (ADR §7 tabs). Phase 3 **provides `<SolveRuns level={level} />`**; the tab-container wiring is Phase 2's. If Phase 2's shell isn't landed, mount `SolveRuns` behind a temporary branch mirroring `Gym.tsx`'s tab mount, to be relocated. (State the dependency; don't block on it.)

### Ordered tasks

1. **DB migration.** Add `version:12` (`solve_runs` + owner index) after the `version:11` entry. Confirm `REQUIRED_SCHEMA_MIGRATION_VERSIONS` picks up 12.
2. **DB helpers.** Clone the `train_runs` helpers next to them — **two distinct projections (F4)** + `dbCancelSolveRun` (not a delete).
3. **k8s launcher.** Create `backend/solve/k8s.mjs`; change name prefix, labels, command, `SOLVE_RUN_ID`, memory-forward resources; keep `inCluster()` on `TRAINER_IMAGE`.
4. **Engine bundle export.** Add the `core/solver` re-exports to `frontend/src/trainer/engine.ts`. Run `npm run build:trainer` from `frontend/` and confirm the built `frontend/trainer-bundle/engine.mjs` exports `estimateFeasibility`/`runSolve` and stays DOM-free. **Depends on Phase-1 `core/solver` existing**; until then, gate behind a thin stub `core/solver/index.ts` that throws `not-implemented` so the bundle + worker wiring is testable end-to-end.
5. **Worker.** Create `backend/solve-worker.mjs`: `loadSpec`, feasibility-first patch, `runSolve(level,bounds,onProgress)` with throttled `persist`, `serializeTablebase`, tablebase sink decision, final `done`, `process.exit`. Import from `../frontend/trainer-bundle/engine.mjs` (F3).
6. **Tablebase blob sink.** Implement `serializeTablebase` + `uploadTablebase` (lazy `@azure/storage-blob` **writer** + `DefaultAzureCredential`, gzip, `SOLVE_ARTIFACTS_URL`, `solve/<runId>/tablebase.json.gz`). Ship v1 sink **optional** (inline-or-truncate when unset).
7. **Routes.** Clone the four `/api/train-runs` handlers → `/api/solve-runs`; implement `DELETE` as cancel-not-purge (ruling 8).
8. **Client.** Create `frontend/src/net/solveRuns.ts` (clone `trainRuns.ts`; types from `core/solver`; two-projection types per F4).
9. **Run-tab UI.** Create `frontend/src/ui/SolveRuns.tsx` (clone `ClusterRuns.tsx`; drop the `levelId`/`onAdopt` props + adopt/ship references per F5; add feasibility + progress + partial-tablebase readout; 6s detail poll).
10. **Mount.** Wire `<SolveRuns level={level} />` into the solver route's Run tab (Phase-2 shell) or the temporary branch.
11. **Env/Helm sanity.** Confirm no new Helm change for the base path: solver Job reuses `TRAINER_IMAGE`/`TRAINER_SA` + existing batch/v1 RBAC. **New optional env (only if blob sink enabled):** `SOLVE_ARTIFACTS_URL` (+ Storage Blob **Data Contributor** role for the app SA on that container). Confirm the solver Job's env carries the Postgres trio (cloned from trainer).

### Tests

- **`backend/solve-worker.mjs` smoke (no cluster, no Postgres)** — per the `netplay-smoke-test.js` "runs anywhere in seconds" convention: set `SOLVE_SPEC` to a tiny hand-checkable level (K+P vs K), no `SOLVE_RUN_ID` ⇒ `persist` no-ops, run `main()` against the **stub** engine, assert exit 0 + a `done` log with a `rootValue`. Once Phase 1 lands, swap the stub for real `core/solver` and assert the known K+P-vs-K value. **This is the go-to test for this phase — it runs on this Windows box.**
- **DB helper + route test (Postgres-gated — CI-only on this host, NOT a local task).** This Windows box has no Postgres binaries (CLAUDE.md), and `netplay-smoke-test.js` covers only the in-memory lobby, NOT DB persistence — so a `solve_runs` CRUD assertion cannot run locally. Treat it as a **known can't-verify-locally (CI-only)** item, exactly as the repo treats the full `smoke-test.js`. When it does run (CI / a Postgres host): POST creates a `pending` row, GET lists (no `body`) / reads (with `body`), DELETE sets `cancelled`/keeps body.
- **k8s payload shape (pure, no cluster)** — unit-test `createSolverJob` by monkeypatching its `apiRequest` (or extracting the manifest builder): name starts `solve-`, `command==['node','backend/solve-worker.mjs']`, `SOLVE_RUN_ID` present, `nodeSelector.workload==='trainer'`, memory limit `12Gi`, `activeDeadlineSeconds===10800`, `backoffLimit===0`.
- **Bundle export test** — after `npm run build:trainer`, a node one-liner imports `frontend/trainer-bundle/engine.mjs` and asserts `typeof estimateFeasibility==='function' && typeof runSolve==='function'`, and that importing in bare Node throws no DOM error (the "stayed DOM-free" CI guard).
- **Client contract test (vitest)** — mock `fetch`; assert `launchSolveRun`/`getSolveRun`/`cancelSolveRun` hit the right method+path, `listSolveRuns` returns the no-`body` summary shape, and a non-ok response throws `HttpError`.
- **UI render test (optional, if RTL exists for `ClusterRuns`)** — render `SolveRuns` with a fake `detail` body in each state (`running` with `rootBounds`, `done` with `tablebaseUrl`, `done` with `tablebaseTruncated`).

### Integration (produced / consumed)

- **Consumed**: the `core/solver` engine contract (`estimateFeasibility`, `runSolve`, and the `SolveSpec`/`SolveBounds`/`FeasibilityReport`/`SolveProgress`/`SolveResult`/`RootBounds`/`ProvenCounts` types) — imported from `../core/solver` in `trainer/engine.ts` + `net/solveRuns.ts`, and via `../frontend/trainer-bundle/engine.mjs` in `solve-worker.mjs` (F3); `spec`/`body` treated as opaque pass-through/patch. `Level` (already exported through `trainer/engine.ts`). `getTrainerPool()` (`backend/train/db.mjs`, reused verbatim). `inCluster()` env + RBAC (`TRAINER_IMAGE`/`TRAINER_SA`, batch/v1). `HttpError` (`net/http`). Trainer bundle build (`vite.trainer.config.js`, `npm run build:trainer`, copied at `Dockerfile:22`).
- **Produced**: the REST surface `POST/GET/GET:id/DELETE:id /api/solve-runs`; the `solve_runs` table (migration 12); the body-patch progress protocol — the **Results tab (Phase 2)** and the **stepper's cluster-replay mode** read this same `body`, so the body shape stays a superset Phase 2 can read; the `net/solveRuns.ts` client; the blob artifact convention `solve/<runId>/tablebase.json.gz` under `SOLVE_ARTIFACTS_URL` (Phase-3.5 when the sink is enabled — see DoD).

### Risks / de-risking

- **Phase-1 engine not landed (hard dependency).** Ship a stub `core/solver/index.ts` so the entire Phase-3 pipeline is wired and testable now; swap in the real engine when Phase 1 merges.
- **`body` JSONB growth from streaming + large tablebases.** Two-pronged: (1) the worker **replaces** the progress sub-object each patch (patch top-level keys, no accumulating arrays); (2) the tablebase never goes in the row above `SOLVE_TB_INLINE_MAX_BYTES` — blob (`tablebaseUrl`) or truncated. The feasibility gate caps the tablebase to the Job memory limit before the run starts (the `12Gi` container limit is that number).
- **Blob sink is NEW surface (nothing to clone 1:1).** The trainer has no tablebase writer; `serializeTablebase` + a blob **writer** (`uploadData`, Data Contributor role) are new. Reuse the `server.js` lazy-`import` + `DefaultAzureCredential` shape but verify the writer API before asserting a clone. Make the sink **optional in v1** (inline-or-truncate when `SOLVE_ARTIFACTS_URL` unset), so Phase 3 ships without a new container + role.
- **Memory-bound Job OOM-kill before a partial persists.** The worker checks `bounds.maxMemoryBytes` on the same cadence as wall-clock/nodes and exits cleanly with the partial persisted **before** the container limit; set `bounds.maxMemoryBytes` comfortably under the container limit (e.g. `8Gi` vs `12Gi`). Feasibility refusing over-cap boards is the upstream guard.
- **Cancel diverges from the trainer's DELETE (ruling 8).** Cancel-not-purge is ADR-mandated; the client/UI treat cancelled as still-viewable.
- **Persist throttling vs Postgres load** — throttle `onProgress→persist` to a fixed cadence, the coarse-cadence spirit of the trainer's start/done-only persists plus bounded intermediate patches ~every few seconds.
- **Migration-version collision across parallel worktrees** — per the "multi-worktree shared main ref" rule, fetch `origin/main` and reconcile the migration number against the latest `MIGRATIONS` array before merging; the migration is idempotent (`CREATE TABLE IF NOT EXISTS`) so a renumber is safe.
- **Bundle accidentally pulls DOM/pixi via `core/solver`** — the bundle-export test imports the built bundle in bare Node as a CI guard; any DOM import surfaces immediately and is a Phase-1 purity fix.

---

## Phase 4 — Search mode (anytime weak-solver: iterative-deepening αβ + TT + cycle detection; PN optional)

The solver's **fallback path for boards the retrograde strong-solver cannot enumerate**: an *anytime weak-solver from the start position* that (a) yields progressively deeper **proven** results via iterative deepening, (b) accumulates solved positions in a **transposition table** so an early stop is useful, (c) **proves draws** in this repetition-rule-free loopy game (F8) via explicit cycle/repetition detection over the search path, (d) tightens **root upper/lower bounds** on the true game value, and (e) exposes the same five watchable phases (`Generate → Order → Descend → Quiesce → BackUp`) the Phase 2 stepper renders. It reuses `core/ai.ts`'s negamax/quiescence/eval and `core/rules.ts`'s move generation and terminal oracle wholesale — a *proof-tracking wrapper* around the existing search, not a reimplementation. The feasibility gate selects this path when `verdict ∈ {'hard','infeasible'}`.

Grounding: turn model = one ply per move (`applyMove` swaps `turn` per move); **no repetition / 50-move rule exists** (F8 — a "draw" = neither side can force a king-capture in finite moves, proved by cycle detection, NOT a ply cap); terminality is objective-dependent and **must use the same victory oracle Phase 1 uses (F1)** — `resolveVictory(state, level.victory ?? victoryRulesForObjective(...), {...ctx, turnsElapsed})`, not `evaluateObjective`. (The existing `negamax`/`quiesce` call `evaluateObjective` internally; the proof-tracking fork MUST route terminality through the victory-rule oracle to honor authored `level.victory`. Flag this to the reuse-surface: either the fork passes the resolved rules down, or `ai.ts`'s terminal check is confirmed to already handle `level.victory` for the solver's inputs.)

### Files

New under `frontend/src/core/solver/search/` (pure, no DOM/React; consumed by the Phase 2 stepper and, via the engine bundle, `solve-worker.mjs`). This part owns these files and **consumes** two shared contracts: the Phase-1 position-encoding module and the `core/solver/types.ts` value/result types.

- **`idSearch.ts`** — the iterative-deepening αβ weak-solver driver (proof-tracking, anytime analogue of `searchBestAction`).
  - `export interface WeakSolveBounds { maxDepthPlies?: number; maxNodes?: number; wallClockMs?: number; ttEntryLimit?: number; prover?: 'ab' | 'pn' | 'pn2'; }` — search-mode-**internal** caps derived from the contract `SolveBounds` inside `runSolve`'s search branch (NOT on the wire). `prover` defaults `'ab'`.
  - `export function runWeakSolve(root, env, sctx, bounds, tt, onProgress?): WeakSolveResult` — the driver. Loops depth `1..∞`, calls `proofNegamax` at each depth, updates the **contract** `RootBounds`, emits progress on a cadence, stops when the root is proven (bounds meet) or a budget trips. Returns the accumulated result on a budget stop.
  - `export interface WeakSolveResult { rootValue: Value; rootBounds: RootBounds; bestLine: OrderedMove[]; completedDepth: number; nodes: number; proven: ProvenCounts; coverage: { statesSeen: number; ttSize: number }; aborted: boolean; }` — the anytime payload; `rootValue`/`rootBounds`/`proven` are **contract types**, so `WeakSolveResult` is assignable into the public `SolveResult` that `runSolve`'s search branch returns.
- **`proofNegamax.ts`** — proof-tracking negamax, a fork of `ai.ts:negamax` that (a) probes/stores the TT, (b) detects cycles on the path → draw, (c) returns a value distinguishing *proven* from *heuristic-bounded*, (d) emits phase events, (e) routes terminality through the victory-rule oracle (F1).
  - `export interface ProofBackedValue { value: number; proof: 'win' | 'loss' | 'draw' | 'bound'; distancePlies: number; }` — `'bound'` = the depth-limited α/β heuristic (not a proof); `value` stays side-to-move-positive (the exact `ai.ts` negamax convention) so scoring/ordering reuse is byte-compatible. Converts to the contract `Value` at the module boundary.
  - `export function proofNegamax(s, state, path, depth, ply, alpha, beta, turnsElapsed): ProofBackedValue` — mirrors `negamax`'s signature plus `path` (cycle detection) and the richer return. Reuses `legalMoves`, `applyMove`, the victory-rule terminal check, `sideInCheck`, `captureValue`+sort ordering, and delegates leaf scoring to the exported `quiesce`.
  - `export interface ProofSearchState` — extends `ai.ts`'s `SearchState` shape with `tt: TranspositionTable`, `emit?: (ev: PhaseEvent) => void`, `ttEntryLimit`, and the resolved `victoryRules`. Since `SearchState` is not exported, use a `makeSearchState(...)` factory (see Tasks).
- **`transpositionTable.ts`** — the TT: the anytime accumulator + the store of proven positions (ADR §3).
  - `export type TTFlag = 'exact' | 'lower' | 'upper' | 'proven-win' | 'proven-loss' | 'proven-draw'` — αβ bound flags plus the three proof flags.
  - `export interface TTEntry { key: string; flag: TTFlag; value: number; depth: number; distancePlies: number; bestMoveIdx?: number; }` — `key` is the **contract `PositionKey` (string)**; `depth` = the resolution depth.
  - `export class TranspositionTable { get(key): TTEntry|undefined; put(e): void; get size(): number; provenCounts(): ProvenCounts; clear(): void; }` — a `Map<string, TTEntry>` with depth-preferred + proven-sticky replacement and a `ttEntryLimit` cap.
- **`cycleDetection.ts`** — repetition/cycle detection over the search path; the mechanism that **proves draws** in this loopy game (F8).
  - `export class PathHistory { push(key): void; pop(): void; repeats(key): boolean; }` — an incremental multiset (`Map<string,count>` + stack, O(1) push/pop). `key` uses the **Phase-1 position-encoding contract**. On `repeats(key)` in `proofNegamax` the branch scores `{ proof: 'draw', value: 0 }`.
- **`phaseEvents.ts`** — the `PhaseEvent` union the search emits for the stepper, matching ADR §7's search phases.
  - `export type PhaseEvent = …Generate|Order|Descend|Quiesce|BackUp…` — carries current line, bounds, TT hits. These map to the contract `SearchStep` variants at the boundary the worker records / the stepper consumes.
  - `export function stepSearchWithPhases(...)` — the phase-decomposed single-node stepper the Phase 2 UI drives and the worker replays; a coarse `stepNode()` internally, phase-boundary buffered (mirrors bender's `runStepWithPhases()`).
- **`pnSearch.ts`** *(optional, ADR §1 "PN/PN²")* — proof-number search as a dedicated prover for a stubborn win/loss. Ships behind `bounds.prover`, default `'ab'`; if time-boxed, a typed stub throwing `not-implemented` + skipped test.
- **`idSearch.test.ts`**, **`proofNegamax.test.ts`**, **`transpositionTable.test.ts`**, **`cycleDetection.test.ts`**, **`pnSearch.test.ts`** — unit tests (below).

Reuse points in `ai.ts` (existing file — minimal, additive `export`s only, zero behavior change): export `quiesce`, a `makeSearchState(...)` factory + `export type` read-only `SearchState` view, `captureValue`, `terminalScore`, `outOfBudget`; reuse `evaluateGameState` (already exported). Keep exports in one commented "solver reuse surface" block.

### Ordered tasks

1. **Widen `ai.ts` exports (enabling reuse, zero behavior change).** Add `export` to `quiesce`/`captureValue`/`terminalScore`/`outOfBudget`; add a `makeSearchState(...)` factory + `export type` read-only `SearchState` view (prefer the factory over exporting the mutable interface). Grep every `SearchState` construction so the factory is adopted, not bypassed. Add an `ai.test.ts` assertion that the exports exist and `quiesce`'s signature is stable. Verify `ai.ts` still typechecks and all existing `ai.test.ts` pass unchanged.
2. **Consume the Phase-1 encoding + contract types + victory oracle.** Import `canonicalKey`/`encodePosition` → stringified `PositionKey` and `Value`/`RootBounds`/`SolveResult`/`SolveProgress`/`ProvenCounts` from `core/solver`. Route terminality through `resolveVictory(state, resolvedRules, {...ctx, turnsElapsed})` (F1), NOT `evaluateObjective`. If Phase 1 lands after, develop against a local `contracts.ts` shim re-exporting the exact target signatures and swap the import at integration. **Do not invent a second encoding or a second terminal oracle.**
3. **`transpositionTable.ts`.** `Map`-backed TT, six-flag model, depth-preferred + proven-sticky replacement, `ttEntryLimit` eviction, `provenCounts()`. Unit-test put/get/replacement/eviction and that a `proven-*` flag is never overwritten by a shallower `bound`.
4. **`cycleDetection.ts` (`PathHistory`).** Incremental push/pop multiset keyed by the Phase-1 encoding; `repeats()` O(1). Unit-test a 3-position loop reports a repeat and push/pop symmetry.
5. **`proofNegamax.ts`.** Fork `ai.ts:negamax`, threading `path`, `tt`, proof-typed return: **TT probe first** (proven flag → return; bound flag at sufficient depth → tighten α/β); **terminal check** via the victory-rule oracle (F1) → `terminalScore` → `{ proof: winner-side, distancePlies: ply }`; **cycle check** `path.repeats(key)` → `{ proof: 'draw', value: 0 }` (**path-scoped — see GHI risk**); **depth 0** → exported `quiesce`, tagged `'bound'` (except a quiesce mate score → `'win'/'loss'` with `distancePlies`); **recurse** reusing `legalMoves`+`captureValue` ordering + the `sideInCheck` no-legal-move branch; aggregate children by the minimax proof rule (proven-win if *some* child proven-loss-for-opponent; proven-loss if *every* child proven-win-for-opponent; proven-draw if not winnable and ≥1 child proven-draw and none proven-win; else bound); **TT store** with flag/depth (**NOT the path-scoped cycle draws — GHI risk**); **emit** the five phase events.
6. **`idSearch.ts:runWeakSolve`.** Iterative deepening `1..∞` (bounded by `maxDepthPlies`/budgets), reusing the root-loop of `searchBestAction`: re-sort roots by previous depth's scores, full-window per root, **carry the TT across depths**. After each depth: recompute the contract `RootBounds`, update `bestLine`, call `onProgress` on a cadence. Stop when root is proven or any budget trips; return the accumulated `WeakSolveResult` regardless.
7. **Wire the feasibility-gate handoff.** Register `runWeakSolve` as `runSolve`'s `mode:'search'` branch (Phase 1 owns `runSolve`; Phase 4 supplies the search delegate — one dispatcher in `retrograde.ts`). The gate selects search-mode on `verdict ∈ {'hard','infeasible'}`.
8. **`pnSearch.ts` (optional).** PN₁ then PN² wrapper under `bounds.prover`; if deferred, a typed stub + skipped test.
9. **Phase-event stepper glue (`phaseEvents.ts:stepSearchWithPhases`).** Emit the five-phase trace (→ contract `SearchStep`); provide the coarse+micro-step split so Phase 2's viewer and the worker's recorded-trace replay consume one source.
10. **Determinism + budget audit.** No `Date.now()`/RNG leaks into the proof result (a *solve* uses strict argmax → `rng: null`); budgets checked on the `nodes & 1023` cadence.

### Tests

New Vitest under `frontend/src/core/solver/search/`, following `ai.test.ts` fixture idioms (node-bounded no-wall-clock determinism).
- **`cycleDetection.test.ts`**: a hand-built K-shuffle — `PathHistory` flags the repeat and `proofNegamax` returns `{ proof: 'draw' }`; push/pop symmetry.
- **`transpositionTable.test.ts`**: a `bound` at depth 2 then a `proven-win` — the proven entry survives a later shallower `bound` put (proven-sticky); eviction at `ttEntryLimit` keeps deepest/proven; `provenCounts()` matches.
- **`proofNegamax.test.ts`**: **forced mate-in-1 is proven** (`distancePlies===1`, root TT holds `proven-win`); **a drawn micro-board proves draw** (K-vs-K → `outcome==='draw'`, proven by cycle detection within a small node budget); **proof agrees with retrograde** on a shared tiny board (cross-check against Phase 1's retrograde on K+P vs K — same `Value` + win-distance — the strongest correctness guard); **reuse fidelity** (the poisoned-capture position — the weak-solver's leaf via exported `quiesce` declines identically); **victory-override terminality (F1)** — a `level.victory` board where the fork's terminal decision matches `resolveVictory`, not `evaluateObjective`; **GHI guard** — a position won on one line but reachable via a repetition on another must NOT be globally cached as drawn.
- **`idSearch.test.ts`**: **anytime monotonicity** (`proven` counts + `coverage.ttSize` non-decreasing, `RootBounds` never widens); **budget stop returns a usable partial** (`aborted===true`, `bestLine.length>0`, `rootBounds` finite, no throw/`null`); **determinism** (two `runWeakSolve` with identical bounds + `rng: null` → byte-identical `WeakSolveResult`).
- **`pnSearch.test.ts`** *(if implemented)*: PN proves the same forced win as αβ; `minDisproof` reaches `∞` on the disproven branch.
- Wire into the frontend Vitest suite; no backend/Postgres.

### Integration (produced / consumed)

- **Consumed**: the **Phase-1 position-encoding contract** (`encodePosition`/`canonicalKey` → stringified `PositionKey`, WITH `turnsElapsed` folded in where terminality is clock-dependent — F2/§position key contract clause 3, a hard requirement flagged to Phase 1) — both the TT and cycle detection key on it; the **victory-rule terminal oracle** (`resolveVictory` + `level.victory` — F1), NOT `evaluateObjective`; the **contract value/result types** (`Value`, `RootBounds`, `SolveResult`, `SolveProgress`, `ProvenCounts`, `SearchStep`) — `WeakSolveResult`/search progress assignable into the shared shapes; **Phase-1 `runSolve` dispatcher + `estimateFeasibility`**; existing engine (`ai.ts`, `rules.ts`, `objectives.ts`) reuse points.
- **Produced**: `runWeakSolve(...) → WeakSolveResult` — Phase 3's `solve-worker.mjs` calls this for `hard`/`infeasible` boards; `PhaseEvent` trace + `stepSearchWithPhases` — Phase 2's stepper renders `Generate→Order→Descend→Quiesce→BackUp`, the worker records for clustered replay; the **partial TT / proven-position store** — the anytime "partial tablebase" + tightening bounds, key-compatible with retrograde entries via the shared encoding **for path-independent values only** (see GHI risk).

### Risks / de-risking

- **Terminality must use `level.victory` (F1).** The existing `negamax`/`quiesce` call `evaluateObjective`, which ignores `level.victory`. The proof-tracking fork MUST route terminality through `resolveVictory(state, resolvedRules, ctx)`. The victory-override terminality test guards it. (This is the same F1 hazard as Phase 1, in the search path.)
- **Objective clock in the position key (correctness-critical, F2).** `survive`/`reach`-with-`turnLimit` make terminality depend on `turnsElapsed`. If the Phase-1 encoding omits it the TT conflates positions with different true values → wrong proofs. "Encoding folds in every terminality-affecting field" is an explicit Phase-1 contract requirement (§position key contract clause 3); a `proofNegamax.test.ts` case on a `survive` board where two identical boards at different `turnsElapsed` get different values guards it. For clock-inert objectives the key is pure `(pieces, side)`.
- **Loopy draws vs path-dependence (soundness — the GHI trap, applies to BOTH solvers).** Cycle detection is *path*-relative; the TT is *global*. A position proven drawn *on one path via repetition* is not unconditionally drawn. **De-risk:** repetition-derived draws are **path-scoped, non-TT** (do NOT write `proven-draw` to the global TT from a cycle hit); only write `proven-draw` to the TT when a position is drawn *independently of path* (all children proven-draw/loss with none winnable). **Cross-solver ruling:** a Phase-4 path-scoped draw and a Phase-1 retrograde *global* draw are the same `Value{outcome:'draw'}` under the same `PositionKey` ONLY for path-independent draws; a path-scoped cycle draw MUST NOT be looked up as equal to a retrograde tablebase entry. The "key compatibility" between the two stores is a feature for path-independent values and a hazard for path-scoped ones — this ruling keeps them separate. The GHI test guards it.
- **`ai.ts` export surface (coupling).** Prefer a `makeSearchState(...)` factory + `export type` read-only view; keep exports in one commented block; export-stability test (Task 1); grep every `SearchState` construction.
- **PN scope creep.** Ship αβ+TT+cycle fully first; PN behind `bounds.prover` with its own tests; stub if time-boxed.
- **Determinism drift.** `ai.ts`'s search is deterministic only with no time budget + `rng: null`. A wall-clock *solve* budget introduces machine-dependent stop points. **De-risk:** the *proof* content (which positions are proven + their values) is budget-independent and deterministic; only *how far it got* varies. Tests assert determinism under node budgets only; clustered runs persist their trace so replay is exact.
- **Node-budget explosion on `reach`/`survive` boards.** Iterative deepening caps per-iteration cost; the TT prevents re-expansion; `maxNodes`/`ttEntryLimit` are hard backstops; an unfinished solve still yields tightening bounds.
- **Encoding not yet written when Phase 4 starts.** Develop against a local `contracts.ts` shim exposing the exact target signatures; swap the import at integration; the shim is the single edit point, deleted on merge.

---

## Build sequence and dependencies

The four phases are each independently shippable (ADR "Build phases"), but they share a strict dependency spine.

**Stage 0 — Shared contracts (blocks everything).**
`frontend/src/core/solver/types.ts` + `types.test.ts`, and the `export type`/`export` re-export block appended to `frontend/src/trainer/engine.ts`. Every other file imports the contract types from here. Pure types + a handful of guards, no engine dependency.

**Stage 0.1 — Confirm ADR-0068 number + citations (F7).** ADR-0068 exists on this branch; its header flags the number as provisional (0063/0064 already collide). Fetch `origin/main`, reconcile the ADR number and every "ADR §N" citation against the file at merge (same discipline as migration 12). No new authoring needed — the ADR is written and Accepted (design).

**Stage 0.5 — Verify the trainer engine bundle output path (F3/ruling 7).**
The verified answer is **`frontend/trainer-bundle/engine.mjs`** (`vite.trainer.config.js` `outDir:'trainer-bundle'`+`entryFileNames:'engine.mjs'`, `Dockerfile:22`, `train-worker.mjs:17` imports `../frontend/trainer-bundle/engine.mjs`). The stale `dist-trainer` config comment is wrong. Re-confirm before Phase 3 wires the worker import; every worker import + bundle-export test uses this path.

**Stage 1 — Phase 1 pure engine (blocks Phases 2, 3, 4 for real functionality).**
`core/solver/{input,encode,feasibility,retrograde,ablation,index}.ts` implementing `estimateFeasibility`, `enumerateReachable`, `retrogradeSolve`, `runSolve`, `solveStepWithPhases` (all three ADR §6 entrypoints — F7), `pieceValuesByAblation`. **Parallelization unblock:** ship a stub `core/solver/index.ts` (throws `not-implemented`, but exports the real symbol names including `solveStepWithPhases`) at the *start* of Stage 1 so Phases 2 and 3 wire against the real import surface immediately.

**Stage 2 — Phases 2, 3, 4 in parallel (all depend on Stage 0 + the Stage-1 surface/stub).**
- **Phase 2 (stepper)** consumes `estimateFeasibility` + `solveStepWithPhases` + the `RetrogradeStep` trace; produces the Studio viewer (+ Run/Results mount points) + the `prefill`-able replay seam.
- **Phase 3 (cluster)** consumes `estimateFeasibility` + `runSolve` (via the bundle) + `spec`/`body` opaquely; produces `/api/solve-runs`, `solve_runs` (migration 12), `net/solveRuns.ts`, `SolveRuns.tsx`. Its Run-tab **mounts into Phase 2's tab shell** — a soft dependency (temporary branch if Phase 2's shell isn't landed).
- **Phase 4 (search)** consumes the Phase-1 encoding + the contract types + the victory oracle + `ai.ts` exports; registers `runSolve`'s `mode:'search'` branch; produces `runWeakSolve` + the `SearchStep` trace.

**Cross-phase edit-collision points (coordinate, don't clobber):**
- `frontend/src/trainer/engine.ts` — the contracts section (type re-exports) and Phase 3 (value re-exports of `estimateFeasibility`/`runSolve`) both append here. One combined block.
- `frontend/src/core/solver/index.ts` — Phase 1 owns it; Phase 4 adds `export * from './search/...'`. One barrel.
- `core/solver/retrograde.ts:runSolve` — Phase 1 owns the dispatcher; Phase 4 supplies the `mode:'search'` delegate. One function, two contributors.
- `core/ai.ts` — Phase 4 adds `export`s / a factory (zero behavior change); nobody else touches it.
- `ui/TilePreview.tsx` — Phase 2 owns the ten (symbol-anchored) Studio-registration edits; Phase 3's Run tab lives *inside* Phase 2's `SolverViewer`, not a second registration.

**Dependency summary (arrows = "must land first"):**
`types.ts` → `core/solver` engine (Stage 1) → { Phase 2 stepper, Phase 3 cluster, Phase 4 search }. Phase 4 `runWeakSolve` → Phase 3 worker's search-mode runs and Phase 2's search-phase panels (both consume it once it exists; neither blocks Phase 4's own landing). Phase 3's Run tab → Phase 2's tab shell (soft; temporary-branch fallback).

**Determinism spine (invariant across all stages):** a `SolveSpec` (with `seed`) replays a byte-identical trace in-browser and on the cluster — `rng.ts` seeded sampling only in feasibility's branching estimate, strict argmax (`rng: null`) in the solve, `legalMoves` deterministic order, slots sorted by stable id, `passableCells` row-major, zero RNG in enumeration/retrograde/proof content. Every phase's determinism test guards its slice.

---

## Definition of done per phase

### Shared contracts — done when:
- [ ] `frontend/src/core/solver/types.ts` exports `Value`, `Outcome`, `flipOutcome`, `FeasibilityReport` (incl. `enPassantUnsound`), `SolveVerdict`+`SOLVE_VERDICTS`, `SolveMode`+`SOLVE_MODES`, `SolveBounds`, `SolveSpec`, `ProvenCounts`, `RootBounds`, `SolveProgress`, `TablebaseRef`, `PieceValueEntry`, `PieceValueReport`, `SolveResult`, phase-name unions + `RETROGRADE_PHASES`/`SEARCH_PHASES`, `PositionKey`, `DecidedPosition`, `SolveStep`/`RetrogradeStep`/`SearchStep` + `isRetrogradeStep`/`isSearchStep`.
- [ ] The module imports only `import type` from `core/*`; runtime exports are `const` literal arrays + pure guards (no DOM, no engine logic).
- [ ] `types.test.ts` passes: JSON round-trip; `assertNever` exhaustiveness; guard partition + disjointness; `flipOutcome` involution; `draw`/`unknown` carry no `distancePlies`.
- [ ] `frontend/src/trainer/engine.ts` re-exports the solver types/const-arrays; the trainer bundle still builds DOM-free.

### Phase 1 (pure engine) — done when:
- [ ] `core/solver/{input,encode,feasibility,retrograde,ablation,index}.ts` implement `toSolverInput`, `encodePosition`/`decodePosition`/`canonicalKey`/`enumerateReachable`, `estimateFeasibility`, `retrogradeSolve` (+ `onSweep`), `runSolve` **and** `solveStepWithPhases` (all three §6 entrypoints exported from `index.ts`), `pieceValuesByAblation`.
- [ ] **Terminal detection uses `resolveVictory(state, level.victory ?? victoryRulesForObjective(...), ctx)` (F1)** + `applyMove`'s `winner` + the stuck-side `sideInCheck` rule — NOT `evaluateObjective`. `ctx` carries `kingSide` via the selfplay.ts:80 spread (F2) and per-position `turnsElapsed` where the objective needs it.
- [ ] The position key canonicalizes same-type/same-side pieces (§position key contract) and folds in `turnsElapsed` iff `clockMatters`; the backward pass iterates to a fixpoint with the no-premature-draw invariant, then runs undecided→draw.
- [ ] Vitest passes: **K vs K → draw**; **K+Q vs K → win** with the hand-computed `distancePlies`; **K+P vs K** queening-win + blockade-draw; **victory-override terminal test (F1)**; **kingSide terminal test (F2)**; encoding round-trips incl. **same-type canonicalization** + promotion; **fixpoint/no-premature-draw**; **en-passant refusal (F6)**; feasibility internal consistency + `verdict==='solvable'` on tiny boards; ablation flips on the decisive piece; determinism.
- [ ] `estimateFeasibility(breakLineLevel)` produces a finite `FeasibilityReport` (the ADR §2 Break-the-Line number); whether BtL strong-solves end-to-end is reported from a real run, not pre-asserted.
- [ ] En-passant-capable boards are REFUSED (`enPassantUnsound`, verdict ≠ `solvable`); `core/solver/*` imports nothing browser-only.

### Phase 2 (stepper) — done when:
- [ ] `lab/solver/{animationClock,phaseData,solverRunner,solverBuffer,useSolverStepper}.ts` implement the buffer/clock/hook idiom; `SolverRunner.runStepWithPhases()` (driving the engine's `solveStepWithPhases`) returns the five retrograde phases in order and `null` at convergence.
- [ ] `ui/Solver.tsx` (`SolverCatalog` + `SolverViewer` with Feasibility/Step/Run/Results/Glossary tabs), `ui/solver/{PhaseBar,SolverControls,HelpBar,phasePanels,FrontierBoard}.tsx` render with scoped `SOLVER_CSS` (no `colors.ts`); the board renders through `ViewPane` + `StudioReadOnlyBoard` with the `Propagate` frontier highlighted.
- [ ] The ten **symbol-anchored** `ui/TilePreview.tsx` edits are in: **clicking Catalog → Board Solver → "Open Solver" reaches the viewer** (ADR-0058), and `?mode=viewer&vk=solver&solvlvl=<id>` deep-links.
- [ ] Vitest passes: runner phase-order + determinism + snapshot round-trip + frontier monotonicity; buffer equivalence + `captureSteps` + bookkeeping; clock boundary ordering.
- [ ] Manual pass on K+P vs K and `off-l-break-line`: step all five phases, frontier animation, Back/redo, deterministic replay; screenshot via `npm run shot`.
- [ ] `useSolverStepper`'s buffer is `prefill`-swappable for a persisted-trace replay source; the Run/Results tabs are wired mount points for Phase 3.

### Phase 3 (cluster) — done when:
- [ ] Migration `version:12` (`solve_runs` + owner index) is in `MIGRATIONS` and `REQUIRED_SCHEMA_MIGRATION_VERSIONS` picks it up; the number is reconciled against latest `origin/main` before merge.
- [ ] `backend/solve/k8s.mjs` (`inCluster`/`createSolverJob`/`deleteSolverJob`) reuses `TRAINER_IMAGE`/`TRAINER_SA` + batch/v1 RBAC; the Job runs `node backend/solve-worker.mjs` on `workload=trainer` with memory-forward resources + `activeDeadlineSeconds:10800`/`backoffLimit:0`.
- [ ] `backend/solve-worker.mjs` imports from `../frontend/trainer-bundle/engine.mjs` (F3), patches feasibility first, runs `runSolve` with throttled `persist` (top-level key replacement), decides the tablebase sink (inline/blob/truncate via `serializeTablebase`), and finalizes `done`.
- [ ] DB helpers preserve the **two distinct projections (F4)** (`dbListSolveRuns` no `body`/`job_name`; `dbGetSolveRun` with them) + `dbCancelSolveRun`; `/api/solve-runs` POST/GET/GET:id/DELETE exist; **DELETE is cancel-not-purge** (delete Job, `status='cancelled'`, keep `body` — ruling 8).
- [ ] `frontend/src/trainer/engine.ts` re-exports `estimateFeasibility`/`runSolve`; `npm run build:trainer` produces `frontend/trainer-bundle/engine.mjs` that exports them and imports DOM-free in bare Node.
- [ ] `frontend/src/net/solveRuns.ts` (types from `core/solver`; `rootBounds: RootBounds` not a tuple; summary type has no `body`/`job_name` per F4) + `frontend/src/ui/SolveRuns.tsx` (`{ level }` prop shape — no `levelId`/`onAdopt` per F5; feasibility + progress + partial-tablebase readout, 6s detail poll, Cancel) exist and mount in the solver Run tab (or temporary branch).
- [ ] Tests pass: worker smoke on K+P vs K (stub then real — the local-runnable test); `createSolverJob` payload-shape; bundle-export function-presence + DOM-free; client method/path + summary-shape + `HttpError`. The Postgres-gated `solve_runs` CRUD is a **known CI-only** check (no Postgres on this Windows box).
- [ ] The tablebase blob sink is **optional in v1** (inline-or-truncate when `SOLVE_ARTIFACTS_URL` unset); the blob-write path + `SOLVE_ARTIFACTS_URL` + Data-Contributor role are Phase-3.5, not a v1 blocker.

### Phase 4 (search) — done when:
- [ ] `core/solver/search/{idSearch,proofNegamax,transpositionTable,cycleDetection,phaseEvents}.ts` implement `runWeakSolve` (anytime, iterative-deepening, TT carried across depths, contract `RootBounds`/`Value`/`ProvenCounts` in its result), `proofNegamax` (TT probe/store, cycle→draw, proof-vs-bound return, five phase events, victory-rule terminality per F1), the six-flag proven-sticky TT, `PathHistory`, and `stepSearchWithPhases`.
- [ ] `ai.ts` exports `quiesce`/`makeSearchState`(+`export type SearchState`)/`captureValue`/`terminalScore`/`outOfBudget` with **zero behavior change**; all existing `ai.test.ts` pass; an export-stability assertion is added.
- [ ] `runSolve`'s `mode:'search'` branch delegates to `runWeakSolve`; the feasibility gate routes `'hard'|'infeasible'` here.
- [ ] The TT/cycle keys use the **Phase-1 encoding** with `turnsElapsed` folded in where terminality is clock-dependent (F2); **repetition-derived draws are path-scoped (NOT written to the global TT), and a path-scoped cycle draw is never looked up as equal to a retrograde tablebase draw** (GHI ruling).
- [ ] Vitest passes: cycle-detection draw + push/pop symmetry; TT proven-sticky + eviction; **mate-in-1 proven** (`distancePlies===1`); **K-vs-K proven draw**; **proof agrees with retrograde** on a shared tiny board; poisoned-capture reuse fidelity; **victory-override terminality (F1)**; **GHI guard**; anytime monotonicity (bounds never widen); budget-stop usable partial; determinism under node budgets.
- [ ] PN (`pnSearch.ts`) is either implemented behind `bounds.prover` with passing tests, or a typed `not-implemented` stub + skipped test (explicitly optional).
