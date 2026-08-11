import { describe, it, expect } from 'vitest';
import {
  clampReviewIndex,
  moveNumberFor,
  openingPosition,
  recordPositions,
  reviewGameOf,
  reviewIndexForLoggedPly,
  reviewableCount,
  snapshotOf,
  steppedReviewIndex,
  truncatePositions,
  type PositionSnapshot,
  type RecordedPosition,
} from './moveReview';
import type { GameState, Piece } from '../core/types';

function piece(id: string, x: number, y: number): Piece {
  return { id, type: 'pawn', side: 'player', x, y, startY: y, alive: true };
}

function game(pieces: Piece[]): GameState {
  return {
    size: { cols: 8, rows: 8 },
    pieces,
    // The static half — none of it is a move's business, and all of it has to survive a
    // round trip through a snapshot that never stored it.
    terrain: [{ x: 0, y: 0, terrain: 'water', elevation: 0 }],
    fences: ['1,1|1,2'],
    boardCode: 'authored-board',
    props: [],
    turn: 'player',
    winner: null,
  };
}

describe('recorded positions', () => {
  it('numbers each recorded board by the half-moves played to reach it', () => {
    const history = recordPositions(
      [openingPosition(game([piece('p', 1, 1)]))],
      [snapshotOf(game([piece('p', 1, 2)])), snapshotOf(game([piece('p', 1, 3)]))],
    );

    expect(history.map((entry) => entry.ply)).toEqual([0, 1, 2]);
    expect(reviewableCount(history)).toBe(2);
  });

  it('records nothing for a commit that played no half-move', () => {
    const opening = [openingPosition(game([piece('p', 1, 1)]))];

    expect(recordPositions(opening, [])).toEqual(opening);
  });

  it('keeps counting from where a resumed history left off', () => {
    // A match saved before review existed resumes holding one board, deep into the game.
    // It must say which half-move that board is, not claim to be the opening.
    const resumed: RecordedPosition[] = [{ ply: 20, snapshot: snapshotOf(game([piece('p', 4, 4)])) }];

    const history = recordPositions(resumed, [snapshotOf(game([piece('p', 4, 5)]))]);

    expect(history.map((entry) => entry.ply)).toEqual([20, 21]);
  });

  it('drops the plies a rewind took back', () => {
    const history = recordPositions(
      [openingPosition(game([piece('p', 1, 1)]))],
      [snapshotOf(game([piece('p', 1, 2)])), snapshotOf(game([piece('p', 1, 3)]))],
    );

    expect(truncatePositions(history, 1).map((entry) => entry.ply)).toEqual([0, 1]);
  });
});

describe('reading a recorded board', () => {
  it('re-dresses a snapshot in the live match\'s static half', () => {
    const live = game([piece('p', 1, 6)]);
    const history = recordPositions([openingPosition(game([piece('p', 1, 1)]))], [snapshotOf(game([piece('p', 1, 2)]))]);

    const reviewed = reviewGameOf(live, history, 0);

    // The pieces are the older board's...
    expect(reviewed?.pieces[0].y).toBe(1);
    // ...and everything a move cannot change is still the live match's own.
    expect(reviewed?.terrain).toBe(live.terrain);
    expect(reviewed?.fences).toBe(live.fences);
    expect(reviewed?.boardCode).toBe('authored-board');
  });

  it('shows no telegraphed enemy intent on a board that is not about to be played', () => {
    const live: GameState = {
      ...game([piece('p', 1, 6)]),
      intents: [{ kind: 'move', pieceId: 'e', from: { x: 0, y: 0 }, to: { x: 0, y: 1 } }],
    };
    const history = [openingPosition(game([piece('p', 1, 1)]))];

    expect(reviewGameOf(live, history, 0)?.intents).toBeUndefined();
  });

  it('reads the live board for a null cursor, and nothing for an unrecorded one', () => {
    const history = [openingPosition(game([piece('p', 1, 1)]))];

    expect(reviewGameOf(game([]), history, null)).toBeNull();
    expect(reviewGameOf(game([]), history, 9)).toBeNull();
  });
});

describe('the review cursor', () => {
  const history = recordPositions(
    [openingPosition(game([piece('p', 1, 1)]))],
    [snapshotOf(game([piece('p', 1, 2)])), snapshotOf(game([piece('p', 1, 3)]))],
  );

  it('treats the newest recorded position as live rather than a review of it', () => {
    expect(clampReviewIndex(history, 2)).toBeNull();
    expect(clampReviewIndex(history, 7)).toBeNull();
  });

  it('clamps a step back at the opening instead of running off the end', () => {
    expect(steppedReviewIndex(history, 0, -1)).toBe(0);
    expect(clampReviewIndex(history, -3)).toBe(0);
  });

  it('steps back from the live board into the half-move before it', () => {
    expect(steppedReviewIndex(history, null, -1)).toBe(1);
    expect(steppedReviewIndex(history, 1, -1)).toBe(0);
    expect(steppedReviewIndex(history, 0, 1)).toBe(1);
    // Forward off the end of the score sheet IS returning to live.
    expect(steppedReviewIndex(history, 1, 1)).toBeNull();
  });

  it('offers nothing to review when the match has recorded no boards', () => {
    const empty: RecordedPosition[] = [];

    expect(steppedReviewIndex(empty, null, -1)).toBeNull();
    expect(clampReviewIndex(empty, 0)).toBeNull();
  });

  it('sends a score-sheet row to the board that row produced', () => {
    // The row notating half-move 0 leads to the board recorded at ply 1.
    expect(reviewIndexForLoggedPly(history, 0)).toBe(1);
    expect(reviewIndexForLoggedPly(history, 1)).toBe(2);
    // A row this match kept no board for is not a place the player can go.
    expect(reviewIndexForLoggedPly(history, 40)).toBeNull();
  });
});

describe('score sheet numbering', () => {
  it('opens a full move with a period and answers it with an ellipsis', () => {
    expect(moveNumberFor(0)).toBe('1.');
    expect(moveNumberFor(1)).toBe('1…');
    expect(moveNumberFor(12)).toBe('7.');
  });
});

describe('snapshots', () => {
  it('keeps only what a move changes', () => {
    const snapshot: PositionSnapshot = snapshotOf(game([piece('p', 1, 1)]));

    expect(Object.keys(snapshot).sort()).toEqual(
      ['halfmoveClock', 'lastMove', 'pieces', 'positionCounts', 'turn', 'winner'],
    );
    expect(snapshot).not.toHaveProperty('terrain');
    expect(snapshot).not.toHaveProperty('boardCode');
  });
});
