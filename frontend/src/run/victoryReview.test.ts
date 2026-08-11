import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Level } from '../core/level';
import { craftRunDocument, runCraftSpecFromJson } from './craft';
import {
  closeBattle,
  createRun,
  leaveAftermath,
  leaveSectio,
  normalizeRunDocument,
  performAdlectio,
  prepareDeployment,
  reviewSectioBattleReport,
  runPhaseKeepsBattleReport,
  takeVacantiaLipsanon,
  sectioBattleReport,
  type RunDocument,
  type RunWarSnapshot,
} from './model';

function battleLevel(id: string): Level {
  const level = createBlankLevel(id, id, 8, 8);
  level.layers.zones.push({
    id: `${id}-player-spawn`,
    type: 'player-spawn',
    tiles: Array.from({ length: 2 }, (_, row) => (
      Array.from({ length: 8 }, (__, x) => [x, 6 + row] as [number, number])
    )).flat(),
  });
  level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
  level.layers.units.push({ x: 3, y: 0, type: 'queen', side: 'enemy' });
  level.layers.units.push({ x: 2, y: 0, type: 'rook', side: 'enemy' });
  level.battle = { cardsDealt: 3 };
  return level;
}

/** Three Battles, so closing the first lands on a report and a Sectio rather than the War's end. */
function war(): RunWarSnapshot {
  return {
    id: 'victory-review-war',
    name: 'Victory Review War',
    description: 'Victory review fixture.',
    battles: [0, 1, 2].map((index) => ({ level: battleLevel(`battle-${index}`), loot: false })),
  };
}

function reported(): RunDocument {
  const run = createRun(war(), 7);
  const fighting: RunDocument = { ...run, phase: 'battle', battleIndex: 0, battleRuntime: null };
  return closeBattle(fighting, {
    survivingUnitIds: fighting.army.map((unit) => unit.id),
    turns: 9,
    standingEnemyValue: 12,
  });
}

describe('the Sectio can hand the player back to the Victory it came from', () => {
  it('keeps the Battle report through the Sectio its gold is spent in', () => {
    const sectio = leaveAftermath(reported());
    expect(sectio.phase).toBe('sectio');
    expect(sectioBattleReport(sectio)?.battleIndex).toBe(0);
    expect(sectioBattleReport(sectio)?.turns).toBe(9);
  });

  it('reopens the report without disturbing anything the Sectio did', () => {
    const sectio = leaveAftermath(reported());
    const bought = performAdlectio(sectio, sectio.sectio!.cardOffers
      .find((offer) => offer.cost * 10 <= sectio.goldTenths)!.offerId);
    const reviewing = reviewSectioBattleReport(bought);

    expect(reviewing.phase).toBe('aftermath');
    expect(reviewing.aftermath).toEqual(bought.aftermath);
    // A review and never a rewind: the purse, the Chartulary and the offer row are untouched.
    expect(reviewing.goldTenths).toBe(bought.goldTenths);
    expect(reviewing.cards).toEqual(bought.cards);
    expect(reviewing.sectio).toEqual(bought.sectio);
  });

  it('returns to the same Sectio instead of banking and dealing a second time', () => {
    const sectio = leaveAftermath(reported());
    const returned = leaveAftermath(reviewSectioBattleReport(sectio));

    expect(returned.phase).toBe('sectio');
    expect(returned.goldTenths).toBe(sectio.goldTenths);
    expect(returned.sectio).toEqual(sectio.sectio);
    expect(returned.sectioCardCursor).toBe(sectio.sectioCardCursor);
  });

  it('survives the round trip repeatedly', () => {
    const sectio = leaveAftermath(reported());
    let current = sectio;
    for (let pass = 0; pass < 3; pass += 1) {
      current = leaveAftermath(reviewSectioBattleReport(current));
    }
    expect(current.goldTenths).toBe(sectio.goldTenths);
    expect(current.sectio).toEqual(sectio.sectio);
  });

  it('retires the report when the Sectio is finally left for the next Battle', () => {
    const departed = prepareDeployment(leaveSectio(leaveAftermath(reported())));
    expect(departed.phase).toBe('deployment');
    expect(departed.aftermath).toBeNull();
    expect(reviewSectioBattleReport(departed)).toBe(departed);
  });

  it('offers nothing to review on a Sectio that kept no report', () => {
    const sectio = leaveAftermath(reported());
    const legacy: RunDocument = { ...sectio, aftermath: null };
    expect(sectioBattleReport(legacy)).toBeNull();
    expect(reviewSectioBattleReport(legacy)).toBe(legacy);
  });
});

describe('a retained report may only describe the Battle its screen followed', () => {
  it('is kept exactly through the report, Bona Vacantia and the Sectio', () => {
    expect(runPhaseKeepsBattleReport('aftermath')).toBe(true);
    expect(runPhaseKeepsBattleReport('bona-vacantia')).toBe(true);
    expect(runPhaseKeepsBattleReport('sectio')).toBe(true);
    for (const phase of ['deployment', 'battle', 'victory', 'commendatio'] as const) {
      expect(runPhaseKeepsBattleReport(phase)).toBe(false);
    }
  });

  it('is dropped from a document that leaked one forward', () => {
    const sectio = leaveAftermath(reported());
    const leaked: RunDocument = {
      ...sectio,
      aftermath: { ...sectio.aftermath!, battleIndex: 2 },
    };
    expect(normalizeRunDocument(leaked).aftermath).toBeNull();
  });

  it('is kept by a Sectio whose report is its own', () => {
    const sectio = leaveAftermath(reported());
    expect(normalizeRunDocument(sectio).aftermath).toEqual(sectio.aftermath);
  });
});

describe('a Conflict that opens on Bona Vacantia carries the report across it', () => {
  /**
   * Battle 0 closes a Conflict, so the lipsanon screen lands between the report and the Sectio.
   * A later loot Battle is what makes the NEXT Conflict open on one at all.
   */
  function lootWar(): RunWarSnapshot {
    return {
      id: 'victory-review-loot-war',
      name: 'Victory Review Loot War',
      description: 'Victory review loot fixture.',
      battles: [0, 1, 2].map((index) => ({
        level: battleLevel(`loot-battle-${index}`),
        loot: index === 0 || index === 2,
      })),
    };
  }

  it('keeps it through the lipsanon screen and into the Sectio that follows', () => {
    const run = createRun(lootWar(), 5);
    const closed = closeBattle({ ...run, phase: 'battle', battleIndex: 0, battleRuntime: null }, {
      survivingUnitIds: run.army.map((unit) => unit.id),
      turns: 11,
      standingEnemyValue: 6,
    });
    const vacantia = leaveAftermath(closed);
    expect(vacantia.phase).toBe('bona-vacantia');
    expect(vacantia.aftermath?.battleIndex).toBe(0);
    expect(normalizeRunDocument(vacantia).aftermath).toEqual(vacantia.aftermath);

    const sectio = takeVacantiaLipsanon(vacantia, vacantia.vacantia!.offers[0]);
    expect(sectio.phase).toBe('sectio');
    expect(sectioBattleReport(sectio)?.turns).toBe(11);
  });
});

describe('a crafted Sectio lands holding the Victory it followed', () => {
  it('carries the report of the Battle it left', () => {
    const crafted = craftRunDocument(runCraftSpecFromJson({ phase: 'sectio', battle: 3 }), war());
    expect(crafted.phase).toBe('sectio');
    expect(crafted.sectio!.afterBattleIndex).toBe(1);
    expect(sectioBattleReport(crafted)?.battleIndex).toBe(1);
    expect(reviewSectioBattleReport(crafted).phase).toBe('aftermath');
  });
});
