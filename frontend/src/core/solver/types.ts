// Shared contracts for the board solver (ADR-0068). The single source of truth for
// every interface exchanged across the solver's phases: feasibility estimator,
// retrograde strong-solver, search weak-solver, interactive stepper, cluster worker,
// DB body patches, the polling client (net/solveRuns.ts), and every panel component.
//
// Pure, DOM-free, dependency-light: types + `const` literal arrays + narrowing helpers
// only, no engine logic. Because the streamed SolveProgress shape is patched into a
// Postgres JSONB `body` and re-read by a polling client (ADR §5), EVERY type here is
// JSON-serializable — no class instances, functions, Map/Set, or bigint on the wire.
// `import type` only from core, so nothing here pulls runtime code into any bundle.

import type { Level, ObjectiveType, VictoryRules } from '../level';
import type { BoardSize, GameState, Move, PieceType, Side, Winner } from '../types';
import type { ObjectiveContext } from '../objectives';

// ─── Game-theoretic value (ADR §1, DTM-style) ──────────────────────────────────────

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

// ─── Feasibility (ADR §2/§4) ────────────────────────────────────────────────────────

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

// ─── Mode, bounds, spec (ADR §4/§5) ─────────────────────────────────────────────────

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

// ─── Streamed progress (ADR §3/§5) ──────────────────────────────────────────────────

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

// ─── Result, tablebase ref, piece values (ADR §1/§3/§5) ─────────────────────────────

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

// ─── Phase names + stepper SolveStep unions (ADR §7) ────────────────────────────────

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
  /** WHY this position is a WIN — the witness move into the proven loss-for-opponent child
   * that sets the DTM (`value.distancePlies` = childValue.distancePlies + 1). Attached by the
   * emitter on sampled frontier wins at distance ≥ 1 (terminals are decided by the rules, not
   * the back-up rule, and carry no witness). */
  witnessMove?: { pieceId: string; move: Move; childKey: PositionKey; childValue: Value };
  /** Census of this position's legal moves by the FINAL proven value of the position each one
   * reaches — the back-up rule's arithmetic made visible. For a LOSS every move is an
   * `opponentWins` edge and `bestDefenceDTM` (the max child DTM) sets the distance
   * (`value.distancePlies` = bestDefenceDTM + 1). Attached with `witnessMove` (distance ≥ 1). */
  successorCensus?: {
    moves: number;
    /** Moves into positions the OPPONENT (to move there) provably wins — bad for the mover. */
    opponentWins: number;
    /** Moves into positions the opponent provably LOSES — each one a winning move here. */
    opponentLosses: number;
    /** Moves into proven draws. */
    draws: number;
    /** LOSS only: the max child DTM — the best defence the loser can put up. */
    bestDefenceDTM?: number;
  };
}

export type RetrogradeStep =
  | { kind: 'retrograde'; phase: 'Enumerate';
      enumerated: number;
      current?: { key: PositionKey; state?: GameState; branching: number }; }
  | { kind: 'retrograde'; phase: 'SeedTerminals';
      seeded: DecidedPosition[]; totalTerminals: number;
      /** Census of the terminal seeds (decisive wins/losses at DTM 0 + stalemate-like draws) —
       * proven at seed time, so the running "proven so far" story starts here. */
      seedCounts?: ProvenCounts; }
  | { kind: 'retrograde'; phase: 'Propagate';
      sweep: number; newlyDecided: DecidedPosition[]; remainingUnknown: number; }
  | { kind: 'retrograde'; phase: 'Converge';
      sweep: number; decidedThisSweep: number; atFixpoint: boolean; proven: ProvenCounts;
      /** At the fixpoint only: how many still-undecided positions the undecided→draw drain
       * labels DRAW (the loopy-game resolution, F8). `proven.draw` already includes them. */
      drainedToDraw?: number; }
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
