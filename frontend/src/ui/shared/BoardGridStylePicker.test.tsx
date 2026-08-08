import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyDrawableCatalog, isPredrawnBackgroundActive } from '@chess-tactics/board-render';
import { runtimePredrawnBoardPlate } from '../../render/PredrawnBoardLayer';
import { testDrawableCatalog } from '../../test/drawableCatalog';
import { BOARD_GRID_STYLES } from '../../settings/appSettings';
import { BOARD_GRID_STYLE_LABELS } from '../../settings/boardGridStyle';
import { BoardGridStylePicker } from './BoardGridStylePicker';
import { boardGridStyleSwatchBoard } from './boardGridStyleSwatchBoard';

const styleSheet = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');

describe('board grid style picker', () => {
  beforeAll(() => {
    applyDrawableCatalog(testDrawableCatalog());
  });

  it('draws every style at once, each scoped to its own swatch', () => {
    const markup = renderToStaticMarkup(<BoardGridStylePicker value="carved" onChange={() => {}} />);

    // The picker exists so the player never has to leave Settings to see a style, so a style the
    // list knows about but does not draw is the whole defect coming back.
    for (const style of BOARD_GRID_STYLES) {
      expect(markup).toContain(`data-board-grid-style="${style}"`);
      expect(markup).toContain(BOARD_GRID_STYLE_LABELS[style].label);
    }
    expect(markup.match(/data-chrome-unit="inner-asset-swatch"/g)).toHaveLength(BOARD_GRID_STYLES.length);
    expect(markup.match(/tileset-board-grid-layer/g)).toHaveLength(BOARD_GRID_STYLES.length);
    // Exactly one swatch is lit, and it is the stored choice.
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Carved grid over board terrain"');
  });

  it('holds every swatch at canonical 1x rather than fitting a camera to the box', () => {
    // A fitted camera scales the board with a CSS transform, which thins the rendered stroke and
    // silently misreports the very weights the player is comparing.
    const markup = renderToStaticMarkup(<BoardGridStylePicker value="chalk" onChange={() => {}} />);
    expect(markup.match(/--board-zoom:1/g)).toHaveLength(BOARD_GRID_STYLES.length);
    expect(markup).not.toContain('--board-zoom:0');
  });

  it('draws the styles over a painted Battle board, not composed terrain tiles', () => {
    // Runs are what get played, and a Run board is one PAINTED plate with the grid drawn on the
    // picture. That is the case the shipped `chalk` rule exists for — "a dark line disappears into
    // shadowed terrain and painted artwork". A swatch standing on tile terrain would let a style
    // look fine here and vanish in the game.
    const board = boardGridStyleSwatchBoard();
    expect(board.backgroundMode).toBe('ai');
    expect(isPredrawnBackgroundActive(board)).toBe(true);
    expect(board.surface).toBeTruthy();
    // The plate is live: it resolves through the ordinary runtime path to the same pixels the
    // Battle draws, rather than a packaged copy of the artwork.
    expect(runtimePredrawnBoardPlate(board.surface!).src).toMatch(/^\/api\/background-versions\/[^/]+\/content$/);
  });

  it('walks the swatch window off the board centre', () => {
    // A Battle board keeps its playable squares on clear painted ground, so the board's own centre
    // is the least informative crop there is: flat meadow, where every style looks acceptable.
    const markup = renderToStaticMarkup(<BoardGridStylePicker value="chalk" onChange={() => {}} />);
    const pans = [...markup.matchAll(/--board-pan-x:(-?[\d.]+)px;--board-pan-y:(-?[\d.]+)px/g)];
    expect(pans).toHaveLength(BOARD_GRID_STYLES.length);
    // Every swatch shares one crop, or the comparison varies the ground as well as the line.
    expect(new Set(pans.map((pan) => `${pan[1]},${pan[2]}`)).size).toBe(1);
    expect(Number(pans[0][1]) === 0 && Number(pans[0][2]) === 0).toBe(false);
  });

  it('gives every style inheritable variables so swatches can differ from the root choice', () => {
    // `:root`-anchored rules cannot express five styles on one page: the attribute has to be able
    // to ride a swatch, and the nearest one has to win.
    for (const style of BOARD_GRID_STYLES) {
      const block = styleSheet.match(
        new RegExp(`\\[data-board-grid-style='${style}'\\]\\s*\\{[^}]*\\}`),
      )?.[0];
      expect(block, `${style} has no scoped variable block`).toBeTruthy();
      expect(block).toContain('--board-grid-stroke');
      expect(block).toContain('--board-grid-weight');
      expect(block).toContain('--board-grid-bevel');
      expect(block).not.toContain(':root');
    }
    expect(styleSheet).toMatch(/\.tileset-board-grid-layer path \{[^}]*var\(--board-grid-stroke/);
  });

  it('takes the styled line back off the placement pin, and only for the swatch', () => {
    // StudioReadOnlyBoard is a placement board, and placement boards pin the grid to one grey line
    // so a player's choice cannot disturb a geometry-verification surface. The picker is the one
    // surface whose job IS the player's line, so it must win — by source order, at equal
    // specificity — while every other placement board keeps the pin.
    const placementPin = styleSheet.indexOf('.tileset-placement-board .tileset-board-grid-layer path');
    const swatchOverride = styleSheet.indexOf('.board-grid-style-swatch-board .tileset-board-grid-layer path');
    expect(placementPin).toBeGreaterThan(-1);
    expect(swatchOverride).toBeGreaterThan(placementPin);
    expect(styleSheet.slice(swatchOverride)).toMatch(/^[^}]*var\(--board-grid-stroke/);
  });
});
