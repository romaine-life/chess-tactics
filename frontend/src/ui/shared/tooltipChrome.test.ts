// @ts-nocheck - node built-ins are untyped in the app tsconfig; vitest runs this
// through esbuild, matching the repository's source-structure guard tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const infoTip = readFileSync(new URL('./InfoTip.tsx', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../chromeFamilyRuntime.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('tooltip chrome', () => {
  it('portals the pop into the chrome family surface, never <main> or <body>', () => {
    // The app-shell <main> and document.body both sit OUTSIDE
    // .app-chrome-family-root, so a pop portalled there loses its frame and fill
    // entirely and renders as bare text over whatever it covers.
    expect(infoTip).toContain('chromeFamilyPortalHost(ref.current)');
    expect(infoTip).not.toContain("closest('main')");
    expect(runtime).toContain('export function chromeFamilyPortalHost');
    expect(runtime).toContain('from?.closest(CHROME_FAMILY_SURFACE_SELECTOR)');
  });

  it('gives the pop a block box at zero specificity', () => {
    // InnerChromeBox renders the pop as <span>. Left inline it ignores
    // inline-size/max-inline-size and paints the inner-box border-image once per
    // inline fragment — a doubled frame with the text spilling outside it.
    const base = rule(':where(.infotip-pop)');
    expect(base).toMatch(/display:\s*block/);
    expect(base).toMatch(/box-sizing:\s*border-box/);

    // :where() keeps it overridable, so a popupClassName owns its inner layout.
    expect(rule('.infotip-pop')).not.toMatch(/display:/);
    expect(rule('.run-relic-tooltip-pop')).toMatch(/display:\s*grid/);
  });
});
