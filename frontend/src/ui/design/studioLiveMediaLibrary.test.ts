import { describe, expect, it } from 'vitest';
import type { LiveMediaCatalog, LiveMediaSlot } from '@chess-tactics/board-render';
import { buildStudioArtworkLibrary, buildStudioAssetLibrary } from './studioLiveMediaLibrary';

let nextSha = 1;

function liveSlot(slot: string, overrides: Partial<LiveMediaSlot> & {
  width?: number;
  height?: number;
  sha256?: string;
  runtime?: Record<string, unknown>;
} = {}): LiveMediaSlot {
  const sha256 = overrides.sha256 ?? String(nextSha++).padStart(64, '0');
  const status = overrides.versionStatus ?? 'legacy-bridge';
  return {
    slot,
    domain: overrides.domain ?? 'ui-kit',
    role: overrides.role ?? 'media',
    availabilityPolicy: overrides.availabilityPolicy ?? 'critical',
    activeVersionId: overrides.activeVersionId ?? `version-${sha256.slice(-4)}`,
    rowRevision: overrides.rowRevision ?? 1,
    metadata: overrides.metadata ?? {},
    versionStatus: status,
    productionEligible: overrides.productionEligible ?? status === 'accepted',
    versionMetadata: overrides.runtime ? { runtime: overrides.runtime } : (overrides.versionMetadata ?? {}),
    provenance: {},
    nativeEvidence: {},
    media: {
      url: `/assets/${slot}`,
      immutableUrl: `/api/media/${sha256}`,
      sha256,
      mediaType: 'image/png',
      width: overrides.width ?? overrides.media?.width ?? 64,
      height: overrides.height ?? overrides.media?.height ?? 64,
      byteLength: overrides.media?.byteLength ?? 100,
      ...overrides.media,
    },
  };
}

function catalog(revision: number, slots: LiveMediaSlot[]): LiveMediaCatalog {
  return { schemaVersion: 1, revision, updatedAt: '2026-07-11T00:00:00.000Z', slots };
}

describe('Studio live-media libraries', () => {
  it('takes asset membership, immutable pointers, dimensions, and production status from the snapshot', () => {
    const oldSha = 'a'.repeat(64);
    const first = buildStudioAssetLibrary(catalog(8, [
      liveSlot('ui/kit/icons/gear.png', { sha256: oldSha, width: 64, height: 64 }),
      liveSlot('props/oak/back.png', { domain: 'prop', width: 192, height: 300, versionStatus: 'accepted' }),
      liveSlot('props/oak/front.png', { domain: 'prop', width: 192, height: 300 }),
      liveSlot('tiles/grass-top.png', { domain: 'terrain', versionStatus: 'accepted' }),
    ]));

    expect(first.items.map((item) => item.id)).toEqual([
      'ui/kit/icons/gear.png',
      'props/oak',
    ]);
    const gear = first.items.find((item) => item.id === 'ui/kit/icons/gear.png')!;
    expect(gear.immutableUrl).toBe(`/api/media/${oldSha}`);
    expect([gear.width, gear.height]).toEqual([64, 64]);
    expect(gear.productionStatus).toBe('legacy-bridge');
    expect(gear.productionEligible).toBe(false);
    const oak = first.items.find((item) => item.id === 'props/oak')!;
    expect(oak.slots.map((slot) => slot.slot)).toEqual(['props/oak/back.png', 'props/oak/front.png']);
    expect(oak.productionStatus).toBe('mixed');

    const newSha = 'b'.repeat(64);
    const promoted = buildStudioAssetLibrary(catalog(9, [
      liveSlot('ui/kit/icons/gear.png', {
        sha256: newSha,
        width: 96,
        height: 80,
        rowRevision: 2,
        versionStatus: 'accepted',
        runtime: { component: 'settings', variant: 'hero' },
      }),
    ])).items[0];
    expect(promoted.immutableUrl).toBe(`/api/media/${newSha}`);
    expect([promoted.width, promoted.height]).toEqual([96, 80]);
    expect(promoted.productionEligible).toBe(true);
    expect(promoted.runtime).toEqual({ component: 'settings', variant: 'hero' });
  });

  it('derives artwork groups and active media facts without a committed roster', () => {
    const worldSha = 'c'.repeat(64);
    const library = buildStudioArtworkLibrary(catalog(12, [
      liveSlot('backgrounds/farm-behind-line-set-01/world.png', {
        domain: 'background',
        width: 1619,
        height: 971,
        sha256: worldSha,
        versionStatus: 'accepted',
        runtime: { altText: 'Moonlit farm world' },
      }),
      liveSlot('units/rook/portrait/navy-blue.png', { domain: 'portrait', width: 384, height: 384 }),
      liveSlot('tiles/water-0-top.png', { domain: 'terrain', width: 96, height: 180 }),
    ]));

    expect(library.revision).toBe(12);
    expect(library.groups.map((group) => [group.id, group.items.length])).toEqual([
      ['world-scenes', 1],
      ['unit-portraits', 1],
    ]);
    const world = library.items.find((item) => item.id === 'backgrounds/farm-behind-line-set-01/world')!;
    expect(world.label).toBe('Moonlit farm world');
    expect(world.immutableUrl).toBe(`/api/media/${worldSha}`);
    expect([world.width, world.height]).toEqual([1619, 971]);
    expect(world.productionStatus).toBe('accepted');
  });
});
