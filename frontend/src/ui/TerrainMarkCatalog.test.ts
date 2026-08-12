import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import {
  TERRAIN_MARK_BATCH_ID,
  TERRAIN_MARK_CONCEPTS,
  TERRAIN_MARK_SLOT,
  terrainMarkCandidates,
  terrainMarkCode,
} from './TerrainMarkCatalog';

const media = {
  url: '/api/admin/media/terrain',
  sha256: 'a'.repeat(64),
  mediaType: 'image/png' as const,
  width: 64,
  height: 64,
  byteLength: 1,
};

function version(overrides: Partial<AdminLiveMediaVersion>): AdminLiveMediaVersion {
  return {
    id: 'candidate',
    slot: TERRAIN_MARK_SLOT,
    sourcePath: null,
    domain: 'ui-kit',
    role: 'media',
    label: 'Enchiridion Terrain mark',
    status: 'candidate',
    productionEligible: false,
    metadata: { concept: 'crag-and-pine', conceptIndex: 1 },
    provenance: { liveMediaBatch: { batchId: TERRAIN_MARK_BATCH_ID } },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
    updatedBy: null,
    media,
    ...overrides,
  };
}

function catalog(versions: AdminLiveMediaVersion[]): AdminLiveMediaCatalog {
  return { schemaVersion: 1, revision: 1, updatedAt: null, slots: [], versions };
}

describe('Enchiridion terrain mark review', () => {
  it('keeps only this batch’s private candidates and orders each concept by its own index', () => {
    const grouped = terrainMarkCandidates(catalog([
      version({ id: 'crag-2', metadata: { concept: 'crag-and-pine', conceptIndex: 2 } }),
      version({ id: 'installed', status: 'accepted' }),
      version({ id: 'other-batch', provenance: { liveMediaBatch: { batchId: 'something-else' } } }),
      version({ id: 'other-slot', slot: 'ui/kit/icons/brush.png' }),
      version({ id: 'no-bytes', media: null }),
      version({ id: 'crag-1', metadata: { concept: 'crag-and-pine', conceptIndex: 1 } }),
      version({ id: 'turf-1', metadata: { concept: 'boulder-on-turf', conceptIndex: 1 } }),
    ]));

    expect(grouped.get('crag-and-pine')?.map(({ id }) => id)).toEqual(['crag-1', 'crag-2']);
    expect(grouped.get('boulder-on-turf')?.map(({ id }) => id)).toEqual(['turf-1']);
  });

  // Every concept keeps a column even when it deals no candidates, so a concept that failed to
  // upload is visible as an empty column rather than silently absent from the comparison.
  it('offers every concept a column, empty or not', () => {
    const grouped = terrainMarkCandidates(catalog([]));
    expect([...grouped.keys()]).toEqual(TERRAIN_MARK_CONCEPTS.map((concept) => concept.key));
  });

  it('names a candidate by its concept letter and its row', () => {
    expect(terrainMarkCode(version({ metadata: { concept: 'two-tier-ground', conceptIndex: 1 } }))).toBe('A01');
    expect(terrainMarkCode(version({ metadata: { concept: 'headland-and-water', conceptIndex: 16 } }))).toBe('D16');
  });
});
