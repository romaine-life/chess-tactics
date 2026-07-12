// Phase-4 proof-number search tests (ADR-0069 §1). PN is OPTIONAL for this cut — shipped as a
// typed `not-implemented` stub behind `bounds.prover` (default 'ab'). The `it.skip` case documents
// the intended guarantee for when PN lands; the active test pins the stub's loud-failure contract.

import { describe, it, expect } from 'vitest';
import { createBlankLevel, type Level } from '../../level';
import { toSolverInput } from '../input';
import { runProofNumberSolve } from './pnSearch';

function kqvk(): Level {
  const lvl = createBlankLevel('tiny', 'Tiny', 3, 3);
  lvl.objective = 'rival-kings';
  lvl.layers.units = [
    { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
    { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
    { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
  ];
  return lvl;
}

describe('pnSearch (optional — stubbed)', () => {
  it('the PN prover throws not-implemented (loud failure, never a silent wrong proof)', () => {
    const input = toSolverInput(kqvk(), 0);
    expect(() => runProofNumberSolve(input, { prover: 'pn' })).toThrow(/not implemented/i);
  });

  it.skip('PN proves the same forced win as αβ (enable when pnSearch lands)', () => {
    // Intended: runProofNumberSolve on K+Q vs K proves outcome:'win', winner:'player', DTM 1 —
    // identical to runWeakSolve's αβ result — and minDisproof reaches ∞ on the disproven branch.
  });
});
