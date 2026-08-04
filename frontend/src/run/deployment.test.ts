import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Level } from '../core/level';
import type { PlayablePieceType } from '../core/pieces';
import {
  chooseDeploymentMode,
  confirmKlerosis,
  currentDeploymentUnit,
  deploymentInteractionStage,
  deploymentOptions,
  disciplinePlacementCells,
  drawNextDeploymentUnit,
  placeAdlectedDeploymentUnit,
  placeRevealedDeploymentUnit,
  playerDeploymentPools,
  resolveDeploymentCapacity,
} from './deployment';
import {
  createRun,
  prepareDeployment,
  restartBattle,
  type RunAbility,
  type RunArmyUnit,
  type RunDocument,
  type RunOwnedCard,
} from './model';

function deploymentLevel(files = 8, deploymentRows = 5): Level {
  const rows = deploymentRows + 3;
  const level = createBlankLevel('deployment-test', 'Deployment Test', files, rows);
  level.layers.zones = [{
    id: 'player',
    type: 'player-spawn',
    tiles: Array.from({ length: deploymentRows }, (_, offset) => (
      Array.from({ length: files }, (__, x) => [x, offset + 3] as [number, number])
    )).flat(),
  }];
  level.layers.units = [{ x: Math.floor(files / 2), y: 0, type: 'king', side: 'enemy' }];
  return level;
}

function unit(
  id: string,
  type: PlayablePieceType,
  abilities: RunAbility[] = [],
): RunArmyUnit {
  return {
    id,
    name: id,
    type,
    number: 1,
    inspectionSeed: 1,
    abilities,
    modifiers: [],
    source: type === 'king' ? 'king' : 'adlectio',
  };
}

function ownedCard(id: string, coreId: string, unitIds: string[]): RunOwnedCard {
  return {
    id,
    coreId,
    cardType: null,
    effectSeed: 0,
    effectTargetUnitId: null,
    unitIds,
    lostUnitIds: [],
    cacochymicUnitId: null,
    acquiredAfterBattleIndex: 0,
  };
}

function baseRun(level: Level, seed = 17): RunDocument {
  const created = createRun({ id: 'war', name: 'War', description: '', battles: [{ level, loot: false }] }, seed, '2026-01-01T00:00:00.000Z');
  return { ...created, phase: 'deployment', sectio: null, vacantia: null, deployment: null };
}

function queuedRun(level: Level, army: RunArmyUnit[], seed = 17): RunDocument {
  let run = prepareDeployment({ ...baseRun(level, seed), army });
  const queueUnitIds = [
    ...army.filter((candidate) => candidate.type === 'king').map((candidate) => candidate.id),
    ...army.filter((candidate) => candidate.type !== 'king').map((candidate) => candidate.id),
  ];
  run = {
    ...run,
    deployment: {
      ...run.deployment!,
      queueUnitIds,
      deployingUnitIds: [...queueUnitIds],
      unavailableUnitIds: [],
      capacityResolved: true,
      placements: {},
      placementCursor: 0,
      stage: 'klerosis',
      blockedUnitIds: [],
      manualPlacements: {},
    },
  };
  return run;
}

function deployAll(run: RunDocument, level: Level): RunDocument {
  let next = chooseDeploymentMode(confirmKlerosis(run, level), level, 'deploy-all');
  while (next.phase === 'deployment') {
    const active = currentDeploymentUnit(next);
    if (!active) break;
    const options = deploymentOptions(next, level);
    const cell = disciplinePlacementCells(next, options, active.id)[0];
    if (!cell) throw new Error(`Deployment paused without a legal Adlected cell for ${active.id}`);
    next = placeAdlectedDeploymentUnit(next, level, cell);
  }
  return next;
}

function placement(run: RunDocument, level: Level, unitId: string): { x: number; y: number } {
  const cell = deploymentOptions(run, level).layouts[0].placements[unitId];
  if (!cell) throw new Error(`${unitId} was not placed`);
  return cell;
}

