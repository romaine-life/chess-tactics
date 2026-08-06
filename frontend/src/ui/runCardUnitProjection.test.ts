import { describe, expect, it } from 'vitest';
import { emptyRunCardPieceIndices, projectRunCardUnitSeats } from './runCardUnitProjection';

describe('owned card unit projection', () => {
  const pieces = ['pawn', 'pawn', 'rook'] as const;
  const unitTypes = new Map([
    ['rook-1', 'rook'],
    ['pawn-1', 'pawn'],
    ['pawn-2', 'pawn'],
  ] as const);

  it('maps shuffled persisted seats to stable canonical face occurrences', () => {
    expect(projectRunCardUnitSeats(pieces, ['rook-1', 'pawn-2', 'pawn-1'], unitTypes))
      .toEqual([
        { seatIndex: 0, unitId: 'rook-1', unitType: 'rook', pieceIndex: 2 },
        { seatIndex: 1, unitId: 'pawn-2', unitType: 'pawn', pieceIndex: 0 },
        { seatIndex: 2, unitId: 'pawn-1', unitType: 'pawn', pieceIndex: 1 },
      ]);
  });

  it('uses the same projection for missing and not-yet-played occurrences', () => {
    const projection = projectRunCardUnitSeats(pieces, ['rook-1', null, 'pawn-1'], unitTypes);
    expect(emptyRunCardPieceIndices(pieces, projection)).toEqual([1]);
    expect(emptyRunCardPieceIndices(pieces, projection, 1)).toEqual([1, 2]);
  });
});
