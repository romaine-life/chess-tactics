// Board solver — the public engine surface (ADR-0068 §6). The barrel Phase 2 (stepper),
// Phase 3 (cluster worker + client), and Phase 4 (search mode) import. Exports all three
// ADR §6 entrypoints: estimateFeasibility, runSolve, solveStepWithPhases.

export type * from './types';
export {
  flipOutcome, isRetrogradeStep, isSearchStep,
  RETROGRADE_PHASES, SEARCH_PHASES, SOLVE_VERDICTS, SOLVE_MODES,
} from './types';

export { estimateFeasibility } from './feasibility';

export { enumerateReachable, encodePosition, decodePosition, canonicalKey, clockOfKey, positionFromState } from './encode';
export type { SolverPosition, PositionSpace } from './encode';

export { retrogradeSolve, runSolve, solveStepWithPhases, registerSearchRunner } from './retrograde';
export type { SolveResultInternal } from './retrograde';

export { pieceValuesByAblation, ablationToReport } from './ablation';
export type { AblationResult } from './ablation';

export { toSolverInput, terminalOutcome } from './input';
export type { SolverInput, PieceSlot } from './input';

// Phase 4 (search mode). Importing this barrel registers the `mode:'search'` delegate with
// runSolve (search/index.ts side effect), so a `hard`/`infeasible` board routes to the weak
// solver without extra wiring. One barrel; Phase 1 owns the file, Phase 4 appends here.
export {
  runWeakSolve, weakBoundsFromSolveBounds, weakResultToSolveResult,
  proofNegamax, makeProofSearchState, proofToValue,
  TranspositionTable, PROVEN_DEPTH, PathHistory,
  stepSearchWithPhases, toSearchStep, backUpEvent, runProofNumberSolve,
} from './search';
export type {
  WeakSolveBounds, WeakSolveResult, ProofBackedValue, ProofSearchState,
  TTFlag, TTEntry, PhaseEvent, PhaseEmit,
} from './search';
