import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaSlot, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import { RUN_CARD_BACK_SLOT } from './RunCardBack';
import {
  RUN_CARD_BACK_PROOF_RENDERER,
  RUN_CARD_BACK_PROOF_SCHEMA,
  runCardBackAcceptanceItem,
  runCardBackCandidateGroups,
  runCardBackPublished,
  runCardBackReviewHref,
  runCardBackReviewProof,
  runCardBackSelection,
} from './runCardBackLiveMedia';

const SHA_PUBLISHED = 'a'.repeat(64);
const SHA_CANDIDATE = 'b'.repeat(64);

const version = (over: Partial<AdminLiveMediaVersion>): AdminLiveMediaVersion => ({
  id: 'v-published',
  slot: RUN_CARD_BACK_SLOT,
  sourcePath: null,
  domain: 'ui-kit',
  role: 'card-back',
  label: 'Published back',
  status: 'accepted',
  productionEligible: true,
  metadata: {},
  provenance: {},
  nativeEvidence: {},
  reviewEvidence: {},
  rowRevision: 3,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: null,
  media: { url: '/assets/back.png', immutableUrl: '/api/media/x', sha256: SHA_PUBLISHED, mediaType: 'image/png', width: 1060, height: 1484, byteLength: 10 },
  ...over,
} as AdminLiveMediaVersion);

const slot: AdminLiveMediaSlot = {
  slot: RUN_CARD_BACK_SLOT,
  domain: 'ui-kit',
  role: 'card-back',
  availabilityPolicy: 'critical',
  lifecycleState: 'active',
  activeVersionId: 'v-published',
  rowRevision: 7,
  metadata: {},
  versionStatus: 'accepted',
  productionEligible: true,
  media: null,
} as AdminLiveMediaSlot;

const candidate = version({
  id: 'v-candidate',
  status: 'candidate',
  label: 'Migrated back',
  rowRevision: 1,
  updatedAt: '2026-08-08T00:00:00.000Z',
  media: { url: '/a', immutableUrl: '/api/media/y', sha256: SHA_CANDIDATE, mediaType: 'image/png', width: 1060, height: 1484, byteLength: 11 },
});

const catalog: AdminLiveMediaCatalog = {
  schemaVersion: 1,
  revision: 1,
  updatedAt: null,
  slots: [slot],
  versions: [version({}), candidate],
};

describe('run card-back live media review', () => {
  it('builds the exact address the acceptance gate demands', () => {
    // backend/liveMediaPolicy.js runCardBackOwnerProofIssue pins every one of these.
    const url = new URL(runCardBackReviewHref(SHA_CANDIDATE), 'https://example.test');
    expect(url.pathname).toBe('/studio');
    expect(url.searchParams.get('mode')).toBe('viewer');
    expect(url.searchParams.get('vk')).toBe('cardlayout');
    expect(url.searchParams.get('cardSide')).toBe('back');
    expect(url.searchParams.get('backCandidate')).toBe(SHA_CANDIDATE);
  });

  it('omits a candidate the address does not name', () => {
    expect(runCardBackReviewHref(null)).not.toContain('backCandidate');
    expect(runCardBackReviewHref('not-a-sha')).not.toContain('backCandidate');
  });

  it('shows the published back when no candidate is requested', () => {
    const selected = runCardBackSelection(catalog, new URLSearchParams());
    expect(selected?.version.id).toBe('v-published');
    expect(runCardBackPublished(catalog)?.version.id).toBe('v-published');
  });

  it('selects the requested candidate by its exact bytes', () => {
    const selected = runCardBackSelection(catalog, new URLSearchParams({ backCandidate: SHA_CANDIDATE }));
    expect(selected?.version.id).toBe('v-candidate');
    expect(selected?.version.status).toBe('candidate');
  });

  it('refuses a requested sha that is not a reviewable version', () => {
    expect(runCardBackSelection(catalog, new URLSearchParams({ backCandidate: 'c'.repeat(64) }))).toBeNull();
  });

  it('groups candidates ahead of the published back', () => {
    const groups = runCardBackCandidateGroups(catalog);
    expect(groups.map((group) => group.key)).toEqual(['candidate', 'published']);
    expect(groups[0].versions.map((row) => row.id)).toEqual(['v-candidate']);
  });

  it('proves the reviewed bytes and both compare-and-swap snapshots', () => {
    const surfaceUrl = `https://example.test${runCardBackReviewHref(SHA_CANDIDATE)}`;
    const proof = runCardBackReviewProof({ version: candidate, slot, surfaceUrl });
    expect(proof.schema).toBe(RUN_CARD_BACK_PROOF_SCHEMA);
    expect(proof.renderer).toBe(RUN_CARD_BACK_PROOF_RENDERER);
    expect(proof.surfaceUrl).toBe(surfaceUrl);
    expect(proof.canonicalScale).toBe(1);
    expect(proof.assetLocalScale).toBe(1);
    expect(proof.spatialResampling).toBe(false);
    expect(proof.decodedNativeRaster).toEqual({ width: 1060, height: 1484 });
    expect(proof.selectedCandidates).toEqual([{
      slot: RUN_CARD_BACK_SLOT, versionId: 'v-candidate', sha256: SHA_CANDIDATE, rowRevision: 1,
    }]);
    expect(proof.slotSnapshots).toEqual([{
      slot: RUN_CARD_BACK_SLOT, rowRevision: 7, activeVersionId: 'v-published',
    }]);
  });

  it('accepts against the observed candidate and slot revisions', () => {
    expect(runCardBackAcceptanceItem(candidate, slot)).toEqual({
      id: 'v-candidate',
      expectedRevision: 1,
      expectedSlotRevision: 7,
      expectedActiveVersionId: 'v-published',
    });
  });
});
