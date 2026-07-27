import { describe, expect, it } from 'vitest';
import {
  canTargetPlacedArtCell,
  isPlayableBoardCoordinate,
  isPropFootprintWithinPlayableBoard,
} from './placedArtPolicy';

describe('placed art policy', () => {
  it('recognizes only integer coordinates inside the playable board', () => {
    expect(isPlayableBoardCoordinate(0, 0, 4, 3)).toBe(true);
    expect(isPlayableBoardCoordinate(3, 2, 4, 3)).toBe(true);
    expect(isPlayableBoardCoordinate(-1, 0, 4, 3)).toBe(false);
    expect(isPlayableBoardCoordinate(4, 0, 4, 3)).toBe(false);
    expect(isPlayableBoardCoordinate(0, 3, 4, 3)).toBe(false);
    expect(isPlayableBoardCoordinate(1.5, 1, 4, 3)).toBe(false);
  });

  it('keeps doodad targets on playable cells', () => {
    expect(canTargetPlacedArtCell('doodad', 2, 1, 4, 3)).toBe(true);
    expect(canTargetPlacedArtCell('doodad', -1, 1, 4, 3)).toBe(false);
  });

  it('keeps prop targets on playable cells', () => {
    expect(canTargetPlacedArtCell('prop', 2, 1, 4, 3)).toBe(true);
    expect(canTargetPlacedArtCell('prop', 4, 1, 4, 3)).toBe(false);
  });

  it('allows Scene Art outside the playable board', () => {
    expect(canTargetPlacedArtCell('artwork', -20, 12, 4, 3)).toBe(true);
  });

  it('requires every cell of a prop footprint to remain playable', () => {
    expect(isPropFootprintWithinPlayableBoard([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ], 4, 3)).toBe(true);
    expect(isPropFootprintWithinPlayableBoard([
      { x: 3, y: 1 },
      { x: 4, y: 1 },
    ], 4, 3)).toBe(false);
    expect(isPropFootprintWithinPlayableBoard([], 4, 3)).toBe(false);
  });
});
