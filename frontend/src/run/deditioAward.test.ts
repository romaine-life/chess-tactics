import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Level } from '../core/level';
import {
  closeBattle,
  createRun,
  deditioGoldTenths,
  leaveAftermath,
  levelEnemyForceValue,
  migrateRunSaveDocument,
  RUN_DEDITIO_TENTHS_PER_POINT,
  standingEnemyForceValue,
  standingForceValue,
  type RunDocument,
  type RunWarSnapshot,
} from './model';

/** An enemy force of a King, a Queen, a Rook and a Pawn: 15 points that can be surrendered. */
function battleLevel(id: string): Level {
  const level = createBlankLevel(id, id, 8, 8);
  level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
  level.layers.units.push({ x: 3, y: 0, type: 'queen', side: 'enemy' });
  level.layers.units.push({ x: 2, y: 0, type: 'rook', side: 'enemy' });
  level.layers.units.push({ x: 1, y: 1, type: 'pawn', side: 'enemy' });
  level.battle = { cardsDealt: 3 };
  return level;
}

/** A three-Battle War, so closing the first lands on a real aftermath rather than the War's
 * own victory screen. */
function war(): RunWarSnapshot {
  return {
    id: 'deditio-war',
    name: 'Deditio War',
    description: 'Deditio fixture.',
    battles: [0, 1, 2].map((index) => ({ level: battleLevel(`battle-${index}`), loot: false })),
  };
}

function fighting(): RunDocument {
  const run = createRun(war(), 11);
  return { ...run, phase: 'battle', battleIndex: 0, battleRuntime: null };
}

function won(standingEnemyValue: number): RunDocument {
  const run = fighting();
  return closeBattle(run, {
    survivingUnitIds: run.army.map((unit) => unit.id),
    turns: 9,
    standingEnemyValue,
  });
}

describe('what the board reports as still standing', () => {
  it('counts living enemy units and prices the King and obstacles at nothing', () => {
    expect(standingEnemyForceValue([
      { side: 'enemy', alive: true, type: 'queen' },
      { side: 'enemy', alive: true, type: 'rook' },
      { side: 'enemy', alive: true, type: 'king' },
      { side: 'enemy', alive: true, type: 'obstacle' },
    ])).toBe(14);
  });

  it('ignores the dead and the player entirely', () => {
    expect(standingEnemyForceValue([
      { side: 'enemy', alive: false, type: 'queen' },
      { side: 'player', alive: true, type: 'queen' },
    ])).toBe(0);
  });

  // The Run roster has no promotion concept, so a queened enemy pawn surrenders as the Pawn it
  // was bought as -- the same reading ADR-0540 gave every other comparison of unit worth.
  it('values a promoted unit as what it started as', () => {
    expect(standingEnemyForceValue([
      { side: 'enemy', alive: true, type: 'queen', promotedFrom: 'pawn' },
    ])).toBe(1);
  });

  it('reads a level force the same way, for a Battle nobody has fought', () => {
    expect(levelEnemyForceValue(battleLevel('b'))).toBe(15);
  });

  // The title bar's material readout asks the same question about BOTH forces (ADR-0578), so the
  // side is an argument rather than a second reduce written beside this one. The point of one
  // reader is that the number a player watches during the Battle is the number the mate is
  // priced on: `standingEnemyForceValue` is now this function with the enemy filled in.
  it('answers for whichever side is asked, and agrees with the enemy reader', () => {
    const board = [
      { side: 'player', alive: true, type: 'rook' },
      { side: 'player', alive: true, type: 'king' },
      { side: 'player', alive: false, type: 'queen' },
      { side: 'enemy', alive: true, type: 'queen', promotedFrom: 'pawn' },
      { side: 'enemy', alive: true, type: 'knight' },
    ];

    expect(standingForceValue(board, 'player')).toBe(5);
    expect(standingForceValue(board, 'enemy')).toBe(4);
    expect(standingForceValue(board, 'enemy')).toBe(standingEnemyForceValue(board));
  });

  it('scores an emptied side as nothing rather than refusing to answer', () => {
    expect(standingForceValue([{ side: 'enemy', alive: true, type: 'rook' }], 'player')).toBe(0);
  });
});

describe('the mate is paid for what the enemy still had', () => {
  it('pays the catalog rate per point standing', () => {
    expect(deditioGoldTenths(15)).toBe(15 * RUN_DEDITIO_TENTHS_PER_POINT);
    expect(deditioGoldTenths(15)).toBe(30);
  });

  it('pays nothing for a King ground down to nothing', () => {
    expect(deditioGoldTenths(0)).toBe(0);
    expect(won(0).aftermath!.goldTenths).toBe(won(0).aftermath!.goldTenths);
    expect(won(15).aftermath!.goldTenths - won(0).aftermath!.goldTenths).toBe(30);
  });

  it('folds it into the gold the aftermath reports', () => {
    const closed = won(15);
    expect(closed.aftermath!.standingEnemyValue).toBe(15);
    expect(closed.aftermath!.goldTenths).toBeGreaterThan(won(0).aftermath!.goldTenths);
  });

  // The screen quotes a number and Continue banks one. They are the same number read twice --
  // priced from the stored count, never from a board that is gone by then.
  it('banks exactly what the report showed', () => {
    const closed = won(15);
    const before = closed.goldTenths;
    const banked = leaveAftermath(closed);
    expect(banked.goldTenths - before).toBe(closed.aftermath!.goldTenths);
  });

  it('refuses a nonsense count rather than banking one', () => {
    const closed = closeBattle(fighting(), {
      survivingUnitIds: [],
      turns: 9,
      standingEnemyValue: Number.NaN,
    });
    expect(closed.aftermath!.standingEnemyValue).toBe(0);
  });
});

describe('a Run already parked on a report', () => {
  // It earned its gold under the old rules and its total is settled, so the field arrives as
  // the zero it truthfully was and Continue banks exactly what the screen has been showing.
  it('gains a standing count of zero rather than a Deditio it never earned', () => {
    // A report settled before any of this existed paid no Deditio, so its total is exactly
    // what a mate with nothing standing pays today. That is the document to migrate.
    const settled = won(0);
    const stored = JSON.parse(JSON.stringify({ ...settled, runSaveVersion: 35 }));
    delete stored.aftermath.standingEnemyValue;
    const migrated = migrateRunSaveDocument(stored);
    expect(migrated.aftermath!.standingEnemyValue).toBe(0);
    expect(migrated.aftermath!.goldTenths).toBe(settled.aftermath!.goldTenths);
    // Continue banks the total the screen has been showing all along, not one point more.
    expect(leaveAftermath(migrated).goldTenths - migrated.goldTenths)
      .toBe(migrated.aftermath!.goldTenths);
  });
});
