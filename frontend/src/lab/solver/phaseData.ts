// Per-phase view-models for the solver stepper (mirrors bender-world's engine/phase-data.ts).
// These ADAPT the contract SolveStep trace (core/solver/types.ts) into panel-ready form —
// a 1:1 mapping from the contract union, never a redefinition of its semantics.
//
// Divergence from bender (documented in the plan): bender's five phases all fire on every
// step, so its PhaseStepData is a total record. The solver's phases are heterogeneous and
// non-simultaneous — one SolveStep IS one phase — so SolverPhaseData is a PARTIAL record
// keyed by phase, with exactly ONE key set per step. The exhaustive switch in
// `phaseDataFromStep` drains into `assertNever`, so a new SolveStep variant is a compile
// error here (the plan's drift guard), not a silently-empty panel.

import type {
  DecidedPosition, OrderedMove, PieceValueReport, PositionKey, ProvenCounts, RootBounds,
  SearchWindow, SolvePhaseName, SolveStep, Value,
} from '../../core/solver';
import { RETROGRADE_PHASES, SEARCH_PHASES } from '../../core/solver';

/** Exhaustiveness tail — a reachable call means a SolveStep variant escaped every case. */
export function assertNever(x: never): never {
  throw new Error(`unreachable SolveStep variant: ${JSON.stringify(x)}`);
}

// ─── Phase enums + labels (the PhaseBar's segments) ─────────────────────────────────────

export enum SolverPhase { Enumerate = 0, SeedTerminals = 1, Propagate = 2, Converge = 3, ReadValue = 4 }
export const PHASE_COUNT = 5;
/** Human labels for the retrograde PhaseBar, index-aligned with RETROGRADE_PHASES. */
export const PHASE_LABELS = ['Enumerate', 'Seed terminals', 'Propagate', 'Converge', 'Read value'] as const;
/** Human labels for the search PhaseBar, index-aligned with SEARCH_PHASES. */
export const SEARCH_PHASE_LABELS = ['Generate', 'Order', 'Descend', 'Quiesce', 'Back up'] as const;

/** PhaseBar segment index (0..4) of a phase name within ITS vocabulary. Both vocabularies
 * are five-segment bars; which bar to draw comes from the step's `kind` / the view's mode. */
export function phaseIndexOfName(phase: SolvePhaseName): number {
  const retro = (RETROGRADE_PHASES as readonly string[]).indexOf(phase);
  if (retro >= 0) return retro;
  return (SEARCH_PHASES as readonly string[]).indexOf(phase);
}

/** PhaseBar segment index of one step. */
export function phaseIndexOf(step: SolveStep): number {
  return phaseIndexOfName(step.phase);
}

// ─── Retrograde per-phase view-models ───────────────────────────────────────────────────

export interface EnumeratePhaseData {
  statesEnumerated: number;
  /** The position under expansion, when the emitter attached one. */
  current?: { key: PositionKey; branching: number };
}

export interface SeedTerminalsPhaseData {
  terminalCount: number;
  /** Terminal positions decided at distance 0 (the frontier seeds). */
  seeded: DecidedPosition[];
  /** Census of ALL terminals (decisive + stalemate-like draws), proven at seed time. */
  seedCounts?: ProvenCounts;
}

export interface PropagatePhaseData {
  sweepIndex: number;
  /** Each entry may carry its own WHY: `witnessMove` (win) / `successorCensus` (both rules) —
   * the per-position back-up arithmetic, no aggregate guessing. */
  frontier: DecidedPosition[];
  newlyWon: number;
  newlyLost: number;
  remainingUnknown: number;
}

export interface ConvergePhaseData {
  sweepIndex: number;
  decidedThisSweep: number;
  reachedFixpoint: boolean;
  /** CUMULATIVE census through this sweep (draws stay at the terminal count until the drain). */
  proven: ProvenCounts;
  /** At the fixpoint: how many still-unknown positions the drain just labelled DRAW. */
  drainedToDraw?: number;
}

