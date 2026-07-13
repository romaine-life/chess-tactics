import { pieceSpritePath, UNIT_PALETTES, type UnitPalette } from '../core/pieces';
import {
  applyAcceptedUnitSprites,
  resetAcceptedUnitSprites,
  type AcceptedUnitSpriteMap,
} from '../core/unitSpriteRegistry';

export type Faction = UnitPalette;
export type PieceId = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type Direction = 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';
export type FootprintShape = 'square' | 'circle';

export type UnitFootprint = {
  shape: FootprintShape;
  sourceCanvasPx: number;
  sourceCanvasHeightPx: number;
  sourceFootprintPx: number;
};

export type UnitAsset = {
  id: string;
  /** UUID of the editable DB candidate/art row; never serialized into gameplay. */
  catalogAssetId?: string;
  family: PieceId;
  label: string;
  badge: string;
  preview: string | null;
  read: string;
  status: string;
  directions?: Direction[];
  factionMode: 'fixed' | 'palette';
  /** Family display scale already authored into this asset's native raster. */
  nativeScalePercent: number;
  defaultScale: number;
  footprint: UnitFootprint;
  unitAnchorX: string;
  unitAnchorY: string;
  /** How this sprite was produced (e.g. "Blender", "Codex Sheet"). */
  method?: string;
  /** Non-production candidates, when present, are held OUT of the shipped roster/game. */
  speculative?: boolean;
  accepted?: boolean;
  archived?: boolean;
  complete?: boolean;
  spriteCount?: number;
  rowRevision?: number;
  sprite: (faction: Faction, direction: Direction) => string | null;
};

export type LiveUnitSprite = {
  url: string;
  sha256: string;
  width: number;
  height: number;
  byteLength: number;
};

export type LiveUnitCatalogAsset = {
  id: string;
  family: PieceId;
  label: string;
  method: string;
  notes: string;
  status: 'candidate' | 'archived';
  accepted: boolean;
  nativeScalePercent: number;
  footprint: {
    shape: FootprintShape;
    sourceCanvasWidth: number;
    sourceCanvasHeight: number;
    sourceFootprintPx: number;
  };
  anchor: { x: number; y: number };
  rowRevision: number;
  sprites: Partial<Record<Faction, Partial<Record<Direction, LiveUnitSprite>>>>;
  spriteCount: number;
  complete: boolean;
  /** Server-owned monotonic acceptance gate. Resampled calibration candidates cannot clear it. */
  acceptanceBlockReason?: 'spatial-resampling' | null;
};

export type UnitAssetProductionEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'spatial-resampling'; adr: 'ADR-0076' };

/**
 * Shared UI/server interpretation of the durable production gate. The catalog field is
 * authoritative; parsing provenance keeps older snapshots and freshly-authored metadata honest
 * until the backend has persisted its monotonic block.
 */
export function unitAssetProductionEligibility(
  asset: Pick<LiveUnitCatalogAsset, 'method' | 'notes' | 'acceptanceBlockReason'>,
): UnitAssetProductionEligibility {
  if (asset.acceptanceBlockReason === 'spatial-resampling') {
    return { eligible: false, reason: 'spatial-resampling', adr: 'ADR-0076' };
  }
  let provenance: { pipeline?: unknown; spatialResampling?: unknown } | null = null;
  try {
    const parsed = JSON.parse(asset.notes || 'null') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      provenance = parsed as { pipeline?: unknown; spatialResampling?: unknown };
    }
  } catch {
    // Human notes are valid for native candidates; only structured resampling evidence blocks.
  }
  if (
    asset.method === 'Accepted sprite smooth recapture'
    || provenance?.pipeline === 'accepted-sprite-recapture'
    || provenance?.spatialResampling === true
  ) {
    return { eligible: false, reason: 'spatial-resampling', adr: 'ADR-0076' };
  }
  return { eligible: true };
}

