import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Campaign } from '../core/level';
import { playSkirmishLevelHref, skirmishMapLevels } from './skirmishMaps';
import { SKIRMISH_PROFILE_ID_PREFIX } from './skirmishProfiles';

describe('skirmish map selection', () => {
  it('lists saved levels that are not referenced by any campaign', () => {
    const campaignLevel = createBlankLevel('l-campaign', 'Campaign Level');
    const ruins = createBlankLevel('l-ruins', 'Ruins');
    const arena = createBlankLevel('l-arena', 'Arena');
    const profile = createBlankLevel(`${SKIRMISH_PROFILE_ID_PREFIX}classic`, 'Classic Skirmish');
    const campaigns: Campaign[] = [{
      formatVersion: 1,
      id: 'c1',
      name: 'Campaign',
      difficulty: 'normal',
      chapters: 1,
      levels: [{ levelId: campaignLevel.id, ordinal: 0 }],
    }];

    expect(skirmishMapLevels(campaigns, {
      [campaignLevel.id]: campaignLevel,
      [ruins.id]: ruins,
      [arena.id]: arena,
      [profile.id]: profile,
    }).map((level) => level.id)).toEqual(['l-arena', 'l-ruins']);
  });

  it('builds a non-campaign play link for saved maps', () => {
    expect(playSkirmishLevelHref('map id')).toBe('/play?levelId=map%20id&mode=skirmish&returnTo=%2Fplay%2Fselect%2Fskirmish');
  });
});
