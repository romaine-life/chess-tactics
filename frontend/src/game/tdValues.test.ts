// Afterstate TD(λ) value-learning tests, anchored to the solver's PROVEN fixtures
// (core/solver/retrograde.test.ts): the learner must separate a proven win from random
// play, convert it greedily from the root, and stay flat on a proven draw. Vitest v4
// hides console.log for passing tests, so every claim is an assertion. Budgets are
// deliberately small — these boards are tiny and a game is a few dozen cheap plies.

import { describe, it, expect } from 'vitest';
import { createBlankLevel, type Level, type LevelUnit, type ObjectiveType } from '../core/level';
import { PLAYABLE_PIECE_TYPES } from '../core/pieces';
import {
  DEFAULT_INITIAL_WEIGHT,
  evaluateVsRandom,
  pawnRelativeValues,
  playGreedyGame,
  runSeeds,
  trainValues,
} from './tdValues';

function tinyLevel(units: LevelUnit[], opts: { cols: number; rows: number; objective: ObjectiveType }): Level {
  const lvl = createBlankLevel('tiny', 'Tiny', opts.cols, opts.rows);
  lvl.objective = opts.objective;
  lvl.layers.units = units.map((u) => ({ ...u }));
  return lvl;
}

/** Author last-rank promotion the way real levels do — a pawn-promotion zone across row `y`.
 * There is no built-in far-edge default (promotion is strictly rules-driven since the
 * authored-events merge); a fixture whose story needs queening must AUTHOR it, like a level. */
function withPromoRow(lvl: Level, y = 0): Level {
  lvl.layers.zones.push({ id: 'promo', type: 'pawn-promotion', tiles: Array.from({ length: lvl.board.cols }, (_, x) => [x, y] as [number, number]) });
  return lvl;
}

