import {
  type GroundCoverTerrain,
  type LiveMediaCatalog,
  type LiveMediaSlot,
} from '@chess-tactics/board-render';

const TERRAIN_HASH: Record<GroundCoverTerrain, string> = {
  grass: 'a'.repeat(64),
  water: 'b'.repeat(64),
  sand: 'c'.repeat(64),
};

export function testGroundCoverSlot(
  terrain: GroundCoverTerrain,
  id = 0,
  overrides: Partial<LiveMediaSlot> = {},
): LiveMediaSlot {
  const sha256 = TERRAIN_HASH[terrain];
  const slot = `groundcover/${terrain}/v${id}.png`;
  return {
    slot,
    domain: 'terrain',
    role: 'media',
    availabilityPolicy: 'critical',
    activeVersionId: `00000000-0000-4000-8000-00000000000${id + 1}`,
    rowRevision: 1,
    metadata: {},
    versionStatus: 'accepted',
    productionEligible: true,
    versionMetadata: {
      runtime: {
        groundCover: {
          terrain,
          id,
          frameWidth: 40,
          frameHeight: 37,
          frameCount: 6,
          baseX: 20,
          baseY: 28,
          contentWidth: 18,
        },
      },
    },
    provenance: {},
    nativeEvidence: {},
    media: {
      url: `/assets/${slot}`,
      immutableUrl: `/api/media/${sha256}`,
      sha256,
      mediaType: 'image/png',
      width: 240,
      height: 37,
      byteLength: 512,
    },
    ...overrides,
  };
}

export function testGroundCoverCatalog(extraSlots: LiveMediaSlot[] = []): LiveMediaCatalog {
  return {
    schemaVersion: 1,
    revision: 17,
    updatedAt: '2026-07-12T00:00:00.000Z',
    slots: [
      testGroundCoverSlot('grass'),
      testGroundCoverSlot('water'),
      testGroundCoverSlot('sand'),
      ...extraSlots,
    ],
  };
}

const STRUCTURE_RASTERS: Record<string, { width: number; height: number }> = {
  'props/oak': { width: 192, height: 300 },
  'props/cottage': { width: 177, height: 184 },
  'props/cabin': { width: 220, height: 176 },
  'props/lodge': { width: 210, height: 177 },
  'props/rock': { width: 40, height: 45 },
  'props/fieldstone': { width: 51, height: 47 },
  'doodads/boulder': { width: 96, height: 180 },
  'doodads/stump': { width: 96, height: 180 },
  'doodads/fern': { width: 96, height: 180 },
  'doodads/flower': { width: 96, height: 180 },
};

/** Generated metadata records, never copies of production catalog content. */
export function testStructureMediaSlots(): LiveMediaSlot[] {
  let index = 0;
  return Object.entries(STRUCTURE_RASTERS).flatMap(([prefix, dimensions]) => (
    (['back', 'front'] as const).map((half) => {
      index += 1;
      const slot = `${prefix}/${half}.png`;
      const sha256 = index.toString(16).padStart(64, '0');
      return {
        slot,
        domain: 'prop',
        role: 'media',
        availabilityPolicy: 'critical',
        activeVersionId: `synthetic-structure-${index}`,
        rowRevision: 1,
        metadata: {},
        versionStatus: 'accepted',
        productionEligible: true,
        versionMetadata: {},
        provenance: { generator: 'synthetic-test' },
        nativeEvidence: {},
        media: {
          url: `/assets/${slot}`,
          immutableUrl: `/api/media/${sha256}`,
          sha256,
          mediaType: 'image/png',
          width: dimensions.width,
          height: dimensions.height,
          byteLength: 128,
        },
      } satisfies LiveMediaSlot;
    })
  ));
}

