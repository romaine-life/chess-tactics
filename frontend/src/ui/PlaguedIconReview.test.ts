import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import { plaguedIconReviewCandidates } from './PlaguedIconReview';

const media = {
  url: '/api/admin/media/plagued',
  sha256: 'a'.repeat(64),
  mediaType: 'image/png' as const,
  width: 64,
  height: 64,
  byteLength: 1,
};

function version(overrides: Partial<AdminLiveMediaVersion>): AdminLiveMediaVersion {
  return {
    id: 'candidate',
    slot: 'ui/kit/icons/game/plagued.png',
    sourcePath: null,
    domain: 'ui-kit',
    role: 'icon',
    label: 'Plagued icon',
    status: 'candidate',
    productionEligible: false,
    metadata: { candidateIndex: 1 },
    provenance: { objectId: '840ac87b-4e82-402f-9161-c8b3ce705aa4' },
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

describe('Plagued icon review', () => {
  it('keeps only the private candidates from the current PixelLab pack and orders their option numbers', () => {
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-08-01T00:00:00.000Z',
      slots: [],
      versions: [
        version({ id: 'second', metadata: { candidateIndex: 2 } }),
        version({ id: 'accepted', status: 'accepted' }),
        version({ id: 'other-pack', provenance: { objectId: 'different' } }),
        version({ id: 'missing-bytes', media: null }),
        version({ id: 'first', metadata: { candidateIndex: 1 } }),
      ],
    } satisfies AdminLiveMediaCatalog;

    expect(plaguedIconReviewCandidates(catalog).map(({ id }) => id)).toEqual(['first', 'second']);
  });
});
