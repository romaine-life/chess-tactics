import { drawableAssets } from '../art/drawableCatalog';
import { rookDirections, type Direction } from '../ui/unitCatalog';

export type StructureArtKind = 'tree' | 'house' | 'rock' | 'doodad' | 'landmark';
export type StructureSplitMode = 'authored' | 'flat-contact';

export interface StructureArtAsset {
  id: string;
  label: string;
  kind: StructureArtKind;
  /** Visual-reference media that deliberately does not synthesize a prop or doodad definition. */
  sourceOnly: boolean;
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
  const {
    value, structureKind, sourceOnly: rawSourceOnly, propKind, terrains, blocking,
    anchorX, anchorY, scale, footprint, splitMode,
  } = asset.behavior;
  const sourceOnly = rawSourceOnly === true;
  if ((structureKind !== 'tree' && structureKind !== 'house' && structureKind !== 'rock'
      && structureKind !== 'doodad' && structureKind !== 'landmark')
    || (structureKind === 'landmark' && !sourceOnly)
    || (!sourceOnly && (!Array.isArray(terrains) || terrains.length === 0
      || terrains.some((terrain) => typeof terrain !== 'string' || !terrain)))
    || (!sourceOnly && typeof blocking !== 'boolean')
    || !Number.isFinite(anchorX) || !Number.isFinite(anchorY)
    || !(typeof scale === 'number' && Number.isFinite(scale) && scale > 0)
    || (splitMode !== 'authored' && splitMode !== 'flat-contact')) {
    throw new Error(`structure ${asset.id} lacks placement behavior`);
  }
  if (!sourceOnly && structureKind !== 'doodad' && (!footprint || typeof footprint !== 'object'
    || !Number.isSafeInteger((footprint as { w?: unknown }).w) || Number((footprint as { w: number }).w) < 1
    || !Number.isSafeInteger((footprint as { h?: unknown }).h) || Number((footprint as { h: number }).h) < 1)) {
    throw new Error(`structure ${asset.id} lacks an explicit footprint`);
  }
  return {
    id: typeof value === 'string' ? value : asset.id, label: asset.label, kind: structureKind as StructureArtKind,
    sourceOnly,
    ...(typeof propKind === 'string' ? { propKind: propKind as StructureArtDefinition['propKind'] } : {}),
    terrains: sourceOnly ? [] : terrains as string[],
    blocking: sourceOnly ? false : blocking as boolean,
    sprite: { anchorX: Number(anchorX), anchorY: Number(anchorY), scale },
    ...(footprint && typeof footprint === 'object' ? { footprint: footprint as { w: number; h: number } } : {}),
    splitMode,
  };
});

