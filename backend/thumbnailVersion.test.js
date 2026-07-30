const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function loadThumbnailVersionContract() {
  const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const startMarker = 'const BOARD_THUMBNAIL_RENDER_REVISION =';
  const endMarker = '\nfunction playScreenName(';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'server thumbnail-version contract markers must remain inspectable');
  const sandbox = {
    crypto: require('node:crypto'),
    canonicalJson: (value) => JSON.stringify(value),
    serverRender: {
      levelThumbnailMediaSlots: (level) => level.thumbnailMediaSlots || [],
    },
  };
  vm.runInNewContext(
    `${source.slice(start, end)}\nthis.contract = { BOARD_THUMBNAIL_RENDER_REVISION, thumbnailVersion, thumbnailVersionMatchesLevel, thumbnailMediaDependencyRevision };`,
    sandbox,
  );
  return sandbox.contract;
}

const {
  BOARD_THUMBNAIL_RENDER_REVISION,
  thumbnailVersion,
  thumbnailVersionMatchesLevel,
  thumbnailMediaDependencyRevision,
} = loadThumbnailVersionContract();

test('thumbnail version always carries the committed renderer revision', () => {
  assert.equal(BOARD_THUMBNAIL_RENDER_REVISION, 7);
  assert.equal(thumbnailVersion('deadbeef'), 'deadbeef-br7');
  assert.notEqual(thumbnailVersion('deadbeef'), 'deadbeef');
});

test('thumbnail version composes renderer and board-owned live render-input revisions deterministically', () => {
  assert.equal(
    thumbnailVersion('deadbeef', {
      propSeatsRevision: 2,
      unitCatalogRevision: 4,
      mediaCatalogRevision: 5,
      mediaDependencyRevision: 'a1b2c3',
      drawableCatalogRevision: 6,
    }),
    'deadbeef-br7-ps2-uc4-mc5-mda1b2c3-dc6',
  );
  assert.equal(
    thumbnailVersion('deadbeef', {
      propSeatsRevision: 0,
      unitCatalogRevision: 0,
      mediaDependencyRevision: '',
      drawableCatalogRevision: 0,
    }),
    'deadbeef-br7',
  );
});

test('unrelated global media catalog changes do not invalidate a level with no semantic media dependency', () => {
  const level = { thumbnailMediaSlots: [] };
  assert.equal(
    thumbnailVersionMatchesLevel(
      level,
      'deadbeef-br7-ps2-uc4-mc1663-dc6',
      {
        propSeatsRevision: 2,
        unitCatalogRevision: 4,
        mediaCatalogRevision: 1664,
        drawableCatalogRevision: 6,
        thumbnailMediaCatalog: { slots: [] },
      },
      'deadbeef',
    ),
    true,
  );
});

test('only the semantic media slot selected by the level affects its dependency revision', () => {
  const level = { thumbnailMediaSlots: ['boards/example/plate.png'] };
  const catalog = {
    slots: [
      {
        slot: 'boards/example/plate.png',
        availabilityPolicy: 'critical',
        lifecycleState: 'active',
        activeVersionId: 'board-v1',
        rowRevision: 1,
        versionStatus: 'accepted',
        media: { sha256: 'a'.repeat(64) },
      },
      {
        slot: 'sfx/card-purchase/v0.wav',
        availabilityPolicy: 'decorative',
        lifecycleState: 'active',
        activeVersionId: 'sfx-v1',
        rowRevision: 1,
        versionStatus: 'accepted',
        media: { sha256: 'b'.repeat(64) },
      },
    ],
  };
  const initial = thumbnailMediaDependencyRevision(level, catalog);
  const unrelatedChange = thumbnailMediaDependencyRevision(level, {
    slots: catalog.slots.map((entry) => (
      entry.slot.startsWith('sfx/')
        ? { ...entry, activeVersionId: 'sfx-v2', media: { sha256: 'c'.repeat(64) } }
        : entry
    )),
  });
  const selectedChange = thumbnailMediaDependencyRevision(level, {
    slots: catalog.slots.map((entry) => (
      entry.slot.startsWith('boards/')
        ? { ...entry, activeVersionId: 'board-v2', media: { sha256: 'd'.repeat(64) } }
        : entry
    )),
  });

  assert.equal(unrelatedChange, initial);
  assert.notEqual(selectedChange, initial);
});
