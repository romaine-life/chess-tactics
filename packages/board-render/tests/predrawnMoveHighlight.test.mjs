import assert from 'node:assert/strict';
import test from 'node:test';
import boardRender from '../dist/index.cjs';

const {
  decodeBoard,
  encodeBoard,
  normalizePredrawnMoveHighlightFootprint,
  normalizePredrawnMoveHighlightProfile,
  predrawnMoveHighlightClipPath,
} = boardRender;

const BACKGROUND_ID = '11111111-1111-4111-8111-111111111111';
const ENVIRONMENT_SHA = 'a'.repeat(64);
const PROFILE_SHA = 'b'.repeat(64);
const INSET = [5000, 1000, 9000, 5000, 5000, 9000, 1000, 5000];

test('move-highlight footprints are deterministic contained visual-only polygons', () => {
  assert.deepEqual(normalizePredrawnMoveHighlightFootprint(INSET), INSET);
  assert.equal(
    predrawnMoveHighlightClipPath(INSET),
    'polygon(50% 10%, 90% 50%, 50% 90%, 10% 50%)',
  );
  assert.equal(
    normalizePredrawnMoveHighlightFootprint(
      [1000, 1000, 9000, 5000, 5000, 9000, 1000, 5000],
    ),
    undefined,
  );
});

test('schema-v3 board surfaces round-trip an exact sparse move-highlight profile', () => {
  const moveHighlightProfile = normalizePredrawnMoveHighlightProfile({
    schema: 'predrawn-move-highlight-profile-v1',
    backgroundVersionId: BACKGROUND_ID,
    coordinateBasis: 'cell-diamond-10000-v1',
    environmentGeometrySha256: ENVIRONMENT_SHA,
    profileSha256: PROFILE_SHA,
    cells: { '1,0': INSET },
  });
  assert.ok(moveHighlightProfile);
  const board = {
    cols: 2,
    rows: 1,
    cells: {},
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {},
    featureCuts: {},
    featureExits: {},
    backgroundMode: 'ai',
    surface: {
      kind: 'predrawn',
      schemaVersion: 3,
      backgroundVersionId: BACKGROUND_ID,
      frameWidth: 1240,
      frameHeight: 700,
      worldBounds: { minX: -620, minY: -350, width: 1240, height: 700 },
      moveHighlightProfile,
    },
  };

  assert.deepEqual(decodeBoard(encodeBoard(board))?.surface, board.surface);
});
