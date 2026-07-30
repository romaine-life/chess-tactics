import { describe, expect, it } from 'vitest';
import type { RunDocument } from './model';
import { relicStatEventsForRunTransition } from './relicStatistics';

function run(overrides: Partial<RunDocument> = {}): RunDocument {
  return {
    id: 'run-1',
    schemaVersion: 1,
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    phase: 'battle',
    battleIndex: 0,
    goldTenths: 0,
    relics: [],
    army: [],
    shop: null,
    deployment: null,
    war: {
      id: 'war-1',
      name: 'War',
      description: '',
      battles: [],
    },
    ...overrides,
  } as RunDocument;
}

describe('Run relic statistics', () => {
  it('records a relic pick with a stable run-and-relic identity', () => {
    expect(relicStatEventsForRunTransition(
      run(),
      run({ relics: ['conscription-notice'] }),
    )).toEqual([{
      eventId: 'pick:run-1:conscription-notice',
      relicId: 'conscription-notice',
      kind: 'picked',
    }]);
  });

  it('records one Battle win for every relic held through that Battle', () => {
    expect(relicStatEventsForRunTransition(
      run({ relics: ['conscription-notice', 'training-linens'] }),
      run({ phase: 'shop', relics: ['conscription-notice', 'training-linens'] }),
    )).toEqual([
      {
        eventId: 'battle-win:run-1:0',
        relicId: 'conscription-notice',
        kind: 'battle-win',
      },
      {
        eventId: 'battle-win:run-1:0',
        relicId: 'training-linens',
        kind: 'battle-win',
      },
    ]);
  });

  it('does not infer history across different Runs or ordinary same-phase updates', () => {
    expect(relicStatEventsForRunTransition(
      run(),
      run({ id: 'run-2', relics: ['conscription-notice'] }),
    )).toEqual([]);
    expect(relicStatEventsForRunTransition(
      run({ relics: ['conscription-notice'] }),
      run({ goldTenths: 20, relics: ['conscription-notice'] }),
    )).toEqual([]);
  });
});
