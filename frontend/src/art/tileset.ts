import type { TileAssetKind, TileFamilyId, TileSocketAsset, TerrainPairId } from '../core/tileSockets';
import { transitionMaskCode, transitionPairById, transitionSlotLabel } from '../core/tileSockets';

export interface TileAsset extends TileSocketAsset {
  id: string;
  label: string;
  src: string;
  role: string;
  kind: TileAssetKind;
  source: string;
  probability: number;
  notes: string;
}

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

const transitionFillAsset = (pairId: TerrainPairId, socketMask: number): TileAsset => {
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
    notes: `first-pass ${pair.label} transition fill for socket mask ${code}.`,
  };
};

export const transitionAssets: TileAsset[] = [
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
    notes: 'grass to stone transition tile.',
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
    notes: 'alternate grass to stone transition tile.',
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
    notes: 'grass to water transition tile.',
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
    notes: 'alternate grass to water transition tile.',
  },
  ...(Object.entries(transitionFillMissingMasks) as Array<[TerrainPairId, number[]]>).flatMap(([pairId, masks]) =>
    masks.map((mask) => transitionFillAsset(pairId, mask)),
  ),
];

export const tileFamilies: Record<TileFamilyId, readonly TileAsset[]> = {
  grass: [
    { id: 'grass-clean-a', label: 'Grass A', src: '/assets/tiles/canonical-clean/grass-clean-a.png', role: 'base', kind: 'tile', source: 'canonical-clean', probability: 1, notes: 'grass base tile.' },
    { id: 'grass-clean-b', label: 'Grass B', src: '/assets/tiles/canonical-clean/grass-clean-b.png', role: 'variant', kind: 'tile', source: 'canonical-clean', probability: 0.75, notes: 'darker grass variation.' },
    { id: 'grass-clean-c', label: 'Grass C', src: '/assets/tiles/canonical-clean/grass-clean-c.png', role: 'variant', kind: 'tile', source: 'canonical-clean', probability: 0.75, notes: 'light grass variation.' },
    { id: 'grass-refresh-a', label: 'Grass D', src: '/assets/tiles/canonical-refresh/grass-refresh-a.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.65, notes: 'refresh grass variant.' },
    { id: 'grass-refresh-b', label: 'Grass E', src: '/assets/tiles/canonical-refresh/grass-refresh-b.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.55, notes: 'refresh grass variation.' },
    { id: 'grass-refresh-c', label: 'Grass F', src: '/assets/tiles/canonical-refresh/grass-refresh-c.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.55, notes: 'high-detail grass variation.' },
  ],
  stone: [
    { id: 'stone-clean-a', label: 'Stone A', src: '/assets/tiles/canonical-clean/stone-clean-a.png', role: 'base', kind: 'tile', source: 'canonical-clean', probability: 1, notes: 'stone base tile.' },
    { id: 'stone-clean-b', label: 'Stone B', src: '/assets/tiles/canonical-clean/stone-clean-b.png', role: 'variant', kind: 'tile', source: 'canonical-clean', probability: 0.75, notes: 'alternate stone tile.' },
    { id: 'stone-refresh-a', label: 'Stone C', src: '/assets/tiles/canonical-refresh/stone-refresh-a.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.65, notes: 'refresh stone variant.' },
    { id: 'stone-refresh-b', label: 'Stone D', src: '/assets/tiles/canonical-refresh/stone-refresh-b.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.55, notes: 'alternate stone refresh variant.' },
  ],
  water: [
    { id: 'water-clean-a', label: 'Water A', src: '/assets/tiles/canonical-clean/water-clean-a.png', role: 'base', kind: 'tile', source: 'canonical-clean', probability: 1, notes: 'water base tile.' },
    { id: 'water-clean-b', label: 'Water B', src: '/assets/tiles/canonical-clean/water-clean-b.png', role: 'variant', kind: 'tile', source: 'canonical-clean', probability: 0.75, notes: 'alternate water surface.' },
    { id: 'water-refresh-a', label: 'Water C', src: '/assets/tiles/canonical-refresh/water-refresh-a.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.65, notes: 'refresh water variant.' },
    { id: 'water-refresh-b', label: 'Water D', src: '/assets/tiles/canonical-refresh/water-refresh-b.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.55, notes: 'alternate water refresh variant.' },
  ],
};

export const tileAssets: readonly TileAsset[] = [
  ...tileFamilies.grass,
  ...tileFamilies.stone,
  ...tileFamilies.water,
  ...transitionAssets,
];

export const tileFrameSrc = (asset: TileAsset): string => asset.src;
