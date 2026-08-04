// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./shared/BrandLockup.tsx', import.meta.url), 'utf8');
const appTitleBar = readFileSync(new URL('./shell/AppTitleBar.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('Brand lockup navigation surface', () => {
  it('keeps main-menu navigation on the shield instead of the title-bar track', () => {
    const homeButton = source.match(/<NavButton\b[\s\S]*?<\/NavButton>/)?.[0] ?? '';

    expect(source).toContain('<div className="brand-lockup-layout">');
    expect(homeButton).toContain('className="brand-lockup"');
    expect(homeButton).toContain('className="brand-lockup-mark"');
    expect(homeButton).not.toContain('brand-lockup-copy');
    expect(homeButton).not.toContain('brand-lockup-transition-status');
    expect(source.indexOf('</NavButton>')).toBeLessThan(source.indexOf('<span className="brand-lockup-copy">'));
    expect(styles).toMatch(/\.brand-lockup-layout\s*\{[\s\S]*?justify-self:\s*start;/);
  });

  it('renders a routed screen name as a keyboard-operable NavButton', () => {
    expect(source).toContain("role={screenNameTo || routeContent || routeSlot ? 'navigation' : undefined}");
    expect(source).toContain("aria-label={screenNameTo || routeContent || routeSlot ? 'Title route' : undefined}");
    expect(source).toContain('<NavButton className="brand-lockup-screen-name title-route-button" to={screenNameTo}>');
    expect(source).toContain('{routeContent ? <span className="brand-lockup-route">{routeContent}</span> : null}');
    expect(appTitleBar).toContain('routeContent={config.routeSegments?.length ? <TitleRoute segments={config.routeSegments} /> : null}');
  });
});
