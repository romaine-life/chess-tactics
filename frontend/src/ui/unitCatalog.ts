import type { CSSProperties } from 'react';
import { pieceSpritePath, type UnitPalette } from '../core/pieces';

export type Faction = UnitPalette;
export type PieceId = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type Direction = 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';
export type FootprintShape = 'square' | 'circle';

export type UnitFootprint = {
  shape: FootprintShape;
  sourceCanvasPx: number;
  sourceFootprintPx: number;
};

export type UnitPlacementStyle = CSSProperties & {
  '--tile-anchor-x': string;
  '--tile-anchor-y': string;
  '--unit-anchor-x': string;
  '--unit-anchor-y': string;
  '--unit-size': string;
  '--unit-footprint-size': string;
};

export type UnitAsset = {
  id: string;
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
  sprite: (faction: Faction, direction: Direction) => string;
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

export const unitAssets: UnitAsset[] = [
  {
    id: 'rook-blender-v4-calibrated',
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
    id: 'knight-fur',
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
];

export const activeUnitFamilies = [...new Set(unitAssets.map((unit) => unit.family))];
