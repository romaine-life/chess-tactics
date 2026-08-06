import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  createRun,
  leaveSectio,
  prepareDeployment,
  runCardUnitIds,
  type RunDocument,
  type RunWarSnapshot,
} from './model';
import {
  beginDeploymentDeal,
  completeDeploymentDeal,
  deploymentInteractionStage,
  finishDeploymentCardReveal,
  placeRevealedDeploymentUnit,
  revealActiveDeploymentCard,
  resolveForcedDeploymentChoices,
} from './deployment';

function fixture(rows = 8, columns = 8, seed = 17): { run: RunDocument; level: ReturnType<typeof createBlankLevel> } {
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
    battles: [{ level, loot: false }],
  };
  const run = resolveForcedDeploymentChoices(prepareDeployment(leaveSectio(createRun(war, seed))), level);
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
});
