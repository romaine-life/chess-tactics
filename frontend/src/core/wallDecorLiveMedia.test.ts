import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDrawableCatalog,
  applyWallDecorCatalog,
  resetDrawableCatalog,
  resetWallDecorCatalog,
  WALL_DECOR_ASSETS,
  wallDecorAsset,
} from '@chess-tactics/board-render';
import { testDrawableCatalog } from '../test/drawableCatalog';

afterEach(() => { resetWallDecorCatalog(); resetDrawableCatalog(); });

describe('wall decoration drawable projection', () => {
  it('derives inventory, geometry, and immutable media from DB rows', () => {
    const catalog = testDrawableCatalog();
    catalog.assets = catalog.assets.filter((asset) => asset.id === 'banner-tattered');
    applyDrawableCatalog(catalog);
    applyWallDecorCatalog();
    expect(WALL_DECOR_ASSETS.map((asset) => asset.id)).toEqual(['banner-tattered']);
    expect(wallDecorAsset('banner-tattered')).toMatchObject({
      label: 'Tattered Banner', kind: 'banner', width: 72, height: 96, mountX: 36, mountY: 10,
      faces: { west: { width: 26, height: 84, mountX: 13, mountY: 10 }, north: { mountX: 13, mountY: 11 } },
    });
  });

  it('does not require a compiled installed roster', () => {
    const catalog = testDrawableCatalog();
    const banner = catalog.assets.find((asset) => asset.id === 'banner-tattered')!;
    catalog.assets = [{ ...banner, id: 'banner-newly-installed', label: 'Newly Installed' }];
    applyDrawableCatalog(catalog);
    applyWallDecorCatalog();
    expect(WALL_DECOR_ASSETS.map((asset) => asset.id)).toEqual(['banner-newly-installed']);
  });

  it('rejects an incomplete row instead of assembling a partial asset', () => {
    const catalog = testDrawableCatalog();
    const banner = catalog.assets.find((asset) => asset.id === 'banner-tattered')!;
    delete banner.media.north;
    catalog.assets = [banner];
    applyDrawableCatalog(catalog);
    expect(() => applyWallDecorCatalog()).toThrow(/north media/);
  });
});
