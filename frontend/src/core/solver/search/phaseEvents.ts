// Board solver — the search-mode phase event vocabulary (ADR-0068 Phase 4 / §7).
//
// The αβ decision at a node decomposes into five watchable phases the Phase-2 stepper renders
// and the Phase-3 worker records: Generate → Order → Descend → Quiesce → BackUp (ADR §7). The
// solver emits a `PhaseEvent` per phase; these map 1:1 to the contract `SearchStep` variants at
// the boundary the stepper/worker consume — so there is ONE source of truth for the trace.
//
// PhaseEvent === the contract SearchStep here (the fields already match types.ts exactly), so
// the mapping is the identity. Keeping a named alias documents the seam and lets a future emitter
// carry engine-internal extras without widening the wire type.

import type { RootBounds, SearchStep, SearchWindow, SolveStep, Value } from '../types';
import type { SolverInput } from '../input';
import { runWeakSolve, type WeakSolveBounds } from './idSearch';

/** The event the search emits per phase. Structurally the contract `SearchStep` (they share
 * every field), so `toSearchStep` is the identity — the alias marks the phase-trace seam. */
export type PhaseEvent = SearchStep;

/** The sink the proof search calls once per phase (no-op when the caller wants no trace). */
export type PhaseEmit = (ev: PhaseEvent) => void;

/** Map an emitted PhaseEvent to the contract SearchStep the stepper/worker consume. Identity
 * today (the shapes are equal); the indirection is the documented conversion boundary. */
export function toSearchStep(ev: PhaseEvent): SearchStep {
  return ev;
}

/** A BackUp event carrying the tightened root bounds — the headline the Run dashboard reads. */
export function backUpEvent(window: SearchWindow, childValue: Value, cutoff: boolean, rootBounds?: RootBounds): PhaseEvent {
  return { kind: 'search', phase: 'BackUp', window, childValue, cutoff, rootBounds };
}

/**
 * The phase-decomposed stepper the Phase-2 UI drives and the worker replays (ADR §7). It runs
 * the anytime weak-solve while collecting every emitted phase event, then yields them as contract
 * `SolveStep`s in order — the SAME five-phase trace whether stepped live in-browser or replayed
 * from a persisted cluster trace. A coarse `stepNode()` internally is the buffered emit sink; here
 * the collect-then-yield form gives the deterministic ordered stream the stepper consumes.
 *
 * Kept lazy (a generator) so a UI can pull one phase at a time. `bounds` caps the underlying solve
 * so the trace is finite even on a loopy board.
 */
export function* stepSearchWithPhases(input: SolverInput, bounds: WeakSolveBounds): Generator<SolveStep, void, void> {
  const steps: SearchStep[] = [];
  runWeakSolve(input, bounds, undefined, (ev) => { steps.push(ev); });
  for (const step of steps) yield toSearchStep(step);
}
