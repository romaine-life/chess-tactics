import { describe, expect, it } from 'vitest';
import type { GameState, Piece } from '../core/types';
import { adminMoveTargets, killUnitForAdmin } from './adminBattle';

function piece(id: string, side: Piece['side'], x: number, y: number): Piece {
  return { id, side, x, y, startX: x, startY: y, alive: true, type: side === 'neutral' ? 'rock' : 'rook' };
}

function game(): GameState {
  return {
    size: { cols: 3, rows: 3 },
    pieces: [
      piece('player-rook', 'player', 0, 0),
      piece('friend', 'player', 1, 0),
      piece('enemy', 'enemy', 2, 0),
      piece('rock', 'neutral', 1, 1),
    ],
    turn: 'player',
    winner: null,
  };
}

describe('administrator battle interventions', () => {
  it('offers every square except friendly and neutral occupancy, capturing enemies normally', () => {
    const targets = adminMoveTargets(game(), 'player-rook');
    expect(targets).not.toContainEqual(expect.objectContaining({ x: 0, y: 0 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ x: 1, y: 0 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ x: 1, y: 1 }));
    expect(targets).toContainEqual({ x: 2, y: 0, capture: 'enemy' });
    expect(targets).toContainEqual({ x: 2, y: 2 });
  });

  it('offers geometry for the side NOT to move, and never for scenery', () => {
    // Setting up a position mostly means arranging what the opponent did, so the army to
    // move is not the only one that can be picked up.
    const targets = adminMoveTargets(game(), 'enemy');
    expect(targets).toContainEqual({ x: 0, y: 0, capture: 'player-rook' });
    expect(targets).toContainEqual({ x: 2, y: 2 });
    // Its own square and the neutral rock stay blocked, exactly as for the moving side.
    expect(targets).not.toContainEqual(expect.objectContaining({ x: 2, y: 0 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ x: 1, y: 1 }));

    expect(adminMoveTargets(game(), 'rock')).toEqual([]);
  });

  it('kills any living unit without mutating the input position', () => {
    const before = game();
    const result = killUnitForAdmin(before, 'friend');
    expect(before.pieces.find((candidate) => candidate.id === 'friend')?.alive).toBe(true);
    expect(result.state.pieces.find((candidate) => candidate.id === 'friend')?.alive).toBe(false);
    expect(result.events).toEqual([{ kind: 'captured', pieceId: 'friend', by: 'admin-playtest' }]);
  });
});
