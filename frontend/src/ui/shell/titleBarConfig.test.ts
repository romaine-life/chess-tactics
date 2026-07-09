import { describe, expect, it } from 'vitest';
import { titleBarConfig } from './titleBarConfig';

describe('titleBarConfig play route screen names', () => {
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
