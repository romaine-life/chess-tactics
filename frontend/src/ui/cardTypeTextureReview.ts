import type { LiveMediaCatalog } from '@chess-tactics/board-render';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';

export const CARD_TYPE_TEXTURE_REVIEW_PARAM = 'cardTypeTextureBatch';

export const CARD_TYPE_TEXTURE_SLOTS = Object.freeze({
  pestiferous: 'ui/surfaces/card-type-pestiferous.png',
  concinnous: 'ui/surfaces/card-type-concinnous.png',
  tactical: 'ui/surfaces/card-type-tactical.png',
  hieratic: 'ui/surfaces/card-type-hieratic.png',
});

export type CardTypeTextureId = keyof typeof CARD_TYPE_TEXTURE_SLOTS;
export type CardTypeTextureUrls = Partial<Record<CardTypeTextureId, string>>;

const CARD_TYPE_TEXTURE_IDS = Object.freeze(Object.keys(CARD_TYPE_TEXTURE_SLOTS) as CardTypeTextureId[]);

function liveMediaBatchId(version: AdminLiveMediaVersion): string | null {
  const value = version.provenance.liveMediaBatch;
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  const batchId = (value as Record<string, unknown>).batchId;
  return typeof batchId === 'string' ? batchId : null;
}

/** Project one exact private generation batch onto the four Card Types rows. */
export function cardTypeTextureUrls(
  catalog: AdminLiveMediaCatalog,
  batchId: string,
): CardTypeTextureUrls {
  const urls: CardTypeTextureUrls = {};
  const updatedAt: Partial<Record<CardTypeTextureId, string>> = {};
  for (const version of catalog.versions) {
    if (version.status !== 'candidate' || liveMediaBatchId(version) !== batchId) continue;
    const cardType = CARD_TYPE_TEXTURE_IDS.find((id) => CARD_TYPE_TEXTURE_SLOTS[id] === version.slot);
    const url = version.media?.url;
    if (!cardType || typeof url !== 'string' || !url) continue;
    if ((updatedAt[cardType] ?? '') > version.updatedAt) continue;
    urls[cardType] = url;
    updatedAt[cardType] = version.updatedAt;
  }
  return urls;
}

export function hasCompleteCardTypeTextureSet(urls: CardTypeTextureUrls): boolean {
  return CARD_TYPE_TEXTURE_IDS.every((id) => Boolean(urls[id]));
}

/** Resolve the accepted, production-eligible texture set from the public startup catalog. */
export function acceptedCardTypeTextureUrls(catalog: LiveMediaCatalog | null): CardTypeTextureUrls {
  if (!catalog) return {};
  const urls: CardTypeTextureUrls = {};
  for (const cardType of CARD_TYPE_TEXTURE_IDS) {
    const slot = catalog.slots.find((entry) => entry.slot === CARD_TYPE_TEXTURE_SLOTS[cardType]);
    if (slot?.versionStatus !== 'accepted' || !slot.productionEligible) continue;
    urls[cardType] = slot.media.immutableUrl;
  }
  return urls;
}
