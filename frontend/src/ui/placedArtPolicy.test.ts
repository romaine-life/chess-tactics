import { describe, expect, it } from 'vitest';
import {
  canTargetPlacedArtCell,
  isPlayableBoardCoordinate,
  isPropFootprintOnAuthoredSurface,
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

  it('allows Scene Art outside the playable board', () => {
    expect(canTargetPlacedArtCell('artwork', -20, 12, 4, 3)).toBe(true);
  });

  // A 4x3 playable board with a one-cell scenic apron: the authored surface is [-1,4] x [-1,3].
  const onSurface = (x: number, y: number): boolean => x >= -1 && x <= 4 && y >= -1 && y <= 3;

  it('requires every cell of a prop footprint to sit on the authored surface', () => {
    expect(isPropFootprintOnAuthoredSurface([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ], 4, 3, onSurface)).toBe(true);
    expect(isPropFootprintOnAuthoredSurface([], 4, 3, onSurface)).toBe(false);
  });

  it('accepts a prop footprint that stands entirely outside the playable board', () => {
    expect(isPropFootprintOnAuthoredSurface([
      { x: -1, y: -1 },
      { x: 0, y: -1 },
    ], 4, 3, onSurface)).toBe(true);
    expect(isPropFootprintOnAuthoredSurface([{ x: 4, y: 3 }], 4, 3, onSurface)).toBe(true);
  });

  it('rejects a prop footprint that leaves the authored surface or is non-integer', () => {
    // One cell past the apron is enough to reject the whole footprint.
    expect(isPropFootprintOnAuthoredSurface([
      { x: 4, y: 1 },
      { x: 5, y: 1 },
    ], 4, 3, onSurface)).toBe(false);
    expect(isPropFootprintOnAuthoredSurface([{ x: 1.5, y: 1 }], 4, 3, onSurface)).toBe(false);
  });

  it('rejects a prop footprint that straddles the playable edge', () => {
    // Both cells have authored ground, but (0,1) is playable and (-1,1) is scenic. An off-board
    // anchor never reaches layers.props, so the playable half would render without a collider.
    expect(isPropFootprintOnAuthoredSurface([
      { x: -1, y: 1 },
      { x: 0, y: 1 },
    ], 4, 3, onSurface)).toBe(false);
    expect(isPropFootprintOnAuthoredSurface([
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ], 4, 3, onSurface)).toBe(false);
  });
});
