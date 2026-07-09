// Protocol-level tests for the TD piece-value worker, on the PURE module the worker
// shell wraps (lab/tdSession.ts — the gymStep.ts pattern: the shell touches `self`,
// which a node test can't import; the protocol types are re-exported from tdWorker
// and imported type-only here, which erases at runtime). The load-bearing claim:
// game-granular driving (STEP, STEP N, RUN, STOP between games) is INVISIBLE to the
// learning — chunked === one uninterrupted batch run, bit for bit. Vitest v4 hides
// console.log on passing tests, so every claim is an assertion.

import { describe, it, expect } from 'vitest';
import { advanceTd, freshTdSession, tdSeedSummary } from './tdSession';
import type { TdProbe, TdRunConfig } from './tdWorker';
import { evaluateVsRandom, runSeeds, trainValues, type TrainOptions } from '../game/tdValues';
import { createBlankLevel, type Level } from '../core/level';

// K+Q vs K on 3×3 — the proven-win fixture tdValues.test.ts trains on (games are a
// few dozen cheap plies, so budgets stay small and fast).
function kqk3(): Level {
  const lvl = createBlankLevel('td-kqk3', 'KQK', 3, 3);
  lvl.objective = 'rival-kings';
  lvl.layers.units = [
    { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
    { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
    { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
  ];
  return lvl;
}

const OPTS: TrainOptions = { games: 60, seed: 7, maxPlies: 40, probeEvery: 20, probeGames: 4 };
const CFG: TdRunConfig = { opts: OPTS, seedCount: 1 };

describe('advanceTd — the owner grammar over the engine', () => {
  it('STEP 1, then STEP N, then RUN to completion === one uninterrupted batch run (bit-identical)', { timeout: 120_000 }, async () => {
    const lvl = kqk3();
    let cur = freshTdSession(OPTS);
    ({ session: cur } = await advanceTd(lvl, CFG, cur, 1));                    // STEP
    expect(cur.train.game).toBe(1);
    ({ session: cur } = await advanceTd(lvl, CFG, cur, 9));                    // STEP N
    expect(cur.train.game).toBe(10);
    const end = await advanceTd(lvl, CFG, cur, Number.MAX_SAFE_INTEGER);       // RUN (clamped to budget)
    expect(end.stopped).toBe(false);
    expect(end.session.train.game).toBe(OPTS.games);

    const batch = trainValues(lvl, OPTS);
    expect(end.session.train.weights).toEqual(batch.weights);
    expect(end.session.train.outcomes).toEqual(batch.outcomes);
  });

  it('progress is per game and monotonic, and the probe lands on its cadence', { timeout: 120_000 }, async () => {
    const lvl = kqk3();
    const seen: number[] = [];
    const probes: Array<TdProbe | null> = [];
    const { session } = await advanceTd(lvl, CFG, freshTdSession(OPTS), 40, (s) => {
      seen.push(s.train.game);
      probes.push(s.probe);
    });
    expect(seen).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    // Before game 20 there is no probe; at 20 and 40 (multiples of probeEvery) there is.
    expect(probes[18]).toBeNull();
    expect(probes[19]?.game).toBe(20);
    expect(session.probe?.game).toBe(40);
    // The probe IS evaluateVsRandom on the current weights (same frozen opponent seeds).
    expect(session.probe?.winRate).toBe(evaluateVsRandom(lvl, session.train.weights, 4, { maxPlies: 40 }));
  });

  it('STOP is honored between games, commits the completed games, and resuming is invisible', { timeout: 120_000 }, async () => {
    const lvl = kqk3();
    let games = 0;
    const res = await advanceTd(lvl, CFG, freshTdSession(OPTS), OPTS.games, (s) => { games = s.train.game; }, {
      shouldStop: () => games >= 5,
    });
    expect(res.stopped).toBe(true);
    expect(res.session.train.game).toBe(5);
    const resumed = await advanceTd(lvl, CFG, res.session, Number.MAX_SAFE_INTEGER);
    expect(resumed.stopped).toBe(false);
    expect(resumed.session.train.weights).toEqual(trainValues(lvl, OPTS).weights);
  });

  it('is deterministic per (level, cfg, session) and transport-safe (JSON round-trip)', { timeout: 120_000 }, async () => {
    const a = await advanceTd(kqk3(), CFG, freshTdSession(OPTS), 30);
    const b = await advanceTd(kqk3(), CFG, freshTdSession(OPTS), 30);
    expect(b).toEqual(a);
    expect(JSON.parse(JSON.stringify(a.session))).toEqual(a.session);
  });

  it('probeEvery 0 with probeGames > 0 probes exactly once, at budget completion (trainValues’ final-snapshot story)', { timeout: 120_000 }, async () => {
    const lvl = kqk3();
    const opts: TrainOptions = { games: 20, seed: 5, maxPlies: 40, probeEvery: 0, probeGames: 4 };
    const cfg: TdRunConfig = { opts, seedCount: 1 };
    const mid = await advanceTd(lvl, cfg, freshTdSession(opts), 10);
    expect(mid.session.probe).toBeNull();                       // no cadence -> nothing mid-run
    const done = await advanceTd(lvl, cfg, mid.session, Number.MAX_SAFE_INTEGER);
    expect(done.session.probe?.game).toBe(opts.games);          // the one completion probe
    expect(done.session.probe?.winRate).toBe(evaluateVsRandom(lvl, done.session.train.weights, 4, { maxPlies: 40 }));
    // ...and probeGames 0 stays silent even at completion.
    const silent = await advanceTd(lvl, { opts: { ...opts, probeGames: 0 }, seedCount: 1 }, freshTdSession({ ...opts, probeGames: 0 }), Number.MAX_SAFE_INTEGER);
    expect(silent.session.probe).toBeNull();
  });

  it('clamps at the budget: a step on a completed session runs nothing', { timeout: 120_000 }, async () => {
    const lvl = kqk3();
    const { session: done } = await advanceTd(lvl, CFG, freshTdSession(OPTS), OPTS.games);
    expect(done.train.game).toBe(OPTS.games);
    const again = await advanceTd(lvl, CFG, done, 25);
    expect(again.stopped).toBe(false);
    expect(again.session).toEqual(done);
  });
});

describe('tdSeedSummary — the completion mean ± spread', () => {
  it("folds the live run with sibling seeds into exactly runSeeds' summary (no seed-0 re-run)", { timeout: 300_000 }, async () => {
    const lvl = kqk3();
    const opts: TrainOptions = { games: 40, seed: 2, maxPlies: 40 };
    const cfg: TdRunConfig = { opts, seedCount: 3 };
    const { session } = await advanceTd(lvl, cfg, freshTdSession(opts), opts.games);
    const summary = await tdSeedSummary(lvl, cfg, session.train.weights);
    expect(summary).toEqual(runSeeds(lvl, 3, opts));
  });

  it('a stop aborts the fold (null); seedCount 1 is the degenerate zero-spread fold', { timeout: 120_000 }, async () => {
    const lvl = kqk3();
    const opts: TrainOptions = { games: 20, seed: 3, maxPlies: 40 };
    const { session } = await advanceTd(lvl, { opts, seedCount: 2 }, freshTdSession(opts), opts.games);
    const aborted = await tdSeedSummary(lvl, { opts, seedCount: 2 }, session.train.weights, undefined, { shouldStop: () => true });
    expect(aborted).toBeNull();
    const single = await tdSeedSummary(lvl, { opts, seedCount: 1 }, session.train.weights);
    expect(single).not.toBeNull();
    expect(single!.perSeed).toHaveLength(1);
    expect(single!.mean).toEqual(session.train.weights);
    expect(Object.values(single!.spread).every((v) => v === 0)).toBe(true);
  });
});
