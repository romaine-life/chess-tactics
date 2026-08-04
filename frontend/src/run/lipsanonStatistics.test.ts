import { describe, expect, it } from 'vitest';
import type { RunDocument } from './model';
import { lipsanonStatEventsForRunTransition } from './lipsanonStatistics';

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
    lipsana: [],
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

describe('Run lipsanon statistics', () => {
  it('records a lipsanon pick with a stable run-and-lipsanon identity', () => {
    expect(lipsanonStatEventsForRunTransition(
      run(),
      run({ lipsana: ['conscription-notice'] }),
    )).toEqual([{
      eventId: 'pick:run-1:conscription-notice',
      lipsanonId: 'conscription-notice',
      kind: 'picked',
    }]);
  });

  it('records one Battle win for every lipsanon held through that Battle', () => {
    expect(lipsanonStatEventsForRunTransition(
      run({ lipsana: ['conscription-notice', 'training-linens'] }),
      run({ phase: 'shop', lipsana: ['conscription-notice', 'training-linens'] }),
    )).toEqual([
      {
        eventId: 'battle-win:run-1:0',
        lipsanonId: 'conscription-notice',
        kind: 'battle-win',
      },
      {
        eventId: 'battle-win:run-1:0',
        lipsanonId: 'training-linens',
        kind: 'battle-win',
      },
    ]);
  });

  it('does not infer history across different Runs or ordinary same-phase updates', () => {
    expect(lipsanonStatEventsForRunTransition(
      run(),
      run({ id: 'run-2', lipsana: ['conscription-notice'] }),
    )).toEqual([]);
    expect(lipsanonStatEventsForRunTransition(
      run({ lipsana: ['conscription-notice'] }),
      run({ goldTenths: 20, lipsana: ['conscription-notice'] }),
    )).toEqual([]);
  });
});
