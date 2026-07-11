const assert = require('node:assert/strict');
const test = require('node:test');

const {
  semanticSlotFromSource,
  thumbnailAvailabilityCatalogFromRows,
  thumbnailSourceAvailability,
} = require('./thumbnailAvailability');

const TERRAIN_SHA = 'a'.repeat(64);
const DECOR_SHA = 'b'.repeat(64);
const SHARED_SHA = 'c'.repeat(64);
const catalog = {
  slots: [
    {
      slot: 'tiles/surface/water-0-side.png',
      availabilityPolicy: 'critical',
      media: { sha256: TERRAIN_SHA },
    },
    {
      slot: 'wall-decor/vines.png',
      availabilityPolicy: 'decorative',
      media: { sha256: DECOR_SHA },
    },
    {
      slot: 'props/missing-banner.png',
      availabilityPolicy: 'decorative',
      media: null,
    },
    {
      slot: 'props/banner.png',
      availabilityPolicy: 'decorative',
      media: { sha256: SHARED_SHA },
    },
    {
      slot: 'tiles/shared.png',
      availabilityPolicy: 'critical',
      media: { sha256: SHARED_SHA },
    },
  ],
};

test('resolves semantic critical terrain and decorative wall art from one snapshot', () => {
  assert.equal(
    thumbnailSourceAvailability('/assets/tiles/surface/water-0-side.png', catalog),
    'critical',
  );
  assert.equal(thumbnailSourceAvailability('/assets/wall-decor/vines.png', catalog), 'decorative');
  assert.equal(thumbnailSourceAvailability('/assets/props/missing-banner.png', catalog), 'decorative');
});

test('decodes canonical semantic path segments', () => {
  assert.equal(semanticSlotFromSource('/assets/wall-decor/vines%20north.png?v=2'), 'wall-decor/vines north.png');
  assert.equal(semanticSlotFromSource('/assets/wall-decor/%2E%2E/secret.png'), null);
  assert.equal(semanticSlotFromSource('/assets/wall-decor%2Fsecret.png'), null);
});

test('immutable media is decorative only when every matching slot is decorative', () => {
  assert.equal(thumbnailSourceAvailability(`/api/media/${DECOR_SHA}`, catalog), 'decorative');
  assert.equal(thumbnailSourceAvailability(`/api/media/${SHARED_SHA}`, catalog), 'critical');
});

test('unknown sources and missing catalogs fail closed as critical', () => {
  assert.equal(thumbnailSourceAvailability('/assets/not-in-catalog.png', catalog), 'critical');
  assert.equal(thumbnailSourceAvailability('/assets/wall-decor/vines.png', null), 'critical');
  assert.equal(thumbnailSourceAvailability(`/api/unit-sprites/${'d'.repeat(64)}.png`, catalog), 'critical');
});

test('revision-matched policy rows restore decorative slots omitted from the public catalog', () => {
  const publicCatalog = {
    revision: 9,
    slots: [catalog.slots[0]],
  };
  const availability = thumbnailAvailabilityCatalogFromRows(publicCatalog, [
    { catalog_revision: 9, slot: 'tiles/surface/water-0-side.png', availability_policy: 'critical' },
    { catalog_revision: 9, slot: 'props/missing-banner.png', availability_policy: 'decorative' },
  ]);

  assert.equal(thumbnailSourceAvailability('/assets/props/missing-banner.png', availability), 'decorative');
  assert.equal(availability.slots[1].media, null);
});

test('mismatched policy rows cannot weaken a different catalog revision', () => {
  const publicCatalog = { revision: 10, slots: [catalog.slots[0]] };
  const availability = thumbnailAvailabilityCatalogFromRows(publicCatalog, [
    { catalog_revision: 11, slot: 'tiles/surface/water-0-side.png', availability_policy: 'decorative' },
  ]);

  assert.equal(availability, publicCatalog);
  assert.equal(
    thumbnailSourceAvailability('/assets/tiles/surface/water-0-side.png', availability),
    'critical',
  );
});
