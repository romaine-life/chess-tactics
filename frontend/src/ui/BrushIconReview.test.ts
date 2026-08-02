import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import { brushIconReviewCandidates } from './BrushIconReview';
import {
  BRUSH_ICON_EXPLORATION_OBJECT_ID,
  brushIconProductionCandidate,
  LEVEL_EDITOR_BRUSH_ICON_OPTION_01_SHA256,
  LEVEL_EDITOR_BRUSH_ICON_PRODUCTION_STAGE,
  LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE,
  levelEditorBrushIconReviewProof,
} from './brushIconLiveMedia';

const media = {
  url: '/api/admin/media/brush',
  sha256: 'a'.repeat(64),
  mediaType: 'image/png' as const,
  width: 64,
  height: 64,
  byteLength: 1,
};

function version(overrides: Partial<AdminLiveMediaVersion>): AdminLiveMediaVersion {
  return {
    id: 'candidate',
    slot: 'ui/kit/icons/brush.png',
    sourcePath: null,
    domain: 'ui-kit',
    role: 'icon',
    label: 'Level Editor brush icon',
    status: 'candidate',
    productionEligible: false,
    metadata: { candidateIndex: 1 },
    provenance: { pixelLabObjectId: BRUSH_ICON_EXPLORATION_OBJECT_ID },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    updatedBy: null,
    media,
    ...overrides,
  };
}

describe('Level Editor brush icon review', () => {
  it('keeps only private candidates from the current native pack and orders their option numbers', () => {
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-08-01T00:00:00.000Z',
      slots: [],
      versions: [
        version({ id: 'second', metadata: { candidateIndex: 2 } }),
        version({ id: 'accepted', status: 'accepted' }),
        version({ id: 'other-pack', provenance: { pixelLabObjectId: 'different' } }),
        version({ id: 'missing-bytes', media: null }),
        version({ id: 'first', metadata: { candidateIndex: 1 } }),
      ],
    } satisfies AdminLiveMediaCatalog;

    expect(brushIconReviewCandidates(catalog).map(({ id }) => id)).toEqual(['first', 'second']);
  });

  it('admits only an exact 18px role-native production candidate and builds a slot-snapshotted proof', () => {
    const olderProduction = version({
      id: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-07-31T00:00:00.000Z',
      metadata: { productionStage: LEVEL_EDITOR_BRUSH_ICON_PRODUCTION_STAGE },
      media: { ...media, width: 18, height: 18 },
    });
    const production = version({
      id: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-08-02T00:00:00.000Z',
      metadata: { productionStage: LEVEL_EDITOR_BRUSH_ICON_PRODUCTION_STAGE },
      nativeEvidence: { opaqueBounds: { x: 2, y: 2, width: 14, height: 14 } },
      media: { ...media, width: 18, height: 18 },
    });
    const scaledOption01 = version({
      id: '44444444-4444-4444-8444-444444444444',
      createdAt: '2026-08-03T00:00:00.000Z',
      metadata: { productionStage: LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE },
      nativeEvidence: { opaqueBounds: { x: 4, y: 3, width: 56, height: 58 } },
      media: {
        ...media,
        sha256: LEVEL_EDITOR_BRUSH_ICON_OPTION_01_SHA256,
        width: 64,
        height: 64,
      },
    });
    const slot = {
      slot: 'ui/kit/icons/brush.png',
      domain: 'ui-kit',
      role: 'icon',
      availabilityPolicy: 'critical' as const,
      lifecycleState: 'staging' as const,
      activeVersionId: null,
      rowRevision: 0,
      metadata: {},
      versionStatus: null,
      productionEligible: false,
      media: null,
    };
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-08-01T00:00:00.000Z',
      slots: [slot],
      versions: [version({ id: 'exploration' }), olderProduction, production, scaledOption01],
    } satisfies AdminLiveMediaCatalog;

    expect(brushIconProductionCandidate(catalog)?.id).toBe(scaledOption01.id);
    expect(brushIconProductionCandidate(catalog, 'exploration')).toBeNull();
    expect(levelEditorBrushIconReviewProof({
      version: scaledOption01,
      slot,
      surfaceUrl: `http://brush.chess-tactics.localhost/editor/level?brushIconReviewVersion=${scaledOption01.id}`,
    })).toMatchObject({
      assetLocalScale: 0.3125,
      spatialResampling: true,
      frameWidth: 64,
      drawWidth: 20,
    });
    expect(levelEditorBrushIconReviewProof({
      version: production,
      slot,
      surfaceUrl: `http://brush.chess-tactics.localhost/editor/level?brushIconReviewVersion=${production.id}`,
    })).toMatchObject({
      frameWidth: 18,
      drawWidth: 18,
      selectedCandidates: [{ versionId: production.id, rowRevision: production.rowRevision }],
      slotSnapshots: [{ rowRevision: 0, activeVersionId: null }],
    });
  });
});
