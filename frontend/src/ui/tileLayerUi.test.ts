// @ts-nocheck - node built-ins are untyped in the app tsconfig; Vitest transpiles this
// source-structure migration guard through esbuild, matching the existing UI guards.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { routeScreenKey } from './routeSurfaces';
import { titleBarConfig } from './shell/titleBarConfig';
import { TILE_SIDE_ITEMS } from './tileSideCatalog';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const studioSource = readFileSync(new URL('./TilePreview.tsx', import.meta.url), 'utf8');
const surfaceLabSource = readFileSync(new URL('./SurfaceTilesLab.tsx', import.meta.url), 'utf8');
const levelEditorSource = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');

describe('explicit tile-layer UI migration', () => {
  it('feeds the side catalog only explicit side-layer assets', () => {
    expect(TILE_SIDE_ITEMS.length).toBeGreaterThan(0);
    expect(TILE_SIDE_ITEMS.every((item) => item.sideSrc.endsWith('-side.png'))).toBe(true);
  });

  it('composes production cards from explicit layers and preloads animation sheets', () => {
    expect(studioSource).toContain('[asset.topSrc, asset.sideSrc, asset.topAnimSrc]');
    expect(studioSource).toContain('<TileLayerCard asset={a} animationFrame={animationFrame} />');
    expect(surfaceLabSource).toContain('asset.sideSrc');
    expect(surfaceLabSource).toContain('asset.topSrc');
    expect(levelEditorSource).not.toContain('brushAsset.src');
    expect(levelEditorSource).not.toContain('tile.src');
  });

  it('deletes the retired whole-tile catalog and Tile Pipeline viewer end to end', () => {
    expect(existsSync(new URL('../art/nonProductionTiles.ts', import.meta.url))).toBe(false);
    expect(existsSync(new URL('./TileCompareLab.tsx', import.meta.url))).toBe(false);
    expect(`${appSource}\n${studioSource}`).not.toMatch(/tile-compare|tilecompare|Tile Pipeline|nonProduction/);
    expect(routeScreenKey('/tile-compare')).toBe('menu');
    expect(titleBarConfig('/tile-compare')?.screenName).toBe('Main Menu');
  });
});
