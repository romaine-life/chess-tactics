import { describe, expect, it } from 'vitest';
import { levelEditorExitAction } from './levelEditorExit';

const action = (over: Partial<Parameters<typeof levelEditorExitAction>[0]> = {}) => levelEditorExitAction({
  destinationHref: '/editor',
  replace: false,
  rulesEditorOpen: false,
  source: 'app',
  ...over,
});

describe('level editor exit policy', () => {
  it('closes the nested rules editor before leaving', () => {
    expect(action({ rulesEditorOpen: true })).toBe('close-rules-editor');
  });

  it('allows a clean departure', () => {
    expect(action()).toBe('allow');
  });

  it('does not treat internal replaceState query rewrites as departures', () => {
    expect(action({
      destinationHref: '/editor/level?levelId=l1&layer=rules&map=m1',
      replace: true,
      rulesEditorOpen: true,
    })).toBe('allow');
  });

  it('allows same-editor history to restore the URL-addressed Events state', () => {
    expect(action({
      destinationHref: '/editor/level?levelId=l1&layer=board',
      rulesEditorOpen: true,
      source: 'history',
    })).toBe('allow');
  });

  it('allows one-click Play Test while Events is open', () => {
    expect(action({
      destinationHref: '/play?mode=test&board=abc&returnTo=%2Feditor%2Flevel%3Flayer%3Drules%26eventsEditor%3D1',
      rulesEditorOpen: true,
    })).toBe('allow');
  });

  it('allows history to leave a directly opened Events deep link', () => {
    expect(action({
      destinationHref: '/editor',
      rulesEditorOpen: true,
      source: 'history',
    })).toBe('allow');
  });

  it('allows every departure once the nested editor is closed', () => {
    expect(action({ destinationHref: '/editor/level?levelId=l2' })).toBe('allow');
    expect(action({ destinationHref: '/play?mode=test&board=abc' })).toBe('allow');
  });
});
