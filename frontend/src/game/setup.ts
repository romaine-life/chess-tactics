// Deterministic skirmish assembly: builds the initial GameState (player party,
// enemy force, scattered rocks) from a seed. Pure — no DOM, no Math.random.
// Replaces the legacy startGame() placement with a seeded, testable version.

import type { BoardSize, GameState, Piece, PieceType, Side, TerrainCell, TerrainType } from '../core/types';
import { createRng, type Rng } from '../core/rng';
import { isPassableTerrain } from '../core/terrain';

const DEFAULT_SIZE: BoardSize = { cols: 8, rows: 12 };
const ENEMY_CHOICES: readonly PieceType[] = ['knight', 'bishop', 'rook'];

/**
 * Author a moonlit-grassland island terrain layer for a board. Deterministic
 * (driven by `rng`). Design constraints that keep the skirmish always playable:
 *  - The two spawn bands (top two + bottom two rows) stay open grass.
 *  - Impassable tiles (water marking the island edge) only ever land on the
 *    OUTER columns, so the interior columns stay fully connected — pieces can
 *    never be walled off.
 *  - A stone road runs down the centre and a few stone flecks add texture; both
 *    stay passable.
 * Elevation is left at 0 this pass (the floating-island silhouette is rendered
 * as decorative skirt geometry, not gameplay height).
 */
function buildTerrain(size: BoardSize, rng: Rng): TerrainCell[] {
  const { cols, rows } = size;
  const material: Record<string, TerrainType> = {};
  const put = (x: number, y: number, t: TerrainType): void => { material[`${x},${y}`] = t; };

  const interiorTop = 2;
  const interiorBottom = rows - 3;
  const roadCol = Math.floor(cols / 2);

  // Island edge: water down the outer columns, inset one row from each spawn
  // band so a grass shore separates the troops from the drop.
  for (let y = interiorTop + 1; y <= interiorBottom - 1; y += 1) {
    put(0, y, 'water');
    put(cols - 1, y, 'water');
  }
  // Centre stone road through the grassland.
  for (let y = interiorTop; y <= interiorBottom; y += 1) put(roadCol, y, 'road');
  // A handful of stone flecks scattered across the interior for texture.
  const interiorRowSpan = Math.max(0, interiorBottom - interiorTop + 1);
  const flecks = interiorRowSpan ? 4 + rng.int(3) : 0;
  for (let i = 0; i < flecks; i += 1) {
    const x = 1 + rng.int(Math.max(1, cols - 2));
    const y = interiorTop + rng.int(interiorRowSpan);
    if (!material[`${x},${y}`]) put(x, y, 'stone');
  }

  const cells: TerrainCell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      cells.push({ x, y, terrain: material[`${x},${y}`] ?? 'grass', elevation: 0 });
    }
  }
  return cells;
}

export interface SkirmishOptions {
  seed: number;
  size?: BoardSize;
  /** Player party (a pawn is always also fielded). */
  party?: PieceType[];
}

function pickEmptyCell(taken: Set<string>, cols: number, ys: readonly number[], rng: Rng): { x: number; y: number } | null {
  const cells: Array<{ x: number; y: number }> = [];
  for (const y of ys) {
    for (let x = 0; x < cols; x += 1) {
      if (!taken.has(`${x},${y}`)) cells.push({ x, y });
    }
  }
  return cells.length ? rng.pick(cells) : null;
}

export function createSkirmish(opts: SkirmishOptions): GameState {
  const size = opts.size ?? DEFAULT_SIZE;
  const party = opts.party ?? ['knight', 'bishop'];
  const rng = createRng(opts.seed);
  const terrain = buildTerrain(size, rng);
  const pieces: Piece[] = [];
  // Seed `taken` with impassable terrain so no piece spawns on water/cliff.
  const taken = new Set<string>();
  for (const c of terrain) if (!isPassableTerrain(c.terrain)) taken.add(`${c.x},${c.y}`);

  const place = (side: Side, types: readonly PieceType[], ys: readonly number[]): void => {
    types.forEach((type, i) => {
      const cell = pickEmptyCell(taken, size.cols, ys, rng);
      if (!cell) return;
      taken.add(`${cell.x},${cell.y}`);
      pieces.push({
        id: `${side}-${type}-${i}`,
        side,
        type,
        x: cell.x,
        y: cell.y,
        alive: true,
        startY: side === 'player' ? size.rows - 1 : 0,
      });
    });
  };

  place('player', ['pawn', ...party], [size.rows - 1, size.rows - 2]);
  place('enemy', ['pawn', rng.pick(ENEMY_CHOICES), rng.pick(ENEMY_CHOICES)], [0, 1]);

  const midYs: number[] = [];
  for (let y = 2; y <= size.rows - 3; y += 1) midYs.push(y);
  const rockCount = 3 + rng.int(4);
  for (let i = 0; i < rockCount; i += 1) {
    const cell = pickEmptyCell(taken, size.cols, midYs, rng);
    if (!cell) break;
    taken.add(`${cell.x},${cell.y}`);
    pieces.push({ id: `rock-${i}`, side: 'neutral', type: 'rock', x: cell.x, y: cell.y, alive: true, startY: -1 });
  }

  return { size, pieces, terrain, turn: 'player', winner: null };
}
