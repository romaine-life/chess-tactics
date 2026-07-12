import { useMemo, type ReactElement } from 'react';
import { type BakeBounds, type BoardDrawOp } from '@chess-tactics/board-render';
import { fenceFrameSrc, fencePostSrc, wallFrameSrc } from '../art/tileset';
import { TILE_FRAME_EQUATOR_Y, TILE_FRAME_HEIGHT, TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import type { ResolvedFenceOverlay, ResolvedFencePost, ResolvedWallOverlay } from '../core/featureAutotile';
import { resolveWallArtFaces, slotSource, wallArtSlotsForFace, type WallArtFaceMap, type WallArtPlacementMap } from '../core/wallArt';
import { boardLabCellPosition } from './boardProjection';
import { fenceOverlayZIndex, fencePostZIndex, wallArtOverlayZIndex, wallOverlayZIndex } from './sceneDepth';
import { BoardCanvasLayer, boundsForOps } from './BoardCanvasLayer';

const TILE_FRAME_W = TILE_STEP_X * 2;
const TILE_FRAME_H = TILE_FRAME_HEIGHT;
const TILE_EQUATOR = TILE_FRAME_EQUATOR_Y;
const WALL_FRAME_W = 128;
const WALL_FRAME_H = 240;
const WALL_ANCHOR_X = 64;
const WALL_ANCHOR_Y = 96;

function parseCellKey(key: string): { x: number; y: number } | null {
  const [x, y] = key.split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function wallArtOps(
  ops: BoardDrawOp[],
  cell: { x: number; y: number },
  wall: ResolvedWallOverlay,
  faceStyles: WallArtFaceMap | undefined,
): void {
  const { left, top } = boardLabCellPosition(cell);
  for (const face of ['west', 'north'] as const) {
    const maskBit = face === 'west' ? 8 : 1;
    if (!(wall.mask & maskBit)) continue;
    for (const slot of wallArtSlotsForFace(faceStyles?.[face], face)) {
      const faceAsset = slotSource(slot).faces[face];
      ops.push({
        layer: 'scene',
        src: faceAsset.src,
        dx: left - WALL_ANCHOR_X + slot.x - faceAsset.mountX * slot.scale,
        dy: top - WALL_ANCHOR_Y + slot.y - faceAsset.mountY * slot.scale,
        dw: faceAsset.width * slot.scale,
        dh: faceAsset.height * slot.scale,
        z: wallArtOverlayZIndex(cell),
      });
    }
  }
}

function barrierOps({
  fenceOverlays,
  fencePosts,
  wallOverlays,
  wallArt,
  wallBounds,
}: {
  fenceOverlays?: ReadonlyMap<string, ResolvedFenceOverlay>;
  fencePosts?: ReadonlyMap<string, ResolvedFencePost>;
  wallOverlays?: ReadonlyMap<string, ResolvedWallOverlay>;
  wallArt?: WallArtPlacementMap;
  wallBounds?: { cols: number; rows: number };
}): BoardDrawOp[] {
  const ops: BoardDrawOp[] = [];
  const faceStyles = wallArt && wallBounds ? resolveWallArtFaces(wallArt, wallBounds) : new Map<string, WallArtFaceMap>();

  for (const [key, wall] of wallOverlays ?? []) {
    const cell = parseCellKey(key);
    if (!cell) continue;
    const { left, top } = boardLabCellPosition(cell);
    ops.push({
      layer: 'scene',
      src: wallFrameSrc(wall.material, wall.mask),
      dx: left - WALL_ANCHOR_X,
      dy: top - WALL_ANCHOR_Y,
      dw: WALL_FRAME_W,
      dh: WALL_FRAME_H,
      z: wallOverlayZIndex(cell),
    });
    wallArtOps(ops, cell, wall, faceStyles.get(key));
  }

  // Posts cap their incident rails at a positive half-depth bias. Insert them first only as a
  // secondary deterministic tie breaker; numeric z owns the visible ordering.
  for (const post of fencePosts?.values() ?? []) {
    const { left, top: vertexCellTop } = boardLabCellPosition(post);
    const top = vertexCellTop - TILE_STEP_Y;
    ops.push({
      layer: 'scene',
      src: fencePostSrc(post.material),
      dx: left - TILE_STEP_X,
      dy: top - TILE_EQUATOR,
      dw: TILE_FRAME_W,
      dh: TILE_FRAME_H,
      z: fencePostZIndex(post),
    });
  }

  for (const [key, fence] of fenceOverlays ?? []) {
    const cell = parseCellKey(key);
    if (!cell) continue;
    const { left, top } = boardLabCellPosition(cell);
    const z = fenceOverlayZIndex(cell);
    ops.push({
      layer: 'scene',
      src: fenceFrameSrc(fence.material, fence.mask),
      dx: left - TILE_STEP_X,
      dy: top - TILE_EQUATOR,
      dw: TILE_FRAME_W,
      dh: TILE_FRAME_H,
      z,
    });
  }

  return ops;
}

const FALLBACK_BOUNDS: BakeBounds = { minX: -TILE_STEP_X, minY: -TILE_EQUATOR, width: TILE_FRAME_W, height: TILE_FRAME_H };

export function BoardBarrierSceneLayer({
  fenceOverlays,
  fencePosts,
  wallOverlays,
  wallArt,
  wallBounds,
}: {
  fenceOverlays?: ReadonlyMap<string, ResolvedFenceOverlay>;
  fencePosts?: ReadonlyMap<string, ResolvedFencePost>;
  wallOverlays?: ReadonlyMap<string, ResolvedWallOverlay>;
  wallArt?: WallArtPlacementMap;
  wallBounds?: { cols: number; rows: number };
}): ReactElement | null {
  const ops = useMemo(
    () => barrierOps({ fenceOverlays, fencePosts, wallOverlays, wallArt, wallBounds }),
    [fenceOverlays, fencePosts, wallArt, wallBounds, wallOverlays],
  );
  const bounds = useMemo(() => boundsForOps(ops, FALLBACK_BOUNDS), [ops]);
  return <BoardCanvasLayer ops={ops} bounds={bounds} />;
}
