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
  type RunDeploymentMode,
  type RunWarSnapshot,
} from './model';
import {
  arrangedCardPlacementOptions,
  arrangedDeploymentCanBegin,
  beginArrangedBattle,
  beginDeploymentDeal,
  completeDeploymentDeal,
  deploymentFormationEntryDelta,
  deploymentInteractionStage,
  finishDeploymentCardDiscard,
  finishDeploymentCardReveal,
  finishDeploymentUnitSettlement,
  placeArrangedDeploymentCard,
  placeRevealedDeploymentUnit,
  revealActiveDeploymentCard,
  resolveForcedDeploymentChoices,
  removeArrangedDeploymentCard,
} from './deployment';

function fixture(
  rows = 8,
  columns = 8,
  seed = 17,
  cardIds: readonly string[] = [],
  deploymentMode: RunDeploymentMode = 'automatic',
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
  let assembled = createRun(war, seed, 0, { deploymentMode });
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

function revealFirstCard(run: RunDocument, level: ReturnType<typeof createBlankLevel>): RunDocument {
  return finishDeploymentCardReveal(revealActiveDeploymentCard(completeDeploymentDeal(beginDeploymentDeal(run), level)));
}

function cell(value: string): { x: number; y: number } {
  const [x, y] = value.split(',').map(Number);
  return { x, y };
}

describe('formation deployment', () => {
  it('keeps the explicit deal and reveal boundaries', () => {
    const { run, level } = fixture();
    expect(deploymentInteractionStage(run)).toBe('await-deal');
    const dealing = beginDeploymentDeal(run);
    expect(deploymentInteractionStage(dealing)).toBe('dealing');
    const dealt = completeDeploymentDeal(dealing, level);
    expect(deploymentInteractionStage(dealt)).toBe('reveal-card');
    const revealing = revealActiveDeploymentCard(dealt);
    expect(deploymentInteractionStage(revealing)).toBe('revealing-card');
    expect(deploymentInteractionStage(finishDeploymentCardReveal(revealing))).toBe('place');
  });

  it('places the whole protected starter triangle as one arrival wave', () => {
    const { run, level } = fixture();
    const revealed = revealFirstCard(run, level);
    const placed = placeRevealedDeploymentUnit(revealed, level);
    const card = placed.cards[0];
    const ids = runCardUnitIds(card);
    expect(placed.deployment?.settlingUnitIds).toEqual(ids);
    expect(deploymentInteractionStage(placed)).toBe('settling');
    const [king, leftPawn, rightPawn] = ids.map((id) => cell(placed.deployment!.placements[id]));
    expect(king.y - leftPawn.y).toBe(1);
    expect(king.x - leftPawn.x).toBe(1);
    expect(rightPawn.x - king.x).toBe(1);
    expect(rightPawn.y).toBe(leftPawn.y);
  });

  it('stages that rigid formation fully beyond the board right edge', () => {
    const { run, level } = fixture();
    const placed = placeRevealedDeploymentUnit(revealFirstCard(run, level), level);
    const placements = placed.deployment!.settlingUnitIds
      .map((id) => cell(placed.deployment!.placements[id]));

    expect(deploymentFormationEntryDelta(level, placements)).toEqual({ x: 8, y: 0 });
    expect(placements.map(({ x, y }) => ({ x: x + 8, y }))).toEqual([
      { x: 9, y: 4 },
      { x: 8, y: 3 },
      { x: 10, y: 3 },
    ]);
  });

  it('uses the board edge when the legal deployment band ends earlier', () => {
    const { level } = fixture(8, 3);
    level.layers.zones[0].tiles = level.layers.zones[0].tiles
      .filter(([x]) => x < 2);
    const placements = [{ x: 0, y: 4 }, { x: 0, y: 3 }, { x: 1, y: 3 }];
    const delta = deploymentFormationEntryDelta(level, placements);

    expect(delta).toEqual({ x: 3, y: 0 });
    expect(placements.every(({ x }) => x + delta.x >= level.board.cols)).toBe(true);
  });

  it('keeps the authored rows and settles the first formation against the left edge', () => {
    const { run, level } = fixture();
    const placed = placeRevealedDeploymentUnit(revealFirstCard(run, level), level);
    const [king, leftPawn, rightPawn] = runCardUnitIds(placed.cards[0])
      .map((id) => cell(placed.deployment!.placements[id]));

    expect({ king, leftPawn, rightPawn }).toEqual({
      king: { x: 1, y: 4 },
      leftPawn: { x: 0, y: 3 },
      rightPawn: { x: 2, y: 3 },
    });
  });

  it('slides the next rigid formation left until the settled card blocks its next shift', () => {
    const { run, level } = fixture(8, 8, 17, ['ppp']);
    let deployed = placeRevealedDeploymentUnit(revealFirstCard(run, level), level);
    deployed = finishDeploymentUnitSettlement(deployed, level);
    deployed = finishDeploymentCardDiscard(deployed);
    deployed = finishDeploymentCardReveal(revealActiveDeploymentCard(deployed));
    deployed = placeRevealedDeploymentUnit(deployed, level);

    const secondCard = deployed.cards.find((card) => card.coreId === 'ppp')!;
    const cells = runCardUnitIds(secondCard)
      .map((id) => cell(deployed.deployment!.placements[id]))
      .sort((left, right) => left.x - right.x);
    expect(cells).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
    ]);
  });

  it('persists one reusable plan for every unit on the active card', () => {
    const { run, level } = fixture();
    const placed = placeRevealedDeploymentUnit(revealFirstCard(run, level), level);
    const plan = placed.deployment?.formationPlans?.[placed.cards[0].id];
    expect(Object.keys(plan ?? {})).toEqual(runCardUnitIds(placed.cards[0]));
  });

  it('falls back to seeded individual legal squares when a full shape cannot fit', () => {
    const first = fixture(1, 8, 91);
    const second = fixture(1, 8, 91);
    const placedA = placeRevealedDeploymentUnit(revealFirstCard(first.run, first.level), first.level);
    const placedB = placeRevealedDeploymentUnit(revealFirstCard(second.run, second.level), second.level);
    expect(placedA.deployment?.placements).toEqual(placedB.deployment?.placements);
    expect(new Set(Object.values(placedA.deployment?.placements ?? {})).size).toBe(3);
    expect(new Set(Object.values(placedA.deployment?.placements ?? {}).map((value) => value.split(',')[1])).size).toBe(1);
  });

  it('cuts off overflow cleanly on a board smaller than the card', () => {
    const { run, level } = fixture(1, 2, 101);
    const placed = placeRevealedDeploymentUnit(revealFirstCard(run, level), level);
    expect(Object.keys(placed.deployment?.placements ?? {})).toHaveLength(2);
    expect(placed.deployment?.unavailableUnitIds).toHaveLength(1);
  });

  it('reveals the complete dealt hand at the arranged boundary', () => {
    const { run, level } = fixture(8, 8, 17, ['ppp'], 'arranged');
    const dealt = completeDeploymentDeal(beginDeploymentDeal(run), level);

    expect(deploymentInteractionStage(dealt)).toBe('arrange');
    expect(dealt.deployment?.revealedCardIds).toEqual(dealt.deployment?.dealtCardIds);
    expect(dealt.deployment?.transport).toBe('paused');
  });

  it('places, rotates, removes, and replaces a complete arranged formation', () => {
    const { run, level } = fixture(8, 8, 23, [], 'arranged');
    const arranging = completeDeploymentDeal(beginDeploymentDeal(run), level);
    const cardId = arranging.cards[0].id;
    const options = arrangedCardPlacementOptions(arranging, level, cardId, 0);

    expect(options.length).toBeGreaterThan(0);
    expect(arrangedCardPlacementOptions(arranging, level, cardId, 1)).toHaveLength(0);
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

  it('lets a one-row formation occupy either row of the deployment band', () => {
    const { run, level } = fixture(8, 8, 29, ['q'], 'arranged');
    const arranging = completeDeploymentDeal(beginDeploymentDeal(run), level);
    const queen = arranging.cards.find((card) => card.coreId === 'q')!;
    const options = arrangedCardPlacementOptions(arranging, level, queen.id, 0);

    expect(new Set(options.map(({ anchor }) => anchor.y))).toEqual(new Set([3, 4]));
  });

  it('begins arranged Battle with deliberately unplaced non-royal cards blocked', () => {
    const { run, level } = fixture(8, 8, 31, ['ppp'], 'arranged');
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
