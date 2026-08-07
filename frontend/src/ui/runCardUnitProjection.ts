import type { RunArmyPieceType } from '../run/model';

export interface RunCardUnitSeatProjection {
  seatIndex: number;
  unitId: string;
  unitType: RunArmyPieceType;
  pieceIndex: number;
}

/** Maps each persisted card seat to the same-index authored formation cell. Every
 * card-aware runtime surface uses this projection so a vacancy or surviving unit
 * retains one stable visible position for the lifetime of the card. */
export function projectRunCardUnitSeats(
  pieces: readonly RunArmyPieceType[],
  unitSeats: readonly (string | null)[],
  unitTypeById: ReadonlyMap<string, RunArmyPieceType>,
): readonly RunCardUnitSeatProjection[] {
  return unitSeats.flatMap((unitId, seatIndex): RunCardUnitSeatProjection[] => {
    if (!unitId) return [];
    const unitType = unitTypeById.get(unitId);
    if (!unitType || pieces[seatIndex] !== unitType) return [];
    return [{ seatIndex, unitId, unitType, pieceIndex: seatIndex }];
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
