import { drawableAssets } from '../art/drawableCatalog';

export type StructureArtKind = 'tree' | 'house' | 'rock' | 'doodad';
export type StructureSplitMode = 'authored' | 'flat-contact';

export interface StructureArtAsset {
  id: string;
  label: string;
  kind: StructureArtKind;
  propKind?: 'tree' | 'house' | 'rock';
  terrains: string[];
  blocking: boolean;
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

const definitions = (): StructureArtDefinition[] => drawableAssets('structure').map((asset) => {
  const { value, structureKind, propKind, terrains, blocking, anchorX, anchorY, scale, footprint, splitMode } = asset.behavior;
  if (typeof structureKind !== 'string' || !Array.isArray(terrains) || typeof anchorX !== 'number' || typeof anchorY !== 'number') {
    throw new Error(`structure ${asset.id} lacks placement behavior`);
  }
  return {
    id: typeof value === 'string' ? value : asset.id, label: asset.label, kind: structureKind as StructureArtKind,
    ...(typeof propKind === 'string' ? { propKind: propKind as StructureArtDefinition['propKind'] } : {}),
    terrains: terrains.filter((value): value is string => typeof value === 'string'),
    blocking: blocking !== false,
    sprite: { anchorX, anchorY, scale: typeof scale === 'number' ? scale : 1 },
    ...(footprint && typeof footprint === 'object' ? { footprint: footprint as { w: number; h: number } } : {}),
    ...(splitMode === 'authored' || splitMode === 'flat-contact' ? { splitMode } : {}),
  };
});

export const STRUCTURE_ART_ASSETS: StructureArtDefinition[] = new Proxy([] as StructureArtDefinition[], {
  get: (_target, property) => {
    const current = definitions();
    const value = Reflect.get(current, property);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});

export function structureRasterDimensions(id: string): { w: number; h: number } {
  const record = drawableAssets('structure').find((asset) => (asset.behavior.value ?? asset.id) === id);
  const back = record?.media.back?.media;
  const front = record?.media.front?.media;
  if (!back || !front) throw new Error(`structure art media is missing for ${id}`);
  if (!back.width || !back.height || !front.width || !front.height) {
    throw new Error(`structure art raster dimensions are missing for ${id}`);
  }
  if (back.width !== front.width || back.height !== front.height) {
    throw new Error(`structure art halves have different raster dimensions for ${id}`);
  }
  return { w: back.width, h: back.height };
}

export function structureArtAsset(id: string): StructureArtAsset | undefined {
  const definition = definitions().find((asset) => asset.id === id);
  if (!definition) return undefined;
  return {
    ...definition,
    sprite: { ...structureRasterDimensions(id), ...definition.sprite },
  };
}

export function structureArtHalfSrc(id: string, half: 'back' | 'front'): string {
  const record = drawableAssets('structure').find((asset) => (asset.behavior.value ?? asset.id) === id);
  const media = record?.media[half]?.media;
  if (!media) throw new Error(`structure ${id} has no ${half} media`);
  return media.immutableUrl;
}
