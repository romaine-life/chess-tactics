// The doodad shelf: decorative props a unit can stand *inside*. Each doodad ships as a
// back/front sprite pair (rendered from Blender, split at the contact plane) so the unit
// sorts between them — back tucks behind, front falls over the shins. Mirrors unitCatalog.

import { currentSeats, propDef, structurePartsFromSeat, type StructurePart, type StructureSourceRef } from '../core/props';
import { STRUCTURE_ART_ASSETS, structureArtAsset, structureArtHalfSrc } from '../core/structureArt';

export interface DoodadAsset {
  id: string;
  label: string;
  status: string;
  /** Home terrain(s) this doodad belongs on — terrain/family ids ('grass' | 'stone' | 'water'),
   *  the same vocabulary tiles carry. The board brush HARD-gates on this: a doodad only places on
   *  a tile whose family is in this list (a grass tuft refuses stone/water). Empty ⇒ places nowhere. */
  terrains: string[];
  /** Ground-contact-anchored sprite halves; raster size comes from live media. */
  back: string;
  front: string;
  /** Optional frame geometry for authored doodads that share non-doodad source art. */
  sprite?: { w: number; h: number; anchorX: number; anchorY: number; scale?: number };
  source?: StructureSourceRef;
  parts?: StructurePart[];
}

const sourceSpritePath = (source: StructureSourceRef, half: 'back' | 'front'): string => {
  if (source.kind === 'asset') return structureArtHalfSrc(source.id, half);
  if (source.kind === 'doodad') return sprite(source.id, half);
  const def = propDef(source.id);
  if (def?.spriteParts?.length) return sourceSpritePath(def.spriteParts[0].source, half);
  if (def?.spriteSource && (def.spriteSource.kind !== 'prop' || def.spriteSource.id !== source.id)) {
    return sourceSpritePath(def.spriteSource, half);
  }
  throw new Error(`doodad source "${source.id}" has no DB-owned drawable media`);
};
const sprite = (id: string, half: 'back' | 'front') => structureArtHalfSrc(id, half);
const doodadFromArt = (id: string, label: string): DoodadAsset => {
  const art = structureArtAsset(id);
  if (!art) throw new Error(`required doodad art definition "${id}" is missing`);
  const spriteFrame = art.sprite;
  const source: StructureSourceRef = { kind: 'asset', id };
  return {
    id,
    label,
    status: 'render',
    terrains: art.terrains,
    back: sourceSpritePath(source, 'back'),
    front: sourceSpritePath(source, 'front'),
    sprite: spriteFrame,
    source,
    parts: [{ source, anchorX: spriteFrame.anchorX, anchorY: spriteFrame.anchorY, scale: spriteFrame.scale ?? 1 }],
  };
};

// Grass tuft retired: ambient grass is now the general ground-cover tile feature
// (core/groundCover + the board scene canvas), not a placed doodad. The glossary keeps the
// grass-tuft sprites only as a static figure illustrating the back/front split.
export const DOODAD_ASSETS: Array<{ id: string; label: string }> = new Proxy([], {
  get: (_target, property) => {
    const current = STRUCTURE_ART_ASSETS.filter((asset) => asset.kind === 'doodad').map(({ id, label }) => ({ id, label }));
    const value = Reflect.get(current, property);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});

function baseDoodadAssets(): DoodadAsset[] {
  return DOODAD_ASSETS.map(({ id, label }) => doodadFromArt(id, label));
}

export function currentDoodadAssets(): DoodadAsset[] {
  const bases = baseDoodadAssets();
  const byBaseId = new Map(bases.map((asset) => [asset.id, asset]));
  const byId = new Map(bases.map((asset) => [asset.id, asset]));
  for (const [id, seat] of Object.entries(currentSeats())) {
    if (seat.placement !== 'doodad') continue;
    const parts = structurePartsFromSeat(seat);
    if (!parts.length) continue;
    const source = parts[0].source;
    const sourceArt = source.kind === 'asset' ? structureArtAsset(source.id) : undefined;
    const sourceProp = source.kind === 'prop' ? propDef(source.id) : undefined;
    const sourceDoodad = source.kind === 'doodad' ? byBaseId.get(source.id) : undefined;
    const sourceGeometry = sourceArt?.sprite ?? sourceProp?.sprite ?? sourceDoodad?.sprite;
    if (!sourceGeometry) throw new Error(`doodad "${id}" source "${source.id}" has no live raster geometry`);
    const sourceTerrains = sourceArt?.terrains ?? sourceProp?.terrains ?? sourceDoodad?.terrains;
    if (!sourceTerrains?.length) throw new Error(`doodad "${id}" source "${source.id}" has no installed terrain membership`);
    byId.set(id, {
      id,
      label: seat.label ?? id,
      status: 'authored',
      terrains: seat.terrains ?? sourceTerrains,
      back: sourceSpritePath(source, 'back'),
      front: sourceSpritePath(source, 'front'),
      source,
      parts,
      sprite: { w: sourceGeometry.w, h: sourceGeometry.h, anchorX: parts[0].anchorX, anchorY: parts[0].anchorY, scale: parts[0].scale },
    });
  }
  return [...byId.values()];
}

export const doodadAsset = (id: string): DoodadAsset => {
  const assets = currentDoodadAssets();
  return assets.find((d) => d.id === id) ?? assets[0];
};
