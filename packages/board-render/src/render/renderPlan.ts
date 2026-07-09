import { boardLabCellPosition } from './boardProjection';
import {
  TILE_FRAME_EQUATOR_Y,
  TILE_FRAME_HEIGHT,
  TILE_STEP_X,
  TILE_STEP_Y,
} from '../art/projectionContract';
import { studioFamilies, assetFrameSrc, type StudioAsset } from '../ui/studioBoard';
import { featureFrameSrc, fenceFrameSrc, wallFrameSrc } from '../art/tileset';
import {
  unitAssetById,
  hasDirectionSprite,
  MISSING_DIRECTION_SPRITE,
  type UnitAsset,
  type Direction,
  type Faction,
} from '../ui/unitCatalog';
import { doodadAsset, type DoodadAsset } from '../ui/doodadCatalog';
import { resolveFeatureOverlays, resolveFenceOverlays, resolveWallOverlays } from '../core/featureAutotile';
import { resolveWallArtFaces, slotSource, wallArtSlotsForFace } from '../core/wallArt';
import { flatContactClipRects, propZBracket, structureSeatPoint, structureSourceHalfSrc, structureSourceSprite, structureSourceSplitMode } from './structureGeometry';
import { fenceOverlayZIndex, groundCoverZIndex, objectBaseZIndex, wallArtOverlayZIndex, wallOverlayZIndex } from './sceneDepth';
import { propDef, type StructureSourceRef } from '../core/props';
import { groundCoverSet, resolveGroundCover, densityFieldAt, type GroundCover } from '../core/groundCover';
import { familyOfTile } from '../core/levelBoard';
import type { TileFamilyId } from '../core/tileSockets';
import type { EditorBoard } from '../ui/boardCode';

const TILE_FRAME_W = TILE_STEP_X * 2;
const TILE_FRAME_H = TILE_FRAME_HEIGHT;
const TILE_EQUATOR = TILE_FRAME_EQUATOR_Y;
const WALL_FRAME_W = 128;
const WALL_FRAME_H = 240;
const WALL_ANCHOR_X = 64;
const WALL_ANCHOR_Y = 96;
const DOODAD_FRAME_W = TILE_FRAME_W;
const DOODAD_FRAME_H = TILE_FRAME_H;
const DOODAD_ANCHOR_Y = 69;
const UNIT_SEAT_W = 72;
const UNIT_SEAT_H = 86;
export const UNIT_IMG_MAX_W = 78;
export const UNIT_IMG_MAX_H = 92;

const unitAnchorFraction = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return value.trim().endsWith('%') ? parsed / 100 : parsed;
};

export interface BoardDrawOp {
  src: string;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  z: number;
  contain?: boolean;
  flipX?: boolean;
  opacity?: number;
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
}

export interface BakeBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export type RenderBoard = EditorBoard;

export interface BoardDrawOptions {
  coverSeed?: number;
  ambientCover?: boolean;
}

const studioTiles: StudioAsset[] = studioFamilies.flatMap((family) => family.assets);
const resolveTile = (id: string): StudioAsset | undefined => studioTiles.find((asset) => asset.id === id);
const resolveUnit = (id: string): UnitAsset | undefined => unitAssetById(id);
const resolveDoodad = (id: string): DoodadAsset | undefined => doodadAsset(id);

