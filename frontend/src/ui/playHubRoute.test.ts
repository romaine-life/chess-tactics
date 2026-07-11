import { describe, expect, it } from 'vitest';
import {
  PLAY_LEVELS_SELECTOR_HREF,
  PLAY_SELECTOR_ROOT,
  PLAY_SKIRMISH_SELECTOR_HREF,
  isPlaySelectorPath,
  playCampaignSelectorHref,
  playHubSelection,
} from './playHubRoute';

describe('Play selector routes', () => {
  it('keeps the selector separate from the live /play board route', () => {
    expect(isPlaySelectorPath('/play')).toBe(false);
    expect(isPlaySelectorPath(PLAY_SELECTOR_ROOT)).toBe(true);
    expect(isPlaySelectorPath(PLAY_SKIRMISH_SELECTOR_HREF)).toBe(true);
  });

  it('maps the fixed Skirmish and Levels entries to stable addresses', () => {
    expect(playHubSelection(PLAY_SKIRMISH_SELECTOR_HREF)).toEqual({ mode: 'skirmish' });
    expect(playHubSelection(PLAY_LEVELS_SELECTOR_HREF)).toEqual({ mode: 'levels' });
  });

  it('round-trips a campaign selection through the shared Play hub', () => {
    const href = playCampaignSelectorHref('campaign / one');
    expect(href).toBe('/play/select/campaign/campaign%20%2F%20one');
    expect(playHubSelection(href)).toEqual({ mode: 'campaign', campaignId: 'campaign / one' });
  });

  it('rejects selector states that the Play rail cannot produce', () => {
    expect(playHubSelection(PLAY_SELECTOR_ROOT)).toBeNull();
    expect(playHubSelection('/play/select/unknown')).toBeNull();
    expect(playHubSelection('/play/select/campaign/id/extra')).toBeNull();
    expect(playHubSelection('/play/select/campaign/%')).toBeNull();
  });
});
