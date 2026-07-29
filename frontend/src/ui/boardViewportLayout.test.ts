// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const levelThumbnailSource = readFileSync(new URL('../render/LevelThumbnail.tsx', import.meta.url), 'utf8');
const viewPaneSource = readFileSync(new URL('./shared/ViewPane.tsx', import.meta.url), 'utf8');

describe('board viewports share the Play viewing-pane shape', () => {
  it('joins the visible gameplay pane directly to the HUD rail', () => {
    expect(styleCss).toMatch(
      /\.skirmish-screen\s*\{[\s\S]*?column-gap:\s*0;/,
    );
  });

  it('locks gameplay to the canonical design canvas and its complete board seat', () => {
    expect(styleCss).toMatch(
      /\.shell\.skirmish-active \.app-root\s*\{[\s\S]*?height:\s*var\(--skirmish-design-height\);[\s\S]*?width:\s*var\(--skirmish-design-width\);/,
    );
    expect(styleCss).toMatch(
      /\.skirmish-screen\.is-design-locked\s*\{[\s\S]*?--app-header-h:\s*var\(--skirmish-header-height\);[\s\S]*?--skirmish-rail-w:\s*var\(--skirmish-hud-width\);/,
    );
    expect(styleCss).toMatch(
      /\.skirmish-board-frame\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*hidden;[\s\S]*?width:\s*100%;/,
    );
    expect(styleCss).not.toMatch(
      /\.skirmish-screen:not\(\.level-editor-screen\) \.skirmish-board-frame\s*\{[\s\S]{0,500}?aspect-ratio:/,
    );
  });

  it('declares the Play-pane aspect once for every board-viewing surface', () => {
    expect(styleCss).toMatch(
      /--board-view-aspect-width:\s*195;[\s\S]*?--board-view-aspect-height:\s*124;/,
    );
    expect(styleCss).toMatch(
      /\.board-view-pane-seat > \.tileset-view-stage\.is-board\s*\{[\s\S]*?aspect-ratio:\s*var\(--board-view-aspect\);/,
    );
    expect(viewPaneSource).toContain("return kind === 'board' ? (");
    expect(viewPaneSource).toContain('className="board-view-pane-seat"');
  });

  it('keeps the selected live preview on the same shared aspect', () => {
    expect(styleCss).toMatch(
      /\.ce-level-viewer\s*\{[\s\S]*?aspect-ratio:\s*var\(--board-view-aspect\);/,
    );
  });

  it('does not let thumbnail callers provide a competing height', () => {
    expect(levelThumbnailSource).toContain('BOARD_PREVIEW_ASPECT');
    expect(levelThumbnailSource).toContain(
      'aspectRatio: `${BOARD_PREVIEW_ASPECT.width} / ${BOARD_PREVIEW_ASPECT.height}`',
    );
    expect(levelThumbnailSource).not.toMatch(/\n\s*height:\s*number;/);
  });

  it('clips gameplay to the same drawable boundary used by its camera', () => {
    expect(styleCss).not.toMatch(
      /\.skirmish-screen:not\(\.level-editor-screen\) \.skirmish-field,[\s\S]{0,700}?overflow:\s*visible;/,
    );
  });
});
