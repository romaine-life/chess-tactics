import { describe, expect, it } from 'vitest';

import {
  runArmyUnitHref,
  runBonaTargetHref,
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

  it('addresses Run unit profiles and Bona targets without local presentation identity', () => {
    expect(runArmyUnitHref('http://example.test/run?seed=7', 'run-king'))
      .toBe('/run?seed=7&view=army&unit=run-king');
    expect(runArmyUnitHref('http://example.test/run?view=army&unit=run-king', null))
      .toBe('/run?view=army');
    expect(runBonaTargetHref('http://example.test/run?seed=7', 'conscription-notice'))
      .toBe('/run?seed=7&view=bona-target&lipsanon=conscription-notice');
    expect(runBonaTargetHref(
      'http://example.test/run?seed=7',
      'conscription-notice',
      'run-king',
    )).toBe('/run?seed=7&view=bona-target&lipsanon=conscription-notice&unit=run-king');
    expect(runSelfInspectionHref(
      'http://example.test/run?view=bona-target&lipsanon=conscription-notice&unit=run-king',
      null,
    )).toBe('/run');
  });
});
