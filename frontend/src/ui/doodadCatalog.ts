// The doodad shelf: decorative props a unit can stand *inside*. Each doodad ships as a
// back/front sprite pair (rendered from Blender, split at the contact plane) so the unit
// sorts between them — back tucks behind, front falls over the shins. Mirrors unitCatalog.

import { currentSeats, propDef, structurePartsFromSeat, type StructurePart, type StructureSourceRef } from '../core/props';
import { structureArtAsset, structureArtHalfSrc } from '../core/structureArt';

export interface DoodadAsset {
  id: string;
  label: string;
  status: string;
  /** Home terrain(s) this doodad belongs on — terrain/family ids ('grass' | 'stone' | 'water'),
   *  the same vocabulary tiles carry. The board brush HARD-gates on this: a doodad only places on
   *  a tile whose family is in this list (a grass tuft refuses stone/water). Empty ⇒ places nowhere. */
  terrains: string[];
  /** ground-contact-anchored sprite halves (96x180, anchor at pixel 48,69). */
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
  return `/assets/props/${def?.spriteId ?? source.id}/${half}.png`;
};
const DOODAD_SPRITE = { w: 96, h: 180, anchorX: 48, anchorY: 69, scale: 1 } as const;
const sprite = (id: string, half: 'back' | 'front') => structureArtHalfSrc(id, half);
const doodadFromArt = (id: string, label: string): DoodadAsset => {
  const art = structureArtAsset(id);
  const spriteFrame = art?.sprite ?? DOODAD_SPRITE;
  const source: StructureSourceRef = { kind: 'asset', id };
  return {
    id,
    label,
    status: 'render',
    terrains: art?.terrains ?? [],
    back: sourceSpritePath(source, 'back'),
    front: sourceSpritePath(source, 'front'),
    sprite: spriteFrame,
    source,
    parts: [{ source, anchorX: spriteFrame.anchorX, anchorY: spriteFrame.anchorY, scale: spriteFrame.scale ?? 1 }],
  };
};

// Grass tuft retired: ambient grass is now the general ground-cover tile feature
// (core/groundCover + GroundCoverLayer), not a placed doodad. The glossary keeps the
// grass-tuft sprites only as a static figure illustrating the back/front split.
export const BASE_DOODAD_ASSETS: DoodadAsset[] = [
  doodadFromArt('boulder', 'Boulder'),
  doodadFromArt('stump', 'Tree stump'),
  doodadFromArt('fern', 'Fern'),
  doodadFromArt('flower', 'Flower'),
];

export const DOODAD_ASSETS: DoodadAsset[] = BASE_DOODAD_ASSETS;

export function currentDoodadAssets(): DoodadAsset[] {
  const byBaseId = new Map(BASE_DOODAD_ASSETS.map((asset) => [asset.id, asset]));
  const byId = new Map(BASE_DOODAD_ASSETS.map((asset) => [asset.id, asset]));
  for (const [id, seat] of Object.entries(currentSeats())) {
    if (seat.placement !== 'doodad') continue;
    const parts = structurePartsFromSeat(seat);
    if (!parts.length) continue;
    const source = parts[0].source;
    const sourceArt = source.kind === 'asset' ? structureArtAsset(source.id) : undefined;
    const sourceProp = source.kind === 'prop' ? propDef(source.id) : undefined;
    const sourceDoodad = source.kind === 'doodad' ? byBaseId.get(source.id) : undefined;
    const sourceGeometry = sourceArt?.sprite ?? sourceProp?.sprite ?? sourceDoodad?.sprite ?? DOODAD_SPRITE;
    const sourceTerrains = sourceArt?.terrains ?? sourceProp?.terrains ?? sourceDoodad?.terrains ?? ['grass', 'dirt', 'stone'];
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

export const doodadAsset = (id: string): DoodadAsset => currentDoodadAssets().find((d) => d.id === id) ?? BASE_DOODAD_ASSETS[0];
