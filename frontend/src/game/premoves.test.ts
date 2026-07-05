import { describe, it, expect } from 'vitest';
import { premoveGhosts, premoveArrows } from './premoves';
import type { GameState, Piece, PieceType, Side } from '../core/types';

function piece(id: string, side: Side, type: PieceType, x: number, y: number): Piece {
  return { id, side, type, x, y, alive: true, startY: y };
}
function board(pieces: Piece[]): GameState {
  return { size: { cols: 8, rows: 8 }, pieces, turn: 'player', winner: null };
}

describe('premoveGhosts', () => {
  it('a single premove yields one ghost at its destination', () => {
    const g = board([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 7, 0), piece('ek', 'enemy', 'king', 7, 7)]);
    const ghosts = premoveGhosts(g, [{ pieceId: 'pr', x: 0, y: 3 }]);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toMatchObject({ id: 'pr', x: 0, y: 3 });
  });

  it('leaves a ghost on EVERY square a unit lands on across a multi-step chain', () => {
    const g = board([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 7, 0), piece('ek', 'enemy', 'king', 7, 7)]);
    // rook: (0,0) → (0,3) → (3,3). Both landing squares get a ghost, not just the final one.
    const ghosts = premoveGhosts(g, [{ pieceId: 'pr', x: 0, y: 3 }, { pieceId: 'pr', x: 3, y: 3 }]);
    expect(ghosts.map((p) => `${p.x},${p.y}`).sort()).toEqual(['0,3', '3,3']);
    expect(ghosts.every((p) => p.id === 'pr')).toBe(true);
    // The arrows trace the same path.
    expect(premoveArrows(g, [{ pieceId: 'pr', x: 0, y: 3 }, { pieceId: 'pr', x: 3, y: 3 }])).toHaveLength(2);
  });

  it('when two premoves share a square, the last to land wins', () => {
    const g = board([
      piece('rx', 'player', 'rook', 0, 0),
      piece('ry', 'player', 'rook', 3, 3),
      piece('pk', 'player', 'king', 7, 0),
      piece('ek', 'enemy', 'king', 7, 7),
    ]);
    // rx passes THROUGH (0,3) then vacates up to (0,5); ry then lands on (0,3) — ry wins that square.
    const ghosts = premoveGhosts(g, [
      { pieceId: 'rx', x: 0, y: 3 },
      { pieceId: 'rx', x: 0, y: 5 },
      { pieceId: 'ry', x: 0, y: 3 },
    ]);
    const at = (sq: string) => ghosts.find((p) => `${p.x},${p.y}` === sq);
    expect(at('0,3')?.id).toBe('ry'); // last to land wins
    expect(at('0,5')?.id).toBe('rx');
    expect(ghosts).toHaveLength(2);
  });
});
