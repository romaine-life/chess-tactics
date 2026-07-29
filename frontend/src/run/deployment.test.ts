import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Level } from '../core/level';
import { chooseDraft, createRun, prepareDeployment, setDeploymentChoices, type RunDocument } from './model';
import { deploymentOptions, playerDeploymentCells } from './deployment';

function battle(): Level {
  const level = createBlankLevel('run-deploy', 'Deployment', 4, 4);
  level.layers.zones = [{
    id: 'player-zone',
    type: 'player-spawn',
    tiles: [[0, 2], [1, 2], [2, 2], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3]],
  }];
  level.layers.units = [
    { x: 0, y: 3, type: 'pawn', side: 'player' },
    { x: 3, y: 0, type: 'king', side: 'enemy' },
  ];
  return level;
}

function run(seed = 13): RunDocument {
  const level = battle();
  let result = createRun({
    id: 'war',
    name: 'War',
    description: '',
    battles: [{ level, loot: false }],
  }, seed);
  result = chooseDraft(result, result.draftOffers[0].draftId);
  return prepareDeployment(result);
}

describe('Run deployment', () => {
  it('treats authored units as obstacles and deals the same seed identically', () => {
    const level = battle();
    expect(playerDeploymentCells(level)).not.toContainEqual({ x: 0, y: 3 });
    const first = deploymentOptions(run(22), level);
    const second = deploymentOptions(run(22), level);
    expect(first.layouts).toEqual(second.layouts);
    expect(Object.values(first.layouts[0].placements)).not.toContainEqual({ x: 0, y: 3 });
  });

  it('never randomly blocks the permanently retained King', () => {
    const level = battle();
    level.layers.zones[0].tiles = [[1, 3], [2, 3], [3, 3]];
    const options = deploymentOptions(run(), level);
    expect(options.overflowCount).toBeGreaterThan(0);
    expect(options.layouts[0].blockedUnitIds).not.toContain('run-king');
  });

  it('requires and honors deliberate placement for Discipline', () => {
    const level = battle();
    let disciplined = run();
    disciplined = {
      ...disciplined,
      army: disciplined.army.map((unit) => unit.id === 'run-king'
        ? { ...unit, abilities: ['discipline'] }
        : unit),
    };
    let options = deploymentOptions(disciplined, level);
    expect(options.disciplineUnitIds).toContain('run-king');
    expect(options.layouts[0].placements['run-king']).toBeUndefined();
    disciplined = setDeploymentChoices(disciplined, { manualPlacements: { 'run-king': '1,3' } });
    options = deploymentOptions(disciplined, level);
    expect(options.layouts[0].placements['run-king']).toEqual({ x: 1, y: 3 });
  });

  it('keeps Royal Sceptre Kings on a board-edge square and Royal Decree Kings on the back row', () => {
    const level = battle();
    const royal = { ...run(), relics: ['royal-sceptre', 'royal-decree'] as RunDocument['relics'] };
    const king = deploymentOptions(royal, level).layouts[0].placements['run-king'];
    expect(king.y).toBe(3);
    expect(king.x === 0 || king.x === 3 || king.y === 0 || king.y === 3).toBe(true);
  });
});
