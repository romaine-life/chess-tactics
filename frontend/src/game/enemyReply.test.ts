import { describe, expect, it } from 'vitest';
import type { GameState, Piece, PieceType, Side } from '../core/types';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import { resolveEnemyReply } from './enemyReply';

function piece(id: string, side: Side, type: PieceType, x: number, y: number): Piece {
  return { id, side, type, x, y, alive: true, startX: x, startY: y };
}

describe('resolveEnemyReply authored-rule plumbing', () => {
  it('passes the exact VictoryRules into worker-side search', () => {
    const game: GameState = {
      size: { cols: 8, rows: 8 },
      turn: 'enemy',
      winner: null,
      pieces: [
        piece('e-rook', 'enemy', 'rook', 0, 4),
        piece('p-king', 'player', 'king', 7, 4),
        piece('p-queen', 'player', 'queen', 0, 0),
        piece('e-king', 'enemy', 'king', 7, 1),
      ],
    };
    const victoryRules = [{
      name: 'Take the Queen',
      if: [{ kind: 'eliminate' as const, side: 'player' as const, filter: { type: 'queen' as const } }],
      do: [{ kind: 'win' as const, side: 'enemy' as const }],
    }];

    const result = resolveEnemyReply({
      game,
      seed: 7,
      tick: 0,
      aiMode: 'search',
      objective: 'rival-kings',
      victoryRules,
      ctx: { kingSide: 'enemy' },
      turnsElapsed: 0,
      weights: DEFAULT_EVAL_WEIGHTS,
    });

    expect(result.game.pieces.find((p) => p.id === 'p-queen')?.alive).toBe(false);
    expect(result.game.pieces.find((p) => p.id === 'p-king')?.alive).toBe(true);
  }, 20_000);

  it('notates every half-move of the reply, because the caller only sees the last board', () => {
    const game: GameState = {
      size: { cols: 8, rows: 8 },
      turn: 'enemy',
      winner: null,
      pieces: [
        piece('e-rook', 'enemy', 'rook', 0, 4),
        piece('p-king', 'player', 'king', 7, 4),
        piece('p-queen', 'player', 'queen', 0, 0),
        piece('e-king', 'enemy', 'king', 7, 1),
      ],
    };

    const result = resolveEnemyReply({
      game,
      seed: 7,
      tick: 0,
      aiMode: 'greedy',
      objective: 'rival-kings',
      victoryRules: [],
      ctx: { kingSide: 'enemy' },
      turnsElapsed: 0,
      weights: DEFAULT_EVAL_WEIGHTS,
    });

    // The rook runs the rank and takes the King: files run a.. from x=0 and ranks count
    // from the player's home edge, so (7,4) is h4. One token per half-move played, and no
    // check mark — the side that would be checked no longer fields a King.
    expect(result.notation).toEqual(['Rxh4']);
  });
});
