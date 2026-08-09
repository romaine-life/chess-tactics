import { describe, expect, it } from 'vitest';
import { LEVEL_BATTLE_CARDS_DEALT_DEFAULT, createBlankLevel, type Level } from '../core/level';
import {
  createRun,
  createRunCardOffer,
  isRunStarterCardId,
  openSectio,
  performAdlectio,
  RUN_CARD_BY_ID,
  runCardUnitIds,
  sectioUpcomingBattleIndex,
  type RunDocument,
  type RunWarSnapshot,
} from './model';
import {
  playerDeploymentCells,
  runDeploymentLevelUnits,
  shuffledDeploymentPreview,
} from './deployment';

/**
 * A Sectio holding real adlected cards, standing before a Battle whose band is `bandRows` deep.
 * Exploratio is a Sectio-only surface, so the fixture is the state it is actually read from.
 */
function sectioFixture({
  bandRows = 3,
  columns = 6,
  seed = 41,
  cardIds = ['ppp', 'pp', 'pb-front'] as readonly string[],
} = {}): { run: RunDocument; level: Level; battleIndex: number } {
  const level = createBlankLevel('preview-level', 'Preview Level', columns, bandRows + 3);
  level.layers.zones = [{
    id: 'player',
    type: 'player-spawn',
    tiles: Array.from({ length: bandRows }, (_, offset) => (
      Array.from({ length: columns }, (__, x) => [x, offset + 3] as [number, number])
    )).flat(),
  }];
  level.layers.units.push({ x: 1, y: 0, type: 'king', side: 'enemy' });
  level.battle = { loot: false, cardsDealt: LEVEL_BATTLE_CARDS_DEALT_DEFAULT };
  const war: RunWarSnapshot = {
    id: 'preview-war',
    name: 'Preview War',
    description: 'Exploratio fixture.',
    battles: [{ level, loot: false }, { level: structuredClone(level), loot: false }],
  };
  // Adlectio is how a Run comes to hold cards, so the fixture buys them rather than writing them
  // into the document — a hand assembled by hand would not carry real army units in its seats.
  let run = openSectio({ ...createRun(war, seed), phase: 'battle' }, []);
  cardIds.forEach((cardId, index) => {
    const offer = createRunCardOffer(run, RUN_CARD_BY_ID[cardId], 0, 200 + index);
    run = {
      ...run,
      goldTenths: 10_000,
      sectio: { ...run.sectio!, cardOffers: [...run.sectio!.cardOffers, offer] },
    };
    run = performAdlectio(run, offer.offerId);
  });
  return { run, level, battleIndex: sectioUpcomingBattleIndex(run) };
}

const cellKey = (cell: { x: number; y: number }): string => `${cell.x},${cell.y}`;

describe('Exploratio shuffled deployment preview', () => {
  it('seats every unit on a legal band square, one to a square', () => {
    const { run, level, battleIndex } = sectioFixture();
    const band = new Set(playerDeploymentCells(level).map(cellKey));

    // Several shuffles, because a single arrangement passing says nothing about the next one.
    for (let shuffle = 1; shuffle <= 12; shuffle += 1) {
      const preview = shuffledDeploymentPreview({ run, level, battleIndex, shuffle });
      const seats = Object.values(preview.layout.placements);
      expect(seats.length).toBeGreaterThan(0);
      for (const seat of seats) expect(band.has(cellKey(seat))).toBe(true);
      expect(new Set(seats.map(cellKey)).size).toBe(seats.length);
    }
  });

  it('deals the Battle’s own count, the King’s card among it, and never more than is held', () => {
    const { run, level, battleIndex } = sectioFixture();
    const preview = shuffledDeploymentPreview({ run, level, battleIndex, shuffle: 1 });

    expect(preview.cards).toHaveLength(LEVEL_BATTLE_CARDS_DEALT_DEFAULT);
    expect(preview.cards.some(({ card }) => isRunStarterCardId(card.coreId))).toBe(true);

    // A hand smaller than the deal is dealt whole rather than padded.
    const small = sectioFixture({ cardIds: ['pp'] });
    const smallPreview = shuffledDeploymentPreview({
      run: small.run,
      level: small.level,
      battleIndex: small.battleIndex,
      shuffle: 1,
    });
    expect(smallPreview.cards).toHaveLength(small.run.cards.length);
  });

  it('places an admitted card whole or not at all', () => {
    const { run, level, battleIndex } = sectioFixture();
    const preview = shuffledDeploymentPreview({ run, level, battleIndex, shuffle: 5 });
    const placements = preview.layout.placements;

    for (const entry of preview.cards) {
      const unitIds = runCardUnitIds(entry.card);
      const seated = unitIds.filter((unitId) => placements[unitId]);
      expect(seated.length === 0 || seated.length === unitIds.length).toBe(true);
      expect(entry.placed).toBe(seated.length === unitIds.length);
      if (!entry.admitted) expect(entry.placed).toBe(false);
    }
    expect(preview.placedUnitCount).toBe(Object.keys(placements).length);
  });

  it('admits only what the band has room for', () => {
    // Two squares: His Grace's card alone claims more than that, so nothing is admitted at all.
    const { run, level, battleIndex } = sectioFixture({ bandRows: 1, columns: 2 });
    const preview = shuffledDeploymentPreview({ run, level, battleIndex, shuffle: 1 });

    expect(playerDeploymentCells(level)).toHaveLength(2);
    expect(preview.placedUnitCount).toBeLessThanOrEqual(2);
    for (const entry of preview.cards) {
      if (!entry.admitted) expect(entry.placed).toBe(false);
    }
  });

  it('repeats an arrangement for the same shuffle and offers a different one for the next', () => {
    const { run, level, battleIndex } = sectioFixture();
    const shot = (shuffle: number): string => JSON.stringify(
      shuffledDeploymentPreview({ run, level, battleIndex, shuffle }).layout.placements,
    );

    expect(shot(3)).toBe(shot(3));
    // Not every consecutive pair has to differ, but a run of them that never does is not a shuffle.
    const arrangements = new Set([1, 2, 3, 4, 5, 6].map(shot));
    expect(arrangements.size).toBeGreaterThan(1);
  });

  it('is pure reconnaissance: the Run document is untouched', () => {
    const { run, level, battleIndex } = sectioFixture();
    const before = JSON.stringify(run);

    for (let shuffle = 1; shuffle <= 4; shuffle += 1) {
      shuffledDeploymentPreview({ run, level, battleIndex, shuffle });
    }

    expect(JSON.stringify(run)).toBe(before);
  });

  it('projects the seated army as player-side level units the board can paint', () => {
    const { run, level, battleIndex } = sectioFixture();
    const preview = shuffledDeploymentPreview({ run, level, battleIndex, shuffle: 2 });
    const units = runDeploymentLevelUnits(run, level, preview.layout);

    expect(units).toHaveLength(preview.placedUnitCount);
    for (const unit of units) {
      expect(unit.side).toBe('player');
      expect(preview.layout.placements[unit.runUnitId!]).toEqual({ x: unit.x, y: unit.y });
    }
  });
});
