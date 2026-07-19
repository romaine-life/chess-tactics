import type { Level } from './level';
import {
  decodeBoard,
  encodeBoard,
  normalizePredrawnBoardSurface,
  type PredrawnBoardSurface,
} from '../ui/boardCode';

/**
 * Return a Level whose only top-level change is its lossless boardCode, and whose only decoded
 * board change is the pre-drawn surface declaration. Gameplay layers and all authored metadata
 * retain their original references and values.
 */
export function withPredrawnBoardSurface(
  level: Level,
  surface: PredrawnBoardSurface,
): Level {
  if (!level.boardCode) throw new Error(`level ${level.id} has no lossless boardCode`);
  const board = decodeBoard(level.boardCode);
  if (!board) throw new Error(`level ${level.id} has an invalid boardCode`);
  const normalizedSurface = normalizePredrawnBoardSurface(surface);
  if (!normalizedSurface) throw new Error(`level ${level.id} has an invalid pre-drawn surface`);
  return {
    ...level,
    boardCode: encodeBoard({ ...board, surface: normalizedSurface }),
  };
}
