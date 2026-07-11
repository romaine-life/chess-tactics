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
  unitAnchorFraction,
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
import { densityFieldAt, groundCoverSet, resolveGroundCover, type GroundCover } from '../core/groundCover';
import { familyOfTile } from '../core/levelBoard';
import type { TileFamilyId } from '../core/tileSockets';
import type { EditorBoard } from '../ui/boardCode';
import { macroTileAsset, macroTileBreakIndices, macroTileFrame, macroTileOwnedCellIndices, resolveMacroTilePlacements } from '../core/macroTiles';

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
const TERRAIN_TOP_DEPTH_OFFSET = 1000;
const TERRAIN_MACRO_TILE_DEPTH_OFFSET = 2000;
const TERRAIN_FEATURE_DEPTH_OFFSET = 3000;
export const UNIT_IMG_MAX_W = 78;
export const UNIT_IMG_MAX_H = 92;

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
  /** Board-space polygon paths used to expose broken cells inside a composite terrain image. */
  clipPolygons?: number[][];
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

function terrainCellClipPolygon(index: number, columns: number): number[] {
  const x = index % columns;
  const y = Math.floor(index / columns);
  const { left, top } = boardLabCellPosition({ x, y });
  return [
    left, top - TILE_STEP_Y,
    left + TILE_STEP_X, top,
    left, top + TILE_STEP_Y,
    left - TILE_STEP_X, top,
  ];
}

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
  const occupiedTerrain = new Set(
    Object.entries(board.cells)
      .filter(([, id]) => !!resolveTile(id))
      .map(([key]) => key),
  );
  const acceptedMacroTiles = resolveMacroTilePlacements({
    placements: board.macroTiles,
    columns: board.cols,
    rows: board.rows,
    familyAt: (x, y) => familyOfTile(board.cells[`${x},${y}`] ?? ''),
  });
  const macroOwnedTerrain = new Set<string>();
  for (const placement of acceptedMacroTiles) {
    for (const index of macroTileOwnedCellIndices(placement, board.cols, board.rows)) {
      macroOwnedTerrain.add(`${index % board.cols},${Math.floor(index / board.cols)}`);
    }
  }

  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x},${y}`;
      const { left, top, zIndex } = boardLabCellPosition({ x, y });
      const frameX = left - TILE_STEP_X;
      const frameY = top - TILE_EQUATOR;

      const tile = board.cells[key] ? resolveTile(board.cells[key]) : undefined;
      if (tile) {
        const frameSrc = assetFrameSrc(tile, 0);
        const drawSide = !occupiedTerrain.has(`${x + 1},${y}`) || !occupiedTerrain.has(`${x},${y + 1}`);
        if (drawSide) {
          ops.push({ src: frameSrc.replace(/\.png$/, '-side.png'), dx: frameX, dy: frameY, dw: TILE_FRAME_W, dh: TILE_FRAME_H, z: zIndex });
        }
        if (!macroOwnedTerrain.has(key)) {
          ops.push({ src: frameSrc.replace(/\.png$/, '-top.png'), dx: frameX, dy: frameY, dw: TILE_FRAME_W, dh: TILE_FRAME_H, z: TERRAIN_TOP_DEPTH_OFFSET + zIndex });
        }
      }

      const feature = overlays[key];
      if (feature) {
        ops.push({
          src: featureFrameSrc(feature.kind, feature.material, feature.mask),
          dx: frameX,
          dy: frameY,
          dw: TILE_FRAME_W,
          dh: TILE_FRAME_H,
          z: TERRAIN_FEATURE_DEPTH_OFFSET + zIndex,
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

  for (const placement of acceptedMacroTiles) {
    const asset = macroTileAsset(placement.assetId);
    if (!asset) continue;
    const { left, top } = boardLabCellPosition(placement);
    const frame = macroTileFrame(asset);
    const breaks = macroTileBreakIndices(placement);
    const clipPolygons = breaks.length > 0
      ? macroTileOwnedCellIndices(placement, board.cols, board.rows).map((index) => terrainCellClipPolygon(index, board.cols))
      : undefined;
    ops.push({
      src: asset.src,
      dx: left + frame.left,
      dy: top + frame.top,
      dw: frame.width,
      dh: frame.height,
      z: TERRAIN_MACRO_TILE_DEPTH_OFFSET,
      ...(clipPolygons ? { clipPolygons } : {}),
    });
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
      const nativeScale = unit.nativeScalePercent / 100;
      const seatW = UNIT_SEAT_W * nativeScale * scale;
      const seatH = UNIT_SEAT_H * nativeScale * scale;
      const imageW = Math.min(UNIT_IMG_MAX_W, unit.footprint.sourceCanvasPx) * scale;
      const imageH = Math.min(UNIT_IMG_MAX_H, unit.footprint.sourceCanvasHeightPx) * scale;
      const seatX = left - unitAnchorFraction(unit.unitAnchorX) * seatW;
      const seatY = top - unitAnchorFraction(unit.unitAnchorY) * seatH;
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
  // An EditorBoard is exact authoring data: an empty cover map means bare terrain, just as it
  // does in the live editor and exact-board play path. Legacy generated game states can opt
  // into ambient fallback explicitly while they are being adapted for the shared renderer.
  const hasPaintedCover = Object.keys(board.cover ?? {}).length > 0;
  const ambientCover = options.ambientCover ?? false;
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
  const macroTiles = [...(board.macroTiles ?? [])]
    .sort((a, b) => a.y - b.y || a.x - b.x || a.assetId.localeCompare(b.assetId));
  const parts = [
    `c${board.cols}`,
    `r${board.rows}`,
    `t:${sortedEntries(board.cells)}`,
    `mt:${JSON.stringify(macroTiles)}`,
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
