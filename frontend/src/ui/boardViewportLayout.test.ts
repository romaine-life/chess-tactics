// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const levelThumbnailSource = readFileSync(new URL('../render/LevelThumbnail.tsx', import.meta.url), 'utf8');
const levelEditorSource = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const skirmishBoardSource = readFileSync(new URL('../render/SkirmishBoard.tsx', import.meta.url), 'utf8');
const skirmishSource = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const viewPaneSource = readFileSync(new URL('./shared/ViewPane.tsx', import.meta.url), 'utf8');

describe('board viewports speak the board\'s canonical 4:3 language (ADR-0259)', () => {
  it('keeps Play in real viewport pixels — no design-canvas transform machinery', () => {
    expect(styleCss).not.toContain('is-play-canvas');
    expect(styleCss).not.toContain('--skirmish-canvas-');
    expect(styleCss).not.toContain('--skirmish-hud-width');
    expect(skirmishSource).not.toContain('installPlayCanvas');
    expect(skirmishSource).not.toContain('is-play-canvas');
  });

  it('sizes the HUD rail from the one shared real-pixel width every consumer reads', () => {
    expect(styleCss).toMatch(
      /:root\s*\{[\s\S]{0,200}?--skirmish-rail-w:\s*clamp\(300px, 24vw, 360px\);/,
    );
    expect(styleCss).toMatch(
      /\.skirmish-screen\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) var\(--skirmish-rail-w\);/,
    );
  });

  it('frames the live gameplay board in the largest 4:3 drawable viewport', () => {
    expect(styleCss).toMatch(
      /\.skirmish-screen:not\(\.level-editor-screen\) \.skirmish-board-frame\s*\{[\s\S]{0,300}?aspect-ratio:\s*var\(--board-view-aspect\);/,
    );
    expect(styleCss).toMatch(
      /\.skirmish-field\s*\{[\s\S]{0,200}?container-name:\s*board-view-seat;[\s\S]{0,200}?container-type:\s*size;/,
    );
  });

  it('bleeds the free-panned board art past its frame, but only for the Play board', () => {
    expect(styleCss).toMatch(
      /\.skirmish-screen:not\(\.level-editor-screen\) \.skirmish-field,[\s\S]{0,700}?overflow:\s*visible;/,
    );
    // Seated board previews inside Run workspaces keep their clip: the stage
    // selectors must stay scoped beneath .skirmish-board-frame.
    expect(styleCss).not.toMatch(
      /\.skirmish-screen:not\(\.level-editor-screen\) \.tileset-view-stage,/,
    );
  });

  it('keeps the persistent title bar outside the replaceable scene', () => {
    expect(appSource.indexOf('<AppTitleBar')).toBeGreaterThan(-1);
    expect(appSource.indexOf('<SceneBoundary')).toBeGreaterThan(appSource.indexOf('<AppTitleBar'));
    expect(styleCss).toMatch(
      /\.app-shell-titlebar\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0 0 auto 0;/,
    );
    expect(styleCss).not.toMatch(
      /\.shell\.skirmish-active \.app-root\s*\{[^}]*transform:/,
    );
  });

  it('declares the canonical board aspect once for every board-viewing surface', () => {
    expect(styleCss).toMatch(
      /--board-view-aspect-width:\s*4;[\s\S]*?--board-view-aspect-height:\s*3;/,
    );
    expect(styleCss).toMatch(
      /\.board-view-pane-seat > \.tileset-view-stage\.is-board\s*\{[\s\S]*?aspect-ratio:\s*var\(--board-view-aspect\);/,
    );
    expect(viewPaneSource).toContain('className="board-view-pane-seat"');
  });

  it('lets full-canvas Play and Level Editor boards fill their owning viewport while fixed previews keep the shared seat', () => {
    expect(skirmishBoardSource).toContain('boardViewportMode="fill"');
    expect(levelEditorSource).toContain('boardViewportMode="fill"');
    expect(viewPaneSource).toContain(
      "return kind === 'board' && boardViewportMode === 'canonical' ? (",
    );
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
});
