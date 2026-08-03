import { describe, expect, it } from 'vitest';
import type { LiveMediaCatalog, LiveMediaSlot } from '@chess-tactics/board-render';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import {
  CARD_TYPE_TEXTURE_SLOTS,
  acceptedCardTypeTextureUrls,
  cardTypeTextureUrls,
  hasCompleteCardTypeTextureSet,
  type CardTypeTextureId,
} from './cardTypeTextureReview';

function acceptedSlot(cardType: CardTypeTextureId): LiveMediaSlot {
  const sha256 = cardType.charCodeAt(0).toString(16).padStart(2, '0').repeat(32);
  return {
    slot: CARD_TYPE_TEXTURE_SLOTS[cardType],
    domain: 'ui-kit',
    role: 'media',
    availabilityPolicy: 'decorative',
    activeVersionId: `${cardType}-accepted`,
    rowRevision: 1,
    metadata: {},
    versionStatus: 'accepted',
    productionEligible: true,
    versionMetadata: {},
    provenance: {},
    nativeEvidence: {},
    media: {
      url: `/assets/ui/surfaces/card-type-${cardType}.png`,
      immutableUrl: `/api/media/${sha256}`,
      sha256,
      mediaType: 'image/png',
      width: cardType === 'concinnous' ? 512 : 128,
      height: 64,
      byteLength: 100,
    },
  };
}

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
  it('uses the accepted public semantic slots on the normal production screen', () => {
    const ids = Object.keys(CARD_TYPE_TEXTURE_SLOTS) as CardTypeTextureId[];
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-08-02T00:00:00.000Z',
      slots: ids.map(acceptedSlot),
    } satisfies LiveMediaCatalog;

    expect(acceptedCardTypeTextureUrls(catalog)).toEqual(Object.fromEntries(ids.map((id) => [
      id,
      acceptedSlot(id).media.immutableUrl,
    ])));
  });

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
