import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Campaign } from '../core/level';
import { playSkirmishLevelHref, skirmishMapLevels } from './skirmishMaps';

describe('skirmish map selection', () => {
  it('lists saved levels that are not referenced by any campaign', () => {
    const campaignLevel = createBlankLevel('l-campaign', 'Campaign Level');
    const ruins = createBlankLevel('l-ruins', 'Ruins');
    const arena = createBlankLevel('l-arena', 'Arena');
    // A level left over from the retired Skirmish profiles collection is an ordinary
    // standalone level now; nothing filters it out of the list (ADR-0529).
    const retiredProfile = createBlankLevel('skirmish-profile-classic', 'Classic Skirmish');
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
      [retiredProfile.id]: retiredProfile,
    }).map((level) => level.id)).toEqual(['l-arena', 'skirmish-profile-classic', 'l-ruins']);
  });

  it('builds a non-campaign play link for saved maps', () => {
    expect(playSkirmishLevelHref('map id')).toBe('/play?levelId=map%20id&mode=skirmish&returnTo=%2Fplay%2Fselect%2Flevels');
  });
});