describe('Klerosis', () => {
  it('deals His Grace first, then two seeded ordinary cards in the first Conflict', () => {
    const level = deploymentLevel();
    const created = baseRun(level, 211);
    const extras = Array.from({ length: 7 }, (_, index) => ownedCard(`extra-${index}`, 'p', [`extra-unit-${index}`]));
    const army = [
      ...created.army,
      ...extras.map((card, index) => unit(card.unitIds[0], 'pawn', index % 2 ? ['eutactic'] : [])),
    ];
    const run = prepareDeployment({ ...created, army, cards: [...created.cards, ...extras] });
    expect(run.deployment?.dealtCardIds).toHaveLength(3);
    expect(run.deployment?.dealtCardIds[0]).toBe('run-card-his-grace');
    expect(run.deployment?.stage).toBe('klerosis');
    expect(run.deployment?.mode).toBeUndefined();
  });

  it('freshly reseeds ordinary card order and adds one draw per Conflict', () => {
    const level = deploymentLevel();
    const make = (seed: number, conflictIndex: number): RunDocument => {
      const created = baseRun(level, seed);
      const extras = Array.from({ length: 10 }, (_, index) => ownedCard(`extra-${index}`, 'p', []));
      return prepareDeployment({ ...created, conflictIndex, cards: [...created.cards, ...extras] });
    };
    expect(make(1, 0).deployment?.dealtCardIds).not.toEqual(make(2, 0).deployment?.dealtCardIds);
    expect(make(1, 2).deployment?.dealtCardIds).toHaveLength(5);
  });

  it('uses the same hidden queue for capacity admission and later placement', () => {
    const level = deploymentLevel(2, 1);
    const army = [unit('king', 'king', ['primogeniture']), unit('a', 'pawn'), unit('b', 'rook')];
    const queued = queuedRun(level, army);
    const resolved = resolveDeploymentCapacity({
      ...queued,
      deployment: { ...queued.deployment!, capacityResolved: false },
    }, level);
    expect(resolved.deployment?.queueUnitIds).toEqual(['king', 'a']);
    expect(resolved.deployment?.deployingUnitIds).toEqual(['king', 'a']);
    expect(resolved.deployment?.unavailableUnitIds).toContain('b');
  });

  it('requires the visible deal to be confirmed before pace can be selected', () => {
    const level = deploymentLevel();
    const run = queuedRun(level, [unit('king', 'king', ['primogeniture']), unit('pawn', 'pawn')]);
    expect(chooseDeploymentMode(run, level, 'deploy-all')).toBe(run);

    const confirmed = confirmKlerosis(run, level);
    expect(confirmed.deployment?.stage).toBe('primogeniture');
    expect(confirmed.deployment?.mode).toBeUndefined();
    expect(deploymentInteractionStage(confirmed)).toBe('pace');

    const paced = chooseDeploymentMode(confirmed, level, 'step-through');
    expect(paced.deployment?.mode).toBe('step-through');
    expect(deploymentInteractionStage(paced)).toBe('primogeniture');
  });
});

