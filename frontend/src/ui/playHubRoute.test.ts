import { describe, expect, it } from 'vitest';
import {
  PLAY_CONTINUE_SELECTOR_HREF,
  PLAY_LEVELS_SELECTOR_HREF,
  PLAY_RUN_CURRENT_SELECTOR_HREF,
  PLAY_RUN_NEW_SELECTOR_HREF,
  PLAY_RUN_SELECTOR_HREF,
  PLAY_SELECTOR_ROOT,
  PLAY_SKIRMISH_SELECTOR_HREF,
  isPlaySelectorPath,
  playCampaignSelectorHref,
  playContinueSelectorHref,
  playHubSectionPath,
  playHubSelection,
} from './playHubRoute';

describe('Play selector routes', () => {
  it('keeps the selector separate from the live /play board route', () => {
    expect(isPlaySelectorPath('/play')).toBe(false);
    expect(isPlaySelectorPath(PLAY_SELECTOR_ROOT)).toBe(true);
    expect(isPlaySelectorPath(PLAY_SKIRMISH_SELECTOR_HREF)).toBe(true);
  });

  it('keeps Run and the dormant modes on stable direct addresses', () => {
    expect(playHubSelection(PLAY_SKIRMISH_SELECTOR_HREF)).toEqual({ mode: 'skirmish' });
    expect(playHubSelection(PLAY_RUN_SELECTOR_HREF)).toEqual({ mode: 'run', choice: null });
    expect(playHubSelection(PLAY_LEVELS_SELECTOR_HREF)).toEqual({ mode: 'levels' });
  });

  it('addresses the agnostic Continue surface and each resumable mode', () => {
    expect(playHubSelection(PLAY_CONTINUE_SELECTOR_HREF)).toEqual({ mode: 'continue', choice: null });
    for (const choice of ['campaign', 'skirmish', 'run', 'levels'] as const) {
      const href = playContinueSelectorHref(choice);
      expect(href).toBe(`/play/select/continue/${choice}`);
      expect(playHubSelection(href)).toEqual({ mode: 'continue', choice });
    }
  });

  it('addresses Current Run and Start New Run details without preselecting ordinary Run', () => {
    expect(playHubSelection(PLAY_RUN_CURRENT_SELECTOR_HREF)).toEqual({ mode: 'run', choice: 'current' });
    expect(playHubSelection(PLAY_RUN_NEW_SELECTOR_HREF)).toEqual({ mode: 'run', choice: 'new' });
  });

  it('keeps the dormant campaign implementation directly routable', () => {
    const href = playCampaignSelectorHref('campaign / one');
    expect(href).toBe('/play/select/campaign/campaign%20%2F%20one');
    expect(playHubSelection(href)).toEqual({ mode: 'campaign', campaignId: 'campaign / one' });
  });

  it('keeps the installed bare root as the Run canonicalization entry', () => {
    expect(playHubSelection(PLAY_SELECTOR_ROOT)).toEqual({ mode: 'hub' });
    expect(playHubSelection('/play/select/')).toEqual({ mode: 'hub' });
  });

  it('resolves the installed root and malformed paths to Run while retaining Continue directly', () => {
    expect(playHubSectionPath(PLAY_SELECTOR_ROOT)).toBe(PLAY_RUN_SELECTOR_HREF);
    expect(playHubSectionPath(PLAY_CONTINUE_SELECTOR_HREF)).toBe(PLAY_CONTINUE_SELECTOR_HREF);
    for (const choice of ['campaign', 'skirmish', 'run', 'levels'] as const) {
      expect(playHubSectionPath(playContinueSelectorHref(choice))).toBe(PLAY_CONTINUE_SELECTOR_HREF);
    }
    expect(playHubSectionPath('/play/select/unknown')).toBe(PLAY_RUN_SELECTOR_HREF);
  });

  it('keeps every distinct selector scene on its own section address', () => {
    expect(playHubSectionPath(PLAY_SKIRMISH_SELECTOR_HREF)).toBe(PLAY_SKIRMISH_SELECTOR_HREF);
    expect(playHubSectionPath(PLAY_RUN_SELECTOR_HREF)).toBe(PLAY_RUN_SELECTOR_HREF);
    expect(playHubSectionPath(PLAY_RUN_CURRENT_SELECTOR_HREF)).toBe(PLAY_RUN_CURRENT_SELECTOR_HREF);
    expect(playHubSectionPath(PLAY_RUN_NEW_SELECTOR_HREF)).toBe(PLAY_RUN_NEW_SELECTOR_HREF);
    expect(playHubSectionPath(PLAY_LEVELS_SELECTOR_HREF)).toBe(PLAY_LEVELS_SELECTOR_HREF);
    const campaignHref = playCampaignSelectorHref('campaign / one');
    expect(playHubSectionPath(campaignHref)).toBe(campaignHref);
  });

  it('rejects selector states that the Play rail cannot produce', () => {
    expect(playHubSelection('/play/select/unknown')).toBeNull();
    expect(playHubSelection('/play/select/campaign/id/extra')).toBeNull();
    expect(playHubSelection('/play/select/campaign/%')).toBeNull();
  });
});
