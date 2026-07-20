import { afterEach, describe, expect, it } from 'vitest';
import { applyDrawableCatalog, resetDrawableCatalog } from '@chess-tactics/board-render';
import { testDrawableCatalog } from '../test/drawableCatalog';
import { liveScrollbarAssets } from './scrollbarCatalog';

afterEach(() => resetDrawableCatalog());

describe('live scrollbar catalog projection', () => {
  it('derives identity, presentation behavior, and media from drawable rows', () => {
    applyDrawableCatalog(testDrawableCatalog());
    expect(liveScrollbarAssets()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'oak-forge', label: 'Oak Forge', kind: 'sprite' }),
      expect.objectContaining({ name: 'oak-raw', label: 'Oak Raw', kind: 'texture' }),
    ]));
  });

  it('fails closed for an incomplete installed row', () => {
    const catalog = testDrawableCatalog();
    const row = catalog.assets.find((asset) => asset.id === 'oak-forge')!;
    delete row.media.preview;
    applyDrawableCatalog(catalog);
    expect(() => liveScrollbarAssets()).toThrow(/oak-forge is incomplete/);
  });
});
