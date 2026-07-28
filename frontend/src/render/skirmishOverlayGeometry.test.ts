// @ts-nocheck — node built-ins are untyped in the app tsconfig; Vitest runs
// this source-contract check through esbuild.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const skirmishBoard = readFileSync(new URL('./SkirmishBoard.tsx', import.meta.url), 'utf8');
const levelEditor = readFileSync(new URL('../ui/LevelEditor.tsx', import.meta.url), 'utf8');
const tileGrid = readFileSync(new URL('./TileGrid.tsx', import.meta.url), 'utf8');

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `style.css should contain a ${selector} rule`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('Skirmish tactical overlay geometry', () => {
  it('derives its painted and interactive diamond from the canonical board cell variables', () => {
    const body = ruleBody('.skirmish-board-cell-hit');

    expect(body).toMatch(/width:\s*var\(--iso-tile-width\)/);
    expect(body).toMatch(/height:\s*var\(--iso-tile-height\)/);
    expect(body).toMatch(/left:\s*0/);
    expect(body).toMatch(/top:\s*0/);
    expect(body).not.toMatch(/(?:width|height|left|top):\s*-?\d+px/);
    expect(body).not.toMatch(/transform:/);
  });

  it('clips every gameplay cell-highlight channel while preserving the complete hit diamond', () => {
    const hitBody = ruleBody('.skirmish-board-cell-hit');
    const visualClipRule = css.slice(
      css.indexOf('One presentation-only footprint gate'),
      css.indexOf('Army-wide display layers'),
    );

    expect(hitBody).toContain('clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%)');
    expect(hitBody).not.toContain('--predrawn-visual-footprint-clip');
    expect(visualClipRule).toContain('.skirmish-board-cell-hit::before');
    expect(visualClipRule).toContain('.skirmish-board-cell-hit::after');
    expect(visualClipRule).toContain('.predrawn-cyan-move-highlight-paint');
    expect(visualClipRule).toContain('--predrawn-visual-footprint-clip');
    for (const state of [
      'is-player-move',
      'is-enemy-move',
      'is-player-attack',
      'is-promotion-zone',
      'is-threat',
      'is-move',
      'is-blocked-candidate',
      'is-premove-target',
      'is-premove',
      'is-selected',
      'is-focused-piece',
      'is-drop-aim',
      'is-drop-hover',
    ]) expect(css).toContain(`.skirmish-board-cell-hit.${state}`);
    expect(css).not.toContain('.skirmish-board-cell-hit.is-move::before');
    expect(css).toContain('.skirmish-board-cell-hit.is-move:not(.is-blocked-candidate)');
    expect(skirmishBoard).toContain('<PredrawnMoveHighlightPaint />');
    expect(skirmishBoard).toContain('predrawnVisualFootprintClipStyleForCell(exactBoard?.surface, key)');
    expect(skirmishBoard).toContain('style={visualFootprintStyle as CSSProperties | undefined}');
  });

  it('clips Level Editor cell paint without changing its hit targets or logical grid marker', () => {
    const visualClipRule = css.slice(
      css.indexOf('One presentation-only footprint gate'),
      css.indexOf('Army-wide display layers'),
    );
    for (const selector of [
      '.le-tactical-cell',
      '.le-zone-cell',
      '.le-region-cell',
      '.tileset-cell-ring',
      '.tileset-cell-hit::before',
      '.le-prop-ghost-cell',
    ]) expect(visualClipRule).toContain(selector);

    expect(ruleBody('.tileset-cell-hit')).toContain(
      'clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
    );
    expect(ruleBody('.tileset-cell-hit')).not.toContain('--predrawn-visual-footprint-clip');
    expect(ruleBody('.tileset-placement-cell.is-empty::before')).toContain(
      'clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
    );
    expect(levelEditor).toContain('style: visualFootprintStyle as CSSProperties | undefined');
    expect(levelEditor).toContain('predrawnVisualFootprintClipStyleForCell(');
    expect(levelEditor).not.toContain("clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)'");
    expect(tileGrid).toContain('...cell.style');
  });
});
