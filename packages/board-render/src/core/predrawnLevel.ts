import type { Level } from './level';
import {
  boardBackgroundMode,
  decodeBoard,
  encodeBoard,
  normalizePredrawnBoardSurface,
  type PredrawnBoardSurface,
  withoutPredrawnBoardOcclusionMaskCode,
  withoutPredrawnBoardSurfaceCode,
} from '../ui/boardCode';

/**
 * Return a Level whose only top-level change is its lossless boardCode, and whose only decoded
 * board change is activating the supplied pre-drawn surface. Gameplay layers and all authored
 * metadata retain their original references and values.
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
    boardCode: encodeBoard({
      ...board,
      backgroundMode: 'ai',
      surface: normalizedSurface,
    }),
  };
}

/**
 * Forget the remembered pre-drawn selection of a Level that is already rendering Legacy art.
 *
 * This is deliberately narrower than changing background mode: active AI artwork cannot be
 * removed through this primitive, and every other Level and decoded-board field is preserved.
 */
export function withoutPredrawnBoardSurface(level: Level): Level {
  if (!level.boardCode) throw new Error(`level ${level.id} has no lossless boardCode`);
  const board = decodeBoard(level.boardCode);
  if (!board) throw new Error(`level ${level.id} has an invalid boardCode`);
  if (boardBackgroundMode(board) !== 'legacy') {
    throw new Error(`level ${level.id} must use Legacy background mode before forgetting its pre-drawn surface`);
  }
  if (!board.surface) return level;
  const boardCode = withoutPredrawnBoardSurfaceCode(level.boardCode);
  if (!boardCode) throw new Error(`level ${level.id} has an invalid boardCode`);
  return {
    ...level,
    boardCode,
  };
}

/**
 * Detach one exact occlusion mask while preserving the selected immutable background and every
 * other Level/board field, including dormant Legacy mode and schema-v3 move-highlight calibration.
 */
export function withoutPredrawnBoardOcclusionMask(
  level: Level,
  expectedBackgroundVersionId: string,
  expectedOcclusionVersionId: string,
): Level {
  if (!level.boardCode) throw new Error(`level ${level.id} has no lossless boardCode`);
  const board = decodeBoard(level.boardCode);
  if (!board) throw new Error(`level ${level.id} has an invalid boardCode`);
  if (
    !board.surface
    || !('schemaVersion' in board.surface)
    || board.surface.backgroundVersionId !== expectedBackgroundVersionId.toLowerCase()
    || board.surface.occlusionVersionId !== expectedOcclusionVersionId.toLowerCase()
  ) {
    throw new Error(`level ${level.id} does not select the expected background and occlusion mask`);
  }
  const boardCode = withoutPredrawnBoardOcclusionMaskCode(
    level.boardCode,
    expectedBackgroundVersionId,
    expectedOcclusionVersionId,
  );
  if (!boardCode) throw new Error(`level ${level.id} has an invalid boardCode`);
  return {
    ...level,
    boardCode,
  };
}
