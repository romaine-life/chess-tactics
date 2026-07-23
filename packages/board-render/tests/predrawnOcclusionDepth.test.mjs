import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  decodePredrawnOcclusionDepth,
  encodePredrawnOcclusionDepth,
  filterPredrawnOcclusionDepthPixels,
  predrawnOcclusionDepthMapForSurface,
} = require('../dist/index.cjs');

test('pre-drawn occlusion depth preserves half-depth lanes', () => {
  for (const depth of [-2000, -0.5, 0, 17.5, 9000]) {
    assert.equal(decodePredrawnOcclusionDepth(...encodePredrawnOcclusionDepth(depth)), depth);
  }
});

test('pre-drawn occlusion erases only where persisted geometry is in front', () => {
  const behind = encodePredrawnOcclusionDepth(4);
  const equal = encodePredrawnOcclusionDepth(5);
  const front = encodePredrawnOcclusionDepth(5.5);
  const source = new Uint8ClampedArray([
    ...behind, 255,
    ...equal, 255,
    ...front, 192,
    ...front, 0,
  ]);

  const result = filterPredrawnOcclusionDepthPixels(source, 5);
  assert.deepEqual([...result], [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 192,
    0, 0, 0, 0,
  ]);
});

test('versioned surfaces resolve their exact immutable mask', () => {
  const backgroundVersionId = '11111111-1111-4111-8111-111111111111';
  const occlusionVersionId = '22222222-2222-4222-8222-222222222222';
  assert.deepEqual(predrawnOcclusionDepthMapForSurface({
    kind: 'predrawn',
    schemaVersion: 2,
    backgroundVersionId,
    occlusionVersionId,
    frameWidth: 1200,
    frameHeight: 800,
    worldBounds: { minX: -20, minY: -30, width: 600, height: 400 },
  }), {
    src: `/api/background-versions/${occlusionVersionId}/content`,
    frameWidth: 1200,
    frameHeight: 800,
    worldBounds: { minX: -20, minY: -30, width: 600, height: 400 },
  });
});
