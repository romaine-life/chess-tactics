// Phase-1 feasibility + en-passant + clock-in-key tests (ADR-0069). The Break the Line
// FeasibilityReport is asserted here (the ADR §2 "toy vs chess by computation" number).
// Vitest v4 hides console.log for passing tests, so every field is ASSERTED directly.

import { describe, it, expect } from 'vitest';
import { createBlankLevel, type Level, type LevelUnit, type ObjectiveType } from '../level';
import { estimateFeasibility } from './feasibility';
import { toSolverInput } from './input';
import { canonicalKey, enumerateReachable } from './encode';
import { runWeakSolve } from './search/idSearch';
import { legalMoves, livingPieces } from '../rules';
import { breakLineLevel } from '../../game/__fixtures__/breakLine';

function tinyLevel(units: LevelUnit[], opts: { cols: number; rows: number; objective: ObjectiveType; surviveTurns?: number }): Level {
  const lvl = createBlankLevel('tiny', 'Tiny', opts.cols, opts.rows);
  lvl.objective = opts.objective;
  lvl.layers.units = units.map((u) => ({ ...u }));
  if (opts.surviveTurns) lvl.surviveTurns = opts.surviveTurns;
  return lvl;
}

// ─── Feasibility on the tiny solvable boards ────────────────────────────────────────────

describe('feasibility on tiny boards', () => {
  it('K vs K: bound ≥ actual states, verdict solvable, retrograde recommended', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
    ], { cols: 4, rows: 4, objective: 'rival-kings' });
    const report = estimateFeasibility(lvl);
    const input = toSolverInput(lvl, 0);
    const space = enumerateReachable(input, 5_000_000);
    expect(report.stateSpaceUpperBound).toBeGreaterThanOrEqual(space.keys.length);
    expect(report.verdict).toBe('solvable');
    expect(report.recommendedMode).toBe('retrograde');
    expect(report.enPassantUnsound).toBe(false);
    // branchingRoot is the actual legal-move count at the root.
    let lm = 0;
    for (const p of livingPieces(input.start.pieces, 'player')) lm += legalMoves(p, input.start.pieces, input.start.size, input.env).length;
    expect(report.branchingRoot).toBe(lm);
  });

  it('K+Q vs K and K+P vs K: bound ≥ actual states, solvable', () => {
    for (const lvl of [
      tinyLevel([
        { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
        { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
        { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
      ], { cols: 3, rows: 3, objective: 'rival-kings' }),
      tinyLevel([
        { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
        { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
        { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
      ], { cols: 3, rows: 5, objective: 'rival-kings' }),
    ]) {
      const report = estimateFeasibility(lvl);
      const input = toSolverInput(lvl, 0);
      const space = enumerateReachable(input, 5_000_000);
      expect(report.stateSpaceUpperBound).toBeGreaterThanOrEqual(space.keys.length);
      expect(report.verdict).toBe('solvable');
    }
  });
});

// ─── En-passant refusal (F6) ────────────────────────────────────────────────────────────

describe('en-passant refusal (F6)', () => {
  it('opposing pawns on adjacent files → enPassantUnsound and verdict is not solvable', () => {
    const lvl = tinyLevel([
      { x: 0, y: 3, side: 'enemy', type: 'king', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 4, side: 'player', type: 'pawn', facing: 'north' },
      { x: 2, y: 1, side: 'enemy', type: 'pawn', facing: 'south' },
    ], { cols: 5, rows: 6, objective: 'rival-kings' });
    const report = estimateFeasibility(lvl);
    expect(report.enPassantUnsound).toBe(true);
    expect(report.verdict).not.toBe('solvable');
    expect(report.notes.some((n) => /en passant/i.test(n))).toBe(true);
  });
});

// ─── Hidden-ledger refusal (ADR-0072: castle / chess-draws events) ──────────────────────

describe('hidden-ledger refusal (ADR-0072)', () => {
  const base = () => tinyLevel([
    { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
    { x: 2, y: 3, side: 'player', type: 'king', facing: 'north' },
    { x: 3, y: 3, side: 'player', type: 'rook', facing: 'north' },
  ], { cols: 4, rows: 4, objective: 'rival-kings' });

  it('a castle event → hiddenStateUnsound, verdict capped, refusal note', () => {
    const lvl = base();
    lvl.events = [{
      id: 'e1', name: 'castle', trigger: { kind: 'setup' },
      do: [{ kind: 'castle', side: 'player', king: { x: 2, y: 3 }, rook: { x: 3, y: 3 }, kingTo: { x: 3, y: 3 }, rookTo: { x: 2, y: 3 } }],
    }] as typeof lvl.events;
    const report = estimateFeasibility(lvl);
    expect(report.hiddenStateUnsound).toBe(true);
    expect(report.verdict).not.toBe('solvable');
    expect(report.notes.some((n) => /hidden ledger|castle/i.test(n))).toBe(true);
  });

  it('a chess-draws event → hiddenStateUnsound; boards without ledger events stay clean', () => {
    const lvl = base();
    lvl.events = [{
      id: 'e1', name: 'draws', trigger: { kind: 'setup' },
      do: [{ kind: 'chess-draws', fiftyMove: true, threefold: true }],
    }] as typeof lvl.events;
    expect(estimateFeasibility(lvl).hiddenStateUnsound).toBe(true);
    expect(estimateFeasibility(base()).hiddenStateUnsound).toBe(false);
  });

  it('runWeakSolve refuses the board outright (no unsound proofs)', () => {
    const lvl = base();
    lvl.events = [{
      id: 'e1', name: 'draws', trigger: { kind: 'setup' },
      do: [{ kind: 'chess-draws', fiftyMove: true }],
    }] as typeof lvl.events;
    const input = toSolverInput(lvl, 0);
    expect(input.hiddenStateUnsound).toBe(true);
    expect(() => runWeakSolve(input, { maxNodes: 1_000, maxDepthPlies: 2 })).toThrow(/ADR-0072|hidden ledger/i);
  });
});

// ─── Clock-in-key (§position key contract clause 3) ─────────────────────────────────────

describe('clock-in-key', () => {
  it('survive: two identical boards at different turnsElapsed get DIFFERENT keys', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'queen', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
    ], { cols: 4, rows: 4, objective: 'survive', surviveTurns: 3 });
    const input = toSolverInput(lvl, 0);
    expect(input.clockMatters).toBe(true);
    expect(canonicalKey(input.start, input, 0)).not.toBe(canonicalKey(input.start, input, 1));
  });

  it('rival-kings: the clock is inert, so the same board gets the SAME key across turnsElapsed', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
    ], { cols: 4, rows: 4, objective: 'rival-kings' });
    const input = toSolverInput(lvl, 0);
    expect(input.clockMatters).toBe(false);
    expect(canonicalKey(input.start, input, 0)).toBe(canonicalKey(input.start, input, 5));
  });
});

