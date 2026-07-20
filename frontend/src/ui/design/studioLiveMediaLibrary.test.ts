import { describe, expect, it } from 'vitest';
import type { DrawableAsset, DrawableCatalog, LiveMediaCatalog, LiveMediaSlot } from '@chess-tactics/board-render';
import { buildStudioArtworkLibrary, buildStudioAssetLibrary } from './studioLiveMediaLibrary';

let nextSha = 1;
function liveSlot(slot: string, overrides: Partial<LiveMediaSlot> = {}): LiveMediaSlot {
  const sha256 = overrides.media?.sha256 ?? String(nextSha++).padStart(64, '0');
  const status = overrides.versionStatus ?? 'legacy-bridge';
  return {
    slot, domain: 'opaque', role: 'media', availabilityPolicy: 'critical', activeVersionId: `version-${sha256.slice(-4)}`,
    rowRevision: 1, metadata: {}, versionStatus: status, productionEligible: status === 'accepted', versionMetadata: {},
    provenance: {}, nativeEvidence: {}, ...overrides,
    media: { url: `/assets/${slot}`, immutableUrl: `/api/media/${sha256}`, sha256, mediaType: 'image/png', width: 64,
      height: 64, byteLength: 100, ...overrides.media },
  };
}

function catalog(revision: number, slots: LiveMediaSlot[]): LiveMediaCatalog {
  return { schemaVersion: 1, revision, updatedAt: '2026-07-11T00:00:00.000Z', slots };
}

function item(id: string, label: string, behavior: Record<string, unknown>, media: Record<string, string>): DrawableAsset {
  return { id, kind: 'studio-catalog-item', label, sortOrder: 0, lifecycleState: 'active', behavior, metadata: {}, rowRevision: 1,
    media: Object.fromEntries(Object.entries(media).map(([role, slot]) => [role, { slot, media: { url: `/assets/${slot}`,
      immutableUrl: `/api/media/${'f'.repeat(64)}`, sha256: 'f'.repeat(64), mediaType: 'image/png', byteLength: 100,
      width: 64, height: 64 } }])) };
}

function drawables(assets: DrawableAsset[]): DrawableCatalog {
  return { schemaVersion: 1, revision: 4, updatedAt: '2026-07-11T00:00:00.000Z', assets };
}

describe('Studio live-media libraries', () => {
  it('takes asset identity and membership only from drawable records while joining live media facts by opaque slot', () => {
    const arbitrary = 'opaque/no-taxonomy/alpha.bin';
    const ignoredTaxonomy = 'ui/kit/icons/gear.png';
    const sha = 'a'.repeat(64);
    const library = buildStudioAssetLibrary(catalog(8, [
      liveSlot(arbitrary, { media: { sha256: sha, immutableUrl: `/api/media/${sha}`, mediaType: 'image/png', width: 96, height: 80 } as LiveMediaSlot['media'] }),
      liveSlot(ignoredTaxonomy),
    ]), drawables([item('gear-record', 'Database gear', { library: 'asset', type: 'settings', kind: 'glyph', name: 'gear' }, { primary: arbitrary })]));

    expect(library.items.map((record) => record.id)).toEqual(['gear-record']);
    expect(library.items[0].label).toBe('Database gear');
    expect(library.items[0].immutableUrl).toBe(`/api/media/${sha}`);
    expect([library.items[0].width, library.items[0].height]).toEqual([96, 80]);
    expect(library.items[0].productionStatus).toBe('legacy-bridge');
  });

  it('takes artwork group, labels, and membership from drawable records rather than filenames', () => {
    const slot = 'opaque/media/42';
    const library = buildStudioArtworkLibrary(catalog(12, [
      liveSlot(slot, { versionStatus: 'accepted', productionEligible: true }),
      liveSlot('backgrounds/would-have-matched/world.png'),
    ]), drawables([item('world-record', 'Moonlit farm world', {
      library: 'artwork', groupId: 'world-scenes', groupLabel: 'World scenes', sub: 'world scene',
    }, { primary: slot })]));

    expect(library.groups.map((group) => [group.id, group.label, group.items.length])).toEqual([
      ['world-scenes', 'World scenes', 1],
    ]);
    expect(library.items[0].id).toBe('world-record');
    expect(library.items[0].label).toBe('Moonlit farm world');
    expect(library.items[0].productionStatus).toBe('accepted');
  });

  it('fails closed when an assigned role has no live media row', () => {
    const asset = item('missing', 'Missing', { library: 'asset', type: 'frames', kind: 'frame', name: 'missing' }, { primary: 'not-live' });
    expect(buildStudioAssetLibrary(catalog(1, []), drawables([asset])).items).toEqual([]);
  });
});
