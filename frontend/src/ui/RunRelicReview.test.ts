import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog } from '../net/liveMediaAdmin';
import { runRelicReviewCandidates } from './RunRelicReview';

describe('Run relic art review', () => {
  it('ignores unrelated accepted media versions that have no matching Run relic slot', () => {
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-07-29T00:00:00.000Z',
      slots: [{
        slot: 'ui/run/relics/royal-decree.png',
        domain: 'ui-kit',
        role: 'icon',
        availabilityPolicy: 'decorative',
        lifecycleState: 'active',
        activeVersionId: 'royal-decree-version',
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
          id: 'royal-decree-version',
          slot: 'ui/run/relics/royal-decree.png',
          sourcePath: null,
          domain: 'ui-kit',
          role: 'icon',
          label: 'Royal Decree',
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
            url: '/api/admin/media/royal-decree',
            sha256: 'a'.repeat(64),
            mediaType: 'image/png',
            width: 64,
            height: 64,
            byteLength: 1,
          },
        },
      ],
    } satisfies AdminLiveMediaCatalog;

    expect(runRelicReviewCandidates(catalog)).toEqual([
      expect.objectContaining({ relicId: 'royal-decree' }),
    ]);
  });
});
