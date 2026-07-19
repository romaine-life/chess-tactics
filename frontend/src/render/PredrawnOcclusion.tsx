import type { ReactElement } from 'react';
import { predrawnOcclusionSeedBoard } from '@chess-tactics/board-render';
import type { EditorBoard } from '../ui/boardCode';
import { BoardSceneLayer } from './BoardSceneLayer';

export function PredrawnOcclusionSeedLayer({ board }: { board: EditorBoard }): ReactElement {
  return (
    <BoardSceneLayer
      board={predrawnOcclusionSeedBoard(board)}
      ambientCover={false}
      omitTerrain
      maskTint="#ff2bd6"
      className="tileset-scene-layer predrawn-occlusion-seed-layer"
      predrawnOcclusion={false}
    />
  );
}
