import type { RunArmyPieceType } from '../run/model';

export interface RunCardUnitSeatProjection {
  seatIndex: number;
  unitId: string;
  unitType: RunArmyPieceType;
  pieceIndex: number;
}

/**
 * Maps persisted, shuffled card seats back onto the canonical face's grouped piece
 * occurrences. Every card-aware runtime surface uses this projection so an empty,
 * selected, dealt, or discarded occurrence refers to the same visible figure.
 */
export function projectRunCardUnitSeats(
  pieces: readonly RunArmyPieceType[],
  unitSeats: readonly (string | null)[],
  unitTypeById: ReadonlyMap<string, RunArmyPieceType>,
): readonly RunCardUnitSeatProjection[] {
  const openPieceIndicesByType = new Map<RunArmyPieceType, number[]>();
  pieces.forEach((piece, pieceIndex) => {
    const openIndices = openPieceIndicesByType.get(piece) ?? [];
    openIndices.push(pieceIndex);
    openPieceIndicesByType.set(piece, openIndices);
  });

  return unitSeats.flatMap((unitId, seatIndex): RunCardUnitSeatProjection[] => {
    if (!unitId) return [];
    const unitType = unitTypeById.get(unitId);
    if (!unitType) return [];
    const pieceIndex = openPieceIndicesByType.get(unitType)?.shift();
    return pieceIndex === undefined ? [] : [{ seatIndex, unitId, unitType, pieceIndex }];
  });
}

export function emptyRunCardPieceIndices(
  pieces: readonly RunArmyPieceType[],
  projection: readonly RunCardUnitSeatProjection[],
  fromSeat = 0,
): readonly number[] {
  const occupied = new Set(
    projection
      .filter(({ seatIndex }) => seatIndex >= fromSeat)
      .map(({ pieceIndex }) => pieceIndex),
  );
  return pieces.flatMap((_, pieceIndex) => occupied.has(pieceIndex) ? [] : [pieceIndex]);
}
