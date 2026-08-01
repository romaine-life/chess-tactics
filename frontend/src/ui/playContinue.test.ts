import { describe, expect, it } from 'vitest';
import type { Campaign, Level } from '../core/level';
import type { PersistedMatch } from '../game/matchPersistence';
import type { RunDocument } from '../run/model';
import { continueActivity } from './playContinue';
import { PLAY_RUN_SELECTOR_HREF } from './playHubRoute';

const level = (id: string, name: string): Level => ({ id, name } as Level);

const match = (levelId: string, savedAt: string): PersistedMatch => ({
  levelId,
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
  war: {
    id: 'war-1',
    name: 'The Long War',
    description: '',
    battles: [{ level: level(battleLevelId, 'Run Battle'), loot: true }],
  },
} as RunDocument);

describe('Play Continue activity', () => {
  it('returns to a live Run Battle even when its persisted board save is newer', () => {
    expect(continueActivity(
      run('2026-01-01T00:00:00.000Z'),
      match('run-battle', '2026-01-02T00:00:00.000Z'),
      [],
      {},
    )).toMatchObject({
      label: 'Continue Run',
      detail: 'Battle 1 of 1',
      href: PLAY_RUN_SELECTOR_HREF,
    });
  });

  it('chooses the most recently updated unrelated activity', () => {
    expect(continueActivity(
      run('2026-01-01T00:00:00.000Z'),
      match('skirmish-1', '2026-01-02T00:00:00.000Z'),
      [],
      { 'skirmish-1': level('skirmish-1', 'Classic Skirmish') },
    )).toMatchObject({
      label: 'Continue Skirmish',
      detail: 'Classic Skirmish',
      href: '/play?levelId=skirmish-1',
    });
  });

  it('names and routes a persisted Campaign Battle', () => {
    const campaign = {
      id: 'campaign-1',
      name: 'Crown of Valoria',
      levels: [{ levelId: 'campaign-battle' }],
    } as Campaign;
    expect(continueActivity(
      null,
      match('campaign-battle', '2026-01-02T00:00:00.000Z'),
      [campaign],
      { 'campaign-battle': level('campaign-battle', 'Hold the Bridge') },
    )).toMatchObject({
      label: 'Continue Campaign',
      detail: 'Crown of Valoria · Hold the Bridge',
      href: '/play?campaignId=campaign-1&levelId=campaign-battle',
    });
  });

  it('returns nothing when neither a Run nor an unresolved Battle exists', () => {
    expect(continueActivity(null, null, [], {})).toBeNull();
  });
});