export const STRUCTURE_ART_ASSETS: StructureArtDefinition[] = new Proxy([] as StructureArtDefinition[], {
  get: (_target, property) => {
    const current = definitions();
    const value = Reflect.get(current, property);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});

function structureRecord(id: string) {
  return drawableAssets('structure').find((asset) => (asset.behavior.value ?? asset.id) === id);
}

function directionMediaRole(direction: Direction, half: 'back' | 'front'): string {
  return `${direction}-${half}`;
}

/**
 * The media an INSTALLED prop or doodad draws: its authored `back`/`front` halves, whose frame
 * geometry the seat document's contact anchor and render scale are calibrated against. A later
 * eight-way turntable installs `south-back`/`south-front` as SOURCE artwork for floating
 * placement; that view has its own frame size and framing, so it must never displace the
 * authored halves here — doing so silently reseats and resizes every placed prop. A source-only
 * asset has no authored halves at all, so its south view is its nominal frame.
 */
function installedMedia(id: string, half: 'back' | 'front') {
  const record = structureRecord(id);
  if (!record) return undefined;
  return record.media[half]?.media ?? record.media[directionMediaRole('south', half)]?.media;
}

function directionMedia(id: string, direction: Direction, half: 'back' | 'front') {
  const record = structureRecord(id);
  if (!record) return undefined;
  const explicit = record.media[directionMediaRole(direction, half)]?.media;
  return explicit ?? (direction === 'south' ? record.media[half]?.media : undefined);
}

function pairDimensions(
  id: string,
  back: ReturnType<typeof installedMedia>,
  front: ReturnType<typeof installedMedia>,
): { w: number; h: number } {
  if (!back || !front) throw new Error(`structure art media is missing for ${id}`);
  if (!back.width || !back.height || !front.width || !front.height) {
    throw new Error(`structure art raster dimensions are missing for ${id}`);
  }
  if (back.width !== front.width || back.height !== front.height) {
    throw new Error(`structure art halves have different raster dimensions for ${id}`);
  }
  return { w: back.width, h: back.height };
}

/** The installed drawing frame — what a placed prop/doodad is seated and scaled against. */
export function structureRasterDimensions(id: string): { w: number; h: number } {
  return pairDimensions(id, installedMedia(id, 'back'), installedMedia(id, 'front'));
}

/** The frame of one directional SOURCE view, used only by floating artwork placement. */
export function structureArtDirectionRasterDimensions(id: string, direction: Direction): { w: number; h: number } {
  return pairDimensions(id, directionMedia(id, direction, 'back'), directionMedia(id, direction, 'front'));
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
  const media = installedMedia(id, half);
  if (!media) throw new Error(`structure ${id} has no ${half} media`);
  return media.immutableUrl;
}

/** Installed directional views with complete, same-size back/front media pairs. */
export function structureArtDirections(id: string): Direction[] {
  return rookDirections.filter((direction) => {
    const back = directionMedia(id, direction, 'back');
    const front = directionMedia(id, direction, 'front');
    return !!back
      && !!front
      && !!back.width
      && !!back.height
      && back.width === front.width
      && back.height === front.height;
  });
}

export function structureArtHasCompleteTurntable(id: string): boolean {
  const installed = structureArtDirections(id);
  return installed.length === rookDirections.length
    && rookDirections.every((direction) => installed.includes(direction));
}

/**
 * Resolve the source geometry for one real rendered view. Direction metadata is optional; absent
 * fields inherit the installed source's south/default contact calibration.
 */
export function structureArtDirectionSprite(
  id: string,
  direction: Direction,
): StructureArtAsset['sprite'] | undefined {
  if (!structureArtDirections(id).includes(direction)) return undefined;
  const base = structureArtAsset(id);
  const rawDirections = structureRecord(id)?.behavior.directions;
  const override = rawDirections && typeof rawDirections === 'object' && !Array.isArray(rawDirections)
    ? (rawDirections as Record<string, unknown>)[direction]
    : undefined;
  const record = override && typeof override === 'object' && !Array.isArray(override)
    ? override as Record<string, unknown>
    : {};
  const anchorX = Number(record.anchorX);
  const anchorY = Number(record.anchorY);
  const scale = Number(record.scale);
  if (!base) return undefined;
  return {
    ...structureArtDirectionRasterDimensions(id, direction),
    anchorX: Number.isFinite(anchorX) ? anchorX : base.sprite.anchorX,
    anchorY: Number.isFinite(anchorY) ? anchorY : base.sprite.anchorY,
    scale: Number.isFinite(scale) && scale > 0 ? scale : base.sprite.scale,
  };
}

/** A directional source-art view may be a full flat render even when the legacy prop uses split halves. */
export function structureArtDirectionSplitMode(id: string, direction: Direction): StructureSplitMode {
  const base = structureArtAsset(id)?.splitMode ?? 'authored';
  const rawDirections = structureRecord(id)?.behavior.directions;
  const override = rawDirections && typeof rawDirections === 'object' && !Array.isArray(rawDirections)
    ? (rawDirections as Record<string, unknown>)[direction]
    : undefined;
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const splitMode = (override as Record<string, unknown>).splitMode;
  return splitMode === 'authored' || splitMode === 'flat-contact' ? splitMode : base;
}

export function structureArtDirectionHalfSrc(
  id: string,
  direction: Direction,
  half: 'back' | 'front',
): string {
  const media = directionMedia(id, direction, half);
  if (!media) throw new Error(`structure ${id} has no ${direction} ${half} media`);
  return media.immutableUrl;
}
