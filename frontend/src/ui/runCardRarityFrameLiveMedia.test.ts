import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaSlot, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import {
  RUN_CARD_RARITY_FRAME_PROOF_RENDERER,
  RUN_CARD_RARITY_FRAME_PROOF_SCHEMA,
  RUN_CARD_UNCOMMON_FRAME_SLOT,
  runCardRarityFrameAcceptanceItem,
  runCardRarityFrameReviewHref,
  runCardRarityFrameReviewProof,
  runCardRarityFrameSelection,
} from './runCardRarityFrameLiveMedia';

const sha256 = 'a'.repeat(64);
const version = {
  id: '11111111-1111-4111-8111-111111111111',
  slot: RUN_CARD_UNCOMMON_FRAME_SLOT,
  status: 'candidate',
  rowRevision: 3,
  media: { sha256, immutableUrl: `/api/media/${sha256}` },
} as AdminLiveMediaVersion;
const slot = {
  slot: RUN_CARD_UNCOMMON_FRAME_SLOT,
  rowRevision: 5,
  activeVersionId: null,
} as AdminLiveMediaSlot;
const catalog = { slots: [slot], versions: [version] } as AdminLiveMediaCatalog;

describe('Run card rarity-frame live media', () => {
  it('selects only the exact candidate named by the review URL', () => {
    const selected = runCardRarityFrameSelection(catalog, 'uncommon', new URLSearchParams({ uncommonCandidate: sha256 }));
    expect(selected).toEqual({ version, slot });
    expect(runCardRarityFrameSelection(catalog, 'uncommon', new URLSearchParams({ uncommonCandidate: 'b'.repeat(64) }))).toBeNull();
  });

  it('builds an exact native proof for the Standard artwork rarity frame', () => {
    const surfaceUrl = `http://localhost${runCardRarityFrameReviewHref(sha256, 'b'.repeat(64))}`;
    expect(runCardRarityFrameReviewProof({ rarity: 'uncommon', version, slot, surfaceUrl })).toEqual({
      schema: RUN_CARD_RARITY_FRAME_PROOF_SCHEMA,
      renderer: RUN_CARD_RARITY_FRAME_PROOF_RENDERER,
      surfaceUrl,
      rarity: 'uncommon',
      frameType: 'standard',
      rarityAffects: 'artwork-bezel-only',
      outerFrameTreatment: 'standard-original',
      canonicalScale: 1,
      assetLocalScale: 1,
      spatialResampling: false,
      decodedNativeRaster: { width: 1060, height: 1484 },
      selectedCandidates: [{ slot: slot.slot, versionId: version.id, sha256, rowRevision: 3 }],
      slotSnapshots: [{ slot: slot.slot, rowRevision: 5, activeVersionId: null }],
    });
    expect(runCardRarityFrameAcceptanceItem({ ...version, rowRevision: 4 }, slot)).toEqual({
      id: version.id,
      expectedRevision: 4,
      expectedSlotRevision: 5,
      expectedActiveVersionId: null,
    });
  });
});
