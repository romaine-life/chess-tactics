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
});
