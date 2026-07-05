// The gym's SPSA step as a PURE reducer: (config, session, book) -> (point, next
// session). Extracted from the worker's message handler so the retention arithmetic
// — k advancing, the trajectory growing by one, and the champion / "established"
// bookkeeping — is unit-testable in node (the worker shell touches `self`, which a
// node test can't import). The worker is now a thin message wrapper around this.

import {
  spsaStep, spsaStepAsync, matchStats, matchStatsAsync, decodeWeights,
  type MatchControl, type MatchGameRecord, type MatchOptions, type SpsaHyperParams, type StepResult,
} from '../game/tuning';
import type { BookPosition } from '../game/openingBook';
import type { EvalWeights } from '../core/ai';
import type { Level } from '../core/level';
import type { GymSession, GymPoint } from './openingBooks';

/** The immutable per-run config a step needs (everything mutable travels in the
 * session). Mirrors the worker's init payload. */
export interface StepConfig {
  level: Level;
  reference: EvalWeights;
  hp: SpsaHyperParams;
  match: MatchOptions;
  masterSeed: number;
}

export interface StepProgress {
  phase: 'theta+' | 'theta-' | 'score';
  gamesDone: number;
  gamesTotal: number;
  phaseGamesDone: number;
  phaseGamesTotal: number;
  game: MatchGameRecord;
  outcome: 'win' | 'draw' | 'loss';
}

function outcomeFor(game: MatchGameRecord): StepProgress['outcome'] {
  if (game.record.winner === 'draw') return 'draw';
  return game.record.winner === game.candidateSide ? 'win' : 'loss';
}

function foldStep(session: GymSession, score: number, r: StepResult): { point: GymPoint; session: GymSession } {
  const point: GymPoint = {
    step: session.k, score, yPlus: r.yPlus, yMinus: r.yMinus, c: r.c, a: r.a, theta: r.theta.slice(),
    games: r.games, wins: r.wins, draws: r.draws, losses: r.losses,
  };

  const improved = score > session.champion.score;
  const champion = improved ? { step: session.k, score, theta: r.theta.slice() } : session.champion;
  const established = improved ? 0 : session.established + 1;

  const next: GymSession = {
    k: session.k + 1,
    theta: r.theta,
    champion,
    established,
    traj: [...session.traj, point],
    latestStepGames: r.latestGames,
  };
  return { point, session: next };
}

/** Run ONE SPSA step from `session` over `book` and return the appended point plus
 * the updated session to persist. Pure and deterministic in (config, session, book):
 * the step is seeded by (masterSeed, session.k), so replaying a session's k
 * re-derives its trajectory. The champion advances only on a strict improvement, and
 * `established` counts steps since it last improved (reset to 0 on improvement).
 *
 * The plotted/championed `score` is the HONEST strength of the stepped weights vs the
 * shipped reference — an actual matchScore over the book, NOT the yPlus/yMinus probe
 * midpoint (which measures the perturbations, not the point). yPlus/yMinus stay on the
 * point for the gradient/telemetry. This costs one extra matchScore of games per step;
 * that is the price of a number that can honestly climb. */
export function advanceSession(
  cfg: StepConfig,
  session: GymSession,
  book: BookPosition[],
  onProgress?: (progress: StepProgress) => void,
): { point: GymPoint; session: GymSession } {
  const gamesPerMatch = book.length * 2;
  const gamesTotal = gamesPerMatch * 3;
  let gamesDone = 0;
  const report = (phase: StepProgress['phase'], phaseGamesDone: number, game: MatchGameRecord): void => {
    gamesDone += 1;
    onProgress?.({
      phase,
      gamesDone,
      gamesTotal,
      phaseGamesDone,
      phaseGamesTotal: gamesPerMatch,
      game,
      outcome: outcomeFor(game),
    });
  };
  const r = spsaStep(cfg.level, session.theta, cfg.reference, book, session.k, cfg.masterSeed, cfg.hp, cfg.match, (progress) => {
    report(progress.probe === 'plus' ? 'theta+' : 'theta-', progress.stats.games, progress.record);
  });
  // Honest score: play the stepped weights vs the shipped reference over the book and
  // use THAT strength as the point score and champion criterion.
  const scored = matchStats(cfg.level, decodeWeights(r.theta), cfg.reference, book, cfg.match, false, (progress) => {
    report('score', progress.stats.games, progress.record);
  });
  const score = scored.score;
  return foldStep(session, score, r);
}

export async function advanceSessionAsync(
  cfg: StepConfig,
  session: GymSession,
  book: BookPosition[],
  onProgress?: (progress: StepProgress) => void,
  control?: MatchControl,
): Promise<{ point: GymPoint; session: GymSession }> {
  const gamesPerMatch = book.length * 2;
  const gamesTotal = gamesPerMatch * 3;
  let gamesDone = 0;
  const report = (phase: StepProgress['phase'], phaseGamesDone: number, game: MatchGameRecord): void => {
    gamesDone += 1;
    onProgress?.({
      phase,
      gamesDone,
      gamesTotal,
      phaseGamesDone,
      phaseGamesTotal: gamesPerMatch,
      game,
      outcome: outcomeFor(game),
    });
  };
  const r = await spsaStepAsync(cfg.level, session.theta, cfg.reference, book, session.k, cfg.masterSeed, cfg.hp, cfg.match, (progress) => {
    report(progress.probe === 'plus' ? 'theta+' : 'theta-', progress.stats.games, progress.record);
  }, control);
  const scored = await matchStatsAsync(cfg.level, decodeWeights(r.theta), cfg.reference, book, cfg.match, false, (progress) => {
    report('score', progress.stats.games, progress.record);
  }, control);
  return foldStep(session, scored.score, r);
}
