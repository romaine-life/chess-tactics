import { useMemo, type ReactElement } from 'react';
import {
  boardBounds,
  boardContentHash,
  boardDrawOps,
  type BoardDrawOp,
} from '@chess-tactics/board-render';
import type { EditorBoard } from '../ui/boardCode';
import { BoardCanvasLayer } from './BoardCanvasLayer';

function isTerrainOp(op: BoardDrawOp): boolean {
  return op.src.includes('/assets/tiles/surface/') || op.src.includes('/assets/tiles/macro-tiles/');
}

function isLinearFeatureOp(op: BoardDrawOp): boolean {
  return op.src.includes('/assets/tiles/feature/road-') || op.src.includes('/assets/tiles/feature/river-');
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
}: {
  board: EditorBoard;
  hidden?: { tile: boolean; unit: boolean; doodad: boolean };
  coverSeed?: number;
  ambientCover?: boolean;
  /** Terrain and road/river features are already owned by BoardTerrainLayer. */
  omitTerrain?: boolean;
}): ReactElement | null {
  const sourceBoard = useMemo(() => visualBoard(board, hidden), [board, hidden]);
  const contentHash = useMemo(() => `${boardContentHash(sourceBoard)}|cover:${coverSeed}|ambient:${ambientCover ? 1 : 0}`, [ambientCover, coverSeed, sourceBoard]);
  const bounds = useMemo(() => boardBounds(sourceBoard, { ambientCover, coverSeed }), [ambientCover, contentHash, coverSeed, sourceBoard]);
  const ops = useMemo(() => {
    const all = boardDrawOps(sourceBoard, { ambientCover, coverSeed });
    return omitTerrain
      ? all.filter((op) => !isTerrainOp(op) && !isLinearFeatureOp(op))
      : all.filter((op) => !(hidden?.tile && isTerrainOp(op)));
  }, [ambientCover, contentHash, coverSeed, hidden?.tile, omitTerrain, sourceBoard]);

  return <BoardCanvasLayer ops={ops} bounds={bounds} />;
}
