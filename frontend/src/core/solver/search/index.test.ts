// Phase-4 wiring tests (ADR-0069): runSolve's `mode:'search'` dispatch, the SolveResult adapter,
// and the stepSearchWithPhases five-phase trace. vitest v4 hides console.log for passing tests.

import { describe, it, expect } from 'vitest';
import { createBlankLevel, type Level, type LevelUnit, type ObjectiveType } from '../../level';
import { breakLineLevel } from '../../../game/__fixtures__/breakLine';
import { runSolve } from '../retrograde';
import { estimateFeasibility } from '../feasibility';
import { toSolverInput } from '../input';
import { weakBoundsFromSolveBounds, weakResultToSolveResult, stepSearchWithPhases } from './index';
import { runWeakSolve } from './idSearch';
import type { SearchPhaseName } from '../types';
import { SEARCH_PHASES } from '../types';

function tinyLevel(units: LevelUnit[], cols: number, rows: number, objective: ObjectiveType = 'rival-kings'): Level {
  const lvl = createBlankLevel('tiny', 'Tiny', cols, rows);
  lvl.objective = objective;
  lvl.layers.units = units.map((u) => ({ ...u }));
  return lvl;
}

/** Author last-rank promotion the way real levels do (no built-in far-edge default). */
function withPromoRow(lvl: Level, y = 0): Level {
  lvl.layers.zones.push({ id: 'promo', type: 'pawn-promotion', tiles: Array.from({ length: lvl.board.cols }, (_, x) => [x, y] as [number, number]) });
  return lvl;
}

describe('runSolve — mode:search dispatch (feasibility gate routes hard/infeasible here)', () => {
  it('Break the Line is a search-mode board and runSolve returns a well-formed search SolveResult', () => {
    // Break the Line is `hard` (too big to strong-solve) → the feasibility gate selects search.
    expect(estimateFeasibility(breakLineLevel).recommendedMode).toBe('search');
    // A tight node budget so this finishes fast: the search runner returns a bounded partial.
    const bounds = { wallClockMs: 30_000, maxStates: 50_000, maxMemoryBytes: 3 * 2 ** 30 };
    const res = runSolve(breakLineLevel, bounds);
    expect(res.mode).toBe('search'); // routed to the Phase-4 delegate, not retrograde.
    expect(res).toHaveProperty('rootBounds');
    expect(['win', 'loss', 'draw', 'unknown']).toContain(res.rootValue.outcome);
    // A bounded partial: complete iff proven; provenCount consistent with proven counts.
    expect(res.provenCount).toBe(res.proven.win + res.proven.loss + res.proven.draw);
    expect(typeof res.complete).toBe('boolean');
    expect(res.coveragePct).toBeGreaterThanOrEqual(0);
    expect(res.coveragePct).toBeLessThanOrEqual(100);
  });

  it('does NOT break the retrograde branch: a solvable tiny board still strong-solves', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], 3, 3);
    const res = runSolve(lvl, { wallClockMs: 30_000, maxStates: 5_000_000, maxMemoryBytes: 3 * 2 ** 30 });
    expect(res.mode).toBe('retrograde');
    expect(res.rootValue).toEqual({ outcome: 'win', winner: 'player', distancePlies: 1 });
    expect(res.complete).toBe(true);
  });
});

