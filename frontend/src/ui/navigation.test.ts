import { describe, expect, it } from 'vitest';
import {
  getAppNavigationUrl,
  normalizeRoutePath,
  registerAppNavigationBlocker,
  runAppNavigationBlockers,
} from './navigation';

const BASE = 'https://chess-tactics.test/settings?tab=audio';

describe('app navigation helpers', () => {
  it('normalizes route paths for matching', () => {
    expect(normalizeRoutePath('/')).toBe('/');
    expect(normalizeRoutePath('/play/')).toBe('/play');
    expect(normalizeRoutePath('/design/catalog//')).toBe('/design/catalog');
  });

  it('accepts same-origin app routes', () => {
    const url = getAppNavigationUrl('/play', BASE);
    expect(url?.pathname).toBe('/play');
  });

  it('leaves auth/api and external targets to the browser', () => {
    expect(getAppNavigationUrl('/api/auth/sign-in', BASE)).toBeNull();
    expect(getAppNavigationUrl('https://example.test/play', BASE)).toBeNull();
    expect(getAppNavigationUrl('mailto:player@example.test', BASE)).toBeNull();
  });

  it('lets the active nested surface consume one navigation attempt', () => {
    let retried = false;
    const unregister = registerAppNavigationBlocker((attempt) => {
      expect(attempt.href).toBe('/editor');
      attempt.retry();
      return true;
    });

    expect(runAppNavigationBlockers({
      href: '/editor',
      path: '/editor',
      replace: false,
      source: 'history',
      retry: () => { retried = true; return true; },
    })).toBe(true);
    expect(retried).toBe(true);

    unregister();
    expect(runAppNavigationBlockers({
      href: '/editor',
      path: '/editor',
      replace: false,
      source: 'app',
      retry: () => false,
    })).toBe(false);
  });
});
