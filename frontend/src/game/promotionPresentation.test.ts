import { describe, expect, it } from 'vitest';
import type { GameState, Piece } from '../core/types';
import { promotionArrivalPieces } from './promotionPresentation';

const piece = (id: string, side: Piece['side'], type: Piece['type'], x: number, y: number): Piece => ({
  id,
  side,
  type,
  x,
  y,
  alive: true,
  startY: y,
});

describe('promotion arrival presentation', () => {
  it('lands as a Pawn and removes the captured unit without committing the game', () => {
    const game: GameState = {
      size: { cols: 8, rows: 8 },
      pieces: [
        piece('pawn', 'player', 'pawn', 0, 1),
        piece('target', 'enemy', 'rook', 1, 0),
        piece('king', 'enemy', 'king', 7, 7),
      ],
      promotionZones: [{ x: 1, y: 0 }],
      turn: 'player',
      winner: null,
    };

    const presented = promotionArrivalPieces(game, 'pawn', { x: 1, y: 0, capture: 'target' });

    expect(presented.find((candidate) => candidate.id === 'pawn')).toMatchObject({
      type: 'pawn',
      x: 1,
      y: 0,
    });
    expect(presented.find((candidate) => candidate.id === 'target')?.alive).toBe(false);
    expect(game.turn).toBe('player');
    expect(game.pieces.find((candidate) => candidate.id === 'pawn')).toMatchObject({ x: 0, y: 1 });
    expect(game.pieces.find((candidate) => candidate.id === 'target')?.alive).toBe(true);
  });
});
