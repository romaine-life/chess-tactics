import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement, type WheelEvent } from 'react';
import { TILE_EDGE_ANGLE_DEGREES, TILE_TEMPLATE } from '../art/tileTemplate';

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

const canonicalTileAssets: Record<ConceptTerrain, string[]> = {
  grass: [
    '/assets/tiles/canonical-clean/grass-clean-a.png',
    '/assets/tiles/canonical-clean/grass-clean-b.png',
    '/assets/tiles/canonical-clean/grass-clean-c.png',
  ],
  stone: [
    '/assets/tiles/canonical-clean/stone-clean-a.png',
    '/assets/tiles/canonical-clean/stone-clean-b.png',
  ],
  water: [
    '/assets/tiles/canonical-clean/water-clean-a.png',
    '/assets/tiles/canonical-clean/water-clean-b.png',
  ],
  grassStone: [
    '/assets/tiles/canonical-clean/transition-grass-stone-a.png',
    '/assets/tiles/canonical-clean/transition-grass-stone-b.png',
  ],
  grassWater: [
    '/assets/tiles/canonical-clean/transition-grass-water-a.png',
    '/assets/tiles/canonical-clean/transition-grass-water-b.png',
  ],
  edge: ['/assets/tiles/canonical-clean/grass-clean-a.png'],
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

type StudioFamilyId = 'grass' | 'stone' | 'water';
type StudioAssetKind = 'tile' | 'reference';
type StudioTab = 'tiles' | 'board';
type InspectorTab = 'inspect' | 'controls';
type TileFilter = 'base' | 'transitions' | 'references';
type TerrainPairId = 'grass-stone' | 'grass-water';
type EdgeName = 'north' | 'east' | 'south' | 'west';

interface StudioAsset {
  id: string;
  label: string;
  src: string;
  role: string;
  kind: StudioAssetKind;
  source: string;
  probability: number;
  notes: string;
  terrains?: StudioFamilyId[];
  pairId?: TerrainPairId;
  socketMask?: number;
}

interface StudioFamily {
  id: StudioFamilyId;
  label: string;
  purpose: string;
  status: string;
  review: string;
  assets: StudioAsset[];
}

interface TransitionPair {
  id: TerrainPairId;
  label: string;
  terrains: [StudioFamilyId, StudioFamilyId];
}

interface TransitionSlot {
  mask: number;
  code: string;
  label: string;
  sockets: Record<EdgeName, StudioFamilyId>;
  assets: StudioAsset[];
}

interface TilesetStudioRouteState {
  familyId: StudioFamilyId;
  studioTab: StudioTab;
  tileFilter: TileFilter;
  selectedPairId: TerrainPairId;
  selectedAssetId?: string;
  boardMode: 'generated' | 'concept';
  boardScope: 'family' | 'mixed';
  boardSize: 'small' | 'wide';
  boardSeed: number;
}

const socketEdges: EdgeName[] = ['north', 'east', 'south', 'west'];

const terrainLabels: Record<StudioFamilyId, string> = {
  grass: 'Grass',
  stone: 'Stone',
  water: 'Water',
};

const transitionPairs: TransitionPair[] = [
  { id: 'grass-stone', label: 'Grass-Stone', terrains: ['grass', 'stone'] },
  { id: 'grass-water', label: 'Grass-Water', terrains: ['grass', 'water'] },
];

const studioDefaults: TilesetStudioRouteState = {
  familyId: 'grass',
  studioTab: 'tiles',
  tileFilter: 'base',
  selectedPairId: 'grass-stone',
  boardMode: 'generated',
  boardScope: 'family',
  boardSize: 'small',
  boardSeed: 4217,
};

const transitionAssets: StudioAsset[] = [
  {
    id: 'transition-grass-stone-a',
    label: 'Grass Stone A',
    src: '/assets/tiles/canonical-clean/transition-grass-stone-a.png',
    role: 'transition',
    kind: 'tile',
    source: 'canonical-clean',
    probability: 1,
    terrains: ['grass', 'stone'],
    pairId: 'grass-stone',
    socketMask: 1,
    notes: 'First grass to stone transition tile.',
  },
  {
    id: 'transition-grass-stone-b',
    label: 'Grass Stone B',
    src: '/assets/tiles/canonical-clean/transition-grass-stone-b.png',
    role: 'transition',
    kind: 'tile',
    source: 'canonical-clean',
    probability: 1,
    terrains: ['grass', 'stone'],
    pairId: 'grass-stone',
    socketMask: 3,
    notes: 'Alternate grass to stone transition tile.',
  },
  {
    id: 'transition-grass-water-a',
    label: 'Grass Water A',
    src: '/assets/tiles/canonical-clean/transition-grass-water-a.png',
    role: 'transition',
    kind: 'tile',
    source: 'canonical-clean',
    probability: 1,
    terrains: ['grass', 'water'],
    pairId: 'grass-water',
    socketMask: 1,
    notes: 'First grass to water transition tile.',
  },
  {
    id: 'transition-grass-water-b',
    label: 'Grass Water B',
    src: '/assets/tiles/canonical-clean/transition-grass-water-b.png',
    role: 'transition',
    kind: 'tile',
    source: 'canonical-clean',
    probability: 1,
    terrains: ['grass', 'water'],
    pairId: 'grass-water',
    socketMask: 3,
    notes: 'Alternate grass to water transition tile.',
  },
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
        src: '/assets/tiles/canonical-clean/grass-clean-a.png',
        role: 'base',
        kind: 'tile',
        source: 'canonical-clean',
        probability: 1,
        notes: 'Current board base tile.',
      },
      {
        id: 'grass-clean-b',
        label: 'Grass B',
        src: '/assets/tiles/canonical-clean/grass-clean-b.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-clean',
        probability: 0.75,
        notes: 'Darker texture variation.',
      },
      {
        id: 'grass-clean-c',
        label: 'Grass C',
        src: '/assets/tiles/canonical-clean/grass-clean-c.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-clean',
        probability: 0.75,
        notes: 'Light texture variation.',
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
        src: '/assets/tiles/canonical-clean/stone-clean-a.png',
        role: 'base',
        kind: 'tile',
        source: 'canonical-clean',
        probability: 1,
        notes: 'Current board stone base.',
      },
      {
        id: 'stone-clean-b',
        label: 'Stone B',
        src: '/assets/tiles/canonical-clean/stone-clean-b.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-clean',
        probability: 0.75,
        notes: 'Alternate stone value pass.',
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
        src: '/assets/tiles/canonical-clean/water-clean-a.png',
        role: 'base',
        kind: 'tile',
        source: 'canonical-clean',
        probability: 1,
        notes: 'Current board water base.',
      },
      {
        id: 'water-clean-b',
        label: 'Water B',
        src: '/assets/tiles/canonical-clean/water-clean-b.png',
        role: 'variant',
        kind: 'tile',
        source: 'canonical-clean',
        probability: 0.75,
        notes: 'Alternate water surface.',
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

const kindLabels: Record<StudioAssetKind, string> = {
  tile: 'Tile',
  reference: 'Reference',
};

const familyCounts = (family: StudioFamily): string => {
  const variants = family.assets.filter((asset) => asset.kind === 'tile').length;
  const transitions = transitionAssets.filter((asset) => asset.terrains?.includes(family.id)).length;
  const references = family.assets.filter((asset) => asset.kind === 'reference').length;
  return `${variants} tiles · ${transitions} links · ${references} refs`;
};

const familySample = (family: StudioFamily): StudioAsset => family.assets.find((asset) => asset.kind === 'tile') ?? family.assets[0];

const studioFamilyById = (familyId: StudioFamilyId): StudioFamily =>
  studioFamilies.find((item) => item.id === familyId) ?? studioFamilies[0];

const familyBaseAsset = (familyId: StudioFamilyId): StudioAsset =>
  studioFamilyById(familyId).assets.find((asset) => asset.kind === 'tile' && asset.role === 'base') ?? familySample(studioFamilyById(familyId));

const transitionPairsForFamily = (familyId: StudioFamilyId): TransitionPair[] =>
  transitionPairs.filter((pair) => pair.terrains.includes(familyId));

const transitionPairById = (pairId: TerrainPairId): TransitionPair =>
  transitionPairs.find((pair) => pair.id === pairId) ?? transitionPairs[0];

const isStudioFamilyId = (value: string | null): value is StudioFamilyId => value === 'grass' || value === 'stone' || value === 'water';

const isStudioTab = (value: string | null): value is StudioTab => value === 'tiles' || value === 'board';

const isTileFilter = (value: string | null): value is TileFilter => value === 'base' || value === 'transitions' || value === 'references';

const isTerrainPairId = (value: string | null): value is TerrainPairId => value === 'grass-stone' || value === 'grass-water';

const readTilesetStudioRoute = (): TilesetStudioRouteState => {
  const params = new URLSearchParams(window.location.search);
  const family = params.get('family');
  const view = params.get('view');
  const collection = params.get('collection');
  const pair = params.get('pair');
  const asset = params.get('asset');
  const seed = Number(params.get('seed'));
  return {
    familyId: isStudioFamilyId(family) ? family : studioDefaults.familyId,
    studioTab: isStudioTab(view) ? view : studioDefaults.studioTab,
    tileFilter: isTileFilter(collection) ? collection : studioDefaults.tileFilter,
    selectedPairId: isTerrainPairId(pair) ? pair : studioDefaults.selectedPairId,
    selectedAssetId: asset || undefined,
    boardMode: params.get('board') === 'concept' ? 'concept' : studioDefaults.boardMode,
    boardScope: params.get('scope') === 'mixed' ? 'mixed' : studioDefaults.boardScope,
    boardSize: params.get('size') === 'wide' ? 'wide' : studioDefaults.boardSize,
    boardSeed: Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : studioDefaults.boardSeed,
  };
};

const writeTilesetStudioRoute = (route: TilesetStudioRouteState): void => {
  if (window.location.pathname !== '/tileset-studio') return;
  const params = new URLSearchParams();
  params.set('family', route.familyId);
  params.set('view', route.studioTab);
  params.set('collection', route.tileFilter);
  if (route.selectedAssetId) params.set('asset', route.selectedAssetId);
  params.set('pair', route.selectedPairId);
  params.set('board', route.boardMode);
  params.set('scope', route.boardScope);
  params.set('size', route.boardSize);
  params.set('seed', String(route.boardSeed));
  const nextHref = `${window.location.pathname}?${params.toString()}`;
  const currentHref = `${window.location.pathname}${window.location.search}`;
  if (nextHref !== currentHref) {
    window.history.replaceState({}, '', nextHref);
  }
};

const transitionMaskCode = (mask: number): string => mask.toString(2).padStart(4, '0');

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const transitionSlotLabel = (mask: number, pair: TransitionPair): string => {
  if (mask === 0) return `All ${terrainLabels[pair.terrains[1]]}`;
  if (mask === 15) return `All ${terrainLabels[pair.terrains[0]]}`;
  return socketEdges
    .filter((_, index) => (mask & (1 << index)) !== 0)
    .map((edge) => edge[0].toUpperCase())
    .join(' + ');
};

const transitionSocketsForMask = (mask: number, pair: TransitionPair): Record<EdgeName, StudioFamilyId> =>
  socketEdges.reduce(
    (sockets, edge, index) => ({
      ...sockets,
      [edge]: (mask & (1 << index)) !== 0 ? pair.terrains[0] : pair.terrains[1],
    }),
    {} as Record<EdgeName, StudioFamilyId>,
  );

const transitionSlotsForPair = (pair: TransitionPair): TransitionSlot[] =>
  Array.from({ length: 14 }, (_, index) => index + 1).map((mask) => ({
    mask,
    code: transitionMaskCode(mask),
    label: transitionSlotLabel(mask, pair),
    sockets: transitionSocketsForMask(mask, pair),
    assets: transitionAssets.filter((asset) => asset.pairId === pair.id && asset.socketMask === mask),
  }));

const owningFamilyForAsset = (asset: StudioAsset): StudioFamily | undefined =>
  studioFamilies.find((item) => item.assets.some((familyAsset) => familyAsset.id === asset.id));

const socketsForAsset = (asset: StudioAsset): Record<EdgeName, StudioFamilyId> => {
  if (asset.pairId && typeof asset.socketMask === 'number') {
    return transitionSocketsForMask(asset.socketMask, transitionPairById(asset.pairId));
  }
  const owningFamily = owningFamilyForAsset(asset) ?? studioFamilies[0];
  return {
    north: owningFamily.id,
    east: owningFamily.id,
    south: owningFamily.id,
    west: owningFamily.id,
  };
};

const propertyHelp: Record<string, string> = {
  'Tile Type': 'How this asset participates in the tileset: base terrain, transition tile, reference, or invalid transition.',
  North: 'The terrain family this tile exposes on its north edge.',
  East: 'The terrain family this tile exposes on its east edge.',
  South: 'The terrain family this tile exposes on its south edge.',
  West: 'The terrain family this tile exposes on its west edge.',
  Pair: 'The two terrain families this transition tile is allowed to connect.',
  Mask: 'Four-bit edge socket code in north, east, south, west order.',
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
  onSelect,
  onWheel,
}: {
  asset: StudioAsset;
  selected: boolean;
  showFootprint: boolean;
  zoom: number;
  onSelect: () => void;
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
        <img src={asset.src} alt="" draggable={false} loading="eager" decoding="sync" />
      </span>
      <span className="tileset-studio-card-meta">
        <span>
          <strong>{asset.label}</strong>
          <em>{asset.role}</em>
        </span>
      </span>
    </button>
  );
}

function TransitionRelationshipGrid({
  family,
  pair,
  selectedAsset,
  showFootprint,
  onPairSelect,
  onAssetSelect,
}: {
  family: StudioFamily;
  pair: TransitionPair;
  selectedAsset: StudioAsset;
  showFootprint: boolean;
  onPairSelect: (pairId: TerrainPairId) => void;
  onAssetSelect: (asset: StudioAsset) => void;
}): ReactElement {
  const pairs = transitionPairsForFamily(family.id);
  const slots = transitionSlotsForPair(pair);

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
          const isSelected = slot.assets.some((asset) => asset.id === selectedAsset.id);
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
            >
              <span className="tileset-relationship-head">
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
                      {cell.asset ? <img src={cell.asset.src} alt="" draggable={false} loading="eager" decoding="sync" /> : <span>Missing</span>}
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
                        onClick={() => onAssetSelect(cell.asset)}
                        aria-label={`Inspect ${cell.asset.label}`}
                      />
                    );
                  })}
              </span>
              <span className="tileset-relationship-foot">
                {firstAsset ? `${firstAsset.label} · transition tile` : 'Needs transition art'}
              </span>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function seededRandom(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function pickWeightedAsset(assets: StudioAsset[], random: () => number): StudioAsset {
  const total = assets.reduce((sum, asset) => sum + Math.max(0.05, asset.probability), 0);
  let cursor = random() * total;
  for (const asset of assets) {
    cursor -= Math.max(0.05, asset.probability);
    if (cursor <= 0) return asset;
  }
  return assets[assets.length - 1];
}

function StudioGeneratedBoard({
  assets,
  seed,
  showFootprint,
  columns,
  rows,
  boardZoom,
  boardPan,
}: {
  assets: StudioAsset[];
  seed: number;
  showFootprint: boolean;
  columns: number;
  rows: number;
  boardZoom: number;
  boardPan: { x: number; y: number };
}): ReactElement {
  const usableAssets = assets.filter((asset) => asset.kind === 'tile');
  const boardAssets = usableAssets.length > 0 ? usableAssets : assets;
  const random = seededRandom(seed);
  const cells = Array.from({ length: columns * rows }, (_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    return {
      x: col,
      y: row,
      asset: pickWeightedAsset(boardAssets, random),
    };
  });
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
            className="tileset-generated-board-tile"
            data-asset-id={cell.asset.id}
            style={{ left, top, zIndex: cell.x + cell.y }}
          >
            <img src={cell.asset.src} alt="" draggable={false} />
          </div>
        );
      })}
    </div>
  );
}

