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

  it('closes rules before a same-editor history traversal', () => {
    expect(action({
      destinationHref: '/editor/level?levelId=l1&layer=board',
      rulesEditorOpen: true,
      source: 'history',
    })).toBe('close-rules-editor');
  });

  it('allows every departure once the nested editor is closed', () => {
    expect(action({ destinationHref: '/editor/level?levelId=l2' })).toBe('allow');
    expect(action({ destinationHref: '/play?mode=test&board=abc' })).toBe('allow');
  });
});
