import type {
  AcceptLiveMediaVersionInput,
  AdminLiveMediaCatalog,
  AdminLiveMediaSlot,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import {
  RUN_CARD_RARE_FRAME_SLOT,
  RUN_CARD_UNCOMMON_FRAME_SLOT,
} from './runCardFrameGeometry';

export { RUN_CARD_RARE_FRAME_SLOT, RUN_CARD_UNCOMMON_FRAME_SLOT };
export const RUN_CARD_RARITY_FRAME_PROOF_SCHEMA = 'run-card-rarity-frame-card-layout-proof-v1';
export const RUN_CARD_RARITY_FRAME_PROOF_RENDERER = 'RunCardFace/CardLayout';

export type RunCardVisualRarity = 'uncommon' | 'rare';

export const RUN_CARD_RARITY_FRAME_SLOT: Readonly<Record<RunCardVisualRarity, string>> = Object.freeze({
  uncommon: RUN_CARD_UNCOMMON_FRAME_SLOT,
  rare: RUN_CARD_RARE_FRAME_SLOT,
});

function selectedSha(search: URLSearchParams, rarity: RunCardVisualRarity): string | null {
  const value = search.get(`${rarity}Candidate`);
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

export function runCardRarityFrameSelection(
  catalog: AdminLiveMediaCatalog,
  rarity: RunCardVisualRarity,
  search: URLSearchParams,
): { version: AdminLiveMediaVersion; slot: AdminLiveMediaSlot } | null {
  const slotName = RUN_CARD_RARITY_FRAME_SLOT[rarity];
  const slot = catalog.slots.find((candidate) => candidate.slot === slotName) ?? null;
  if (!slot) return null;
  const requestedSha = selectedSha(search, rarity);
  const version = catalog.versions.find((candidate) => (
    candidate.slot === slotName
    && Boolean(candidate.media)
    && (requestedSha
      ? candidate.media?.sha256 === requestedSha
        && (candidate.status === 'candidate' || (candidate.status === 'accepted' && candidate.id === slot.activeVersionId))
      : candidate.id === slot.activeVersionId && candidate.status === 'accepted')
  )) ?? null;
  return version ? { version, slot } : null;
}

export function runCardRarityFrameReviewProof(input: {
  rarity: RunCardVisualRarity;
  version: AdminLiveMediaVersion;
  slot: AdminLiveMediaSlot;
  surfaceUrl: string;
}): Record<string, unknown> {
  const { rarity, version, slot, surfaceUrl } = input;
  return {
    schema: RUN_CARD_RARITY_FRAME_PROOF_SCHEMA,
    renderer: RUN_CARD_RARITY_FRAME_PROOF_RENDERER,
    surfaceUrl,
    rarity,
    frameType: 'standard',
    rarityAffects: 'existing-metalwork-only',
    woodMaterialReview: true,
    canonicalScale: 1,
    assetLocalScale: 1,
    spatialResampling: false,
    decodedNativeRaster: { width: 1060, height: 1484 },
    selectedCandidates: [{
      slot: slot.slot,
      versionId: version.id,
      sha256: version.media?.sha256,
      rowRevision: version.rowRevision,
    }],
    slotSnapshots: [{
      slot: slot.slot,
      rowRevision: slot.rowRevision,
      activeVersionId: slot.activeVersionId,
    }],
  };
}

export function runCardRarityFrameAcceptanceItem(
  reviewed: AdminLiveMediaVersion,
  slot: AdminLiveMediaSlot,
): AcceptLiveMediaVersionInput {
  return {
    id: reviewed.id,
    expectedRevision: reviewed.rowRevision,
    expectedSlotRevision: slot.rowRevision,
    expectedActiveVersionId: slot.activeVersionId,
  };
}

export function runCardRarityFrameReviewHref(uncommonSha256: string, rareSha256: string): string {
  const search = new URLSearchParams({
    mode: 'viewer',
    vk: 'cardlayout',
    rarityStudy: '1',
    uncommonCandidate: uncommonSha256,
    rareCandidate: rareSha256,
  });
  return `/studio?${search.toString()}`;
}
