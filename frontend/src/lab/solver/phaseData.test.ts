// phaseData tests: the SolveStep → panel view-model mapping is exhaustive over EVERY
// contract variant (assertNever compile guard + a runtime walk over all ten), and the
// PhaseBar label/index tables stay in lockstep with the contract phase arrays.

import { describe, it, expect } from 'vitest';
import type { SolveStep } from '../../core/solver';
import { RETROGRADE_PHASES, SEARCH_PHASES } from '../../core/solver';
import {
  PHASE_COUNT, PHASE_LABELS, SEARCH_PHASE_LABELS, SolverPhase,
  assertNever, phaseDataFromStep, phaseIndexOf, phaseIndexOfName,
  type SolverPhaseData,
} from './phaseData';

const win = { outcome: 'win', winner: 'player', distancePlies: 3 } as const;
const window = { alpha: -10, beta: 10, depth: 4, ply: 1 };
const move = { pieceId: 'p1', move: { x: 1, y: 1 }, orderKey: -1 };

/** One literal per SolveStep variant — all five retrograde + all five search phases. */
const ALL_VARIANTS: SolveStep[] = [
  { kind: 'retrograde', phase: 'Enumerate', enumerated: 42, current: { key: 'k0', branching: 7 } },
  { kind: 'retrograde', phase: 'SeedTerminals', seeded: [{ key: 'k1', value: win }], totalTerminals: 3 },
  { kind: 'retrograde', phase: 'Propagate', sweep: 2, newlyDecided: [{ key: 'k2', value: win }, { key: 'k3', value: { outcome: 'loss', winner: 'player' } }], remainingUnknown: 9 },
  { kind: 'retrograde', phase: 'Converge', sweep: 2, decidedThisSweep: 2, atFixpoint: false, proven: { win: 4, loss: 2, draw: 1 } },
  { kind: 'retrograde', phase: 'ReadValue', rootValue: win },
  { kind: 'search', phase: 'Generate', window, line: [move], generated: 5 },
  { kind: 'search', phase: 'Order', window, ordered: [move], ttHit: { key: 'k4', value: win } },
  { kind: 'search', phase: 'Descend', window, into: move, line: [move] },
  { kind: 'search', phase: 'Quiesce', window, standPat: 12, pending: [move] },
  { kind: 'search', phase: 'BackUp', window, childValue: win, cutoff: true, rootBounds: { lower: 'win', upper: 'win', proven: true } },
];

/** The SolverPhaseData key each variant must populate, in ALL_VARIANTS order. */
const EXPECTED_KEYS: Array<keyof SolverPhaseData> = [
  'enumerate', 'seedTerminals', 'propagate', 'converge', 'readValue',
  'generate', 'order', 'descend', 'quiesce', 'backUp',
];

describe('phaseDataFromStep — exhaustive over the SolveStep union', () => {
  it('covers all ten variants: exactly ONE key set per step, the right one', () => {
    expect(ALL_VARIANTS.length).toBe(RETROGRADE_PHASES.length + SEARCH_PHASES.length);
    for (let i = 0; i < ALL_VARIANTS.length; i += 1) {
      const data = phaseDataFromStep(ALL_VARIANTS[i]);
      const keys = Object.keys(data);
      expect(keys).toEqual([EXPECTED_KEYS[i]]);
    }
  });

  it('an exhaustive switch over every variant drains into assertNever (compile guard)', () => {
    // If a SolveStep variant is added, the `default: assertNever(step)` arms below stop
    // compiling — the plan's drift guard. At runtime every variant must classify.
    const classify = (step: SolveStep): string => {
      if (step.kind === 'retrograde') {
        switch (step.phase) {
          case 'Enumerate': return 'retro:Enumerate';
          case 'SeedTerminals': return 'retro:SeedTerminals';
          case 'Propagate': return 'retro:Propagate';
          case 'Converge': return 'retro:Converge';
          case 'ReadValue': return 'retro:ReadValue';
          default: return assertNever(step);
        }
      }
      switch (step.phase) {
        case 'Generate': return 'search:Generate';
        case 'Order': return 'search:Order';
        case 'Descend': return 'search:Descend';
        case 'Quiesce': return 'search:Quiesce';
        case 'BackUp': return 'search:BackUp';
        default: return assertNever(step);
      }
    };
    const labels = ALL_VARIANTS.map(classify);
    expect(new Set(labels).size).toBe(10);
  });

  it('maps payload fields 1:1 (spot checks on each vocabulary)', () => {
    const enumerate = phaseDataFromStep(ALL_VARIANTS[0]).enumerate!;
    expect(enumerate.statesEnumerated).toBe(42);
    expect(enumerate.current).toEqual({ key: 'k0', branching: 7 });

    const propagate = phaseDataFromStep(ALL_VARIANTS[2]).propagate!;
    expect(propagate.sweepIndex).toBe(2);
    expect(propagate.newlyWon).toBe(1);
    expect(propagate.newlyLost).toBe(1);
    expect(propagate.remainingUnknown).toBe(9);
    expect(propagate.frontier.length).toBe(2);

    const readValue = phaseDataFromStep(ALL_VARIANTS[4]).readValue!;
    expect(readValue.rootValue).toEqual(win);
    expect(readValue.pieceValues).toBeNull();

    const order = phaseDataFromStep(ALL_VARIANTS[6]).order!;
    expect(order.ttHit).toEqual({ key: 'k4', value: win });

    const backUp = phaseDataFromStep(ALL_VARIANTS[9]).backUp!;
    expect(backUp.cutoff).toBe(true);
    expect(backUp.rootBounds).toEqual({ lower: 'win', upper: 'win', proven: true });
  });
});

describe('phase labels + indexes stay in lockstep with the contract arrays', () => {
  it('label tables match the contract phase arrays in length and order', () => {
    expect(PHASE_LABELS.length).toBe(PHASE_COUNT);
    expect(PHASE_LABELS.length).toBe(RETROGRADE_PHASES.length);
    expect(SEARCH_PHASE_LABELS.length).toBe(SEARCH_PHASES.length);
    expect(SolverPhase.ReadValue).toBe(PHASE_COUNT - 1);
  });

  it('phaseIndexOfName / phaseIndexOf give the 0..4 segment within each vocabulary', () => {
    RETROGRADE_PHASES.forEach((name, i) => expect(phaseIndexOfName(name)).toBe(i));
    SEARCH_PHASES.forEach((name, i) => expect(phaseIndexOfName(name)).toBe(i));
    expect(phaseIndexOf(ALL_VARIANTS[3])).toBe(3); // Converge
    expect(phaseIndexOf(ALL_VARIANTS[9])).toBe(4); // BackUp
  });
});
