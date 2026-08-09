import { describe, expect, it } from 'vitest';
import {
  createBlankLevel,
  LEVEL_PAR_TURNS_MAX,
  LEVEL_PAR_TURNS_MIN,
  validateLevel,
  type Level,
} from './level';
import {
  derivedParTurns,
  levelParTurns,
  speedBonusClockMs,
  speedBonusRemainingMs,
  speedBonusTenths,
  SPEED_BONUS_MAX_TENTHS,
  SPEED_BONUS_SECONDS_PER_PAR_TURN,
} from './speedBonus';
import { editorBoardToLevel, levelToEditorBoard } from './levelBoard';
import { levelEditorLevelSignature } from '../ui/levelEditorSignature';

/** A board with `enemies` enemy pieces on it — one King plus that many Pawns behind it. */
function board(enemies: number, extra: Partial<Level> = {}): Level {
  const level = createBlankLevel('speed', 'Speed', 8, 8);
  level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
  for (let i = 1; i < enemies; i += 1) level.layers.units.push({ x: i, y: 1, type: 'pawn', side: 'enemy' });
  level.layers.units.push({ x: 4, y: 7, type: 'king', side: 'player' });
  return { ...level, ...extra };
}

const minutes = (m: number): number => m * 60_000;

describe('par is authored in turns, and estimated when it is not', () => {
  it('prefers the authored par over the board’s estimate', () => {
    const level = board(3, { parTurns: 21 });
    expect(levelParTurns(level)).toBe(21);
    expect(derivedParTurns(level)).not.toBe(21);
  });

  it('estimates from the enemy force when nothing is authored', () => {
    // Two turns an enemy plus the fixed allowance: approach it, then take it.
    expect(levelParTurns(board(1))).toBe(2 * 1 + 4);
    expect(levelParTurns(board(5))).toBe(2 * 5 + 4);
  });

  it('reads a survive board’s own turn target as its par, since it cannot be won sooner', () => {
    const level = board(3, { objective: 'survive', surviveTurns: 12 });
    expect(levelParTurns(level)).toBe(12);
    // ...but only when the level authors one; otherwise it falls back to the board estimate.
    expect(levelParTurns(board(3, { objective: 'survive' }))).toBe(2 * 3 + 4);
  });

  it('holds a stored par to the schema bounds rather than sizing an absurd clock', () => {
    expect(levelParTurns(board(3, { parTurns: 0 }))).toBe(LEVEL_PAR_TURNS_MIN);
    expect(levelParTurns(board(3, { parTurns: -5 }))).toBe(LEVEL_PAR_TURNS_MIN);
    expect(levelParTurns(board(3, { parTurns: 5_000 }))).toBe(LEVEL_PAR_TURNS_MAX);
  });
});

describe('par sizes the bonus clock', () => {
  it('is par turns times the per-turn allowance', () => {
    expect(speedBonusClockMs(board(3, { parTurns: 12 })))
      .toBe(12 * SPEED_BONUS_SECONDS_PER_PAR_TURN * 1000);
  });

  it('never reports negative time left on an overrun', () => {
    const level = board(3, { parTurns: 2 }); // a 1:00 clock
    expect(speedBonusRemainingMs(level, minutes(10))).toBe(0);
  });
});

describe('the speed bonus is what is left of that clock', () => {
  const level = board(3, { parTurns: 10 }); // 10 x 30s = a 5:00 clock

  it('pays the cap when the Battle costs no time at all', () => {
    expect(speedBonusTenths(level, 0)).toBe(SPEED_BONUS_MAX_TENTHS);
  });

  it('scales linearly with the clock still standing', () => {
    expect(speedBonusTenths(level, minutes(2.5))).toBe(SPEED_BONUS_MAX_TENTHS / 2);
    expect(speedBonusTenths(level, minutes(4))).toBe(Math.round(SPEED_BONUS_MAX_TENTHS * 0.2));
  });

  it('pays nothing once the clock is spent, and never less than nothing', () => {
    expect(speedBonusTenths(level, minutes(5))).toBe(0);
    expect(speedBonusTenths(level, minutes(45))).toBe(0);
  });

  it('pays nothing when the Battle’s start was never recorded', () => {
    expect(speedBonusTenths(level, null)).toBe(0);
  });

  it('stays small — a nudge, never the point of the fight', () => {
    // One gold at a perfect clock, against a Battle reward that runs 5-10 gold.
    expect(SPEED_BONUS_MAX_TENTHS).toBeLessThanOrEqual(10);
  });

  it('is a pure function of the level and the elapsed time, so it can be re-derived', () => {
    expect(speedBonusTenths(level, minutes(1))).toBe(speedBonusTenths(level, minutes(1)));
  });
});

describe('the estimate agrees with itself across surfaces', () => {
  it('survives the editor’s board round-trip, so the panel and the Run read one number', () => {
    // The Level Editor estimates from its live candidate (board -> Level), while the Run
    // estimates from the stored Level. If the projection dropped units the author would tune
    // against a par the Battle does not play to.
    const stored = board(5);
    const projected = editorBoardToLevel(levelToEditorBoard(stored), {
      id: stored.id,
      name: stored.name,
      objective: stored.objective,
    });
    expect(derivedParTurns(projected)).toBe(derivedParTurns(stored));
  });
});

describe('par as stored level content', () => {
  const withPar = (parTurns: unknown): Level => ({ ...board(2), parTurns } as unknown as Level);

  it('validates as a whole count inside the bounds', () => {
    expect(validateLevel(withPar(LEVEL_PAR_TURNS_MIN)).ok).toBe(true);
    expect(validateLevel(withPar(LEVEL_PAR_TURNS_MAX)).ok).toBe(true);
    expect(validateLevel(withPar(LEVEL_PAR_TURNS_MAX + 1)).ok).toBe(false);
    expect(validateLevel(withPar(0)).ok).toBe(false);
    expect(validateLevel(withPar(7.5)).ok).toBe(false);
    expect(validateLevel(withPar('12')).ok).toBe(false);
    // Optional: a level that never authored one stays valid, and reads the estimate.
    expect(validateLevel(board(2)).ok).toBe(true);
  });

  it('changes the editor’s dirty signature, so tuning par is a saveable edit', () => {
    expect(levelEditorLevelSignature(withPar(12))).not.toBe(levelEditorLevelSignature(board(2)));
    expect(levelEditorLevelSignature(withPar(12))).not.toBe(levelEditorLevelSignature(withPar(13)));
  });
});
