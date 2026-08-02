import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import {
  CARD_TYPE_TEXTURE_SLOTS,
  cardTypeTextureUrls,
  hasCompleteCardTypeTextureSet,
  type CardTypeTextureId,
} from './cardTypeTextureReview';

function candidate(
  cardType: CardTypeTextureId,
  batchId = 'requested-batch',
  overrides: Partial<AdminLiveMediaVersion> = {},
): AdminLiveMediaVersion {
  return {
    id: `${cardType}-${batchId}`,
    slot: CARD_TYPE_TEXTURE_SLOTS[cardType],
    sourcePath: null,
    domain: 'ui-kit',
    role: 'media',
    label: cardType,
    status: 'candidate',
    productionEligible: false,
    metadata: {},
    provenance: { liveMediaBatch: { batchId } },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    updatedBy: null,
    media: { url: `/api/admin/media/${cardType}` } as AdminLiveMediaVersion['media'],
    ...overrides,
  };
}

describe('card type texture candidate projection', () => {
  it('uses only private candidates from the exact requested batch and exact semantic slots', () => {
    const requested = (Object.keys(CARD_TYPE_TEXTURE_SLOTS) as CardTypeTextureId[])
      .map((id) => candidate(id));
    const catalog = {
      versions: [
        candidate('pestiferous', 'another-batch'),
        candidate('concinnous', 'requested-batch', { status: 'accepted' }),
        ...requested,
      ],
    } as AdminLiveMediaCatalog;

    const urls = cardTypeTextureUrls(catalog, 'requested-batch');

    expect(urls).toEqual({
      pestiferous: '/api/admin/media/pestiferous',
      concinnous: '/api/admin/media/concinnous',
      tactical: '/api/admin/media/tactical',
      hieratic: '/api/admin/media/hieratic',
    });
    expect(hasCompleteCardTypeTextureSet(urls)).toBe(true);
  });

  it('does not call a partial candidate batch ready', () => {
    expect(hasCompleteCardTypeTextureSet({ tactical: '/candidate/tactical' })).toBe(false);
  });
});
