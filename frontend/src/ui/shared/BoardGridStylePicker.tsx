import { useMemo, type ReactElement } from 'react';
import { StudioReadOnlyBoard } from '../../render/StudioReadOnlyBoard';
import { BOARD_GRID_STYLES, type BoardGridStyle } from '../../settings/appSettings';
import { BOARD_GRID_STYLE_LABELS } from '../../settings/boardGridStyle';
import { HouseSelect, type HouseSelectOption } from './HouseSelect';
import { boardGridStyleSwatchBoard } from './boardGridStyleSwatchBoard';

// Settings → Gameplay → Grid style: ONE board, at the size the difference is actually visible, and
// a dropdown that redraws it.
//
// This replaced a row of five side-by-side swatches. Five boards share the row's width between
// them, and the thing being compared is a line one to three pixels wide — so every swatch was too
// small to read, and which one was lit was a frame tone the eye had to hunt for. Five illegible
// pictures answer neither question the surface exists for: what does this style look like, and
// which one am I on. One large picture answers the first, and the closed dropdown states the
// second in words.
//
// Two things keep the pixels honest rather than decorative:
//
//  - Canonical 1× and no camera fit. The board grid uses a non-scaling stroke, but the board's
//    zoom is a CSS transform on an ancestor, which scales the rendered result regardless. A
//    contained "fit the board to the box" camera would therefore quietly thin the line and
//    misreport the weight the player is choosing. The preview is a fixed window onto a board held
//    at 1×; the board is sized to overflow it from every edge so no corner shows.
//  - A real Battle board rather than a procedural grass field; see boardGridStyleSwatchBoard.

/**
 * Where on that board the window sits, in screen pixels at 1x. A Battle board keeps its playable
 * squares on clear painted ground, so the board's own centre is the least informative crop there
 * is — flat meadow, where every style looks acceptable. This walks the window out to the corner
 * where the grid runs under the treeline and the windmill's shadow, which is the case a light
 * style exists for: a dark line disappearing into painted artwork.
 */
const SWATCH_VIEW_PAN = { x: -165, y: 46 };

/**
 * One row per style, each carrying a chip of the line itself. The dropdown menu only exists while
 * it is open, so this is exported for the surface contract to read the offered list directly.
 */
export function boardGridStyleOptions(): HouseSelectOption<BoardGridStyle>[] {
  return BOARD_GRID_STYLES.map((style) => ({
    value: style,
    title: BOARD_GRID_STYLE_LABELS[style].detail,
    label: (
      <span className="board-grid-style-option">
        {/* The line is drawn from the same three variables as the battlefield, so a style's colour
            and weight in this list cannot drift from what it draws on a board. The ground under it
            belongs to the sample, not to the chrome: these styles run from a near-white line to a
            near-black one, and on the panel's own dark surface the dark end simply disappears. It
            is painted here as artwork rather than as a CSS background, which would be bespoke
            surface paint outside the registered chrome kit. */}
        <span className="board-grid-style-chip" data-board-grid-style={style} aria-hidden="true">
          <svg viewBox="0 0 44 14" preserveAspectRatio="none">
            <rect className="board-grid-style-chip-ground" x="0" y="0" width="44" height="14" />
            <line x1="3" y1="11" x2="41" y2="3" vectorEffect="non-scaling-stroke" />
          </svg>
        </span>
        {BOARD_GRID_STYLE_LABELS[style].label}
      </span>
    ),
  }));
}

export function BoardGridStylePicker({
  value,
  onChange,
}: {
  value: BoardGridStyle;
  onChange: (style: BoardGridStyle) => void;
}): ReactElement {
  const board = useMemo(() => boardGridStyleSwatchBoard(), []);

  return (
    <div className="board-grid-style-picker">
      {/* The attribute rides the preview, not :root, so the picture shows the style being
          considered without the rest of the app switching under the player mid-decision. */}
      <span className="board-grid-style-preview" data-board-grid-style={value}>
        <StudioReadOnlyBoard
          board={board}
          boardPan={SWATCH_VIEW_PAN}
          className="board-grid-style-swatch-board"
          ariaLabel={`${BOARD_GRID_STYLE_LABELS[value].label} grid over board terrain`}
          showGrid
          still
        />
      </span>
      <HouseSelect
        className="board-grid-style-select"
        ariaLabel="Board grid style"
        value={value}
        onChange={onChange}
        options={boardGridStyleOptions()}
      />
    </div>
  );
}
