import { createBlankLevel } from '../../core/level';
import { levelToEditorBoard } from '../../core/levelBoard';
import type { EditorBoard } from './../boardCode';

/**
 * The ground the Grid style swatches are drawn over: Escapee, the first Battle of the Run's War,
 * transcribed from its canonical board.
 *
 * WHY THIS BOARD, AND NOT A CAMPAIGN ONE. Runs are what actually get played, and a Run board is
 * not composed terrain tiles — it is one PAINTED plate with the grid drawn on top of the picture.
 * That is the hard case for every one of these styles, and the case the shipped `chalk` rule was
 * written for: "a dark line disappears into shadowed terrain and painted artwork — which is the
 * legibility problem this rule exists to solve." A swatch standing on tile terrain lets a style
 * look fine here and vanish in the game. Escapee's cells are all flat grass precisely because the
 * plate replaces them; the cells are carried anyway because they are the board's real geometry.
 *
 * WHY A TRANSCRIPTION rather than a fetch. The only read path for official levels returns the
 * whole 1.1MB portfolio, which is not something a settings control should pull to draw a swatch.
 * The plate itself is still live: `surface.backgroundVersionId` resolves through the ordinary
 * runtime path to `/api/background-versions/<id>/content`, the same pixels the Battle draws. A
 * background version is a durable historical record, so this keeps resolving after Escapee moves
 * to newer artwork — at which point this is still a true sample of the game's board art, which is
 * all a swatch claims to be.
 *
 * Units, promotion zones and the camera are deliberately absent: a zone tint would recolour the
 * very ground the styles are being compared over.
 */

/** Escapee's playable board. Every cell is flat grass under the painted plate. */
const COLS = 5;
const ROWS = 6;
const TILE = 'grass-surf-0';

/**
 * Escapee's installed board artwork, exactly as its canonical board records it. `backgroundMode`
 * is what turns the plate on; without it the renderer composes tiles and paints nothing.
 */
const SURFACE = {
  kind: 'predrawn',
  schemaVersion: 2,
  backgroundVersionId: '729e9e13-8e5e-44b7-a79a-d91767fb1efd',
  frameWidth: 1672,
  frameHeight: 941,
  worldBounds: { minX: -424, minY: -94, width: 800, height: 450 },
} as const;

export function boardGridStyleSwatchBoard(): EditorBoard {
  const cells: EditorBoard['cells'] = {};
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) cells[`${x},${y}`] = TILE;
  }
  const level = createBlankLevel('settings-grid-style', 'Grid style', COLS, ROWS);
  return {
    ...levelToEditorBoard(level),
    cells,
    backgroundMode: 'ai',
    surface: { ...SURFACE, worldBounds: { ...SURFACE.worldBounds } },
  };
}
