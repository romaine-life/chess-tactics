import { describe, expect, it } from 'vitest';
import type { Campaign, Level } from '../core/level';
import type { PersistedMatch } from '../game/matchPersistence';
import { runBattleActivityId, type RunDocument } from '../run/model';
import { continueInventory } from './playContinue';

const level = (id: string, name: string): Level => ({ id, name } as Level);

const match = (levelId: string, savedAt: string, activityId: string | null = null): PersistedMatch => ({
  levelId,
  activityId,
  savedAt,
  game: { winner: null, pieces: [], size: { cols: 8, rows: 8 } },
  seed: 1,
  tick: 0,
  log: [],
  objective: 'capture-king',
  objectiveCtx: {},
  victoryOverride: null,
  turnsElapsed: 0,
  clock: null,
} as unknown as PersistedMatch);

const run = (updatedAt: string, battleLevelId = 'run-battle'): RunDocument => ({
  id: 'run-1',
  updatedAt,
  phase: 'battle',
  battleIndex: 0,
  army: [],
  goldTenths: 0,
  ataraxiaTier: 0,
  war: {
    id: 'war-1',
    name: 'The Long War',
    description: '',
    battles: [{ level: level(battleLevelId, 'Run Battle'), loot: true }],
  },
} as unknown as RunDocument);

describe('Play Continue inventory', () => {
  it('collects only resumable activities', () => {
    const inventory = continueInventory(run('2026-01-01T00:00:00.000Z'), null, [], {});
    expect(inventory.activities.map((activity) => activity.mode)).toEqual(['run']);
    expect(inventory.defaultMode).toBe('run');
  });

  it('ignores a second unfinished activity from a dormant mode', () => {
    const inventory = continueInventory(
      run('2026-01-03T00:00:00.000Z'),
      match('level-1', '2026-01-02T00:00:00.000Z'),
      [],
      { 'level-1': level('level-1', 'Classic Battle') },
    );
    expect(inventory.activities.map((activity) => activity.mode)).toEqual(['run']);
    expect(inventory.defaultMode).toBe('run');
  });

  it('treats the saved board for a live Run as that Run activity', () => {
    const inventory = continueInventory(
      run('2026-01-01T00:00:00.000Z'),
      match('run-battle', '2026-01-02T00:00:00.000Z', runBattleActivityId('run-1', 0)),
      [],
      {},
    );
    expect(inventory.activities.find((activity) => activity.mode === 'run')).toMatchObject({
      summary: 'The Long War · Battle 1 of 1',
      playHref: '/run',
    });
    expect(inventory.activities.some((activity) => activity.mode === 'levels')).toBe(false);
  });

  it('keeps an aftermath board-review snapshot inside the one Run activity', () => {
    const aftermath = { ...run('2026-01-01T00:00:00.000Z'), phase: 'aftermath' as const };
    const inventory = continueInventory(
      aftermath,
      match('run-battle', '2026-01-02T00:00:00.000Z', runBattleActivityId('run-1', 0)),
      [],
      { 'run-battle': level('run-battle', 'Standalone Battle') },
    );

    expect(inventory.activities).toHaveLength(1);
    expect(inventory.activities[0]).toMatchObject({
      mode: 'run',
      summary: 'The Long War · Battle 1 won',
    });
  });

  it('does not surface another same-Level battle as dormant Levels', () => {
    const inventory = continueInventory(
      run('2026-01-01T00:00:00.000Z'),
      match('run-battle', '2026-01-02T00:00:00.000Z', runBattleActivityId('other-run', 0)),
      [],
      { 'run-battle': level('run-battle', 'Standalone Battle') },
    );
    expect(inventory.defaultMode).toBe('run');
    expect(inventory.activities.some((activity) => activity.mode === 'levels')).toBe(false);
  });

  it('keeps Run selected over a newer dormant-mode activity', () => {
    const inventory = continueInventory(
      run('2026-01-01T00:00:00.000Z'),
      match('level-1', '2026-01-02T00:00:00.000Z'),
      [],
      { 'level-1': level('level-1', 'Classic Battle') },
    );
    expect(inventory.defaultMode).toBe('run');
  });

  it('does not surface a persisted Campaign battle while its Play entry is dormant', () => {
    const campaign = {
      id: 'campaign-1',
      name: 'Crown of Valoria',
      levels: [{ levelId: 'campaign-battle' }],
    } as Campaign;
    const inventory = continueInventory(
      null,
      match('campaign-battle', '2026-01-02T00:00:00.000Z'),
      [campaign],
      { 'campaign-battle': level('campaign-battle', 'Hold the Bridge') },
    );
    expect(inventory.defaultMode).toBeNull();
    expect(inventory.activities).toHaveLength(0);
  });

  it('does not surface dormant Skirmish or Levels activity', () => {
    const id = 'skirmish-profile-classic';
    const inventory = continueInventory(null, match(id, '2026-01-02T00:00:00.000Z'), [], { [id]: level(id, 'Classic Skirmish') });
    expect(inventory.defaultMode).toBeNull();
    expect(inventory.activities).toHaveLength(0);
  });

  it('is empty when there is nothing to continue', () => {
    const inventory = continueInventory(null, null, [], {});
    expect(inventory.defaultMode).toBeNull();
    expect(inventory.activities).toHaveLength(0);
  });
});
