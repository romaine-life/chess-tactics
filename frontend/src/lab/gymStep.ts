// The gym's SPSA step as a PURE reducer: (config, session, book) -> (point, next
// session). Extracted from the worker's message handler so the retention arithmetic
// — k advancing, the trajectory growing by one, and the champion / "established"
// bookkeeping — is unit-testable in node (the worker shell touches `self`, which a
// node test can't import). The worker is now a thin message wrapper around this.

import { spsaStep, type MatchOptions, type SpsaHyperParams } from '../game/tuning';
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

/** Run ONE SPSA step from `session` over `book` and return the appended point plus
 * the updated session to persist. Pure and deterministic in (config, session, book):
 * the step is seeded by (masterSeed, session.k), so replaying a session's k
 * re-derives its trajectory. The champion advances only on a strict improvement, and
 * `established` counts steps since it last improved (reset to 0 on improvement). */
export function advanceSession(
  cfg: StepConfig,
  session: GymSession,
  book: BookPosition[],
): { point: GymPoint; session: GymSession } {
  const r = spsaStep(cfg.level, session.theta, cfg.reference, book, session.k, cfg.masterSeed, cfg.hp, cfg.match);
  const score = (r.yPlus + r.yMinus) / 2; // midpoint proxy — no extra games
  const point: GymPoint = { step: session.k, score, yPlus: r.yPlus, yMinus: r.yMinus, c: r.c, a: r.a, theta: r.theta.slice() };

  const improved = score > session.champion.score;
  const champion = improved ? { step: session.k, score, theta: r.theta.slice() } : session.champion;
  const established = improved ? 0 : session.established + 1;

  const next: GymSession = {
    k: session.k + 1,
    theta: r.theta,
    champion,
    established,
    traj: [...session.traj, point],
  };
  return { point, session: next };
}
