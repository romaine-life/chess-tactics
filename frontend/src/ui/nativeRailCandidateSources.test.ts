import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import {
  nativeRailCatalogFromAdmin,
  normalizeNativeRailFamilyId,
} from './nativeRailCandidateSources';

function version(
  id: string,
  sourceId: string,
  orientation: 'horizontal' | 'vertical',
  familyId = 'outer-family',
): AdminLiveMediaVersion {
  const horizontal = orientation === 'horizontal';
  return {
    id,
    slot: null,
    sourcePath: `retired/${sourceId}.png`,
    domain: 'ui-kit',
    role: 'review',
    label: sourceId,
    status: 'candidate',
    productionEligible: false,
    metadata: {
      nativeRail: {
        id: sourceId,
        label: `Rail ${sourceId}`,
        familyId,
        familyLabel: `Family ${familyId}`,
        role: 'outer',
        fit: 'repeat',
        orientation,
        width: horizontal ? 48 : 12,
        height: horizontal ? 12 : 48,
        nativeThickness: 12,
        nativeScale: 1,
        provider: 'image-provider',
        attemptId: 'attempt-1',
        sourceFile: `${sourceId}.png`,
        seam: { averageDelta: 1.5, alphaMismatches: 0 },
      },
    },
    provenance: { migration: { originalRepositoryPath: `retired/${sourceId}.png` } },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    updatedBy: null,
    media: {
      url: `/api/admin/media-versions/${id}/content`,
      sha256: id.padEnd(64, 'a').slice(0, 64),
      mediaType: 'image/png',
      width: horizontal ? 48 : 12,
      height: horizontal ? 12 : 48,
      byteLength: 100,
    },
  };
}

function catalog(versions: AdminLiveMediaVersion[]): AdminLiveMediaCatalog {
  return { schemaVersion: 1, revision: 7, updatedAt: null, slots: [], versions };
}

describe('backend-native rail families', () => {
  it('admits only complete directional families and uses authenticated content URLs', () => {
    const horizontal = version('h', 'old-horizontal-id', 'horizontal');
    const vertical = version('v', 'old-vertical-id', 'vertical');
    const unpaired = version('u', 'old-unpaired-id', 'horizontal', 'unpaired-family');
    const unpairedMetadata = unpaired.metadata.nativeRail as Record<string, unknown>;
    delete unpairedMetadata.familyId;
    delete unpairedMetadata.familyLabel;
    const parsed = nativeRailCatalogFromAdmin(catalog([horizontal, vertical, unpaired]));

    expect(parsed.families).toHaveLength(1);
    expect(parsed.families[0]).toMatchObject({ id: 'outer-family', role: 'outer', fit: 'repeat' });
    expect(parsed.families[0].horizontal[0]).toMatchObject({
      id: 'h',
      sourceId: 'old-horizontal-id',
      src: '/api/admin/media-versions/h/content',
    });
    expect(parsed.unpairedSourceIds).toEqual(['u']);
    expect(parsed.sources.find((source) => source.id === 'u')?.familyId).toBe('');
    expect(parsed.sources.every((source) => source.nativeScale === 1)).toBe(true);
  });

  it('does not reconstruct a candidate from its repository path without importer enrichment', () => {
    const unenriched = version('x', 'legacy-source', 'horizontal');
    unenriched.metadata = {};
    expect(nativeRailCatalogFromAdmin(catalog([unenriched]))).toEqual({
      sources: [],
      families: [],
      unpairedSourceIds: [],
    });
  });

  it('excludes archived and accepted rail rows from audition families', () => {
    const archived = version('a', 'archived-horizontal', 'horizontal');
    archived.status = 'archived';
    const accepted = version('b', 'accepted-vertical', 'vertical');
    accepted.status = 'accepted';
    expect(nativeRailCatalogFromAdmin(catalog([archived, accepted]))).toEqual({
      sources: [],
      families: [],
      unpairedSourceIds: [],
    });
  });

  it('migrates a backend version id or historical provenance id to its family', () => {
    const parsed = nativeRailCatalogFromAdmin(catalog([
      version('h', 'old-horizontal-id', 'horizontal'),
      version('v', 'old-vertical-id', 'vertical'),
    ]));
    expect(normalizeNativeRailFamilyId(parsed.families, parsed.sources, 'h')).toBe('outer-family');
    expect(normalizeNativeRailFamilyId(parsed.families, parsed.sources, 'old-horizontal-id')).toBe('outer-family');
    expect(normalizeNativeRailFamilyId(parsed.families, parsed.sources, 'outer-family')).toBe('outer-family');
  });
});
