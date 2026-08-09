import { describe, expect, it } from 'vitest';
import {
  clipGeneratorAreas,
  generatorAreaCells,
  generatorAreasBounds,
  generatorAreasCellCount,
  generatorAreasContainCell,
  mergeGeneratorAreas,
  normalizeGeneratorArea,
  normalizeGeneratorAreas,
} from './generatorAreas';

const rect = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });

describe('generatorAreasBounds', () => {
  it('boxes several patches, including ones out in the scenic apron', () => {
    expect(generatorAreasBounds([rect(2, 3, 6, 7), rect(-4, 9, 1, 12)]))
      .toEqual(rect(-4, 3, 6, 12));
  });

  it('orders a rectangle dragged from any corner', () => {
    expect(normalizeGeneratorArea(rect(9, 12, 3, 4))).toEqual(rect(3, 4, 9, 12));
    expect(generatorAreasBounds([rect(9, 12, 3, 4)])).toEqual(rect(3, 4, 9, 12));
  });
});

describe('generatorAreasContainCell', () => {
  const areas = [rect(0, 0, 3, 3), rect(4, 4, 6, 6)];

  it('answers for the union, not for one patch', () => {
    expect(generatorAreasContainCell(areas, 1, 1)).toBe(true);
    expect(generatorAreasContainCell(areas, 5, 5)).toBe(true);
  });

  it('keeps the hole between two patches out', () => {
    expect(generatorAreasContainCell(areas, 1, 5)).toBe(false);
    expect(generatorAreasContainCell(areas, 5, 1)).toBe(false);
  });
});

describe('generatorAreasCellCount', () => {
  it('counts a single rectangle by its sides', () => {
    expect(generatorAreasCellCount([rect(0, 0, 3, 1)])).toBe(8);
  });

  it('counts shared ground once when two patches overlap', () => {
    // 4x4 and 4x4 sharing a 2x2 corner: 16 + 16 - 4.
    expect(generatorAreasCellCount([rect(0, 0, 3, 3), rect(2, 2, 5, 5)])).toBe(28);
  });

  it('adds up patches that only touch', () => {
    expect(generatorAreasCellCount([rect(0, 0, 3, 3), rect(4, 0, 7, 3)])).toBe(32);
  });

  it('agrees with the cells actually enumerated', () => {
    const areas = [rect(-2, -2, 2, 1), rect(1, 0, 4, 6), rect(3, 5, 4, 9)];
    expect(generatorAreaCells(areas).length).toBe(generatorAreasCellCount(areas));
  });
});

describe('normalizeGeneratorAreas', () => {
  it('drops a patch another patch already covers', () => {
    expect(normalizeGeneratorAreas([rect(0, 0, 9, 9), rect(2, 2, 4, 4)])).toEqual([rect(0, 0, 9, 9)]);
  });

  it('keeps exactly one of a repeated patch, so shift-dragging the same ground twice is a no-op', () => {
    expect(normalizeGeneratorAreas([rect(0, 0, 4, 4), rect(0, 0, 4, 4)])).toEqual([rect(0, 0, 4, 4)]);
  });

  it('keeps patches that merely overlap', () => {
    expect(normalizeGeneratorAreas([rect(0, 0, 4, 4), rect(3, 3, 8, 8)]))
      .toEqual([rect(0, 0, 4, 4), rect(3, 3, 8, 8)]);
  });

  it('never answers with nothing', () => {
    expect(normalizeGeneratorAreas([])).toEqual([]);
    expect(normalizeGeneratorAreas([rect(1, 1, 1, 1)])).toEqual([rect(1, 1, 1, 1)]);
  });
});

describe('mergeGeneratorAreas', () => {
  it('collapses a town extended along its own length back into one rectangle', () => {
    expect(mergeGeneratorAreas([rect(1, 3, 12, 9), rect(13, 3, 26, 9)])).toEqual([rect(1, 3, 26, 9)]);
  });

  it('collapses an extension downward too', () => {
    expect(mergeGeneratorAreas([rect(1, 3, 12, 9), rect(1, 10, 12, 20)])).toEqual([rect(1, 3, 12, 20)]);
  });

  it('keeps both arms of an L, so each one can be given a street of its own', () => {
    const arm = rect(1, 1, 10, 12);
    const foot = rect(11, 7, 24, 12);
    expect(mergeGeneratorAreas([arm, foot])).toEqual([arm, foot]);
  });

  it('never merges across a gap', () => {
    const west = rect(0, 0, 4, 4);
    const east = rect(9, 0, 13, 4);
    expect(mergeGeneratorAreas([west, east])).toEqual([west, east]);
  });

  it('merges a chain of patches in one pass', () => {
    expect(mergeGeneratorAreas([rect(0, 0, 3, 3), rect(8, 0, 11, 3), rect(4, 0, 7, 3)]))
      .toEqual([rect(0, 0, 11, 3)]);
  });

  it('leaves a single patch alone', () => {
    expect(mergeGeneratorAreas([rect(2, 2, 6, 6)])).toEqual([rect(2, 2, 6, 6)]);
  });
});

describe('clipGeneratorAreas', () => {
  it('trims each patch to the territory and drops the ones that miss it', () => {
    expect(clipGeneratorAreas([rect(0, 0, 9, 9), rect(20, 20, 24, 24)], rect(4, 4, 12, 12)))
      .toEqual([rect(4, 4, 9, 9)]);
  });

  it('is the whole patch when the territory contains it', () => {
    expect(clipGeneratorAreas([rect(2, 2, 5, 5)], rect(0, 0, 9, 9))).toEqual([rect(2, 2, 5, 5)]);
  });
});