export type LiveUnitCatalogFamily = {
  family: PieceId;
  acceptedAssetId: string | null;
  displayScalePercent: number;
  rowRevision: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type LiveUnitCatalog = {
  schemaVersion: number;
  revision: number;
  updatedAt?: string | null;
  families: LiveUnitCatalogFamily[];
  assets: LiveUnitCatalogAsset[];
};

export const CANONICAL_CIRCLE_FOOTPRINT_PX = 96;
const SQUARE_EQUAL_AREA_FACTOR = Math.sqrt(Math.PI) / 2;

export const canonicalFootprintSize = (shape: FootprintShape) =>
  shape === 'square' ? Math.round(CANONICAL_CIRCLE_FOOTPRINT_PX * SQUARE_EQUAL_AREA_FACTOR) : CANONICAL_CIRCLE_FOOTPRINT_PX;

export const renderSizeFromFootprint = (unit: UnitAsset, scale: number) =>
  Math.round((canonicalFootprintSize(unit.footprint.shape) * (scale / 100) * unit.footprint.sourceCanvasPx) / unit.footprint.sourceFootprintPx);

export const UNIT_INSPECTION_TILE_SCALE = 2;

export function nativeScalePercentFromCanvas(sourceCanvasWidth: number, sourceCanvasHeight: number): number {
  if (sourceCanvasWidth > 109 || sourceCanvasHeight > 129) return 100;
  return Math.max(60, Math.min(140, Math.round(Math.max(sourceCanvasWidth / 78, sourceCanvasHeight / 92) * 100)));
}

export const renderSizeForTileScale = (unit: UnitAsset, scale: number, tileScale: number) =>
  Math.round(renderSizeFromFootprint(unit, scale) * (tileScale / UNIT_INSPECTION_TILE_SCALE));

export const footprintSizeFromScale = (unit: UnitAsset, scale: number) =>
  Math.round(canonicalFootprintSize(unit.footprint.shape) * (scale / 100));

export function unitAnchorFraction(value: string): number {
  const parsed = Number.parseFloat(value);
  const fraction = value.trim().endsWith('%') ? parsed / 100 : parsed;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new Error(`invalid live unit anchor: ${value}`);
  }
  return fraction;
}

export const familyLabels: Record<PieceId, string> = {
  pawn: 'Pawn',
  rook: 'Rook',
  knight: 'Knight',
  bishop: 'Bishop',
  queen: 'Queen',
  king: 'King',
};

export const rookDirections: Direction[] = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export const rookDirectionLabel: Record<Direction, string> = {
  south: 'S',
  'south-east': 'SE',
  east: 'E',
  'north-east': 'NE',
  north: 'N',
  'north-west': 'NW',
  west: 'W',
  'south-west': 'SW',
};

export const directionCompassCells: Array<Direction | 'center'> = [
  'west',
  'north-west',
  'north',
  'south-west',
  'center',
  'north-east',
  'south',
  'south-east',
  'east',
];

const paletteSprite = (piece: PieceId) => (faction: Faction, direction: Direction) => pieceSpritePath(piece, faction, direction);

export const hasDirectionSprite = (unit: UnitAsset, dir: Direction) => (unit.directions ? unit.directions.includes(dir) : dir === 'south');

const productionUnits: UnitAsset[] = [];
export const unitAssets: UnitAsset[] = [];
export const productionUnitAssets: UnitAsset[] = [];
export const archivedUnitAssets: UnitAsset[] = [];

export const UNIT_METHOD_OPTIONS: { id: string; label: string; sub: string }[] = [
  { id: 'Production', label: 'Production', sub: 'shipped' },
];

export const activeUnitFamilies: PieceId[] = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];

let liveUnitCatalog: LiveUnitCatalog | null = null;

const candidateSprite = (asset: LiveUnitCatalogAsset) => (faction: Faction, direction: Direction): string | null =>
  asset.sprites[faction]?.[direction]?.url ?? null;

const candidatePreview = (asset: LiveUnitCatalogAsset): string | null => {
  const preferred = asset.sprites['navy-blue']?.south?.url;
  if (preferred) return preferred;
  for (const palette of Object.values(asset.sprites)) {
    if (!palette) continue;
    for (const sprite of Object.values(palette)) if (sprite?.url) return sprite.url;
  }
  return null;
};

const effectiveScalePercent = (familyScalePercent: number, nativeScalePercent: number): number =>
  (familyScalePercent * 100) / nativeScalePercent;

