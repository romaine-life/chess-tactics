import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  createRun,
  createRunCardOffer,
  leaveSectio,
  openSectio,
  performAdlectio,
  prepareDeployment,
  RUN_CARD_BY_ID,
  runCardUnitIds,
  type RunDocument,
  type RunWarSnapshot,
} from './model';
import {
  arrangedCardPlacementOptions,
  arrangedDeploymentCanBegin,
  beginArrangedBattle,
  beginDeploymentDeal,
  completeDeploymentDeal,
  deploymentInteractionStage,
  distinctCardRotations,
  nextCardRotation,
  placeArrangedDeploymentCard,
  resolveForcedDeploymentChoices,
  removeArrangedDeploymentCard,
} from './deployment';

function fixture(
  rows = 8,
  columns = 8,
  seed = 17,
  cardIds: readonly string[] = [],
): { run: RunDocument; level: ReturnType<typeof createBlankLevel> } {
  const level = createBlankLevel('formation-level', 'Formation Level', columns, rows + 3);
  level.layers.zones = [{
    id: 'player',
    type: 'player-spawn',
    tiles: Array.from({ length: rows }, (_, offset) => (
      Array.from({ length: columns }, (__, x) => [x, offset + 3] as [number, number])
    )).flat(),
  }];
  level.layers.units.push({ x: Math.min(columns - 1, 1), y: 0, type: 'king', side: 'enemy' });
  const war: RunWarSnapshot = {
    id: 'formation-war',
    name: 'Formation War',
    description: 'Deployment fixture.',
    battles: [{ level, loot: false }, { level: structuredClone(level), loot: false }],
  };
  let assembled = createRun(war, seed);
  if (cardIds.length) {
    assembled = openSectio(
      { ...assembled, phase: 'battle' },
      assembled.army.map((unit) => unit.id),
    );
  }
  cardIds.forEach((cardId, index) => {
    const definition = RUN_CARD_BY_ID[cardId];
    const offer = createRunCardOffer(assembled, definition, 0, 100 + index);
    assembled = {
      ...assembled,
      goldTenths: 10_000,
      sectio: {
        ...assembled.sectio!,
        cardOffers: [...assembled.sectio!.cardOffers, offer],
      },
    };
    assembled = performAdlectio(assembled, offer.offerId);
  });
  const ready = assembled.phase === 'sectio' ? leaveSectio(assembled) : assembled;
  const run = resolveForcedDeploymentChoices(prepareDeployment(ready), level);
  return { run, level };
}

