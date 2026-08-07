import { describe, expect, it } from 'vitest';
import { emptyRunCardPieceIndices, projectRunCardUnitSeats } from './runCardUnitProjection';

describe('owned card unit projection', () => {
  const pieces = ['pawn', 'pawn', 'rook'] as const;
  const unitTypes = new Map([
    ['rook-1', 'rook'],
    ['pawn-1', 'pawn'],
    ['pawn-2', 'pawn'],
  ] as const);

  it('keeps repeated units in their same-index authored formation cells', () => {
    expect(projectRunCardUnitSeats(pieces, [null, 'pawn-2', 'rook-1'], unitTypes))
      .toEqual([
        { seatIndex: 1, unitId: 'pawn-2', unitType: 'pawn', pieceIndex: 1 },
        { seatIndex: 2, unitId: 'rook-1', unitType: 'rook', pieceIndex: 2 },
      ]);
  });

  it('uses the same projection for missing and not-yet-played occurrences', () => {
    const projection = projectRunCardUnitSeats(pieces, ['pawn-1', null, 'rook-1'], unitTypes);
    expect(emptyRunCardPieceIndices(pieces, projection)).toEqual([1]);
    expect(emptyRunCardPieceIndices(pieces, projection, 1)).toEqual([0, 1]);
  });

  it('does not relocate a unit from an invalid mismatched seat', () => {
    const projection = projectRunCardUnitSeats(pieces, ['rook-1', 'pawn-1', 'pawn-2'], unitTypes);
    expect(projection).toEqual([
      { seatIndex: 1, unitId: 'pawn-1', unitType: 'pawn', pieceIndex: 1 },
    ]);
  });
});
