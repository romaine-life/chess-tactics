import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Level } from '../core/level';
import type { PlayablePieceType } from '../core/pieces';
import {
  advanceDeploymentTransport,
  beginDeploymentDeal,
  completeDeploymentDeal,
  currentDeploymentUnit,
  deploymentInteractionStage,
  deploymentOptions,
  disciplinePlacementCells,
  finishDeploymentCardDiscard,
  finishDeploymentCardReveal,
  finishDeploymentUnitSettlement,
  placeAdlectedDeploymentUnit,
  placeRevealedDeploymentUnit,
  playerDeploymentPools,
  resolveDeploymentCapacity,
  revealActiveDeploymentCard,
  setDeploymentTransport,
} from './deployment';
import {
  GOLD_SCALE,
  RUN_BATTLE_DEPLOYMENT_REROLL_COST_TENTHS,
  RUN_BATTLE_RETRY_COST_TENTHS,
  createRun,
  prepareDeployment,
  rerollDeployment,
  restartBattle,
  runCardUnitIds,
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

function unit(id: string, type: PlayablePieceType, abilities: RunAbility[] = []): RunArmyUnit {
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

function ownedCard(id: string, coreId: string, unitSeats: Array<string | null>): RunOwnedCard {
  return {
    id,
    coreId,
    cardType: null,
    effectSeed: 0,
    effectTargetUnitId: null,
    unitSeats,
    lostUnitIds: [],
    cacochymicUnitId: null,
    acquiredAfterBattleIndex: 0,
  };
}

function baseRun(level: Level, seed = 17): RunDocument {
  const created = createRun(
    { id: 'war', name: 'War', description: '', battles: [{ level, loot: false }] },
    seed,
    '2026-01-01T00:00:00.000Z',
  );
  return { ...created, phase: 'deployment', sectio: null, vacantia: null, deployment: null };
}

function orderedRun(
  level: Level,
  army: RunArmyUnit[],
  seed = 17,
  groups: Array<Array<string | null>> = army.map((candidate) => [candidate.id]),
): RunDocument {
  const cards = groups.map((seats, index) => {
    const firstUnit = seats.flatMap((id) => army.find((candidate) => candidate.id === id) ?? [] )[0];
    const isKing = firstUnit?.type === 'king';
    return ownedCard(isKing ? 'run-card-his-grace' : `card-${index}`, isKing ? 'his-grace' : `card-${index}`, seats);
  });
  return prepareDeployment({ ...baseRun(level, seed), army, cards });
}

function advanceLifecycle(
  run: RunDocument,
  level: Level,
  transport: 'paused' | 'playing' | 'full-deploy' = 'full-deploy',
): RunDocument {
  let next = setDeploymentTransport(completeDeploymentDeal(beginDeploymentDeal(run), level), transport);
  for (let guard = 0; next.phase === 'deployment' && guard < 100; guard += 1) {
    const stage = deploymentInteractionStage(next);
    if (stage === 'reveal-card') next = revealActiveDeploymentCard(next);
    else if (stage === 'revealing-card') next = finishDeploymentCardReveal(next);
    else if (stage === 'place') next = placeRevealedDeploymentUnit(next, level);
    else if (stage === 'adlected') {
      const active = currentDeploymentUnit(next);
      if (!active) throw new Error('Adlected stage has no active unit');
      const cell = disciplinePlacementCells(next, deploymentOptions(next, level), active.id)[0];
      if (!cell) throw new Error(`Deployment paused without a legal Adlected cell for ${active.id}`);
      next = placeAdlectedDeploymentUnit(next, level, cell);
    } else if (stage === 'settling') next = finishDeploymentUnitSettlement(next, level);
    else if (stage === 'discarding') next = finishDeploymentCardDiscard(next);
    else throw new Error(`Unexpected deployment stage ${stage}`);
  }
  return next;
}

function placement(run: RunDocument, level: Level, unitId: string): { x: number; y: number } {
  const cell = deploymentOptions(run, level).layouts[0].placements[unitId];
  if (!cell) throw new Error(`${unitId} was not placed`);
  return cell;
}

describe('deployment card deal', () => {
  it('deals His Grace first, then two freshly seeded ordinary cards in the first Conflict', () => {
    const level = deploymentLevel();
    const created = baseRun(level, 211);
    const extras = Array.from({ length: 7 }, (_, index) => ownedCard(`extra-${index}`, 'p', [`extra-unit-${index}`]));
    const army = [
      ...created.army,
      ...extras.map((card, index) => unit(runCardUnitIds(card)[0], 'pawn', index % 2 ? ['eutactic'] : [])),
    ];
    const run = prepareDeployment({ ...created, army, cards: [...created.cards, ...extras] });
    expect(run.deployment?.dealtCardIds).toHaveLength(3);
    expect(run.deployment?.dealtCardIds[0]).toBe('run-card-his-grace');
    expect(run.deployment?.stage).toBe('awaiting-deal');
    expect(run.deployment?.transport).toBe('paused');
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

  it('uses card order and stable left-to-right seats for capacity and placement', () => {
    const level = deploymentLevel(2, 1);
    const army = [unit('king', 'king'), unit('a', 'pawn'), unit('b', 'rook')];
    const prepared = orderedRun(level, army, 17, [['king'], ['a', 'b']]);
    const resolved = resolveDeploymentCapacity(prepared, level);
    expect(resolved.deployment?.deployingUnitIds).toEqual(['king', 'a']);
    expect(resolved.deployment?.unavailableUnitIds).toContain('b');
  });

  it('preserves empty seats without letting them delay the next surviving unit', () => {
    const level = deploymentLevel();
    const army = [unit('king', 'king'), unit('a', 'pawn'), unit('b', 'rook')];
    const run = orderedRun(level, army, 17, [['king'], [null, 'a', null, 'b']]);
    const finished = advanceLifecycle(run, level);
    expect(finished.phase).toBe('battle');
    expect(Object.keys(finished.deployment?.placements ?? {})).toEqual(['king', 'a', 'b']);
  });

  it('keeps the face-down partition paused after an ordinary Deal', () => {
    const level = deploymentLevel();
    const run = orderedRun(level, [unit('king', 'king'), unit('pawn', 'pawn')]);
    expect(deploymentInteractionStage(run)).toBe('await-deal');
    expect(setDeploymentTransport(run, 'full-deploy')).toBe(run);
    const dealing = beginDeploymentDeal(run);
    expect(deploymentInteractionStage(dealing)).toBe('dealing');
    const dealt = completeDeploymentDeal(dealing, level);
    expect(dealt.deployment?.transport).toBe('paused');
    expect(deploymentInteractionStage(dealt)).toBe('reveal-card');
    expect(advanceDeploymentTransport(dealt, level)).toBe(dealt);
    expect(dealt.deployment?.revealedCardIds).toEqual([]);
  });

  it.each(['playing', 'full-deploy'] as const)('carries a pre-deal %s intent through Deal', (transport) => {
    const level = deploymentLevel();
    const run = orderedRun(level, [unit('king', 'king'), unit('pawn', 'pawn')]);
    const dealing = beginDeploymentDeal(run, transport);
    expect(dealing.deployment?.transport).toBe(transport);
    const dealt = completeDeploymentDeal(dealing, level);
    expect(dealt.deployment?.transport).toBe(transport);
    expect(deploymentInteractionStage(dealt)).toBe('reveal-card');
  });
});

describe('card reveal, placement, and discard boundaries', () => {
  it('reveals, settles, and discards His Grace before advancing to the next card', () => {
    const level = deploymentLevel();
    let run = completeDeploymentDeal(
      beginDeploymentDeal(orderedRun(level, [unit('king', 'king'), unit('pawn', 'pawn')])),
      level,
    );
    expect(deploymentInteractionStage(run)).toBe('reveal-card');
    run = revealActiveDeploymentCard(run);
    expect(run.deployment?.revealedCardIds).toEqual(['run-card-his-grace']);
    expect(deploymentInteractionStage(run)).toBe('revealing-card');
    run = finishDeploymentCardReveal(run);
    expect(currentDeploymentUnit(run)?.id).toBe('king');
    run = placeRevealedDeploymentUnit(run, level);
    expect(deploymentInteractionStage(run)).toBe('settling');
    expect(run.deployment?.activeCardIndex).toBe(0);
    run = finishDeploymentUnitSettlement(run, level);
    expect(deploymentInteractionStage(run)).toBe('discarding');
    run = finishDeploymentCardDiscard(run);
    expect(run.deployment?.activeCardIndex).toBe(1);
    expect(deploymentInteractionStage(run)).toBe('reveal-card');
  });

  it('full deploy commits every remaining automatic card as one arrival wave, then discards the stack', () => {
    const level = deploymentLevel();
    const run = orderedRun(
      level,
      [unit('king', 'king'), unit('pawn', 'pawn'), unit('rook', 'rook')],
      17,
      [['king'], ['pawn'], ['rook']],
    );
    const dealt = completeDeploymentDeal(beginDeploymentDeal(run, 'full-deploy'), level);
    const fast = advanceDeploymentTransport(dealt, level);

    expect(deploymentInteractionStage(fast)).toBe('settling');
    expect(fast.deployment?.settlingUnitIds).toHaveLength(3);
    expect(fast.deployment?.settlingUnitIds).toEqual(expect.arrayContaining(['king', 'pawn', 'rook']));
    expect(fast.deployment?.placements).toEqual(expect.objectContaining({
      king: expect.any(String),
      pawn: expect.any(String),
      rook: expect.any(String),
    }));
    expect(fast.deployment?.activeCardIndex).toBe(fast.deployment?.dealtCardIds.length);
    expect(fast.deployment?.discardCursor).toBe(0);
    expect(fast.deployment?.revealedCardIds).toEqual([]);

    const landed = finishDeploymentUnitSettlement(fast, level);
    expect(deploymentInteractionStage(landed)).toBe('discarding');
    const battle = finishDeploymentCardDiscard(landed);
    expect(battle.phase).toBe('battle');
    expect(battle.deployment?.discardCursor).toBe(battle.deployment?.dealtCardIds.length);
  });

  it('full deploy pauses at Adlected only after the preceding automatic wave settles and discards', () => {
    const level = deploymentLevel();
    const run = orderedRun(
      level,
      [unit('king', 'king'), unit('pawn', 'pawn', ['adlected']), unit('rook', 'rook')],
      17,
      [['king'], ['pawn', 'rook']],
    );
    const dealt = completeDeploymentDeal(beginDeploymentDeal(run), level);
    let fast = advanceDeploymentTransport(setDeploymentTransport(dealt, 'full-deploy'), level);
    expect(deploymentInteractionStage(fast)).toBe('settling');
    expect(fast.deployment?.settlingUnitIds).toEqual(['king']);
    expect(fast.deployment?.activeCardIndex).toBe(1);
    expect(fast.deployment?.revealedCardIds).toEqual(['card-1']);
    expect(fast.deployment?.transport).toBe('paused');

    fast = finishDeploymentUnitSettlement(fast, level);
    expect(deploymentInteractionStage(fast)).toBe('discarding');
    fast = finishDeploymentCardDiscard(fast);
    expect(deploymentInteractionStage(fast)).toBe('adlected');
    const cell = disciplinePlacementCells(fast, deploymentOptions(fast, level), 'pawn')[0];
    fast = placeAdlectedDeploymentUnit(fast, level, cell);
    expect(deploymentInteractionStage(fast)).toBe('settling');
    expect(fast.deployment?.settlingUnitIds).toEqual(['pawn']);
    expect(fast.deployment?.transport).toBe('paused');
  });

  it('switches transport without undoing revealed information or placements', () => {
    const level = deploymentLevel();
    let run = completeDeploymentDeal(
      beginDeploymentDeal(orderedRun(level, [unit('king', 'king'), unit('pawn', 'pawn')])),
      level,
    );
    run = revealActiveDeploymentCard(run);
    run = finishDeploymentCardReveal(run);
    run = placeRevealedDeploymentUnit(run, level);
    const revealed = run.deployment?.revealedCardIds;
    const kingCell = run.deployment?.placements.king;
    const switched = setDeploymentTransport(run, 'full-deploy');
    expect(switched.deployment?.revealedCardIds).toEqual(revealed);
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
    const finished = advanceLifecycle(orderedRun(level, [unit(type, type, ['eutactic'])], 50), level);
    expect(placement(finished, level, type).y).toBe(expectedY);
  });

  it('falls back to the closest open Eutactic row', () => {
    const level = deploymentLevel(4, 4);
    level.layers.units.push(...Array.from({ length: 4 }, (_, x) => ({ x, y: 3, type: 'rock' as const, side: 'neutral' as const })));
    const finished = advanceLifecycle(orderedRun(level, [unit('pawn', 'pawn', ['eutactic'])]), level);
    expect(placement(finished, level, 'pawn').y).toBe(4);
  });

  it('puts an Agminate Queen in the middle of the board', () => {
    const level = deploymentLevel(7, 4);
    const finished = advanceLifecycle(orderedRun(level, [unit('queen', 'queen', ['agminate'])], 4), level);
    expect(placement(finished, level, 'queen')).toEqual({ x: 3, y: 3 });
  });

  it('puts an Agminate Knight one square in from an edge', () => {
    const level = deploymentLevel(7, 4);
    const finished = advanceLifecycle(orderedRun(level, [unit('knight', 'knight', ['agminate'])], 5), level);
    const cell = placement(finished, level, 'knight');
    expect(Math.min(cell.x, cell.y, level.board.cols - 1 - cell.x, level.board.rows - 1 - cell.y)).toBe(1);
  });

  it('puts an Agminate King on the board edge', () => {
    const level = deploymentLevel(7, 4);
    const finished = advanceLifecycle(orderedRun(level, [unit('king', 'king', ['agminate'])], 6), level);
    const cell = placement(finished, level, 'king');
    expect(Math.min(cell.x, cell.y, level.board.cols - 1 - cell.x, level.board.rows - 1 - cell.y)).toBe(0);
  });

  it('puts an Agminate Rook on an outer back-row square', () => {
    const level = deploymentLevel(7, 4);
    const finished = advanceLifecycle(orderedRun(level, [unit('king', 'king'), unit('rook', 'rook', ['agminate'])], 7), level);
    const cell = placement(finished, level, 'rook');
    expect(cell.y).toBe(6);
    expect([0, 6]).toContain(cell.x);
  });

  it('flanks an Agminate King with the first Agminate Rook when possible', () => {
    const level = deploymentLevel(7, 4);
    const finished = advanceLifecycle(orderedRun(level, [unit('king', 'king', ['agminate']), unit('rook', 'rook', ['agminate'])], 8), level);
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
    const finished = advanceLifecycle(orderedRun(level, [unit('pawn', 'pawn', ['agminate'])], 9), level);
    expect(placement(finished, level, 'pawn').x).toBe(3);
  });

  it('treats Pawn adjacency and an open file as equal conditions with a seeded tie', () => {
    const level = deploymentLevel(5, 1);
    level.layers.terrain = Array.from({ length: 5 }, (_, x) => ({ x, y: 1, elevation: 0, terrain: x === 0 ? 'grass' as const : 'rock' as const }));
    const results = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const finished = advanceLifecycle(orderedRun(level, [unit('plain', 'pawn'), unit('affinity', 'pawn', ['agminate'])], seed), level);
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
    const finished = advanceLifecycle(orderedRun(level, [unit('plain', 'bishop'), unit('affinity', 'bishop', ['agminate'])], 23), level);
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

  it('restarts from the exact persisted deal, seat order, choices, and formation', () => {
    const level = deploymentLevel();
    const battle = {
      ...advanceLifecycle(orderedRun(level, [unit('king', 'king'), unit('pawn', 'pawn')], 99), level),
      goldTenths: 10 * GOLD_SCALE,
    };
    const before = JSON.stringify(battle.deployment);
    const retried = restartBattle(battle);
    expect(JSON.stringify(retried.deployment)).toBe(before);
    expect(retried.battleRuntime?.initiallyDeployedUnitIds).toEqual(battle.deployment?.deployingUnitIds);
    expect(retried.goldTenths).toBe(battle.goldTenths - RUN_BATTLE_RETRY_COST_TENTHS);
  });

  it('replays the complete Deployment lifecycle after a post-placement reroll', () => {
    const level = deploymentLevel();
    const battle = {
      ...advanceLifecycle(orderedRun(level, [unit('king', 'king'), unit('pawn', 'pawn')], 99), level),
      goldTenths: 10 * GOLD_SCALE,
    };
    const originalDeal = battle.deployment!.dealtCardIds;
    const originalSeed = battle.deployment!.seed;

    const rerolled = rerollDeployment(battle);
    expect(rerolled.phase).toBe('deployment');
    expect(rerolled.deployment?.stage).toBe('awaiting-deal');
    expect(rerolled.deployment?.dealtCardIds).toEqual(originalDeal);
    expect(rerolled.deployment?.seed).not.toBe(originalSeed);
    expect(rerolled.goldTenths).toBe(battle.goldTenths - RUN_BATTLE_DEPLOYMENT_REROLL_COST_TENTHS);

    const redeployed = advanceLifecycle(rerolled, level);
    expect(redeployed.phase).toBe('battle');
    expect(Object.keys(redeployed.deployment?.placements ?? {})).toEqual(['king', 'pawn']);
  });
});
