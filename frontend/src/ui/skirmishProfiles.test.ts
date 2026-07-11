import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  SKIRMISH_PROFILE_ID_PREFIX,
  editSkirmishProfileHref,
  isSkirmishProfileLevel,
  skirmishProfileLevels,
} from './skirmishProfiles';

describe('persisted skirmish profiles', () => {
  it('classifies authored profile ids without synthesizing content', () => {
    const profile = createBlankLevel(`${SKIRMISH_PROFILE_ID_PREFIX}space`, 'Space');
    expect(isSkirmishProfileLevel(profile)).toBe(true);
    expect(isSkirmishProfileLevel(profile.id)).toBe(true);
    expect(isSkirmishProfileLevel(createBlankLevel('level-ordinary', 'Ordinary'))).toBe(false);
    expect(skirmishProfileLevels({})).toEqual([]);
  });

  it('lists persisted profiles in stable name order', () => {
    const zeta = createBlankLevel(`${SKIRMISH_PROFILE_ID_PREFIX}zeta`, 'Zeta');
    const alpha = createBlankLevel(`${SKIRMISH_PROFILE_ID_PREFIX}alpha`, 'Alpha');
    const ordinary = createBlankLevel('level-ordinary', 'Aardvark');
    expect(skirmishProfileLevels({ [zeta.id]: zeta, [ordinary.id]: ordinary, [alpha.id]: alpha }).map((level) => level.id))
      .toEqual([alpha.id, zeta.id]);
  });

  it('returns profile editing to the unified Play selector by default', () => {
    expect(editSkirmishProfileHref('skirmish-profile-space'))
      .toBe('/editor/level?levelId=skirmish-profile-space&returnTo=%2Fplay%2Fselect%2Fskirmish');
    expect(editSkirmishProfileHref('skirmish-profile-space', '/editor'))
      .toBe('/editor/level?levelId=skirmish-profile-space&returnTo=%2Feditor');
  });
});
