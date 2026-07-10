// @ts-nocheck — node built-ins are untyped in the app tsconfig; Vitest runs
// this source-contract check through esbuild.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OBJECT_DEPTH_OFFSET } from './sceneDepth';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('scene canvas stacking band', () => {
  it('keeps the atomic scene canvas in the object band above flat cell overlays', () => {
    const match = css.match(/\.tileset-scene-layer\s*\{[^}]*\bz-index:\s*(\d+)/);

    expect(match, 'style.css must give .tileset-scene-layer an explicit z-index').toBeTruthy();
    expect(Number(match![1])).toBe(OBJECT_DEPTH_OFFSET);
  });
});
