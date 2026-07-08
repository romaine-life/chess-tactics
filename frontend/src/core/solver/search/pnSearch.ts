// Board solver — Proof-Number Search (ADR-0068 §1 "PN/PN²"), the specialist prover for a
// stubborn win/loss (its proof/disproof numbers double as a "how close to a proof" signal).
//
// OPTIONAL for Phase 4 (the plan ships αβ+TT+cycle first; PN is behind `bounds.prover`,
// default 'ab'). Not yet implemented — a typed stub so `bounds.prover: 'pn' | 'pn2'` has a
// real symbol to route to and the surface is stable for a later pass. The αβ weak-solver
// (idSearch.runWeakSolve) is the shipped, tested prover.

import type { SolverInput } from '../input';
import type { WeakSolveBounds, WeakSolveResult } from './idSearch';

/** PN / PN² prover. Not implemented in this cut — throws so a caller that opts into `prover:'pn'`
 * fails loudly rather than silently falling back. runSolve routes only `prover:'ab'` (the default)
 * to idSearch; `runSolve` never selects PN, so this never runs in production paths. */
export function runProofNumberSolve(_input: SolverInput, _bounds: WeakSolveBounds): WeakSolveResult {
  throw new Error('solver: proof-number search (pnSearch) not implemented — use prover:"ab" (the default)');
}
