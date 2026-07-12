import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizedGeometry } from './vite-nine-slice-geometry-plugin.mjs';

const ZERO_CORNERS = Object.fromEntries(['tl', 'tr', 'bl', 'br'].map((corner) => [corner, { dx: 0, dy: 0 }]));
const ZERO_PIPES = Object.fromEntries(['top', 'bottom', 'left', 'right'].map((side) => [side, 0]));
const valid = {
  asset: 'row',
  coolCorners: ZERO_CORNERS,
  pipes: ZERO_PIPES,
  frameScale: 1,
  brackets: ZERO_CORNERS,
  bracketScale: 1,
  content: 4,
  fill: 2,
};

describe('nine-slice geometry persistence boundary', () => {
  it('accepts only bounded deterministic geometry', () => {
    expect(normalizedGeometry(valid)).toEqual(valid);
    expect(() => normalizedGeometry({ ...valid, asset: 'missing' })).toThrow(/unknown editable frame/);
    expect(() => normalizedGeometry({ ...valid, frameScale: 99 })).toThrow(/frameScale/);
    expect(() => normalizedGeometry({ ...valid, content: 1.5 })).toThrow(/integer/);
  });

  it('has no repository-media bake or promotion dependency', () => {
    const source = readFileSync(fileURLToPath(new URL('./vite-nine-slice-geometry-plugin.mjs', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/public[\\/]assets/i);
    expect(source).not.toMatch(/buildAsset|bakeAsset|acceptedVersion|registeredForProduction/);
  });
});