function pushStructureDrawOps(
  ops: BoardDrawOp[],
  source: StructureSourceRef,
  sourceSprite: { w: number; h: number },
  anchorY: number,
  scale: number,
  dx: number,
  dy: number,
  backZ: number,
  frontZ: number,
): void {
  const fullW = sourceSprite.w * scale;
  const fullH = sourceSprite.h * scale;
  if (structureSourceSplitMode(source) !== 'flat-contact') {
    ops.push({ src: structureSourceHalfSrc(source, 'back'), dx, dy, dw: fullW, dh: fullH, z: backZ });
    ops.push({ src: structureSourceHalfSrc(source, 'front'), dx, dy, dw: fullW, dh: fullH, z: frontZ });
    return;
  }

  const clips = flatContactClipRects({ w: sourceSprite.w, h: sourceSprite.h, anchorY });
  if (clips.back.sh > 0) {
    ops.push({
      src: structureSourceHalfSrc(source, 'back'),
      sx: clips.back.sx,
      sy: clips.back.sy,
      sw: clips.back.sw,
      sh: clips.back.sh,
      dx,
      dy,
      dw: fullW,
      dh: clips.back.sh * scale,
      z: backZ,
    });
  }
  if (clips.front.sh > 0) {
    ops.push({
      src: structureSourceHalfSrc(source, 'front'),
      sx: clips.front.sx,
      sy: clips.front.sy,
      sw: clips.front.sw,
      sh: clips.front.sh,
      dx,
      dy: dy + clips.front.sy * scale,
      dw: fullW,
      dh: clips.front.sh * scale,
      z: frontZ,
    });
  }
}