describe('Primogeniture and Farrago interaction', () => {
  it('places the King before revealing the first random unit', () => {
    const level = deploymentLevel();
    const run = queuedRun(level, [
      unit('king', 'king', ['primogeniture']),
      unit('pawn', 'pawn'),
    ]);
    let stepped = chooseDeploymentMode(confirmKlerosis(run, level), level, 'step-through');
    expect(deploymentInteractionStage(stepped)).toBe('primogeniture');
    expect(currentDeploymentUnit(stepped)?.id).toBe('king');
    stepped = placeRevealedDeploymentUnit(stepped, level);
    expect(deploymentInteractionStage(stepped)).toBe('draw');
    expect(stepped.deployment?.revealedUnitId).toBeUndefined();
    stepped = drawNextDeploymentUnit(stepped);
    expect(deploymentInteractionStage(stepped)).toBe('place');
    expect(stepped.deployment?.revealedUnitId).toBe('pawn');
    stepped = placeRevealedDeploymentUnit(stepped, level);
    expect(stepped.phase).toBe('battle');
  });

  it('deploy-all pauses exactly when an Adlected unit reaches the front', () => {
    const level = deploymentLevel();
    const run = queuedRun(level, [
      unit('king', 'king', ['primogeniture']),
      unit('pawn', 'pawn', ['adlected']),
      unit('rook', 'rook'),
    ]);
    let fast = chooseDeploymentMode(confirmKlerosis(run, level), level, 'deploy-all');
    expect(fast.phase).toBe('deployment');
    expect(fast.deployment?.placementCursor).toBe(1);
    expect(deploymentInteractionStage(fast)).toBe('adlected');
    const cell = disciplinePlacementCells(fast, deploymentOptions(fast, level), 'pawn')[0];
    fast = placeAdlectedDeploymentUnit(fast, level, cell);
    expect(fast.phase).toBe('battle');
    expect(fast.battleRuntime?.initiallyDeployedUnitIds).toEqual(expect.arrayContaining(['king', 'pawn', 'rook']));
  });

  it('can switch pace without undoing revealed information or placements', () => {
    const level = deploymentLevel();
    let run = queuedRun(level, [unit('king', 'king', ['primogeniture']), unit('pawn', 'pawn')]);
    run = chooseDeploymentMode(confirmKlerosis(run, level), level, 'step-through');
    run = placeRevealedDeploymentUnit(run, level);
    run = drawNextDeploymentUnit(run);
    const revealed = run.deployment?.revealedUnitId;
    const kingCell = run.deployment?.placements.king;
    const switched = { ...run, deployment: { ...run.deployment!, mode: 'deploy-all' as const } };
    expect(switched.deployment?.revealedUnitId).toBe(revealed);
    expect(switched.deployment?.placements.king).toBe(kingCell);
  });
});

