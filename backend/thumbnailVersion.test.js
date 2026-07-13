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
  const sandbox = {};
  vm.runInNewContext(
    `${source.slice(start, end)}\nthis.contract = { BOARD_THUMBNAIL_RENDER_REVISION, thumbnailVersion };`,
    sandbox,
  );
  return sandbox.contract;
}

const { BOARD_THUMBNAIL_RENDER_REVISION, thumbnailVersion } = loadThumbnailVersionContract();

test('thumbnail version always carries the committed renderer revision', () => {
  assert.equal(BOARD_THUMBNAIL_RENDER_REVISION, 3);
  assert.equal(thumbnailVersion('deadbeef'), 'deadbeef-br3');
  assert.notEqual(thumbnailVersion('deadbeef'), 'deadbeef');
});

test('thumbnail version composes renderer and live render-input revisions deterministically', () => {
  assert.equal(
    thumbnailVersion('deadbeef', {
      propSeatsRevision: 2,
      wallArtRevision: 3,
      unitCatalogRevision: 4,
    }),
    'deadbeef-br3-ps2-wa3-uc4',
  );
  assert.equal(
    thumbnailVersion('deadbeef', {
      propSeatsRevision: 0,
      wallArtRevision: 0,
      unitCatalogRevision: 0,
    }),
    'deadbeef-br3',
  );
});
