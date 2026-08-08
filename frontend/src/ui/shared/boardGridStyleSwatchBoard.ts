import { createBlankLevel } from '../../core/level';
import { levelToEditorBoard } from '../../core/levelBoard';
import type { EditorBoard } from './../boardCode';

/**
 * The ground the Grid style swatches are drawn over: a six-by-six patch of River Crossing, a real
 * Crown of Valoria battle board, transcribed cell for cell from its canonical board.
 *
 * WHY THIS PATCH. These styles differ in how a line holds up against what it crosses, so the
 * ground has to contain something to cross. This one carries the river, the cobbled road over it,
 * four stands of grass cover and five authored grass variants — grass, stone and water, which is
 * exactly the range the shipped style descriptions claim to hold up over. A procedural grass field
 * (the first version of this) let every style look equally fine, which is the same as answering
 * nothing.
 *
 * WHY SIX BY SIX. The swatch is a fixed window onto a board at canonical 1x, so the board has to
 * overflow that window from every edge or a swatch shows its own corner and empty backdrop. An
 * isometric board is a rhombus, so its usable middle is far smaller than its bounding box: Break
 * the Line, the campaign's first battle, is three columns wide and only ~141px thick across its
 * short axis, which is not enough. Six by six clears the window with margin on all sides.
 *
 * WHY A TRANSCRIPTION rather than a fetch. A swatch is a SAMPLE of the game's board art, not a
 * live mirror of one level. This paints on the first frame with no API in the path and no failure
 * mode, and if River Crossing is re-dressed tomorrow this is still a true piece of authored ground
 * and still answers the only question the picker asks. It is written out as terrain rather than an
 * opaque board code so the ground under the comparison is reviewable here.
 *
 * Units, promotion zones and the camera are deliberately absent: a zone tint would recolour the
 * very ground the styles are being compared over.
 */
const TERRAIN: readonly (readonly string[])[] = [
  ['grass-surf-0', 'grass-surf-0', 'water-surf-2', 'grass-surf-3', 'grass-surf-0', 'grass-surf-4'],
  ['grass-surf-0', 'grass-surf-0', 'water-surf-2', 'grass-surf-3', 'grass-surf-0', 'grass-surf-6'],
  ['grass-surf-0', 'grass-surf-0', 'water-surf-2', 'water-surf-2', 'water-surf-2', 'water-surf-2'],
  ['grass-surf-0', 'grass-surf-0', 'grass-surf-0', 'grass-surf-0', 'grass-surf-0', 'water-surf-2'],
  ['grass-surf-0', 'grass-surf-0', 'grass-surf-4', 'grass-surf-4', 'grass-surf-0', 'water-surf-2'],
  ['grass-surf-5', 'grass-surf-5', 'grass-surf-0', 'grass-surf-0', 'grass-surf-0', 'grass-surf-0'],
];

/** Standing grass cover, by cell. */
const COVER_CELLS = ['1,0', '3,0', '1,2', '5,5'];

/** The cobbled road, which crosses the river along one row. */
const ROAD_CELLS = ['0,3', '1,3', '2,3', '3,3', '4,3', '5,3'];
const ROAD = { kind: 'road', material: 'cobble' } as const;

const COLS = TERRAIN[0].length;
const ROWS = TERRAIN.length;

export function boardGridStyleSwatchBoard(): EditorBoard {
  const cells: EditorBoard['cells'] = {};
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) cells[`${x},${y}`] = TERRAIN[y][x];
  }
  const cover: EditorBoard['cover'] = {};
  for (const key of COVER_CELLS) cover[key] = 'filled';
  const features: NonNullable<EditorBoard['features']> = {};
  for (const key of ROAD_CELLS) features[key] = { ...ROAD };

  const level = createBlankLevel('settings-grid-style', 'Grid style', COLS, ROWS);
  return { ...levelToEditorBoard(level), cells, cover, features };
}
