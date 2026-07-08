// Solver PhaseBar — the phase-pipeline strip (port of bender-world's PhaseBar.tsx, restyled
// as Studio chrome via SOLVER_CSS classes; chess-tactics has no colors.ts). Segment identity
// and count come straight from the CONTRACT phase arrays (RETROGRADE_PHASES / SEARCH_PHASES
// in core/solver/types.ts), so an engine phase rename/reorder can never leave a stale bar;
// the human labels are the lab's index-aligned PHASE_LABELS / SEARCH_PHASE_LABELS.
//
// Divergence from bender (documented in the plan): bender's five phases live INSIDE one
// micro-step, so its bar is click-to-navigate; here one SolveStep IS one phase, so the bar
// is a read-only "where in the pipeline am I" light — current glowing, past dimmed. In
// retrograde the pipeline LOOPS Propagate⇄Converge until the fixpoint: while looping, both
// loop segments stay half-lit (neither is "passed" — each will fire again) and the labels
// carry a ⇄ mark, so the bar never claims a phase is done that is about to run again.

import type { ReactElement } from 'react';
import { RETROGRADE_PHASES, SEARCH_PHASES } from '../../core/solver';
import type { SolveMode, SolvePhaseName } from '../../core/solver';
import { PHASE_LABELS, SEARCH_PHASE_LABELS, phaseIndexOfName } from '../../lab/solver/phaseData';

/** One accent per pipeline slot — muted Studio accents, not bender's Futurama palette. */
export const PHASE_COLORS = ['#46d6b8', '#d9b871', '#9db8e8', '#c39be0', '#8fce9b'] as const;

const RETRO_HELP: readonly string[] = [
  'Enumerate: list every position reachable from the root — the state space the induction will label.',
  'Seed terminals: positions where the game is already over get their proven value at distance 0.',
  'Propagate: one backward-induction layer — the some-move-wins / all-moves-lose rules decide the next DTM layer. Loops with Converge until the fixpoint.',
  'Converge: fixpoint check — when the frontier drains, everything still unknown is a proven DRAW. Loops with Propagate until then.',
  'Read value: the root position’s entry in the finished tablebase IS the board’s value under perfect play.',
];
const SEARCH_HELP: readonly string[] = [
  'Generate: list the legal moves at the current node.',
  'Order: sort captures first (most-valuable-victim) so short mates are proven early.',
  'Descend: recurse into the next child — the tree walk itself.',
  'Quiesce: at the depth horizon resolve captures only, never score mid-exchange.',
  'Back up: fold the child’s value into the node (negamax, full-width — no cutoff, exact distances).',
];

export function SolverPhaseBar({
  mode,
  phase,
  stepCount,
  sweepIndex,
  searchDepth,
  atFixpoint,
  hasData,
}: {
  /** Which vocabulary's pipeline to draw (null before a build ⇒ retrograde shown dimmed). */
  mode: SolveMode | null;
  phase: SolvePhaseName | null;
  stepCount: number;
  sweepIndex: number;
  /** Current αβ window depth (search mode). */
  searchDepth: number | null;
  /** Retrograde: true once the fixpoint Converge landed — ends the loop display. */
  atFixpoint: boolean;
  hasData: boolean;
}): ReactElement {
  const isSearch = mode === 'search';
  const names: readonly string[] = isSearch ? SEARCH_PHASES : RETROGRADE_PHASES;
  const labels: readonly string[] = isSearch ? SEARCH_PHASE_LABELS : PHASE_LABELS;
  const helps: readonly string[] = isSearch ? SEARCH_HELP : RETRO_HELP;
  const currentIndex = phase !== null && hasData ? phaseIndexOfName(phase) : -1;
  // The Propagate(2)⇄Converge(3) loop: while unconverged, neither loop segment is "passed".
  const looping = !isSearch && hasData && !atFixpoint && (currentIndex === 2 || currentIndex === 3);

  return (
    <div
      className="solver-phasebar"
      style={{ opacity: hasData ? 1 : 0.45 }}
      data-help={isSearch
        ? 'The search pipeline: Generate → Order → Descend → Quiesce → Back up, walked once per node as the tree is explored. The current phase glows.'
        : 'The retrograde pipeline: Enumerate → Seed terminals → then Propagate ⇄ Converge loop sweep by sweep until the fixpoint → Read value. While looping, both loop segments stay half-lit — neither is finished until the fixpoint.'}
    >
      <div className="solver-phasebar-counters">
        <span className="solver-counter"><em>Step</em><b>{stepCount}</b></span>
        {isSearch
          ? <span className="solver-counter" data-help="The current αβ window's remaining depth — how many plies this node may still look ahead."><em>Depth</em><b>{searchDepth ?? 0}</b></span>
          : <span className="solver-counter" data-help="The backward-induction sweep number. Sweep d decides exactly the positions at DTM d."><em>Sweep</em><b>{sweepIndex}</b></span>}
      </div>
      <div className="solver-phasebar-track">
        <div className="solver-phasebar-segs">
          {names.map((name, i) => {
            const color = PHASE_COLORS[i] ?? PHASE_COLORS[0];
            const isCurrent = i === currentIndex;
            const isLoopPartner = looping && (i === 2 || i === 3) && !isCurrent;
            const isPast = !isLoopPartner && currentIndex > i;
            return (
              <div
                key={name}
                className="solver-phasebar-seg"
                title={isLoopPartner ? `${name} (loops until the fixpoint)` : name}
                data-help={helps[i]}
                style={{
                  background: isCurrent ? color : isLoopPartner ? `${color}77` : isPast ? `${color}55` : '#1a222c',
                  boxShadow: isCurrent ? `0 0 8px ${color}99` : 'none',
                }}
              />
            );
          })}
        </div>
        <div className="solver-phasebar-labels">
          {names.map((name, i) => {
            const color = PHASE_COLORS[i] ?? PHASE_COLORS[0];
            const isCurrent = i === currentIndex;
            const isLoopPartner = looping && (i === 2 || i === 3) && !isCurrent;
            const isPast = !isLoopPartner && currentIndex > i;
            const loopMark = !isSearch && (i === 2 || i === 3) && looping ? ' ⇄' : '';
            return (
              <div
                key={name}
                style={{
                  color: isCurrent ? color : isLoopPartner ? `${color}bb` : isPast ? `${color}88` : '#5c6875',
                  fontWeight: isCurrent ? 700 : 400,
                }}
              >
                {(labels[i] ?? name) + loopMark}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
