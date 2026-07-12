import { liveMediaForSlot } from '../art/liveMediaCatalog';

export type StructureArtKind = 'tree' | 'house' | 'rock' | 'doodad';
export type StructureSplitMode = 'authored' | 'flat-contact';

export interface StructureArtAsset {
  id: string;
  label: string;
  kind: StructureArtKind;
  propKind?: 'tree' | 'house' | 'rock';
  path: string;
  terrains: string[];
  sprite: { w: number; h: number; anchorX: number; anchorY: number; scale: number };
  footprint?: { w: number; h: number };
  /**
   * Authored halves already contain distinct alpha. Flat imagegen/restyle sprites ship the same
   * PNG as both halves, so the renderer clips them at the contact line before z-sorting.
   */
  splitMode?: StructureSplitMode;
}

export type StructureArtDefinition = Omit<StructureArtAsset, 'sprite'> & {
  sprite: Omit<StructureArtAsset['sprite'], 'w' | 'h'>;
};

// Semantic identity, terrain affinity, anchors, and split behavior are code-owned.
// Raster dimensions are deliberately absent: the hydrated live-media catalog owns
// those facts for the exact active bytes.
export const STRUCTURE_ART_ASSETS: StructureArtDefinition[] = [
  {
    id: 'oak',
    label: 'Oak tree art',
    kind: 'tree',
    path: '/assets/props/oak',
    terrains: ['grass', 'dirt'],
    sprite: { anchorX: 96, anchorY: 255, scale: 1 },
    footprint: { w: 2, h: 2 },
  },
  {
    id: 'cottage',
    label: 'Cottage art',
    kind: 'house',
    path: '/assets/props/cottage',
    terrains: ['grass', 'dirt', 'stone'],
    sprite: { anchorX: 91, anchorY: 110, scale: 0.62 },
    footprint: { w: 2, h: 2 },
    splitMode: 'flat-contact',
  },
  {
    id: 'cabin',
    label: 'Log cabin art',
    kind: 'house',
    path: '/assets/props/cabin',
    terrains: ['grass', 'dirt', 'stone'],
    sprite: { anchorX: 118, anchorY: 107, scale: 0.35 },
    footprint: { w: 1, h: 1 },
    splitMode: 'flat-contact',
  },
  {
    id: 'lodge',
    label: 'Green-roof house art',
    kind: 'house',
    path: '/assets/props/lodge',
    terrains: ['grass', 'dirt', 'stone'],
    sprite: { anchorX: 103, anchorY: 126, scale: 1 },
    footprint: { w: 2, h: 2 },
    splitMode: 'flat-contact',
  },
  {
    id: 'rock',
    label: 'Rock art',
    kind: 'rock',
    path: '/assets/props/rock',
    terrains: ['grass', 'dirt', 'stone', 'pebble', 'sand'],
    sprite: { anchorX: 20, anchorY: 44, scale: 1 },
    footprint: { w: 1, h: 1 },
    splitMode: 'flat-contact',
  },
  {
    id: 'fieldstone',
    label: 'Fieldstone art',
    kind: 'rock',
    path: '/assets/props/fieldstone',
    terrains: ['grass', 'dirt', 'stone', 'pebble', 'sand'],
    sprite: { anchorX: 25, anchorY: 46, scale: 1 },
    footprint: { w: 1, h: 1 },
    splitMode: 'flat-contact',
  },
  {
    id: 'boulder',
    label: 'Boulder art',
    kind: 'doodad',
    propKind: 'rock',
    path: '/assets/doodads/boulder',
    terrains: ['stone'],
    sprite: { anchorX: 48, anchorY: 69, scale: 1 },
  },
  {
    id: 'stump',
    label: 'Tree stump art',
    kind: 'doodad',
    propKind: 'tree',
    path: '/assets/doodads/stump',
    terrains: ['dirt'],
    sprite: { anchorX: 48, anchorY: 69, scale: 1 },
  },
  {
    id: 'fern',
    label: 'Fern art',
    kind: 'doodad',
    propKind: 'tree',
    path: '/assets/doodads/fern',
    terrains: ['water'],
    sprite: { anchorX: 48, anchorY: 69, scale: 1 },
  },
  {
    id: 'flower',
    label: 'Flower art',
    kind: 'doodad',
    propKind: 'tree',
    path: '/assets/doodads/flower',
    terrains: ['grass'],
    sprite: { anchorX: 48, anchorY: 69, scale: 1 },
  },
];

export function structureRasterDimensions(path: string): { w: number; h: number } {
  const prefix = path.startsWith('/assets/') ? path.slice('/assets/'.length) : '';
  if (!prefix) throw new Error(`structure art path is not a semantic asset path: ${path}`);
  const back = liveMediaForSlot(`${prefix}/back.png`).media;
  const front = liveMediaForSlot(`${prefix}/front.png`).media;
  if (!back.width || !back.height || !front.width || !front.height) {
    throw new Error(`structure art raster dimensions are missing for ${path}`);
  }
  if (back.width !== front.width || back.height !== front.height) {
    throw new Error(`structure art halves have different raster dimensions for ${path}`);
  }
  return { w: back.width, h: back.height };
}

export function structureArtAsset(id: string): StructureArtAsset | undefined {
  const definition = STRUCTURE_ART_ASSETS.find((asset) => asset.id === id);
  if (!definition) return undefined;
  return {
    ...definition,
    sprite: { ...structureRasterDimensions(definition.path), ...definition.sprite },
  };
}

export function structureArtHalfSrc(id: string, half: 'back' | 'front'): string {
  const definition = STRUCTURE_ART_ASSETS.find((asset) => asset.id === id);
  return `${definition?.path ?? `/assets/props/${id}`}/${half}.png`;
}