/** Generated installed-Chrome records for startup/readiness tests. */
export function testInstalledChromeMediaSlots(): LiveMediaSlot[] {
  return ['test/chrome/outer-atom.png', 'test/chrome/outer-rail.png', 'test/chrome/inner-atom.png', 'test/chrome/inner-rail.png', 'test/chrome/divider-joint.png'].map((slot, index) => {
    const sha256 = (index + 8192).toString(16).padStart(64, '0');
    return {
      slot,
      domain: 'ui-kit',
      role: 'media',
      availabilityPolicy: 'critical',
      activeVersionId: `synthetic-installed-chrome-${index}`,
      rowRevision: 1,
      metadata: {},
      versionStatus: 'accepted',
      productionEligible: true,
      versionMetadata: {},
      provenance: { generator: 'synthetic-test' },
      nativeEvidence: {},
      media: {
        url: `/assets/${slot}`,
        immutableUrl: `/api/media/${sha256}`,
        sha256,
        mediaType: 'image/png',
        width: 32 + index,
        height: 32 + index,
        byteLength: 128,
      },
    } satisfies LiveMediaSlot;
  });
}

const WALL_DECOR_RASTERS: Record<string, { width: number; height: number }> = {
  'banner-tattered.png': { width: 72, height: 96 },
  'banner-tattered-west.png': { width: 26, height: 84 },
  'banner-tattered-north.png': { width: 26, height: 84 },
  'relief-pawn.png': { width: 72, height: 72 },
  'relief-pawn-west.png': { width: 33, height: 48 },
  'relief-pawn-north.png': { width: 33, height: 48 },
  'relief-rook.png': { width: 72, height: 72 },
  'relief-rook-west.png': { width: 40, height: 59 },
  'relief-rook-north.png': { width: 40, height: 59 },
  'lantern-brass.png': { width: 56, height: 80 },
  'lantern-brass-west.png': { width: 16, height: 63 },
  'lantern-brass-north.png': { width: 16, height: 63 },
  'mirror-keep.png': { width: 72, height: 88 },
  'mirror-keep-west.png': { width: 34, height: 71 },
  'mirror-keep-west-glass.png': { width: 34, height: 71 },
  'mirror-keep-north.png': { width: 34, height: 71 },
  'mirror-keep-north-glass.png': { width: 34, height: 71 },
  'mirror-court-oval.png': { width: 72, height: 88 },
  'mirror-court-oval-west.png': { width: 30, height: 57 },
  'mirror-court-oval-west-glass.png': { width: 30, height: 57 },
  'mirror-court-oval-north.png': { width: 30, height: 57 },
  'mirror-court-oval-north-glass.png': { width: 30, height: 57 },
  'mirror-chapel-glass.png': { width: 72, height: 96 },
  'mirror-chapel-glass-west.png': { width: 32, height: 72 },
  'mirror-chapel-glass-west-glass.png': { width: 32, height: 72 },
  'mirror-chapel-glass-north.png': { width: 32, height: 72 },
  'mirror-chapel-glass-north-glass.png': { width: 32, height: 72 },
  'mirror-witch-eye.png': { width: 72, height: 72 },
  'mirror-witch-eye-west.png': { width: 38, height: 45 },
  'mirror-witch-eye-west-glass.png': { width: 38, height: 45 },
  'mirror-witch-eye-north.png': { width: 38, height: 45 },
  'mirror-witch-eye-north-glass.png': { width: 38, height: 45 },
  'mirror-grand-gallery.png': { width: 216, height: 252 },
  'mirror-grand-gallery-west.png': { width: 142, height: 240 },
  'mirror-grand-gallery-west-glass.png': { width: 142, height: 240 },
  'mirror-grand-gallery-north.png': { width: 142, height: 240 },
  'mirror-grand-gallery-north-glass.png': { width: 142, height: 240 },
};

/** Generated wall-decoration records with synthetic hashes and no production bytes. */
export function testWallDecorMediaSlots(): LiveMediaSlot[] {
  return Object.entries(WALL_DECOR_RASTERS).map(([name, dimensions], index) => {
    const slot = `wall-decor/${name}`;
    const sha256 = (index + 4096).toString(16).padStart(64, '0');
    return {
      slot,
      domain: 'wall-decor',
      role: 'media',
      availabilityPolicy: 'decorative',
      activeVersionId: `synthetic-wall-decor-${index}`,
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
        width: dimensions.width,
        height: dimensions.height,
        byteLength: 128,
      },
    } satisfies LiveMediaSlot;
  });
}
