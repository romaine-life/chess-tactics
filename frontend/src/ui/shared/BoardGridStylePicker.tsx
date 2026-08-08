import { useMemo, type ReactElement } from 'react';
import { createBlankLevel } from '../../core/level';
import { levelToEditorBoard } from '../../core/levelBoard';
import { StudioReadOnlyBoard } from '../../render/StudioReadOnlyBoard';
import { BOARD_GRID_STYLES, type BoardGridStyle } from '../../settings/appSettings';
import { BOARD_GRID_STYLE_LABELS } from '../../settings/boardGridStyle';
import { generateTerrainDressing } from '../generatedReferenceBoard';
import { AssetSwatchList } from './AssetSwatchList';

// Settings → Gameplay → Grid style, as five real boards instead of five words.
//
// The names alone ("Carved", "Bold") do not tell the player which line they are choosing, and the
// only way to find out was to pick one, leave Settings, reach a battlefield, and come back — once
// per style. So the choice is made where the difference is visible: every style is drawn at the
// same moment, over the SAME terrain, so the only thing that differs between swatches is the line
// itself.
//
// Two things make the pixels honest rather than decorative:
//
//  - Canonical 1× and no camera fit. The board grid uses a non-scaling stroke, but the board's
//    zoom is a CSS transform on an ancestor, which scales the rendered result regardless. A
//    contained "fit the board to the swatch" camera would therefore quietly thin every line and
//    misreport the weights the player is comparing. The swatch is a fixed window onto a board held
//    at 1×; the board is sized to overflow it from every edge so no swatch shows a board corner.
//  - One shared dressing. A per-swatch seed would vary the terrain under each line, and terrain
//    contrast is exactly what these styles differ in — the comparison has to hold it fixed.
const SWATCH_BOARD_COLS = 4;
const SWATCH_BOARD_ROWS = 4;
const SWATCH_BOARD_SEED = 0x6c1d51;

export function BoardGridStylePicker({
  value,
  onChange,
}: {
  value: BoardGridStyle;
  onChange: (style: BoardGridStyle) => void;
}): ReactElement {
  const board = useMemo(() => {
    const level = createBlankLevel(
      'settings-grid-style',
      'Grid style',
      SWATCH_BOARD_COLS,
      SWATCH_BOARD_ROWS,
    );
    return {
      ...levelToEditorBoard(level),
      ...generateTerrainDressing({
        cols: SWATCH_BOARD_COLS,
        rows: SWATCH_BOARD_ROWS,
        seed: SWATCH_BOARD_SEED,
      }),
    };
  }, []);

  return (
    <AssetSwatchList
      className="board-grid-style-swatches"
      ariaLabel="Board grid style"
      items={BOARD_GRID_STYLES.map((style) => {
        const { label, detail } = BOARD_GRID_STYLE_LABELS[style];
        return {
          id: style,
          label,
          title: detail,
          className: 'board-grid-style-swatch',
          selected: style === value,
          onSelect: () => onChange(style),
          content: (
            <>
              {/* The attribute rides the swatch, not :root, so five styles coexist on one page. */}
              <span className="board-grid-style-swatch-window" data-board-grid-style={style}>
                <StudioReadOnlyBoard
                  board={board}
                  className="board-grid-style-swatch-board"
                  ariaLabel={`${label} grid over board terrain`}
                  showGrid
                  still
                />
              </span>
              <small>{label}</small>
            </>
          ),
        };
      })}
    />
  );
}
