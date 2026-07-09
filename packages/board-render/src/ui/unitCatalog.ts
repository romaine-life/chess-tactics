import { pieceSpritePath, type UnitPalette } from '../core/pieces';
import {
  applyAcceptedUnitSprites,
  resetAcceptedUnitSprites,
  type AcceptedUnitSpriteMap,
  type RegistryDirection,
  type RegistryPalette,
  type RegistryPieceId,
} from '../core/unitSpriteRegistry';

export type Faction = UnitPalette;
export type PieceId = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type Direction = 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';
export type FootprintShape = 'square' | 'circle';

export type UnitFootprint = {
  shape: FootprintShape;
  sourceCanvasPx: number;
  sourceCanvasHeightPx?: number;
  sourceFootprintPx: number;
};

export type UnitAsset = {
  id: string;
  /** UUID of the editable DB candidate/art row; never serialized into gameplay. */
  catalogAssetId?: string;
  /** Historical board-code ids that resolve to this stable piece family. */
  legacyIds?: string[];
  family: PieceId;
  label: string;
  badge: string;
  preview: string;
  read: string;
  status: string;
  directions?: Direction[];
  factionMode: 'fixed' | 'palette';
  defaultScale: number;
  footprint: UnitFootprint;
  unitAnchorX?: string;
  unitAnchorY?: string;
  /** How this sprite was produced (e.g. "Blender", "Codex Sheet"). */
  method?: string;
  /** Non-production candidates, when present, are held OUT of the shipped roster/game. */
  speculative?: boolean;
  accepted?: boolean;
  archived?: boolean;
  complete?: boolean;
  spriteCount?: number;
  rowRevision?: number;
  sprite: (faction: Faction, direction: Direction) => string;
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
};

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

export const renderSizeForTileScale = (unit: UnitAsset, scale: number, tileScale: number) =>
  Math.round(renderSizeFromFootprint(unit, scale) * (tileScale / UNIT_INSPECTION_TILE_SCALE));

export const footprintSizeFromScale = (unit: UnitAsset, scale: number) =>
  Math.round(canonicalFootprintSize(unit.footprint.shape) * (scale / 100));

const circleFootprint = (sourceCanvasPx: number, sourceFootprintPx = sourceCanvasPx): UnitFootprint => ({
  shape: 'circle',
  sourceCanvasPx,
  sourceFootprintPx,
});

const squareFootprint = (sourceCanvasPx: number, sourceFootprintPx = sourceCanvasPx): UnitFootprint => ({
  shape: 'square',
  sourceCanvasPx,
  sourceFootprintPx,
});

const ROOK_KEEP_CANVAS_PX = 512;
const ROOK_KEEP_CONTACT_FOOTPRINT_PX = 428;
const ROOK_KEEP_CONTACT_ANCHOR_X = '50%';
const ROOK_KEEP_CONTACT_ANCHOR_Y = '80.241%';
const KNIGHT_FUR_CANVAS_PX = 512;
const KNIGHT_FUR_CONTACT_FOOTPRINT_PX = 178;
const KNIGHT_FUR_CONTACT_ANCHOR_X = '50%';
const KNIGHT_FUR_CONTACT_ANCHOR_Y = '80.241%';
const BISHOP_MITRE_CANVAS_PX = 512;
const BISHOP_MITRE_CONTACT_FOOTPRINT_PX = 126;
const BISHOP_MITRE_CONTACT_ANCHOR_X = '50%';
const BISHOP_MITRE_CONTACT_ANCHOR_Y = '80.241%';
const QUEEN_TIARA_CANVAS_PX = 512;
const QUEEN_TIARA_CONTACT_FOOTPRINT_PX = 150;
const QUEEN_TIARA_CONTACT_ANCHOR_X = '50%';
const QUEEN_TIARA_CONTACT_ANCHOR_Y = '80.241%';
const KING_CROWN_CANVAS_PX = 512;
const KING_CROWN_CONTACT_FOOTPRINT_PX = 148;
const KING_CROWN_CONTACT_ANCHOR_X = '50%';
const KING_CROWN_CONTACT_ANCHOR_Y = '80.241%';

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

