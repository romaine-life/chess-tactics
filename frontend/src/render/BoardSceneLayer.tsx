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
  if (
    !predrawnOcclusion
    || tileHidden
    || !isPredrawnBackgroundActive(board, { predrawnBackgroundActive })
    || (board.surface && isVersionedPredrawnBoardSurface(board.surface))
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

export function BoardSceneLayer({
  board,
  hidden,
  coverSeed = 1234,
  ambientCover = false,
  omitTerrain = true,
  transformOps,
  maskTint,
  className,
  predrawnBackgroundActive = false,
  predrawnOcclusion = true,
  onFirstFrame,
  onFrameError,
}: {
  board: EditorBoard;
  hidden?: { tile: boolean; unit: boolean; doodad: boolean };
  coverSeed?: number;
  ambientCover?: boolean;
  /** Terrain and road/river features are already owned by BoardTerrainLayer. */
  omitTerrain?: boolean;
  /** Review-only visual substitution applied before the one globally depth-sorted scene canvas. */
  transformOps?: BoardSceneOpsTransform;
  maskTint?: string;
  className?: string;
  /** A complete temporary candidate is mounted outside the board data. */
  predrawnBackgroundActive?: boolean;
  /** Owner proof can suppress clipping; gameplay and ordinary viewers keep it enabled. */
  predrawnOcclusion?: boolean;
  /** Acknowledge only after this compositor has painted its first complete frame. */
  onFirstFrame?: () => void;
  onFrameError?: (error: unknown) => void;
}): ReactElement | null {
  const sourceBoard = useMemo(() => visualBoard(board, hidden), [board, hidden]);
  const contentHash = useMemo(
    () => `${boardContentHash(sourceBoard)}|cover:${coverSeed}|ambient:${ambientCover ? 1 : 0}|predrawn:${predrawnBackgroundActive ? 1 : 0}`,
    [ambientCover, coverSeed, predrawnBackgroundActive, sourceBoard],
  );
  const bounds = useMemo(
    () => boardBounds(sourceBoard, { ambientCover, coverSeed, predrawnBackgroundActive }),
    [ambientCover, contentHash, coverSeed, predrawnBackgroundActive, sourceBoard],
  );
  const ops = useMemo(() => {
    const all = boardDrawOps(sourceBoard, { ambientCover, coverSeed, predrawnBackgroundActive });
    const transformed = transformOps ? transformOps(all, sourceBoard) : all;
    return omitTerrain
      ? withoutBoardDrawLayers(transformed, 'terrain', 'linear-feature')
      : hidden?.tile
        ? withoutBoardDrawLayers(transformed, 'terrain')
        : transformed;
  }, [ambientCover, contentHash, coverSeed, hidden?.tile, omitTerrain, predrawnBackgroundActive, sourceBoard, transformOps]);
  const occlusionMasks = useMemo(
    () => boardSceneOcclusionMasks(board, {
      predrawnBackgroundActive,
      predrawnOcclusion,
      tileHidden: hidden?.tile,
    }),
    [board, hidden?.tile, predrawnBackgroundActive, predrawnOcclusion],
  );
  const occlusionDepthMap = useMemo(
    () => predrawnOcclusion && !hidden?.tile
      ? predrawnOcclusionDepthMapForSurface(board.surface)
      : undefined,
    [board.surface, hidden?.tile, predrawnOcclusion],
  );

  return (
    <BoardCanvasLayer
      ops={ops}
      bounds={bounds}
      maskTint={maskTint}
      className={className}
      occlusionMasks={occlusionMasks}
      occlusionDepthMap={occlusionDepthMap}
      onFirstFrame={onFirstFrame}
      onFrameError={onFrameError}
    />
  );
}
