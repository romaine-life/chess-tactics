'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  THUMBNAIL_DEPENDENCY_SCHEMA_VERSION,
  thumbnailContentVersion,
  thumbnailContentVersionForPlan,
} = require('./thumbnailVersion');

const PLAN = {
  ops: [{
    layer: 'terrain',
    src: `/api/media/${'a'.repeat(64)}`,
    dx: 0,
    dy: 0,
    dw: 96,
    dh: 64,
    z: 1000,
  }],
  occlusionMasks: [],
  bounds: { minX: 0, minY: 0, width: 96, height: 64 },
  framingBounds: { minX: 0, minY: 0, width: 96, height: 64 },
  contentHash: 'deadbeef',
};

function version({
  plan = PLAN,
  dependencies = [{
    src: PLAN.ops[0].src,
    availability: 'critical',
    sha256: 'a'.repeat(64),
  }],
} = {}) {
  return thumbnailContentVersion({
    kind: 'board-thumbnail',
    rendererRevision: 8,
    renderInputs: { plan },
    sourceDependencies: dependencies,
  });
}

test('thumbnail versions carry the renderer and dependency-schema revisions', () => {
  assert.equal(THUMBNAIL_DEPENDENCY_SCHEMA_VERSION, 1);
  assert.match(version(), /^board-thumbnail-r8-d1-[0-9a-f]{64}$/);
});

test('the same exact render inputs produce the same version regardless of object key order', () => {
  const reorderedPlan = {
    contentHash: PLAN.contentHash,
    framingBounds: PLAN.framingBounds,
    bounds: PLAN.bounds,
    occlusionMasks: PLAN.occlusionMasks,
    ops: PLAN.ops,
  };
  assert.equal(version(), version({ plan: reorderedPlan }));
});

test('only semantic media consumed by the render plan affects the thumbnail version', () => {
  const semanticPlan = {
    ...PLAN,
    ops: [{ ...PLAN.ops[0], src: '/assets/boards/example/plate.png' }],
  };
  const catalog = {
    slots: [{
      slot: 'boards/example/plate.png',
      availabilityPolicy: 'critical',
      media: { sha256: 'a'.repeat(64) },
    }, {
      slot: 'sfx/gold-sell/v0.wav',
      availabilityPolicy: 'decorative',
      media: { sha256: 'b'.repeat(64) },
    }],
  };
  const contentVersion = (mediaCatalog) => thumbnailContentVersionForPlan({
    kind: 'board-thumbnail',
    rendererRevision: 8,
    plan: semanticPlan,
    mediaCatalog,
    mediaAvailability: mediaCatalog,
  });
  const initial = contentVersion(catalog);
  const unrelatedChange = {
    slots: catalog.slots.map((entry) => (
      entry.slot.startsWith('sfx/')
        ? { ...entry, media: { sha256: 'c'.repeat(64) } }
        : entry
    )),
  };
  const selectedChange = {
    slots: catalog.slots.map((entry) => (
      entry.slot.startsWith('boards/')
        ? { ...entry, media: { sha256: 'd'.repeat(64) } }
        : entry
    )),
  };

  assert.equal(contentVersion(unrelatedChange), initial);
  assert.notEqual(
    contentVersion(selectedChange),
    initial,
  );
});

test('a consumed media version, geometry, or availability change invalidates the thumbnail', () => {
  const initial = version();
  assert.notEqual(initial, version({
    plan: {
      ...PLAN,
      ops: PLAN.ops.map((op) => ({ ...op, dx: op.dx + 1 })),
    },
  }));
  assert.notEqual(initial, version({
    dependencies: [{
      src: PLAN.ops[0].src,
      availability: 'critical',
      sha256: 'b'.repeat(64),
    }],
  }));
  assert.notEqual(initial, version({
    dependencies: [{
      src: PLAN.ops[0].src,
      availability: 'decorative',
      sha256: 'a'.repeat(64),
    }],
  }));
});

test('source dependencies are canonicalized by source identity', () => {
  const first = {
    src: `/api/media/${'a'.repeat(64)}`,
    availability: 'critical',
    sha256: 'a'.repeat(64),
  };
  const second = {
    src: `/api/media/${'b'.repeat(64)}`,
    availability: 'decorative',
    sha256: 'b'.repeat(64),
  };
  assert.equal(
    version({ dependencies: [first, second] }),
    version({ dependencies: [second, first] }),
  );
});