describe('bounds + result adapters', () => {
  it('weakBoundsFromSolveBounds maps states/bytes into the internal caps and does NOT forward the wall clock', () => {
    const wb = weakBoundsFromSolveBounds({ wallClockMs: 12_000, maxStates: 99, maxMemoryBytes: 6400 });
    expect(wb.maxNodes).toBe(99);
    // Wall clock is deliberately NOT forwarded — the in-loop budget is node-count only so the proof
    // result is deterministic (a Date.now() stop would flip the proven outcome/bounds run-to-run).
    expect(wb.wallClockMs).toBeUndefined();
    expect(wb.ttEntryLimit).toBeGreaterThan(0);
    expect(wb.prover).toBe('ab');
  });

  it('weakResultToSolveResult marks complete iff the root proved and carries the contract shapes', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], 3, 3);
    const input = toSolverInput(lvl, 0);
    const weak = runWeakSolve(input, { maxNodes: 3_000_000, maxDepthPlies: 40 });
    const sr = weakResultToSolveResult(weak, lvl, { wallClockMs: 10_000, maxStates: 5_000_000, maxMemoryBytes: 3 * 2 ** 30 });
    expect(sr.mode).toBe('search');
    expect(sr.complete).toBe(true); // K+Q vs K proves
    expect(sr.rootValue).toEqual({ outcome: 'win', winner: 'player', distancePlies: 1 });
    expect(sr.rootBounds.proven).toBe(true);
    // Ablation ran post-solve on the proven board.
    expect(sr.pieceValues).toBeDefined();
  });
});

describe('stepSearchWithPhases — five-phase trace', () => {
  // A board that requires real interior search (K+P vs K, a mate-in-5) so the node decision phases
  // actually fire — an immediate mate-in-1 resolves at the root terminal with nothing to show.
  const searchBoard = () => withPromoRow(tinyLevel([
    { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
    { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
    { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
  ], 3, 5));

  it('emits the ADR §7 search phases (Generate/Order/Descend/BackUp) as contract SolveSteps', () => {
    const input = toSolverInput(searchBoard(), 0);
    const steps = [...stepSearchWithPhases(input, { maxNodes: 200_000, maxDepthPlies: 6 })];
    expect(steps.length).toBeGreaterThan(0);
    const phases = new Set<SearchPhaseName>();
    for (const s of steps) {
      expect(s.kind).toBe('search');
      phases.add(s.phase as SearchPhaseName);
      expect(SEARCH_PHASES).toContain(s.phase); // every phase is a valid contract member.
    }
    // ALL FIVE phases appear on a branching search board — Quiesce fires at every
    // depth-horizon leaf, and the bar's fifth segment must be reachable in a live trace.
    expect(phases.has('Generate')).toBe(true);
    expect(phases.has('Order')).toBe(true);
    expect(phases.has('Descend')).toBe(true);
    expect(phases.has('Quiesce')).toBe(true);
    expect(phases.has('BackUp')).toBe(true);
  });

  it('the ROOT answer reaches the trace: BackUp steps at ply 0 carry the tightening rootBounds', () => {
    const input = toSolverInput(searchBoard(), 0);
    const steps = [...stepSearchWithPhases(input, { maxNodes: 200_000, maxDepthPlies: 6 })];
    const rootBackUps = steps.filter((s) => s.kind === 'search' && s.phase === 'BackUp' && s.window.ply === 0 && s.rootBounds);
    expect(rootBackUps.length).toBeGreaterThan(0); // one per completed deepening iteration
    const last = rootBackUps[rootBackUps.length - 1];
    if (last.kind !== 'search' || last.phase !== 'BackUp' || !last.rootBounds) throw new Error('unreachable');
    // K+P vs K is a proven mate-in-5 within depth 6 — the final bounds say so.
    expect(last.rootBounds.proven).toBe(true);
    expect(last.rootBounds.lower).toBe('win');
    expect(last.rootBounds.upper).toBe('win');
    expect(last.rootBounds.bestDistancePlies).toBe(5);
  });

  it('the trace is deterministic (identical bounds → identical step sequence)', () => {
    const a = [...stepSearchWithPhases(toSolverInput(searchBoard(), 0), { maxNodes: 200_000, maxDepthPlies: 6 })];
    const b = [...stepSearchWithPhases(toSolverInput(searchBoard(), 0), { maxNodes: 200_000, maxDepthPlies: 6 })];
    expect(a.length).toBe(b.length);
    expect(a.map((s) => s.phase)).toEqual(b.map((s) => s.phase));
  });
});
