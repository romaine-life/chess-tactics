import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Level } from '../core/level';
import {
  buyCard,
  createRun,
  hasRunAbility,
  leaveShop,
  prepareDeployment,
  setDeploymentChoices,
  type RunArmyUnit,
  type RunDocument,
} from './model';
import {
  advanceAutomaticDeployment,
  advanceReadyDeployment,
  deploymentHasMeaningfulChoice,
  deploymentOptions,
  gameForRunDeployment,
  levelForRunDeployment,
  levelWithRunDeployment,
  playerDeploymentCells,
  resolveForcedDeploymentChoices,
} from './deployment';

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
  result = buyCard(result, result.shop!.cardOffers[0].offerId);
  result = leaveShop(result);
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
    level.layers.zones[0].tiles = [[1, 3]];
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

  it('commits directly to Battle when Deployment has no player choice', () => {
    const current = run();
    const options = deploymentOptions(current, battle());
    expect(deploymentHasMeaningfulChoice(current, options)).toBe(false);
    expect(advanceAutomaticDeployment(current, battle()).phase).toBe('battle');
  });

  it('keeps an unresolved Discipline choice on the battlefield and commits its final placement', () => {
    const level = battle();
    const current = run();
    const disciplined = {
      ...current,
      army: current.army.map((unit) => unit.id === 'run-king'
        ? { ...unit, abilities: ['discipline'] as RunArmyUnit['abilities'] }
        : unit),
    };
    expect(deploymentHasMeaningfulChoice(disciplined, deploymentOptions(disciplined, level))).toBe(true);
    expect(advanceAutomaticDeployment(disciplined, level).phase).toBe('deployment');

    const placed = setDeploymentChoices(disciplined, { manualPlacements: { 'run-king': '1,3' } });
    expect(advanceAutomaticDeployment(placed, level).phase).toBe('deployment');
    expect(advanceReadyDeployment(placed, level).phase).toBe('battle');
  });

  it('automatically resolves a Disciplined unit with only one legal square', () => {
    const level = battle();
    level.layers.zones[0].tiles = [[1, 3]];
    const current = run();
    const disciplined = {
      ...current,
      army: current.army.map((unit) => unit.id === 'run-king'
        ? { ...unit, abilities: ['discipline'] as RunArmyUnit['abilities'] }
        : unit),
    };
    const resolved = resolveForcedDeploymentChoices(disciplined, level);
    expect(resolved.deployment?.manualPlacements['run-king']).toBe('1,3');
    expect(advanceAutomaticDeployment(disciplined, level).phase).toBe('battle');
  });

  it('keeps Royal Sceptre Kings on a board-edge square and Royal Decree Kings on the back row', () => {
    const level = battle();
    const royal = { ...run(), relics: ['royal-sceptre', 'royal-decree'] as RunDocument['relics'] };
    const king = deploymentOptions(royal, level).layouts[0].placements['run-king'];
    expect(king.y).toBe(3);
    expect(king.x === 0 || king.x === 3 || king.y === 0 || king.y === 3).toBe(true);
  });

  it('derives relic grants through the same abilities stored on individual units', () => {
    const current = run();
    const king = current.army.find((unit) => unit.type === 'king')!;
    const inherited = {
      ...current,
      relics: ['royal-sceptre', 'royal-decree'] as RunDocument['relics'],
    };
    expect(hasRunAbility(inherited, king, 'positioned')).toBe(true);
    expect(hasRunAbility(inherited, king, 'marshalled')).toBe(true);

    const permanentKing = { ...king, abilities: ['positioned', 'marshalled'] as RunArmyUnit['abilities'] };
    const permanent = { ...current, army: current.army.map((unit) => unit.id === king.id ? permanentKing : unit) };
    expect(hasRunAbility(permanent, permanentKing, 'positioned')).toBe(true);
    expect(hasRunAbility(permanent, permanentKing, 'marshalled')).toBe(true);
    expect(deploymentOptions(permanent, battle()).layouts[0].placements['run-king']).toEqual(
      deploymentOptions(inherited, battle()).layouts[0].placements['run-king'],
    );
  });

  it('lets one Marshalled Bishop prefer the opposite color from an ordinary Bishop', () => {
    const current = run();
    const king = current.army.find((unit) => unit.type === 'king')!;
    const bishop = (id: string, number: number, abilities: RunArmyUnit['abilities']): RunArmyUnit => ({
      id,
      name: id,
      type: 'bishop',
      number,
      inspectionSeed: number,
      abilities,
      modifiers: [],
      source: 'shop',
    });
    const bishops = {
      ...current,
      army: [
        king,
        bishop('ordinary-bishop', 1, []),
        bishop('marshalled-bishop', 2, ['marshalled']),
      ],
    };
    const placements = deploymentOptions(bishops, battle()).layouts[0].placements;
    const ordinary = placements['ordinary-bishop'];
    const marshalled = placements['marshalled-bishop'];
    expect((ordinary.x + ordinary.y) % 2).not.toBe((marshalled.x + marshalled.y) % 2);
  });

  it('projects each persistent name with its unit identity into the Battle level', () => {
    const current = run();
    const layout = deploymentOptions(current, battle()).layouts[0];
    const projected = levelWithRunDeployment(current, battle(), layout);
    const persistentUnits = projected.layers.units.filter((unit) => unit.runUnitId && !unit.runUnitId.startsWith('run-tent-rock'));

    expect(persistentUnits).not.toHaveLength(0);
    for (const unit of persistentUnits) {
      expect(unit.runUnitName).toBe(current.army.find((candidate) => candidate.id === unit.runUnitId)?.name);
    }
  });

  it('keeps opponent pieces unresolved on the Deployment battlefield', () => {
    const level = battle();
    const current = run();
    const layout = deploymentOptions(current, level).layouts[0];
    const preview = levelForRunDeployment(current, level, layout);
    expect(preview.layers.units.some((unit) => unit.side === 'enemy')).toBe(false);
    expect(preview.layers.units.some((unit) => unit.side === 'player')).toBe(false);
  });

  it('feeds the live board compositor a passive position without resolving Battle spawns', () => {
    const level = battle();
    level.layers.zones.push({
      id: 'enemy-zone',
      type: 'enemy-spawn',
      tiles: [[0, 0], [1, 0]],
    });
    level.events = [{
      name: 'Enemy deployment',
      trigger: { kind: 'setup' },
      do: [{ kind: 'spawn', side: 'enemy', roster: { pawn: 1 }, zoneIds: ['enemy-zone'] }],
    }];
    const current = run();
    const layout = deploymentOptions(current, level).layouts[0];
    const game = gameForRunDeployment(current, level, layout);

    expect(game.pieces.some((piece) => piece.side === 'enemy')).toBe(false);
    expect(game.pieces.some((piece) => piece.id.startsWith('spawn-'))).toBe(false);
    expect(game.pieces.some((piece) => piece.id.startsWith('run-'))).toBe(false);
  });

  it('places committed Disciplined units before revealing the automatic formation', () => {
    const level = battle();
    const current = run();
    const king = current.army.find((unit) => unit.type === 'king')!;
    const other = current.army.find((unit) => unit.id !== king.id)!;
    const disciplined = {
      ...current,
      army: current.army.map((unit) => ({
        ...unit,
        abilities: [king.id, other.id].includes(unit.id)
          ? ['discipline'] as RunArmyUnit['abilities']
          : unit.abilities.filter((ability) => ability !== 'discipline'),
      })),
    };

    let options = deploymentOptions(disciplined, level);
    let preview = levelForRunDeployment(disciplined, level, options.layouts[0]);
    expect(preview.layers.units.filter((unit) => unit.runUnitId)).toEqual([]);
    expect(preview.layers.units.some((unit) => unit.side === 'enemy')).toBe(false);

    const firstPlaced = setDeploymentChoices(disciplined, {
      manualPlacements: { [king.id]: '1,3' },
    });
    options = deploymentOptions(firstPlaced, level);
    preview = levelForRunDeployment(firstPlaced, level, options.layouts[0]);
    expect(preview.layers.units.filter((unit) => unit.runUnitId).map((unit) => unit.runUnitId)).toEqual([king.id]);
    expect(preview.layers.units.find((unit) => unit.runUnitId === king.id)).toMatchObject({ x: 1, y: 3 });

    const allPlaced = setDeploymentChoices(firstPlaced, {
      manualPlacements: { [king.id]: '1,3', [other.id]: '2,3' },
    });
    options = deploymentOptions(allPlaced, level);
    preview = levelForRunDeployment(allPlaced, level, options.layouts[0]);
    const visibleRunUnits = preview.layers.units.filter((unit) => unit.runUnitId && !unit.runUnitId.startsWith('run-tent-rock-'));
    expect(visibleRunUnits.map((unit) => unit.runUnitId)).toEqual([king.id, other.id]);
    expect(visibleRunUnits.find((unit) => unit.runUnitId === king.id)).toMatchObject({ x: 1, y: 3 });
    expect(visibleRunUnits.find((unit) => unit.runUnitId === other.id)).toMatchObject({ x: 2, y: 3 });
  });
});
