import { describe, expect, it } from 'vitest';
import { WALL_FRAME_GEOMETRY } from '@chess-tactics/board-render';
import type {
  AdminLiveMediaCatalog,
  AdminLiveMediaSlot,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import {
  WALL_MATERIAL_PROOF_RENDERER,
  WALL_MATERIAL_PROOF_SCHEMA,
  hasCanonicalWallGeometry,
  isWallReviewCurrent,
  wallAcceptanceItems,
  wallNativeEvidence,
  wallReviewBatch,
  wallReviewProofEvidence,
  wallSlotIdentity,
} from './wallMaterialReview';

const sha = (seed: string): string => seed.repeat(64).slice(0, 64);

function slot(slotId: string, overrides: Partial<AdminLiveMediaSlot> = {}): AdminLiveMediaSlot {
  return {
    slot: slotId,
    domain: 'terrain',
    role: slotId.endsWith('-thumb.png') ? 'review' : 'media',
    availabilityPolicy: slotId.endsWith('-thumb.png') ? 'decorative' : 'critical',
    lifecycleState: 'active',
    activeVersionId: '00000000-0000-4000-8000-000000000001',
    rowRevision: 1,
    metadata: {},
    versionStatus: 'legacy-bridge',
    productionEligible: false,
    media: {
      url: `/api/media/${sha('a')}`,
      immutableUrl: `/api/media/${sha('a')}`,
      sha256: sha('a'),
      mediaType: 'image/png',
      width: 128,
      height: 240,
      byteLength: 500,
    },
    ...overrides,
  } as AdminLiveMediaSlot;
}

function version(slotId: string, overrides: Partial<AdminLiveMediaVersion> = {}): AdminLiveMediaVersion {
  const thumb = slotId.endsWith('-thumb.png');
  return {
    id: `10000000-0000-4000-8000-${slotId.length.toString().padStart(12, '0')}`,
    slot: slotId,
    sourcePath: null,
    domain: 'terrain',
    role: thumb ? 'review' : 'media',
    label: `full-height ${slotId}`,
    status: 'candidate',
    productionEligible: false,
    metadata: {},
    provenance: { pipeline: 'build-wall-tiles.py' },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-07-15T03:59:19.224Z',
    updatedAt: '2026-07-15T03:59:19.677Z',
    updatedBy: 'nelson@romaine.life',
    media: {
      url: `/api/admin/media/${sha('b')}`,
      sha256: sha('b'),
      mediaType: 'image/png',
      width: thumb ? 198 : WALL_FRAME_GEOMETRY.width,
      height: thumb ? 198 : WALL_FRAME_GEOMETRY.height,
      byteLength: 34880,
    },
    ...overrides,
  } as AdminLiveMediaVersion;
}

const FRAME_SLOT = 'tiles/feature/wall-stone-9.png';
const THUMB_SLOT = 'tiles/feature/wall-stone-thumb.png';

function catalog(versions: AdminLiveMediaVersion[], slots = [slot(FRAME_SLOT), slot(THUMB_SLOT)]): AdminLiveMediaCatalog {
  return { schemaVersion: 1, revision: 7, updatedAt: null, slots, versions } as AdminLiveMediaCatalog;
}

describe('wall slot identity', () => {
  it('names the material and face, and ignores every other semantic slot', () => {
    expect(wallSlotIdentity('tiles/feature/wall-mossy-1.png')).toEqual({ material: 'mossy', mask: 1, thumb: false });
    expect(wallSlotIdentity('tiles/feature/wall-mossy-8.png')).toEqual({ material: 'mossy', mask: 8, thumb: false });
    expect(wallSlotIdentity(THUMB_SLOT)).toEqual({ material: 'stone', mask: null, thumb: true });
    expect(wallSlotIdentity('tiles/feature/wall-mossy-2.png')).toBeNull();
    expect(wallSlotIdentity('tiles/surface/grass-0.png')).toBeNull();
    expect(wallSlotIdentity('tiles/feature/fence-wood-2.png')).toBeNull();
  });
});

describe('wall candidate selection', () => {
  it('accepts only candidates that already carry the ADR-0086 full-height frame', () => {
    const canonical = version(FRAME_SLOT);
    const short = version(FRAME_SLOT, { media: { ...canonical.media!, height: 240 } });
    expect(hasCanonicalWallGeometry(canonical, wallSlotIdentity(FRAME_SLOT)!)).toBe(true);
    expect(hasCanonicalWallGeometry(short, wallSlotIdentity(FRAME_SLOT)!)).toBe(false);
    // The pre-ADR-0086 bytes that shipped floating walls can never be picked up for review.
    expect(wallReviewBatch(catalog([short])).candidates).toEqual([]);
  });

  it('is geometry-driven, so a later bake is reviewable without editing the instrument', () => {
    const older = version(FRAME_SLOT, { id: '10000000-0000-4000-8000-000000000001', updatedAt: '2026-07-15T00:00:00.000Z' });
    const newer = version(FRAME_SLOT, {
      id: '10000000-0000-4000-8000-000000000002',
      updatedAt: '2026-09-01T00:00:00.000Z',
      label: 'a bake nobody hard-coded',
      media: { ...older.media!, sha256: sha('c') },
    });
    const batch = wallReviewBatch(catalog([older, newer]));
    expect(batch.candidates).toHaveLength(1);
    expect(batch.candidates[0].version.id).toBe(newer.id);
  });

  it('ignores non-candidate versions and slots absent from the catalog', () => {
    expect(wallReviewBatch(catalog([version(FRAME_SLOT, { status: 'accepted' })])).candidates).toEqual([]);
    expect(wallReviewBatch(catalog([version(FRAME_SLOT)], [])).candidates).toEqual([]);
    expect(wallReviewBatch(null).candidates).toEqual([]);
  });

  it('reports candidates whose uploader recorded no provenance instead of inventing one', () => {
    const batch = wallReviewBatch(catalog([version(FRAME_SLOT, { provenance: {} }), version(THUMB_SLOT)]));
    expect(batch.candidates).toHaveLength(2);
    expect(batch.missingProvenance.map((candidate) => candidate.slot)).toEqual([FRAME_SLOT]);
  });
});

describe('wall native evidence', () => {
  it('is derived from the candidate own bytes and skipped once already complete', () => {
    const candidate = version(FRAME_SLOT);
    expect(wallNativeEvidence(candidate)).toEqual({
      native1x: true,
      spatialResampling: false,
      sourceWidth: WALL_FRAME_GEOMETRY.width,
      sourceHeight: WALL_FRAME_GEOMETRY.height,
      sourceSha256: sha('b'),
    });
    expect(wallNativeEvidence({ ...candidate, nativeEvidence: wallNativeEvidence(candidate)! })).toBeNull();
    // Evidence pinned to different bytes is stale and must be rewritten.
    expect(wallNativeEvidence({
      ...candidate,
      nativeEvidence: { ...wallNativeEvidence(candidate)!, sourceSha256: sha('d') },
    })).not.toBeNull();
  });
});

describe('wall review proof', () => {
  const batch = wallReviewBatch(catalog([version(FRAME_SLOT), version(THUMB_SLOT)]));
  const surfaceUrl = 'http://127.0.0.1:5173/studio?cat=walls&mode=viewer&vk=wallcandidates';
  const proof = wallReviewProofEvidence({ surfaceUrl, candidates: batch.candidates, mountedSlots: [FRAME_SLOT] });

  it('pins the canonical wall geometry and the real barrier renderer', () => {
    expect(proof.schema).toBe(WALL_MATERIAL_PROOF_SCHEMA);
    expect(proof.renderer).toBe(WALL_MATERIAL_PROOF_RENDERER);
    expect(proof.canonicalScale).toBe(1);
    expect(proof.assetLocalScale).toBe(1);
    expect(proof.spatialResampling).toBe(false);
    expect(proof.deterministicProof).toBe(true);
    expect(proof.frameWidth).toBe(WALL_FRAME_GEOMETRY.width);
    expect(proof.frameHeight).toBe(WALL_FRAME_GEOMETRY.height);
    expect(proof.surfaceUrl).toBe(surfaceUrl);
  });

  it('identifies every reviewed candidate and the slot snapshot it was judged against', () => {
    expect(proof.selectedCandidates).toEqual([
      { slot: FRAME_SLOT, versionId: batch.candidates[0].version.id, sha256: sha('b'), rowRevision: 1, role: 'top' },
      { slot: THUMB_SLOT, versionId: batch.candidates[1].version.id, sha256: sha('b'), rowRevision: 1, role: 'top' },
    ]);
    expect(proof.slotSnapshots).toEqual([
      { slot: FRAME_SLOT, rowRevision: 1, activeVersionId: '00000000-0000-4000-8000-000000000001', lifecycleState: 'active' },
      { slot: THUMB_SLOT, rowRevision: 1, activeVersionId: '00000000-0000-4000-8000-000000000001', lifecycleState: 'active' },
    ]);
    expect(proof.mountedSlots).toEqual([FRAME_SLOT]);
  });

  it('carries acceptance items that compare-and-swap against the observed slot pointer', () => {
    expect(wallAcceptanceItems(batch.candidates)).toEqual([
      { id: batch.candidates[0].version.id, expectedRevision: 1, expectedSlotRevision: 1, expectedActiveVersionId: '00000000-0000-4000-8000-000000000001' },
      { id: batch.candidates[1].version.id, expectedRevision: 1, expectedSlotRevision: 1, expectedActiveVersionId: '00000000-0000-4000-8000-000000000001' },
    ]);
  });
});

describe('wall review currency', () => {
  const reviewEvidence = (overrides: Record<string, unknown> = {}) => ({
    approved: true,
    contentSha256: sha('b'),
    notes: 'seated on the board',
    surfaceUrl: 'http://127.0.0.1:5173/studio',
    evidence: {
      schema: WALL_MATERIAL_PROOF_SCHEMA,
      slotSnapshots: [{ slot: FRAME_SLOT, rowRevision: 1, activeVersionId: '00000000-0000-4000-8000-000000000001' }],
    },
    ...overrides,
  });

  it('holds only while the reviewed bytes and the slot pointer both stand still', () => {
    const current = wallReviewBatch(catalog([version(FRAME_SLOT, { reviewEvidence: reviewEvidence() })]));
    expect(isWallReviewCurrent(current.candidates[0])).toBe(true);

    const movedBytes = wallReviewBatch(catalog([
      version(FRAME_SLOT, { reviewEvidence: reviewEvidence({ contentSha256: sha('e') }) }),
    ]));
    expect(isWallReviewCurrent(movedBytes.candidates[0])).toBe(false);

    const movedSlot = wallReviewBatch(
      catalog([version(FRAME_SLOT, { reviewEvidence: reviewEvidence() })], [slot(FRAME_SLOT, { rowRevision: 9 })]),
    );
    expect(isWallReviewCurrent(movedSlot.candidates[0])).toBe(false);
  });

  it('rejects a review recorded through some other surface proof schema', () => {
    const foreign = wallReviewBatch(catalog([version(FRAME_SLOT, {
      reviewEvidence: reviewEvidence({
        evidence: { schema: 'terrain-surface-canonical-board-proof-v1', slotSnapshots: [] },
      }),
    })]));
    expect(isWallReviewCurrent(foreign.candidates[0])).toBe(false);
  });
});
