import { boardLabCellPosition } from './boardProjection';
import { TILE_TEMPLATE } from '../art/tileTemplate';
import { propDef, type StructureSourceRef } from '../core/props';
import { structureArtAsset, structureArtHalfSrc, type StructureSplitMode } from '../core/structureArt';
import { doodadAsset } from '../ui/doodadCatalog';
import { objectBaseZIndex, structureBackZIndex, structureFrontZIndex } from './sceneDepth';

const DOODAD_SPRITE = { w: 96, h: 180, anchorX: 48, anchorY: 69 } as const;
export type { StructureSplitMode } from '../core/structureArt';

export function propZBracket(ax: number, ay: number, w: number, h: number): { base: number; back: number; front: number } {
  const backCell = { x: ax, y: ay };
  const frontCell = { x: ax + w - 1, y: ay + h - 1 };
  const base = objectBaseZIndex(frontCell);
  return { base, back: structureBackZIndex(backCell), front: structureFrontZIndex(frontCell) };
}

export function seatTransformPercent(sprite: { w: number; h: number; anchorX: number; anchorY: number }): { x: number; y: number } {
  return { x: -(sprite.anchorX / sprite.w) * 100, y: -(sprite.anchorY / sprite.h) * 100 };
}

export function flatContactSplitPercent(sprite: { h: number; anchorY: number }): number {
  return (Math.max(0, Math.min(sprite.h, sprite.anchorY)) / sprite.h) * 100;
}

export function flatContactClipRects(sprite: { w: number; h: number; anchorY: number }): {
  back: { sx: number; sy: number; sw: number; sh: number };
  front: { sx: number; sy: number; sw: number; sh: number };
} {
  const splitY = Math.max(0, Math.min(sprite.h, Math.round(sprite.anchorY)));
  return {
    back: { sx: 0, sy: 0, sw: sprite.w, sh: splitY },
    front: { sx: 0, sy: splitY, sw: sprite.w, sh: sprite.h - splitY },
  };
}

export function structureSeatPoint(anchor: { x: number; y: number }, w: number, h: number): { left: number; top: number } {
  const base0 = boardLabCellPosition(anchor);
  return {
    left: base0.left + (((w - 1) - (h - 1)) / 2) * TILE_TEMPLATE.stepX,
    top: base0.top + (((w - 1) + (h - 1)) / 2) * TILE_TEMPLATE.stepY,
  };
}

export function propHalfSrc(propId: string, half: 'back' | 'front'): string {
  return `/assets/props/${propId}/${half}.png`;
}

export function structureSourceHalfSrc(source: StructureSourceRef, half: 'back' | 'front'): string {
  if (source.kind === 'asset') return structureArtHalfSrc(source.id, half);
  if (source.kind === 'doodad') return `/assets/doodads/${source.id}/${half}.png`;
  const def = propDef(source.id);
  if (def?.spriteParts?.length) return structureSourceHalfSrc(def.spriteParts[0].source, half);
  if (def?.spriteSource && (def.spriteSource.kind !== 'prop' || def.spriteSource.id !== source.id)) {
    return structureSourceHalfSrc(def.spriteSource, half);
  }
  return propHalfSrc(def?.spriteId ?? source.id, half);
}

export function structureSourceSprite(source: StructureSourceRef): { w: number; h: number; anchorX: number; anchorY: number; scale?: number } {
  if (source.kind === 'asset') return structureArtAsset(source.id)?.sprite ?? DOODAD_SPRITE;
  if (source.kind === 'prop') return propDef(source.id)?.sprite ?? DOODAD_SPRITE;
  return doodadAsset(source.id).sprite ?? DOODAD_SPRITE;
}

export function structureSourceSplitMode(source: StructureSourceRef): StructureSplitMode {
  if (source.kind === 'asset') return structureArtAsset(source.id)?.splitMode ?? 'authored';
  if (source.kind === 'prop') {
    const def = propDef(source.id);
    if (def?.spriteParts?.length) return structureSourceSplitMode(def.spriteParts[0].source);
    if (def?.spriteSource && (def.spriteSource.kind !== 'prop' || def.spriteSource.id !== source.id)) {
      return structureSourceSplitMode(def.spriteSource);
    }
    return structureArtAsset(def?.spriteId ?? source.id)?.splitMode ?? 'authored';
  }
  return 'authored';
}
