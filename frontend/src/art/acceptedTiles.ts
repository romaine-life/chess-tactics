import type { TileAssetKind, TileFamilyId, TileSocketAsset, TerrainPairId } from '../core/tileSockets';
import { transitionMaskCode, transitionPairById, transitionSlotLabel } from '../core/tileSockets';

export interface AcceptedTileAsset extends TileSocketAsset {
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

const transitionFillAsset = (pairId: TerrainPairId, socketMask: number): AcceptedTileAsset => {
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
    notes: `Accepted first-pass ${pair.label} transition fill for socket mask ${code}.`,
  };
};

export const acceptedTransitionAssets: AcceptedTileAsset[] = [
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
    notes: 'Accepted grass to stone transition tile.',
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
    notes: 'Accepted alternate grass to stone transition tile.',
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
    notes: 'Accepted grass to water transition tile.',
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
    notes: 'Accepted alternate grass to water transition tile.',
  },
  ...(Object.entries(transitionFillMissingMasks) as Array<[TerrainPairId, number[]]>).flatMap(([pairId, masks]) =>
    masks.map((mask) => transitionFillAsset(pairId, mask)),
  ),
];

export const acceptedTileFamilies: Record<TileFamilyId, readonly AcceptedTileAsset[]> = {
  grass: [
    { id: 'grass-clean-a', label: 'Grass A', src: '/assets/tiles/canonical-clean/grass-clean-a.png', role: 'base', kind: 'tile', source: 'canonical-clean', probability: 1, notes: 'Accepted grass base tile.' },
    { id: 'grass-clean-b', label: 'Grass B', src: '/assets/tiles/canonical-clean/grass-clean-b.png', role: 'variant', kind: 'tile', source: 'canonical-clean', probability: 0.75, notes: 'Accepted darker grass variation.' },
    { id: 'grass-clean-c', label: 'Grass C', src: '/assets/tiles/canonical-clean/grass-clean-c.png', role: 'variant', kind: 'tile', source: 'canonical-clean', probability: 0.75, notes: 'Accepted light grass variation.' },
    { id: 'grass-refresh-a', label: 'Grass D', src: '/assets/tiles/canonical-refresh/grass-refresh-a.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.65, notes: 'Accepted refresh grass variant.' },
    { id: 'grass-refresh-b', label: 'Grass E', src: '/assets/tiles/canonical-refresh/grass-refresh-b.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.55, notes: 'Accepted refresh grass variation.' },
    { id: 'grass-refresh-c', label: 'Grass F', src: '/assets/tiles/canonical-refresh/grass-refresh-c.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.55, notes: 'Accepted high-detail grass variation.' },
  ],
  stone: [
    { id: 'stone-clean-a', label: 'Stone A', src: '/assets/tiles/canonical-clean/stone-clean-a.png', role: 'base', kind: 'tile', source: 'canonical-clean', probability: 1, notes: 'Accepted stone base tile.' },
    { id: 'stone-clean-b', label: 'Stone B', src: '/assets/tiles/canonical-clean/stone-clean-b.png', role: 'variant', kind: 'tile', source: 'canonical-clean', probability: 0.75, notes: 'Accepted alternate stone tile.' },
    { id: 'stone-refresh-a', label: 'Stone C', src: '/assets/tiles/canonical-refresh/stone-refresh-a.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.65, notes: 'Accepted refresh stone variant.' },
    { id: 'stone-refresh-b', label: 'Stone D', src: '/assets/tiles/canonical-refresh/stone-refresh-b.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.55, notes: 'Accepted alternate stone refresh variant.' },
  ],
  water: [
    { id: 'water-clean-a', label: 'Water A', src: '/assets/tiles/canonical-clean/water-clean-a.png', role: 'base', kind: 'tile', source: 'canonical-clean', probability: 1, notes: 'Accepted water base tile.' },
    { id: 'water-clean-b', label: 'Water B', src: '/assets/tiles/canonical-clean/water-clean-b.png', role: 'variant', kind: 'tile', source: 'canonical-clean', probability: 0.75, notes: 'Accepted alternate water surface.' },
    { id: 'water-refresh-a', label: 'Water C', src: '/assets/tiles/canonical-refresh/water-refresh-a.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.65, notes: 'Accepted refresh water variant.' },
    { id: 'water-refresh-b', label: 'Water D', src: '/assets/tiles/canonical-refresh/water-refresh-b.png', role: 'variant', kind: 'tile', source: 'canonical-refresh', probability: 0.55, notes: 'Accepted alternate water refresh variant.' },
  ],
};

export const acceptedTileAssets: readonly AcceptedTileAsset[] = [
  ...acceptedTileFamilies.grass,
  ...acceptedTileFamilies.stone,
  ...acceptedTileFamilies.water,
  ...acceptedTransitionAssets,
];

export const acceptedAssetFrameSrc = (asset: AcceptedTileAsset): string => asset.src;