export const MISSING_DIRECTION_SPRITE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
      "<path d='M80 26 L144 80 L80 134 L16 80 Z' fill='none' stroke='#8fb8ff' stroke-width='3' stroke-dasharray='6 6' opacity='0.4'/>" +
      "<text x='80' y='96' font-size='42' text-anchor='middle' fill='#8fb8ff' opacity='0.5' font-family='sans-serif'>?</text>" +
      '</svg>',
  );

export const hasDirectionSprite = (unit: UnitAsset, dir: Direction) => (unit.directions ? unit.directions.includes(dir) : dir === 'south');

const productionUnits: UnitAsset[] = [
  {
    id: 'rook',
    legacyIds: ['rook-blender-v4-calibrated'],
    family: 'rook',
    label: 'Rook',
    badge: '8 directions · calibrated',
    preview: pieceSpritePath('rook'),
    read: 'Board-calibrated castle rook with exact eight-direction rotations',
    status: 'active production unit',
    directions: rookDirections,
    factionMode: 'palette',
    defaultScale: 100,
    footprint: squareFootprint(ROOK_KEEP_CANVAS_PX, ROOK_KEEP_CONTACT_FOOTPRINT_PX),
    unitAnchorX: ROOK_KEEP_CONTACT_ANCHOR_X,
    unitAnchorY: ROOK_KEEP_CONTACT_ANCHOR_Y,
    sprite: paletteSprite('rook'),
  },
  {
    id: 'knight',
    legacyIds: ['knight-fur'],
    family: 'knight',
    label: 'Knight',
    badge: '8 directions · calibrated',
    preview: pieceSpritePath('knight'),
    read: 'Carved warhorse with a procedural navy fur coat; true-isometric Blender render',
    status: 'active production unit',
    directions: rookDirections,
    factionMode: 'palette',
    defaultScale: 100,
    footprint: circleFootprint(KNIGHT_FUR_CANVAS_PX, KNIGHT_FUR_CONTACT_FOOTPRINT_PX),
    unitAnchorX: KNIGHT_FUR_CONTACT_ANCHOR_X,
    unitAnchorY: KNIGHT_FUR_CONTACT_ANCHOR_Y,
    sprite: paletteSprite('knight'),
  },
  {
    id: 'bishop',
    legacyIds: ['bishop-mitre'],
    family: 'bishop',
    label: 'Bishop',
    badge: '8 directions · calibrated',
    preview: pieceSpritePath('bishop'),
    read: 'Mitre bishop rendered as a true-isometric eight-direction production unit',
    status: 'active production unit',
    directions: rookDirections,
    factionMode: 'palette',
    defaultScale: 100,
    footprint: circleFootprint(BISHOP_MITRE_CANVAS_PX, BISHOP_MITRE_CONTACT_FOOTPRINT_PX),
    unitAnchorX: BISHOP_MITRE_CONTACT_ANCHOR_X,
    unitAnchorY: BISHOP_MITRE_CONTACT_ANCHOR_Y,
    sprite: paletteSprite('bishop'),
  },
  {
    id: 'queen',
    legacyIds: ['queen-tiara'],
    family: 'queen',
    label: 'Queen',
    badge: '8 directions · calibrated',
    preview: pieceSpritePath('queen'),
    read: 'Coronet queen rendered as a true-isometric eight-direction production unit',
    status: 'active production unit',
    directions: rookDirections,
    factionMode: 'palette',
    defaultScale: 100,
    footprint: circleFootprint(QUEEN_TIARA_CANVAS_PX, QUEEN_TIARA_CONTACT_FOOTPRINT_PX),
    unitAnchorX: QUEEN_TIARA_CONTACT_ANCHOR_X,
    unitAnchorY: QUEEN_TIARA_CONTACT_ANCHOR_Y,
    sprite: paletteSprite('queen'),
  },
  {
    id: 'king',
    legacyIds: ['king-crown'],
    family: 'king',
    label: 'King',
    badge: '8 directions · calibrated',
    preview: pieceSpritePath('king'),
    read: 'Crowned king rendered as a true-isometric eight-direction production unit',
    status: 'active production unit',
    directions: rookDirections,
    factionMode: 'palette',
    defaultScale: 100,
    footprint: circleFootprint(KING_CROWN_CANVAS_PX, KING_CROWN_CONTACT_FOOTPRINT_PX),
    unitAnchorX: KING_CROWN_CONTACT_ANCHOR_X,
    unitAnchorY: KING_CROWN_CONTACT_ANCHOR_Y,
    sprite: paletteSprite('king'),
  },
  {
    id: 'pawn',
    legacyIds: ['pawn-codexsheet'],
    family: 'pawn',
    label: 'Pawn',
    badge: '8 directions · pixel art',
    preview: pieceSpritePath('pawn'),
    read: 'Helmeted pawn — Codex Sheet pixel-art production unit (true-isometric, 8 directions).',
    status: 'active production unit',
    directions: rookDirections,
    factionMode: 'palette',
    defaultScale: 100,
    footprint: circleFootprint(512, 150),
    unitAnchorX: '50%',
    unitAnchorY: '80.241%',
    sprite: paletteSprite('pawn'),
  },
];

