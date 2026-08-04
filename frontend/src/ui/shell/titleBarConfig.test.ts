import { describe, expect, it } from 'vitest';
import { titleBarConfig } from './titleBarConfig';

describe('titleBarConfig play route screen names', () => {
  it('uses one Play title across selector sections', () => {
    expect(titleBarConfig('/play/select/skirmish')?.screenName).toBe('Play');
    expect(titleBarConfig('/play/select/levels')?.screenName).toBe('Play');
    expect(titleBarConfig('/play/select/campaign/off-c-crown')?.screenName).toBe('Play');
  });

  it('gives the Run loop the live-board title bar and retry socket', () => {
    expect(titleBarConfig('/run')).toMatchObject({
      screenName: 'Run',
      screenNameTo: '/run',
      barClass: 'skirmish-topbar',
      centerSlot: true,
      studSlot: true,
    });
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

  it('uses the shared control lane for play routes with or without a return target', () => {
    expect(titleBarConfig('/play', '?mode=test&returnTo=%2Feditor%2Flevel%3Fdocument%3Ddoc-1')?.barClass)
      .toBe('skirmish-topbar');
    expect(titleBarConfig('/play', '?board=current-position')?.barClass).toBe('skirmish-topbar');
    expect(titleBarConfig('/play', '?levelId=l1&mode=test')?.barClass).toBe('skirmish-topbar');
    expect(titleBarConfig('/play', '?levelId=l1&mode=campaign')?.barClass).toBe('skirmish-topbar');
  });

  it('names the owner-operated pre-drawn reference tool', () => {
    expect(titleBarConfig('/predrawn-reference')).toMatchObject({
      screenName: 'Pre-drawn Reference',
      barClass: 'predrawn-reference-topbar',
    });
  });

  it('links the title route for every Enchiridion address', () => {
    expect(titleBarConfig('/enchiridion/units')).toMatchObject({
      screenName: 'Enchiridion',
      screenNameTo: '/enchiridion',
      routeSegments: [{ label: 'Units', to: '/enchiridion/units' }],
    });
    expect(titleBarConfig('/enchiridion')).toMatchObject({
      screenName: 'Enchiridion',
      screenNameTo: '/enchiridion',
    });
    expect(titleBarConfig('/enchiridion')?.routeSegments).toBeUndefined();
    expect(titleBarConfig('/enchiridion/lipsana/quartermasters-ledger')?.routeSegments).toEqual([
      { label: 'Lipsana', to: '/enchiridion/lipsana' },
    ]);
  });

  it('links every nested Play Strategikon segment from the persistent App shell', () => {
    expect(titleBarConfig('/play/strategikon/enchiridion/lipsana', '?levelId=l1')).toMatchObject({
      screenNameTo: '/play?levelId=l1',
      routeSegments: [
        { label: 'Strategikon', to: '/play/strategikon?levelId=l1' },
        { label: 'Enchiridion', to: '/play/strategikon/enchiridion?levelId=l1' },
        { label: 'Lipsana', to: '/play/strategikon/enchiridion/lipsana?levelId=l1' },
      ],
    });
    expect(titleBarConfig('/play/strategikon', '?levelId=l1')?.routeSegments).toEqual([
      { label: 'Strategikon', to: '/play/strategikon?levelId=l1' },
    ]);
    expect(titleBarConfig('/play/strategikon/enchiridion', '?levelId=l1')?.routeSegments).toEqual([
      { label: 'Strategikon', to: '/play/strategikon?levelId=l1' },
      { label: 'Enchiridion', to: '/play/strategikon/enchiridion?levelId=l1' },
    ]);
  });

  it('reserves the dynamic route portal only for Run document state', () => {
    expect(titleBarConfig('/run/strategikon/enchiridion/lipsana', '?run=1')).toMatchObject({
      screenNameTo: '/run?run=1',
      routeSlot: true,
    });
    expect(titleBarConfig('/run/strategikon/enchiridion/lipsana', '?run=1')?.routeSegments)
      .toBeUndefined();
  });
});
