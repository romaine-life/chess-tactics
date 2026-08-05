import { describe, expect, it } from 'vitest';
import { composeGeneratorSections } from './generatorComposition';

const OUTER = { minX: 0, minY: 0, maxX: 11, maxY: 7 };

describe('composeGeneratorSections', () => {
  it('keeps the outer patch as the only authored geometry', () => {
    expect(composeGeneratorSections(OUTER, [
      { id: 'homes', relationship: 'distinct' },
    ], 1)).toEqual([{ sectionIds: ['homes'], bounds: OUTER }]);
  });

  it('combines consecutive mixed sections into exactly one generated territory', () => {
    const groups = composeGeneratorSections(OUTER, [
      { id: 'homes', relationship: 'distinct' },
      { id: 'mills', relationship: 'mixed' },
      { id: 'castle', relationship: 'distinct' },
    ], 17);
    expect(groups).toHaveLength(2);
    expect(groups.some((group) => group.sectionIds.join(',') === 'homes,mills')).toBe(true);
    expect(groups.some((group) => group.sectionIds.join(',') === 'castle')).toBe(true);
  });

  it('allocates distinct territories without overlap and fills the outer patch', () => {
    const groups = composeGeneratorSections(OUTER, [
      { id: 'a', relationship: 'distinct' },
      { id: 'b', relationship: 'distinct' },
      { id: 'c', relationship: 'distinct' },
    ], 3);
    const cells = groups.flatMap((group) => {
      const result: string[] = [];
      for (let y = group.bounds.minY; y <= group.bounds.maxY; y += 1) {
        for (let x = group.bounds.minX; x <= group.bounds.maxX; x += 1) result.push(`${x},${y}`);
      }
      return result;
    });
    expect(new Set(cells).size).toBe(cells.length);
    expect(new Set(cells).size).toBe(12 * 8);
  });

  it('is deterministic for one seed and may rearrange territories for another', () => {
    const sections = [
      { id: 'a', relationship: 'distinct' as const },
      { id: 'b', relationship: 'distinct' as const },
      { id: 'c', relationship: 'distinct' as const },
    ];
    expect(composeGeneratorSections(OUTER, sections, 5)).toEqual(composeGeneratorSections(OUTER, sections, 5));
    expect(composeGeneratorSections(OUTER, sections, 5)).not.toEqual(composeGeneratorSections(OUTER, sections, 6));
  });

  it('treats an initial mixed section as the first distinct territory', () => {
    expect(composeGeneratorSections(OUTER, [
      { id: 'a', relationship: 'mixed' },
      { id: 'b', relationship: 'mixed' },
    ], 1)).toEqual([{ sectionIds: ['a', 'b'], bounds: OUTER }]);
  });
});
