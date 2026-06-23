import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement, type ReactNode, type WheelEvent } from 'react';
import { TILE_EDGE_ANGLE_DEGREES, TILE_TEMPLATE } from '../art/tileTemplate';
import { buildTileCoverageReport } from '../core/tileCoverage';
import { generateSocketBoard, solveSocketBoard, type SocketBoardCell, type SocketBoardResult } from '../core/tileBoardGenerator';
import { createRng } from '../core/rng';
import {
  socketEdges,
  terrainLabels,
  transitionMaskCode,
  transitionPairs,
  transitionPairById,
  transitionPairsForFamily,
  transitionSlotLabel,
  transitionSlotsForPair,
  tileSocketsForAsset,
  type EdgeName,
  type TileAssetKind,
  type TileFamilyId,
  type TileSocketAsset,
  type TerrainPairId,
  type TransitionPair,
  type TransitionSlot,
} from '../core/tileSockets';
import type { PieceType, Side } from '../core/types';
import { validateLevel, LEVEL_FORMAT_VERSION, type Level } from '../core/level';
import { navigateApp } from './navigation';
import { ViewPane } from './shared/ViewPane';
import {
  MISSING_DIRECTION_SPRITE,
  hasDirectionSprite,
  renderSizeForTileScale,
  unitAssets,
  type Direction,
  type Faction,
  type UnitAsset,
} from './unitCatalog';

type TileRun = 'grass' | 'stone' | 'water' | 'transition';

interface TileRef {
  run: TileRun;
  index: number;
  label: string;
}

interface PreviewCell extends TileRef {
  x: number;
  y: number;
}

const PIXELLAB_ACCOUNT_ID = '3b4f0480-f3cc-4383-b662-7259f13e2d7d';

const tileRuns: Record<TileRun, string> = {
  grass: 'e3964123-619e-4251-967a-e4c3677e943d',
  stone: 'd5865e1f-828c-4a9d-b89b-9e4ef81ae29b',
  water: '71db72aa-ae58-4b17-9d9c-8a00cdd66d26',
  transition: 'a449e26c-0106-4d83-8def-354981c5a8a2',
};

const tileUrl = ({ run, index }: TileRef): string =>
  `https://backblaze.pixellab.ai/file/pixellab-tiles/${PIXELLAB_ACCOUNT_ID}/${tileRuns[run]}/tile_${index}.png`;

const tile = (run: TileRun, index: number, label: string): TileRef => ({ run, index, label });

const kit = {
  grassA: tile('grass', 0, 'grass flat'),
  grassB: tile('grass', 1, 'grass dark'),
  grassC: tile('grass', 2, 'grass texture'),
  grassD: tile('grass', 3, 'grass shadow'),
  grassStone: tile('grass', 4, 'grass stone edge'),
  grassWater: tile('grass', 5, 'grass water edge'),
  grassEdge: tile('grass', 6, 'grass rim'),
  grassCorner: tile('grass', 7, 'grass corner'),
  transGrassStoneA: tile('transition', 0, 'grass stone transition'),
  transGrassStoneB: tile('transition', 1, 'grass stone corner'),
  transGrassWaterA: tile('transition', 2, 'grass water transition'),
  transGrassWaterB: tile('transition', 3, 'grass water corner'),
  transStoneWaterA: tile('transition', 4, 'stone water transition'),
  transStoneWaterB: tile('transition', 5, 'stone water corner'),
  transEdge: tile('transition', 6, 'dark edge'),
  transCorner: tile('transition', 7, 'dark corner'),
  stoneA: tile('stone', 0, 'stone flat'),
  stoneB: tile('stone', 1, 'stone dark'),
  stoneC: tile('stone', 2, 'stone cracked'),
  stoneD: tile('stone', 3, 'stone moss'),
  stoneE: tile('stone', 4, 'stone cobble'),
  stoneGrass: tile('stone', 5, 'stone grass edge'),
  stoneEdge: tile('stone', 6, 'stone rim'),
  stoneCorner: tile('stone', 7, 'stone corner'),
  waterA: tile('water', 0, 'water flat'),
  waterB: tile('water', 1, 'water deep'),
  waterC: tile('water', 2, 'water ripple'),
  waterD: tile('water', 3, 'water moonlit'),
  waterGrass: tile('water', 4, 'water grass edge'),
  waterStone: tile('water', 5, 'water stone edge'),
  waterShallow: tile('water', 6, 'water shallow'),
  waterEdge: tile('water', 7, 'water rim'),
} satisfies Record<string, TileRef>;

const board: PreviewCell[] = [
  { x: 2, y: 0, ...kit.transEdge },
  { x: 3, y: 0, ...kit.grassA },
  { x: 4, y: 0, ...kit.grassC },
  { x: 5, y: 0, ...kit.transCorner },
  { x: 1, y: 1, ...kit.grassA },
  { x: 2, y: 1, ...kit.grassB },
  { x: 3, y: 1, ...kit.transGrassStoneA },
  { x: 4, y: 1, ...kit.stoneGrass },
  { x: 5, y: 1, ...kit.grassB },
  { x: 6, y: 1, ...kit.grassEdge },
  { x: 0, y: 2, ...kit.waterB },
  { x: 1, y: 2, ...kit.transGrassWaterA },
  { x: 2, y: 2, ...kit.grassC },
  { x: 3, y: 2, ...kit.stoneC },
  { x: 4, y: 2, ...kit.stoneD },
  { x: 5, y: 2, ...kit.stoneGrass },
  { x: 6, y: 2, ...kit.grassA },
  { x: 7, y: 2, ...kit.transCorner },
  { x: 0, y: 3, ...kit.waterA },
  { x: 1, y: 3, ...kit.transGrassWaterB },
  { x: 2, y: 3, ...kit.grassB },
  { x: 3, y: 3, ...kit.stoneA },
  { x: 4, y: 3, ...kit.stoneE },
  { x: 5, y: 3, ...kit.transGrassStoneB },
  { x: 6, y: 3, ...kit.grassC },
  { x: 7, y: 3, ...kit.transEdge },
  { x: 1, y: 4, ...kit.waterC },
  { x: 2, y: 4, ...kit.transGrassWaterA },
  { x: 3, y: 4, ...kit.grassA },
  { x: 4, y: 4, ...kit.grassB },
  { x: 5, y: 4, ...kit.stoneCorner },
  { x: 6, y: 4, ...kit.stoneB },
  { x: 2, y: 5, ...kit.waterD },
  { x: 3, y: 5, ...kit.transStoneWaterA },
  { x: 4, y: 5, ...kit.transGrassWaterB },
  { x: 5, y: 5, ...kit.transCorner },
];

const candidates: TileRef[] = [
  kit.grassA,
  kit.grassB,
  kit.grassC,
  kit.transGrassStoneA,
  kit.stoneA,
  kit.stoneC,
  kit.stoneD,
  kit.stoneE,
  kit.waterA,
  kit.waterC,
  kit.transGrassWaterA,
  kit.transStoneWaterA,
];

const runLinks = [
  { label: 'flat grass', id: tileRuns.grass },
  { label: 'flat stone', id: tileRuns.stone },
  { label: 'flat water', id: tileRuns.water },
  { label: 'transitions', id: tileRuns.transition },
  { label: 'water ripple object', id: '96757902-6a20-4ffc-bc5b-94e7a8396969' },
  { label: 'running water object', id: '06a4cf3f-2ad8-4ecb-8aa7-f4e3d326de2d' },
  { label: 'tree rustle object', id: '8fa3fca6-d2e3-453e-8eb8-a7e75b09b3b4' },
  { label: 'tree prop alt', id: 'b39a9f09-1383-4818-ba4e-68ceeb590115' },
  { label: 'tree prop alt', id: 'e6d827ae-c99d-470c-8055-249736f80c1d' },
];

const animationPreviews = [
  {
    label: 'subtle ripple',
    frames: Array.from({ length: 9 }, (_, i) =>
      `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PIXELLAB_ACCOUNT_ID}/96757902-6a20-4ffc-bc5b-94e7a8396969/animations/8f41dc2f-bb29-47b8-a0c5-7c11d02c8be0/unknown/${i}.png`,
    ),
  },
  {
    label: 'running water',
    frames: Array.from({ length: 9 }, (_, i) =>
      `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PIXELLAB_ACCOUNT_ID}/06a4cf3f-2ad8-4ecb-8aa7-f4e3d326de2d/animations/8b5e43b6-a96a-4a8e-acb9-18ec308a11af/unknown/${i}.png`,
    ),
  },
  {
    label: 'wind rustle',
    frames: Array.from({ length: 9 }, (_, i) =>
      `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${PIXELLAB_ACCOUNT_ID}/8fa3fca6-d2e3-453e-8eb8-a7e75b09b3b4/animations/aceb158e-5056-4c72-b71c-9cfa9e2bbc31/unknown/${i}.png`,
    ),
  },
];

type ConceptTerrain = 'grass' | 'stone' | 'water' | 'grassStone' | 'grassWater' | 'edge';

interface ConceptCell {
  x: number;
  y: number;
  terrain: ConceptTerrain;
}

const conceptCells: ConceptCell[] = [
  { x: 3, y: 0, terrain: 'grass' },
  { x: 4, y: 0, terrain: 'grass' },
  { x: 5, y: 0, terrain: 'stone' },
  { x: 6, y: 0, terrain: 'grass' },
  { x: 2, y: 1, terrain: 'grass' },
  { x: 3, y: 1, terrain: 'grass' },
  { x: 4, y: 1, terrain: 'stone' },
  { x: 5, y: 1, terrain: 'stone' },
  { x: 6, y: 1, terrain: 'grass' },
  { x: 7, y: 1, terrain: 'grass' },
  { x: 1, y: 2, terrain: 'grass' },
  { x: 2, y: 2, terrain: 'water' },
  { x: 3, y: 2, terrain: 'grassStone' },
  { x: 4, y: 2, terrain: 'stone' },
  { x: 5, y: 2, terrain: 'stone' },
  { x: 6, y: 2, terrain: 'grassWater' },
  { x: 7, y: 2, terrain: 'water' },
  { x: 8, y: 2, terrain: 'grass' },
  { x: 0, y: 3, terrain: 'grass' },
  { x: 1, y: 3, terrain: 'grassWater' },
  { x: 2, y: 3, terrain: 'water' },
  { x: 3, y: 3, terrain: 'grass' },
  { x: 4, y: 3, terrain: 'grassStone' },
  { x: 5, y: 3, terrain: 'stone' },
  { x: 6, y: 3, terrain: 'grassWater' },
  { x: 7, y: 3, terrain: 'water' },
  { x: 8, y: 3, terrain: 'grass' },
  { x: 9, y: 3, terrain: 'grass' },
  { x: 1, y: 4, terrain: 'grass' },
  { x: 2, y: 4, terrain: 'grass' },
  { x: 3, y: 4, terrain: 'grass' },
  { x: 4, y: 4, terrain: 'grass' },
  { x: 5, y: 4, terrain: 'stone' },
  { x: 6, y: 4, terrain: 'grassWater' },
  { x: 7, y: 4, terrain: 'water' },
  { x: 8, y: 4, terrain: 'grass' },
  { x: 2, y: 5, terrain: 'grass' },
  { x: 3, y: 5, terrain: 'stone' },
  { x: 4, y: 5, terrain: 'stone' },
  { x: 5, y: 5, terrain: 'grass' },
  { x: 6, y: 5, terrain: 'grass' },
  { x: 7, y: 5, terrain: 'water' },
  { x: 3, y: 6, terrain: 'grass' },
  { x: 4, y: 6, terrain: 'grass' },
  { x: 5, y: 6, terrain: 'grass' },
  { x: 6, y: 6, terrain: 'grass' },
];

const overlayCells = [
  { x: 1, y: 4, type: 'move' },
  { x: 2, y: 4, type: 'move' },
  { x: 3, y: 4, type: 'move' },
  { x: 3, y: 5, type: 'move' },
  { x: 4, y: 4, type: 'move' },
  { x: 5, y: 3, type: 'danger' },
  { x: 6, y: 3, type: 'danger' },
  { x: 6, y: 2, type: 'danger' },
] satisfies Array<{ x: number; y: number; type: 'move' | 'danger' }>;

const TRUE_ISO_TILE_ASSET_ROOT = '/assets/tiles/canonical-true-iso';
const TRUE_ISO_TILE_SOURCE = 'canonical-true-iso';
const trueIsoTileAsset = (filename: string): string => `${TRUE_ISO_TILE_ASSET_ROOT}/${filename}`;

const canonicalTileAssets: Record<ConceptTerrain, string[]> = {
  grass: [
    trueIsoTileAsset('grass-clean-a.png'),
    trueIsoTileAsset('grass-clean-b.png'),
    trueIsoTileAsset('grass-clean-c.png'),
  ],
  stone: [
    trueIsoTileAsset('stone-clean-a.png'),
    trueIsoTileAsset('stone-clean-b.png'),
  ],
  water: [
    trueIsoTileAsset('water-clean-a.png'),
    trueIsoTileAsset('water-clean-b.png'),
  ],
  grassStone: [
    trueIsoTileAsset('transition-grass-stone-a.png'),
    trueIsoTileAsset('transition-grass-stone-b.png'),
  ],
  grassWater: [
    trueIsoTileAsset('transition-grass-water-a.png'),
    trueIsoTileAsset('transition-grass-water-b.png'),
  ],
  edge: [trueIsoTileAsset('grass-clean-a.png')],
};

const beforeTileAssets: Record<ConceptTerrain, string[]> = {
  grass: [
    '/assets/tiles/canonical-accepted/grass-clean-a.png',
    '/assets/tiles/canonical-accepted/grass-clean-b.png',
    '/assets/tiles/canonical-accepted/grass-clean-c.png',
  ],
  stone: [
    '/assets/tiles/canonical-accepted/stone-clean-a.png',
    '/assets/tiles/canonical-accepted/stone-clean-b.png',
  ],
  water: [
    '/assets/tiles/canonical-accepted/water-clean-a.png',
    '/assets/tiles/canonical-accepted/water-clean-b.png',
  ],
  grassStone: [
    '/assets/tiles/canonical-accepted/transition-grass-stone-a.png',
    '/assets/tiles/canonical-accepted/transition-grass-stone-b.png',
  ],
  grassWater: [
    '/assets/tiles/canonical-accepted/transition-grass-water-a.png',
    '/assets/tiles/canonical-accepted/transition-grass-water-b.png',
  ],
  edge: ['/assets/tiles/canonical-accepted/grass-clean-a.png'],
};

type StudioFamilyId = TileFamilyId;
type StudioAssetKind = TileAssetKind;
type StudioMode = 'catalog' | 'lab';
type TileFilter = 'base' | 'transitions' | 'references' | 'board';
type LabMode = 'board' | 'tile' | 'unit';
type CollectionFilter = Exclude<TileFilter, 'board'>;
type TransitionViewMode = 'tile' | 'proof' | 'sample';

interface StudioAsset extends TileSocketAsset {
  id: string;
  label: string;
  src: string;
  animation?: {
    label: string;
    frames: string[];
    frameMs: number;
    status: 'prototype' | 'raw candidate' | 'approved';
  };
  role: string;
  kind: StudioAssetKind;
  source: string;
  probability: number;
  notes: string;
}

interface StudioFamily {
  id: StudioFamilyId;
  label: string;
  purpose: string;
  status: string;
  review: string;
  assets: StudioAsset[];
}

interface TilesetStudioRouteState {
  familyId: StudioFamilyId;
  studioMode: StudioMode;
  labMode: LabMode;
  tileFilter: TileFilter;
  selectedPairId: TerrainPairId;
  selectedAssetId?: string;
  selectedSlotMask?: number;
  boardMode: 'generated' | 'concept';
  boardScope: 'family' | 'mixed';
  boardSize: 'small' | 'wide';
  boardSeed: number;
  brushKind: 'tile' | 'unit';
  selectedUnitId?: string;
}

type ReviewItem =
  | { type: 'asset'; asset: StudioAsset }
  | { type: 'slot'; pair: TransitionPair; slot: TransitionSlot<StudioAsset> };

type BoardUnitPlacement = {
  unitId: string;
  direction: Direction;
  faction: Faction;
};

const studioDefaults: TilesetStudioRouteState = {
  familyId: 'grass',
  studioMode: 'catalog',
  labMode: 'board',
  tileFilter: 'base',
  selectedPairId: 'grass-stone',
  boardMode: 'generated',
  boardScope: 'family',
  boardSize: 'small',
  boardSeed: 4217,
  brushKind: 'tile',
};

const waterShimmerAFrames = Array.from(
  { length: 8 },
  (_, index) => `/assets/tiles/canonical-animated/water-shimmer-a/frame-${String(index).padStart(2, '0')}.png?v=3`,
);

const pixellabWaterCleanAFrames = Array.from(
  { length: 9 },
  (_, index) => `/assets/tiles/canonical-animated/pixellab-water-clean-a/frame-${String(index).padStart(2, '0')}.png?v=1`,
);

const aiWaterSheetAFrames = Array.from(
  { length: 8 },
  (_, index) => `/assets/tiles/canonical-animated/ai-water-sheet-a/frame-${String(index).padStart(2, '0')}.png?v=1`,
);

const aiWaterSheetALockedFrames = Array.from(
  { length: 8 },
  (_, index) => `/assets/tiles/canonical-animated/ai-water-sheet-a-locked/frame-${String(index).padStart(2, '0')}.png?v=1`,
);

const aiWaterSheetAUvLockedFrames = Array.from(
  { length: 8 },
  (_, index) => `/assets/tiles/canonical-animated/ai-water-sheet-a-uv-locked/frame-${String(index).padStart(2, '0')}.png?v=1`,
);

const pixellabNativeWaterAFrames = Array.from(
  { length: 8 },
  (_, index) => `/assets/tiles/canonical-animated/pixellab-native-water-a/frame-${String(index).padStart(2, '0')}.png?v=1`,
);

const assetFrameSrc = (asset: StudioAsset, animationFrame: number): string =>
  asset.animation ? asset.animation.frames[animationFrame % asset.animation.frames.length] ?? asset.src : asset.src;