function catalogAssetToUnit(asset: LiveUnitCatalogAsset): UnitAsset {
  const directions = rookDirections.filter((direction) =>
    Object.values(asset.sprites).some((palette) => Boolean(palette?.[direction])));
  return {
    id: `candidate:${asset.id}`,
    catalogAssetId: asset.id,
    family: asset.family,
    label: asset.label,
    badge: `${asset.spriteCount}/48 frames${asset.complete ? ' · complete' : ''}`,
    preview: candidatePreview(asset),
    read: asset.notes || `${asset.method} ${familyLabels[asset.family].toLowerCase()} candidate`,
    status: asset.status,
    directions,
    factionMode: 'palette',
    nativeScalePercent: asset.nativeScalePercent,
    defaultScale: 100,
    footprint: {
      shape: asset.footprint.shape,
      sourceCanvasPx: asset.footprint.sourceCanvasWidth,
      sourceCanvasHeightPx: asset.footprint.sourceCanvasHeight,
      sourceFootprintPx: asset.footprint.sourceFootprintPx,
    },
    unitAnchorX: `${asset.anchor.x * 100}%`,
    unitAnchorY: `${asset.anchor.y * 100}%`,
    method: asset.method,
    speculative: true,
    accepted: false,
    archived: asset.status === 'archived',
    complete: asset.complete,
    spriteCount: asset.spriteCount,
    rowRevision: asset.rowRevision,
    sprite: candidateSprite(asset),
  };
}

const acceptedSpriteUrlPattern = /^\/api\/unit-sprites\/([0-9a-f]{64})\.png$/;

const catalogFailure = (message: string): Error => new Error(`invalid live unit catalog: ${message}`);

export function assertLiveUnitCatalog(value: unknown): asserts value is LiveUnitCatalog {
  if (!value || typeof value !== 'object') throw catalogFailure('response is not an object');
  const raw = value as Partial<LiveUnitCatalog>;
  if (raw.schemaVersion !== 1) throw catalogFailure(`unsupported schema version ${String(raw.schemaVersion)}`);
  if (!Number.isFinite(raw.revision)) throw catalogFailure('revision is missing');
  if (!Array.isArray(raw.families) || !Array.isArray(raw.assets)) throw catalogFailure('families or assets are missing');
  if (raw.families.length !== activeUnitFamilies.length) throw catalogFailure('all six family rows are required');

  const familyRows = new Map<PieceId, LiveUnitCatalogFamily>();
  for (const family of raw.families) {
    if (!activeUnitFamilies.includes(family.family)) throw catalogFailure(`unknown family ${String(family.family)}`);
    if (familyRows.has(family.family)) throw catalogFailure(`duplicate family ${family.family}`);
    if (!Number.isInteger(family.displayScalePercent) || family.displayScalePercent < 60 || family.displayScalePercent > 140) {
      throw catalogFailure(`invalid display scale for ${family.family}`);
    }
    if (typeof family.acceptedAssetId !== 'string' || !family.acceptedAssetId) {
      throw catalogFailure(`${family.family} has no accepted asset`);
    }
    familyRows.set(family.family, family);
  }

  const assetsById = new Map<string, LiveUnitCatalogAsset>();
  for (const asset of raw.assets) {
    if (!asset || typeof asset !== 'object' || typeof asset.id !== 'string' || !asset.id) {
      throw catalogFailure('asset id is missing');
    }
    if (!activeUnitFamilies.includes(asset.family)) throw catalogFailure(`asset ${asset.id} has an unknown family`);
    if (asset.nativeScalePercent == null && asset.footprint) {
      asset.nativeScalePercent = nativeScalePercentFromCanvas(
        Number(asset.footprint.sourceCanvasWidth),
        Number(asset.footprint.sourceCanvasHeight),
      );
    }
    if (!Number.isInteger(asset.nativeScalePercent) || asset.nativeScalePercent < 60 || asset.nativeScalePercent > 140) {
      throw catalogFailure(`asset ${asset.id} has an invalid native scale`);
    }
    if (assetsById.has(asset.id)) throw catalogFailure(`duplicate asset ${asset.id}`);
    assetsById.set(asset.id, asset);
  }

  for (const family of activeUnitFamilies) {
    const familyRow = familyRows.get(family);
    const accepted = familyRow ? assetsById.get(familyRow.acceptedAssetId!) : undefined;
    if (!accepted) throw catalogFailure(`${family} accepted asset is absent`);
    if (accepted.family !== family || accepted.accepted !== true || accepted.status === 'archived') {
      throw catalogFailure(`${family} accepted pointer is invalid`);
    }
    if (!accepted.complete || accepted.spriteCount !== UNIT_PALETTES.length * rookDirections.length) {
      throw catalogFailure(`${family} accepted asset is incomplete`);
    }
    const footprint = accepted.footprint;
    if (
      !footprint || !['circle', 'square'].includes(footprint.shape) ||
      !Number.isFinite(footprint.sourceCanvasWidth) || footprint.sourceCanvasWidth <= 0 ||
      !Number.isFinite(footprint.sourceCanvasHeight) || footprint.sourceCanvasHeight <= 0 ||
      !Number.isFinite(footprint.sourceFootprintPx) || footprint.sourceFootprintPx <= 0
    ) {
      throw catalogFailure(`${family} has invalid footprint geometry`);
    }
    if (
      !accepted.anchor || !Number.isFinite(accepted.anchor.x) || !Number.isFinite(accepted.anchor.y) ||
      accepted.anchor.x < 0 || accepted.anchor.x > 1 || accepted.anchor.y < 0 || accepted.anchor.y > 1
    ) {
      throw catalogFailure(`${family} has an invalid contact anchor`);
    }
    for (const palette of UNIT_PALETTES) {
      for (const direction of rookDirections) {
        const sprite = accepted.sprites?.[palette]?.[direction];
        const match = sprite && acceptedSpriteUrlPattern.exec(sprite.url);
        if (!sprite || !match || sprite.sha256 !== match[1]) {
          throw catalogFailure(`${family}/${palette}/${direction} is missing an immutable live sprite`);
        }
      }
    }
  }
}

