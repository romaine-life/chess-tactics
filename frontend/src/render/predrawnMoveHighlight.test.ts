import { describe, expect, it } from 'vitest';
import {
  FULL_CELL_MOVE_HIGHLIGHT_CLIP_PATH,
  PREDRAWN_VISUAL_FOOTPRINT_CLIP_CSS_PROPERTY,
  normalizePredrawnMoveHighlightFootprint,
  normalizePredrawnMoveHighlightProfile,
  predrawnMoveHighlightClipPath,
  predrawnVisualFootprintClipStyleForCell,
} from '@chess-tactics/board-render';

const BACKGROUND_ID = '11111111-1111-4111-8111-111111111111';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const INSET = [5000, 1000, 9000, 5000, 5000, 9000, 1000, 5000] as const;

describe('pre-drawn visual footprints stored in the move-highlight profile', () => {
  it('normalizes a contained convex integer footprint and emits its exact CSS polygon', () => {
    expect(normalizePredrawnMoveHighlightFootprint(INSET)).toEqual(INSET);
    expect(predrawnMoveHighlightClipPath(INSET)).toBe(
      'polygon(50% 10%, 90% 50%, 50% 90%, 10% 50%)',
    );
  });

  it('rejects fractional, outside-diamond, and folded entries while sparsifying the full default', () => {
    expect(normalizePredrawnMoveHighlightFootprint(
      [5000.5, 1000, 9000, 5000, 5000, 9000, 1000, 5000],
    )).toBeUndefined();
    expect(normalizePredrawnMoveHighlightFootprint(
      [1000, 1000, 9000, 5000, 5000, 9000, 1000, 5000],
    )).toBeUndefined();
    expect(normalizePredrawnMoveHighlightFootprint(
      [5000, 1000, 1000, 5000, 5000, 9000, 9000, 5000],
    )).toBeUndefined();
    expect(normalizePredrawnMoveHighlightProfile({
      schema: 'predrawn-move-highlight-profile-v1',
      backgroundVersionId: BACKGROUND_ID,
      coordinateBasis: 'cell-diamond-10000-v1',
      environmentGeometrySha256: SHA_A,
      profileSha256: SHA_B,
      cells: {
        '1,2': [5000, 0, 10000, 5000, 5000, 10000, 0, 5000],
      },
    })?.cells).toEqual({});
  });

  it('returns a visual clip only for a sparse cell bound to the exact schema-v3 background', () => {
    const profile = normalizePredrawnMoveHighlightProfile({
      schema: 'predrawn-move-highlight-profile-v1',
      backgroundVersionId: BACKGROUND_ID,
      coordinateBasis: 'cell-diamond-10000-v1',
      environmentGeometrySha256: SHA_A,
      profileSha256: SHA_B,
      cells: { '1,2': INSET },
    });
    expect(profile).toBeDefined();

    expect(predrawnVisualFootprintClipStyleForCell({
      kind: 'predrawn',
      schemaVersion: 3,
      backgroundVersionId: BACKGROUND_ID,
      moveHighlightProfile: profile,
    }, '1,2')).toEqual({
      [PREDRAWN_VISUAL_FOOTPRINT_CLIP_CSS_PROPERTY]:
        'polygon(50% 10%, 90% 50%, 50% 90%, 10% 50%)',
    });
    expect(predrawnVisualFootprintClipStyleForCell({
      kind: 'predrawn',
      schemaVersion: 3,
      backgroundVersionId: BACKGROUND_ID,
      moveHighlightProfile: profile,
    }, '0,0')).toBeUndefined();
    expect(predrawnVisualFootprintClipStyleForCell({
      kind: 'predrawn',
      schemaVersion: 3,
      backgroundVersionId: '22222222-2222-4222-8222-222222222222',
      moveHighlightProfile: profile,
    }, '1,2')).toBeUndefined();
    expect(predrawnMoveHighlightClipPath(undefined)).toBe(FULL_CELL_MOVE_HIGHLIGHT_CLIP_PATH);
  });
});
