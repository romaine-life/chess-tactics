// @ts-nocheck — node built-ins are untyped in the app tsconfig (see forgeAtomCanvas.test.ts);
// vitest runs this via esbuild with no typecheck, so the fs/url reads are fine at runtime.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MM_LIVE } from './mmLive';

// ADR-0057 rot guard: MM_LIVE hand-mirrors literals baked into style.css (the tuner can't
// read CSS source at runtime). This test re-derives each value from the stylesheet, so the
// constant and the shipped chrome cannot disagree without failing CI. If this fails you
// re-baked the menu chrome — update MM_LIVE (or the changed rule) to match.

const css = readFileSync(fileURLToPath(new URL('../../style.css', import.meta.url)), 'utf8');

/** Body of the FIRST `selector {` rule — the baked desktop rule; media overrides come later. */
function firstBlock(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `style.css should contain a "${selector} {" rule`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open); // style.css rules are flat — no nesting
  return css.slice(open + 1, close);
}

describe('MM_LIVE mirrors the baked menu/settings-rail chrome in style.css', () => {
  it('btnH + icon: the .settings-tab base rule', () => {
    const tab = firstBlock('.settings-tab');
    expect(tab).toContain(`min-height: ${MM_LIVE.btnH}px`);
    expect(tab).toContain(`--settings-tab-icon-size: ${MM_LIVE.icon}px`);
  });

  it('railW: the .settings-shell rail column', () => {
    expect(firstBlock('.settings-shell')).toContain(`grid-template-columns: ${MM_LIVE.railW}px minmax(0, 1fr)`);
  });

  it('btnX/btnY: the .settings-rail-frame group offset', () => {
    expect(firstBlock('.settings-rail-frame')).toContain(`transform: translate(${MM_LIVE.btnX}px, ${MM_LIVE.btnY}px)`);
  });

  it('textX: the label nudge', () => {
    expect(firstBlock('.settings-tab > span:not(.settings-tab-icon)')).toContain(`translateX(${MM_LIVE.textX}px)`);
  });

  it('gap: a representative value inside the rail clamp()', () => {
    // Match the clamp's first (min) and last (max) px terms. The middle is a calc() that itself
    // contains commas — `var(--layout-vw, 100vw)` (the zoom-safe menu-indent form, PR #339) — so
    // span it non-greedily rather than assuming exactly three comma-separated clamp args.
    const m = firstBlock('.settings-rail-frame').match(/gap: clamp\((\d+(?:\.\d+)?)px[\s\S]*?(\d+(?:\.\d+)?)px\)/);
    expect(m, '.settings-rail-frame gap should be clamp(<min>px, …, <max>px)').toBeTruthy();
    expect(MM_LIVE.gap).toBeGreaterThanOrEqual(Number(m![1]));
    expect(MM_LIVE.gap).toBeLessThanOrEqual(Number(m![2]));
  });
});
