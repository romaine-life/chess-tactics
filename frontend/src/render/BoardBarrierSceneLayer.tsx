import { useMemo, type ReactElement } from 'react';
import { WALL_FRAME_GEOMETRY, type BakeBounds, type BoardDrawOp } from '@chess-tactics/board-render';
import { fenceFrameSrc, wallFrameSrc } from '../art/tileset';
import { TILE_FRAME_EQUATOR_Y, TILE_FRAME_HEIGHT, TILE_STEP_X } from '../art/projectionContract';
import type { ResolvedFenceOverlay, ResolvedWallOverlay } from '../core/featureAutotile';
import { boardLabCellPosition } from './boardProjection';
import { fenceOverlayZIndex, wallOverlayZIndex } from './sceneDepth';
import { BoardCanvasLayer, boundsForOps } from './BoardCanvasLayer';

const TILE_FRAME_W = TILE_STEP_X * 2;
const TILE_FRAME_H = TILE_FRAME_HEIGHT;
const TILE_EQUATOR = TILE_FRAME_EQUATOR_Y;
const WALL_FRAME_W = WALL_FRAME_GEOMETRY.width;
const WALL_FRAME_H = WALL_FRAME_GEOMETRY.height;
const WALL_ANCHOR_X = WALL_FRAME_GEOMETRY.anchorX;
const WALL_ANCHOR_Y = WALL_FRAME_GEOMETRY.anchorY;

function parseCellKey(key: string): { x: number; y: number } | null {
  const [x, y] = key.split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function barrierOps({
  fenceOverlays,
  wallOverlays,
}: {
  fenceOverlays?: ReadonlyMap<string, ResolvedFenceOverlay>;
  wallOverlays?: ReadonlyMap<string, ResolvedWallOverlay>;
}): BoardDrawOp[] {
  const ops: BoardDrawOp[] = [];

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
}: {
  fenceOverlays?: ReadonlyMap<string, ResolvedFenceOverlay>;
  wallOverlays?: ReadonlyMap<string, ResolvedWallOverlay>;
}): ReactElement | null {
  const ops = useMemo(() => barrierOps({ fenceOverlays, wallOverlays }), [fenceOverlays, wallOverlays]);
  const bounds = useMemo(() => boundsForOps(ops, FALLBACK_BOUNDS), [ops]);
  return <BoardCanvasLayer ops={ops} bounds={bounds} />;
}
