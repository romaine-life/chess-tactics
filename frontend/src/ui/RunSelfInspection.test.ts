import { describe, expect, it } from 'vitest';

import {
  runSelfInspectionHref,
  runSelfInspectionViewFromSearch,
  runWorkspaceViewFromSearch,
} from './RunSelfInspection';

describe('Run self-inspection links', () => {
  it('reads only supported self-inspection views', () => {
    expect(runSelfInspectionViewFromSearch('?view=army')).toBe('army');
    expect(runSelfInspectionViewFromSearch('?view=lipsana')).toBe('lipsana');
    expect(runSelfInspectionViewFromSearch('?view=sell')).toBeNull();
    expect(runSelfInspectionViewFromSearch('')).toBeNull();
  });

  it('recognizes the shop-only upcoming Battle workspace as an addressable Run view', () => {
    expect(runWorkspaceViewFromSearch('?view=battle-preview')).toBe('battle-preview');
    expect(runWorkspaceViewFromSearch('?view=unknown')).toBe('primary');
  });

  it('preserves unrelated route state while adding or clearing the view', () => {
    expect(runSelfInspectionHref('http://example.test/run?seed=7#unit', 'army'))
      .toBe('/run?seed=7&view=army#unit');
    expect(runSelfInspectionHref('http://example.test/run?seed=7&view=army#unit', null))
      .toBe('/run?seed=7#unit');
  });
});
