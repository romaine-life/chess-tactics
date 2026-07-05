import { describe, it, expect } from 'vitest';
import { scatterTerrain, largestRemainder } from './terrainScatter';
import type { TileFamilyId } from './tileSockets';

const fraction = (map: readonly TileFamilyId[], terrain: TileFamilyId): number =>
  map.filter((t) => t === terrain).length / map.length;

// Count 4-connected same-value components in a row-major map.
function components(map: readonly TileFamilyId[], columns: number, rows: number): number {
  const seen = new Uint8Array(columns * rows);
  let count = 0;
  for (let i = 0; i < map.length; i += 1) {
    if (seen[i]) continue;
    count += 1;
    const value = map[i];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      const x = c % columns;
      const y = (c / columns) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const ni = ny * columns + nx;
        if (!seen[ni] && map[ni] === value) { seen[ni] = 1; stack.push(ni); }
      }
    }
  }
  return count;
}

describe('largestRemainder', () => {
  it('rounds to integers that sum exactly to the total', () => {
    expect(largestRemainder([66.6, 16.7, 16.7], 100).reduce((a, b) => a + b, 0)).toBe(100);
    expect(largestRemainder([0, 0], 7).reduce((a, b) => a + b, 0)).toBe(7);
  });
});

describe('scatterTerrain', () => {
  const columns = 18;
  const rows = 18;
  const two = [
    { terrain: 'grass' as TileFamilyId, share: 60 },
    { terrain: 'stone' as TileFamilyId, share: 40 },
  ];

  it('is deterministic in the seed', () => {
    const opts = { columns, rows, sections: two, randomnessBuffer: 0, wiggle: 0.4, seed: 42 };
    expect(scatterTerrain(opts)).toEqual(scatterTerrain(opts));
  });

  it('makes ONE contiguous region per distinct terrain (2 entries ⇒ 2 regions)', () => {
    for (const seed of [1, 7, 13, 20, 31, 44, 58, 63, 77, 91]) {
      const map = scatterTerrain({ columns, rows, sections: two, randomnessBuffer: 0, wiggle: 0.5, seed });
      expect(components(map, columns, rows)).toBe(2);
    }
  });

  it('scales to N distinct regions', () => {
    const three = [
      { terrain: 'grass' as TileFamilyId, share: 40 },
      { terrain: 'stone' as TileFamilyId, share: 35 },
      { terrain: 'water' as TileFamilyId, share: 25 },
    ];
    for (const seed of [2, 9, 15, 28, 50]) {
      expect(components(scatterTerrain({ columns, rows, sections: three, randomnessBuffer: 0, wiggle: 0.5, seed }), columns, rows)).toBe(3);
    }
  });

  it('honours the region shares (a 70% region gets ~70% of tiles)', () => {
    const s = [
      { terrain: 'grass' as TileFamilyId, share: 70 },
      { terrain: 'stone' as TileFamilyId, share: 30 },
    ];
    const seeds = Array.from({ length: 20 }, (_, i) => i * 37 + 3);
    const mean = seeds.reduce((sum, seed) =>
      sum + fraction(scatterTerrain({ columns: 24, rows: 24, sections: s, randomnessBuffer: 0, wiggle: 0.4, seed }), 'grass'), 0) / seeds.length;
    expect(mean).toBeGreaterThan(0.62);
    expect(mean).toBeLessThan(0.78);
  });

  it('leaves out-of-region cells untouched and only fills the selection', () => {
    const n = columns * rows;
    const baseMap: TileFamilyId[] = Array.from({ length: n }, () => 'sand');
    const sel = new Set<number>();
    for (let y = 0; y < 6; y += 1) for (let x = 0; x < 6; x += 1) sel.add(y * columns + x);
    const map = scatterTerrain({ columns, rows, sections: two, randomnessBuffer: 0, wiggle: 0.4, seed: 3, region: sel, baseMap });
    for (let i = 0; i < n; i += 1) {
      if (sel.has(i)) expect(['grass', 'stone']).toContain(map[i]);
      else expect(map[i]).toBe('sand');
    }
  });

  it('omits a 0-share region', () => {
    const s = [
      { terrain: 'grass' as TileFamilyId, share: 100 },
      { terrain: 'stone' as TileFamilyId, share: 0 },
    ];
    const map = scatterTerrain({ columns, rows, sections: s, randomnessBuffer: 0, wiggle: 0.4, seed: 5 });
    expect(map.includes('stone')).toBe(false);
    expect(components(map, columns, rows)).toBe(1);
  });
});
