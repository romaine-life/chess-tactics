// The Battle's speed reward (ADR-0539). Two ideas that are deliberately NOT the same thing:
//
//   - PAR is the level's turn budget: how many turns the board is expected to take. It is
//     authored in moves, hand-tuned per level, and read as a benchmark on the victory screen.
//   - SPEED is the clock. Par sizes a per-Battle bonus clock (par turns x a fixed per-turn
//     allowance), and whatever is LEFT on that clock when the Battle is won pays a small
//     gold bonus.
//
// The bonus clock is NOT the authored `timeControl`. Running it out costs the bonus and
// nothing else: no flag falls, no Battle is lost, and the player who wants to sit and
// calculate may. Only the reward moves. That is what keeps a speed incentive from turning a
// tactics game into a blitz game, and it is why this does not reuse the ClockState machinery
// in game/store.ts (whose expiry is a defeat).
//
// The bonus is small on purpose -- a nudge toward decisive play, never a reason to play badly
// and fast. See SPEED_BONUS_MAX_TENTHS against the Battle rewards in run/model.ts.

import { LEVEL_PAR_TURNS_MAX, LEVEL_PAR_TURNS_MIN, type Level } from './level';
import { spawnEventsForLevel } from './levelEvents';

/**
 * How much bonus clock one par turn is worth. This is the single knob that converts an
 * authored par IN MOVES into a budget IN SECONDS, so a level author only ever tunes one
 * number. Thirty seconds a turn is a deliberate pace: brisk play banks most of the clock,
 * a deliberate player banks some, and only genuinely long deliberation zeroes it.
 */
export const SPEED_BONUS_SECONDS_PER_PAR_TURN = 30;

/** The most a single Battle's speed can pay, in gold. Against a Battle reward that typically
 * runs 50-100 gold and a mean card price near 34, this reads as a bonus and never as the
 * point of the fight. */
export const SPEED_BONUS_MAX_TENTHS = 10;

const clampPar = (turns: number): number => Math.min(
  LEVEL_PAR_TURNS_MAX,
  Math.max(LEVEL_PAR_TURNS_MIN, Math.round(turns)),
);

/** Every enemy the board will field -- the units placed on it plus the ones its setup spawn
 * events bring in. Mirrors how battleVictoryGoldTenths counts the opposition, so par and the
 * Battle's own reward are derived from the same force. */
function enemyUnitCount(level: Level): number {
  const placed = level.layers.units.reduce((total, unit) => total + (unit.side === 'enemy' ? 1 : 0), 0);
  const spawned = spawnEventsForLevel(level)
    .filter((event) => event.side === 'enemy')
    .reduce((total, event) => total + (Object.values(event.roster) as ReadonlyArray<number | undefined>)
      .reduce<number>((rosterTotal, count) => rosterTotal + (count ?? 0), 0), 0);
  return placed + spawned;
}

/**
 * The par a level gets when nobody has authored one -- an ESTIMATE, not a measurement, so
 * that the speed bonus works on content that predates the field instead of quietly paying
 * nothing. Two turns per enemy (approach, then take it) plus a small fixed allowance for
 * getting the army moving at all.
 *
 * A `survive` board is the exception: it cannot be won before its own turn target, so that
 * target IS its par whenever the level authors one.
 */
export function derivedParTurns(level: Level): number {
  if (level.objective === 'survive' && level.surviveTurns !== undefined) return clampPar(level.surviveTurns);
  return clampPar(2 * enemyUnitCount(level) + 4);
}

/** The level's par in turns: what its author set, else the derived estimate. */
export function levelParTurns(level: Level): number {
  return level.parTurns !== undefined ? clampPar(level.parTurns) : derivedParTurns(level);
}

/** The size of this level's bonus clock, in milliseconds. */
export function speedBonusClockMs(level: Level): number {
  return levelParTurns(level) * SPEED_BONUS_SECONDS_PER_PAR_TURN * 1000;
}

/** What is left of the bonus clock after a Battle that took `elapsedMs`. Never negative;
 * a Battle whose start was never recorded (elapsedMs null) has nothing to measure and
 * banks nothing. */
export function speedBonusRemainingMs(level: Level, elapsedMs: number | null): number {
  if (elapsedMs === null || !Number.isFinite(elapsedMs)) return 0;
  return Math.max(0, speedBonusClockMs(level) - Math.max(0, elapsedMs));
}

/**
 * The speed bonus a won Battle pays, in gold: the fraction of the bonus clock still
 * standing, scaled to the cap and rounded to whole gold. Pure and deterministic in
 * (level, elapsedMs) -- which is what lets the aftermath screen re-derive the same number
 * the Run banks, without the persisted report having to carry it.
 */
export function speedBonusTenths(level: Level, elapsedMs: number | null): number {
  const clockMs = speedBonusClockMs(level);
  if (clockMs <= 0) return 0;
  const fraction = speedBonusRemainingMs(level, elapsedMs) / clockMs;
  return Math.round(Math.min(1, Math.max(0, fraction)) * SPEED_BONUS_MAX_TENTHS);
}
