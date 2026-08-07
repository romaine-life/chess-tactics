import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog } from '../net/liveMediaAdmin';
import {
  partitionLipsanonReviewCandidates,
  runLipsanonReviewCandidates,
  type LipsanonReviewCandidate,
} from './LipsanonReview';

describe('Run lipsanon art review', () => {
  it('ignores unrelated accepted media versions that have no matching Run lipsanon slot', () => {
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-07-29T00:00:00.000Z',
      slots: [{
        slot: 'ui/run/lipsana/royal-tent.png',
        domain: 'ui-kit',
        role: 'icon',
        availabilityPolicy: 'decorative',
        lifecycleState: 'active',
        activeVersionId: 'royal-tent-version',
        rowRevision: 2,
        metadata: {},
        versionStatus: 'accepted',
        productionEligible: true,
        media: null,
      }],
      versions: [
        {
          id: 'unrelated-version',
          slot: 'ui/other/icon.png',
          sourcePath: null,
          domain: 'ui-kit',
          role: 'icon',
          label: 'Unrelated icon',
          status: 'accepted',
          productionEligible: true,
          metadata: {},
          provenance: {},
          nativeEvidence: {},
          reviewEvidence: {},
          rowRevision: 1,
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
          updatedBy: null,
          media: null,
        },
        {
          id: 'royal-tent-version',
          slot: 'ui/run/lipsana/royal-tent.png',
          sourcePath: null,
          domain: 'ui-kit',
          role: 'icon',
          label: 'Royal Tent',
          status: 'accepted',
          productionEligible: true,
          metadata: {},
          provenance: {},
          nativeEvidence: {},
          reviewEvidence: {},
          rowRevision: 3,
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
          updatedBy: null,
          media: {
            url: '/api/admin/media/royal-tent',
            sha256: 'a'.repeat(64),
            mediaType: 'image/png',
            width: 64,
            height: 64,
            byteLength: 1,
          },
        },
      ],
    } satisfies AdminLiveMediaCatalog;

    expect(runLipsanonReviewCandidates(catalog)).toEqual([
      expect.objectContaining({ lipsanonId: 'royal-tent' }),
    ]);
  });

  it('separates new candidates from already installed reference art', () => {
    const installed = {
      lipsanonId: 'royal-tent',
      slot: 'ui/run/lipsana/royal-tent.png',
      version: { status: 'accepted' },
    } as unknown as LipsanonReviewCandidate;
    const candidate = {
      lipsanonId: 'royal-tent',
      slot: 'ui/run/lipsana/royal-tent.png',
      version: { status: 'candidate' },
    } as unknown as LipsanonReviewCandidate;

    expect(partitionLipsanonReviewCandidates([installed, candidate])).toEqual({
      newCandidates: [candidate],
      installedReferences: [installed],
    });
  });
});
