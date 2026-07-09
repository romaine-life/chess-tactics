export type RegistryPieceId = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type RegistryPalette = 'navy-blue' | 'crimson' | 'golden' | 'emerald' | 'black' | 'white';
export type RegistryDirection = 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';

export type AcceptedUnitSpriteMap = Partial<
  Record<RegistryPieceId, Partial<Record<RegistryPalette, Partial<Record<RegistryDirection, string>>>>>
>;

const acceptedSprites: AcceptedUnitSpriteMap = {};
let acceptedCatalogRevision = 0;

const committedSpritePath = (piece: RegistryPieceId, palette: RegistryPalette, direction: RegistryDirection): string =>
  `/assets/units/${piece}/${palette}/${direction}.png`;

/** Resolve the currently accepted sprite, falling back to the cutover-safe committed file. */
export function resolvedUnitSpritePath(
  piece: RegistryPieceId,
  palette: RegistryPalette,
  direction: RegistryDirection,
): string {
  return acceptedSprites[piece]?.[palette]?.[direction] ?? committedSpritePath(piece, palette, direction);
}

/** Atomically replace all live URL overrides after a complete catalog hydrate. */
export function applyAcceptedUnitSprites(revision: number, next: AcceptedUnitSpriteMap): boolean {
  const serializedBefore = JSON.stringify([acceptedCatalogRevision, acceptedSprites]);
  for (const key of Object.keys(acceptedSprites) as RegistryPieceId[]) delete acceptedSprites[key];
  for (const piece of Object.keys(next) as RegistryPieceId[]) {
    const palettes = next[piece];
    if (!palettes) continue;
    acceptedSprites[piece] = {};
    for (const palette of Object.keys(palettes) as RegistryPalette[]) {
      acceptedSprites[piece]![palette] = { ...palettes[palette] };
    }
  }
  acceptedCatalogRevision = Number.isFinite(revision) ? revision : 0;
  return serializedBefore !== JSON.stringify([acceptedCatalogRevision, acceptedSprites]);
}

export function acceptedUnitCatalogRevision(): number {
  return acceptedCatalogRevision;
}

export function resetAcceptedUnitSprites(): void {
  for (const key of Object.keys(acceptedSprites) as RegistryPieceId[]) delete acceptedSprites[key];
  acceptedCatalogRevision = 0;
}
