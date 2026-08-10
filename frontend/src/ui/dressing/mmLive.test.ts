// @ts-nocheck — node built-ins are untyped in the app tsconfig (see forgeAtomCanvas.test.ts);
// vitest runs this via esbuild with no typecheck, so the fs/url reads are fine at runtime.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MM_LIVE, MM_LABEL_LIVE, cssLen } from './mmLive';

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

/** Every `selector {` rule body, in source order — for selectors that carry more than one rule. */
function blocksFor(selector: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(`${selector} {`, from);
    if (start < 0) break;
    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);
    out.push(css.slice(open + 1, close));
    from = close;
  }
  expect(out.length, `style.css should contain a "${selector} {" rule`).toBeGreaterThan(0);
  return out;
}

describe('MM_LIVE mirrors the baked menu/settings-rail chrome in style.css', () => {
  it('btnH: the menu-scoped .main-menu-mode-tab height', () => {
    // The menu runs shorter buttons than the .settings-tab base (88px), so btnH mirrors the
    // menu's own rule, not the shared base.
    expect(firstBlock('.main-menu-mode-tab')).toContain(`block-size: ${MM_LIVE.btnH}px`);
    expect(firstBlock('.main-menu-mode-tab')).toContain(`min-height: ${MM_LIVE.btnH}px`);
  });

  it('icon: the .settings-tab base rule', () => {
    expect(firstBlock('.settings-tab')).toContain(`--settings-tab-icon-size: ${MM_LIVE.icon}px`);
  });

  it('railW: the .settings-shell rail column', () => {
    expect(firstBlock('.settings-shell')).toContain(`grid-template-columns: ${MM_LIVE.railW}px minmax(0, 1fr)`);
    expect(css).toContain(`--main-menu-tab-column-w: ${MM_LIVE.railW}px`);
  });

  it('menu-shell column pull mirrors MM_LIVE.btnX/btnY from one source', () => {
    // The destination columns (Settings sections + content) derive their leftward/up pull from
    // --rail-pull-x/y on the menu shell, NOT a copied literal, so col2/col3 stay locked to col1's
    // column. Those vars must mirror the rail's own offset (|btnX|/|btnY|) — guarded so the single
    // source can't silently drift when the rail is re-tuned.
    const shellBlock = css.slice(css.indexOf('.main-menu-twin-screen .settings-shell {'));
    expect(shellBlock).toContain(`--rail-pull-x: ${-MM_LIVE.btnX}px`);
    expect(shellBlock).toContain(`--rail-pull-y: ${-MM_LIVE.btnY}px`);
  });

  it('btnX zoom floor: the shared .settings-shell margin is floored at |btnX| (ADR-0062)', () => {
    // The rail is pulled left by translate(<btnX>px, …); the shell's left margin MUST be floored at
    // the same magnitude, or the rail shears off the left edge at high browser zoom (the PR #339
    // regression). The tuner now bakes the transform and this floor together — this guards they can
    // never drift apart again.
    expect(firstBlock('.settings-shell')).toContain(`margin-inline-start: max(${-MM_LIVE.btnX}px,`);
  });

  it('btnX/btnY: the .settings-rail-frame group offset', () => {
    expect(firstBlock('.settings-rail-frame')).toContain(`transform: translate(${MM_LIVE.btnX}px, ${MM_LIVE.btnY}px)`);
  });

  it('textX: the label nudge', () => {
    expect(firstBlock('.settings-tab > span:not(.settings-tab-icon)')).toContain(`translateX(${MM_LIVE.textX}px)`);
  });

  it('label shadow: the .settings-tab strong rule (the tab label + settings row title share it)', () => {
    // firstBlock finds the FIRST `.settings-tab strong {` — the grouped
    // `.settings-row h4, .settings-tab strong` colour/shadow rule. The later same-named rule
    // (font-size / letter-spacing / text-transform) carries no shadow.
    const { shadowX, shadowY, shadowBlur, shadowColor } = MM_LABEL_LIVE;
    expect(firstBlock('.settings-tab strong'))
      .toContain(`text-shadow: ${cssLen(shadowX)} ${cssLen(shadowY)} ${cssLen(shadowBlur)} ${shadowColor}`);
  });

  it('label stroke: one token, and every rule that wears the outline reads it', () => {
    // Width and ink live on --menu-label-stroke-*, so the rail tabs, the destination slabs and the
    // Campaign rail's padding gutter cannot drift apart. MM_LABEL_LIVE mirrors the token.
    expect(MM_LABEL_LIVE.outline).toBe('stroke');
    expect(css).toContain(`--menu-label-stroke-w: ${MM_LABEL_LIVE.strokeW}px`);
    expect(css).toContain(`--menu-label-stroke-ink: ${MM_LABEL_LIVE.strokeColor}`);

    const OUTLINE = '-webkit-text-stroke: var(--menu-label-stroke-w) var(--menu-label-stroke-ink)';
    const stroked = blocksFor('.settings-tab strong').filter((b) => b.includes('-webkit-text-stroke'));
    expect(stroked, 'exactly one .settings-tab strong rule should carry the outline').toHaveLength(1);
    expect(stroked[0]).toContain(OUTLINE);
    // Without this the stroke eats inward from the glyph outline and thins the shipped weight.
    expect(stroked[0]).toContain('paint-order: stroke fill');

    // The Run choice slabs behind PLAY wear the same one, read from the same token.
    const dest = firstBlock('.play-choice-row h4');
    expect(dest).toContain(OUTLINE);
    expect(dest).toContain('paint-order: stroke fill');
  });

  it('label stroke: the label boxes do not clip it away', () => {
    // A stroke paints outside the text box and the ink starts flush against that box's left edge,
    // so `overflow: hidden` here shears the outline off the first letter of every word — the exact
    // defect this pairing exists to prevent. The Campaign rail keeps its ellipsis and buys room
    // with padding instead, so it is checked on its own terms.
    expect(firstBlock('.settings-tab-label')).toContain('overflow: visible');
    expect(firstBlock('.settings-tab-label strong')).toContain('overflow: visible');
    const campaign = firstBlock('.ce-campaign-tab .apparatus-tab-copy > strong');
    expect(campaign).toContain('text-overflow: ellipsis');
    expect(campaign).toContain('padding-inline-start: var(--menu-label-stroke-w)');
    expect(campaign).toContain('margin-inline-start: calc(-1 * var(--menu-label-stroke-w))');
  });

  it('gap: a representative value inside the rail clamp()', () => {
    // Match the clamp's first (min) and last (max) px terms. The middle is a calc() that itself
    // contains commas — `var(--layout-vw, 100vw)` (the zoom-safe menu-indent form, PR #339) — so
    // span it non-greedily rather than assuming exactly three comma-separated clamp args.
    const m = firstBlock('.settings-rail-frame').match(/gap: clamp\((\d+(?:\.\d+)?)px[\s\S]*?(\d+(?:\.\d+)?)px\)/);
    expect(m, '.settings-rail-frame gap should be clamp(<min>px, …, <max>px)').toBeTruthy();
    expect(MM_LIVE.gap).toBeGreaterThanOrEqual(Number(m![1]));
    expect(MM_LIVE.gap).toBeLessThanOrEqual(Number(m![2]));
    expect(css).toContain('--main-menu-tab-column-gap: clamp(');
  });
});