export function TilesetStudio(): ReactElement {
  const initialRoute = useMemo(() => readTilesetStudioRoute(), []);
  const [familyId, setFamilyId] = useState<StudioFamilyId>(initialRoute.familyId);
  const [studioTab, setStudioTab] = useState<StudioTab>(initialRoute.studioTab);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('inspect');
  const [tileFilter, setTileFilter] = useState<TileFilter>(initialRoute.tileFilter);
  const [selectedPairId, setSelectedPairId] = useState<TerrainPairId>(initialRoute.selectedPairId);
  const [showFootprint, setShowFootprint] = useState(true);
  const [showBefore, setShowBefore] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [boardMode, setBoardMode] = useState<'generated' | 'concept'>(initialRoute.boardMode);
  const [boardScope, setBoardScope] = useState<'family' | 'mixed'>(initialRoute.boardScope);
  const [boardSize, setBoardSize] = useState<'small' | 'wide'>(initialRoute.boardSize);
  const [boardSeed, setBoardSeed] = useState(initialRoute.boardSeed);
  const [boardZoom, setBoardZoom] = useState(0.85);
  const [boardPan, setBoardPan] = useState({ x: 0, y: 0 });
  const boardDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; assetId?: string } | null>(null);
  const boardDidDragRef = useRef(false);

  const family = studioFamilies.find((item) => item.id === familyId) ?? studioFamilies[0];
  const [selectedAssetId, setSelectedAssetId] = useState(initialRoute.selectedAssetId ?? family.assets[0].id);
  const familyTransitionPairs = transitionPairsForFamily(family.id);
  const selectedPair = familyTransitionPairs.find((pair) => pair.id === selectedPairId) ?? familyTransitionPairs[0] ?? transitionPairs[0];
  const allStudioAssets = useMemo(() => [...studioFamilies.flatMap((item) => item.assets), ...transitionAssets], []);
  const selectedAsset = allStudioAssets.find((asset) => asset.id === selectedAssetId) ?? family.assets[0];
  const familyHasBaseTile = family.assets.some((asset) => asset.kind === 'tile' && asset.role === 'base');
  const tileFilters: Array<[TileFilter, string]> = [
    ['base', 'Base'],
    ...(familyHasBaseTile ? ([['transitions', 'Transitions']] as Array<[TileFilter, string]>) : []),
    ['references', 'References'],
  ];
  const filteredTileAssets =
    tileFilter === 'base'
      ? family.assets.filter((asset) => asset.kind === 'tile')
      : tileFilter === 'transitions'
        ? transitionAssets.filter((asset) => asset.terrains?.includes(family.id))
        : family.assets.filter((asset) => asset.kind === 'reference');
  const generatedAssets =
    boardScope === 'family'
      ? [...family.assets, ...transitionAssets.filter((asset) => asset.terrains?.includes(family.id))]
      : studioFamilies
          .flatMap((item) => item.assets)
          .filter((asset) => asset.kind === 'tile')
          .concat(transitionAssets);
  const generatedBoardSize = boardSize === 'small' ? { columns: 8, rows: 6 } : { columns: 10, rows: 7 };

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('tileset-studio-active');
    return () => shell?.classList.remove('tileset-studio-active');
  }, []);

  useEffect(() => {
    const preloadedImages = Array.from(new Set(allStudioAssets.map((asset) => asset.src))).map((src) => {
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
      setStudioTab(route.studioTab);
      setTileFilter(route.tileFilter);
      setSelectedPairId(route.selectedPairId);
      setSelectedAssetId(route.selectedAssetId ?? routeFamily.assets[0].id);
      setBoardMode(route.boardMode);
      setBoardScope(route.boardScope);
      setBoardSize(route.boardSize);
      setBoardSeed(route.boardSeed);
    };

    window.addEventListener('popstate', syncFromRoute);
    return () => window.removeEventListener('popstate', syncFromRoute);
  }, []);

  useEffect(() => {
    if (!allStudioAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(family.assets[0].id);
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
          : family.assets.filter((asset) => asset.kind === 'reference');
    if (studioTab === 'tiles' && visibleAssets.length > 0) {
      setSelectedAssetId((currentAssetId) => (visibleAssets.some((asset) => asset.id === currentAssetId) ? currentAssetId : visibleAssets[0].id));
    }
  }, [family, selectedPair.id, studioTab, tileFilter]);

  useEffect(() => {
    setInspectorTab('inspect');
  }, [studioTab]);

  useEffect(() => {
    if (tileFilter === 'transitions' && !familyHasBaseTile) {
      setTileFilter('base');
    }
  }, [familyHasBaseTile, tileFilter]);

  useEffect(() => {
    if (boardMode !== 'concept' && showBefore) {
      setShowBefore(false);
    }
  }, [boardMode, showBefore]);

  useEffect(() => {
    writeTilesetStudioRoute({
      familyId,
      studioTab,
      tileFilter,
      selectedPairId,
      selectedAssetId: selectedAsset.id,
      boardMode,
      boardScope,
      boardSize,
      boardSeed,
    });
  }, [boardMode, boardScope, boardSeed, boardSize, familyId, selectedAsset.id, selectedPairId, studioTab, tileFilter]);

  const startBoardPan = (event: PointerEvent<HTMLDivElement>) => {
    if (studioTab !== 'board') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const tileElement = (event.target as HTMLElement).closest<HTMLElement>('.tileset-generated-board-tile');
    boardDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: boardPan.x,
      originY: boardPan.y,
      assetId: tileElement?.dataset.assetId,
    };
    boardDidDragRef.current = false;
  };

  const moveBoardPan = (event: PointerEvent<HTMLDivElement>) => {
    const drag = boardDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
      boardDidDragRef.current = true;
    }
    setBoardPan({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  };

  const endBoardPan = (event: PointerEvent<HTMLDivElement>) => {
    const drag = boardDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    boardDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!boardDidDragRef.current && drag.assetId) {
      setSelectedAssetId(drag.assetId);
      setInspectorTab('inspect');
    }
  };

  const zoomTilesWithWheel = (event: WheelEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setZoom((value) => clamp(Number((value + direction * 0.05).toFixed(2)), 0.75, 1.6));
  };

  const zoomBoardWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setBoardZoom((value) => clamp(Number((value + direction * 0.05).toFixed(2)), 0.55, 1.35));
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
            <p className="tileset-studio-kicker">Tileset Studio</p>
            <h1>{family.label}</h1>
            <p className="tileset-studio-subtitle">{family.purpose}</p>
          </div>
        </div>
        <nav className="tileset-studio-actions" aria-label="Tileset studio navigation">
          <a href="/settings">Settings</a>
        </nav>
      </header>

      <section className="tileset-studio-shell" aria-label="Tileset browser">
        <aside className="tileset-studio-rail" aria-label="Terrain families">
          <div className="tileset-studio-rail-head">
            <span>Tileset Library</span>
          </div>
          {studioFamilies.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === family.id ? 'is-active' : ''}
              onClick={() => {
                setFamilyId(item.id);
                setSelectedAssetId(familySample(item).id);
              }}
            >
              <img src={familySample(item).src} alt="" draggable={false} />
              <span className="tileset-family-copy">
                <strong>{item.label}</strong>
                <span>{familyCounts(item)}</span>
              </span>
            </button>
          ))}
        </aside>

        <section className="tileset-studio-main">
          <div className="tileset-studio-toolbar">
            <div className="tileset-studio-title-row">
              <h2>{family.label} Tileset</h2>
              <label className="tileset-collection-select">
                <span>Collection</span>
                <select value={tileFilter} disabled={studioTab !== 'tiles'} onChange={(event) => setTileFilter(event.target.value as TileFilter)}>
                  {tileFilters.map(([filter, label]) => (
                    <option key={filter} value={filter}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <nav className="tileset-studio-tabs" aria-label="Tileset studio modes">
              {[
                ['tiles', 'Tiles'],
                ['board', 'Board'],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  className={studioTab === tab ? 'is-active' : ''}
                  onClick={() => setStudioTab(tab as StudioTab)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {studioTab === 'tiles' ? (
            <section className="tileset-studio-tab-panel is-tiles" aria-label={`${family.label} tiles`}>
              {tileFilter === 'transitions' ? (
                <TransitionRelationshipGrid
                  family={family}
                  pair={selectedPair}
                  selectedAsset={selectedAsset}
                  showFootprint={showFootprint}
                  onPairSelect={setSelectedPairId}
                  onAssetSelect={(asset) => {
                    setSelectedAssetId(asset.id);
                    setInspectorTab('inspect');
                  }}
                />
              ) : tileFilter === 'base' ? (
                <div className="tileset-asset-sections">
                  <section className="tileset-asset-section" aria-label={`${family.label} base tiles`}>
                    <h3>Base Tiles</h3>
                    <div className="tileset-studio-grid" aria-label={`${family.label} base assets`}>
                      {filteredTileAssets.map((asset) => (
                        <StudioTileCard
                          key={asset.id}
                          asset={asset}
                          selected={asset.id === selectedAsset.id}
                          showFootprint={showFootprint}
                          zoom={zoom}
                          onSelect={() => {
                            setSelectedAssetId(asset.id);
                            setInspectorTab('inspect');
                          }}
                          onWheel={zoomTilesWithWheel}
                        />
                      ))}
                    </div>
                  </section>
                  <section className="tileset-asset-section" aria-label={`${family.label} transition tile inventory`}>
                    <h3>Transition Tiles</h3>
                    <div className="tileset-studio-grid" aria-label={`${family.label} transition assets`}>
                      {transitionAssets
                        .filter((asset) => asset.terrains?.includes(family.id))
                        .map((asset) => (
                          <StudioTileCard
                            key={asset.id}
                            asset={asset}
                            selected={asset.id === selectedAsset.id}
                            showFootprint={showFootprint}
                            zoom={zoom}
                            onSelect={() => {
                              setSelectedAssetId(asset.id);
                              setInspectorTab('inspect');
                            }}
                            onWheel={zoomTilesWithWheel}
                          />
                        ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="tileset-studio-grid" aria-label={`${family.label} assets`}>
                  {filteredTileAssets.map((asset) => (
                    <StudioTileCard
                      key={asset.id}
                      asset={asset}
                      selected={asset.id === selectedAsset.id}
                      showFootprint={showFootprint}
                      zoom={zoom}
                      onSelect={() => {
                        setSelectedAssetId(asset.id);
                        setInspectorTab('inspect');
                      }}
                      onWheel={zoomTilesWithWheel}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {studioTab === 'board' ? (
            <section className="tileset-studio-tab-panel is-board-mode" aria-label="Board test lab">
              <div className="tileset-studio-panel-head">
                <h3>Board Test Lab</h3>
                {boardMode === 'generated' ? (
                  <p className="tileset-generated-board-meta">
                    Seed {boardSeed} · {boardScope === 'family' ? family.label : 'mixed terrain'} · {generatedBoardSize.columns} x {generatedBoardSize.rows}
                  </p>
                ) : null}
              </div>
              <div
                className="tileset-studio-board-window"
                onPointerDown={startBoardPan}
                onPointerMove={moveBoardPan}
                onPointerUp={endBoardPan}
                onPointerCancel={endBoardPan}
                onWheel={zoomBoardWithWheel}
              >
                {boardMode === 'generated' ? (
                  <StudioGeneratedBoard
                    assets={generatedAssets}
                    seed={boardSeed}
                    showFootprint={showFootprint}
                    columns={generatedBoardSize.columns}
                    rows={generatedBoardSize.rows}
                    boardZoom={boardZoom}
                    boardPan={boardPan}
                  />
                ) : (
                  <div
                    className="tileset-concept-board-zoom"
                    style={{ '--board-zoom': boardZoom, '--board-pan-x': `${boardPan.x}px`, '--board-pan-y': `${boardPan.y}px` } as CSSProperties}
                  >
                    <ConceptBoardReconstruction mode={showBefore ? 'before' : 'after'} />
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </section>

        <aside className="tileset-studio-inspector" aria-label="Inspector and controls">
          <nav className="tileset-inspector-tabs" aria-label="Inspector modes">
            {[
              ['inspect', 'Inspect'],
              ['controls', 'Controls'],
            ].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                className={inspectorTab === tab ? 'is-active' : ''}
                onClick={() => setInspectorTab(tab as InspectorTab)}
              >
                {label}
              </button>
            ))}
          </nav>

          {inspectorTab === 'inspect' ? (
            <section className="tileset-inspector-section" aria-label="Selected tile details">
              <img src={selectedAsset.src} alt="" draggable={false} loading="eager" decoding="sync" />
              <h2>{selectedAsset.label}</h2>
              <dl>
                <EdgeLedger asset={selectedAsset} />
                <InspectorRow label="Fill Weight">
                  {selectedAsset.probability === 0 ? 'not random-filled' : selectedAsset.probability.toFixed(2)}
                </InspectorRow>
              </dl>
              <p>{selectedAsset.notes}</p>
              <ul>
                <li>Footprint: canonical 96 x 140 canvas</li>
                <li>Top plane: 96 x 54 diamond</li>
                <li>Review: {family.review}</li>
              </ul>
            </section>
          ) : null}

          {inspectorTab === 'controls' ? (
            <section className="tileset-inspector-section" aria-label="Controls">
              <h2>Controls</h2>
              {studioTab === 'tiles' ? (
                <div className="tileset-control-stack">
                  <button type="button" className={showFootprint ? 'is-active' : ''} onClick={() => setShowFootprint((value) => !value)}>
                    Footprint {showFootprint ? 'On' : 'Off'}
                  </button>
                  <label>
                    Tile Zoom
                    <input
                      type="range"
                      min="0.75"
                      max="1.6"
                      step="0.05"
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.target.value))}
                    />
                  </label>
                </div>
              ) : (
                <div className="tileset-control-stack">
                  <div className="tileset-segmented-control" aria-label="Board source">
                    <button type="button" className={boardMode === 'generated' ? 'is-active' : ''} onClick={() => setBoardMode('generated')}>
                      Generated
                    </button>
                    <button type="button" className={boardMode === 'concept' ? 'is-active' : ''} onClick={() => setBoardMode('concept')}>
                      Concept
                    </button>
                  </div>
                  <div className="tileset-segmented-control" aria-label="Terrain scope">
                    <button type="button" className={boardScope === 'family' ? 'is-active' : ''} onClick={() => setBoardScope('family')} disabled={boardMode !== 'generated'}>
                      Family
                    </button>
                    <button type="button" className={boardScope === 'mixed' ? 'is-active' : ''} onClick={() => setBoardScope('mixed')} disabled={boardMode !== 'generated'}>
                      Mixed
                    </button>
                  </div>
                  <button type="button" className="tileset-wide-action" onClick={() => setBoardSeed(Math.floor(Math.random() * 999999) + 1)} disabled={boardMode !== 'generated'}>
                    New Random Board
                  </button>
                  <button type="button" className="tileset-wide-action" onClick={() => setBoardSize((size) => (size === 'small' ? 'wide' : 'small'))} disabled={boardMode !== 'generated'}>
                    Size: {boardSize === 'small' ? '8 x 6' : '10 x 7'}
                  </button>
                  <ul>
                    <li>Seed: {boardSeed}</li>
                    <li>Scope: {boardScope === 'family' ? family.label : 'mixed terrain'}</li>
                    <li>Size: {generatedBoardSize.columns} x {generatedBoardSize.rows}</li>
                  </ul>
                  <div className="tileset-control-divider" />
                  <h3>View</h3>
                  <button type="button" className={showFootprint ? 'is-active' : ''} onClick={() => setShowFootprint((value) => !value)}>
                    Footprint {showFootprint ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    className={showBefore ? 'is-active' : ''}
                    onClick={() => setShowBefore((value) => !value)}
                    disabled={boardMode !== 'concept'}
                    title={boardMode === 'concept' ? 'Toggle the concept board before/after view.' : 'Only available when Board Source is Concept.'}
                  >
                    Before {showBefore ? 'On' : 'Off'}
                  </button>
                  <button type="button" onClick={() => setBoardPan({ x: 0, y: 0 })}>
                    Center Board
                  </button>
                  <label>
                    Board Zoom
                    <input
                      type="range"
                      min="0.55"
                      max="1.35"
                      step="0.05"
                      value={boardZoom}
                      onChange={(event) => setBoardZoom(Number(event.target.value))}
                    />
                  </label>
                </div>
              )}
            </section>
          ) : null}
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
            <img src="/assets/tiles/canonical-clean/grass-clean-a.png" alt="" draggable={false} />
            <img src="/assets/tiles/canonical-clean/stone-clean-a.png" alt="" draggable={false} />
            <img src="/assets/tiles/canonical-clean/water-clean-a.png" alt="" draggable={false} />
          </div>
        </aside>
      </section>
    </main>
  );
}