// ─── Break the Line — the recorded feasibility number ───────────────────────────────────

describe('Break the Line feasibility (the ADR §2 number)', () => {
  it('returns a finite bound, correct root branching, a verdict, and the en-passant refusal', () => {
    const report = estimateFeasibility(breakLineLevel);
    const input = toSolverInput(breakLineLevel, 0);

    // A finite (very large) state-space bound — BtL is NOT a toy.
    expect(Number.isFinite(report.stateSpaceUpperBound)).toBe(true);
    expect(report.stateSpaceUpperBound).toBeGreaterThan(1e9);

    // branchingRoot === actual player legal-move count at the BtL start.
    let lm = 0;
    for (const p of livingPieces(input.start.pieces, 'player')) lm += legalMoves(p, input.start.pieces, input.start.size, input.env).length;
    expect(report.branchingRoot).toBe(lm);
    expect(report.branchingSampled).toBeGreaterThan(0);

    // BtL fields opposing pawns on adjacent files ⇒ en passant can fire ⇒ refused for a strong
    // solve, so the verdict is NOT solvable and the recommended mode is search (F6).
    expect(report.enPassantUnsound).toBe(true);
    expect(report.verdict).not.toBe('solvable');
    expect(report.recommendedMode).toBe('search');
    expect(report.tablebaseBytesEstimate).toBeGreaterThan(0);
    expect(report.etaSeconds).toBeGreaterThan(0);

    // Exact recorded snapshot of the deterministic fields (the ADR §2 headline numbers).
    expect(report.stateSpaceUpperBound).toBe(55_819_653_120);
    expect(report.branchingRoot).toBe(4);
    expect(report.verdict).toBe('hard');
  });
});
