// Board solver — search-mode barrel (ADR-0068 Phase 4). Re-exports the weak-solver surface
// and supplies the `mode:'search'` delegate that Phase-1's `runSolve` dispatches to.
//
// runSolve (retrograde.ts) owns the dispatcher; this module supplies the search runner via
// `registerSearchRunner`. Importing this barrel (the parent solver barrel does) registers the
// delegate as a side effect, so `runSolve(level, bounds)` on a `hard`/`infeasible` board routes
// here without the caller wiring anything. The adapter maps the contract SolveBounds → the
// internal WeakSolveBounds and the WeakSolveResult → the public SolveResult.

import type { Level } from '../../level';
import type { SolveBounds, SolveResult, SolveProgress } from '../types';
import { registerSearchRunner } from '../retrograde';
import { toSolverInput } from '../input';
import { pieceValuesByAblation, ablationToReport } from '../ablation';
import { runWeakSolve, DEFAULT_MAX_DEPTH, type WeakSolveBounds, type WeakSolveResult } from './idSearch';

export { runWeakSolve } from './idSearch';
export type { WeakSolveBounds, WeakSolveResult } from './idSearch';
export {
  proofNegamax, makeProofSearchState, proofToValue,
  type ProofBackedValue, type ProofSearchState,
} from './proofNegamax';
export { TranspositionTable, PROVEN_DEPTH, type TTFlag, type TTEntry } from './transpositionTable';
export { PathHistory } from './cycleDetection';
export {
  stepSearchWithPhases, toSearchStep, backUpEvent,
  type PhaseEvent, type PhaseEmit,
} from './phaseEvents';
export { runProofNumberSolve } from './pnSearch';

/** Derive the search-mode-internal bounds from the contract SolveBounds (states + bytes).
 * The node ceiling is `maxStates`; ttEntryLimit is sized under the memory cap (a coarse
 * bytes-per-TT-entry estimate). `prover` defaults 'ab'.
 *
 * `wallClockMs` is deliberately NOT forwarded: the driver's in-loop budget is node-count ONLY, so
 * that identical (level, bounds) produce byte-identical proof content (the determinism contract — a
 * `Date.now()` stop would flip `rootValue`/`rootBounds`/`complete` run-to-run near a boundary). The
 * real-time ceiling is honored outside the deterministic loop (the Phase-3 Job `activeDeadlineSeconds`
 * plus the hard `maxStates` cap that bounds termination). */
export function weakBoundsFromSolveBounds(bounds: SolveBounds): WeakSolveBounds {
  const TT_BYTES_PER_ENTRY = 64; // key string + entry object, coarse.
  return {
    maxNodes: bounds.maxStates,
    ttEntryLimit: Math.max(1, Math.floor(bounds.maxMemoryBytes / TT_BYTES_PER_ENTRY)),
    prover: 'ab',
  };
}

/** Map the anytime WeakSolveResult into the public contract SolveResult. `complete` iff the root
 * was PROVEN (a weak solve is "complete" when the root value is settled — ADR §1). Ablation runs
 * post-solve, best-effort, only when the root proved (otherwise there is no baseline to measure). */
export function weakResultToSolveResult(res: WeakSolveResult, level: Level, remainingBounds: SolveBounds): SolveResult {
  const complete = res.rootBounds.proven;
  const provenCount = res.proven.win + res.proven.loss + res.proven.draw;

  let pieceValues: SolveResult['pieceValues'];
  if (complete) {
    // Ablation is the shared enumerate+retrograde pass (pieceValuesByAblation has NO search-mode
    // path). It is meaningful for a search board small enough that each ablated variant STILL fits
    // the enumerate budget; a genuinely-hard board (reached search mode BECAUSE it is too big to
    // enumerate) truncates every ablated re-solve, so `ablationToReport` returns a shape-valid but
    // effectively-empty report (baseline unknown, `partial:true`). That is the honest best-effort
    // outcome — it is gated on `complete`, so it never affects the anytime partial guarantee.
    const ablation = pieceValuesByAblation(level, remainingBounds, 0);
    pieceValues = ablationToReport(ablation, res.rootValue, level);
  }

  return {
    rootValue: res.rootValue,
    complete,
    provenCount,
    proven: res.proven,
    rootBounds: res.rootBounds,
    // Coverage mirrors the streamed SolveProgress semantics (depth/maxDepth); divide by the SAME
    // DEFAULT_MAX_DEPTH the driver deepens to, so the final result and the last progress tick agree.
    coveragePct: res.rootBounds.proven ? 100 : Math.min(99, 100 * (res.coverage.ttSize > 0 ? Math.min(1, res.completedDepth / DEFAULT_MAX_DEPTH) : 0)),
    pieceValues,
    mode: 'search',
  };
}

/** The `mode:'search'` delegate registered with runSolve. Builds the input, runs the anytime
 * weak-solve, and assembles a well-formed SolveResult at any stop (the anytime guarantee). */
function searchRunner(level: Level, bounds: SolveBounds, onProgress?: (p: SolveProgress) => void): SolveResult {
  const startedAt = Date.now();
  const input = toSolverInput(level, 0);
  const weakBounds = weakBoundsFromSolveBounds(bounds);
  const res = runWeakSolve(input, weakBounds, onProgress);

  const elapsedMs = Date.now() - startedAt;
  const remaining: SolveBounds = {
    wallClockMs: Math.max(0, bounds.wallClockMs - elapsedMs),
    maxStates: bounds.maxStates,
    maxMemoryBytes: bounds.maxMemoryBytes,
  };
  return weakResultToSolveResult(res, level, remaining);
}

// Register the delegate as an import side effect (idempotent — last registration wins).
registerSearchRunner(searchRunner);
