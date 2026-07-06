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

export const STRUCTURE_ART_ASSETS: StructureArtAsset[] = [
  {
    id: 'oak',
    label: 'Oak tree art',
    kind: 'tree',
    path: '/assets/props/oak',
    terrains: ['grass', 'dirt'],
    sprite: { w: 192, h: 300, anchorX: 96, anchorY: 255, scale: 1 },
    footprint: { w: 2, h: 2 },
  },
  {
    id: 'cottage',
    label: 'Cottage art',
    kind: 'house',
    path: '/assets/props/cottage',
    terrains: ['grass', 'dirt', 'stone'],
    sprite: { w: 177, h: 184, anchorX: 91, anchorY: 110, scale: 0.62 },
    footprint: { w: 2, h: 2 },
    splitMode: 'flat-contact',
  },
  {
    id: 'cabin',
    label: 'Log cabin art',
    kind: 'house',
    path: '/assets/props/cabin',
    terrains: ['grass', 'dirt', 'stone'],
    sprite: { w: 220, h: 176, anchorX: 118, anchorY: 107, scale: 0.35 },
    footprint: { w: 1, h: 1 },
    splitMode: 'flat-contact',
  },
  {
    id: 'lodge',
    label: 'Green-roof house art',
    kind: 'house',
    path: '/assets/props/lodge',
    terrains: ['grass', 'dirt', 'stone'],
    sprite: { w: 210, h: 177, anchorX: 103, anchorY: 126, scale: 1 },
    footprint: { w: 2, h: 2 },
    splitMode: 'flat-contact',
  },
  {
    id: 'rock',
    label: 'Rock art',
    kind: 'rock',
    path: '/assets/props/rock',
    terrains: ['grass', 'dirt', 'stone', 'pebble', 'sand'],
    sprite: { w: 40, h: 45, anchorX: 20, anchorY: 44, scale: 1 },
    footprint: { w: 1, h: 1 },
    splitMode: 'flat-contact',
  },
  {
    id: 'fieldstone',
    label: 'Fieldstone art',
    kind: 'rock',
    path: '/assets/props/fieldstone',
    terrains: ['grass', 'dirt', 'stone', 'pebble', 'sand'],
    sprite: { w: 51, h: 47, anchorX: 25, anchorY: 46, scale: 1 },
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
    sprite: { w: 96, h: 180, anchorX: 48, anchorY: 69, scale: 1 },
  },
  {
    id: 'stump',
    label: 'Tree stump art',
    kind: 'doodad',
    propKind: 'tree',
    path: '/assets/doodads/stump',
    terrains: ['dirt'],
    sprite: { w: 96, h: 180, anchorX: 48, anchorY: 69, scale: 1 },
  },
  {
    id: 'fern',
    label: 'Fern art',
    kind: 'doodad',
    propKind: 'tree',
    path: '/assets/doodads/fern',
    terrains: ['water'],
    sprite: { w: 96, h: 180, anchorX: 48, anchorY: 69, scale: 1 },
  },
  {
    id: 'flower',
    label: 'Flower art',
    kind: 'doodad',
    propKind: 'tree',
    path: '/assets/doodads/flower',
    terrains: ['grass'],
    sprite: { w: 96, h: 180, anchorX: 48, anchorY: 69, scale: 1 },
  },
];

export function structureArtAsset(id: string): StructureArtAsset | undefined {
  return STRUCTURE_ART_ASSETS.find((asset) => asset.id === id);
}

export function structureArtHalfSrc(id: string, half: 'back' | 'front'): string {
  const asset = structureArtAsset(id);
  return `${asset?.path ?? `/assets/props/${id}`}/${half}.png`;
}