// K+Q vs K on 3×3 — retrograde-proven WIN for player (mate-in-1 at the root).
const kqk3 = (): Level => tinyLevel([
  { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
  { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
  { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
], { cols: 3, rows: 3, objective: 'rival-kings' });

// K vs K on 4×4 — retrograde-proven DRAW (kings are never adjacent, nothing is ever captured).
const kk4 = (): Level => tinyLevel([
  { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
  { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
], { cols: 4, rows: 4, objective: 'rival-kings' });

// K+P vs K on 3×5 with an authored promo row — retrograde-proven WIN (the pawn queens and mates).
const kpk35 = (): Level => withPromoRow(tinyLevel([
  { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
  { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
  { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
], { cols: 3, rows: 5, objective: 'rival-kings' }));

describe('determinism', () => {
  it('same seed ⇒ identical weights, trajectory, and outcomes — and JSON-safe', { timeout: 60_000 }, () => {
    const opts = { games: 80, seed: 7, maxPlies: 40, probeEvery: 40, probeGames: 8 };
    const a = trainValues(kqk3(), opts);
    const b = trainValues(kqk3(), opts);
    expect(b.weights).toEqual(a.weights);
    expect(b.trajectory).toEqual(a.trajectory);
    expect(b.outcomes).toEqual(a.outcomes);
    // The whole result round-trips through JSON (the Lab/worker transport contract).
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('the Monte-Carlo variant runs, learns the same direction, and is deterministic', { timeout: 60_000 }, () => {
    const opts = { games: 80, seed: 4, maxPlies: 40, monteCarlo: true, probeEvery: 0, probeGames: 0 };
    const a = trainValues(kqk3(), opts);
    const b = trainValues(kqk3(), opts);
    expect(b.weights).toEqual(a.weights);
    expect(a.weights.queen).toBeGreaterThan(DEFAULT_INITIAL_WEIGHT);
  });
});

describe('K+Q vs K 3×3 (proven win for player)', () => {
  it('learner separates from frozen-random and greedy self-play wins from the root', { timeout: 300_000 }, () => {
    const lvl = kqk3();
    const res = trainValues(lvl, { games: 600, seed: 3, maxPlies: 60, probeEvery: 200, probeGames: 24 });

    // Training saw real wins (the board generated a learnable signal).
    expect(res.outcomes.playerWins).toBeGreaterThan(res.outcomes.enemyWins);
    // Learning moved the queen UP from the all-equal start.
    expect(res.weights.queen).toBeGreaterThan(DEFAULT_INITIAL_WEIGHT);

    // Trained greedy sweeps the frozen-random probe on a proven-win board…
    const trained = evaluateVsRandom(lvl, res.weights, 200);
    expect(trained).toBeGreaterThan(0.9);
    // …and SEPARATES from a random player against the SAME frozen opponent.
    const randomBaseline = evaluateVsRandom(lvl, res.weights, 200, { randomPlayer: true });
    expect(trained).toBeGreaterThan(randomBaseline + 0.1);

    // Exploration-free self-play from the root converts the proven win (any seed:
    // the mate-in-1 is terminal-scored, so greedy always takes it).
    for (const seed of [1, 2, 3]) {
      expect(playGreedyGame(lvl, res.weights, { seed }).winner).toBe('player');
    }

    // The trajectory's final root value headed toward "player wins".
    const last = res.trajectory[res.trajectory.length - 1];
    expect(last.game).toBe(600);
    expect(last.rootValue).toBeGreaterThan(0.7);
    expect(last.winRateVsRandom).toBeGreaterThan(0.9);
  });
});

describe('K vs K 4×4 (proven draw)', () => {
  it('training stays stable — no runaway weights, root value ≈ ½', { timeout: 120_000 }, () => {
    const lvl = kk4();
    const res = trainValues(lvl, { games: 150, seed: 5, maxPlies: 40, probeEvery: 0, probeGames: 8 });

    // Every training game is a draw (nothing can ever be captured).
    expect(res.outcomes.draws).toBe(150);
    // No runaway: with zero material signal the weights must stay bounded (in fact,
    // every feature is 0 here so every gradient is 0 and the start values persist).
    for (const type of PLAYABLE_PIECE_TYPES) {
      expect(Number.isFinite(res.weights[type])).toBe(true);
      expect(Math.abs(res.weights[type])).toBeLessThan(1);
    }
    // Root value sits at the proven draw's ½.
    const last = res.trajectory[res.trajectory.length - 1];
    expect(Math.abs(last.rootValue - 0.5)).toBeLessThan(0.1);
    // And the frozen-random probe is all draws too: score exactly parity.
    expect(Math.abs((last.winRateVsRandom ?? 0) - 0.5)).toBeLessThan(0.1);
  });
});

describe('K+P vs K 3×5 with authored promo zone (proven win for player)', () => {
  it('learner ranks queen above pawn and wins from the root after training', { timeout: 600_000 }, () => {
    const lvl = kpk35();
    const res = trainValues(lvl, { games: 1000, seed: 11, maxPlies: 100, probeEvery: 500, probeGames: 16 });

    // The conversion runs through promotion, so the learned queen must clear the pawn —
    // that ordering is exactly what makes greedy PUSH the pawn to the promo row.
    expect(res.weights.queen).toBeGreaterThan(res.weights.pawn);

    // Exploration-free self-play from the root converts the proven win in the
    // overwhelming majority of seeds (the endgame's quiet moves are value-ties, so
    // conversion time varies by seed; the ply cap absorbs the slow ones).
    let wins = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      if (playGreedyGame(lvl, res.weights, { seed, maxPlies: 150 }).winner === 'player') wins += 1;
    }
    expect(wins).toBeGreaterThanOrEqual(7);

    // Trained greedy also beats the frozen-random probe from the root.
    expect(evaluateVsRandom(lvl, res.weights, 100)).toBeGreaterThan(0.75);

    // pawn = 1 relative display exists on a pawn board and normalizes correctly.
    const relative = pawnRelativeValues(res.weights);
    expect(relative).not.toBeNull();
    expect(relative!.pawn).toBe(1);
    expect(relative!.queen).toBeGreaterThan(1);
  });
});

describe('runSeeds', () => {
  it('returns per-seed vectors + mean ± spread, JSON-safe', { timeout: 300_000 }, () => {
    const lvl = kqk3();
    const out = runSeeds(lvl, 3, { games: 120, seed: 2, maxPlies: 60, probeEvery: 0, probeGames: 0 });
    expect(out.seeds.length).toBe(3);
    expect(out.perSeed.length).toBe(3);
    expect(new Set(out.seeds).size).toBe(3);
    for (const type of PLAYABLE_PIECE_TYPES) {
      expect(Number.isFinite(out.mean[type])).toBe(true);
      expect(out.spread[type]).toBeGreaterThanOrEqual(0);
    }
    // Every seed learned the same direction on the proven-win board.
    for (const run of out.perSeed) {
      expect(run.weights.queen).toBeGreaterThan(DEFAULT_INITIAL_WEIGHT);
    }
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
