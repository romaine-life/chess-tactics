import type { CSSProperties } from 'react';

export type Faction = 'blue' | 'red' | 'neutral';
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

const ROOK_BLENDER_V4_CANVAS_PX = 512;
const ROOK_BLENDER_V4_CONTACT_FOOTPRINT_PX = 334;
const ROOK_BLENDER_V4_CONTACT_ANCHOR_X = '49.9%';
const ROOK_BLENDER_V4_CONTACT_ANCHOR_Y = '71.753%';
const KNIGHT_WOODEN_CANVAS_PX = 512;
const KNIGHT_WOODEN_CONTACT_FOOTPRINT_PX = 174;
const KNIGHT_WOODEN_CONTACT_ANCHOR_X = '49.9%';
const KNIGHT_WOODEN_CONTACT_ANCHOR_Y = '74.219%';

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

const rookVariantSprite = (variant: string) => (_faction: Faction, direction: Direction) => `/assets/units/rook/${variant}/${direction}.png`;
const knightWoodenSprite = (_faction: Faction, direction: Direction) => `/assets/units/knight/candidate-wooden/${direction}.png`;

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
    preview: '/assets/units/rook/blender-render-v4-calibrated/south.png',
    read: 'Board-calibrated castle rook with exact eight-direction rotations',
    status: 'active Blender production unit',
    directions: rookDirections,
    factionMode: 'fixed',
    defaultScale: 100,
    footprint: squareFootprint(ROOK_BLENDER_V4_CANVAS_PX, ROOK_BLENDER_V4_CONTACT_FOOTPRINT_PX),
    unitAnchorX: ROOK_BLENDER_V4_CONTACT_ANCHOR_X,
    unitAnchorY: ROOK_BLENDER_V4_CONTACT_ANCHOR_Y,
    sprite: rookVariantSprite('blender-render-v4-calibrated'),
  },
  {
    id: 'knight-wooden',
    family: 'knight',
    label: 'Knight',
    badge: '8 directions · calibrated',
    preview: '/assets/units/knight/candidate-wooden/south.png',
    read: 'Carved Staunton warhorse from a turned-wood model, restyled navy (board-calibrated render)',
    status: 'active Blender production unit',
    directions: rookDirections,
    factionMode: 'fixed',
    defaultScale: 100,
    footprint: circleFootprint(KNIGHT_WOODEN_CANVAS_PX, KNIGHT_WOODEN_CONTACT_FOOTPRINT_PX),
    unitAnchorX: KNIGHT_WOODEN_CONTACT_ANCHOR_X,
    unitAnchorY: KNIGHT_WOODEN_CONTACT_ANCHOR_Y,
    sprite: knightWoodenSprite,
  },
];

export const activeUnitFamilies = [...new Set(unitAssets.map((unit) => unit.family))];
