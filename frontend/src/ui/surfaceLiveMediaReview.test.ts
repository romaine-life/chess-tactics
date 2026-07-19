import { describe, expect, it } from 'vitest';
import { tileFamilies } from '../art/tileset';
import type {
  AdminLiveMediaCatalog,
  AdminLiveMediaSlot,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import {
  isReviewedForCurrentContent,
  isReviewedForCurrentSurfaceSnapshot,
  selectedSurfaceOverrides,
  surfaceAcceptanceItems,
  surfaceReviewBatch,
  surfaceReviewProofEvidence,
  waterSideCanonicalProofBoard,
} from './surfaceLiveMediaReview';

const requiredSlots = Array.from({ length: 8 }, (_, index) => `tiles/surface/water-${index}-side.png`);

function slot(slotId: string, index: number): AdminLiveMediaSlot {
  return {
    slot: slotId,
    domain: 'terrain',
    role: 'side',
    availabilityPolicy: 'critical',
    lifecycleState: 'active',
    activeVersionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    rowRevision: 40 + index,
    metadata: { acceptance: { mode: 'group', groupId: 'terrain/water/side-v1', requiredSlots } },
    versionStatus: 'legacy-bridge',
    productionEligible: false,
    media: null,
  };
}

function version(slotId: string, index: number, reviewed = false): AdminLiveMediaVersion {
  const sha256 = String(index + 1).repeat(64).slice(0, 64);
  return {
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    slot: slotId,
    sourcePath: null,
    domain: 'terrain',
    role: 'side',
    label: `Water side ${index}`,
    status: 'candidate',
    productionEligible: false,
    metadata: {},
    provenance: { generator: 'synthetic-test' },
    nativeEvidence: { assetLocalScale: 1 },
    reviewEvidence: reviewed ? {
      approved: true,
      contentSha256: sha256,
      notes: 'Inspected all eight abrupt edge variants.',
      surfaceUrl: 'https://example.test/studio?sfamily=water',
      evidence: {
        canonicalScale: 1,
        slotSnapshots: [{
          slot: slotId,
          rowRevision: 40 + index,
          activeVersionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        }],
      },
    } : {},
    rowRevision: 10 + index,
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: `2026-07-11T00:00:${String(index).padStart(2, '0')}.000Z`,
    updatedBy: null,
    media: {
      url: `/api/admin/media/${sha256}`,
      sha256,
      mediaType: 'image/png',
      width: 96,
      height: 180,
      byteLength: 500 + index,
    },
  };
}

function catalog(reviewed = false): AdminLiveMediaCatalog {
  return {
    schemaVersion: 1,
    revision: 17,
    updatedAt: '2026-07-11T00:01:00.000Z',
    slots: requiredSlots.map(slot),
    versions: requiredSlots.map((slotId, index) => version(slotId, index, reviewed)),
  };
}

describe('surface live-media review', () => {
  it('requires every selected Water group member and overrides exact stable side slots', () => {
    const snapshot = catalog();
    const selection = Object.fromEntries(snapshot.versions.slice(0, 7).map((item) => [item.slot!, item.id]));

    const incomplete = surfaceReviewBatch(snapshot, selection);
    expect(incomplete.missingSlots).toEqual(['tiles/surface/water-7-side.png']);

    selection[requiredSlots[7]] = snapshot.versions[7].id;
    const complete = surfaceReviewBatch(snapshot, selection);
    expect(complete.versions).toHaveLength(8);
    expect(complete.groups).toEqual([{ groupId: 'terrain/water/side-v1', requiredSlots }]);

    const overrides = selectedSurfaceOverrides(snapshot, selection);
    expect(overrides.get('/assets/tiles/surface/water-0-side.png')).toBe(snapshot.versions[0].media?.url);
    expect(overrides.has('/assets/tiles/surface/water-0.png')).toBe(false);
  });

  it('pins proof evidence to every candidate hash and accepts with version plus slot CAS', () => {
    const snapshot = catalog(true);
    const versions = snapshot.versions;
    const evidence = surfaceReviewProofEvidence({
      family: 'water',
      surfaceUrl: 'https://example.test/studio?sfamily=water',
      versions,
      slots: snapshot.slots,
      groups: [{ groupId: 'terrain/water/side-v1', requiredSlots }],
    });

    expect(evidence).toMatchObject({
      canonicalScale: 1,
      assetLocalScale: 1,
      spatialResampling: false,
      abruptExposedEdge: true,
      exposedFaces: ['south', 'east'],
    });
    expect((evidence.selectedCandidates as Array<{ sha256: string }>).map((item) => item.sha256))
      .toEqual(versions.map((item) => item.media?.sha256));
    expect((evidence.selectedCandidates as Array<{ faces: string[] }>).every(
      (item) => item.faces.join(',') === 'south,east',
    )).toBe(true);
    expect(versions.every(isReviewedForCurrentContent)).toBe(true);
    expect(versions.every((version, index) => isReviewedForCurrentSurfaceSnapshot(version, snapshot.slots[index]))).toBe(true);

    expect(surfaceAcceptanceItems(snapshot, versions)[0]).toEqual({
      id: versions[0].id,
      expectedRevision: 10,
      expectedSlotRevision: 40,
      expectedActiveVersionId: snapshot.slots[0].activeVersionId,
    });
  });

  it('invalidates review evidence when the selected bytes change', () => {
    const candidate = version(requiredSlots[0], 0, true);
    candidate.media = { ...candidate.media!, sha256: 'f'.repeat(64) };
    expect(isReviewedForCurrentContent(candidate)).toBe(false);
  });

  it('invalidates acceptance readiness when the slot pointer snapshot changes', () => {
    const candidate = version(requiredSlots[0], 0, true);
    const currentSlot = slot(requiredSlots[0], 0);
    expect(isReviewedForCurrentSurfaceSnapshot(candidate, currentSlot)).toBe(true);
    expect(isReviewedForCurrentSurfaceSnapshot(candidate, { ...currentSlot, rowRevision: currentSlot.rowRevision + 1 })).toBe(false);
  });

  it('does not attach Water side variants to terrain cells implicitly', () => {
    const board = waterSideCanonicalProofBoard(tileFamilies.water);
    expect(board.cells).toHaveLength(64);
    expect(board.cells.every((cell) => !('sideAssets' in cell))).toBe(true);
  });
});