describe('formation deployment', () => {
  it('keeps the explicit deal boundary and reveals the complete hand for arrangement', () => {
    const { run, level } = fixture();
    expect(deploymentInteractionStage(run)).toBe('await-deal');
    const dealing = beginDeploymentDeal(run);
    expect(deploymentInteractionStage(dealing)).toBe('dealing');
    const dealt = completeDeploymentDeal(dealing, level);
    expect(deploymentInteractionStage(dealt)).toBe('arrange');
    expect(dealt.deployment?.revealedCardIds).toEqual(dealt.deployment?.dealtCardIds);
  });

  it('reveals the complete dealt hand at the arranged boundary', () => {
    const { run, level } = fixture(8, 8, 17, ['ppp']);
    const dealt = completeDeploymentDeal(beginDeploymentDeal(run), level);

    expect(deploymentInteractionStage(dealt)).toBe('arrange');
    expect(dealt.deployment?.revealedCardIds).toEqual(dealt.deployment?.dealtCardIds);
    expect(dealt.deployment?.transport).toBe('paused');
  });

  it('places, rotates, removes, and replaces a complete arranged formation', () => {
    const { run, level } = fixture(8, 8, 23);
    const arranging = completeDeploymentDeal(beginDeploymentDeal(run), level);
    const cardId = arranging.cards[0].id;
    const options = arrangedCardPlacementOptions(arranging, level, cardId, 0);

    expect(options.length).toBeGreaterThan(0);
    expect(arrangedCardPlacementOptions(arranging, level, cardId, 1).length).toBeGreaterThan(0);
    const placed = placeArrangedDeploymentCard(arranging, level, cardId, 0, options.at(-1)!.anchor);
    expect(Object.keys(placed.deployment?.placements ?? {})).toEqual(runCardUnitIds(placed.cards[0]));
    expect(arrangedDeploymentCanBegin(placed)).toBe(true);

    const removed = removeArrangedDeploymentCard(placed, cardId);
    expect(removed.deployment?.placements).toEqual({});
    expect(arrangedDeploymentCanBegin(removed)).toBe(false);

    const rotated = arrangedCardPlacementOptions(removed, level, cardId, 2);
    expect(rotated.length).toBeGreaterThan(0);
    const replaced = placeArrangedDeploymentCard(removed, level, cardId, 2, rotated[0].anchor);
    expect(arrangedDeploymentCanBegin(replaced)).toBe(true);
  });

  it('lets a one-row formation occupy every row the level authored, not the first two', () => {
    const { run, level } = fixture(8, 8, 29, ['q']);
    const arranging = completeDeploymentDeal(beginDeploymentDeal(run), level);
    const queen = arranging.cards.find((card) => card.coreId === 'q')!;
    const options = arrangedCardPlacementOptions(arranging, level, queen.id, 0);

    expect(new Set(options.map(({ anchor }) => anchor.y)))
      .toEqual(new Set([3, 4, 5, 6, 7, 8, 9, 10]));
  });

  // A quarter turn trades a formation's width for depth, so the band's depth is what
  // decides whether it can stand up. Depth is the level's to author; it must not be
  // clamped to the two rows the generated card grammar happens to be tall.
  it('stands a three-wide formation up only where the band is deep enough', () => {
    const standing = (bandRows: number): number[] => {
      const { run, level } = fixture(bandRows, 6, 37, ['ppp']);
      const arranging = completeDeploymentDeal(beginDeploymentDeal(run), level);
      const line = arranging.cards.find((card) => card.coreId === 'ppp')!;
      return arrangedCardPlacementOptions(arranging, level, line.id, 1)
        .map(({ anchor }) => anchor.y);
    };

    expect(standing(2)).toEqual([]);
    expect(new Set(standing(3))).toEqual(new Set([3]));
    expect(standing(3)).toHaveLength(6);
  });

  // A symmetric formation maps onto itself under a turn, so offering both would give the
  // player two buttons that place the same unit types on the same squares.
  it('offers only the quarter turns that produce a different board', () => {
    const rotationsFor = (cardId: string): number[] => {
      const { run, level } = fixture(8, 8, 41, [cardId]);
      const arranging = completeDeploymentDeal(beginDeploymentDeal(run), level);
      const card = arranging.cards.find((candidate) => candidate.coreId === cardId)!;
      return distinctCardRotations(arranging, card.id);
    };

    // Four Pawns across read the same in both directions.
    expect(rotationsFor('f-01112131-pppp')).toEqual([0, 1]);
    // The same line with one Knight off-center does not.
    expect(rotationsFor('f-01112131-kppp')).toEqual([0, 1, 2, 3]);
    // A lone unit is the same shape whichever way it is turned.
    expect(rotationsFor('q')).toEqual([0]);
  });

  // Repeated turning walks the same turns the rail offers and nothing else, so the gesture can
  // never land on a rotation the player has no button for.
  it('cycles a repeated turn through the offered quarter turns and wraps', () => {
    expect(nextCardRotation([0, 1, 2, 3], 0)).toBe(1);
    expect(nextCardRotation([0, 1, 2, 3], 3)).toBe(0);

    // A four-across formation reads the same in both directions, so its cycle is two long.
    expect(nextCardRotation([0, 1], 0)).toBe(1);
    expect(nextCardRotation([0, 1], 1)).toBe(0);

    // A shape the band can only stand up one way holds still rather than flickering.
    expect(nextCardRotation([0], 0)).toBe(0);
    expect(nextCardRotation([], 2)).toBe(2);

    // A turn that has fallen out of the offered list restarts the cycle instead of sticking.
    expect(nextCardRotation([0, 2], 1)).toBe(0);
  });

  // The gesture and the rail must agree on the list, so a turn arrived at by clicking is one
  // the player could equally have pressed.
  it('cycles only through turns the band can actually accept', () => {
    const { run, level } = fixture(2, 6, 43, ['ppp']);
    const arranging = completeDeploymentDeal(beginDeploymentDeal(run), level);
    const line = arranging.cards.find((card) => card.coreId === 'ppp')!;
    const offered = distinctCardRotations(arranging, line.id).filter((rotation) => (
      arrangedCardPlacementOptions(arranging, level, line.id, rotation).length > 0
    ));

    // Three wide cannot stand up in a two-row band, so the standing turn is not on offer.
    expect(offered).toEqual([0]);
    expect(nextCardRotation(offered, 0)).toBe(0);
  });

  it('fits His Grace in the smallest two-by-two deployment band', () => {
    const { run, level } = fixture(2, 2, 30);
    const arranging = completeDeploymentDeal(beginDeploymentDeal(run), level);
    const hisGrace = arranging.cards.find((card) => card.coreId === 'his-grace')!;
    const options = arrangedCardPlacementOptions(arranging, level, hisGrace.id, 0);

    expect(options).toHaveLength(1);
    const placed = placeArrangedDeploymentCard(arranging, level, hisGrace.id, 0, options[0].anchor);
    expect(arrangedDeploymentCanBegin(placed)).toBe(true);
  });

  it('begins arranged Battle with deliberately unplaced non-royal cards blocked', () => {
    const { run, level } = fixture(8, 8, 31, ['ppp']);
    const arranging = completeDeploymentDeal(beginDeploymentDeal(run), level);
    const hisGrace = arranging.cards.find((card) => card.coreId === 'his-grace')!;
    const target = arrangedCardPlacementOptions(arranging, level, hisGrace.id, 0)[0];
    const placed = placeArrangedDeploymentCard(arranging, level, hisGrace.id, 0, target.anchor);
    const battle = beginArrangedBattle(placed);
    const other = battle.cards.find((card) => card.coreId === 'ppp')!;

    expect(battle.phase).toBe('battle');
    expect(battle.battleRuntime?.initiallyDeployedUnitIds).toEqual(runCardUnitIds(hisGrace));
    expect(battle.deployment?.blockedUnitIds).toEqual(expect.arrayContaining(runCardUnitIds(other)));
  });
});
