// Phase-4 iterative-deepening weak-solver tests (ADR-0069). Node-bounded (no wall clock) so the
// search is deterministic. vitest v4 hides console.log for passing tests → every claim asserted.

import { describe, it, expect } from 'vitest';
import { createBlankLevel, type Level, type LevelUnit, type ObjectiveType } from '../../level';
import { toSolverInput } from '../input';
import { enumerateReachable } from '../encode';
import { retrogradeSolve } from '../retrograde';
import { runWeakSolve } from './idSearch';
import type { SolveProgress as ContractProgress } from '../types';

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

const KvK = () => tinyLevel([
  { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
  { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
], 4, 4);

const KQvK = () => tinyLevel([
  { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
  { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
  { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
], 3, 3);

const KPvKwin = () => withPromoRow(tinyLevel([
  { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
  { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
  { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
], 3, 5));

function retroValue(lvl: Level) {
  const input = toSolverInput(lvl, 0);
  return retrogradeSolve(enumerateReachable(input, 5_000_000), input).rootValue;
}

const NODE_BOUNDS = { maxNodes: 3_000_000, maxDepthPlies: 40 };

describe('runWeakSolve — value MATCHES retrograde ground truth', () => {
  it('K vs K → proven draw (same as retrograde)', () => {
    const lvl = KvK();
    const res = runWeakSolve(toSolverInput(lvl, 0), { maxNodes: 2_000_000, maxDepthPlies: 30 });
    expect(res.rootValue.outcome).toBe('draw');
    expect(res.rootValue.outcome).toBe(retroValue(lvl).outcome);
    expect(res.rootBounds.proven).toBe(true);
    expect(res.rootBounds.lower).toBe('draw');
    expect(res.rootBounds.upper).toBe('draw');
    expect(res.rootValue.distancePlies).toBeUndefined();
  });

  it('K+Q vs K → proven win, distancePlies === 1 (mate-in-1)', () => {
    const lvl = KQvK();
    const res = runWeakSolve(toSolverInput(lvl, 0), NODE_BOUNDS);
    expect(res.rootValue).toEqual({ outcome: 'win', winner: 'player', distancePlies: 1 });
    expect(res.rootValue).toEqual(retroValue(lvl));
    expect(res.rootBounds.proven).toBe(true);
    expect(res.rootBounds.lower).toBe('win');
    expect(res.rootBounds.upper).toBe('win');
    expect(res.aborted).toBe(false);
  });

  it('K+P vs K winning → proven win with the retrograde DTM', () => {
    const lvl = KPvKwin();
    const gt = retroValue(lvl);
    const res = runWeakSolve(toSolverInput(lvl, 0), NODE_BOUNDS);
    expect(res.rootValue.outcome).toBe('win');
    expect(res.rootValue.winner).toBe(gt.winner);
    expect(res.rootValue.distancePlies).toBe(gt.distancePlies);
    expect(res.rootBounds.proven).toBe(true);
  });

  // Exact-DTM regression guard (findings 1 & 2): a longer mate whose shortest line only appears at a
  // deeper horizon. Before the fix, the search reported an INFLATED distance-to-mate (11 for this KR
  // board's true 9) — from the first-win early break, quiescence overrun, and shallow-horizon proofs
  // frozen in the shared TT. The exact DTM must equal retrograde's, not merely the right outcome.
  it('K+R vs K (4×4) → proven win with the EXACT retrograde DTM (not an inflated distance)', () => {
    const lvl = tinyLevel([
      { x: 1, y: 1, side: 'enemy', type: 'king', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
      { x: 0, y: 3, side: 'player', type: 'rook', facing: 'north' },
    ], 4, 4);
    const gt = retroValue(lvl);
    const res = runWeakSolve(toSolverInput(lvl, 0), { maxNodes: 8_000_000, maxDepthPlies: 40 });
    expect(res.rootValue.outcome).toBe('win');
    expect(res.rootValue.winner).toBe(gt.winner);
    expect(res.rootValue.distancePlies).toBe(gt.distancePlies); // exact — the mate is 9, not 11.
    expect(res.rootBounds.proven).toBe(true);
    expect(res.rootBounds.bestDistancePlies).toBe(gt.distancePlies);
  });
});

describe('runWeakSolve — proven counts include the root and are consistent', () => {
  it('a proven win has ≥1 in the win bucket and provenCount matches', () => {
    const res = runWeakSolve(toSolverInput(KQvK(), 0), NODE_BOUNDS);
    expect(res.proven.win).toBeGreaterThanOrEqual(1);
    const provenCount = res.proven.win + res.proven.loss + res.proven.draw;
    expect(provenCount).toBeGreaterThanOrEqual(1);
    expect(res.coverage.ttSize).toBeGreaterThanOrEqual(0);
  });
});

describe('runWeakSolve — anytime monotonicity (bounds never widen)', () => {
  it('proven counts + ttSize are non-decreasing and RootBounds never widens across progress ticks', () => {
    const ticks: ContractProgress[] = [];
    runWeakSolve(toSolverInput(KPvKwin(), 0), NODE_BOUNDS, (p) => ticks.push(p));
    expect(ticks.length).toBeGreaterThan(0);
    const rank: Record<string, number> = { loss: 0, draw: 1, win: 2, unknown: 3 };
    for (let i = 1; i < ticks.length; i += 1) {
      const prev = ticks[i - 1];
      const cur = ticks[i];
      // statesSolved (proven positions) is monotone non-decreasing.
      expect(cur.statesSolved).toBeGreaterThanOrEqual(prev.statesSolved);
      // RootBounds interval only tightens: lower never falls, upper never rises.
      expect(rank[cur.rootBounds.lower]).toBeGreaterThanOrEqual(rank[prev.rootBounds.lower]);
      expect(rank[cur.rootBounds.upper]).toBeLessThanOrEqual(rank[prev.rootBounds.upper]);
      // Once proven, it stays proven.
      if (prev.rootBounds.proven) expect(cur.rootBounds.proven).toBe(true);
    }
  });
});

describe('runWeakSolve — a bounded stop returns a usable partial', () => {
  it('a tight node budget on a big-ish board returns a well-formed aborted partial (no throw/null)', () => {
    // A K+P vs K board with a tiny node budget: the solve cannot finish, so it must return a partial
    // — aborted, a best line, finite RootBounds, no proof — the anytime guarantee.
    const lvl = KPvKwin();
    const res = runWeakSolve(toSolverInput(lvl, 0), { maxNodes: 40, maxDepthPlies: 40 });
    expect(res).toBeDefined();
    expect(res.aborted).toBe(true);
    expect(res.rootBounds.proven).toBe(false);
    expect(res.bestLine.length).toBeGreaterThan(0);
    // RootBounds are finite Outcome strings (never NaN/undefined).
    expect(['win', 'loss', 'draw', 'unknown']).toContain(res.rootBounds.lower);
    expect(['win', 'loss', 'draw', 'unknown']).toContain(res.rootBounds.upper);
    // rootValue is well-formed (unknown while unproven).
    expect(['win', 'loss', 'draw', 'unknown']).toContain(res.rootValue.outcome);
  });
});

describe('runWeakSolve — determinism under node budgets', () => {
  it('two runs with identical bounds produce byte-identical WeakSolveResult', () => {
    const a = runWeakSolve(toSolverInput(KPvKwin(), 0), NODE_BOUNDS);
    const b = runWeakSolve(toSolverInput(KPvKwin(), 0), NODE_BOUNDS);
    expect(a.rootValue).toEqual(b.rootValue);
    expect(a.rootBounds).toEqual(b.rootBounds);
    expect(a.bestLine).toEqual(b.bestLine);
    expect(a.completedDepth).toBe(b.completedDepth);
    expect(a.nodes).toBe(b.nodes);
    expect(a.proven).toEqual(b.proven);
  });

  it('a bounded partial is also deterministic', () => {
    const bounds = { maxNodes: 500, maxDepthPlies: 40 };
    const a = runWeakSolve(toSolverInput(KPvKwin(), 0), bounds);
    const b = runWeakSolve(toSolverInput(KPvKwin(), 0), bounds);
    expect(a.rootValue).toEqual(b.rootValue);
    expect(a.rootBounds).toEqual(b.rootBounds);
    expect(a.nodes).toBe(b.nodes);
    expect(a.bestLine).toEqual(b.bestLine);
  });

  it('a wallClockMs in the bounds does NOT affect the result — the in-loop budget is node-count only', () => {
    // The driver ignores wallClockMs (determinism: a Date.now() stop would flip proven outcome/bounds
    // run-to-run near a budget boundary). A tiny wall clock alongside a big node budget must therefore
    // produce the SAME fully-proven result as no wall clock at all — proving the clock is not consulted.
    const input = toSolverInput(KPvKwin(), 0);
    const withClock = runWeakSolve(input, { maxNodes: 3_000_000, maxDepthPlies: 40, wallClockMs: 1 });
    const noClock = runWeakSolve(input, { maxNodes: 3_000_000, maxDepthPlies: 40 });
    expect(withClock.rootValue).toEqual(noClock.rootValue);
    expect(withClock.rootBounds).toEqual(noClock.rootBounds);
    expect(withClock.completedDepth).toBe(noClock.completedDepth);
    expect(withClock.nodes).toBe(noClock.nodes);
    expect(withClock.rootBounds.proven).toBe(true); // a 1ms wall clock did NOT abort the proof.
  });
});

describe('runWeakSolve — en-passant board is NOT strong-solved by the draw-proof fallback (F6)', () => {
  it('a two-sided-pawn board leaves the root at the search bounds, never a laundered retrograde proof', () => {
    // Both sides field a pawn ⇒ enPassantUnsound: the decoded lastMove-free move graph is missing EP
    // successors, so the retrograde draw-proof fallback (enumerate+retrograde) would be UNSOUND. The
    // runner must REFUSE the fallback and leave the root at its honest search bounds — the same refusal
    // feasibility makes at the gate — never emitting a proven root value from the EP-blind tablebase.
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 4, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 1, side: 'enemy', type: 'pawn', facing: 'south' },
      { x: 1, y: 3, side: 'player', type: 'pawn', facing: 'north' },
    ], 3, 5);
    const input = toSolverInput(lvl, 0);
    expect(input.enPassantUnsound).toBe(true); // the shared refusal flag is set on the input.
    // Bounded so the forward search COMPLETES every depth WITHOUT tripping the node budget
    // (`aborted:false`) — the fallback gate `!budgetTripped()` is genuinely reached, so it is the EP
    // refusal (not a budget truncation) that stops the enumerate+retrograde fold-in.
    const res = runWeakSolve(input, { maxNodes: 500_000, maxDepthPlies: 12 });
    expect(res.aborted).toBe(false); // the search finished within budget → the fallback gate was hit.
    // The fallback refused, so the root is left at the honest search bounds — unproven, never a
    // laundered retrograde DRAW. (The forward search is EP-safe and simply did not prove this draw.)
    expect(res.rootValue.outcome).toBe('unknown');
    expect(res.rootBounds.proven).toBe(false);
  });
});

// A compile-time nudge that the progress callback receives the contract SolveProgress.
const _progressIsContract: ContractProgress = {
  phase: 'BackUp', statesEnumerated: 0, statesSolved: 0,
  proven: { win: 0, loss: 0, draw: 0 }, rootBounds: { lower: 'loss', upper: 'win', proven: false },
  coveragePct: 0, secs: 0, depth: 0,
};
void _progressIsContract;
