export type RegistryPieceId = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type RegistryPalette = 'navy-blue' | 'crimson' | 'golden' | 'emerald' | 'black' | 'white';
export type RegistryDirection = 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';

export type AcceptedUnitSpriteMap = Record<
  RegistryPieceId,
  Record<RegistryPalette, Record<RegistryDirection, string>>
>;

let acceptedSprites: AcceptedUnitSpriteMap | null = null;
let acceptedCatalogRevision = 0;

/** Resolve a sprite from the required live catalog. */
export function resolvedUnitSpritePath(
  piece: RegistryPieceId,
  palette: RegistryPalette,
  direction: RegistryDirection,
): string {
  const sprite = acceptedSprites?.[piece]?.[palette]?.[direction];
  if (!sprite) {
    throw new Error(`unit sprite catalog is not hydrated: ${piece}/${palette}/${direction}`);
  }
  return sprite;
}

/** Atomically replace the complete live sprite registry. */
export function applyAcceptedUnitSprites(revision: number, next: AcceptedUnitSpriteMap): boolean {
  const serializedBefore = JSON.stringify([acceptedCatalogRevision, acceptedSprites]);
  acceptedSprites = Object.fromEntries(
    Object.entries(next).map(([piece, palettes]) => [
      piece,
      Object.fromEntries(
        Object.entries(palettes).map(([palette, directions]) => [palette, { ...directions }]),
      ),
    ]),
  ) as AcceptedUnitSpriteMap;
  acceptedCatalogRevision = Number.isFinite(revision) ? revision : 0;
  return serializedBefore !== JSON.stringify([acceptedCatalogRevision, acceptedSprites]);
}

export function acceptedUnitCatalogRevision(): number {
  return acceptedCatalogRevision;
}

export function resetAcceptedUnitSprites(): void {
  acceptedSprites = null;
  acceptedCatalogRevision = 0;
}