// Comments stripped once — otherwise `.settings-shell` mentioned in a comment (e.g. the ADR-0062
// tombstone for the removed #339 fork) reads as a selector, and a `[^{}]` span can run a comment
// into the following real rule. Selectors/bodies must be real CSS, not prose.
const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, '');

// Every flat rule whose selector references a `.<name>` target — returns { selector, body }
// for each. Skips @media wrappers naturally: a `[^{}]` selector/body can't span the wrapper's
// own braces, so it captures the inner flat rules (props only, no nesting in this stylesheet).
function rulesTargeting(name: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = new RegExp(`([^{}]*\\.${name}[^{}]*)\\{([^{}]*)\\}`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(cssRules))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

// Any way to horizontally shift an element off its normal flow position — the whole family, not
// just the one property #339 happened to use. A per-surface rail fork written with `left`,
// `inset-inline-start`, the CSS `translate` property, or a `padding-inline-start` would move the
// rail's on-screen left edge exactly as `margin-inline-start` did, so the guard must catch them all.
const H_SHIFT = /(?:margin|inset|padding)-inline-start\s*:|margin-left\s*:|(?:^|[;{\s])left\s*:|\btransform\s*:|\btranslate\s*:/;

// The rules that place a rail-family element are the BARE shared selectors (possibly inside a
// media query, e.g. the mobile `margin-inline-start: 0` / `transform: none` resets). A rule is a
// per-surface FORK if it shifts the element AND some comma-part references the target in a scoped
// (non-bare) form. A group like `.settings-shell, .utility-twin-screen { … }` is fine — its
// `.settings-shell` part is bare; the other part is a different element.
function scopedShiftForks(name: string): string[] {
  const bare = `.${name}`;
  return rulesTargeting(name)
    .filter((r) => H_SHIFT.test(r.body))
    .flatMap((r) => r.selector.split(',').map((s) => s.trim()))
    .filter((part) => part.includes(bare) && part !== bare);
}

// ADR-0062: the settings-twin rail (home menu · Settings · Campaign) is placed by ONE shared
// rule. The #339 regression was a per-surface fork — `.main-menu-home .settings-shell` floored
// the rail at a different value than its siblings, so the home buttons drifted off the Settings
// rows. These tests fail if a surface-scoped selector reintroduces a rail-position override (via
// ANY horizontal-shift property), so that class of drift can never ship again. A bare
// `.settings-shell` / `.settings-rail-frame` (including inside a media query, or as one part of a
// group selector) is the shared rule and is fine; a *scoped* one is the defect.
describe('ADR-0062: no per-surface override forks the shared rail placement', () => {
  it('no surface-scoped .settings-shell shifts the rail (margin/inset/left/transform/translate)', () => {
    expect(scopedShiftForks('settings-shell'), 'a surface-scoped .settings-shell must not shift the rail — place it in the shared .settings-shell rule (ADR-0062)').toEqual([]);
  });

  it('no surface-scoped .settings-rail-frame shifts the rail', () => {
    expect(scopedShiftForks('settings-rail-frame'), 'a surface-scoped .settings-rail-frame must not shift the rail — the offset is the shared MM_LIVE.btnX/btnY (ADR-0062)').toEqual([]);
  });
});
