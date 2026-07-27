import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import boardRender from '../dist/index.cjs';
import {
  installTestDrawableCatalogWithSourceOnlyStructure,
  installTestPropSeats,
  resetTestDrawableCatalog,
  resetTestPropSeats,
} from './drawableCatalog.mjs';

before(installTestDrawableCatalogWithSourceOnlyStructure);
after(() => {
  resetTestPropSeats();
  resetTestDrawableCatalog();
});

test('source-only landmark turntables stay visual-only in the shared runtime reader', () => {
  const art = boardRender.structureArtAsset('castle-ruin');
  assert.deepEqual(
    {
      kind: art?.kind,
      sourceOnly: art?.sourceOnly,
      terrains: art?.terrains,
      blocking: art?.blocking,
      dimensions: art ? { w: art.sprite.w, h: art.sprite.h } : null,
    },
    {
      kind: 'landmark',
      sourceOnly: true,
      terrains: [],
      blocking: false,
      dimensions: { w: 512, h: 512 },
    },
  );
  assert.equal(boardRender.structureArtHasCompleteTurntable('castle-ruin'), true);
  assert.match(boardRender.structureArtHalfSrc('castle-ruin', 'back'), /^\/api\/media\/[0-9a-f]{64}$/);

  assert.doesNotThrow(installTestPropSeats);
  assert.equal(boardRender.PROP_DEFS.some((definition) => definition.id === 'castle-ruin'), false);
  assert.equal(boardRender.DOODAD_ASSETS.some((asset) => asset.id === 'source-doodad'), false);
});
