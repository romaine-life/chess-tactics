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

  it('orders a second unfinished activity behind the most recent one', () => {
    const inventory = continueInventory(
      run('2026-01-03T00:00:00.000Z'),
      match('level-1', '2026-01-02T00:00:00.000Z'),
      [],
      { 'level-1': level('level-1', 'Classic Battle') },
    );
    expect(inventory.activities.map((activity) => activity.mode)).toEqual(['run', 'levels']);
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

  it('does not mistake another same-Level battle for the active Run', () => {
    const inventory = continueInventory(
      run('2026-01-01T00:00:00.000Z'),
      match('run-battle', '2026-01-02T00:00:00.000Z', runBattleActivityId('other-run', 0)),
      [],
      { 'run-battle': level('run-battle', 'Standalone Battle') },
    );
    expect(inventory.defaultMode).toBe('levels');
    expect(inventory.activities.find((activity) => activity.mode === 'levels')).toMatchObject({
      summary: 'Standalone Battle',
      playHref: expect.stringContaining('/play?levelId=run-battle'),
    });
  });

  it('chooses the most recently updated unrelated activity', () => {
    const inventory = continueInventory(
      run('2026-01-01T00:00:00.000Z'),
      match('level-1', '2026-01-02T00:00:00.000Z'),
      [],
      { 'level-1': level('level-1', 'Classic Battle') },
    );
    expect(inventory.defaultMode).toBe('levels');
  });

  it('names and routes a persisted Campaign battle', () => {
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
    expect(inventory.defaultMode).toBe('campaign');
    expect(inventory.activities.find((activity) => activity.mode === 'campaign')).toMatchObject({
      summary: 'Crown of Valoria · Hold the Bridge',
      playHref: '/play?campaignId=campaign-1&levelId=campaign-battle',
    });
  });

  it('distinguishes a resumable Skirmish profile from standalone Levels', () => {
    const id = 'skirmish-profile-classic';
    const inventory = continueInventory(null, match(id, '2026-01-02T00:00:00.000Z'), [], { [id]: level(id, 'Classic Skirmish') });
    expect(inventory.defaultMode).toBe('skirmish');
    expect(inventory.activities.find((activity) => activity.mode === 'skirmish')?.facts[0]).toEqual({ label: 'Mode', value: 'Skirmish' });
  });

  it('is empty when there is nothing to continue', () => {
    const inventory = continueInventory(null, null, [], {});
    expect(inventory.defaultMode).toBeNull();
    expect(inventory.activities).toHaveLength(0);
  });
});
