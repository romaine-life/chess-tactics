// Deterministic skirmish assembly: builds the initial GameState (player party,
// enemy force, scattered rocks) from a seed. Pure — no DOM, no Math.random.
// Replaces the legacy startGame() placement with a seeded, testable version.

import type { BoardSize, GameState, Piece, PieceType, Side } from '../core/types';
import { createRng, type Rng } from '../core/rng';

const DEFAULT_SIZE: BoardSize = { cols: 8, rows: 12 };
const ENEMY_CHOICES: readonly PieceType[] = ['knight', 'bishop', 'rook'];

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
  const pieces: Piece[] = [];
  const taken = new Set<string>();

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

  return { size, pieces, turn: 'player', winner: null };
}
