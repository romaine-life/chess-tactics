import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyDrawableCatalog, isPredrawnBackgroundActive } from '@chess-tactics/board-render';
import { runtimePredrawnBoardPlate } from '../../render/PredrawnBoardLayer';
import { testDrawableCatalog } from '../../test/drawableCatalog';
import { BOARD_GRID_STYLES } from '../../settings/appSettings';
import { BOARD_GRID_STYLE_LABELS } from '../../settings/boardGridStyle';
import { BoardGridStylePicker, boardGridStyleOptions } from './BoardGridStylePicker';
import { boardGridStyleSwatchBoard } from './boardGridStyleSwatchBoard';

const styleSheet = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');
const levelEditor = readFileSync(new URL('../LevelEditor.tsx', import.meta.url), 'utf8');

describe('board grid style picker', () => {
  beforeAll(() => {
    applyDrawableCatalog(testDrawableCatalog());
  });

  it('draws the chosen style on ONE board, and names it in the closed control', () => {
    const markup = renderToStaticMarkup(<BoardGridStylePicker value="carved" onChange={() => {}} />);

    // One picture, at a size the line is legible. Five boards sharing the row could not show a
    // one-to-three-pixel difference, which is the defect this surface exists to fix.
    expect(markup.match(/tileset-board-grid-layer/g)).toHaveLength(1);
    expect(markup).toContain('data-board-grid-style="carved"');
    expect(markup).toContain('aria-label="Carved grid over board terrain"');

    // Which style is picked was a frame tone the eye had to hunt for. The closed dropdown says it.
    expect(markup).toContain(BOARD_GRID_STYLE_LABELS.carved.label);
  });

  it('offers every style, each chip drawn from that style own variables', () => {
    // A style the list knows about but never offers is the choice going missing; a chip painted
    // with a hardcoded colour is the list drifting from what the battlefield actually draws.
    const options = boardGridStyleOptions();
    expect(options.map((option) => option.value)).toEqual([...BOARD_GRID_STYLES]);
    for (const option of options) {
      const row = renderToStaticMarkup(<>{option.label}</>);
      expect(row).toContain(`data-board-grid-style="${option.value}"`);
      expect(row).toContain(BOARD_GRID_STYLE_LABELS[option.value].label);
      expect(option.title).toBe(BOARD_GRID_STYLE_LABELS[option.value].detail);
    }
    const chipRule = styleSheet.match(/\.board-grid-style-chip line \{[^}]*\}/)?.[0] ?? '';
    expect(chipRule).toContain('var(--board-grid-stroke');
    expect(chipRule).toContain('var(--board-grid-weight');
    expect(chipRule).toContain('var(--board-grid-bevel');
  });

  it('holds the preview at canonical 1x rather than fitting a camera to the box', () => {
    // A fitted camera scales the board with a CSS transform, which thins the rendered stroke and
    // silently misreports the very weight the player is choosing.
    const markup = renderToStaticMarkup(<BoardGridStylePicker value="chalk" onChange={() => {}} />);
    expect(markup.match(/--board-zoom:1/g)).toHaveLength(1);
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

  it('walks the preview window off the board centre', () => {
    // A Battle board keeps its playable squares on clear painted ground, so the board's own centre
    // is the least informative crop there is: flat meadow, where every style looks acceptable.
    const markup = renderToStaticMarkup(<BoardGridStylePicker value="chalk" onChange={() => {}} />);
    const pans = [...markup.matchAll(/--board-pan-x:(-?[\d.]+)px;--board-pan-y:(-?[\d.]+)px/g)];
    expect(pans).toHaveLength(1);
    // The crop must not move with the style, or switching styles changes the ground as well as
    // the line and the player cannot tell which one they just judged.
    for (const style of BOARD_GRID_STYLES) {
      const other = renderToStaticMarkup(<BoardGridStylePicker value={style} onChange={() => {}} />);
      const otherPan = /--board-pan-x:(-?[\d.]+)px;--board-pan-y:(-?[\d.]+)px/.exec(other);
      expect(`${otherPan?.[1]},${otherPan?.[2]}`).toBe(`${pans[0][1]},${pans[0][2]}`);
    }
    expect(Number(pans[0][1]) === 0 && Number(pans[0][2]) === 0).toBe(false);
  });

  it('gives every style inheritable variables so the preview can differ from the root choice', () => {
    // `:root`-anchored rules cannot express a preview that disagrees with the app around it: the
    // attribute has to be able to ride the preview, and the nearest one has to win.
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

  it('takes the styled line back off the placement pin, for the swatch and the authoring board', () => {
    // StudioReadOnlyBoard is a placement board, and placement boards pin the grid to one grey line
    // so a player's choice cannot disturb a geometry-verification surface or a picture baked from
    // one. The picker is the one surface whose job IS the player's line, so it must win — by source
    // order, at equal specificity — while every read-only placement board keeps the pin.
    const placementPin = styleSheet.indexOf('.tileset-placement-board .tileset-board-grid-layer path');
    const swatchOverride = styleSheet.indexOf('.board-grid-style-swatch-board .tileset-board-grid-layer path');
    expect(placementPin).toBeGreaterThan(-1);
    expect(swatchOverride).toBeGreaterThan(placementPin);
    expect(styleSheet.slice(swatchOverride)).toMatch(/^[^}]*var\(--board-grid-stroke/);

    // The Level Editor's board is the other exception: a level is authored on the same grid it is
    // played on, so its Playable grid / Whole grid overlay wears the player's choice. This one wins
    // by specificity rather than source order, so moving the block cannot silently re-pin it.
    const authoringOverride = styleSheet.indexOf('.tileset-placement-board.is-authoring .tileset-board-grid-layer path');
    expect(authoringOverride).toBeGreaterThan(-1);
    const authoringBlock = styleSheet.slice(authoringOverride).split('}')[0];
    expect(authoringBlock).toContain('var(--board-grid-stroke');
    expect(authoringBlock).toContain('var(--board-grid-weight');
    expect(authoringBlock).toContain('var(--board-grid-bevel');

    // A selector with no host draws nothing, and the failure is invisible: the editor would quietly
    // fall back to the placement grey. Keep the class the rule hangs on and the board that emits it
    // in the same assertion.
    expect(levelEditor).toContain('tileset-placement-board is-authoring is-tool-');
  });
});
