import { afterEach, describe, expect, it } from 'vitest';
import { applyLiveMediaCatalog, resetLiveMediaCatalog } from '@chess-tactics/board-render';
import { authoredSampleUrls } from './sfx';

const mediaSlot = (slot: string, sha: string, mediaType = 'audio/mpeg') => ({
  slot,
  domain: 'audio',
  role: 'sfx',
  availabilityPolicy: 'decorative',
  activeVersionId: crypto.randomUUID(),
  rowRevision: 1,
  metadata: {},
  versionStatus: 'legacy-bridge',
  productionEligible: false,
  versionMetadata: {},
  provenance: {},
  nativeEvidence: {},
  media: {
    url: `/assets/${slot}`,
    immutableUrl: `/api/media/${sha}`,
    sha256: sha,
    mediaType,
    width: null,
    height: null,
    byteLength: 12,
  },
});

afterEach(() => resetLiveMediaCatalog());

describe('authored SFX live media', () => {
  it('derives numerically ordered takes from backend slots without a Git manifest', () => {
    applyLiveMediaCatalog({
      schemaVersion: 1,
      revision: 4,
      updatedAt: null,
      slots: [
        mediaSlot('sfx/grass/v10.mp3', 'a'.repeat(64)),
        mediaSlot('sfx/grass/source.mp3', 'b'.repeat(64)),
        mediaSlot('sfx/grass/v2.wav', 'c'.repeat(64), 'audio/wav'),
        mediaSlot('sfx/water/v0.mp3', 'd'.repeat(64)),
      ],
    });

    expect(authoredSampleUrls('grass')).toEqual([
      `/api/media/${'c'.repeat(64)}`,
      `/api/media/${'a'.repeat(64)}`,
    ]);
  });
});
