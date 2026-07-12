import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLiveMediaCatalog,
  resetLiveMediaCatalog,
  WALL_DECOR_ASSETS,
  wallDecorAsset,
  type LiveMediaCatalog,
  type LiveMediaSlot,
} from '@chess-tactics/board-render';
import { testGroundCoverCatalog } from '../test/liveMediaCatalog';

let nextHash = 1;

function wallDecorSlot(
  slot: string,
  width: number | null,
  height: number | null,
  overrides: Partial<LiveMediaSlot> = {},
): LiveMediaSlot {
  const sha256 = (nextHash++).toString(16).padStart(64, '0');
  return {
    slot,
    domain: 'wall-decor',
    role: 'media',
    availabilityPolicy: 'decorative',
    activeVersionId: `synthetic-${nextHash}`,
    rowRevision: 1,
    metadata: {},
    versionStatus: 'legacy-bridge',
    productionEligible: false,
    versionMetadata: {},
    provenance: { generator: 'synthetic-test' },
    nativeEvidence: {},
    media: {
      url: `/assets/${slot}`,
      immutableUrl: `/api/media/${sha256}`,
      sha256,
      mediaType: 'image/png',
      width,
      height,
      byteLength: 128,
    },
    ...overrides,
  };
}

function catalog(slots: LiveMediaSlot[]): LiveMediaCatalog {
  const value = testGroundCoverCatalog(slots);
  value.revision = nextHash;
  return value;
}

function bannerTriplet(): LiveMediaSlot[] {
  return [
    wallDecorSlot('wall-decor/banner-tattered.png', 72, 96),
    wallDecorSlot('wall-decor/banner-tattered-west.png', 26, 84),
    wallDecorSlot('wall-decor/banner-tattered-north.png', 26, 84),
  ];
}

afterEach(() => resetLiveMediaCatalog());

describe('wall decoration live-media projection', () => {
  it('derives immutable URLs and intrinsic dimensions from one complete catalog triplet', () => {
    const slots = bannerTriplet();
    applyLiveMediaCatalog(catalog(slots));

    const banner = wallDecorAsset('banner-tattered');
    expect(WALL_DECOR_ASSETS.map((asset) => asset.id)).toEqual(['banner-tattered']);
    expect(banner).toMatchObject({
      id: 'banner-tattered',
      label: 'Tattered Banner',
      kind: 'banner',
      width: 72,
      height: 96,
      mountX: 36,
      mountY: 10,
      src: slots[0].media.immutableUrl,
      faces: {
        west: { width: 26, height: 84, mountX: 13, mountY: 10, src: slots[1].media.immutableUrl },
        north: { width: 26, height: 84, mountX: 13, mountY: 11, src: slots[2].media.immutableUrl },
      },
    });
    expect(wallDecorAsset('relief-pawn')).toBeUndefined();
  });

  it('omits the whole decorative asset when any triplet member is absent', () => {
    const [base, west] = bannerTriplet();
    applyLiveMediaCatalog(catalog([base, west]));

    expect(WALL_DECOR_ASSETS).toHaveLength(0);
    expect(wallDecorAsset('banner-tattered')).toBeUndefined();
  });

  it('omits an invalid triplet instead of retaining a stale or broken projection', () => {
    applyLiveMediaCatalog(catalog(bannerTriplet()));
    expect(WALL_DECOR_ASSETS).toHaveLength(1);

    const invalid = bannerTriplet();
    invalid[2] = { ...invalid[2], role: 'source' };
    applyLiveMediaCatalog(catalog(invalid));

    expect(WALL_DECOR_ASSETS).toHaveLength(0);
    expect(wallDecorAsset('banner-tattered')).toBeUndefined();
  });
});
