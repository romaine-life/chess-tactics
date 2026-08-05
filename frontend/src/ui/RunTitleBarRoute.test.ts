import { describe, expect, it } from 'vitest';
import type { RunDocument } from '../run/model';
import { runTitleBarRouteSegments } from './RunScreen';

const runInPhase = (phase: RunDocument['phase']): RunDocument => ({ phase } as RunDocument);

describe('Run title route', () => {
  it.each([
    ['battle-preview', 'View Battle'],
    ['alienatio', 'Alienatio'],
    ['expunctio', 'Expunctio'],
  ] as const)('appends the addressed Sectio room %s', (view, label) => {
    expect(runTitleBarRouteSegments(
      runInPhase('sectio'),
      '/run',
      `?run=1&view=${view}`,
      view,
    )).toEqual([
      { label: 'Sectio', to: '/run?run=1' },
      { label, to: `/run?run=1&view=${view}` },
    ]);
  });

  it('names an aftermath board review as the Battle without adding a second crumb', () => {
    expect(runTitleBarRouteSegments(
      runInPhase('aftermath'),
      '/run',
      '?run=1&view=battle-review',
      'battle-review',
    )).toEqual([{ label: 'Battle', to: '/run?run=1' }]);
  });

  it('does not present a Sectio-only room outside Sectio', () => {
    expect(runTitleBarRouteSegments(
      runInPhase('battle'),
      '/run',
      '?run=1&view=alienatio',
      'alienatio',
    )).toEqual([{ label: 'Battle', to: '/run?run=1' }]);
  });
});