function productionUnitFromCatalog(family: LiveUnitCatalogFamily, accepted: LiveUnitCatalogAsset): UnitAsset {
  return {
    id: family.family,
    catalogAssetId: accepted.id,
    family: family.family,
    label: familyLabels[family.family],
    badge: '8 directions · live',
    preview: accepted.sprites['navy-blue']!.south!.url,
    read: accepted.notes || `${accepted.method} production unit`,
    status: 'active production unit',
    directions: rookDirections,
    factionMode: 'palette',
    nativeScalePercent: accepted.nativeScalePercent,
    defaultScale: effectiveScalePercent(family.displayScalePercent, accepted.nativeScalePercent),
    footprint: {
      shape: accepted.footprint.shape,
      sourceCanvasPx: accepted.footprint.sourceCanvasWidth,
      sourceCanvasHeightPx: accepted.footprint.sourceCanvasHeight,
      sourceFootprintPx: accepted.footprint.sourceFootprintPx,
    },
    unitAnchorX: `${accepted.anchor.x * 100}%`,
    unitAnchorY: `${accepted.anchor.y * 100}%`,
    method: accepted.method,
    accepted: true,
    complete: true,
    spriteCount: accepted.spriteCount,
    rowRevision: accepted.rowRevision,
    sprite: paletteSprite(family.family),
  };
}

