// @ts-nocheck - node built-ins are untyped in the app tsconfig; vitest runs this
// through esbuild, matching the repository's source-structure guard tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const infoTip = readFileSync(new URL('./InfoTip.tsx', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../chromeFamilyRuntime.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');
const CONSUMERS = ['RunRelics.tsx', 'RunArmyWorkspace.tsx', 'RunCardFace.tsx'];

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

  it('gives the pop a block box, not the inline box <span> defaults to', () => {
    // InnerChromeBox renders the pop as <span>. Left inline it ignores
    // inline-size/max-inline-size and paints the inner-box border-image once per
    // inline fragment — a doubled frame with the text spilling outside it.
    const pop = rule('.infotip-pop');
    expect(pop).toMatch(/display:\s*grid/);
    expect(pop).toMatch(/box-sizing:\s*border-box/);
  });

  it('owns the tooltip treatment so no call site restates it', () => {
    // The Run relic and ability tips set this treatment; it is the shared
    // default now, not a class each caller has to remember to opt into.
    const pop = rule('.infotip-pop');
    // The gap between parts must clear the body's own inter-line space, or a
    // wrapped paragraph reads looser than its distance to the title.
    expect(pop).toContain('gap: var(--ds-space-2)');
    expect(pop).toContain('padding: var(--ds-space-2) var(--ds-space-3)');
    expect(pop).toContain('var(--ds-font-sans)');
    expect(pop).not.toMatch(/system-ui/);
    expect(rule('.tooltip-title')).toContain('var(--ds-font-display)');

    // The primitive renders the title itself from the `title` prop.
    expect(infoTip).toContain('<strong className="tooltip-title">{title}</strong>');
    expect(css).not.toContain('.run-relic-tooltip-');
    for (const consumer of CONSUMERS) {
      const source = readFileSync(new URL(`../${consumer}`, import.meta.url), 'utf8');
      expect(source, consumer).not.toContain('run-relic-tooltip-');
    }
  });
});