for (const unit of productionUnits) unit.method = unit.method ?? 'Production';

const productionBaselines = productionUnits.map((unit) => ({
  unit,
  state: {
    catalogAssetId: unit.catalogAssetId,
    label: unit.label,
    badge: unit.badge,
    read: unit.read,
    status: unit.status,
    defaultScale: unit.defaultScale,
    footprint: { ...unit.footprint },
    unitAnchorX: unit.unitAnchorX,
    unitAnchorY: unit.unitAnchorY,
    accepted: unit.accepted,
    complete: unit.complete,
    spriteCount: unit.spriteCount,
    rowRevision: unit.rowRevision,
  },
}));

const restoreProductionBaselines = (): void => {
  for (const { unit, state } of productionBaselines) {
    Object.assign(unit, state, { footprint: { ...state.footprint } });
  }
};

export const unitAssets: UnitAsset[] = [...productionUnits];

export const productionUnitAssets: UnitAsset[] = unitAssets.slice();
export const archivedUnitAssets: UnitAsset[] = [];

export const UNIT_METHOD_OPTIONS: { id: string; label: string; sub: string }[] = [
  { id: 'Production', label: 'Production', sub: 'shipped' },
];

export const activeUnitFamilies: PieceId[] = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];

let liveUnitCatalog: LiveUnitCatalog | null = null;

const candidateSprite = (asset: LiveUnitCatalogAsset) => (faction: Faction, direction: Direction): string =>
  asset.sprites[faction]?.[direction]?.url ?? MISSING_DIRECTION_SPRITE;

const candidatePreview = (asset: LiveUnitCatalogAsset): string => {
  const preferred = asset.sprites['navy-blue']?.south?.url;
  if (preferred) return preferred;
  for (const palette of Object.values(asset.sprites)) {
    if (!palette) continue;
    for (const sprite of Object.values(palette)) if (sprite?.url) return sprite.url;
  }
  return MISSING_DIRECTION_SPRITE;
};

