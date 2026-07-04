// @ts-nocheck — node built-ins are untyped in the app tsconfig (see mmLive.test.ts); vitest
// runs this via esbuild with no typecheck, so the fs/url reads are fine at runtime.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ADR-0063 structural lock. The rail tabs (.settings-tab) wear ONE continuous stone sheet:
// each tab samples the vertical slice it would have if the texture ran unbroken down the
// rail. That slice is keyed to the tab's data position via the --tab-index custom property,
// NOT its :nth-child index — because a fixed nth-child ladder silently breaks the moment the
// rail length changes (the founding bug: the main menu's 5th tab, Settings, restarted the
// stone at 0) or a non-tab sibling appears (Campaign's group dividers). This guard fails if
// the ladder ever comes back, or if a NEW rail renders .settings-tab without wiring the index.

const uiDir = fileURLToPath(new URL('.', import.meta.url));
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

/** Every .settings-tab render site is `className=<delim>settings-tab …` — the tab class is
 *  always the first token. Anchoring on that skips the `.settings-tab` mentions that live
 *  inside CSS template strings (PagesLibraryStudio) or selector props (SurfaceDressingRoom),
 *  which aren't render sites, and the `settings-tab-icon` child span (negative lookahead). */
function rendersSettingsTab(src: string): boolean {
  for (const m of src.matchAll(/className=([\s\S]{0,60})/g)) {
    const head = m[1].replace(/^[\s{("'`]+/, '');
    if (/^settings-tab(?![-\w])/.test(head)) return true;
  }
  return false;
}

describe('settings-rail stone continuity is index-driven (ADR-0063)', () => {
  it('the .settings-tab continuity rule is keyed to --tab-index, not nth-child', () => {
    expect(css).toContain('.settings-tab { background-position-y: calc(var(--tab-index, 0) * -98px); }');
    // The retired fragile ladder must never return: a per-position nth-child rule can't stay
    // continuous across rail lengths, which is the whole bug this ADR closes.
    expect(css).not.toMatch(/\.settings-tab:nth-child\(\d+\)\s*\{\s*background-position-y/);
  });

  it('every component that renders a .settings-tab wires --tab-index', () => {
    const files = readdirSync(uiDir).filter((f) => f.endsWith('.tsx'));
    const renderers = files.filter((f) => rendersSettingsTab(readFileSync(new URL(f, import.meta.url), 'utf8')));

    // The known rails — a stand-in that guarantees the scan actually found files (a broken glob
    // would otherwise let this test pass vacuously). SkirmishMapPicker is the Skirmish hub's rail
    // (Random Skirmish / Levels).
    expect(renderers.sort()).toEqual(['Campaign.tsx', 'MainMenu.tsx', 'Settings.tsx', 'SkirmishMapPicker.tsx']);

    for (const f of renderers) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src, `${f} renders .settings-tab but never sets --tab-index — its stone won't be continuous`).toContain('--tab-index');
    }
  });
});
