import { useMemo, type ReactElement } from 'react';
import { StudioReadOnlyBoard } from '../../render/StudioReadOnlyBoard';
import { BOARD_GRID_STYLES, type BoardGridStyle } from '../../settings/appSettings';
import { BOARD_GRID_STYLE_LABELS } from '../../settings/boardGridStyle';
import { AssetSwatchList } from './AssetSwatchList';
import { boardGridStyleSwatchBoard } from './boardGridStyleSwatchBoard';

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
//  - One shared board. Varying the ground under each line would confound the comparison with the
//    thing these styles actually differ in — how a line holds up against what it crosses.
//
// The ground itself is a real battle board rather than a procedural grass field; see
// boardGridStyleSwatchBoard.

export function BoardGridStylePicker({
  value,
  onChange,
}: {
  value: BoardGridStyle;
  onChange: (style: BoardGridStyle) => void;
}): ReactElement {
  const board = useMemo(() => boardGridStyleSwatchBoard(), []);

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
