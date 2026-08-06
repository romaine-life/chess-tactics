import { describe, expect, it } from 'vitest';

import {
  runArmyUnitHref,
  runSelfInspectionHref,
  runSelfInspectionViewFromSearch,
  runWorkspaceViewFromSearch,
  runWorkspaceTitleSegment,
} from './RunSelfInspection';

describe('Run self-inspection links', () => {
  it('reads only supported self-inspection views', () => {
    expect(runSelfInspectionViewFromSearch('?view=army')).toBe('army');
    expect(runSelfInspectionViewFromSearch('?view=lipsana')).toBe('lipsana');
    expect(runSelfInspectionViewFromSearch('?view=sell')).toBeNull();
    expect(runSelfInspectionViewFromSearch('')).toBeNull();
  });

  it('recognizes the Sectio-only workspaces as addressable Run views', () => {
    expect(runWorkspaceViewFromSearch('?view=expunctio')).toBe('expunctio');
    expect(runWorkspaceViewFromSearch('?view=sell')).toBe('primary');
    expect(runWorkspaceViewFromSearch('?view=battle-preview')).toBe('battle-preview');
    expect(runWorkspaceViewFromSearch('?view=battle-review')).toBe('battle-review');
    expect(runWorkspaceViewFromSearch('?view=unknown')).toBe('primary');
  });

  it('preserves unrelated route state while adding or clearing the view', () => {
    expect(runSelfInspectionHref('http://example.test/run?seed=7#unit', 'army'))
      .toBe('/run?seed=7&view=army#unit');
    expect(runSelfInspectionHref('http://example.test/run?seed=7&view=army#unit', null))
      .toBe('/run?seed=7#unit');
  });

  it('derives title segments from the same Run workspace labels and addresses', () => {
    expect(runWorkspaceTitleSegment('/run?run=1&view=army&unit=run-king', 'army')).toEqual({
      label: 'Army',
      to: '/run?run=1&view=army',
    });
    expect(runWorkspaceTitleSegment('/run?run=1&view=expunctio', 'primary')).toBeNull();
  });

  it('addresses Run unit profiles without local presentation identity', () => {
    expect(runArmyUnitHref('http://example.test/run?seed=7', 'run-king'))
      .toBe('/run?seed=7&view=army&unit=run-king');
    expect(runArmyUnitHref('http://example.test/run?view=army&unit=run-king', null))
      .toBe('/run?view=army');
  });
});