const transitionFillMissingMasks: Record<TerrainPairId, number[]> = {
  'grass-stone': [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  'grass-water': [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  'stone-water': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
};

const titleCasePair = (pairId: TerrainPairId): string =>
  pairId
    .split('-')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');

const transitionFillAsset = (pairId: TerrainPairId, socketMask: number): StudioAsset => {
  const pair = transitionPairById(pairId);
  const code = transitionMaskCode(socketMask);
  const slotLabel = transitionSlotLabel(socketMask, pair);
  return {
    id: `transition-${pairId}-${code}`,
    label: `${titleCasePair(pairId)} ${slotLabel}`,
    src: `/assets/tiles/canonical-transition-fill/transition-${pairId}-${code}.png`,
    role: 'transition',
    kind: 'tile',
    source: 'canonical-transition-fill',
    probability: 1,
    terrains: [...pair.terrains],
    pairId,
    socketMask,
    notes: `Generated first-pass ${pair.label} transition fill for socket mask ${code}.`,
  };
};

const transitionFillAssets = (Object.entries(transitionFillMissingMasks) as Array<[TerrainPairId, number[]]>).flatMap(([pairId, masks]) =>
  masks.map((mask) => transitionFillAsset(pairId, mask)),
);

const transitionAssets: StudioAsset[] = [
  {
    id: 'transition-grass-stone-a',
    label: 'Grass Stone A',
    src: trueIsoTileAsset('transition-grass-stone-a.png'),
    role: 'transition',
    kind: 'tile',
    source: TRUE_ISO_TILE_SOURCE,
    probability: 1,
    terrains: ['grass', 'stone'],
    pairId: 'grass-stone',
    socketMask: 1,
    notes: 'Projection-locked grass to stone transition tile.',
  },
  {
    id: 'transition-grass-stone-b',
    label: 'Grass Stone B',
    src: trueIsoTileAsset('transition-grass-stone-b.png'),
    role: 'transition',
    kind: 'tile',
    source: TRUE_ISO_TILE_SOURCE,
    probability: 1,
    terrains: ['grass', 'stone'],
    pairId: 'grass-stone',
    socketMask: 3,
    notes: 'Projection-locked alternate grass to stone transition tile.',
  },
  {
    id: 'transition-grass-water-a',
    label: 'Grass Water A',
    src: trueIsoTileAsset('transition-grass-water-a.png'),
    role: 'transition',
    kind: 'tile',
    source: TRUE_ISO_TILE_SOURCE,
    probability: 1,
    terrains: ['grass', 'water'],
    pairId: 'grass-water',
    socketMask: 1,
    notes: 'Projection-locked grass to water transition tile.',
  },
  {
    id: 'transition-grass-water-b',
    label: 'Grass Water B',
    src: trueIsoTileAsset('transition-grass-water-b.png'),
    role: 'transition',
    kind: 'tile',
    source: TRUE_ISO_TILE_SOURCE,
    probability: 1,
    terrains: ['grass', 'water'],
    pairId: 'grass-water',
    socketMask: 3,
    notes: 'Projection-locked alternate grass to water transition tile.',
  },
  ...transitionFillAssets,
];

const studioFamilies: StudioFamily[] = [
  {
    id: 'grass',
    label: 'Grass',
    purpose: 'High-volume base terrain for most playable board cells.',
    status: 'Next production family',
    review: 'Check variation, highlight readability, and same-footprint repetition.',
    assets: [
      {
        id: 'grass-clean-a',
        label: 'Grass A',
        src: trueIsoTileAsset('grass-clean-a.png'),
        role: 'base',
        kind: 'tile',
        source: TRUE_ISO_TILE_SOURCE,
        probability: 1,
        notes: 'Projection-locked current board base tile.',
      },
      {
        id: 'grass-clean-b',
        label: 'Grass B',
        src: trueIsoTileAsset('grass-clean-b.png'),
        role: 'variant',
        kind: 'tile',
        source: TRUE_ISO_TILE_SOURCE,
        probability: 0.75,
        notes: 'Projection-locked darker texture variation.',
      },
      {
        id: 'grass-clean-c',
        label: 'Grass C',
        src: trueIsoTileAsset('grass-clean-c.png'),
        role: 'variant',
        kind: 'tile',
        source: TRUE_ISO_TILE_SOURCE,
        probability: 0.75,
        notes: 'Projection-locked light texture variation.',
      },
      {
        id: 'grass-refresh-a',
        label: 'Grass D',
        src: '/assets/tiles/canonical-refresh/grass-refresh-a.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-refresh',
        probability: 0.65,
        notes: 'Approved refresh variant with darker moss and richer shared cliff treatment.',
      },
      {
        id: 'grass-refresh-b',
        label: 'Grass E',
        src: '/assets/tiles/canonical-refresh/grass-refresh-b.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-refresh',
        probability: 0.55,
        notes: 'Approved refresh variant for repetition testing.',
      },
      {
        id: 'grass-refresh-c',
        label: 'Grass F',
        src: '/assets/tiles/canonical-refresh/grass-refresh-c.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-refresh',
        probability: 0.55,
        notes: 'Approved high-detail refresh variant for board-scale readability checks.',
      },
      {
        id: 'grass-guide',
        label: 'Grass Guide',
        src: '/assets/tiles/canonical-template/guide-grass-tile.png',
        role: 'footprint',
        kind: 'reference',
        source: 'canonical-template',
        probability: 0,
        notes: 'Geometry authority for grass-like terrain.',
      },
    ],
  },
  {
    id: 'stone',
    label: 'Stone',
    purpose: 'Hard board terrain and tactical contrast against grass.',
    status: 'Candidate family',
    review: 'Check whether stone belongs to the same board as grass.',
    assets: [
      {
        id: 'stone-clean-a',
        label: 'Stone A',
        src: trueIsoTileAsset('stone-clean-a.png'),
        role: 'base',
        kind: 'tile',
        source: TRUE_ISO_TILE_SOURCE,
        probability: 1,
        notes: 'Projection-locked current board stone base.',
      },
      {
        id: 'stone-clean-b',
        label: 'Stone B',
        src: trueIsoTileAsset('stone-clean-b.png'),
        role: 'variant',
        kind: 'tile',
        source: TRUE_ISO_TILE_SOURCE,
        probability: 0.75,
        notes: 'Projection-locked alternate stone value pass.',
      },
      {
        id: 'stone-refresh-a',
        label: 'Stone C',
        src: '/assets/tiles/canonical-refresh/stone-refresh-a.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-refresh',
        probability: 0.65,
        notes: 'Approved refresh variant with cooler slab detail and shared cliff depth.',
      },
      {
        id: 'stone-refresh-b',
        label: 'Stone D',
        src: '/assets/tiles/canonical-refresh/stone-refresh-b.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-refresh',
        probability: 0.55,
        notes: 'Approved alternate stone refresh variant for board repetition testing.',
      },
      {
        id: 'stone-guide',
        label: 'Stone Guide',
        src: '/assets/tiles/canonical-template/guide-stone-tile.png',
        role: 'footprint',
        kind: 'reference',
        source: 'canonical-template',
        probability: 0,
        notes: 'Geometry authority for stone-like terrain.',
      },
    ],
  },
  {
    id: 'water',
    label: 'Water',
    purpose: 'Animated or animation-ready board terrain.',
    status: 'Candidate family',
    review: 'Check shape, value, and whether the tile is ready for frame animation.',
    assets: [
      {
        id: 'water-clean-a',
        label: 'Water A',
        src: trueIsoTileAsset('water-clean-a.png'),
        animation: {
          label: 'Water shimmer prototype',
          frames: waterShimmerAFrames,
          frameMs: 150,
          status: 'prototype',
        },
        role: 'base',
        kind: 'tile',
        source: TRUE_ISO_TILE_SOURCE,
        probability: 1,
        notes: 'Projection-locked current board water base.',
      },
      {
        id: 'water-clean-b',
        label: 'Water B',
        src: trueIsoTileAsset('water-clean-b.png'),
        role: 'variant',
        kind: 'tile',
        source: TRUE_ISO_TILE_SOURCE,
        probability: 0.75,
        notes: 'Projection-locked alternate water surface.',
      },
      {
        id: 'water-ai-pixellab-clean-a',
        label: 'Water AI A',
        src: '/assets/tiles/canonical-animated/pixellab-water-clean-static.png',
        animation: {
          label: 'PixelLab water shimmer',
          frames: pixellabWaterCleanAFrames,
          frameMs: 150,
          status: 'raw candidate',
        },
        role: 'variant',
        kind: 'tile',
        source: 'pixellab-ai-raw',
        probability: 0,
        notes: 'Raw PixelLab animated water candidate. Review animation quality only; geometry is not yet normalized to the accepted board footprint.',
      },
      {
        id: 'water-ai-sheet-a',
        label: 'Water AI B',
        src: '/assets/tiles/canonical-animated/ai-water-sheet-a-static.png',
        animation: {
          label: 'Direct AI water sheet',
          frames: aiWaterSheetAFrames,
          frameMs: 150,
          status: 'raw candidate',
        },
        role: 'variant',
        kind: 'tile',
        source: 'openai-image-raw',
        probability: 0,
        notes: 'Direct AI-generated sprite sheet candidate, sliced and normalized to 96x140. Review frame stability, edge cleanup, and style fit.',
      },
      {
        id: 'water-ai-sheet-a-locked',
        label: 'Water AI C',
        src: '/assets/tiles/canonical-animated/ai-water-sheet-a-locked-static.png',
        animation: {
          label: 'Direct AI water sheet, geometry locked',
          frames: aiWaterSheetALockedFrames,
          frameMs: 150,
          status: 'raw candidate',
        },
        role: 'variant',
        kind: 'tile',
        source: 'openai-image-locked',
        probability: 0,
        notes: 'Direct AI top-water animation composited onto the canonical water tile body. Side walls and silhouette are mathematically frozen; only the top diamond changes.',
      },
      {
        id: 'water-ai-sheet-a-uv-locked',
        label: 'Water AI D',
        src: '/assets/tiles/canonical-animated/ai-water-sheet-a-uv-locked-static.png',
        animation: {
          label: 'Direct AI water sheet, UV locked',
          frames: aiWaterSheetAUvLockedFrames,
          frameMs: 150,
          status: 'raw candidate',
        },
        role: 'variant',
        kind: 'tile',
        source: 'openai-image-uv-locked',
        probability: 0,
        notes:
          'Direct AI top-water animation remapped from the source top diamond into the canonical top diamond. Side walls and silhouette are mathematically frozen.',
      },
      {
        id: 'water-pixellab-native-a',
        label: 'Water AI E',
        src: '/assets/tiles/canonical-animated/pixellab-native-water-a-static.png',
        animation: {
          label: 'PixelLab native-footprint water (no resample)',
          frames: pixellabNativeWaterAFrames,
          frameMs: 150,
          status: 'raw candidate',
        },
        role: 'variant',
        kind: 'tile',
        source: 'pixellab-v3-native',
        probability: 0,
        notes:
          'PixelLab v3 animation seeded from the canonical 96x140 water tile via custom_start_frame, so every frame is the NATIVE canonical footprint — no fractional downscale, no edge fringe. Top diamond grafted 1:1 onto the frozen canonical body. Verified: identical alpha bounds across frames (no wobble), zero changes outside the top diamond (sides frozen).',
      },
      {
        id: 'water-refresh-a',
        label: 'Water C',
        src: '/assets/tiles/canonical-refresh/water-refresh-a.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-refresh',
        probability: 0.65,
        notes: 'Approved refresh variant with brighter glints and darker depth.',
      },
      {
        id: 'water-refresh-b',
        label: 'Water D',
        src: '/assets/tiles/canonical-refresh/water-refresh-b.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-refresh',
        probability: 0.55,
        notes: 'Approved alternate water refresh variant for animation-readiness checks.',
      },
      {
        id: 'water-guide',
        label: 'Water Guide',
        src: '/assets/tiles/canonical-template/guide-water-tile.png',
        role: 'footprint',
        kind: 'reference',
        source: 'canonical-template',
        probability: 0,
        notes: 'Geometry authority for water-like terrain.',
      },
    ],
  },
];

interface CandidateBatch {
  id: string;
  label: string;
  purpose: string;
  familyId: StudioFamilyId;
  assets: StudioAsset[];
}

type CandidateReviewDecision = 'pending' | 'approved' | 'rejected' | 'revise';
type CandidateReviewStage = 'tile' | 'board' | 'compare';

type ReviewQueueItem =
  | {
      type: 'candidate';
      id: string;
      asset: StudioAsset;
      assetIndex: number;
      batch: CandidateBatch;
      family: StudioFamily;
    }
  | {
      type: 'transition-work';
      id: string;
      pair: TransitionPair;
      slot: TransitionSlot<StudioAsset>;
      family: StudioFamily;
    };

const candidateBatches: CandidateBatch[] = [];

const kindLabels: Record<StudioAssetKind, string> = {
  tile: 'Tile',
  reference: 'Reference',
};

const studioFamilyAssets: Record<StudioFamilyId, readonly StudioAsset[]> = {
  grass: studioFamilies.find((family) => family.id === 'grass')?.assets ?? [],
  stone: studioFamilies.find((family) => family.id === 'stone')?.assets ?? [],
  water: studioFamilies.find((family) => family.id === 'water')?.assets ?? [],
};

const familyCounts = (family: StudioFamily): string => {
  const variants = family.assets.filter((asset) => asset.kind === 'tile').length;
  const transitions = transitionPairsForFamily(family.id).length * 14;
  const references = family.assets.filter((asset) => asset.kind === 'reference').length;
  return `${variants} tiles · ${transitions} slots · ${references} refs`;
};

const CANDIDATE_REVIEW_KEY = 'chess-tactics:tileset-review-decisions:v1';

const familySample = (family: StudioFamily): StudioAsset => family.assets.find((asset) => asset.kind === 'tile') ?? family.assets[0];

const studioFamilyById = (familyId: StudioFamilyId): StudioFamily =>
  studioFamilies.find((item) => item.id === familyId) ?? studioFamilies[0];

const familyBaseAsset = (familyId: StudioFamilyId): StudioAsset =>
  studioFamilyById(familyId).assets.find((asset) => asset.kind === 'tile' && asset.role === 'base') ?? familySample(studioFamilyById(familyId));

const isStudioFamilyId = (value: string | null): value is StudioFamilyId => value === 'grass' || value === 'stone' || value === 'water';

const isStudioMode = (value: string | null): value is StudioMode => value === 'catalog' || value === 'lab';
const isLabMode = (value: string | null): value is LabMode => value === 'board' || value === 'tile' || value === 'unit';

const isTileFilter = (value: string | null): value is TileFilter => value === 'base' || value === 'transitions' || value === 'references' || value === 'board';

const isTerrainPairId = (value: string | null): value is TerrainPairId => value === 'grass-stone' || value === 'grass-water' || value === 'stone-water';
const isUnitAssetId = (value: string | null): value is string => unitAssets.some((unit) => unit.id === value);

const readTilesetStudioRoute = (): TilesetStudioRouteState => {
  const params = new URLSearchParams(window.location.search);
  const family = params.get('family');
  const mode = params.get('mode');
  const lab = params.get('lab');
  const view = params.get('view');
  const collection = params.get('collection');
  const pair = params.get('pair');
  const asset = params.get('asset');
  const unit = params.get('unit');
  const slot = Number(params.get('slot'));
  const seed = Number(params.get('seed'));
  const studioMode = isStudioMode(mode) ? mode : mode === 'view' ? 'lab' : studioDefaults.studioMode;
  const routeTileFilter = view === 'board' ? 'board' : isTileFilter(collection) ? collection : studioDefaults.tileFilter;
  const explicitLabMode = isLabMode(lab) ? lab : undefined;
  const brushKind = params.get('brush') === 'unit' || explicitLabMode === 'unit' ? 'unit' : studioDefaults.brushKind;
  const routeLabMode = explicitLabMode ?? (routeTileFilter === 'board' ? 'board' : brushKind === 'unit' ? 'unit' : 'tile');
  const effectiveTileFilter =
    studioMode === 'catalog'
      ? routeTileFilter === 'board' ? studioDefaults.tileFilter : routeTileFilter
      : routeLabMode === 'board'
        ? 'board'
        : routeTileFilter === 'board'
          ? studioDefaults.tileFilter
          : routeTileFilter;
  return {
    familyId: isStudioFamilyId(family) ? family : studioDefaults.familyId,
    studioMode,
    labMode: routeLabMode,
    tileFilter: effectiveTileFilter,
    selectedPairId: isTerrainPairId(pair) ? pair : studioDefaults.selectedPairId,
    selectedAssetId: asset || undefined,
    selectedSlotMask: Number.isInteger(slot) && slot >= 1 && slot <= 14 ? slot : undefined,
    boardMode: params.get('board') === 'concept' ? 'concept' : studioDefaults.boardMode,
    boardScope: params.get('scope') === 'mixed' ? 'mixed' : studioDefaults.boardScope,
    boardSize: params.get('size') === 'wide' ? 'wide' : studioDefaults.boardSize,
    boardSeed: Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : studioDefaults.boardSeed,
    brushKind,
    selectedUnitId: isUnitAssetId(unit) ? unit : undefined,
  };
};

const writeTilesetStudioRoute = (route: TilesetStudioRouteState): void => {
  if (window.location.pathname !== '/tileset-studio') return;
  const routeTileFilter =
    route.studioMode === 'catalog'
      ? route.tileFilter === 'board' ? studioDefaults.tileFilter : route.tileFilter
      : route.labMode === 'board'
        ? 'board'
        : route.tileFilter === 'board'
          ? studioDefaults.tileFilter
          : route.tileFilter;
  const params = new URLSearchParams();
  params.set('family', route.familyId);
  params.set('mode', route.studioMode);
  if (route.studioMode === 'lab') params.set('lab', route.labMode);
  params.set('collection', routeTileFilter);
  if (route.selectedAssetId) params.set('asset', route.selectedAssetId);
  if (route.selectedSlotMask) params.set('slot', String(route.selectedSlotMask));
  params.set('pair', route.selectedPairId);
  params.set('board', route.boardMode);
  params.set('scope', route.boardScope);
  params.set('size', route.boardSize);
  params.set('seed', String(route.boardSeed));
  if (route.brushKind === 'unit') params.set('brush', 'unit');
  if (route.selectedUnitId) params.set('unit', route.selectedUnitId);
  const nextHref = `${window.location.pathname}?${params.toString()}`;
  const currentHref = `${window.location.pathname}${window.location.search}`;
  if (nextHref !== currentHref) {
    window.history.replaceState({}, '', nextHref);
  }
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const defaultViewZoom = (kind: 'tile' | 'transition' | 'board'): number => {
  if (kind === 'tile') return 1.35;
  if (kind === 'transition') return 1.15;
  return 0.95;
};

const defaultTransitionViewModeForRoute = (route: TilesetStudioRouteState): TransitionViewMode => {
  return route.selectedAssetId && transitionAssets.some((asset) => asset.id === route.selectedAssetId) ? 'tile' : 'proof';
};

const socketsForAsset = (asset: StudioAsset): Record<EdgeName, StudioFamilyId> => {
  return tileSocketsForAsset(asset, studioFamilyAssets);
};

const familyForStudioAsset = (asset: StudioAsset): StudioFamilyId => {
  return studioFamilies.find((item) => item.assets.some((candidate) => candidate.id === asset.id))?.id ?? asset.terrains?.[0] ?? 'grass';
};

const boardFromCells = (cells: SocketBoardCell<StudioAsset>[]): SocketBoardResult<StudioAsset> => ({
  cells,
  fallbacks: [],
  stats: {
    placed: cells.filter((cell) => cell.asset).length,
    missingPlacements: cells.filter((cell) => cell.missing).length,
    illegalEdges: 0,
    candidateAssets: cells.filter((cell) => cell.asset).length,
  },
});

const boardCellForAsset = (asset: StudioAsset, x: number, y: number): SocketBoardCell<StudioAsset> => ({
  x,
  y,
  asset,
  sockets: socketsForAsset(asset),
  terrain: familyForStudioAsset(asset),
});

const boardForAsset = (asset: StudioAsset): SocketBoardResult<StudioAsset> => {
  return boardFromCells([boardCellForAsset(asset, 0, 0)]);
};

const boardForTransitionSlot = (
  pair: TransitionPair | undefined,
  slot: TransitionSlot<StudioAsset>,
  asset: StudioAsset | undefined,
): SocketBoardResult<StudioAsset> => {
  const north = familyBaseAsset(slot.sockets.north);
  const east = familyBaseAsset(slot.sockets.east);
  const south = familyBaseAsset(slot.sockets.south);
  const west = familyBaseAsset(slot.sockets.west);
  const center: SocketBoardCell<StudioAsset> = asset
    ? boardCellForAsset(asset, 1, 1)
    : {
        x: 1,
        y: 1,
        sockets: slot.sockets,
        terrain: slot.sockets.north,
        missing: {
          kind: 'missing-art',
          label: pair ? `${pair.label} ${slot.code}` : `Transition ${slot.code}`,
          pairId: pair?.id,
          mask: slot.mask,
          families: Array.from(new Set(socketEdges.map((edge) => slot.sockets[edge]))),
        },
      };

  return boardFromCells([
    boardCellForAsset(north, 1, 0),
    boardCellForAsset(west, 0, 1),
    center,
    boardCellForAsset(east, 2, 1),
    boardCellForAsset(south, 1, 2),
  ]);
};

const randomTileForFamily = (familyId: StudioFamilyId, seed: number): StudioAsset => {
  const rng = createRng(seed);
  const candidates = studioFamilyById(familyId).assets.filter((asset) => asset.kind === 'tile');
  return rng.pick(candidates.length > 0 ? candidates : [familyBaseAsset(familyId)]);
};

const boardForTransitionSample = (
  pair: TransitionPair | undefined,
  slot: TransitionSlot<StudioAsset>,
  asset: StudioAsset | undefined,
  seed: number,
): SocketBoardResult<StudioAsset> => {
  const families = socketEdges.map((edge) => slot.sockets[edge]);
  const [north, east, south, west] = families.map((familyId, index) => randomTileForFamily(familyId, seed + index * 101));
  const center: SocketBoardCell<StudioAsset> = asset
    ? boardCellForAsset(asset, 1, 1)
    : {
        x: 1,
        y: 1,
        sockets: slot.sockets,
        terrain: slot.sockets.north,
        missing: {
          kind: 'missing-art',
          label: pair ? `${pair.label} ${slot.code}` : `Transition ${slot.code}`,
          pairId: pair?.id,
          mask: slot.mask,
          families: Array.from(new Set(families)),
        },
      };

  return boardFromCells([
    boardCellForAsset(north, 1, 0),
    boardCellForAsset(west, 0, 1),
    center,
    boardCellForAsset(east, 2, 1),
    boardCellForAsset(south, 1, 2),
  ]);
};

const propertyHelp: Record<string, string> = {
  'Tile Type': 'How this asset participates in the tileset: base terrain, transition tile, reference, or invalid transition.',
  North: 'The terrain family this tile exposes on its north edge.',
  East: 'The terrain family this tile exposes on its east edge.',
  South: 'The terrain family this tile exposes on its south edge.',
  West: 'The terrain family this tile exposes on its west edge.',
  Pair: 'The two terrain families this transition tile is allowed to connect.',
  Mask: 'Four-bit edge socket code in north, east, south, west order.',
  Source: 'The asset folder or generation source this item is loaded from.',
  Projection: 'Whether this item is already in the true-isometric production footprint or still needs review.',
  'Fill Weight': 'Relative chance this tile appears when generating random boards. Zero means it is not used by random fill.',
};

function InspectorRow({ label, children }: { label: string; children: ReactElement | string }): ReactElement {
  const help = propertyHelp[label];

  return (
    <div title={help}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function EdgeLedger({ asset }: { asset: StudioAsset }): ReactElement {
  const sockets = socketsForAsset(asset);
  const typeLabel = tileTypeLabel(asset);

  return (
    <>
      <InspectorRow label="Tile Type">{typeLabel}</InspectorRow>
      <InspectorRow label="Source">{asset.source}</InspectorRow>
      <InspectorRow label="Projection">{asset.source === TRUE_ISO_TILE_SOURCE ? 'true-iso locked' : 'review required'}</InspectorRow>
      {socketEdges.map((edge) => (
        <InspectorRow key={edge} label={`${edge[0].toUpperCase()}${edge.slice(1)}`}>
          {terrainLabels[sockets[edge]]}
        </InspectorRow>
      ))}
      {asset.pairId ? (
        <>
          <InspectorRow label="Pair">{transitionPairById(asset.pairId).label}</InspectorRow>
          <InspectorRow label="Mask">{typeof asset.socketMask === 'number' ? transitionMaskCode(asset.socketMask) : 'unset'}</InspectorRow>
        </>
      ) : null}
    </>
  );
}

const tileTypeLabel = (asset: StudioAsset): string => {
  if (asset.kind === 'reference') return 'Reference';
  if (!asset.pairId) return 'Base tile';
  if (typeof asset.socketMask !== 'number' || asset.socketMask === 0 || asset.socketMask === 15) return 'Invalid transition';
  return 'Transition tile';
};

const assetForCell = (assets: Record<ConceptTerrain, string[]>, cell: ConceptCell): string => {
  const options = assets[cell.terrain];
  return options[Math.abs(cell.x * 17 + cell.y * 31) % options.length];
};

function unit({ x, y, side, label }: { x: number; y: number; side: 'blue' | 'red'; label: string }): ReactElement {
  const left = 422 + (x - y) * 64;
  const top = 58 + (x + y) * 32;
  return (
    <div className={`tile-preview-unit is-${side}`} style={{ left, top }} aria-hidden="true">
      <span>{label}</span>
    </div>
  );
}

function ConceptBoardReconstruction({ mode }: { mode: 'before' | 'after' }): ReactElement {
  const ordered = conceptCells.slice().sort((a, b) => a.x + a.y - (b.x + b.y));
  const assets = mode === 'before' ? beforeTileAssets : canonicalTileAssets;

  return (
    <div className="concept-board-reconstruction" aria-label="Concept board plane reconstruction">
      {ordered.map((cell) => {
        const left = TILE_TEMPLATE.originX + (cell.x - cell.y) * TILE_TEMPLATE.stepX;
        const top = TILE_TEMPLATE.originY + (cell.x + cell.y) * TILE_TEMPLATE.stepY;
        return (
          <div
            key={`${cell.x}-${cell.y}`}
            className={`concept-board-tile is-${cell.terrain}`}
            style={{ left, top, zIndex: cell.x + cell.y }}
            aria-hidden="true"
          >
            <img src={assetForCell(assets, cell)} alt="" draggable={false} />
          </div>
        );
      })}
      {overlayCells.map((cell) => {
        const left = TILE_TEMPLATE.originX + (cell.x - cell.y) * TILE_TEMPLATE.stepX;
        const top = TILE_TEMPLATE.originY + (cell.x + cell.y) * TILE_TEMPLATE.stepY;
        return (
          <div
            key={`overlay-${cell.x}-${cell.y}`}
            className={`concept-board-overlay is-${cell.type}`}
            style={{ left, top, zIndex: cell.x + cell.y + 24 }}
            aria-hidden="true"
          />
        );
      })}
      <div className="concept-board-selection is-blue" style={{ left: 390, top: 305 }} />
      <div className="concept-board-selection is-cyan" style={{ left: 486, top: 359 }} />
      <div className="concept-board-selection is-red" style={{ left: 630, top: 278 }} />
    </div>
  );
}

function useAnimationFrameIndex(): number {
  const [animationFrame, setAnimationFrame] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setAnimationFrame((frame) => (frame + 1) % 9), 150);
    return () => window.clearInterval(timer);
  }, []);

  return animationFrame;
}

function useAnimationClock(isPlaying = true, frameCount = 9, frameMs = 150): number {
  const [animationFrame, setAnimationFrame] = useState(0);

  useEffect(() => {
    if (!isPlaying || frameCount <= 1) return undefined;
    const timer = window.setInterval(() => setAnimationFrame((frame) => (frame + 1) % frameCount), frameMs);
    return () => window.clearInterval(timer);
  }, [frameCount, frameMs, isPlaying]);

  useEffect(() => {
    if (frameCount > 0) setAnimationFrame((frame) => frame % frameCount);
  }, [frameCount]);

  return animationFrame;
}

function PreviewBoard({ className = '' }: { className?: string }): ReactElement {
  const ordered = board.slice().sort((a, b) => a.x + a.y - (b.x + b.y));

  return (
    <div className={`tile-preview-board ${className}`} aria-label="Composed board preview">
      {ordered.map((cell) => {
        const left = 360 + (cell.x - cell.y) * 64;
        const top = 34 + (cell.x + cell.y) * 32;
        return (
          <img
            key={`${cell.x}-${cell.y}`}
            className="tile-preview-img"
            src={tileUrl(cell)}
            alt=""
            style={{ left, top, zIndex: cell.x + cell.y }}
            draggable={false}
          />
        );
      })}
      {unit({ x: 2, y: 3, side: 'blue', label: 'N' })}
      {unit({ x: 4, y: 2, side: 'blue', label: 'R' })}
      {unit({ x: 5, y: 3, side: 'red', label: 'B' })}
      {unit({ x: 6, y: 2, side: 'red', label: 'K' })}
    </div>
  );
}

function AnimatedTerrainStrip({ animationFrame }: { animationFrame: number }): ReactElement {
  return (
    <div className="tile-preview-animation-strip" aria-label="Animated terrain previews">
      {animationPreviews.map((preview) => (
        <figure key={preview.label}>
          <img src={preview.frames[animationFrame]} alt="" draggable={false} />
          <figcaption>{preview.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function StudioTileCard({
  asset,
  selected,
  showFootprint,
  zoom,
  animationFrame,
  onSelect,
  onInspect,
  onArmBrush,
  onOpenBoard,
  onWheel,
}: {
  asset: StudioAsset;
  selected: boolean;
  showFootprint: boolean;
  zoom: number;
  animationFrame: number;
  onSelect: () => void;
  onInspect: () => void;
  onArmBrush?: () => void;
  onOpenBoard?: () => void;
  onWheel: (event: WheelEvent<HTMLButtonElement>) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`tileset-studio-card is-${asset.kind} ${selected ? 'is-selected' : ''} ${showFootprint ? 'has-footprint' : ''}`}
      onClick={onSelect}
      onWheel={onWheel}
      aria-pressed={selected}
    >
      <span className="tileset-studio-card-image" style={{ '--tile-zoom': zoom } as CSSProperties}>
        <img src={assetFrameSrc(asset, animationFrame)} alt="" draggable={false} loading="eager" decoding="sync" />
      </span>
      <span className="tileset-studio-card-meta">
        <span
          className="tileset-studio-card-text"
          onClick={(event) => { event.stopPropagation(); onInspect(); }}
        >
          <strong>{asset.label}</strong>
          <em>{asset.role}</em>
        </span>
        {onArmBrush || onOpenBoard ? (
          <span className="tileset-card-actions">
            {onArmBrush ? (
              <span
                className="tileset-card-action"
                role="button"
                tabIndex={0}
                title={`Paint with ${asset.label} on the current board`}
                aria-label={`Paint with ${asset.label}`}
                onClick={(event) => { event.stopPropagation(); onArmBrush(); }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onArmBrush(); } }}
              >
                🖌
              </span>
            ) : null}
            {onOpenBoard ? (
              <span
                className="tileset-card-action"
                role="button"
                tabIndex={0}
                title={`Open ${asset.label} as a fresh board (replaces the current board)`}
                aria-label={`Open ${asset.label} as a fresh board`}
                onClick={(event) => { event.stopPropagation(); onOpenBoard(); }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onOpenBoard(); } }}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <rect x="1.6" y="6.4" width="12.8" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 1.2 V5.4 M5.4 3.2 L8 5.8 L10.6 3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function TransitionRelationshipGrid({
  family,
  pair,
  selectedAsset,
  selectedSlotMask,
  showFootprint,
  animationFrame,
  onPairSelect,
  onAssetSelect,
  onSlotSelect,
  onAssetInspect,
  onSlotInspect,
}: {
  family: StudioFamily;
  pair: TransitionPair;
  selectedAsset: StudioAsset;
  selectedSlotMask?: number;
  showFootprint: boolean;
  animationFrame: number;
  onPairSelect: (pairId: TerrainPairId) => void;
  onAssetSelect: (asset: StudioAsset) => void;
  onSlotSelect: (slot: TransitionSlot<StudioAsset>) => void;
  onAssetInspect: (asset: StudioAsset) => void;
  onSlotInspect: (pair: TransitionPair, slot: TransitionSlot<StudioAsset>) => void;
}): ReactElement {
  const pairs = transitionPairsForFamily(family.id);
  const slots = transitionSlotsForPair(pair, transitionAssets);

  return (
    <div className="tileset-transition-workbench" aria-label={`${family.label} transition relationships`}>
      <nav className="tileset-pair-tabs" aria-label="Transition pairs">
        {pairs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === pair.id ? 'is-active' : ''}
            onClick={() => onPairSelect(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="tileset-relationship-grid" aria-label={`${pair.label} connection previews`}>
        {slots.map((slot) => {
          const firstAsset = slot.assets[0];
          const isSelected = selectedSlotMask === slot.mask || slot.assets.some((asset) => asset.id === selectedAsset.id);
          const cells = [
            { edge: 'north' as EdgeName, x: 1, y: 0, asset: familyBaseAsset(slot.sockets.north) },
            { edge: 'west' as EdgeName, x: 0, y: 1, asset: familyBaseAsset(slot.sockets.west) },
            { edge: 'center' as const, x: 1, y: 1, asset: firstAsset },
            { edge: 'east' as EdgeName, x: 2, y: 1, asset: familyBaseAsset(slot.sockets.east) },
            { edge: 'south' as EdgeName, x: 1, y: 2, asset: familyBaseAsset(slot.sockets.south) },
          ];

          return (
            <article
              key={slot.mask}
              className={`tileset-relationship-card ${firstAsset ? 'has-asset' : 'is-missing'} ${isSelected ? 'is-selected' : ''} ${showFootprint ? 'has-footprint' : ''}`}
              onClick={() => {
                if (firstAsset) {
                  onAssetSelect(firstAsset);
                } else {
                  onSlotSelect(slot);
                }
              }}
            >
              <span
                className="tileset-relationship-head"
                onClick={(event) => {
                  event.stopPropagation();
                  if (firstAsset) {
                    onAssetInspect(firstAsset);
                  } else {
                    onSlotInspect(pair, slot);
                  }
                }}
              >
                <strong>{slot.label}</strong>
                <span>{slot.code}</span>
              </span>
              <span className="tileset-relationship-board" aria-label={`${slot.label} transition relationship`}>
                {cells.map((cell) => {
                  const left = 110 + (cell.x - cell.y) * 32;
                  const top = 10 + (cell.x + cell.y) * 16;
                  return (
                    <span
                      key={cell.edge}
                      className={`tileset-relationship-cell is-${cell.edge} ${cell.asset ? '' : 'is-empty'}`}
                      style={{ left, top, zIndex: cell.x + cell.y }}
                    >
                      {cell.asset ? <img src={assetFrameSrc(cell.asset, animationFrame)} alt="" draggable={false} loading="eager" decoding="sync" /> : <span>Missing</span>}
                    </span>
                  );
                })}
                {cells
                  .filter((cell): cell is typeof cell & { asset: StudioAsset } => Boolean(cell.asset))
                  .map((cell) => {
                    const left = 110 + (cell.x - cell.y) * 32;
                    const top = 10 + (cell.x + cell.y) * 16;
                    return (
                      <button
                        key={`hit-${cell.edge}`}
                        type="button"
                        className={`tileset-relationship-hit-target is-${cell.edge}`}
                        style={{ left, top, zIndex: 100 + cell.x + cell.y }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onAssetSelect(cell.asset);
                        }}
                        aria-label={`Inspect ${cell.asset.label}`}
                      />
                    );
                  })}
              </span>
              <span
                className="tileset-relationship-foot"
                onClick={(event) => {
                  event.stopPropagation();
                  if (firstAsset) {
                    onAssetInspect(firstAsset);
                  } else {
                    onSlotInspect(pair, slot);
                  }
                }}
              >
                {firstAsset ? `${firstAsset.label} · transition tile` : 'Needs transition art'}
              </span>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function TransitionSlotPreview({
  slot,
  asset,
  showFootprint,
  animationFrame,
}: {
  slot: TransitionSlot<StudioAsset>;
  asset?: StudioAsset;
  showFootprint: boolean;
  animationFrame: number;
}): ReactElement {
  const cells = [
    { edge: 'north' as EdgeName, x: 1, y: 0, asset: familyBaseAsset(slot.sockets.north) },
    { edge: 'west' as EdgeName, x: 0, y: 1, asset: familyBaseAsset(slot.sockets.west) },
    { edge: 'center' as const, x: 1, y: 1, asset },
    { edge: 'east' as EdgeName, x: 2, y: 1, asset: familyBaseAsset(slot.sockets.east) },
    { edge: 'south' as EdgeName, x: 1, y: 2, asset: familyBaseAsset(slot.sockets.south) },
  ];

  return (
    <span className={`tileset-relationship-board ${showFootprint ? 'has-footprint' : ''}`} aria-label={`${slot.label} transition relationship`}>
      {cells.map((cell) => {
        const left = 110 + (cell.x - cell.y) * 32;
        const top = 10 + (cell.x + cell.y) * 16;
        const cellClassName = `tileset-relationship-cell is-${cell.edge} ${cell.asset ? '' : 'is-empty'}`;
        const cellStyle = { '--relationship-left': `${left}px`, '--relationship-top': `${top}px`, zIndex: cell.x + cell.y } as CSSProperties;
        const cellAsset = cell.asset;
        if (cellAsset) {
          return (
            <button
              key={cell.edge}
              type="button"
              className={cellClassName}
              style={cellStyle}
              data-asset-id={cellAsset.id}
              aria-label={`Inspect ${cellAsset.label}`}
            >
              <img src={assetFrameSrc(cellAsset, animationFrame)} alt="" draggable={false} loading="eager" decoding="sync" />
            </button>
          );
        }
        return (
          <span
            key={cell.edge}
            className={cellClassName}
            style={cellStyle}
          >
            {cell.asset ? <img src={assetFrameSrc(cell.asset, animationFrame)} alt="" draggable={false} loading="eager" decoding="sync" /> : <span>Missing</span>}
          </span>
        );
      })}
    </span>
  );
}

function StudioGeneratedBoard({
  board,
  showFootprint,
  boardZoom,
  boardPan,
  animationFrame,
}: {
  board: SocketBoardResult<StudioAsset>;
  showFootprint: boolean;
  boardZoom: number;
  boardPan: { x: number; y: number };
  animationFrame: number;
}): ReactElement {
  const cells = board.cells;
  const projectedPoints = cells.map((cell) => ({
    left: (cell.x - cell.y) * TILE_TEMPLATE.stepX,
    top: (cell.x + cell.y) * TILE_TEMPLATE.stepY,
  }));
  const minLeft = Math.min(...projectedPoints.map((point) => point.left - 48));
  const maxLeft = Math.max(...projectedPoints.map((point) => point.left + 48));
  const minTop = Math.min(...projectedPoints.map((point) => point.top - 27));
  const maxTop = Math.max(...projectedPoints.map((point) => point.top + 140));
  const boardWidth = maxLeft - minLeft;
  const boardHeight = maxTop - minTop;
  const originLeft = -minLeft - boardWidth / 2;
  const originTop = -minTop - boardHeight / 2;

  return (
    <div
      className={`tileset-generated-board ${showFootprint ? 'has-footprint' : ''}`}
      style={
        {
          '--board-zoom': boardZoom,
          '--board-pan-x': `${boardPan.x}px`,
          '--board-pan-y': `${boardPan.y}px`,
          '--board-origin-left': `${originLeft}px`,
          '--board-origin-top': `${originTop}px`,
        } as CSSProperties
      }
      aria-label="Generated board from selected tileset"
    >
      {cells.map((cell) => {
        const left = (cell.x - cell.y) * TILE_TEMPLATE.stepX;
        const top = (cell.x + cell.y) * TILE_TEMPLATE.stepY;
        return (
          <div
            key={`${cell.x}-${cell.y}`}
            className={`tileset-generated-board-tile ${cell.missing ? 'is-missing' : ''}`}
            data-asset-id={cell.asset?.id}
            data-missing={cell.missing?.label}
            style={{ left, top, zIndex: cell.x + cell.y }}
          >
            {cell.asset ? <img src={assetFrameSrc(cell.asset, animationFrame)} alt="" draggable={false} /> : <span>{cell.missing?.mask?.toString(2).padStart(4, '0') ?? 'Missing'}</span>}
          </div>
        );
      })}
    </div>
  );
}

// Unified editable board: every Studio view renders through this. It's a full
// clickable grid seeded from whatever was loaded (a tile, a transition, a
// generated board). The `tool` decides what a click does — select (highlight),
// brush (stamp), or erase. Purely in-memory, so it resets when a new view loads.
function StudioEditableBoard({
  cols,
  rows,
  cells: placed,
  units: placedUnits,
  resolveAsset,
  resolveUnit,
  tool,
  selectedCell,
  showFootprint,
  boardZoom,
  boardPan,
  animationFrame,
  onPaint,
  onErase,
  onSelect,
  overlay,
}: {
  cols: number;
  rows: number;
  cells: Record<string, string>;
  units: Record<string, BoardUnitPlacement>;
  resolveAsset: (id: string) => StudioAsset | undefined;
  resolveUnit: (id: string) => UnitAsset | undefined;
  tool: 'select' | 'brush' | 'erase';
  selectedCell: { x: number; y: number } | null;
  showFootprint: boolean;
  boardZoom: number;
  boardPan: { x: number; y: number };
  animationFrame: number;
  onPaint: (x: number, y: number) => void;
  onErase: (x: number, y: number) => void;
  onSelect: (x: number, y: number) => void;
  overlay?: ReactNode;
}): ReactElement {
  const paintingRef = useRef(false);
  const gridCells: { x: number; y: number }[] = [];
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) gridCells.push({ x, y });
  const projected = gridCells.map((cell) => ({ left: (cell.x - cell.y) * TILE_TEMPLATE.stepX, top: (cell.x + cell.y) * TILE_TEMPLATE.stepY }));
  const minLeft = Math.min(...projected.map((point) => point.left - 48));
  const maxLeft = Math.max(...projected.map((point) => point.left + 48));
  const minTop = Math.min(...projected.map((point) => point.top - 27));
  const maxTop = Math.max(...projected.map((point) => point.top + 140));
  const boardWidth = maxLeft - minLeft;
  const boardHeight = maxTop - minTop;
  const originLeft = -minLeft - boardWidth / 2;
  const originTop = -minTop - boardHeight / 2;
  const stopPainting = () => { paintingRef.current = false; };
  const applyTool = (x: number, y: number) => {
    if (tool === 'brush') onPaint(x, y);
    else if (tool === 'erase') onErase(x, y);
    else onSelect(x, y);
  };

  return (
    <div
      className={`tileset-generated-board tileset-placement-board is-tool-${tool} ${showFootprint ? 'has-footprint' : ''}`}
      style={
        {
          '--board-zoom': boardZoom,
          '--board-pan-x': `${boardPan.x}px`,
          '--board-pan-y': `${boardPan.y}px`,
          '--board-origin-left': `${originLeft}px`,
          '--board-origin-top': `${originTop}px`,
        } as CSSProperties
      }
      aria-label="Editable tile board"
      onPointerUp={stopPainting}
      onPointerLeave={stopPainting}
    >
      {gridCells.map((cell) => {
        const key = `${cell.x},${cell.y}`;
        const assetId = placed[key];
        const asset = assetId ? resolveAsset(assetId) : undefined;
        const unitPlacement = placedUnits[key];
        const unitAsset = unitPlacement ? resolveUnit(unitPlacement.unitId) : undefined;
        const left = (cell.x - cell.y) * TILE_TEMPLATE.stepX;
        const top = (cell.x + cell.y) * TILE_TEMPLATE.stepY;
        const isSelected = selectedCell?.x === cell.x && selectedCell?.y === cell.y;
        const unitSprite =
          unitAsset && unitPlacement
            ? hasDirectionSprite(unitAsset, unitPlacement.direction)
              ? unitAsset.sprite(unitPlacement.faction, unitPlacement.direction)
              : MISSING_DIRECTION_SPRITE
            : undefined;
        return (
          <div
            key={key}
            className={`tileset-generated-board-tile tileset-placement-cell ${asset ? '' : 'is-empty'} ${isSelected ? 'is-selected' : ''}`}
            style={{ left, top, zIndex: cell.x + cell.y }}
          >
            {asset ? <img src={assetFrameSrc(asset, animationFrame)} alt="" draggable={false} /> : null}
            {unitAsset && unitSprite ? (
              <img
                className={`tileset-board-unit is-${unitAsset.family}`}
                src={unitSprite}
                alt=""
                draggable={false}
                style={
                  {
                    width: `${renderSizeForTileScale(unitAsset, unitAsset.defaultScale, 1)}px`,
                    height: `${renderSizeForTileScale(unitAsset, unitAsset.defaultScale, 1)}px`,
                    transform: `translate(-${unitAsset.unitAnchorX ?? '50%'}, -${unitAsset.unitAnchorY ?? '92%'})`,
                  } as CSSProperties
                }
              />
            ) : null}
            {isSelected ? <span className="tileset-cell-ring" aria-hidden="true" /> : null}
            <span
              className="tileset-cell-hit"
              onPointerDown={(event) => {
                if (event.button === 2) return; // right-click erases via onContextMenu
                event.stopPropagation(); // don't let the ViewPane start a pan while editing
                if (tool !== 'select') paintingRef.current = true;
                applyTool(cell.x, cell.y);
              }}
              onPointerEnter={() => { if (paintingRef.current) applyTool(cell.x, cell.y); }}
              onContextMenu={(event) => { event.preventDefault(); onErase(cell.x, cell.y); }}
            />
          </div>
        );
      })}
      {overlay}
    </div>
  );
}

type UnitFaction = 'blue' | 'red' | 'neutral';
const unitFactionLabels: Record<UnitFaction, string> = { blue: 'Blue', red: 'Red', neutral: 'Neutral' };

type UnitFacing = 'north' | 'north-east' | 'east' | 'south-east' | 'south' | 'south-west' | 'west' | 'north-west';
const unitFacingLabels: Record<UnitFacing, string> = {
  north: 'North',
  'north-east': 'North-East',
  east: 'East',
  'south-east': 'South-East',
  south: 'South',
  'south-west': 'South-West',
  west: 'West',
  'north-west': 'North-West',
};
const unitFacingArrow: Record<UnitFacing, string> = {
  north: '↑',
  'north-east': '↗',
  east: '→',
  'south-east': '↘',
  south: '↓',
  'south-west': '↙',
  west: '←',
  'north-west': '↖',
};
// 3x3 compass layout (row-major); null is the centre cell.
const unitCompassLayout: (UnitFacing | null)[] = [
  'north-west', 'north', 'north-east',
  'west', null, 'east',
  'south-west', 'south', 'south-east',
];

interface StudioUnit {
  id: string;
  label: string;
  concept: string;
  cutout: string;
  status: string;
  notes: string;
  availableFacings: UnitFacing[];
}

const studioUnits: StudioUnit[] = [
  {
    id: 'pawn-shield-south',
    label: 'Pawn',
    concept: '/assets/units/concepts/pawn-shield-south-concept.png',
    cutout: '/assets/units/cutouts/pawn-shield-south.png',
    status: 'Concept accepted',
    notes:
      'Shield-forward squad pawn — a classic pawn silhouette first, squad unit second. The forward shield locks the facing direction without adding a character body.',
    availableFacings: ['south'],
  },
];
const comingUnits = ['Rook', 'Knight', 'Bishop', 'Queen', 'King'];
const unitProofTile = trueIsoTileAsset('grass-clean-a.png');

// Units browser, folded into the studio as a second asset category. Reuses the
// catalog card grid and the studio view shell; pieces get a concept-art view
// with faction tint and a board-scale proof using the transparent cutout.
function UnitsStudio({ studioMode, onInspect, onBack }: { studioMode: StudioMode; onInspect: () => void; onBack: () => void }): ReactElement {
  const [selectedId, setSelectedId] = useState(studioUnits[0].id);
  const [faction, setFaction] = useState<UnitFaction>('blue');
  const [facing, setFacing] = useState<UnitFacing>('south');
  const [tileOn, setTileOn] = useState(true);
  const [viewZoom, setViewZoom] = useState(2);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const unit = studioUnits.find((item) => item.id === selectedId) ?? studioUnits[0];

  if (studioMode === 'catalog') {
    return (
      <section className="tileset-studio-main">
        <div className="tileset-studio-toolbar">
          <div className="tileset-studio-title-row">
            <div className="tileset-catalog-heading">
              <h2>Units</h2>
              <p className="tileset-filter-summary">{studioUnits.length} concept · {comingUnits.length} planned</p>
            </div>
          </div>
        </div>
        <section className="tileset-studio-tab-panel">
          <div className="tileset-asset-sections">
          <section className="tileset-asset-section" aria-label="Unit concepts">
            <h3>Concepts</h3>
            <div className="tileset-studio-grid" aria-label="Unit assets">
              {studioUnits.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`tileset-studio-card is-tile ${item.id === selectedId ? 'is-selected' : ''}`}
                  onClick={() => { setSelectedId(item.id); onInspect(); }}
                  title={`Inspect ${item.label}`}
                >
                  <span className="tileset-studio-card-image unit-card-image">
                    <img src={item.cutout} alt="" draggable={false} loading="eager" decoding="sync" />
                  </span>
                  <span className="tileset-studio-card-meta">
                    <span className="tileset-studio-card-text">
                      <strong>{item.label}</strong>
                      <em>concept</em>
                    </span>
                  </span>
                </button>
              ))}
              {comingUnits.map((piece) => (
                <button key={piece} type="button" className="tileset-studio-card is-coming" disabled title={`${piece} — not started yet`}>
                  <span className="tileset-studio-card-image unit-card-image" />
                  <span className="tileset-studio-card-meta">
                    <span className="tileset-studio-card-text">
                      <strong>{piece}</strong>
                      <em>not started</em>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="tileset-view-mode unit-view-mode" aria-label="Focused unit view">
      <div className="tileset-view-header">
        <button type="button" onClick={onBack}>
          Back to Catalog
        </button>
        <div>
          <p className="tileset-studio-kicker">Unit</p>
          <h2>{unit.label}</h2>
          <p>{unit.status}</p>
        </div>
      </div>
      <ViewPane
        kind="board"
        ariaLabel="Unit viewer"
        zoom={viewZoom}
        pan={viewPan}
        minZoom={0.5}
        maxZoom={7}
        onZoomChange={setViewZoom}
        onPanChange={setViewPan}
      >
        <div className="unit-scene-wrap">
          <div className="unit-scene" style={{ transform: `translate(${viewPan.x}px, ${viewPan.y}px) scale(${viewZoom})` }}>
            {tileOn ? <img className="unit-scene-ground" src={unitProofTile} alt="" draggable={false} /> : null}
            {unit.availableFacings.includes(facing) ? (
              <img className={`unit-scene-unit is-${faction}`} src={unit.cutout} alt={`${unit.label}, facing ${unitFacingLabels[facing]}`} draggable={false} />
            ) : (
              <div className="unit-scene-unit unit-scene-empty" role="img" aria-label={`${unitFacingLabels[facing]} facing not yet made`}>
                <span>{unitFacingLabels[facing]}</span>
                <span>not yet made</span>
              </div>
            )}
          </div>
        </div>
      </ViewPane>
      <aside className="tileset-view-controls" aria-label="Unit controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            <p className="tileset-group-label">Facing</p>
            <div className="unit-facing-compass" role="group" aria-label="Unit facing">
              {unitCompassLayout.map((dir) => {
                if (dir === null) {
                  return <span key="center" className="unit-facing-center" aria-hidden="true" />;
                }
                const available = unit.availableFacings.includes(dir);
                return (
                  <button
                    key={dir}
                    type="button"
                    className={`unit-facing-cell ${facing === dir ? 'is-active' : ''} ${available ? '' : 'is-unavailable'}`}
                    onClick={() => setFacing(dir)}
                    aria-label={unitFacingLabels[dir]}
                    title={available ? `Face ${unitFacingLabels[dir]}.` : `${unitFacingLabels[dir]} — not yet made`}
                  >
                    {unitFacingArrow[dir]}
                  </button>
                );
              })}
            </div>

            <p className="tileset-group-label">Faction</p>
            <div className="tileset-segmented-control tileset-tools" aria-label="Faction tint">
              {(Object.keys(unitFactionLabels) as UnitFaction[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={faction === item ? 'is-active' : ''}
                  onClick={() => setFaction(item)}
                  title={`Preview the ${unitFactionLabels[item]} faction tint.`}
                >
                  {unitFactionLabels[item]}
                </button>
              ))}
            </div>

            <p className="tileset-group-label">View</p>
            <div className="tileset-button-row">
              <button
                type="button"
                className={`tileset-toggle ${tileOn ? 'is-on' : ''}`}
                aria-pressed={tileOn}
                onClick={() => setTileOn((value) => !value)}
                title="Show or hide the tile under the unit. Hide it and zoom in to inspect the artwork."
              >
                <span>Tile</span>
                <span className="tileset-toggle-pill" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => { setViewPan({ x: 0, y: 0 }); setViewZoom(2); }} title="Recenter and reset the zoom.">
                Reset
              </button>
            </div>
            <label>
              Zoom
              <input
                type="range"
                min="0.5"
                max="7"
                step="0.1"
                value={viewZoom}
                onChange={(event) => setViewZoom(Number(event.target.value))}
              />
            </label>
          </div>
        </section>
        <section className="tileset-inspector-section" aria-label="Unit details">
          <h2>Details</h2>
          <dl>
            <InspectorRow label="Piece">{unit.label}</InspectorRow>
            <InspectorRow label="Facing">{unitFacingLabels[facing]}</InspectorRow>
            <InspectorRow label="Read">Chess piece first</InspectorRow>
            <InspectorRow label="State">{unit.status}</InspectorRow>
          </dl>
          <p>{unit.notes}</p>
        </section>
      </aside>
    </section>
  );
}

type LevelBrush = TileFamilyId | 'erase';
const levelTerrainOrder: TileFamilyId[] = ['grass', 'stone', 'water'];
const levelFamilySwatch: Record<TileFamilyId, string> = {
  grass: '#5b8c3a',
  stone: '#8c8c95',
  water: '#3a6ea5',
};
const levelSizes = {
  small: { cols: 10, rows: 8 },
  wide: { cols: 14, rows: 10 },
} as const;

type LevelUnitCell = { type: PieceType; side: Side };
type LevelSnapshot = { t: Record<string, TileFamilyId>; u: Record<string, LevelUnitCell> };
const LE_ICON_ROOT = '/assets/ui/level-editor';
const leIcon = (name: string, active = false): string => `${LE_ICON_ROOT}/icons/${name}${active ? '-active' : ''}.png`;
const levelPieceTypes: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
const levelSides: Side[] = ['player', 'enemy', 'neutral'];
const pieceGlyph: Record<PieceType, string> = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', rock: '▲', 'random-rock': '?' };
const pieceLabel: Record<PieceType, string> = { pawn: 'Pawn', knight: 'Knight', bishop: 'Bishop', rook: 'Rook', queen: 'Queen', rock: 'Rock', 'random-rock': 'Random rock' };
const sideLabel: Record<Side, string> = { player: 'Player', enemy: 'Enemy', neutral: 'Neutral' };
const sideClass: Record<Side, string> = { player: 'is-player', enemy: 'is-enemy', neutral: 'is-neutral' };
// Only the pawn has finished art so far; everything else renders as a glyph chip.
const levelPieceArt: Partial<Record<PieceType, string>> = { pawn: '/assets/units/cutouts/pawn-shield-south.png' };

// Fill every unpainted cell with its nearest painted family (multi-source BFS),
// so a painted region's outer border meets matching terrain (clean base tiles)
// and only adjacent *different* painted families produce socket transitions.
function buildLevelTerrainMap(terrainCells: Record<string, TileFamilyId>, cols: number, rows: number): TileFamilyId[] {
  const map = new Array<TileFamilyId>(cols * rows).fill('grass');
  const idx = (x: number, y: number) => y * cols + x;
  const visited = new Uint8Array(cols * rows);
  const queue: number[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const family = terrainCells[`${x},${y}`];
      if (family) {
        const p = idx(x, y);
        map[p] = family;
        visited[p] = 1;
        queue.push(p);
      }
    }
  }
  if (queue.length === 0) return map; // nothing painted yet: all grass, rendered as empty
  let head = 0;
  while (head < queue.length) {
    const p = queue[head];
    head += 1;
    const x = p % cols;
    const y = (p / cols) | 0;
    const family = map[p];
    const neighbours: Array<[number, number]> = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const np = idx(nx, ny);
      if (visited[np]) continue;
      visited[np] = 1;
      map[np] = family;
      queue.push(np);
    }
  }
  return map;
}

function LeChromePanel({ title, className = '', children }: { title: string; className?: string; children: ReactNode }): ReactElement {
  return (
    <section className={`le-panel ${className}`.trim()}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function LeIconButton({ label, icon, active = false, disabled = false, onClick }: { label: string; icon: string; active?: boolean; disabled?: boolean; onClick?: () => void }): ReactElement {
  return (
    <button type="button" className={`le-icon-button ${active ? 'is-active' : ''}`.trim()} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <img src={leIcon(icon, active)} alt="" aria-hidden="true" />
    </button>
  );
}

function LeActionButton({ label, icon, primary = false, disabled = false, title, onClick }: { label: string; icon?: string; primary?: boolean; disabled?: boolean; title?: string; onClick?: () => void }): ReactElement {
  return (
    <button type="button" className={`le-action-button ${primary ? 'is-primary' : ''}`.trim()} disabled={disabled} title={title ?? label} onClick={onClick}>
      {icon ? <img src={leIcon(icon, primary)} alt="" aria-hidden="true" /> : null}
      <span>{label}</span>
    </button>
  );
}

// The level editor: the polished asset-backed `le-` chrome (top toolbar, side
// rails, asset tray, status bar) wrapping the socket-legal board. Paint terrain
// *families* and the solver lays down the legal tile per cell (base inside a
// region, transitions where families meet); place chess-piece units on top.
// This replaces the old Pixi EditorBoard surface while keeping its chrome/art.
export function LevelEditorPage(): ReactElement {
  const [terrainCells, setTerrainCells] = useState<Record<string, TileFamilyId>>({});
  const [unitCells, setUnitCells] = useState<Record<string, LevelUnitCell>>({});
  const [layer, setLayer] = useState<'terrain' | 'units'>('terrain');
  const [brush, setBrush] = useState<LevelBrush>('grass');
  const [unitType, setUnitType] = useState<PieceType>('pawn');
  const [unitSide, setUnitSide] = useState<Side>('player');
  const [unitErase, setUnitErase] = useState(false);
  const [sizeKey, setSizeKey] = useState<'small' | 'wide'>('small');
  const [viewZoom, setViewZoom] = useState(0.95);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [past, setPast] = useState<LevelSnapshot[]>([]);
  const [future, setFuture] = useState<LevelSnapshot[]>([]);
  const [status, setStatus] = useState('Ready');
  const { cols, rows } = levelSizes[sizeKey];
  const animationFrame = useAnimationClock(true, 8, 150);

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('level-editor-active');
    return () => shell?.classList.remove('level-editor-active');
  }, []);

  const levelAssets = useMemo(
    () => [...studioFamilies.flatMap((family) => family.assets.filter((asset) => asset.kind === 'tile')), ...transitionAssets],
    [],
  );
  const assetById = useMemo(() => new Map(levelAssets.map((asset) => [asset.id, asset])), [levelAssets]);

  const solved = useMemo(
    () => solveSocketBoard({ assets: levelAssets, terrainMap: buildLevelTerrainMap(terrainCells, cols, rows), seed: 7, columns: cols, rows, familyAssets: studioFamilyAssets }),
    [terrainCells, cols, rows, levelAssets],
  );

  // Only painted cells render. Map each to its solved asset id (StudioEditableBoard
  // shows empty for unresolved/missing cells — those are surfaced in the status line).
  const renderedCells = useMemo(() => {
    const out: Record<string, string> = {};
    for (const cell of solved.cells) {
      const key = `${cell.x},${cell.y}`;
      if (terrainCells[key] && cell.asset) out[key] = cell.asset.id;
    }
    return out;
  }, [solved, terrainCells]);

  const paintedCount = Object.keys(terrainCells).length;
  const unitCount = Object.keys(unitCells).length;
  const missingCount = solved.cells.filter((cell) => terrainCells[`${cell.x},${cell.y}`] && cell.missing).length;

  // Undo/redo. Painting a stroke snapshots on pointer-down (capture phase, before
  // the cell handler stops propagation) and commits on pointer-up if it changed;
  // discrete actions snapshot up front via recordHistory().
  const terrainRef = useRef(terrainCells);
  terrainRef.current = terrainCells;
  const unitRef = useRef(unitCells);
  unitRef.current = unitCells;
  const strokeRef = useRef<LevelSnapshot | null>(null);
  const snapshot = (): LevelSnapshot => ({ t: terrainRef.current, u: unitRef.current });
  const recordHistory = () => {
    setPast((prev) => [...prev.slice(-49), snapshot()]);
    setFuture([]);
  };
  const beginStroke = () => { strokeRef.current = snapshot(); };
  const endStroke = () => {
    const start = strokeRef.current;
    strokeRef.current = null;
    if (start && (start.t !== terrainRef.current || start.u !== unitRef.current)) {
      setPast((prev) => [...prev.slice(-49), start]);
      setFuture([]);
    }
  };
  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setFuture((f) => [...f, snapshot()]);
    setPast((p) => p.slice(0, -1));
    setTerrainCells(prev.t);
    setUnitCells(prev.u);
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[future.length - 1];
    setPast((p) => [...p, snapshot()]);
    setFuture((f) => f.slice(0, -1));
    setTerrainCells(next.t);
    setUnitCells(next.u);
  };

  const paintTerrain = (x: number, y: number) => {
    if (brush === 'erase') return;
    const family = brush;
    setTerrainCells((prev) => (prev[`${x},${y}`] === family ? prev : { ...prev, [`${x},${y}`]: family }));
  };
  const eraseTerrain = (x: number, y: number) => {
    const key = `${x},${y}`;
    setTerrainCells((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // A unit can't stand on void — drop it when its tile is erased.
    setUnitCells((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  const placeUnit = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (!terrainCells[key]) return; // units stand on painted terrain only
    setUnitCells((prev) => (prev[key]?.type === unitType && prev[key]?.side === unitSide ? prev : { ...prev, [key]: { type: unitType, side: unitSide } }));
  };
  const eraseUnit = (x: number, y: number) =>
    setUnitCells((prev) => {
      const key = `${x},${y}`;
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  const clearLevel = () => {
    recordHistory();
    setTerrainCells({});
    setUnitCells({});
    setStatus('Cleared');
  };
  const clearUnits = () => {
    recordHistory();
    setUnitCells({});
  };
  const fillLevel = () => {
    if (brush === 'erase') return;
    recordHistory();
    const family = brush;
    const next: Record<string, TileFamilyId> = {};
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) next[`${x},${y}`] = family;
    setTerrainCells(next);
  };
  // Random fill restricted to tiles that actually exist: the generator only
  // emits socket-legal placements, so reading back each cell's terrain gives a
  // legal, paintable map.
  const randomizeTerrain = () => {
    recordHistory();
    const board = generateSocketBoard({ assets: levelAssets, seed: Math.floor(Math.random() * 999999) + 1, columns: cols, rows, familyAssets: studioFamilyAssets });
    const next: Record<string, TileFamilyId> = {};
    for (const cell of board.cells) next[`${cell.x},${cell.y}`] = cell.terrain;
    setTerrainCells(next);
    setUnitCells({});
  };
  const changeSize = (key: 'small' | 'wide') => {
    if (key === sizeKey) return;
    recordHistory();
    setSizeKey(key);
  };

  // Build the durable Level doc from the painted board so we can validate now and
  // save to the server once the editor is hosted. Family ids are valid TerrainTypes.
  const buildLevel = (): Level => {
    const terrain = Object.entries(terrainCells).map(([key, family]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, terrain: family, elevation: 0 };
    });
    const units = Object.entries(unitCells).map(([key, unit]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, type: unit.type, side: unit.side };
    });
    return {
      formatVersion: LEVEL_FORMAT_VERSION,
      id: 'draft',
      name: 'Untitled',
      board: { cols, rows, heightLevels: 1 },
      objective: 'capture-all',
      difficulty: 'normal',
      economy: { startingFunds: 1200, incomePerTurn: 150 },
      theme: 'grassland',
      layers: { terrain, decals: [], zones: [], units },
    };
  };
  const validate = () => {
    const result = validateLevel(buildLevel());
    setStatus(result.ok ? `Valid · ${unitCount} units · ${cols} × ${rows}` : `Invalid: ${result.errors[0]}`);
  };

  const setTerrainBrush = (family: TileFamilyId) => { setBrush(family); setLayer('terrain'); };
  const setUnitBrush = (type: PieceType, side: Side) => { setUnitType(type); setUnitSide(side); setUnitErase(false); setLayer('units'); };
  const onBoardPaint = layer === 'terrain' ? paintTerrain : placeUnit;
  const onBoardErase = layer === 'terrain' ? eraseTerrain : eraseUnit;
  const boardTool: 'select' | 'brush' | 'erase' =
    layer === 'terrain' ? (brush === 'erase' ? 'erase' : 'brush') : unitErase ? 'erase' : 'brush';
  const eraseActive = (layer === 'terrain' && brush === 'erase') || (layer === 'units' && unitErase);

  const toolTabs: Array<{ id: string; label: string; icon: string; active: boolean; onClick: () => void }> = [
    { id: 'terrain', label: 'Terrain', icon: 'brush', active: layer === 'terrain' && brush !== 'erase', onClick: () => { setLayer('terrain'); if (brush === 'erase') setBrush('grass'); } },
    { id: 'units', label: 'Units', icon: 'zone', active: layer === 'units' && !unitErase, onClick: () => { setLayer('units'); setUnitErase(false); } },
    { id: 'erase', label: 'Erase', icon: 'eraser', active: eraseActive, onClick: () => { if (layer === 'terrain') setBrush('erase'); else setUnitErase(true); } },
    { id: 'grid', label: showGrid ? 'Grid On' : 'Grid Off', icon: 'grid', active: showGrid, onClick: () => setShowGrid((value) => !value) },
  ];

  const layerRows: Array<{ id: string; label: string; locked: boolean }> = [
    { id: 'terrain', label: 'Terrain', locked: false },
    { id: 'units', label: 'Units', locked: false },
    { id: 'zones', label: 'Zones', locked: true },
    { id: 'decals', label: 'Decals', locked: true },
  ];

  const unitOverlay = (
    <div className="level-unit-layer">
      {Object.entries(unitCells).map(([key, unit]) => {
        const [x, y] = key.split(',').map(Number);
        const left = (x - y) * TILE_TEMPLATE.stepX;
        const top = (x + y) * TILE_TEMPLATE.stepY;
        const art = levelPieceArt[unit.type];
        return (
          <div key={key} className={`level-unit ${sideClass[unit.side]}`} style={{ left, top, zIndex: 500 + x + y }} title={`${sideLabel[unit.side]} ${pieceLabel[unit.type]}`}>
            {art ? <img src={art} alt="" draggable={false} /> : <span className="level-unit-chip">{pieceGlyph[unit.type]}</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="level-editor-shell" data-testid="level-editor">
      <header className="le-topbar" aria-label="Level editor toolbar">
        <a className="le-brand" href="/">
          <img className="le-brand-crest" src="/assets/ui/main-menu/icon-scroll.png" alt="" aria-hidden="true" />
          <span>
            <picture className="le-brand-title">
              <source srcSet="/assets/ui/main-menu-brand-title-only-v1.avif" type="image/avif" />
              <source srcSet="/assets/ui/main-menu-brand-title-only-v1.webp" type="image/webp" />
              <img src="/assets/ui/main-menu-brand-title-only-v1.png" alt="Chess Tactics" />
            </picture>
            <strong>Level Editor</strong>
          </span>
        </a>
        <nav className="le-tool-tabs" aria-label="Editor tools">
          {toolTabs.map((tab) => (
            <button key={tab.id} type="button" data-testid={`tool-${tab.id}`} className={`le-tool-tab ${tab.active ? 'is-active' : ''}`.trim()} onClick={tab.onClick}>
              <img src={leIcon(tab.icon, tab.active)} alt="" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="le-history" aria-label="Edit history">
          <LeIconButton label="Undo" icon="undo" disabled={!past.length} onClick={undo} />
          <LeIconButton label="Redo" icon="redo" disabled={!future.length} onClick={redo} />
        </div>
        <div className="le-save-actions">
          <LeActionButton label="Test" icon="play" onClick={validate} />
          <LeActionButton label="Save" icon="save" primary disabled title="Saving unlocks on the hosted environment." />
          <a className="le-menu-link" href="/" aria-label="Main menu">
            <img src={leIcon('menu')} alt="" aria-hidden="true" />
          </a>
        </div>
      </header>

      <main className="le-workspace">
        <aside className="le-left-rail" aria-label="Board controls">
          <LeChromePanel title="Board Settings">
            <label className="le-field">
              <span>Size</span>
              <select value={sizeKey} onChange={(event) => changeSize(event.target.value as 'small' | 'wide')}>
                <option value="small">{levelSizes.small.cols} x {levelSizes.small.rows}</option>
                <option value="wide">{levelSizes.wide.cols} x {levelSizes.wide.rows}</option>
              </select>
            </label>
            <label className="le-field"><span>Theme</span><select value="Grassland" onChange={() => undefined}><option>Grassland</option></select></label>
            <label className="le-check"><input type="checkbox" checked={showGrid} onChange={() => setShowGrid((value) => !value)} /> Isometric Grid</label>
            <button type="button" className="le-action-button" onClick={randomizeTerrain} title="Generate a random, socket-legal terrain layout.">
              <img src={leIcon('grid')} alt="" aria-hidden="true" />
              <span>Randomize</span>
            </button>
          </LeChromePanel>

          <LeChromePanel title="Layers" className="le-layers-panel">
            {layerRows.map((row) => {
              const active = !row.locked && layer === row.id;
              return (
                <button key={row.id} type="button" className={`le-layer-row ${active ? 'is-selected' : ''}`.trim()} disabled={row.locked} onClick={() => !row.locked && setLayer(row.id as 'terrain' | 'units')}>
                  <img src={leIcon('eye', active)} alt="" aria-hidden="true" />
                  <span>{row.label}</span>
                  <img src={leIcon(row.locked ? 'lock' : 'grid', active)} alt="" aria-hidden="true" />
                </button>
              );
            })}
          </LeChromePanel>

          <LeChromePanel title="Map Preview" className="le-minimap-panel">
            <div className="le-minimap" aria-hidden="true"><span /></div>
          </LeChromePanel>

          <LeChromePanel title="Legality" className="le-camera-panel">
            <div className="le-legality-readout">
              <strong>{paintedCount}</strong> tiles · <strong>{unitCount}</strong> units
            </div>
            <div className={`le-legality-status ${missingCount > 0 ? 'is-warning' : paintedCount > 0 ? 'is-ok' : ''}`.trim()}>
              {missingCount > 0
                ? `${missingCount} unsupported junction${missingCount === 1 ? '' : 's'}`
                : paintedCount > 0
                  ? 'All edges legal'
                  : 'Paint terrain to begin.'}
            </div>
          </LeChromePanel>
        </aside>

        <section className="le-board-stage" aria-label="Editable board" onPointerDownCapture={beginStroke} onPointerUpCapture={endStroke}>
          <div className="le-board-frame le-board-live">
            <ViewPane kind="board" ariaLabel="Level editor board" zoom={viewZoom} pan={viewPan} minZoom={0.4} maxZoom={4} onZoomChange={setViewZoom} onPanChange={setViewPan}>
              <div className="tileset-view-board-content is-board">
                <StudioEditableBoard
                  cols={cols}
                  rows={rows}
                  cells={renderedCells}
                  units={{}}
                  resolveAsset={(id) => assetById.get(id)}
                  resolveUnit={() => undefined}
                  tool={boardTool}
                  selectedCell={null}
                  showFootprint={showGrid}
                  boardZoom={viewZoom}
                  boardPan={viewPan}
                  animationFrame={animationFrame}
                  onPaint={onBoardPaint}
                  onErase={onBoardErase}
                  onSelect={() => {}}
                  overlay={unitOverlay}
                />
              </div>
            </ViewPane>
          </div>
        </section>

        <aside className="le-right-rail" aria-label="Palette controls">
          <LeChromePanel title="Tile Palette" className="le-palette-panel">
            <div className="le-palette-grid">
              {levelTerrainOrder.map((family) => (
                <button key={family} type="button" title={terrainLabels[family]} className={layer === 'terrain' && brush === family ? 'is-active' : ''} onClick={() => setTerrainBrush(family)}>
                  <i style={{ background: levelFamilySwatch[family] }} />
                  <span>{terrainLabels[family]}</span>
                </button>
              ))}
              <button type="button" title="Erase terrain" className={layer === 'terrain' && brush === 'erase' ? 'is-active' : ''} onClick={() => { setBrush('erase'); setLayer('terrain'); }}>
                <i style={{ background: 'repeating-linear-gradient(45deg, #36202a, #36202a 4px, #6a2030 4px, #6a2030 8px)' }} />
                <span>Erase</span>
              </button>
            </div>
          </LeChromePanel>

          <LeChromePanel title="Units">
            <div className="le-unit-groups">
              {levelSides.map((side) => (
                <div key={side} className={`le-unit-side is-${side}`}>
                  <span>{sideLabel[side]}</span>
                  <div>
                    {levelPieceTypes.map((piece) => (
                      <button key={piece} type="button" title={`${sideLabel[side]} ${pieceLabel[piece]}`} className={layer === 'units' && !unitErase && unitType === piece && unitSide === side ? 'is-active' : ''} onClick={() => setUnitBrush(piece, side)}>
                        {pieceGlyph[piece]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" className={`le-action-button ${layer === 'units' && unitErase ? 'is-primary' : ''}`.trim()} onClick={() => { setUnitErase(true); setLayer('units'); }} title="Erase units (right-click also erases).">
                <img src={leIcon('eraser', layer === 'units' && unitErase)} alt="" aria-hidden="true" />
                <span>Erase Units</span>
              </button>
            </div>
          </LeChromePanel>

          <LeChromePanel title="Brush">
            <div className="le-brush-tools">
              <LeIconButton label="Paint" icon="brush" active={!eraseActive} onClick={() => { if (layer === 'terrain' && brush === 'erase') setBrush('grass'); setUnitErase(false); }} />
              <LeIconButton label="Erase" icon="eraser" active={eraseActive} onClick={() => { if (layer === 'terrain') setBrush('erase'); else setUnitErase(true); }} />
              <LeIconButton label="Grid" icon="grid" active={showGrid} onClick={() => setShowGrid((value) => !value)} />
              <LeIconButton label="Clear" icon="eraser" onClick={clearLevel} />
            </div>
            <label className="le-field">
              <span>Zoom</span>
              <input type="range" min="0.4" max="4" step="0.05" value={viewZoom} onChange={(event) => setViewZoom(Number(event.target.value))} />
            </label>
          </LeChromePanel>
        </aside>
      </main>

      <footer className="le-bottom-tray" aria-label="Asset tray">
        <div className="le-tray-assets">
          {levelSides.flatMap((side) =>
            levelPieceTypes.map((piece) => (
              <button key={`${side}-${piece}`} type="button" className={layer === 'units' && !unitErase && unitType === piece && unitSide === side ? 'is-active' : ''} onClick={() => setUnitBrush(piece, side)} title={`${sideLabel[side]} ${pieceLabel[piece]}`}>
                <span className={`le-tray-glyph ${sideClass[side]}`}>{pieceGlyph[piece]}</span>
                <span>{pieceLabel[piece]}</span>
              </button>
            )),
          )}
          {levelTerrainOrder.map((family) => (
            <button key={`tray-${family}`} type="button" className={layer === 'terrain' && brush === family ? 'is-active' : ''} onClick={() => setTerrainBrush(family)} title={terrainLabels[family]}>
              <i style={{ background: levelFamilySwatch[family] }} />
              <span>{terrainLabels[family]}</span>
            </button>
          ))}
        </div>
        <div className="le-tray-controls">
          <span>Layer</span>
          <LeIconButton label="Terrain" icon="brush" active={layer === 'terrain'} onClick={() => setLayer('terrain')} />
          <LeIconButton label="Units" icon="zone" active={layer === 'units'} onClick={() => setLayer('units')} />
        </div>
      </footer>

      <div className="le-status" data-testid="editor-status">
        <span className="le-status-dot" />
        <span>{status}</span>
        <span>Board: {cols} x {rows}</span>
        <span>Tiles: {paintedCount}</span>
        <span>Units: {unitCount}</span>
        <span>{missingCount > 0 ? `${missingCount} junction warning${missingCount === 1 ? '' : 's'}` : 'Legal'}</span>
      </div>
    </div>
  );
}

export function TilesetStudio(): ReactElement {
  const initialRoute = useMemo(() => readTilesetStudioRoute(), []);
  const initialHasViewTarget = Boolean(initialRoute.selectedAssetId || initialRoute.selectedSlotMask || initialRoute.tileFilter === 'board');
  const [familyId, setFamilyId] = useState<StudioFamilyId>(initialRoute.familyId);
  const [studioMode, setStudioMode] = useState<StudioMode>(initialRoute.studioMode);
  const [category, setCategory] = useState<'tiles' | 'units'>('tiles');
  const [labMode, setLabMode] = useState<LabMode>(initialRoute.labMode);
  const [viewHasTarget, setViewHasTarget] = useState(initialHasViewTarget);
  const [tileFilter, setTileFilter] = useState<TileFilter>(initialRoute.tileFilter);
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<StudioFamilyId[]>([initialRoute.familyId]);
  const [selectedCollectionFilters, setSelectedCollectionFilters] = useState<CollectionFilter[]>(
    initialRoute.tileFilter === 'board' ? ['base', 'transitions', 'references'] : [initialRoute.tileFilter],
  );
  const [catalogQuery, setCatalogQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedPairId, setSelectedPairId] = useState<TerrainPairId>(initialRoute.selectedPairId);
  const [showFootprint, setShowFootprint] = useState(true);
  const [showBefore, setShowBefore] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [transitionViewMode, setTransitionViewMode] = useState<TransitionViewMode>(() => defaultTransitionViewModeForRoute(initialRoute));
  const transitionSampleSeed = 3117;
  const [boardMode, setBoardMode] = useState<'generated' | 'concept'>(initialRoute.boardMode);
  const [boardScope, setBoardScope] = useState<'family' | 'mixed'>(initialRoute.boardScope);
  const [boardSize, setBoardSize] = useState<'small' | 'wide'>(initialRoute.boardSize);
  const [boardSeed, setBoardSeed] = useState(initialRoute.boardSeed);
  const [animationPlaying, setAnimationPlaying] = useState(true);
  const [manualAnimationFrame, setManualAnimationFrame] = useState(0);
  // Unified editable board (temporary, in-memory only — re-seeds when a new view loads).
  const [tool, setTool] = useState<'select' | 'brush' | 'erase'>(initialRoute.brushKind === 'unit' ? 'brush' : 'select');
  const [brushKind, setBrushKind] = useState<'tile' | 'unit'>(initialRoute.brushKind);
  const [brushId, setBrushId] = useState<string>(initialRoute.selectedAssetId ?? '');
  const [unitBrushId, setUnitBrushId] = useState<string>(initialRoute.selectedUnitId ?? unitAssets[0].id);
  const [unitBrushDirection, setUnitBrushDirection] = useState<Direction>('south');
  const [unitBrushFaction] = useState<Faction>('blue');
  const [boardCells, setBoardCells] = useState<Record<string, string>>({});
  const [boardUnits, setBoardUnits] = useState<Record<string, BoardUnitPlacement>>({});
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  const [boardSectionOpen, setBoardSectionOpen] = useState(true);
  const [viewSectionOpen, setViewSectionOpen] = useState(true);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  const family = studioFamilies.find((item) => item.id === familyId) ?? studioFamilies[0];
  const collectionFilters: Array<[CollectionFilter, string]> = [
    ['base', 'Base'],
    ['transitions', 'Transitions'],
    ['references', 'References'],
  ];
  const selectedFamilies = studioFamilies.filter((item) => selectedFamilyIds.includes(item.id));
  const activeFamilies = selectedFamilies;
  const selectedFamilyLabel =
    activeFamilies.length === 0 ? 'No families' : activeFamilies.length === 1 ? activeFamilies[0].label : `${activeFamilies.length} families`;
  const selectedCollectionLabel =
    selectedCollectionFilters.length === 0
      ? 'No collections'
      : selectedCollectionFilters.map((filter) => collectionFilters.find(([id]) => id === filter)?.[1]).filter(Boolean).join(' + ');
  const [selectedAssetId, setSelectedAssetId] = useState(initialRoute.selectedAssetId ?? family.assets[0].id);
  const [selectedSlotMask, setSelectedSlotMask] = useState<number | undefined>(initialRoute.selectedSlotMask);
  const familyTransitionPairs = transitionPairsForFamily(family.id);
  const selectedPair = familyTransitionPairs.find((pair) => pair.id === selectedPairId) ?? familyTransitionPairs[0] ?? transitionPairs[0];
  const allStudioAssets = useMemo(() => [...studioFamilies.flatMap((item) => item.assets), ...transitionAssets], []);
  const selectedAsset = allStudioAssets.find((asset) => asset.id === selectedAssetId) ?? family.assets[0];
  const resolveStudioAsset = (id: string): StudioAsset | undefined => allStudioAssets.find((asset) => asset.id === id);
  const resolveUnitAsset = (id: string): UnitAsset | undefined => unitAssets.find((unit) => unit.id === id);
  const brushAsset = resolveStudioAsset(brushId) ?? selectedAsset;
  const unitBrushAsset = resolveUnitAsset(unitBrushId) ?? unitAssets[0];
  const paintCell = (x: number, y: number): void => {
    if (brushKind === 'unit') {
      setBoardUnits((prev) => ({
        ...prev,
        [`${x},${y}`]: {
          unitId: unitBrushAsset.id,
          direction: unitBrushDirection,
          faction: unitBrushFaction,
        },
      }));
      setLabMode('unit');
      return;
    }
    setBoardCells((prev) => ({ ...prev, [`${x},${y}`]: brushAsset.id }));
    setLabMode('tile');
  };
  const eraseCell = (x: number, y: number): void =>
    brushKind === 'unit'
      ? setBoardUnits((prev) => {
          const key = `${x},${y}`;
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        })
      :
    setBoardCells((prev) => {
      const key = `${x},${y}`;
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  const clearBoard = (): void => {
    setBoardCells({});
    setBoardUnits({});
    setSelectedCell(null);
    setLabMode('board');
  };
  const filteredTileAssets =
    tileFilter === 'base'
      ? family.assets.filter((asset) => asset.kind === 'tile')
      : tileFilter === 'transitions'
        ? transitionAssets.filter((asset) => asset.terrains?.includes(family.id))
        : tileFilter === 'references'
          ? family.assets.filter((asset) => asset.kind === 'reference')
          : [];
  const catalogBaseAssets = activeFamilies.flatMap((item) => item.assets.filter((asset) => asset.kind === 'tile'));
  const catalogReferenceAssets = activeFamilies.flatMap((item) => item.assets.filter((asset) => asset.kind === 'reference'));
  const catalogTransitionAssets = transitionAssets.filter((asset) => asset.terrains?.some((terrain) => selectedFamilyIds.includes(terrain)));
  const normalizedCatalogQuery = catalogQuery.trim().toLowerCase();
  const matchesCatalogQuery = (asset: StudioAsset): boolean => {
    if (!normalizedCatalogQuery) return true;
    return [asset.label, asset.role, asset.source, asset.notes, asset.pairId ?? '', ...(asset.terrains ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(normalizedCatalogQuery);
  };
  const visibleCatalogBaseAssets = catalogBaseAssets.filter(matchesCatalogQuery);
  const visibleCatalogReferenceAssets = catalogReferenceAssets.filter(matchesCatalogQuery);
  const visibleCatalogTransitionAssets = catalogTransitionAssets.filter(matchesCatalogQuery);
  const visibleCatalogCount =
    (selectedCollectionFilters.includes('base') ? visibleCatalogBaseAssets.length : 0) +
    (selectedCollectionFilters.includes('transitions') ? visibleCatalogTransitionAssets.length : 0) +
    (selectedCollectionFilters.includes('references') ? visibleCatalogReferenceAssets.length : 0);
  const generatedAssets =
    boardScope === 'family'
      ? activeFamilies
          .flatMap((item) => item.assets.filter((asset) => asset.kind === 'tile'))
          .concat(transitionAssets.filter((asset) => asset.terrains?.every((terrain) => selectedFamilyIds.includes(terrain))))
      : studioFamilies
          .flatMap((item) => item.assets)
          .filter((asset) => asset.kind === 'tile')
          .concat(transitionAssets);
  const generatedBoardSize = boardSize === 'small' ? { columns: 8, rows: 6 } : { columns: 10, rows: 7 };
  const generatedBoard = useMemo(
    () =>
      generateSocketBoard({
        assets: generatedAssets,
        seed: boardSeed,
        columns: generatedBoardSize.columns,
        rows: generatedBoardSize.rows,
        familyAssets: studioFamilyAssets,
      }),
    [boardSeed, generatedAssets, generatedBoardSize.columns, generatedBoardSize.rows],
  );
  const coverageReport = useMemo(() => buildTileCoverageReport(studioFamilyAssets, transitionAssets), []);
  const familyMissingTransitionSlots = coverageReport.missingTransitionSlots.filter((slot) => transitionPairById(slot.pairId).terrains.includes(family.id));
  const selectedTransitionSlot =
    selectedSlotMask && tileFilter === 'transitions'
      ? transitionSlotsForPair(selectedPair, transitionAssets).find((slot) => slot.mask === selectedSlotMask)
      : undefined;
  const selectedAssetPair = selectedAsset.pairId ? transitionPairById(selectedAsset.pairId) : undefined;
  const selectedAssetTransitionSlot =
    selectedAssetPair && selectedAsset.socketMask
      ? transitionSlotsForPair(selectedAssetPair, transitionAssets).find((slot) => slot.mask === selectedAsset.socketMask)
      : undefined;
  const viewTransitionSlot = selectedTransitionSlot ?? selectedAssetTransitionSlot;
  const viewTransitionPair = selectedTransitionSlot ? selectedPair : selectedAssetPair;
  const viewTransitionAsset = selectedTransitionSlot ? selectedTransitionSlot.assets[0] : selectedAssetTransitionSlot ? selectedAsset : undefined;
  const viewKind = tileFilter === 'board' ? 'board' : viewTransitionSlot ? 'transition' : 'tile';
  const viewVisualKind = viewKind === 'transition' && transitionViewMode === 'tile' ? 'tile' : viewKind;
  const inspectedAnimatedAsset =
    viewKind === 'transition' && viewTransitionAsset?.animation
      ? viewTransitionAsset
      : viewKind === 'tile' && selectedAsset.animation
        ? selectedAsset
        : undefined;
  const inspectedAnimation = inspectedAnimatedAsset?.animation;
  const animationFrameCount = inspectedAnimation?.frames.length ?? 8;
  const autoAnimationFrame = useAnimationClock(animationPlaying, animationFrameCount, inspectedAnimation?.frameMs ?? 150);
  const animationFrame = inspectedAnimation ? (animationPlaying ? autoAnimationFrame : manualAnimationFrame) : autoAnimationFrame;
  const focusedTileBoard = useMemo(() => boardForAsset(selectedAsset), [selectedAsset]);
  const focusedTransitionBoard = useMemo(
    () =>
      viewTransitionSlot
        ? transitionViewMode === 'tile' && viewTransitionAsset
          ? boardForAsset(viewTransitionAsset)
          : transitionViewMode === 'sample'
            ? boardForTransitionSample(viewTransitionPair, viewTransitionSlot, viewTransitionAsset, transitionSampleSeed)
            : boardForTransitionSlot(viewTransitionPair, viewTransitionSlot, viewTransitionAsset)
        : undefined,
    [transitionSampleSeed, transitionViewMode, viewTransitionAsset, viewTransitionPair, viewTransitionSlot],
  );
  const focusedViewBoard = viewKind === 'board' ? generatedBoard : viewKind === 'transition' && focusedTransitionBoard ? focusedTransitionBoard : focusedTileBoard;
  // The editable board grid: generated boards keep their own size; single tiles
  // and transitions get a default grid so you can paint around them.
  const editableGrid = viewKind === 'board' ? { columns: generatedBoardSize.columns, rows: generatedBoardSize.rows } : { columns: 8, rows: 6 };
  // Re-seed the editable board whenever the *loaded view* changes (a new tile,
  // transition, or a freshly generated board). Painting then mutates the seed.
  const boardSeedKey = `${viewKind}|${selectedAsset.id}|${selectedSlotMask ?? ''}|${boardMode}|${boardSeed}|${boardSize}|${boardScope}|${transitionViewMode}|${labMode}|${unitBrushAsset.id}`;
  const focusedViewBoardRef = useRef(focusedViewBoard);
  focusedViewBoardRef.current = focusedViewBoard;
  const editableGridRef = useRef(editableGrid);
  editableGridRef.current = editableGrid;
  useEffect(() => {
    const board = focusedViewBoardRef.current;
    const grid = editableGridRef.current;
    const placed = board.cells.filter((cell) => cell.asset);
    let offX = 0;
    let offY = 0;
    if (viewKind !== 'board' && placed.length) {
      const xs = placed.map((cell) => cell.x);
      const ys = placed.map((cell) => cell.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      offX = Math.floor((grid.columns - (maxX - minX + 1)) / 2) - minX;
      offY = Math.floor((grid.rows - (maxY - minY + 1)) / 2) - minY;
    }
    const seeded: Record<string, string> = {};
    for (const cell of placed) {
      if (cell.asset) seeded[`${cell.x + offX},${cell.y + offY}`] = cell.asset.id;
    }
    const seededUnits: Record<string, BoardUnitPlacement> = {};
    if (labMode === 'unit' && placed.length) {
      const xs = placed.map((cell) => cell.x + offX);
      const ys = placed.map((cell) => cell.y + offY);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const x = Math.round((minX + maxX) / 2);
      const y = Math.round((minY + maxY) / 2);
      seededUnits[`${x},${y}`] = {
        unitId: unitBrushAsset.id,
        direction: unitBrushDirection,
        faction: unitBrushFaction,
      };
    }
    setBoardCells(seeded);
    if (viewKind !== 'board' || labMode === 'unit') setBoardUnits(seededUnits);
    setSelectedCell(null);
    if (selectedAsset.kind === 'tile') setBrushId(selectedAsset.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardSeedKey]);
  // Select a tile, then "Fill cardinals" places the legal base tile of each edge
  // socket's family at N/E/S/W — recreating the old transition-proof view.
  const fillCardinals = (): void => {
    if (!selectedCell) return;
    const id = boardCells[`${selectedCell.x},${selectedCell.y}`];
    const asset = id ? resolveStudioAsset(id) : undefined;
    if (!asset) return;
    const sockets = socketsForAsset(asset);
    const { x, y } = selectedCell;
    const targets: Array<[number, number, StudioFamilyId]> = [
      [x, y - 1, sockets.north],
      [x + 1, y, sockets.east],
      [x, y + 1, sockets.south],
      [x - 1, y, sockets.west],
    ];
    setBoardCells((prev) => {
      const next = { ...prev };
      for (const [nx, ny, family] of targets) {
        const base = familyBaseAsset(family);
        if (base) next[`${nx},${ny}`] = base.id;
      }
      return next;
    });
  };
  // Fill the grid with the current brush — either only blank cells, or all cells.
  const fillBoard = (mode: 'empty' | 'all'): void => {
    setBoardCells((prev) => {
      const next: Record<string, string> = mode === 'all' ? {} : { ...prev };
      for (let y = 0; y < editableGrid.rows; y += 1) {
        for (let x = 0; x < editableGrid.columns; x += 1) {
          const key = `${x},${y}`;
          if (mode === 'all' || !(key in next)) next[key] = brushAsset.id;
        }
      }
      return next;
    });
  };
  const selectBoardCell = (x: number, y: number): void => {
    const key = `${x},${y}`;
    setSelectedCell({ x, y });
    if (boardUnits[key]) {
      setLabMode('unit');
      return;
    }
    if (boardCells[key]) {
      setLabMode('tile');
      return;
    }
    setLabMode('board');
  };
  const reviewItems: ReviewItem[] =
    tileFilter === 'board'
      ? Array.from(new Map(generatedBoard.cells.flatMap((cell) => (cell.asset ? [[cell.asset.id, cell.asset] as const] : []))).values()).map((asset) => ({ type: 'asset', asset }))
      : tileFilter === 'transitions'
        ? transitionSlotsForPair(selectedPair, transitionAssets).map((slot) =>
            slot.assets[0] ? ({ type: 'asset', asset: slot.assets[0] } as ReviewItem) : ({ type: 'slot', pair: selectedPair, slot } as ReviewItem),
          )
        : filteredTileAssets.map((asset) => ({ type: 'asset', asset }));
  const selectedReviewIndex = Math.max(
    0,
    reviewItems.findIndex((item) =>
      item.type === 'slot'
        ? selectedSlotMask === item.slot.mask && selectedPair.id === item.pair.id
        : !selectedSlotMask && item.asset.id === selectedAsset.id,
    ),
  );
  const selectedReviewPosition = reviewItems.length > 0 ? `${selectedReviewIndex + 1} of ${reviewItems.length}` : '0 of 0';

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('tileset-studio-active');
    return () => shell?.classList.remove('tileset-studio-active');
  }, []);

  useEffect(() => {
    const assetSources = allStudioAssets.flatMap((asset) => [asset.src, ...(asset.animation?.frames ?? [])]);
    const preloadedImages = Array.from(new Set(assetSources)).map((src) => {
      const image = new Image();
      image.decoding = 'sync';
      image.src = src;
      return image;
    });

    return () => {
      preloadedImages.forEach((image) => {
        image.src = '';
      });
    };
  }, [allStudioAssets]);

  useEffect(() => {
    const syncFromRoute = () => {
      const route = readTilesetStudioRoute();
      const routeFamily = studioFamilyById(route.familyId);
      setFamilyId(route.familyId);
      setSelectedFamilyIds([route.familyId]);
      setStudioMode(route.studioMode);
      setViewHasTarget(Boolean(route.selectedAssetId || route.selectedSlotMask || route.tileFilter === 'board'));
      setTileFilter(route.tileFilter);
      setLabMode(route.labMode);
      if (route.tileFilter !== 'board') setSelectedCollectionFilters([route.tileFilter]);
      setSelectedPairId(route.selectedPairId);
      setSelectedAssetId(route.selectedAssetId ?? routeFamily.assets[0].id);
      setSelectedSlotMask(route.selectedSlotMask);
      setTransitionViewMode(defaultTransitionViewModeForRoute(route));
      setBoardMode(route.boardMode);
      setBoardScope(route.boardScope);
      setBoardSize(route.boardSize);
      setBoardSeed(route.boardSeed);
      setBrushKind(route.brushKind);
      if (route.brushKind === 'unit') setTool('brush');
      if (route.selectedUnitId) setUnitBrushId(route.selectedUnitId);
    };

    window.addEventListener('popstate', syncFromRoute);
    return () => window.removeEventListener('popstate', syncFromRoute);
  }, []);

  useEffect(() => {
    if (!allStudioAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(family.assets[0].id);
      setSelectedSlotMask(undefined);
    }
  }, [allStudioAssets, family.assets, selectedAssetId]);

  useEffect(() => {
    if (!familyTransitionPairs.some((pair) => pair.id === selectedPairId)) {
      setSelectedPairId(familyTransitionPairs[0]?.id ?? 'grass-stone');
    }
  }, [familyTransitionPairs, selectedPairId]);

  useEffect(() => {
    const visibleAssets =
      tileFilter === 'base'
        ? [...family.assets.filter((asset) => asset.kind === 'tile'), ...transitionAssets.filter((asset) => asset.terrains?.includes(family.id))]
        : tileFilter === 'transitions'
          ? transitionAssets.filter((asset) => asset.pairId === selectedPair.id)
          : tileFilter === 'references'
            ? family.assets.filter((asset) => asset.kind === 'reference')
            : [];
    if (tileFilter !== 'board' && visibleAssets.length > 0) {
      setSelectedAssetId((currentAssetId) => (visibleAssets.some((asset) => asset.id === currentAssetId) ? currentAssetId : visibleAssets[0].id));
    }
  }, [family, selectedPair.id, tileFilter]);

  useEffect(() => {
    if (tileFilter !== 'transitions') {
      setSelectedSlotMask(undefined);
    }
  }, [tileFilter]);

  useEffect(() => {
    if (boardMode !== 'concept' && showBefore) {
      setShowBefore(false);
    }
  }, [boardMode, showBefore]);

  useEffect(() => {
    setManualAnimationFrame((frame) => frame % animationFrameCount);
  }, [animationFrameCount, inspectedAnimatedAsset?.id]);

  useEffect(() => {
    if (!filterOpen) return;

    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && filterDropdownRef.current?.contains(target)) return;
      setFilterOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filterOpen]);

  useEffect(() => {
    setViewPan({ x: 0, y: 0 });
    setViewZoom(defaultViewZoom(viewVisualKind));
  }, [boardMode, boardScope, boardSeed, boardSize, selectedAsset.id, selectedSlotMask, viewVisualKind]);

  useEffect(() => {
    writeTilesetStudioRoute({
      familyId,
      studioMode,
      labMode,
      tileFilter,
      selectedPairId,
      selectedAssetId: viewHasTarget ? selectedAsset.id : undefined,
      selectedSlotMask: viewHasTarget ? selectedSlotMask : undefined,
      boardMode,
      boardScope,
      boardSize,
      boardSeed,
      brushKind,
      selectedUnitId: unitBrushId,
    });
  }, [boardMode, boardScope, boardSeed, boardSize, brushKind, familyId, labMode, selectedAsset.id, selectedPairId, selectedSlotMask, studioMode, tileFilter, unitBrushId, viewHasTarget]);

  const zoomTilesWithWheel = (event: WheelEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setZoom((value) => clamp(Number((value + direction * 0.05).toFixed(2)), 0.75, 2));
  };

  const ignoreTileWheel = (event: WheelEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const toggleFamilyFilter = (nextFamilyId: StudioFamilyId) => {
    setSelectedFamilyIds((current) => {
      const next = current.includes(nextFamilyId) ? current.filter((item) => item !== nextFamilyId) : [...current, nextFamilyId];
      if (next.length > 0) {
        setFamilyId(next[0]);
      }
      if (next.length > 0 && !next.includes(familyId)) {
        const nextFamily = studioFamilyById(next[0]);
        setSelectedAssetId(familySample(nextFamily).id);
        setSelectedSlotMask(undefined);
      }
      return next;
    });
  };

  const toggleCollectionFilter = (collection: CollectionFilter) => {
    setSelectedCollectionFilters((current) => {
      const next = current.includes(collection) ? current.filter((item) => item !== collection) : [...current, collection];
      if (next.length > 0) {
        setTileFilter(next[0]);
      }
      return next;
    });
  };

  const openBoardLab = () => {
    setCategory('tiles');
    setLabMode('board');
    setTileFilter('board');
    setSelectedSlotMask(undefined);
    setViewHasTarget(true);
    setStudioMode('lab');
  };

  const inspectAsset = (asset: StudioAsset) => {
    setSelectedAssetId(asset.id);
    setSelectedSlotMask(undefined);
    if (asset.pairId) {
      setSelectedPairId(asset.pairId);
      setTileFilter('transitions');
      setTransitionViewMode('tile');
    } else if (asset.kind === 'reference') {
      setTileFilter('references');
    } else {
      setTileFilter('base');
    }
    setLabMode('tile');
    setViewHasTarget(true);
    setStudioMode('lab');
  };

  // Catalog paintbrush: arm a tile as the brush and drop onto the CURRENT board
  // without changing the loaded view (so the board isn't wiped/re-seeded).
  const armBrush = (asset: StudioAsset) => {
    if (asset.kind !== 'tile') return;
    setBrushId(asset.id);
    setBrushKind('tile');
    setTool('brush');
    setLabMode('board');
    setStudioMode('lab');
  };

  const inspectSlot = (pair: TransitionPair, slot: TransitionSlot<StudioAsset>) => {
    setSelectedPairId(pair.id);
    setSelectedSlotMask(slot.mask);
    setTileFilter('transitions');
    setTransitionViewMode(slot.assets[0] ? 'tile' : 'proof');
    setLabMode('tile');
    setViewHasTarget(true);
    setStudioMode('lab');
  };

  const selectOrInspectAsset = (asset: StudioAsset) => {
    inspectAsset(asset);
  };

  const selectOrInspectSlot = (pair: TransitionPair, slot: TransitionSlot<StudioAsset>) => {
    inspectSlot(pair, slot);
  };

  const viewCurrentSelection = () => {
    if (selectedTransitionSlot) {
      inspectSlot(selectedPair, selectedTransitionSlot);
      return;
    }
    inspectAsset(selectedAsset);
  };

  const selectReviewItem = (item: ReviewItem) => {
    if (item.type === 'slot') {
      setSelectedPairId(item.pair.id);
      setSelectedSlotMask(item.slot.mask);
    } else {
      setSelectedAssetId(item.asset.id);
      setSelectedSlotMask(undefined);
    }
    setViewHasTarget(true);
    setStudioMode('lab');
  };

  const moveReviewSelection = (direction: -1 | 1) => {
    if (reviewItems.length === 0) return;
    const currentIndex = selectedReviewIndex >= 0 ? selectedReviewIndex : 0;
    const nextIndex = (currentIndex + direction + reviewItems.length) % reviewItems.length;
    selectReviewItem(reviewItems[nextIndex]);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveReviewSelection(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveReviewSelection(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reviewItems, selectedReviewIndex]);

  const viewTitle =
    labMode === 'unit'
      ? unitBrushAsset.label
      : viewKind === 'board'
      ? 'Board View'
      : viewKind === 'transition'
        ? viewTransitionAsset?.label ?? `Missing ${viewTransitionPair?.label ?? 'Transition'} ${viewTransitionSlot?.label ?? ''}`
        : selectedAsset.label;
  const viewSubtitle =
    labMode === 'unit'
      ? `${unitBrushAsset.family} unit · ${selectedAsset.label} tile`
      : viewKind === 'board'
      ? `${boardScope === 'family' ? selectedFamilyLabel : 'Mixed terrain'} · seed ${boardSeed}`
      : viewKind === 'transition'
        ? `${viewTransitionPair?.label ?? 'Transition'} · mask ${viewTransitionSlot?.code ?? selectedAsset.socketMask ?? ''}`
        : `${family.label} · ${selectedAsset.role}`;
  const hasLabTiles = Object.keys(boardCells).length > 0;
  const hasLabUnits = Object.keys(boardUnits).length > 0;
  const headerKicker = studioMode === 'catalog' ? (category === 'units' ? 'Unit Catalog' : 'Tile Catalog') : 'Lab';
  const headerTitle =
    studioMode === 'catalog'
      ? category === 'units'
        ? 'Units'
        : selectedFamilyLabel
      : labMode === 'board'
        ? 'Board Lab'
        : labMode === 'unit'
          ? 'Unit Lab'
          : 'Tile Lab';
  const headerSubtitle =
    studioMode === 'catalog'
      ? category === 'units'
        ? 'Browse chess-piece units.'
        : activeFamilies.map((item) => item.purpose).join(' · ')
      : labMode === 'board'
        ? 'Edit and test tiles and units on one shared board surface.'
        : labMode === 'unit'
          ? 'Inspect the selected unit in board context.'
          : 'Inspect the selected tile in board context.';
  const openCatalogMode = (): void => {
    if (tileFilter === 'board') setTileFilter('base');
    setStudioMode('catalog');
  };
  const openLabMode = (): void => {
    if (!viewHasTarget) {
      openBoardLab();
      return;
    }
    setStudioMode('lab');
  };
  const openTileLab = (): void => {
    if (!hasLabTiles) return;
    setLabMode('tile');
    setStudioMode('lab');
  };
  const openUnitLab = (): void => {
    if (!hasLabUnits) return;
    setLabMode('unit');
    setBrushKind('unit');
    setStudioMode('lab');
  };

  return (
    <main className="tileset-studio-page">
      <header className="tileset-studio-header">
        <div className="tileset-studio-brand">
          <div className="tileset-studio-product">
            <strong>Chess Tactics</strong>
            <span>Tactical chess, infinite possibilities.</span>
          </div>
          <div className="tileset-studio-titleblock">
            <p className="tileset-studio-kicker">{headerKicker}</p>
            <h1>{headerTitle}</h1>
            <p className="tileset-studio-subtitle">{headerSubtitle}</p>
          </div>
        </div>
        <nav className="tileset-studio-actions" aria-label="Tileset studio navigation">
          <span className="tileset-mode-tabs" aria-label="Workspace mode">
            <button type="button" className={studioMode === 'catalog' ? 'is-active' : ''} onClick={openCatalogMode} title="Browse asset catalogs.">
              Catalog
            </button>
            <button type="button" className={studioMode === 'lab' ? 'is-active' : ''} onClick={openLabMode} title="Open the shared board lab.">
              Lab
            </button>
          </span>
          <span className="tileset-mode-tabs" aria-label="Catalog type">
            <button
              type="button"
              className={studioMode === 'catalog' && category === 'tiles' ? 'is-active' : ''}
              onClick={() => {
                setCategory('tiles');
                openCatalogMode();
              }}
              title="Browse terrain tiles."
            >
              Tiles
            </button>
            <button
              type="button"
              className={studioMode === 'catalog' && category === 'units' ? 'is-active' : ''}
              onClick={() => {
                setCategory('units');
                openCatalogMode();
              }}
              title="Browse chess-piece units."
            >
              Units
            </button>
          </span>
          <span className="tileset-mode-tabs" aria-label="Lab context">
            <button type="button" className={studioMode === 'lab' && labMode === 'board' ? 'is-active' : ''} onClick={openBoardLab} title="Inspect the whole board.">
              Board
            </button>
            <button
              type="button"
              className={studioMode === 'lab' && labMode === 'tile' ? 'is-active' : ''}
              onClick={openTileLab}
              disabled={!hasLabTiles}
              title={hasLabTiles ? 'Inspect the selected tile.' : 'Place or select a tile first.'}
            >
              Tile
            </button>
            <button
              type="button"
              className={studioMode === 'lab' && labMode === 'unit' ? 'is-active' : ''}
              onClick={openUnitLab}
              disabled={!hasLabUnits}
              title={hasLabUnits ? 'Inspect the selected unit.' : 'Place or select a unit first.'}
            >
              Unit
            </button>
          </span>
          <a href="/settings">Settings</a>
        </nav>
      </header>

      <section className={`tileset-studio-shell is-${studioMode} ${category === 'units' ? 'is-units' : ''}`} aria-label="Tileset browser">
        {category === 'units' ? (
          <UnitsStudio studioMode={studioMode} onInspect={() => setStudioMode('lab')} onBack={() => setStudioMode('catalog')} />
        ) : studioMode === 'catalog' ? (
        <section className="tileset-studio-main">
          <div className="tileset-studio-toolbar">
            <div className="tileset-studio-title-row">
              <div className="tileset-catalog-heading">
                <h2>{selectedFamilyLabel} Tileset</h2>
                <p className="tileset-filter-summary">
                  {visibleCatalogCount} assets · {selectedCollectionLabel}
                </p>
              </div>
              <label className="tileset-catalog-search">
                <span>Search</span>
                <input
                  type="search"
                  value={catalogQuery}
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  placeholder="label, source, socket..."
                />
              </label>
              <label className="tileset-catalog-zoom">
                <span>Zoom</span>
                <input
                  type="range"
                  min="0.75"
                  max="2"
                  step="0.05"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </label>
              <div className="tileset-active-filters" aria-label="Active filters">
                {activeFamilies.map((item) => (
                  <button key={item.id} type="button" onClick={() => toggleFamilyFilter(item.id)} title={`Remove ${item.label} filter`}>
                    {item.label}
                  </button>
                ))}
                {selectedCollectionFilters.map((filter) => (
                  <button key={filter} type="button" onClick={() => toggleCollectionFilter(filter)} title={`Remove ${filter} filter`}>
                    {collectionFilters.find(([id]) => id === filter)?.[1] ?? filter}
                  </button>
                ))}
              </div>
              <div className="tileset-filter-dropdown" ref={filterDropdownRef}>
                <button
                  type="button"
                  className={filterOpen ? 'is-active' : ''}
                  onClick={() => setFilterOpen((value) => !value)}
                  aria-expanded={filterOpen}
                  aria-controls="tileset-filter-menu"
                >
                  Filters
                </button>
                {filterOpen ? (
                  <div id="tileset-filter-menu" className="tileset-filter-menu" role="dialog" aria-label="Tileset filters">
                    <div className="tileset-filter-menu-header">
                      <strong>Filters</strong>
                      <span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFamilyIds(studioFamilies.map((item) => item.id));
                            setSelectedCollectionFilters(collectionFilters.map(([filter]) => filter));
                          }}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFamilyIds([]);
                            setSelectedCollectionFilters([]);
                          }}
                        >
                          Clear
                        </button>
                      </span>
                    </div>
                    <section className="tileset-filter-group" aria-label="Tile families">
                      <h3>Tile Family</h3>
                      {studioFamilies.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`tileset-filter-option${selectedFamilyIds.includes(item.id) ? ' is-active' : ''}`}
                          aria-pressed={selectedFamilyIds.includes(item.id)}
                          onClick={() => toggleFamilyFilter(item.id)}
                        >
                          <span className="tileset-filter-mark" aria-hidden="true" />
                          <span className="tileset-filter-option-copy">
                            <strong>{item.label}</strong>
                            <span>{familyCounts(item)}</span>
                          </span>
                        </button>
                      ))}
                    </section>
                    <section className="tileset-filter-group" aria-label="Collections">
                      <h3>Collection</h3>
                      {collectionFilters.map(([filter, label]) => (
                        <button
                          key={filter}
                          type="button"
                          className={`tileset-filter-option${selectedCollectionFilters.includes(filter) ? ' is-active' : ''}`}
                          aria-pressed={selectedCollectionFilters.includes(filter)}
                          onClick={() => toggleCollectionFilter(filter)}
                        >
                          <span className="tileset-filter-mark" aria-hidden="true" />
                          <span className="tileset-filter-option-copy">
                            <strong>{label}</strong>
                            <span>{filter === 'base' ? 'terrain variants' : filter === 'transitions' ? 'edge socket tiles' : 'footprint guides'}</span>
                          </span>
                        </button>
                      ))}
                    </section>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="tileset-view-action"
                onClick={viewCurrentSelection}
              >
                View Selected
              </button>
            </div>
          </div>

          <section className="tileset-studio-tab-panel is-tiles" aria-label={`${selectedFamilyLabel} tiles`}>
              <div className="tileset-asset-sections">
                {selectedCollectionFilters.includes('base') ? (
                  <section className="tileset-asset-section" aria-label="Base tiles">
                    <h3>Base Tiles</h3>
                    <div className="tileset-studio-grid" aria-label="Base assets">
                      {visibleCatalogBaseAssets.map((asset) => (
                        <StudioTileCard
                          key={asset.id}
                          asset={asset}
                          selected={!selectedSlotMask && asset.id === selectedAsset.id}
                          showFootprint={showFootprint}
                          zoom={zoom}
                          animationFrame={animationFrame}
                          onSelect={() => inspectAsset(asset)}
                          onInspect={() => inspectAsset(asset)}
                          onArmBrush={asset.kind === 'tile' ? () => armBrush(asset) : undefined}
                          onOpenBoard={() => inspectAsset(asset)}
                          onWheel={ignoreTileWheel}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
                {selectedCollectionFilters.includes('transitions') ? (
                  <section className="tileset-asset-section" aria-label="Transition tiles">
                    <h3>Transition Tiles</h3>
                    <div className="tileset-studio-grid" aria-label="Transition assets">
                      {visibleCatalogTransitionAssets.map((asset) => (
                        <StudioTileCard
                          key={asset.id}
                          asset={asset}
                          selected={!selectedSlotMask && asset.id === selectedAsset.id}
                          showFootprint={showFootprint}
                          zoom={zoom}
                          animationFrame={animationFrame}
                          onSelect={() => inspectAsset(asset)}
                          onInspect={() => inspectAsset(asset)}
                          onArmBrush={asset.kind === 'tile' ? () => armBrush(asset) : undefined}
                          onOpenBoard={() => inspectAsset(asset)}
                          onWheel={ignoreTileWheel}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
                {selectedCollectionFilters.includes('references') ? (
                  <section className="tileset-asset-section" aria-label="Reference tiles">
                    <h3>References</h3>
                    <div className="tileset-studio-grid" aria-label="Reference assets">
                      {visibleCatalogReferenceAssets.map((asset) => (
                        <StudioTileCard
                          key={asset.id}
                          asset={asset}
                          selected={!selectedSlotMask && asset.id === selectedAsset.id}
                          showFootprint={showFootprint}
                          zoom={zoom}
                          animationFrame={animationFrame}
                          onSelect={() => inspectAsset(asset)}
                          onInspect={() => inspectAsset(asset)}
                          onOpenBoard={() => inspectAsset(asset)}
                          onWheel={zoomTilesWithWheel}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </section>
        </section>
        ) : (
          <section className="tileset-view-mode" aria-label="Focused tileset view">
            <div className="tileset-view-header">
              <button type="button" onClick={() => setStudioMode('catalog')}>
                Back to Catalog
              </button>
              <div>
                <p className="tileset-studio-kicker">{labMode === 'unit' ? 'Unit' : viewKind === 'board' ? 'Board' : viewKind === 'transition' && transitionViewMode !== 'tile' ? 'Transition Showcase' : 'Tile'}</p>
                <h2>{viewTitle}</h2>
                <p>{viewSubtitle}</p>
              </div>
            </div>

            {!viewHasTarget ? (
              <section className="tileset-view-empty" aria-label="Empty focused view">
                <h2>Choose an element from the catalog to inspect</h2>
                <p>Select a tile, transition, or board setup in Catalog, then send it here for zoomed visual review.</p>
                <button type="button" onClick={() => setStudioMode('catalog')}>
                  Back to Catalog
                </button>
              </section>
            ) : (
              <>
            <ViewPane
              kind={viewVisualKind}
              ariaLabel={`${viewTitle} visual inspection`}
              zoom={viewZoom}
              pan={viewPan}
              minZoom={0.55}
              maxZoom={2.2}
              onZoomChange={setViewZoom}
              onPanChange={setViewPan}
              onAssetClick={(assetId) => {
                const asset = allStudioAssets.find((item) => item.id === assetId);
                if (asset) inspectAsset(asset);
              }}
            >
              <div className={`tileset-view-board-content is-${viewVisualKind}`}>
                {viewKind === 'board' && boardMode === 'concept' ? (
                  <div
                    className="tileset-concept-board-zoom"
                    style={{ '--board-zoom': viewZoom, '--board-pan-x': `${viewPan.x}px`, '--board-pan-y': `${viewPan.y}px` } as CSSProperties}
                  >
                    <ConceptBoardReconstruction mode={showBefore ? 'before' : 'after'} />
                  </div>
                ) : (
                  <StudioEditableBoard
                    cols={editableGrid.columns}
                    rows={editableGrid.rows}
                    cells={boardCells}
                    units={boardUnits}
                    resolveAsset={resolveStudioAsset}
                    resolveUnit={resolveUnitAsset}
                    tool={tool}
                    selectedCell={selectedCell}
                    showFootprint={showFootprint}
                    boardZoom={viewZoom}
                    boardPan={viewPan}
                    animationFrame={animationFrame}
                    onPaint={paintCell}
                    onErase={eraseCell}
                    onSelect={selectBoardCell}
                  />
                )}
              </div>
            </ViewPane>

            <aside className="tileset-view-controls" aria-label="View controls">
              <section className="tileset-inspector-section">
                <h2>Controls</h2>
                <div className="tileset-control-stack">
                  {!(viewKind === 'board' && boardMode === 'concept') ? (
                    <>
                      <div className="tileset-segmented-control tileset-tools" aria-label="Board tool">
                        <button type="button" className={tool === 'select' ? 'is-active' : ''} onClick={() => setTool('select')} title="Select tool — click a tile to highlight it (then fill its neighbors). Doesn't paint or erase.">
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 2 L3 13 L6 10 L8 14.6 L9.8 13.8 L7.8 9.4 L12.5 9.4 Z" fill="currentColor" /></svg>
                          Select
                        </button>
                        <button type="button" className={tool === 'brush' ? 'is-active' : ''} onClick={() => setTool('brush')} title="Brush tool — click or drag to stamp the current brush tile.">
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13.4 2.6 L7.4 8.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M7.6 8.2 C5.8 7.8 4.3 8.6 3.9 10.1 C3.6 11.2 3 11.7 2.3 11.9 C3.4 13.4 6 13.9 7.6 12.3 C8.6 11.3 8.6 9.4 7.6 8.2 Z" fill="currentColor" /></svg>
                          Brush
                        </button>
                        <button type="button" className={tool === 'erase' ? 'is-active' : ''} onClick={() => setTool('erase')} title="Erase tool — click or drag to remove tiles. (Right-click removes with any tool.)">
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2.6" y="7.6" width="9.4" height="5" rx="1.2" transform="rotate(-40 7.3 10.1)" fill="none" stroke="currentColor" strokeWidth="1.5" /><line x1="6" y1="13.6" x2="13.6" y2="13.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          Erase
                        </button>
                      </div>

                      <p className="tileset-group-label">Brush</p>
                      <div className="tileset-segmented-control" aria-label="Placeable brush type">
                        <button type="button" className={brushKind === 'tile' ? 'is-active' : ''} onClick={() => setBrushKind('tile')} title="Paint terrain tiles.">
                          Tile
                        </button>
                        <button type="button" className={brushKind === 'unit' ? 'is-active' : ''} onClick={() => setBrushKind('unit')} title="Place chess units on top of tiles.">
                          Unit
                        </button>
                      </div>
                      <button
                        type="button"
                        className="tileset-brush-display"
                        onClick={() => (brushKind === 'unit' ? navigateApp(`/unit-studio?unit=${unitBrushAsset.id}&mode=catalog`) : setStudioMode('catalog'))}
                        title={brushKind === 'unit' ? 'Pick a different unit from the unit catalog' : 'Pick a different tile from the tile catalog'}
                        aria-label={`Active brush: ${brushKind === 'unit' ? unitBrushAsset.label : brushAsset.label}. Pick a different ${brushKind}.`}
                      >
                        <img src={brushKind === 'unit' ? unitBrushAsset.preview : brushAsset.src} alt="" draggable={false} />
                        <span className="tileset-brush-label">{brushKind === 'unit' ? unitBrushAsset.label : brushAsset.label}</span>
                        <span className="tileset-brush-change">Pick in catalog ›</span>
                      </button>
                      {brushKind === 'unit' ? (
                        <div className="tileset-segmented-control tileset-unit-facing" aria-label="Unit facing">
                          {(['south', 'east', 'north', 'west'] as Direction[]).map((dir) => (
                            <button
                              key={dir}
                              type="button"
                              className={unitBrushDirection === dir ? 'is-active' : ''}
                              onClick={() => setUnitBrushDirection(dir)}
                              title={`Face ${dir}`}
                            >
                              {dir[0].toUpperCase()}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {brushKind === 'tile' ? (
                        <>
                          <p className="tileset-group-label">Fill</p>
                          {tool === 'select' && selectedCell && boardCells[`${selectedCell.x},${selectedCell.y}`] ? (
                            <button type="button" className="tileset-wide-action" onClick={fillCardinals} title="Place the matching base tile of each edge's family around the selected tile (N/E/S/W).">
                              Fill cardinal neighbors
                            </button>
                          ) : null}
                          <div className="tileset-button-row">
                            <button type="button" onClick={() => fillBoard('empty')} title="Fill every blank cell with the current brush.">Empty</button>
                            <button type="button" onClick={() => fillBoard('all')} title="Fill the whole board with the current brush (overwrites everything).">Whole</button>
                            <button type="button" className="tileset-action-danger" onClick={clearBoard} disabled={Object.keys(boardCells).length === 0 && Object.keys(boardUnits).length === 0} title="Remove every tile and unit from the board.">
                              Clear
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="tileset-button-row">
                          <button type="button" className="tileset-action-danger" onClick={clearBoard} disabled={Object.keys(boardCells).length === 0 && Object.keys(boardUnits).length === 0} title="Remove every tile and unit from the board.">
                            Clear board
                          </button>
                        </div>
                      )}
                    </>
                  ) : null}

                  {viewKind === 'board' ? (
                    <>
                      <button type="button" className="tileset-group-label is-collapsible" aria-expanded={boardSectionOpen} onClick={() => setBoardSectionOpen((value) => !value)} title={boardSectionOpen ? 'Collapse the Board section' : 'Expand the Board section'}>
                        <span>Board</span>
                        <span className="tileset-group-rule" aria-hidden="true" />
                        <svg className="tileset-group-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6 L8 10 L12 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      {boardSectionOpen ? (
                        <>
                          <div className="tileset-segmented-control" aria-label="Board source">
                            <button type="button" className={boardMode === 'generated' ? 'is-active' : ''} onClick={() => setBoardMode('generated')} title="Show a procedurally generated, socket-legal board you can paint on.">
                              Generated
                            </button>
                            <button type="button" className={boardMode === 'concept' ? 'is-active' : ''} onClick={() => setBoardMode('concept')} title="Show the fixed concept-art reference board (with before/after comparison).">
                              Concept
                            </button>
                          </div>
                          {boardMode === 'generated' ? (
                            <>
                              <div className="tileset-segmented-control" aria-label="Terrain scope">
                                <button type="button" className={boardScope === 'family' ? 'is-active' : ''} onClick={() => setBoardScope('family')} title="Generate using only the current family's tiles.">
                                  Family
                                </button>
                                <button type="button" className={boardScope === 'mixed' ? 'is-active' : ''} onClick={() => setBoardScope('mixed')} title="Generate using all terrain families mixed together.">
                                  Mixed
                                </button>
                              </div>
                              <div className="tileset-button-row">
                                <button type="button" onClick={() => setBoardSeed(Math.floor(Math.random() * 999999) + 1)} title="Generate a fresh random board (new seed).">
                                  New random
                                </button>
                                <button type="button" onClick={() => setBoardSize((size) => (size === 'small' ? 'wide' : 'small'))} title="Toggle board size (8×6 ↔ 10×7).">
                                  {boardSize === 'small' ? '8 × 6' : '10 × 7'}
                                </button>
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={`tileset-toggle ${showBefore ? 'is-on' : ''}`}
                              aria-pressed={showBefore}
                              onClick={() => setShowBefore((value) => !value)}
                              title="Toggle the concept board before/after view."
                            >
                              <span>Before / after</span>
                              <span className="tileset-toggle-pill" aria-hidden="true" />
                            </button>
                          )}
                        </>
                      ) : null}
                    </>
                  ) : null}

                  <button type="button" className="tileset-group-label is-collapsible" aria-expanded={viewSectionOpen} onClick={() => setViewSectionOpen((value) => !value)} title={viewSectionOpen ? 'Collapse the View section' : 'Expand the View section'}>
                    <span>View</span>
                    <span className="tileset-group-rule" aria-hidden="true" />
                    <svg className="tileset-group-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6 L8 10 L12 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {viewSectionOpen ? (
                    <>
                  <div className="tileset-button-row">
                    <button
                      type="button"
                      className={`tileset-toggle ${showFootprint ? 'is-on' : ''}`}
                      aria-pressed={showFootprint}
                      onClick={() => setShowFootprint((value) => !value)}
                      title="Overlay the canonical tile-footprint diamond on each tile to check that the art lines up with the locked geometry."
                    >
                      <span>Footprint</span>
                      <span className="tileset-toggle-pill" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setViewPan({ x: 0, y: 0 })} title="Recenter the board in the viewport.">
                      Center
                    </button>
                  </div>
                  {inspectedAnimation ? (
                    <div className="tileset-animation-controls" aria-label={`${inspectedAnimation.label} frame controls`}>
                      <h3>Animation</h3>
                      <div className="tileset-animation-control-row">
                        <button
                          type="button"
                          title={animationPlaying ? 'Pause the animation preview.' : 'Play the animation preview.'}
                          onClick={() => {
                            if (animationPlaying) setManualAnimationFrame(animationFrame);
                            setAnimationPlaying((value) => !value);
                          }}
                        >
                          {animationPlaying ? 'Pause' : 'Play'}
                        </button>
                        <button
                          type="button"
                          title="Step to the previous animation frame."
                          onClick={() => {
                            setAnimationPlaying(false);
                            setManualAnimationFrame((animationFrame - 1 + animationFrameCount) % animationFrameCount);
                          }}
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          title="Step to the next animation frame."
                          onClick={() => {
                            setAnimationPlaying(false);
                            setManualAnimationFrame((animationFrame + 1) % animationFrameCount);
                          }}
                        >
                          Next
                        </button>
                      </div>
                      <label>
                        Frame {animationFrame + 1} / {animationFrameCount}
                        <input
                          type="range"
                          min="0"
                          max={animationFrameCount - 1}
                          step="1"
                          value={animationFrame}
                          onChange={(event) => {
                            setAnimationPlaying(false);
                            setManualAnimationFrame(Number(event.target.value));
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                  <label>
                    View Zoom
                    <input
                      type="range"
                      min="0.55"
                      max="2.2"
                      step="0.05"
                      value={viewZoom}
                      onChange={(event) => setViewZoom(Number(event.target.value))}
                    />
                  </label>
                    </>
                  ) : null}
                  <p className="tileset-control-footnote">Board edits are temporary — not saved.</p>
                </div>
              </section>

              <section className="tileset-inspector-section" aria-label="Selected item details">
                <h2>Details</h2>
                {labMode === 'unit' ? (
                  <dl>
                    <InspectorRow label="Unit">{unitBrushAsset.label}</InspectorRow>
                    <InspectorRow label="Piece">{unitBrushAsset.family}</InspectorRow>
                    <InspectorRow label="Status">{unitBrushAsset.status}</InspectorRow>
                    <InspectorRow label="Footprint">{unitBrushAsset.footprint.shape}</InspectorRow>
                    <InspectorRow label="Ground">{selectedAsset.label}</InspectorRow>
                  </dl>
                ) : viewTransitionSlot ? (
                  <dl>
                    <InspectorRow label="Tile Type">{viewTransitionAsset ? 'Transition tile' : 'Missing art'}</InspectorRow>
                    {viewTransitionAsset ? (
                      <>
                        <InspectorRow label="Source">{viewTransitionAsset.source}</InspectorRow>
                        <InspectorRow label="Projection">
                          {viewTransitionAsset.source === TRUE_ISO_TILE_SOURCE ? 'true-iso locked' : 'review required'}
                        </InspectorRow>
                      </>
                    ) : null}
                    {viewTransitionAsset?.animation ? (
                      <InspectorRow label="Animation">{`${viewTransitionAsset.animation.label} · ${viewTransitionAsset.animation.status}`}</InspectorRow>
                    ) : null}
                    <InspectorRow label="Pair">{viewTransitionPair?.label ?? 'Transition'}</InspectorRow>
                    <InspectorRow label="Mask">{viewTransitionSlot.code}</InspectorRow>
                    {socketEdges.map((edge) => (
                      <InspectorRow key={edge} label={`${edge[0].toUpperCase()}${edge.slice(1)}`}>
                        {terrainLabels[viewTransitionSlot.sockets[edge]]}
                      </InspectorRow>
                    ))}
                  </dl>
                ) : (
                  <dl>
                    <EdgeLedger asset={selectedAsset} />
                    {selectedAsset.animation ? (
                      <InspectorRow label="Animation">{`${selectedAsset.animation.label} · ${selectedAsset.animation.status}`}</InspectorRow>
                    ) : null}
                    <InspectorRow label="Fill Weight">
                      {selectedAsset.probability === 0 ? 'not random-filled' : selectedAsset.probability.toFixed(2)}
                    </InspectorRow>
                  </dl>
                )}
                <p>{labMode === 'unit' ? unitBrushAsset.read : viewTransitionSlot ? viewTransitionAsset?.notes ?? 'This transition slot is required but has no production tile assigned yet.' : selectedAsset.notes}</p>
              </section>
            </aside>
              </>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

export function TilesetCandidateReview(): ReactElement {
  const animationFrame = useAnimationFrameIndex();
  const queueItems = useMemo(
    (): ReviewQueueItem[] => {
      const candidateItems: ReviewQueueItem[] = candidateBatches.flatMap((batch) =>
        batch.assets.map((asset, assetIndex) => ({
          type: 'candidate' as const,
          id: asset.id,
          asset,
          assetIndex,
          batch,
          family: studioFamilyById(batch.familyId),
        })),
      );
      const transitionWorkItems: ReviewQueueItem[] = transitionPairs.flatMap((pair) =>
        transitionSlotsForPair(pair, transitionAssets)
          .filter((slot) => slot.assets.length === 0)
          .map((slot) => ({
            type: 'transition-work' as const,
            id: `transition-work-${pair.id}-${slot.code}`,
            pair,
            slot,
            family: studioFamilyById(pair.terrains[0]),
          })),
      );
      return [...candidateItems, ...transitionWorkItems];
    },
    [],
  );
  const [selectedQueueId, setSelectedQueueId] = useState(queueItems[0]?.id ?? '');
  const [decisions, setDecisions] = useState<Record<string, CandidateReviewDecision>>(() => {
    try {
      const saved = window.localStorage.getItem(CANDIDATE_REVIEW_KEY);
      return saved ? JSON.parse(saved) as Record<string, CandidateReviewDecision> : {};
    } catch {
      return {};
    }
  });
  const [reviewStage, setReviewStage] = useState<CandidateReviewStage>('tile');
  const [reviewBoardZoom, setReviewBoardZoom] = useState(0.78);
  const [reviewBoardPan, setReviewBoardPan] = useState({ x: 0, y: 0 });
  const reviewBoardDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; assetId?: string } | null>(null);
  const reviewBoardDidDragRef = useRef(false);
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('tileset-studio-active');
    return () => shell?.classList.remove('tileset-studio-active');
  }, []);

  if (queueItems.length === 0) {
    return (
      <main className="tileset-studio-page tileset-candidate-page">
        <header className="tileset-studio-header">
          <div className="tileset-studio-brand">
            <div className="tileset-studio-product">
              <strong>Chess Tactics</strong>
              <span>Tactical chess, infinite possibilities.</span>
            </div>
            <div className="tileset-studio-titleblock">
              <p className="tileset-studio-kicker">Review Queue</p>
              <h1>Queue Clear</h1>
              <p className="tileset-studio-subtitle">All reviewed assets have been promoted into the catalog.</p>
            </div>
          </div>
          <nav className="tileset-studio-actions" aria-label="Candidate review navigation">
            <a href="/tileset-studio">Catalog</a>
            <a href="/settings">Settings</a>
          </nav>
        </header>
        <section className="tileset-empty-review" aria-label="Empty review queue">
          <h2>No queued assets</h2>
          <p>The approved refresh tiles are now part of the accepted tileset catalog.</p>
          <a href="/tileset-studio">Open Tileset Studio</a>
        </section>
      </main>
    );
  }

  const selectedQueueItem = queueItems.find((item) => item.id === selectedQueueId) ?? queueItems[0];
  const selectedAsset = selectedQueueItem.type === 'candidate' ? selectedQueueItem.asset : undefined;
  const selectedWorkSlot = selectedQueueItem.type === 'transition-work' ? selectedQueueItem.slot : undefined;
  const selectedPair = selectedQueueItem.type === 'transition-work' ? selectedQueueItem.pair : undefined;
  const family = selectedQueueItem.family;
  const reviewTitle = selectedAsset?.label ?? `Missing ${selectedPair?.label ?? 'Transition'} ${selectedWorkSlot?.label ?? ''}`;
  const reviewSubtitle =
    selectedQueueItem.type === 'candidate'
      ? selectedQueueItem.batch.label
      : `${selectedPair?.label ?? 'Transition'} work order · mask ${selectedWorkSlot?.code ?? ''}`;
  const reviewDescription =
    selectedQueueItem.type === 'candidate'
      ? selectedQueueItem.asset.notes
      : 'This socket contract is required by the transition system but has no production tile assigned yet.';
  const acceptedAssets = family.assets.filter((asset) => asset.kind === 'tile');
  const selectedDecision = decisions[selectedQueueItem.id] ?? 'pending';
  const pendingCount = queueItems.filter((item) => (decisions[item.id] ?? 'pending') === 'pending').length;
  const reviewedCount = queueItems.length - pendingCount;
  const boardProofAssets =
    selectedQueueItem.type === 'candidate'
      ? [selectedQueueItem.asset]
      : studioFamilies
          .flatMap((item) => item.assets)
          .filter((asset) => asset.kind === 'tile')
          .concat(transitionAssets);
  const candidateBoard = useMemo(
    () => {
      const candidateFamilyAssets: Record<StudioFamilyId, readonly StudioAsset[]> = {
        ...studioFamilyAssets,
      };
      return (
      generateSocketBoard({
        assets: boardProofAssets,
        seed: 7103,
        columns: 7,
        rows: 5,
        familyAssets: candidateFamilyAssets,
      })
      );
    },
    [boardProofAssets],
  );

  const setDecision = (candidateId: string, decision: CandidateReviewDecision) => {
    setDecisions((current) => {
      const next = { ...current };
      if (decision === 'pending') {
        delete next[candidateId];
      } else {
        next[candidateId] = decision;
      }
      try {
        window.localStorage.setItem(CANDIDATE_REVIEW_KEY, JSON.stringify(next));
      } catch {
        // Local storage is a convenience for iteration, not critical app state.
      }
      return next;
    });
  };

  const selectedIndex = queueItems.findIndex((item) => item.id === selectedQueueItem.id);
  const goToOffset = (offset: number) => {
    const nextIndex = Math.min(queueItems.length - 1, Math.max(0, selectedIndex + offset));
    setSelectedQueueId(queueItems[nextIndex].id);
  };

  const startReviewBoardPan = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const tileElement = (event.target as HTMLElement).closest<HTMLElement>('.tileset-generated-board-tile');
    reviewBoardDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: reviewBoardPan.x,
      originY: reviewBoardPan.y,
      assetId: tileElement?.dataset.assetId,
    };
    reviewBoardDidDragRef.current = false;
  };

  const moveReviewBoardPan = (event: PointerEvent<HTMLDivElement>) => {
    const drag = reviewBoardDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
      reviewBoardDidDragRef.current = true;
    }
    setReviewBoardPan({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  };

  const endReviewBoardPan = (event: PointerEvent<HTMLDivElement>) => {
    const drag = reviewBoardDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    reviewBoardDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!reviewBoardDidDragRef.current && drag.assetId) {
      const queueItem = queueItems.find((item) => item.type === 'candidate' && item.asset.id === drag.assetId);
      if (queueItem) setSelectedQueueId(queueItem.id);
    }
  };

  const zoomReviewBoardWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setReviewBoardZoom((value) => clamp(Number((value + direction * 0.05).toFixed(2)), 0.55, 1.35));
  };

  return (
    <main className="tileset-studio-page tileset-candidate-page">
      <header className="tileset-studio-header">
        <div className="tileset-studio-brand">
          <div className="tileset-studio-product">
            <strong>Chess Tactics</strong>
            <span>Tactical chess, infinite possibilities.</span>
          </div>
          <div className="tileset-studio-titleblock">
            <p className="tileset-studio-kicker">Review Queue</p>
            <h1>{reviewTitle}</h1>
            <p className="tileset-studio-subtitle">{pendingCount} pending · {reviewedCount} reviewed · {queueItems.length} total</p>
          </div>
        </div>
        <nav className="tileset-studio-actions" aria-label="Candidate review navigation">
          <a href="/tileset-studio">Catalog</a>
          <a href="/settings">Settings</a>
        </nav>
      </header>

      <section className="tileset-candidate-shell" aria-label="Candidate review workbench">
        <aside className="tileset-studio-rail tileset-review-queue" aria-label="Candidate queue">
          <div className="tileset-studio-rail-head">
            <span>Queue</span>
          </div>
          {queueItems.map((item, index) => {
            const decision = decisions[item.id] ?? 'pending';
            return (
            <button
              key={item.id}
              type="button"
              className={item.id === selectedQueueItem.id ? `is-active is-${decision}` : `is-${decision}`}
              onClick={() => setSelectedQueueId(item.id)}
              data-review-decision={decision}
            >
              {item.type === 'candidate' ? (
                <img src={assetFrameSrc(item.asset, animationFrame)} alt="" draggable={false} />
              ) : (
                <span className="tileset-queue-mask">{item.slot.code}</span>
              )}
              <span className="tileset-family-copy">
                <strong>{index + 1}. {item.type === 'candidate' ? item.asset.label : `${item.pair.label} ${item.slot.label}`}</strong>
                <span>{item.type === 'candidate' ? terrainLabels[item.batch.familyId] : 'transition work'} · {decision}</span>
              </span>
            </button>
            );
          })}
        </aside>

        <section className="tileset-candidate-main">
          <nav className="tileset-review-stage-tabs" aria-label="Review stage">
            {[
              ['tile', 'Tile'],
              ['board', 'Board'],
              ['compare', 'Compare'],
            ].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                className={reviewStage === tab ? 'is-active' : ''}
                onClick={() => setReviewStage(tab as CandidateReviewStage)}
              >
                {label}
              </button>
            ))}
          </nav>

          {reviewStage === 'tile' ? (
            <section className="tileset-review-focus" aria-label="Focused queue item">
              <div className="tileset-review-stage">
                {selectedAsset ? (
                  <img src={assetFrameSrc(selectedAsset, animationFrame)} alt="" draggable={false} loading="eager" decoding="sync" />
                ) : selectedWorkSlot ? (
                  <TransitionSlotPreview slot={selectedWorkSlot} showFootprint animationFrame={animationFrame} />
                ) : null}
              </div>
              <div className="tileset-review-focus-copy">
                <p className="tileset-studio-kicker">{reviewSubtitle}</p>
                <h2>{reviewTitle}</h2>
                <p>{reviewDescription}</p>
                <dl>
                  <InspectorRow label={selectedQueueItem.type === 'candidate' ? 'Family' : 'Pair'}>
                    {selectedQueueItem.type === 'candidate' ? family.label : selectedPair?.label ?? 'Transition'}
                  </InspectorRow>
                  {selectedWorkSlot ? <InspectorRow label="Mask">{selectedWorkSlot.code}</InspectorRow> : null}
                  <InspectorRow label="Queue Position">{`${selectedIndex + 1} of ${queueItems.length}`}</InspectorRow>
                  <InspectorRow label="Decision">{selectedDecision}</InspectorRow>
                  {selectedWorkSlot
                    ? socketEdges.map((edge) => (
                        <InspectorRow key={edge} label={`${edge[0].toUpperCase()}${edge.slice(1)}`}>
                          {terrainLabels[selectedWorkSlot.sockets[edge]]}
                        </InspectorRow>
                      ))
                    : null}
                </dl>
              </div>
            </section>
          ) : null}

          {reviewStage === 'board' ? (
            <section className="tileset-candidate-board" aria-label="Candidate board preview">
              <div className="tileset-studio-panel-head">
                <h3>Board Proof</h3>
                <p className="tileset-generated-board-meta">
                  focused item only · {candidateBoard.stats.illegalEdges === 0 ? 'legal sockets' : `${candidateBoard.stats.illegalEdges} illegal edges`}
                  {candidateBoard.stats.missingPlacements > 0 ? ` · ${candidateBoard.stats.missingPlacements} missing art` : ''}
                </p>
              </div>
              <div
                className="tileset-studio-board-window"
                onPointerDown={startReviewBoardPan}
                onPointerMove={moveReviewBoardPan}
                onPointerUp={endReviewBoardPan}
                onPointerCancel={endReviewBoardPan}
                onWheel={zoomReviewBoardWithWheel}
              >
                <StudioGeneratedBoard board={candidateBoard} showFootprint boardZoom={reviewBoardZoom} boardPan={reviewBoardPan} animationFrame={animationFrame} />
              </div>
            </section>
          ) : null}

          {reviewStage === 'compare' ? (
            <section className="tileset-review-compare-stage" aria-label="Accepted family examples">
              <div className="tileset-studio-panel-head">
                <h3>Accepted {family.label}</h3>
                <p className="tileset-generated-board-meta">current catalog examples for visual comparison</p>
              </div>
              <div className="tileset-review-accepted-grid">
                {acceptedAssets.map((asset) => (
                  <StudioTileCard
                    key={asset.id}
                    asset={asset}
                    selected={false}
                    showFootprint
                    zoom={1}
                    animationFrame={animationFrame}
                    onSelect={() => undefined}
                    onInspect={() => undefined}
                    onWheel={(event) => event.preventDefault()}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </section>

        <aside className="tileset-studio-inspector tileset-review-controls" aria-label="Candidate review controls">
          <section className="tileset-inspector-section">
            <h2>Review</h2>
            <p>Mark this item, then move through the queue. Decisions are stored in this browser so I can read them back.</p>
            <div className="tileset-review-decision" data-current-review-id={selectedQueueItem.id} data-current-review-decision={selectedDecision}>
              <button type="button" className={selectedDecision === 'approved' ? 'is-active' : ''} onClick={() => setDecision(selectedQueueItem.id, 'approved')}>
                {selectedQueueItem.type === 'candidate' ? 'Approve' : 'Queued'}
              </button>
              <button type="button" className={selectedDecision === 'revise' ? 'is-active' : ''} onClick={() => setDecision(selectedQueueItem.id, 'revise')}>
                {selectedQueueItem.type === 'candidate' ? 'Revise' : 'In Progress'}
              </button>
              <button type="button" className={selectedDecision === 'rejected' ? 'is-active' : ''} onClick={() => setDecision(selectedQueueItem.id, 'rejected')}>
                {selectedQueueItem.type === 'candidate' ? 'Reject' : 'Blocked'}
              </button>
              <button type="button" onClick={() => setDecision(selectedQueueItem.id, 'pending')}>
                Clear
              </button>
            </div>
            <div className="tileset-review-nav">
              <button type="button" onClick={() => goToOffset(-1)} disabled={selectedIndex === 0}>Previous</button>
              <button type="button" onClick={() => goToOffset(1)} disabled={selectedIndex === queueItems.length - 1}>Next</button>
            </div>
            <dl>
              <InspectorRow label="Pending">{String(pendingCount)}</InspectorRow>
              <InspectorRow label="Reviewed">{String(reviewedCount)}</InspectorRow>
              <InspectorRow label={selectedQueueItem.type === 'candidate' ? 'Batch' : 'Work Type'}>
                {selectedQueueItem.type === 'candidate' ? selectedQueueItem.batch.label : 'Missing transition art'}
              </InspectorRow>
            </dl>
            <div className="tileset-control-divider" />
            <h3>Board</h3>
            <div className="tileset-control-stack">
              <button type="button" onClick={() => setReviewBoardPan({ x: 0, y: 0 })}>
                Center Board
              </button>
              <label>
                Board Zoom
                <input
                  type="range"
                  min="0.55"
                  max="1.35"
                  step="0.05"
                  value={reviewBoardZoom}
                  onChange={(event) => setReviewBoardZoom(Number(event.target.value))}
                />
              </label>
            </div>
          </section>

        </aside>
      </section>
    </main>
  );
}

export function TilePreview(): ReactElement {
  const animationFrame = useAnimationFrameIndex();

  return (
    <main className="tile-preview-page">
      <section className="tile-preview-hero">
        <div>
          <p className="tile-preview-kicker">PixelLab flat board kit</p>
          <h1>Generated Tile Preview</h1>
        </div>
        <nav className="tile-preview-nav" aria-label="Preview navigation">
          <a href="/skirmish">Skirmish</a>
          <a href="/design">Design</a>
        </nav>
      </section>

      <section className="tile-preview-layout">
        <div className="tile-preview-board-shell">
          <PreviewBoard />
        </div>

        <aside className="tile-preview-side">
          <div className="tile-preview-reference">
            <img src={tileUrl(kit.grassA)} alt="" draggable={false} />
            <div>
              <h2>Static Board Kit</h2>
              <p>These use top-down isometric tiles with zero depth, loaded directly from PixelLab.</p>
            </div>
          </div>
          <div className="tile-preview-run-list" aria-label="PixelLab run ids">
            {runLinks.map((run) => (
              <code key={run.id}>{run.label}: {run.id}</code>
            ))}
          </div>
          <AnimatedTerrainStrip animationFrame={animationFrame} />
          <div className="tile-preview-strip" aria-label="Candidate tiles">
            {candidates.map((candidate) => (
              <figure key={`${candidate.run}-${candidate.index}`}>
                <img src={tileUrl(candidate)} alt="" draggable={false} />
                <figcaption>{candidate.label}</figcaption>
              </figure>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

export function TileReview(): ReactElement {
  const [reviewMode, setReviewMode] = useState<'before' | 'after'>('after');

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('tile-review-active');
    return () => shell?.classList.remove('tile-review-active');
  }, []);

  return (
    <main className="tile-review-page">
      <section className="tile-review-stage" aria-label="Tile art review">
        <div className="tile-review-reference-frame">
          <img src="/assets/art/skirmish-style-target.png" alt="" draggable={false} />
        </div>
        <div className="tile-review-board-shell" aria-label="Concept-matched board plane">
          <ConceptBoardReconstruction mode={reviewMode} />
        </div>
        <aside className="tile-review-aside">
          <h1>Target</h1>
          <p>Canonical tile edge: {TILE_EDGE_ANGLE_DEGREES.toFixed(1)} degrees. Every generated tile must fit this template.</p>
          <div className="tile-review-toggle" aria-label="Review mode">
            <button type="button" className={reviewMode === 'before' ? 'is-active' : ''} onClick={() => setReviewMode('before')}>
              Before
            </button>
            <button type="button" className={reviewMode === 'after' ? 'is-active' : ''} onClick={() => setReviewMode('after')}>
              After
            </button>
          </div>
          <ul>
            <li>Geometry: locked</li>
            <li>Stage: art quality pass 1</li>
            <li>Before: accepted board kit pass</li>
            <li>After: tuned terrain palette and detail</li>
            <li>Question: does it still hold while feeling less placeholder?</li>
            <li>No crop junk, no pieces</li>
          </ul>
          <div className="tile-template-guides" aria-label="Canonical tile templates">
            <img src="/assets/tiles/canonical-template/guide-grass-tile.png" alt="" draggable={false} />
            <img src="/assets/tiles/canonical-template/guide-stone-tile.png" alt="" draggable={false} />
            <img src="/assets/tiles/canonical-template/guide-water-tile.png" alt="" draggable={false} />
          </div>
          <div className="tile-template-guides is-normalized" aria-label="Normalized PixelLab samples">
            <img src={trueIsoTileAsset('grass-clean-a.png')} alt="" draggable={false} />
            <img src={trueIsoTileAsset('stone-clean-a.png')} alt="" draggable={false} />
            <img src={trueIsoTileAsset('water-clean-a.png')} alt="" draggable={false} />
          </div>
        </aside>
      </section>
    </main>
  );
}
