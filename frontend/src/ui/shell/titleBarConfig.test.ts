import { describe, expect, it } from 'vitest';
import { titleBarConfig } from './titleBarConfig';

describe('titleBarConfig play route screen names', () => {
  it('uses one Play title across selector sections', () => {
    expect(titleBarConfig('/play/select/skirmish')?.screenName).toBe('Play');
    expect(titleBarConfig('/play/select/levels')?.screenName).toBe('Play');
    expect(titleBarConfig('/play/select/campaign/off-c-crown')?.screenName).toBe('Play');
  });

  it('returns from sign-in to the current Play selector section', () => {
    expect(titleBarConfig('/play/select/skirmish')?.signInReturnTo).toBe('/play/select/skirmish');
    expect(titleBarConfig('/play/select/levels')?.signInReturnTo).toBe('/play/select/levels');
    expect(titleBarConfig('/play/select/campaign/off-c-crown')?.signInReturnTo)
      .toBe('/play/select/campaign/off-c-crown');
  });

  it('uses campaign context for campaign play links', () => {
    expect(titleBarConfig('/play', '?campaignId=off-c-crown-valoria&levelId=off-l-hold-bridge')?.screenName).toBe('Campaign');
  });

  it('uses official context for direct official level links', () => {
    expect(titleBarConfig('/play', '?levelId=off-l-hold-bridge')?.screenName).toBe('Official Level');
  });

  it('uses community context for public map links', () => {
    expect(titleBarConfig('/play', '?map=pub_123')?.screenName).toBe('Community Map');
  });

  it('keeps skirmish level links in skirmish context', () => {
    expect(titleBarConfig('/play', '?levelId=skirmish-profile-default&mode=skirmish')?.screenName).toBe('Skirmish');
  });
});
