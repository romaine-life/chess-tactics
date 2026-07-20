import { afterEach, describe, expect, it } from 'vitest';
import { applyDrawableCatalog } from '@chess-tactics/board-render';
import { testDrawableCatalog } from '../test/drawableCatalog';
import { installedPortraitCrops } from './portraitCrops';

describe('database-owned portrait crops', () => {
  afterEach(() => applyDrawableCatalog(testDrawableCatalog()));

  it('projects crop geometry from the installed drawable row', () => {
    const catalog = testDrawableCatalog();
    const pawn = catalog.assets.find((asset) => asset.kind === 'unit-portrait' && asset.behavior.piece === 'pawn')!;
    pawn.behavior.crop = { cx: 0.123, cy: 0.456, s: 0.789 };
    applyDrawableCatalog({ ...catalog, revision: catalog.revision + 1 });
    expect(installedPortraitCrops().pawn).toEqual({ cx: 0.123, cy: 0.456, s: 0.789 });
  });

  it('fails closed when an installed crop is absent', () => {
    const catalog = testDrawableCatalog();
    const pawn = catalog.assets.find((asset) => asset.kind === 'unit-portrait' && asset.behavior.piece === 'pawn')!;
    delete pawn.behavior.crop;
    applyDrawableCatalog({ ...catalog, revision: catalog.revision + 1 });
    expect(() => installedPortraitCrops()).toThrow('has no database-owned crop');
  });
});
