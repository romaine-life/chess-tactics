// @ts-nocheck — node built-ins are untyped in the app tsconfig; Vitest runs this source-contract
// guard through esbuild, matching the other style.css contract tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('level editor responsive layout', () => {
  it('stacks the editor titlebar, board, and rail in the shared 860px breakpoint', () => {
    const breakpointStart = css.lastIndexOf('@media (max-width: 860px)');
    const breakpointEnd = css.indexOf('@media (max-width: 560px)', breakpointStart);
    const tabletCss = css.slice(breakpointStart, breakpointEnd);

    expect(breakpointStart).toBeGreaterThanOrEqual(0);
    expect(breakpointEnd).toBeGreaterThan(breakpointStart);
    expect(tabletCss).toMatch(/\.level-editor-screen\s*\{[\s\S]*?grid-template-areas:\s*"titlebar"\s*"board"\s*"rail";/);
    expect(tabletCss).toContain('grid-template-rows: var(--app-header-h) minmax(520px, 62vh) auto;');
    expect(tabletCss).toMatch(/\.level-editor-screen \.le-outer-panel > \.le-outer-panel-content\s*\{[\s\S]*?height:\s*auto;/);
    expect(tabletCss).toMatch(/\.level-editor-screen \.le-hud-scroll\s*\{[\s\S]*?flex:\s*none;/);
    expect(tabletCss).toMatch(/\.level-editor-screen \.le-hud-scroll > \.kit-scroll-content\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible;/);
    expect(tabletCss).toMatch(/\.level-editor-screen \.le-hud-scroll > \.kit-scroll-rail\s*\{[\s\S]*?display:\s*none;/);
  });

  it('keeps the editor stacked when the later short-landscape rule restores gameplay columns', () => {
    const landscapeStart = css.lastIndexOf('@media (max-width: 960px) and (max-height: 540px)');
    const landscapeCss = css.slice(landscapeStart);

    expect(landscapeStart).toBeGreaterThanOrEqual(0);
    expect(landscapeCss).toMatch(/\.skirmish-screen\.level-editor-screen\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?grid-template-areas:\s*"titlebar"\s*"board"\s*"rail";/);
    expect(landscapeCss).toMatch(/\.level-editor-screen \.skirmish-hud\s*\{[\s\S]*?grid-column:\s*1;\s*grid-row:\s*3;/);
    expect(landscapeCss).toMatch(/\.level-editor-screen \.le-hud-scroll > \.kit-scroll-content\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible;/);
  });

  it('leaves wall-face dimensions to the canonical runtime geometry', () => {
    const rule = css.match(/\.le-wall-face-hit\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).not.toMatch(/\bwidth\s*:/);
    expect(rule).not.toMatch(/\bheight\s*:/);
  });
});