describe('best-fit unit rules', () => {
  it.each([
    ['pawn', 3],
    ['knight', 4],
    ['bishop', 4],
    ['rook', 7],
    ['queen', 7],
    ['king', 7],
  ] as const)('puts an Eutactic %s on its formation row', (type, expectedY) => {
    const level = deploymentLevel(8, 5);
    const abilities: RunAbility[] = type === 'king' ? ['primogeniture', 'eutactic'] : ['eutactic'];
    const finished = deployAll(queuedRun(level, [unit(type, type, abilities)], 50), level);
    expect(placement(finished, level, type).y).toBe(expectedY);
  });

  it('falls back to the closest open Eutactic row', () => {
    const level = deploymentLevel(4, 4);
    level.layers.units.push(...Array.from({ length: 4 }, (_, x) => ({ x, y: 3, type: 'rock' as const, side: 'neutral' as const })));
    const finished = deployAll(queuedRun(level, [unit('pawn', 'pawn', ['eutactic'])]), level);
    expect(placement(finished, level, 'pawn').y).toBe(4);
  });

  it('puts an Agminate Queen in the middle of the board', () => {
    const level = deploymentLevel(7, 4);
    const finished = deployAll(queuedRun(level, [unit('queen', 'queen', ['agminate'])], 4), level);
    expect(placement(finished, level, 'queen')).toEqual({ x: 3, y: 3 });
  });

  it('puts an Agminate Knight one square in from an edge', () => {
    const level = deploymentLevel(7, 4);
    const finished = deployAll(queuedRun(level, [unit('knight', 'knight', ['agminate'])], 5), level);
    const cell = placement(finished, level, 'knight');
    expect(Math.min(cell.x, cell.y, level.board.cols - 1 - cell.x, level.board.rows - 1 - cell.y)).toBe(1);
  });

  it('puts an Agminate King on the board edge', () => {
    const level = deploymentLevel(7, 4);
    const finished = deployAll(queuedRun(level, [unit('king', 'king', ['primogeniture', 'agminate'])], 6), level);
    const cell = placement(finished, level, 'king');
    expect(Math.min(cell.x, cell.y, level.board.cols - 1 - cell.x, level.board.rows - 1 - cell.y)).toBe(0);
  });

  it('puts an Agminate Rook on an outer back-row square', () => {
    const level = deploymentLevel(7, 4);
    const finished = deployAll(queuedRun(level, [
      unit('king', 'king', ['primogeniture']),
      unit('rook', 'rook', ['agminate']),
    ], 7), level);
    const cell = placement(finished, level, 'rook');
    expect(cell.y).toBe(6);
    expect([0, 6]).toContain(cell.x);
  });

  it('flanks an Agminate King with the first Agminate Rook when possible', () => {
    const level = deploymentLevel(7, 4);
    const finished = deployAll(queuedRun(level, [
      unit('king', 'king', ['primogeniture', 'agminate']),
      unit('rook', 'rook', ['agminate']),
    ], 8), level);
    const king = placement(finished, level, 'king');
    const rook = placement(finished, level, 'rook');
    expect(Math.abs(king.x - rook.x) + Math.abs(king.y - rook.y)).toBe(1);
  });

  it('finds an open file using permanent level obstructions, not combat units', () => {
    const level = deploymentLevel(5, 2);
    level.layers.terrain = Array.from({ length: 5 }, (_, x) => ({
      x,
      y: 1,
      elevation: 0,
      terrain: x === 2 || x === 3 ? 'grass' as const : 'rock' as const,
    }));
    level.layers.units.push(
      { x: 2, y: 2, type: 'rock', side: 'neutral' },
      { x: 3, y: 2, type: 'rook', side: 'enemy' },
    );
    const finished = deployAll(queuedRun(level, [unit('pawn', 'pawn', ['agminate'])], 9), level);
    expect(placement(finished, level, 'pawn').x).toBe(3);
  });

  it('treats Pawn adjacency and an open file as equal conditions with a seeded tie', () => {
    const level = deploymentLevel(5, 1);
    level.layers.terrain = Array.from({ length: 5 }, (_, x) => ({ x, y: 1, elevation: 0, terrain: x === 0 ? 'grass' as const : 'rock' as const }));
    const results = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const finished = deployAll(queuedRun(level, [unit('plain', 'pawn'), unit('affinity', 'pawn', ['agminate'])], seed), level);
      const plain = placement(finished, level, 'plain');
      const affinity = placement(finished, level, 'affinity');
      results.add(affinity.x === 0 ? 'open' : Math.abs(plain.x - affinity.x) === 1 ? 'adjacent' : 'fallback');
    }
    expect(results).toContain('open');
    expect(results).toContain('adjacent');
    expect(results).not.toContain('fallback');
  });

  it('chooses the nearest opposite-color square for an Agminate Bishop', () => {
    const level = deploymentLevel(6, 3);
    const finished = deployAll(queuedRun(level, [unit('plain', 'bishop'), unit('affinity', 'bishop', ['agminate'])], 23), level);
    const plain = placement(finished, level, 'plain');
    const affinity = placement(finished, level, 'affinity');
    expect((plain.x + plain.y) % 2).not.toBe((affinity.x + affinity.y) % 2);
    expect(Math.abs(plain.x - affinity.x) + Math.abs(plain.y - affinity.y)).toBe(1);
  });
});

describe('retired pawn-only geometry and retries', () => {
  it('ignores retired Pawn zones and pawn exclusions at runtime', () => {
    const level = deploymentLevel(3, 1);
    level.layers.zones[0].excludedPieceTypes = ['pawn'];
    level.layers.zones.push({ id: 'retired', type: 'player-pawn-spawn', tiles: [[7, 7]] } as never);
    const pools = playerDeploymentPools(level);
    expect(pools.byType.pawn).toEqual(pools.all);
    expect(pools.all).not.toContainEqual({ x: 7, y: 7 });
  });

  it('restarts from the exact persisted deal, queue, choices, and formation', () => {
    const level = deploymentLevel();
    const battle = deployAll(queuedRun(level, [unit('king', 'king', ['primogeniture']), unit('pawn', 'pawn')], 99), level);
    const before = JSON.stringify(battle.deployment);
    const retried = restartBattle(battle);
    expect(JSON.stringify(retried.deployment)).toBe(before);
    expect(retried.battleRuntime?.initiallyDeployedUnitIds).toEqual(battle.deployment?.deployingUnitIds);
  });
});
