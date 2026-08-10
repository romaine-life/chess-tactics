import { useMemo, type ReactElement } from 'react';
import {
  boardBounds,
  boardContentHash,
  boardDrawOps,
  isVersionedPredrawnBoardSurface,
  isPredrawnBackgroundActive,
  predrawnOcclusionDepthMapForSurface,
  predrawnOcclusionMaskOps,
  withoutBoardDrawLayers,
  type BoardDrawOp,
} from '@chess-tactics/board-render';
import type { EditorBoard } from '../ui/boardCode';
import { BoardCanvasLayer } from './BoardCanvasLayer';

export type BoardSceneOpsTransform = (ops: readonly BoardDrawOp[], board: EditorBoard) => BoardDrawOp[];

export function boardSceneOcclusionMasks(
  board: EditorBoard,
  {
    predrawnBackgroundActive = false,
    predrawnOcclusion = true,
    tileHidden = false,
  }: {
    predrawnBackgroundActive?: boolean;
    predrawnOcclusion?: boolean;
    tileHidden?: boolean;
  } = {},
): BoardDrawOp[] {
  const persistedPredrawnBackgroundActive = isPredrawnBackgroundActive(board);
  if (
    !predrawnOcclusion
    || tileHidden
    || !isPredrawnBackgroundActive(board, { predrawnBackgroundActive })
    || (
      persistedPredrawnBackgroundActive
      && board.surface
      && isVersionedPredrawnBoardSurface(board.surface)
    )
  ) return [];
  return predrawnOcclusionMaskOps(board);
}

function visualBoard(board: EditorBoard, hidden?: { unit: boolean; doodad: boolean }): EditorBoard {
  if (!hidden?.unit && !hidden?.doodad) return board;
  return {
    ...board,
    units: hidden.unit ? {} : board.units,
    doodads: hidden.doodad ? {} : board.doodads,
    props: hidden.doodad ? {} : board.props,
  };
}

/**
 * Pin every time-based scene op (ground-cover sway today) to its authored rest frame.
 * A still consumer renders one complete static frame and never starts the repaint
 * clock — the same pixels every visit, which still-card art capture also relies on.
 */
export function stillBoardSceneOps(ops: readonly BoardDrawOp[]): BoardDrawOp[] {
  return ops.map((op) => (op.animation ? { ...op, animation: undefined } : op));
}

export function BoardSceneLayer({
  board,
  hidden,
  coverSeed = 1234,
  ambientCover = false,
  coverScale = 1,
  omitTerrain = true,
  still = false,
  transformOps,
  maskTint,
  className,
  predrawnBackgroundActive = false,
  predrawnOcclusion = true,
  frameTransform,
  renderScale = 1,
  onFirstFrame,
  onFrameError,
}: {
  board: EditorBoard;
  hidden?: { tile: boolean; unit: boolean; doodad: boolean };
  coverSeed?: number;
  ambientCover?: boolean;
  /** Miniature-scene tuft scale, anchored at each tuft's planted base (default 1). */
  coverScale?: number;
  /** Terrain and road/river features are already owned by BoardTerrainLayer. */
  omitTerrain?: boolean;
  /** Render one static rest frame — no sway, no repaint clock (see stillBoardSceneOps). */
  still?: boolean;
  /** Review-only visual substitution applied before the one globally depth-sorted scene canvas. */
  transformOps?: BoardSceneOpsTransform;
  maskTint?: string;
  className?: string;
  /** A complete temporary candidate is mounted outside the board data. */
  predrawnBackgroundActive?: boolean;
  /** Owner proof can suppress clipping; gameplay and ordinary viewers keep it enabled. */
  predrawnOcclusion?: boolean;
  /** Per-frame op substitution for an entrance in flight. See BoardCanvasLayer. */
  frameTransform?: (op: BoardDrawOp, timeMs: number) => BoardDrawOp;
  /**
   * Camera zoom, so the scene canvas rasterises at the size it is actually shown.
   * Unit art is resampled to reach the board, so drawing it at board size and
   * letting the container transform rescale the result costs it twice.
   */
  renderScale?: number;
  /** Acknowledge only after this compositor has painted its first complete frame. */
  onFirstFrame?: () => void;
  onFrameError?: (error: unknown) => void;
}): ReactElement | null {
  const sourceBoard = useMemo(() => visualBoard(board, hidden), [board, hidden]);
  const contentHash = useMemo(
    () => `${boardContentHash(sourceBoard)}|cover:${coverSeed}|ambient:${ambientCover ? 1 : 0}|coverScale:${coverScale}|predrawn:${predrawnBackgroundActive ? 1 : 0}`,
    [ambientCover, coverScale, coverSeed, predrawnBackgroundActive, sourceBoard],
  );
  const bounds = useMemo(
    () => boardBounds(sourceBoard, { ambientCover, coverSeed, predrawnBackgroundActive }),
    [ambientCover, contentHash, coverSeed, predrawnBackgroundActive, sourceBoard],
  );
  const ops = useMemo(() => {
    const all = boardDrawOps(sourceBoard, { ambientCover, coverScale, coverSeed, predrawnBackgroundActive });
    const transformed = transformOps ? transformOps(all, sourceBoard) : all;
    const layered = omitTerrain
      ? withoutBoardDrawLayers(transformed, 'terrain', 'linear-feature')
      : hidden?.tile
        ? withoutBoardDrawLayers(transformed, 'terrain')
        : transformed;
    return still ? stillBoardSceneOps(layered) : layered;
  }, [ambientCover, contentHash, coverScale, coverSeed, hidden?.tile, omitTerrain, predrawnBackgroundActive, sourceBoard, still, transformOps]);
  const occlusionMasks = useMemo(
    () => boardSceneOcclusionMasks(board, {
      predrawnBackgroundActive,
      predrawnOcclusion,
      tileHidden: hidden?.tile,
    }),
    [board, hidden?.tile, predrawnBackgroundActive, predrawnOcclusion],
  );
  const occlusionDepthMap = useMemo(
    () => predrawnOcclusion
      && !hidden?.tile
      && isPredrawnBackgroundActive(board)
      ? predrawnOcclusionDepthMapForSurface(board.surface)
      : undefined,
    [board, hidden?.tile, predrawnOcclusion],
  );

  return (
    <BoardCanvasLayer
      ops={ops}
      bounds={bounds}
      maskTint={maskTint}
      className={className}
      occlusionMasks={occlusionMasks}
      occlusionDepthMap={occlusionDepthMap}
      frameTransform={still ? undefined : frameTransform}
      renderScale={renderScale}
      onFirstFrame={onFirstFrame}
      onFrameError={onFrameError}
    />
  );
}
