import { describe, expect, it } from 'vitest';

import {
  runSelfInspectionHref,
  runSelfInspectionViewFromSearch,
} from './RunSelfInspection';

describe('Run self-inspection links', () => {
  it('reads only supported self-inspection views', () => {
    expect(runSelfInspectionViewFromSearch('?view=army')).toBe('army');
    expect(runSelfInspectionViewFromSearch('?view=lipsana')).toBe('lipsana');
    expect(runSelfInspectionViewFromSearch('?view=sell')).toBeNull();
    expect(runSelfInspectionViewFromSearch('')).toBeNull();
  });

  it('preserves unrelated route state while adding or clearing the view', () => {
    expect(runSelfInspectionHref('http://example.test/run?seed=7#unit', 'army'))
      .toBe('/run?seed=7&view=army#unit');
    expect(runSelfInspectionHref('http://example.test/run?seed=7&view=army#unit', null))
      .toBe('/run?seed=7#unit');
  });
});
