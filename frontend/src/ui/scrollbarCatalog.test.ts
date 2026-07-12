import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLiveMediaCatalog,
  resetLiveMediaCatalog,
  type LiveMediaSlot,
} from '@chess-tactics/board-render';
import { testGroundCoverCatalog } from '../test/liveMediaCatalog';
import { liveScrollbarAssets } from './scrollbarCatalog';

function scrollbarSlot(
  slot: string,
  sha: string,
  overrides: Partial<LiveMediaSlot['media']> = {},
): LiveMediaSlot {
  return {
    slot,
    domain: 'ui-kit',
    role: 'scrollbar-grip',
    availabilityPolicy: 'decorative',
    activeVersionId: `00000000-0000-4000-8000-0000000000${sha.slice(0, 2)}`,
    rowRevision: 1,
    metadata: {},
    versionStatus: 'legacy-bridge',
    productionEligible: false,
    versionMetadata: {},
    provenance: { generator: 'synthetic-test' },
    nativeEvidence: {},
    media: {
      url: `/assets/${slot}`,
      immutableUrl: `/api/media/${sha.repeat(64)}`,
      sha256: sha.repeat(64),
      mediaType: 'image/png',
      width: 24,
      height: 72,
      byteLength: 1200,
      ...overrides,
    },
  };
}

afterEach(() => resetLiveMediaCatalog());

describe('live scrollbar catalog projection', () => {
  it('derives membership and immutable URLs from the applied backend snapshot', () => {
    applyLiveMediaCatalog(testGroundCoverCatalog([
      scrollbarSlot('ui/scrollbars/oak-pixellab.png', 'a'),
      scrollbarSlot('ui/scrollbars/oak-forge.png', 'b'),
    ]));

    expect(liveScrollbarAssets()).toEqual([
      expect.objectContaining({
        name: 'oak-forge',
        slot: 'ui/scrollbars/oak-forge.png',
        file: `/api/media/${'b'.repeat(64)}`,
        kind: 'sprite',
      }),
      expect.objectContaining({
        name: 'oak-pixellab',
        slot: 'ui/scrollbars/oak-pixellab.png',
        file: `/api/media/${'a'.repeat(64)}`,
        kind: 'sprite',
      }),
    ]);
  });

  it('omits unknown, nested, non-image, and undimensioned live records', () => {
    applyLiveMediaCatalog(testGroundCoverCatalog([
      scrollbarSlot('ui/scrollbars/unknown-grip.png', 'c'),
      scrollbarSlot('ui/scrollbars/archive/oak-forge.png', 'd'),
      scrollbarSlot('ui/scrollbars/oak-forge.png', 'e', { mediaType: 'audio/wav' }),
      scrollbarSlot('ui/scrollbars/oak-raw.png', 'f', { width: null }),
    ]));

    expect(liveScrollbarAssets()).toEqual([]);
  });

  it('has no committed fallback before catalog hydration', () => {
    expect(liveScrollbarAssets()).toEqual([]);
  });
});
