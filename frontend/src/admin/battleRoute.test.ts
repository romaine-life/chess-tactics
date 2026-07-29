import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAdminBattleHref, readAdminBattleHref, rememberAdminBattleHref } from './battleRoute';

describe('admin battle return route', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    } satisfies Storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retains exact Run and Skirmish routes but rejects settings routes', () => {
    expect(isAdminBattleHref('/run')).toBe(true);
    expect(isAdminBattleHref('/play?campaignId=campaign&levelId=level')).toBe(true);
    expect(isAdminBattleHref('/settings/admin')).toBe(false);
  });

  it('prefers an exact settings returnTo and otherwise recalls the last active battle', () => {
    rememberAdminBattleHref('/play?map=shared');
    expect(readAdminBattleHref()).toBe('/play?map=shared');
    expect(readAdminBattleHref('/run')).toBe('/run');
  });
});
