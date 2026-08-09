import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlankLevel, type Level } from '../core/level';
import { speedBonusTenths } from '../core/speedBonus';
import {
  closeBattle,
  createRun,
  leaveAftermath,
  type RunDocument,
  type RunWarSnapshot,
} from './model';

const START_MS = 1_800_000_000_000;

function battleLevel(id: string, parTurns?: number): Level {
  const level = createBlankLevel(id, id, 8, 8);
  level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
  level.layers.units.push({ x: 2, y: 0, type: 'rook', side: 'enemy' });
  level.battle = { cardsDealt: 3 };
  if (parTurns !== undefined) level.parTurns = parTurns;
  return level;
}

/** A three-Battle War: the first Battle carries the par under test, so closing it lands on a
 * real aftermath rather than on the War's own victory screen. */
function war(parTurns?: number): RunWarSnapshot {
  return {
    id: 'speed-war',
    name: 'Speed War',
    description: 'Speed-bonus fixture.',
    battles: [0, 1, 2].map((index) => ({
      level: battleLevel(`battle-${index}`, index === 0 ? parTurns : undefined),
      loot: false,
    })),
  };
}

/** A Run standing on Battle 0, started `elapsedMs` ago by the frozen clock. */
function fighting(parTurns: number | undefined, elapsedMs: number): RunDocument {
  const run = createRun(war(parTurns), 11);
  return {
    ...run,
    phase: 'battle',
    battleIndex: 0,
    battleRuntime: {
      battleIndex: 0,
      startedAtMs: Date.now() - elapsedMs,
      initiallyDeployedUnitIds: [],
      reserveUnitIds: [],
      reservistPoolUnitIds: [],
      deployedReservistUnitIds: [],
      observedDeadUnitIds: [],
      reinforcementSequence: 0,
    },
  };
}

const report = (run: RunDocument) => ({ survivingUnitIds: run.army.map((unit) => unit.id), turns: 9 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START_MS);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a won Battle pays for the clock it had left', () => {
  it('folds the speed bonus into the gold the aftermath reports', () => {
    // A 10-turn par is a 5:00 bonus clock; won in 2:30, half of it is still standing.
    const fast = closeBattle(fighting(10, 150_000), report(fighting(10, 150_000)));
    const slow = closeBattle(fighting(10, 600_000), report(fighting(10, 600_000)));

    const expected = speedBonusTenths(fast.war.battles[0].level, 150_000);
    expect(expected).toBeGreaterThan(0);
    expect(fast.aftermath!.goldTenths - slow.aftermath!.goldTenths).toBe(expected);
    // The overrun banks the Battle's own reward and nothing on top of it.
    expect(speedBonusTenths(slow.war.battles[0].level, 600_000)).toBe(0);
  });

  it('reports the elapsed time it paid on, so the screen can re-derive the same number', () => {
    const closed = closeBattle(fighting(10, 90_000), report(fighting(10, 90_000)));
    expect(closed.aftermath!.elapsedMs).toBe(90_000);
    expect(speedBonusTenths(closed.war.battles[0].level, closed.aftermath!.elapsedMs)).toBeGreaterThan(0);
  });

  it('pays nothing when the Battle’s start was never recorded', () => {
    const run = fighting(10, 0);
    const noStart: RunDocument = { ...run, battleRuntime: { ...run.battleRuntime!, startedAtMs: undefined } };
    const closed = closeBattle(noStart, report(noStart));
    expect(closed.aftermath!.elapsedMs).toBeNull();
    expect(closed.aftermath!.goldTenths).toBe(closeBattle(fighting(1, 600_000), report(run)).aftermath!.goldTenths);
  });
});

describe('what the screen says it won is what the Run receives', () => {
  it('banks exactly the gold the aftermath reported', () => {
    const closed = closeBattle(fighting(10, 60_000), report(fighting(10, 60_000)));
    const banked = leaveAftermath(closed);
    expect(banked.goldTenths - closed.goldTenths).toBe(closed.aftermath!.goldTenths);
  });

  it('does not shrink the bonus while the player sits on the report', () => {
    const closed = closeBattle(fighting(10, 60_000), report(fighting(10, 60_000)));
    const promised = closed.aftermath!.goldTenths;

    // Read the report for a quarter of an hour -- far past the bonus clock itself.
    vi.setSystemTime(START_MS + 900_000);
    const banked = leaveAftermath(closed);

    expect(banked.goldTenths - closed.goldTenths).toBe(promised);
  });

  it('still pays the un-tuned levels, off the board’s estimated par', () => {
    const closed = closeBattle(fighting(undefined, 30_000), report(fighting(undefined, 30_000)));
    expect(closed.war.battles[0].level.parTurns).toBeUndefined();
    expect(closed.aftermath!.goldTenths)
      .toBeGreaterThan(closeBattle(fighting(undefined, 3_600_000), report(fighting(undefined, 0))).aftermath!.goldTenths);
  });
});