function catalogAssetToUnit(asset: LiveUnitCatalogAsset, scale: number): UnitAsset {
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
    defaultScale: scale,
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

function isLiveUnitCatalog(value: unknown): value is LiveUnitCatalog {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Partial<LiveUnitCatalog>;
  return Number.isFinite(raw.revision) && Array.isArray(raw.families) && Array.isArray(raw.assets);
}

/**
 * Apply a complete backend snapshot synchronously. The six production UnitAsset
 * objects keep stable family ids; only their accepted art/geometry changes.
 */
export function applyLiveUnitCatalog(value: unknown): boolean {
  if (!isLiveUnitCatalog(value)) return false;
  const before = JSON.stringify({
    revision: liveUnitCatalog?.revision ?? 0,
    ids: unitAssets.map((asset) => [asset.id, asset.catalogAssetId, asset.defaultScale, asset.rowRevision]),
  });
  liveUnitCatalog = value;
  const familyRows = new Map(value.families.map((family) => [family.family, family]));
  const assetsById = new Map(value.assets.map((asset) => [asset.id, asset]));
  const acceptedSprites: AcceptedUnitSpriteMap = {};
  restoreProductionBaselines();

  for (const production of productionUnits) {
    const family = familyRows.get(production.family);
    const accepted = family?.acceptedAssetId ? assetsById.get(family.acceptedAssetId) : undefined;
    production.defaultScale = family?.displayScalePercent ?? production.defaultScale;
    if (!accepted || !accepted.complete) continue;
    production.catalogAssetId = accepted.id;
    production.label = familyLabels[production.family];
    production.badge = '8 directions · live';
    production.read = accepted.notes || `${accepted.method} production unit`;
    production.status = 'active production unit';
    production.footprint = {
      shape: accepted.footprint.shape,
      sourceCanvasPx: accepted.footprint.sourceCanvasWidth,
      sourceCanvasHeightPx: accepted.footprint.sourceCanvasHeight,
      sourceFootprintPx: accepted.footprint.sourceFootprintPx,
    };
    production.unitAnchorX = `${accepted.anchor.x * 100}%`;
    production.unitAnchorY = `${accepted.anchor.y * 100}%`;
    production.accepted = true;
    production.complete = true;
    production.spriteCount = accepted.spriteCount;
    production.rowRevision = accepted.rowRevision;
    const paletteMap: Partial<Record<RegistryPalette, Partial<Record<RegistryDirection, string>>>> = {};
    for (const palette of Object.keys(accepted.sprites) as Faction[]) {
      const directions = accepted.sprites[palette];
      if (!directions) continue;
      paletteMap[palette] = {};
      for (const direction of Object.keys(directions) as Direction[]) {
        const url = directions[direction]?.url;
        if (url) paletteMap[palette]![direction] = url;
      }
    }
    acceptedSprites[production.family as RegistryPieceId] = paletteMap;
  }
  applyAcceptedUnitSprites(value.revision, acceptedSprites);

  const activeCandidates = value.assets
    .filter((asset) => !asset.accepted && asset.status !== 'archived')
    .map((asset) => catalogAssetToUnit(asset, familyRows.get(asset.family)?.displayScalePercent ?? 100));
  const archived = value.assets
    .filter((asset) => asset.status === 'archived')
    .map((asset) => catalogAssetToUnit(asset, familyRows.get(asset.family)?.displayScalePercent ?? 100));
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
  restoreProductionBaselines();
  unitAssets.splice(0, unitAssets.length, ...productionUnits);
  productionUnitAssets.splice(0, productionUnitAssets.length, ...productionUnits);
  archivedUnitAssets.splice(0, archivedUnitAssets.length);
  UNIT_METHOD_OPTIONS.splice(0, UNIT_METHOD_OPTIONS.length, { id: 'Production', label: 'Production', sub: 'shipped' });
}

export function unitAssetById(id: string): UnitAsset | undefined {
  const direct = unitAssets.find((unit) => unit.id === id || unit.catalogAssetId === id);
  if (direct) return direct;
  return productionUnits.find((unit) => unit.legacyIds?.includes(id));
}

export function productionUnitForFamily(family: string): UnitAsset | undefined {
  return productionUnits.find((unit) => unit.family === family);
}

export function unitFamilyForId(id: string): PieceId | undefined {
  if ((activeUnitFamilies as string[]).includes(id)) return id as PieceId;
  return unitAssetById(id)?.family;
}