export interface ReadValuePhaseData {
  rootValue: Value;
  pieceValues: PieceValueReport | null;
}

// ─── Search per-phase view-models ───────────────────────────────────────────────────────

export interface GeneratePhaseData {
  window: SearchWindow;
  line: OrderedMove[];
  generated: number;
}

export interface OrderPhaseData {
  window: SearchWindow;
  ordered: OrderedMove[];
  ttHit?: { key: PositionKey; value: Value };
}

export interface DescendPhaseData {
  window: SearchWindow;
  into: OrderedMove;
  line: OrderedMove[];
}

export interface QuiescePhaseData {
  window: SearchWindow;
  standPat: number;
  pending: OrderedMove[];
}

export interface BackUpPhaseData {
  window: SearchWindow;
  childValue: Value;
  cutoff: boolean;
  rootBounds?: RootBounds;
}

/** The partial per-phase record a panel reads. Exactly ONE key is set per step. */
export interface SolverPhaseData {
  enumerate?: EnumeratePhaseData;
  seedTerminals?: SeedTerminalsPhaseData;
  propagate?: PropagatePhaseData;
  converge?: ConvergePhaseData;
  readValue?: ReadValuePhaseData;
  generate?: GeneratePhaseData;
  order?: OrderPhaseData;
  descend?: DescendPhaseData;
  quiesce?: QuiescePhaseData;
  backUp?: BackUpPhaseData;
}

/** Map one contract SolveStep into its panel view-model. Exhaustive over every variant. */
export function phaseDataFromStep(step: SolveStep): SolverPhaseData {
  if (step.kind === 'retrograde') {
    switch (step.phase) {
      case 'Enumerate':
        return {
          enumerate: {
            statesEnumerated: step.enumerated,
            ...(step.current ? { current: { key: step.current.key, branching: step.current.branching } } : {}),
          },
        };
      case 'SeedTerminals':
        return {
          seedTerminals: {
            terminalCount: step.totalTerminals,
            seeded: step.seeded,
            ...(step.seedCounts ? { seedCounts: step.seedCounts } : {}),
          },
        };
      case 'Propagate': {
        let newlyWon = 0;
        let newlyLost = 0;
        for (const d of step.newlyDecided) {
          if (d.value.outcome === 'win') newlyWon += 1;
          else if (d.value.outcome === 'loss') newlyLost += 1;
        }
        return {
          propagate: {
            sweepIndex: step.sweep,
            frontier: step.newlyDecided,
            newlyWon,
            newlyLost,
            remainingUnknown: step.remainingUnknown,
          },
        };
      }
      case 'Converge':
        return {
          converge: {
            sweepIndex: step.sweep,
            decidedThisSweep: step.decidedThisSweep,
            reachedFixpoint: step.atFixpoint,
            proven: step.proven,
            ...(step.drainedToDraw !== undefined ? { drainedToDraw: step.drainedToDraw } : {}),
          },
        };
      case 'ReadValue':
        return { readValue: { rootValue: step.rootValue, pieceValues: step.pieceValues ?? null } };
      default:
        return assertNever(step);
    }
  }
  switch (step.phase) {
    case 'Generate':
      return { generate: { window: step.window, line: step.line, generated: step.generated } };
    case 'Order':
      return { order: { window: step.window, ordered: step.ordered, ...(step.ttHit ? { ttHit: step.ttHit } : {}) } };
    case 'Descend':
      return { descend: { window: step.window, into: step.into, line: step.line } };
    case 'Quiesce':
      return { quiesce: { window: step.window, standPat: step.standPat, pending: step.pending } };
    case 'BackUp':
      return {
        backUp: {
          window: step.window,
          childValue: step.childValue,
          cutoff: step.cutoff,
          ...(step.rootBounds ? { rootBounds: step.rootBounds } : {}),
        },
      };
    default:
      return assertNever(step);
  }
}