export function boardDrawOps(board: RenderBoard, options: BoardDrawOptions = {}): BoardDrawOp[] {
  const ops: BoardDrawOp[] = [];

  const isSevered = (edge: string): boolean => board.featureCuts[edge] === true;
  const isExit = (edge: string): boolean => board.featureExits[edge] === true;
  const overlays = resolveFeatureOverlays(board.features, isSevered, isExit);
  const fenceOverlays = resolveFenceOverlays(board.fences ?? {});
  const wallBounds = { cols: board.cols, rows: board.rows };
  const wallOverlays = resolveWallOverlays(board.walls ?? {}, wallBounds);
  const wallFaceStyles = resolveWallArtFaces(board.wallArt, wallBounds);

  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      const { left, top, zIndex } = boardLabCellPosition({ x, y });
      const frameX = left - TILE_STEP_X;
      const frameY = top - TILE_EQUATOR;

      const tile = board.cells[key] ? resolveTile(board.cells[key]) : undefined;
      if (tile) {
        ops.push({ src: assetFrameSrc(tile, 0), dx: frameX, dy: frameY, dw: TILE_FRAME_W, dh: TILE_FRAME_H, z: zIndex });
      }

      const feature = overlays[key];
      if (feature) {
        ops.push({
          src: featureFrameSrc(feature.kind, feature.material, feature.mask),
          dx: frameX,
          dy: frameY,
          dw: TILE_FRAME_W,
          dh: TILE_FRAME_H,
          z: zIndex + 0.5,
        });
      }

      const fence = fenceOverlays.get(key);
      const wall = wallOverlays.get(key);
      if (wall) {
        const wallZ = wallOverlayZIndex({ x, y });
        ops.push({
          src: wallFrameSrc(wall.material, wall.mask),
          dx: left - WALL_ANCHOR_X,
          dy: top - WALL_ANCHOR_Y,
          dw: WALL_FRAME_W,
          dh: WALL_FRAME_H,
          z: wallZ,
        });
        const faceStyles = wallFaceStyles.get(key);
        for (const face of ['west', 'north'] as const) {
          const maskBit = face === 'west' ? 8 : 1;
          if (!(wall.mask & maskBit)) continue;
          for (const slot of wallArtSlotsForFace(faceStyles?.[face], face)) {
            const faceAsset = slotSource(slot).faces[face];
            ops.push({
              src: faceAsset.src,
              dx: left - WALL_ANCHOR_X + slot.x - faceAsset.mountX * slot.scale,
              dy: top - WALL_ANCHOR_Y + slot.y - faceAsset.mountY * slot.scale,
              dw: faceAsset.width * slot.scale,
              dh: faceAsset.height * slot.scale,
              z: wallArtOverlayZIndex({ x, y }),
            });
          }
        }
      }

      if (fence) {
        ops.push({
          src: fenceFrameSrc(fence.material, fence.mask),
          dx: frameX,
          dy: frameY,
          dw: TILE_FRAME_W,
          dh: TILE_FRAME_H,
          z: fenceOverlayZIndex({ x, y }),
        });
      }
    }
  }

  for (const key of new Set([...Object.keys(board.units), ...Object.keys(board.doodads)])) {
    const [x, y] = key.split(',').map(Number);
    const { left, top } = boardLabCellPosition({ x, y });
    const base = objectBaseZIndex({ x, y });

    const doodadPlacement = board.doodads[key];
    const doodad = doodadPlacement ? resolveDoodad(doodadPlacement.doodadId) : undefined;
    if (doodad) {
      const sprite = doodad.sprite ?? { w: DOODAD_FRAME_W, h: DOODAD_FRAME_H, anchorX: TILE_STEP_X, anchorY: DOODAD_ANCHOR_Y };
      const parts = doodad.parts?.length
        ? doodad.parts
        : [{ source: doodad.source ?? { kind: 'doodad' as const, id: doodad.id }, anchorX: sprite.anchorX, anchorY: sprite.anchorY, scale: sprite.scale ?? 1 }];
      for (const part of parts) {
        const sourceSprite = structureSourceSprite(part.source);
        const scale = part.scale ?? 1;
        pushStructureDrawOps(
          ops,
          part.source,
          sourceSprite,
          part.anchorY,
          scale,
          left - part.anchorX * scale,
          top - part.anchorY * scale,
          base - 1,
          base + 1,
        );
      }
    }

    const placement = board.units[key];
    const unit = placement ? resolveUnit(placement.unitId) : undefined;
    if (unit && placement) {
      const direction = placement.direction as Direction;
      const src = hasDirectionSprite(unit, direction)
        ? unit.sprite(placement.faction as Faction, direction)
        : MISSING_DIRECTION_SPRITE;
      const scale = unit.defaultScale / 100;
      const seatW = UNIT_SEAT_W * scale;
      const seatH = UNIT_SEAT_H * scale;
      const imageW = UNIT_IMG_MAX_W * scale;
      const imageH = UNIT_IMG_MAX_H * scale;
      const seatX = left - unitAnchorFraction(unit.unitAnchorX, 0.5) * seatW;
      const seatY = top - unitAnchorFraction(unit.unitAnchorY, 0.78) * seatH;
      ops.push({
        src,
        dx: seatX + (seatW - imageW) / 2,
        dy: seatY + (seatH - imageH) / 2,
        dw: imageW,
        dh: imageH,
        z: base,
        contain: true,
      });
    }
  }

  for (const [key, placement] of Object.entries(board.props ?? {})) {
    const def = propDef(placement.propId);
    if (!def) continue;
    const [ax, ay] = key.split(',').map(Number);
    const { left, top } = structureSeatPoint({ x: ax, y: ay }, def.w, def.h);
    const { back, front } = propZBracket(ax, ay, def.w, def.h);
    const parts = def.spriteParts?.length
      ? def.spriteParts
      : [{ source: def.spriteSource ?? { kind: 'prop' as const, id: def.spriteId }, anchorX: def.sprite.anchorX, anchorY: def.sprite.anchorY, scale: def.sprite.scale ?? 1 }];
    for (const part of parts) {
      const sourceSprite = structureSourceSprite(part.source);
      const s = part.scale ?? 1;
      const dx = left - part.anchorX * s;
      const dy = top - part.anchorY * s;
      pushStructureDrawOps(ops, part.source, sourceSprite, part.anchorY, s, dx, dy, back, front);
    }
  }

  const COVER_SEED = options.coverSeed ?? 1234;
  const coverCells: Array<{ x: number; y: number; terrain: TileFamilyId; groundCover?: GroundCover }> = [];
  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      const tileId = board.cells[key];
      const tileTerrain = tileId ? familyOfTile(tileId) : undefined;
      const terrain = board.coverTypes?.[key] ?? tileTerrain;
      if (terrain && groundCoverSet(terrain)) coverCells.push({ x, y, terrain });
    }
  }
  const hasPaintedCover = Object.keys(board.cover ?? {}).length > 0;
  const ambientCover = options.ambientCover ?? true;
  resolveGroundCover(coverCells, COVER_SEED, (cell) =>
    board.cover?.[`${cell.x},${cell.y}`] ?? (hasPaintedCover || !ambientCover ? null : densityFieldAt(cell.x, cell.y, COVER_SEED)));
  for (const cell of coverCells) {
    if (!cell.groundCover) continue;
    const set = groundCoverSet(cell.terrain);
    if (!set) continue;
    const { left, top } = boardLabCellPosition(cell);
    for (const tuft of cell.groundCover.tufts) {
      const meta = set.variants.find((v) => v.id === tuft.variant);
      if (!meta) continue;
      ops.push({
        src: `${set.basePath}/v${tuft.variant}.png`,
        sx: 0,
        sy: 0,
        sw: meta.frameW,
        sh: meta.frameH,
        dx: left + tuft.dx - meta.baseX,
        dy: top + tuft.dy - meta.baseY,
        dw: meta.frameW,
        dh: meta.frameH,
        z: groundCoverZIndex(cell, tuft.dy),
        flipX: tuft.flip,
      });
    }
  }

  ops.sort((a, b) => a.z - b.z);
  return ops;
}

