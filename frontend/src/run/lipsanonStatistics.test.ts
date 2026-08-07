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
    sectio: null,
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
      run({ lipsana: ['royal-tent'] }),
    )).toEqual([{
      eventId: 'pick:run-1:royal-tent',
      lipsanonId: 'royal-tent',
      kind: 'picked',
    }]);
  });

  it('records one Battle win for every lipsanon held through that Battle', () => {
    expect(lipsanonStatEventsForRunTransition(
      run({ lipsana: ['royal-tent', 'quartermasters-ledger'] }),
      run({ phase: 'sectio', lipsana: ['royal-tent', 'quartermasters-ledger'] }),
    )).toEqual([
      {
        eventId: 'battle-win:run-1:0',
        lipsanonId: 'royal-tent',
        kind: 'battle-win',
      },
      {
        eventId: 'battle-win:run-1:0',
        lipsanonId: 'quartermasters-ledger',
        kind: 'battle-win',
      },
    ]);
  });

  it('does not infer history across different Runs or ordinary same-phase updates', () => {
    expect(lipsanonStatEventsForRunTransition(
      run(),
      run({ id: 'run-2', lipsana: ['royal-tent'] }),
    )).toEqual([]);
    expect(lipsanonStatEventsForRunTransition(
      run({ lipsana: ['royal-tent'] }),
      run({ goldTenths: 20, lipsana: ['royal-tent'] }),
    )).toEqual([]);
  });
});
