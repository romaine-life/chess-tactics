import { describe, it, expect } from 'vitest';
import { premoveGhosts, premoveArrows, premoveTargets } from './premoves';
import type { GameState, Piece, PieceType, Side } from '../core/types';

function piece(id: string, side: Side, type: PieceType, x: number, y: number): Piece {
  return { id, side, type, x, y, alive: true, startY: y };
}
function board(pieces: Piece[]): GameState {
  return { size: { cols: 8, rows: 8 }, pieces, turn: 'player', winner: null };
}

describe('premoveGhosts', () => {
  it('a single premove yields one ghost group at its destination', () => {
    const g = board([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 7, 0), piece('ek', 'enemy', 'king', 7, 7)]);
    const groups = premoveGhosts(g, [{ pieceId: 'pr', x: 0, y: 3 }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('0,3');
    expect(groups[0].pieces.map((p) => p.id)).toEqual(['pr']);
  });

  it('leaves a ghost on EVERY square a unit lands on across a multi-step chain', () => {
    const g = board([piece('pr', 'player', 'rook', 0, 0), piece('pk', 'player', 'king', 7, 0), piece('ek', 'enemy', 'king', 7, 7)]);
    // rook: (0,0) → (0,3) → (3,3). Both landing squares get a ghost, not just the final one.
    const groups = premoveGhosts(g, [{ pieceId: 'pr', x: 0, y: 3 }, { pieceId: 'pr', x: 3, y: 3 }]);
    expect(groups.map((gr) => gr.key).sort()).toEqual(['0,3', '3,3']);
    expect(groups.every((gr) => gr.pieces.length === 1 && gr.pieces[0].id === 'pr')).toBe(true);
    expect(premoveArrows(g, [{ pieceId: 'pr', x: 0, y: 3 }, { pieceId: 'pr', x: 3, y: 3 }])).toHaveLength(2);
  });

  it('two units that plan the same square SHARE the tile (both shown), not one hiding the other', () => {
    const g = board([
      piece('rx', 'player', 'rook', 0, 0),
      piece('ry', 'player', 'rook', 5, 3),
      piece('pk', 'player', 'king', 7, 0),
      piece('ek', 'enemy', 'king', 7, 7),
    ]);
    // Both rooks plan to land on (0,3). Plans are independent, so ry isn't blocked by rx's plan.
    const groups = premoveGhosts(g, [{ pieceId: 'rx', x: 0, y: 3 }, { pieceId: 'ry', x: 0, y: 3 }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].pieces.map((p) => p.id).sort()).toEqual(['rx', 'ry']);
  });

  it('a unit can target a square another unit already plans — plans do not block each other', () => {
    const g = board([
      piece('rx', 'player', 'rook', 0, 0),
      piece('ry', 'player', 'rook', 5, 3),
      piece('pk', 'player', 'king', 7, 0),
      piece('ek', 'enemy', 'king', 7, 7),
    ]);
    const targets = premoveTargets(g, [{ pieceId: 'rx', x: 0, y: 3 }], 'ry');
    expect(targets.some((m) => m.x === 0 && m.y === 3)).toBe(true);
  });

  it('a unit can premove onto a friendly-occupied square as a speculative recapture', () => {
    const g = board([
      piece('pr', 'player', 'rook', 0, 3),
      piece('bait', 'player', 'pawn', 3, 3),
      piece('pk', 'player', 'king', 7, 0),
      piece('ek', 'enemy', 'king', 7, 7),
    ]);
    const targets = premoveTargets(g, [], 'pr');
    expect(targets.some((m) => m.x === 3 && m.y === 3)).toBe(true);
    expect(targets.some((m) => m.x === 4 && m.y === 3)).toBe(false);
  });

  it('a chain can continue from a speculative recapture square', () => {
    const g = board([
      piece('pr', 'player', 'rook', 0, 3),
      piece('bait', 'player', 'pawn', 3, 3),
      piece('pk', 'player', 'king', 7, 0),
      piece('ek', 'enemy', 'king', 7, 7),
    ]);
    const targets = premoveTargets(g, [{ pieceId: 'pr', x: 3, y: 3 }], 'pr');
    expect(targets.some((m) => m.x === 3 && m.y === 0)).toBe(true);
  });

  it('a premove onto the rook square is the CASTLE, not a speculative recapture (ADR-0072)', () => {
    const g: GameState = {
      ...board([
        piece('pk', 'player', 'king', 4, 7),
        piece('prk', 'player', 'rook', 7, 7),
        piece('ek', 'enemy', 'king', 0, 0),
      ]),
      castleRules: [{ side: 'player', king: { x: 4, y: 7 }, rook: { x: 7, y: 7 }, kingTo: { x: 6, y: 7 }, rookTo: { x: 5, y: 7 } }],
    };
    const targets = premoveTargets(g, [], 'pk');
    const onRook = targets.find((m) => m.x === 7 && m.y === 7);
    expect(onRook?.castle?.kingTo).toEqual({ x: 6, y: 7 }); // the castle payload wins the square
    expect(targets.filter((m) => m.x === 7 && m.y === 7)).toHaveLength(1); // no duplicate speculative entry
  });
});