/** Apply one complete backend snapshot as the renderer's only unit-art source. */
export function applyLiveUnitCatalog(value: unknown): boolean {
  assertLiveUnitCatalog(value);
  const before = JSON.stringify({
    revision: liveUnitCatalog?.revision ?? 0,
    ids: unitAssets.map((asset) => [asset.id, asset.catalogAssetId, asset.defaultScale, asset.rowRevision]),
  });
  const familyRows = new Map(value.families.map((family) => [family.family, family]));
  const assetsById = new Map(value.assets.map((asset) => [asset.id, asset]));
  const nextProduction = activeUnitFamilies.map((family) => {
    const familyRow = familyRows.get(family)!;
    return productionUnitFromCatalog(familyRow, assetsById.get(familyRow.acceptedAssetId!)!);
  });
  const acceptedSprites = Object.fromEntries(activeUnitFamilies.map((family) => {
    const accepted = assetsById.get(familyRows.get(family)!.acceptedAssetId!)!;
    return [family, Object.fromEntries(UNIT_PALETTES.map((palette) => [
      palette,
      Object.fromEntries(rookDirections.map((direction) => [direction, accepted.sprites[palette]![direction]!.url])),
    ]))];
  })) as AcceptedUnitSpriteMap;

  const activeCandidates = value.assets
    .filter((asset) => !asset.accepted && asset.status !== 'archived')
    .map((asset) => catalogAssetToUnit(asset));
  const archived = value.assets
    .filter((asset) => asset.status === 'archived')
    .map((asset) => catalogAssetToUnit(asset));

  applyAcceptedUnitSprites(value.revision, acceptedSprites);
  liveUnitCatalog = value;
  productionUnits.splice(0, productionUnits.length, ...nextProduction);
  unitAssets.splice(0, unitAssets.length, ...productionUnits, ...activeCandidates);
  productionUnitAssets.splice(0, productionUnitAssets.length, ...productionUnits);
  archivedUnitAssets.splice(0, archivedUnitAssets.length, ...archived);

  const methods = [...new Set(activeCandidates.map((asset) => asset.method).filter(Boolean) as string[])];
  UNIT_METHOD_OPTIONS.splice(
    0,
    UNIT_METHOD_OPTIONS.length,
    { id: 'Production', label: 'Production', sub: 'shipped' },
    ...methods.map((method) => ({ id: method, label: method, sub: 'candidate' })),
  );
  const after = JSON.stringify({
    revision: liveUnitCatalog.revision,
    ids: unitAssets.map((asset) => [asset.id, asset.catalogAssetId, asset.defaultScale, asset.rowRevision]),
  });
  return before !== after;
}

export function currentLiveUnitCatalog(): LiveUnitCatalog | null {
  return liveUnitCatalog;
}

export function resetLiveUnitCatalog(): void {
  liveUnitCatalog = null;
  resetAcceptedUnitSprites();
  productionUnits.splice(0, productionUnits.length);
  unitAssets.splice(0, unitAssets.length);
  productionUnitAssets.splice(0, productionUnitAssets.length);
  archivedUnitAssets.splice(0, archivedUnitAssets.length);
  UNIT_METHOD_OPTIONS.splice(0, UNIT_METHOD_OPTIONS.length, { id: 'Production', label: 'Production', sub: 'shipped' });
}

export function unitAssetById(id: string): UnitAsset | undefined {
  return unitAssets.find((unit) => unit.id === id || unit.catalogAssetId === id);
}

export function productionUnitForFamily(family: string): UnitAsset | undefined {
  return productionUnits.find((unit) => unit.family === family);
}

export function unitFamilyForId(id: string): PieceId | undefined {
  if ((activeUnitFamilies as string[]).includes(id)) return id as PieceId;
  const byAsset = unitAssetById(id)?.family;
  if (byAsset) return byAsset;
  // Legacy art-record ids ('pawn-codexsheet', 'rook-blender-v4-calibrated', ...) live on
  // in boards saved before the live catalog. They were always family-prefixed, so
  // resolve the prefix: the board keeps MEANING pawn/rook/etc., and the family's
  // currently ACCEPTED art renders (art records never enter gameplay data). Without
  // this, pre-catalog boards silently drop every unit.
  const prefix = id.split('-', 1)[0];
  if ((activeUnitFamilies as string[]).includes(prefix)) return prefix as PieceId;
  return undefined;
}

/** THE unit-art resolver for board placements: the exact asset when the id names one,
 * else the id's family's accepted production art. Every board surface (render plan,
 * editor, studio previews) resolves through here so a legacy-id board never loses
 * its units. */
export function unitArtForId(id: string): UnitAsset | undefined {
  const direct = unitAssetById(id);
  if (direct) return direct;
  const family = unitFamilyForId(id);
  return family ? productionUnitForFamily(family) : undefined;
}
