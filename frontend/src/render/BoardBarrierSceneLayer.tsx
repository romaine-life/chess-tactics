import { useMemo, type ReactElement } from 'react';
import { type BakeBounds, type BoardDrawOp } from '@chess-tactics/board-render';
import { fenceFrameSrc, wallFrameSrc } from '../art/tileset';
import { TILE_FRAME_EQUATOR_Y, TILE_FRAME_HEIGHT, TILE_STEP_X } from '../art/projectionContract';
import type { ResolvedFenceOverlay, ResolvedWallOverlay } from '../core/featureAutotile';
import { resolveWallArtFaces, slotSource, wallArtSlotsForFace, type WallArtFaceMap, type WallArtPlacementMap } from '../core/wallArt';
import { boardLabCellPosition } from './boardProjection';
import { fenceOverlayZIndex, wallArtOverlayZIndex, wallOverlayZIndex } from './sceneDepth';
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
  wallOverlays,
  wallArt,
  wallBounds,
}: {
  fenceOverlays?: ReadonlyMap<string, ResolvedFenceOverlay>;
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
      src: wallFrameSrc(wall.material, wall.mask),
      dx: left - WALL_ANCHOR_X,
      dy: top - WALL_ANCHOR_Y,
      dw: WALL_FRAME_W,
      dh: WALL_FRAME_H,
      z: wallOverlayZIndex(cell),
    });
    wallArtOps(ops, cell, wall, faceStyles.get(key));
  }

  for (const [key, fence] of fenceOverlays ?? []) {
    const cell = parseCellKey(key);
    if (!cell) continue;
    const { left, top } = boardLabCellPosition(cell);
    ops.push({
      src: fenceFrameSrc(fence.material, fence.mask),
      dx: left - TILE_STEP_X,
      dy: top - TILE_EQUATOR,
      dw: TILE_FRAME_W,
      dh: TILE_FRAME_H,
      z: fenceOverlayZIndex(cell),
    });
  }

  return ops;
}

const FALLBACK_BOUNDS: BakeBounds = { minX: -TILE_STEP_X, minY: -TILE_EQUATOR, width: TILE_FRAME_W, height: TILE_FRAME_H };

export function BoardBarrierSceneLayer({
  fenceOverlays,
  wallOverlays,
  wallArt,
  wallBounds,
}: {
  fenceOverlays?: ReadonlyMap<string, ResolvedFenceOverlay>;
  wallOverlays?: ReadonlyMap<string, ResolvedWallOverlay>;
  wallArt?: WallArtPlacementMap;
  wallBounds?: { cols: number; rows: number };
}): ReactElement | null {
  const ops = useMemo(() => barrierOps({ fenceOverlays, wallOverlays, wallArt, wallBounds }), [fenceOverlays, wallArt, wallBounds, wallOverlays]);
  const bounds = useMemo(() => boundsForOps(ops, FALLBACK_BOUNDS), [ops]);
  return <BoardCanvasLayer ops={ops} bounds={bounds} />;
}