export function uniqueDrawSrcs(board: RenderBoard, options: BoardDrawOptions = {}): string[] {
  return [...new Set(boardDrawOps(board, options).map((op) => op.src))];
}

export function boardContentHash(board: RenderBoard): string {
  const sortedEntries = (record: Record<string, unknown>): string =>
    Object.keys(record)
      .sort()
      .map((key) => `${key}=${JSON.stringify(record[key])}`)
      .join(';');
  const parts = [
    `c${board.cols}`,
    `r${board.rows}`,
    `t:${sortedEntries(board.cells)}`,
    `u:${sortedEntries(board.units)}`,
    `d:${sortedEntries(board.doodads)}`,
    `p:${sortedEntries(board.props ?? {})}`,
    `v:${sortedEntries(board.cover)}`,
    `ct:${sortedEntries(board.coverTypes ?? {})}`,
    `f:${sortedEntries(board.features)}`,
    `fe:${sortedEntries(board.fences ?? {})}`,
    `wl:${sortedEntries(board.walls ?? {})}`,
    `wa:${sortedEntries(board.wallArt ?? {})}`,
    `x:${sortedEntries(board.featureCuts)}`,
    `xe:${sortedEntries(board.featureExits)}`,
  ];
  return fnv1a(parts.join('|'));
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function boardBounds(board: RenderBoard, options: BoardDrawOptions = {}): BakeBounds {
  const ops = boardDrawOps(board, options);
  if (ops.length === 0) {
    return { minX: -TILE_STEP_X, minY: -TILE_EQUATOR, width: TILE_FRAME_W, height: TILE_FRAME_H };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const op of ops) {
    minX = Math.min(minX, op.dx);
    minY = Math.min(minY, op.dy);
    maxX = Math.max(maxX, op.dx + op.dw);
    maxY = Math.max(maxY, op.dy + op.dh);
  }
  return { minX, minY, width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY) };
}

export function boardSocialFramingBounds(board: RenderBoard): BakeBounds {
  const drawBounds = boardBounds(board);
  let surfaceMaxY = -Infinity;
  for (const key of Object.keys(board.cells)) {
    const [x, y] = key.split(',').map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    const { top } = boardLabCellPosition({ x, y });
    surfaceMaxY = Math.max(surfaceMaxY, top + TILE_STEP_Y);
  }
  if (!Number.isFinite(surfaceMaxY)) return drawBounds;

  return {
    minX: drawBounds.minX,
    minY: drawBounds.minY,
    width: drawBounds.width,
    height: Math.max(1, Math.ceil(surfaceMaxY - drawBounds.minY)),
  };
}

export const BAKE_GEOMETRY = { TILE_FRAME_W, TILE_FRAME_H, TILE_STEP_X, TILE_STEP_Y, TILE_EQUATOR } as const;
