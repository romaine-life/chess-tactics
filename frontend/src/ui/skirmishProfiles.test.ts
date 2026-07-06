import { beforeEach, describe, expect, it } from 'vitest';
import { useCampaigns } from '../campaign/store';
import { createSkirmish } from '../game/setup';
import { validatePlayability } from '../core/playability';
import {
  DEFAULT_SKIRMISH_PROFILE_ID,
  createDefaultSkirmishProfileLevel,
  editSkirmishProfileHref,
  ensureDefaultSkirmishProfileLevel,
  isSkirmishProfileLevel,
  skirmishProfileLevels,
} from './skirmishProfiles';

describe('skirmish profiles', () => {
  beforeEach(() => {
    useCampaigns.setState({ campaigns: [], levels: {}, selectedCampaignId: null, selectedLevelId: null, counter: 1 });
  });

  it('creates a playable setup-spawn default profile', () => {
    const profile = createDefaultSkirmishProfileLevel();

    expect(profile.id).toBe(DEFAULT_SKIRMISH_PROFILE_ID);
    expect(profile.placement).toBeUndefined();
    expect(profile.roster).toBeUndefined();
    expect(profile.layers.units).toEqual([]);
    expect(profile.layers.zones.map((zone) => zone.type)).toEqual(['region', 'region']);
    expect(profile.layers.zones.map((zone) => zone.name)).toEqual(['Player deployment', 'Enemy deployment']);
    expect(profile.layers.zones.map((zone) => zone.color)).toEqual(['blue', 'red']);
    expect(profile.events?.filter((event) => event.kind === 'spawn')).toHaveLength(2);
    expect(validatePlayability(profile).ok).toBe(true);
  });

  it('plays through the authored setup-spawn path', () => {
    const game = createSkirmish({ seed: 7, level: createDefaultSkirmishProfileLevel() });
    expect(game.pieces.filter((piece) => piece.side === 'player')).toHaveLength(3);
    expect(game.pieces.filter((piece) => piece.side === 'enemy')).toHaveLength(3);
    expect(game.pieces.every((piece) => piece.x >= 0 && piece.y >= 0 && piece.x < 8 && piece.y < 12)).toBe(true);
  });

  it('seeds the default profile without overwriting an edited copy', () => {
    const edited = { ...createDefaultSkirmishProfileLevel(), name: 'My Skirmish' };
    useCampaigns.getState().replaceLevel(edited);

    expect(ensureDefaultSkirmishProfileLevel().name).toBe('My Skirmish');
    expect(useCampaigns.getState().levels[DEFAULT_SKIRMISH_PROFILE_ID].name).toBe('My Skirmish');
  });

  it('classifies and links profile levels', () => {
    const profile = createDefaultSkirmishProfileLevel();
    expect(isSkirmishProfileLevel(profile)).toBe(true);
    expect(skirmishProfileLevels({ other: { ...profile, id: 'level-ordinary' }, [profile.id]: profile }).map((level) => level.id))
      .toEqual([DEFAULT_SKIRMISH_PROFILE_ID]);
    expect(editSkirmishProfileHref('skirmish-profile-space', '/editor'))
      .toBe('/editor/level?levelId=skirmish-profile-space&returnTo=%2Feditor');
  });
});
