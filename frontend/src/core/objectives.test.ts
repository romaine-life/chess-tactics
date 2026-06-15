import { describe, it, expect } from 'vitest';
import { evaluateObjective } from './objectives';
import type { GameState, Piece, PieceType, Side } from './types';

function piece(id: string, side: Side, type: PieceType, x: number, y: number): Piece {
  return { id, side, type, x, y, alive: true, startY: y };
}
function state(pieces: Piece[]): GameState {
  return { size: { cols: 8, rows: 8 }, pieces, turn: 'player', winner: null };
}

describe('evaluateObjective', () => {
  it('loses on a full player wipe regardless of objective', () => {
    const s = state([piece('e', 'enemy', 'queen', 0, 0)]);
    for (const obj of ['capture-all', 'capture-king', 'survive', 'reach'] as const) {
      expect(evaluateObjective(s, obj)).toBe('enemy');
    }
  });

  it('capture-all: undecided while enemies live, won when none remain', () => {
    expect(evaluateObjective(state([piece('p', 'player', 'pawn', 0, 0), piece('e', 'enemy', 'pawn', 1, 1)]), 'capture-all')).toBeNull();
    expect(evaluateObjective(state([piece('p', 'player', 'pawn', 0, 0)]), 'capture-all')).toBe('player');
  });

  it('capture-king: won when the enemy royal is gone even if lesser pieces remain', () => {
    const withQueen = state([piece('p', 'player', 'pawn', 0, 0), piece('eq', 'enemy', 'queen', 5, 5), piece('ep', 'enemy', 'pawn', 4, 4)]);
    expect(evaluateObjective(withQueen, 'capture-king')).toBeNull();
    const noQueen = state([piece('p', 'player', 'pawn', 0, 0), piece('ep', 'enemy', 'pawn', 4, 4)]);
    expect(evaluateObjective(noQueen, 'capture-king')).toBe('player');
  });

  it('survive: won once the required turns elapse', () => {
    const s = state([piece('p', 'player', 'pawn', 0, 0), piece('e', 'enemy', 'pawn', 1, 1)]);
    expect(evaluateObjective(s, 'survive', { surviveTurns: 5, turnsElapsed: 3 })).toBeNull();
    expect(evaluateObjective(s, 'survive', { surviveTurns: 5, turnsElapsed: 5 })).toBe('player');
  });

  it('reach: won when a living player stands on a target cell', () => {
    const s = state([piece('p', 'player', 'knight', 3, 3), piece('e', 'enemy', 'pawn', 1, 1)]);
    expect(evaluateObjective(s, 'reach', { reachCells: [{ x: 7, y: 0 }] })).toBeNull();
    expect(evaluateObjective(s, 'reach', { reachCells: [{ x: 3, y: 3 }, { x: 7, y: 0 }] })).toBe('player');
  });
});
