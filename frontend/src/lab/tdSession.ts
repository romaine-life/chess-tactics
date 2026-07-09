// The piece-value learner's session reducer — the PURE layer between the tdValues
// engine and lab/tdWorker.ts, in gymStep.ts's shape: everything mutable travels in
// the session, so the worker stays a thin message wrapper and node tests can drive
// the exact protocol logic (the worker shell touches `self`, which node can't import).
//
// Owner grammar (the control spec this module implements): STEP = one game, STEP N,
// RUN to the configured budget, STOP between games, RESET = a fresh session. No
// pause/resume machinery — TD's atomic unit is ONE game (ms-fast), so a stop between
// games commits cleanly; that is the whole transport.

import type { Level } from '../core/level';
import {
  DEFAULT_PROBE_GAMES,
  createTrainingSession, derivedSeeds, evaluateVsRandom, runTrainingGames, summarizeSeeds,
  type SeedSummary, type TrainOptions, type TrainSessionState, type ValueWeights,
} from '../game/tdValues';

/** Everything a command needs beside the level: the engine options plus how many
 * independent seeds the completion mean ± spread folds. The anneal schedules lerp
 * on the TOTAL `opts.games`, so the budget is part of the schedule — fixed per run
 * (Reset to change it). */
export interface TdRunConfig {
  opts: TrainOptions;
  /** Independent full runs for the final mean ± spread (≥ 1; seed 0 IS the live run). */
  seedCount: number;
}

export interface TdProbe {
  /** Games completed when this probe ran. */
  game: number;
  /** Greedy-with-current-weights vs the frozen-random opponent: mean outcome over the
   * probe games (win 1 / draw ½ / loss 0), so 0.5 reads as parity. */
  winRate: number;
}

/** The complete mutable state between commands (JSON-safe, structured-cloneable). */
export interface TdSession {
  train: TrainSessionState;
  /** Latest probe vs the frozen-random opponent (refreshed every probeEvery games,
   * plus once at budget completion). */
  probe: TdProbe | null;
}

/** Cooperation hooks: the worker yields between games so a STOP message can land;
 * tests drive shouldStop directly. Both optional — a bare call runs straight through. */
export interface TdControl {
  afterGame?: () => Promise<void>;
  shouldStop?: () => boolean;
}

export function freshTdSession(opts: TrainOptions): TdSession {
  return { train: createTrainingSession(opts), probe: null };
}

/** trainValues' probe defaulting (shared constant, not a re-stated literal):
 * probeGames defaults to DEFAULT_PROBE_GAMES when a cadence is set, else 0. */
const probePlanOf = (opts: TrainOptions): { every: number; games: number } => {
  const every = opts.probeEvery ?? 0;
  return { every, games: opts.probeGames ?? (every > 0 ? DEFAULT_PROBE_GAMES : 0) };
};

/**
 * Advance the session by up to `n` games (clamped to the budget), one game at a time:
 * game → probe (on cadence) → onProgress → control hooks. Deterministic in
 * (level, cfg, session): chunking is invisible to the weights (runTrainingGames'
 * bit-for-bit guarantee), and the probe reuses evaluateVsRandom's frozen seed base so
 * every run is probed against the same seeded opponent games.
 */
export async function advanceTd(
  level: Level,
  cfg: TdRunConfig,
  session: TdSession,
  n: number,
  onProgress?: (session: TdSession) => void,
  control?: TdControl,
): Promise<{ session: TdSession; stopped: boolean }> {
  const { opts } = cfg;
  const probe = probePlanOf(opts);
  const target = Math.min(opts.games, session.train.game + Math.max(0, Math.floor(n)));
  let cur = session;
  while (cur.train.game < target) {
    if (control?.shouldStop?.()) return { session: cur, stopped: true };
    const train = runTrainingGames(level, opts, cur.train, 1);
    let latest = cur.probe;
    // trainValues' probe story exactly: on the cadence when one is set, and ALWAYS once
    // at budget completion while probeGames > 0 (its final snapshot probes even with
    // probeEvery 0) — so the session reproduces the batch trainer's probes too.
    if (probe.games > 0 && ((probe.every > 0 && train.game % probe.every === 0) || train.game === opts.games)) {
      latest = { game: train.game, winRate: evaluateVsRandom(level, train.weights, probe.games, { maxPlies: opts.maxPlies }) };
    }
    cur = { train, probe: latest };
    onProgress?.(cur);
    if (control?.afterGame) await control.afterGame();
  }
  return { session: cur, stopped: false };
}

/** Sibling-seed games between stop checks — small enough that STOP lands promptly. */
const SUMMARY_CHUNK = 32;

/**
 * The completion readout: fold the live run (seed 0) with (seedCount − 1) fresh
 * sibling runs into exactly runSeeds' mean ± spread — WITHOUT re-running seed 0
 * (the live session already IS trainValues(seed 0) bit-for-bit; asserted in
 * tdWorker.test.ts). Sibling runs skip probing (probes never touch the weights).
 * Returns null when stopped mid-fold; re-issuing RUN at a completed budget redoes it.
 */
export async function tdSeedSummary(
  level: Level,
  cfg: TdRunConfig,
  finalWeights: ValueWeights,
  onSeed?: (seedsDone: number, seedsTotal: number) => void,
  control?: TdControl,
): Promise<SeedSummary | null> {
  const k = Math.max(1, Math.floor(cfg.seedCount));
  const seeds = derivedSeeds(cfg.opts.seed, k);
  const perSeed: SeedSummary['perSeed'] = [{ seed: seeds[0], weights: finalWeights }];
  onSeed?.(1, k);
  for (let i = 1; i < k; i += 1) {
    const opts: TrainOptions = { ...cfg.opts, seed: seeds[i], probeEvery: 0, probeGames: 0 };
    let state = createTrainingSession(opts);
    while (state.game < opts.games) {
      if (control?.shouldStop?.()) return null;
      state = runTrainingGames(level, opts, state, SUMMARY_CHUNK);
      if (control?.afterGame) await control.afterGame();
    }
    perSeed.push({ seed: seeds[i], weights: state.weights });
    onSeed?.(i + 1, k);
  }
  return summarizeSeeds(perSeed);
}
