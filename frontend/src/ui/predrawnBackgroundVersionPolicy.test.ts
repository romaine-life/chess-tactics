import { describe, expect, it } from 'vitest';
import type { PredrawnBackgroundVersion } from '../net/predrawnBackgroundVersions';
import {
  newestPredrawnBackground,
  predrawnBackgroundCanArchive,
  predrawnBackgroundVersionIdempotencyKey,
  predrawnMaskHasUsableContent,
  predrawnPreferredMaskId,
  predrawnRegistrationForBackground,
  predrawnSelectionMatchesSurface,
  reusablePredrawnRawVersion,
  visiblePredrawnBackgrounds,
} from './predrawnBackgroundVersionPolicy';

function version(overrides: Partial<PredrawnBackgroundVersion> = {}): PredrawnBackgroundVersion {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    document_id: 'doc-1',
    level_id: 'level-1',
    kind: 'raw',
    label: 'Raw',
    parent_version_id: null,
    source_background_version_id: null,
    status: 'ready',
    row_revision: 2,
    frame_width: 10,
    frame_height: 10,
    world_bounds: { minX: 0, minY: 0, width: 10, height: 10 },
    operation: {},
    provenance: {},
    environment_geometry_sha256_v2: null,
    content_sha256: 'a'.repeat(64),
    content_url: '/api/background-versions/1/content',
    created_at: '2026-07-20T00:00:00Z',
    created_by: 'owner@example.test',
    updated_at: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

describe('pre-drawn background version UI policy', () => {
  it('builds server-valid bounded idempotency keys from a semantic digest', () => {
    const key = predrawnBackgroundVersionIdempotencyKey(
      'raw',
      'a'.repeat(64),
      '9a5aa8c5-49ab-42b6-b1be-d21f32fbd21b',
    );
    expect(key).toBe(`predrawn-raw:${'a'.repeat(64)}:9a5aa8c5-49ab-42b6-b1be-d21f32fbd21b`);
    expect(key).toMatch(/^[A-Za-z0-9._:@+-]{1,200}$/);
    expect(() => predrawnBackgroundVersionIdempotencyKey('raw', 'not-a-hash', 'nonce')).toThrow(/SHA-256/);
    expect(() => predrawnBackgroundVersionIdempotencyKey('raw', 'a'.repeat(64), 'comma,nonce')).toThrow(/server contract/);
  });

  it('opens the newest visible raster and excludes archived rasters and masks', () => {
    const newest = version({ id: '22222222-2222-4222-8222-222222222222', label: 'Newest' });
    const oldest = version({ label: 'Oldest' });
    const visible = visiblePredrawnBackgrounds([
      newest,
      version({ kind: 'occlusion' }),
      version({ status: 'archived' }),
      oldest,
    ]);
    expect(visible).toEqual([newest, oldest]);
    expect(newestPredrawnBackground(visible)).toBe(newest);
  });

  it('never treats a metadata-only mask as settable content', () => {
    const readyMask = version({ kind: 'occlusion' });
    const draftMask = version({ kind: 'occlusion', content_sha256: null, content_url: null, frame_width: null, frame_height: null });
    expect(predrawnMaskHasUsableContent(readyMask)).toBe(true);
    expect(predrawnMaskHasUsableContent(draftMask)).toBe(false);
  });

  it('distinguishes exact working/canonical mask selections and protects retained lineages', () => {
    const background = version();
    const mask = version({ id: '33333333-3333-4333-8333-333333333333', kind: 'occlusion' });
    const surface = {
      kind: 'predrawn' as const,
      schemaVersion: 2 as const,
      backgroundVersionId: background.id,
      occlusionVersionId: mask.id,
      frameWidth: 10,
      frameHeight: 10,
      worldBounds: background.world_bounds,
    };
    expect(predrawnSelectionMatchesSurface(background, mask, surface)).toBe(true);
    expect(predrawnSelectionMatchesSurface(background, undefined, surface)).toBe(false);
    expect(predrawnBackgroundCanArchive({ background, documentId: 'doc-1', liveMaskCount: 1 })).toBe(false);
    expect(predrawnBackgroundCanArchive({ background, documentId: 'doc-1', liveMaskCount: 0, currentSurface: surface })).toBe(false);
    expect(predrawnBackgroundCanArchive({ background: version({ status: 'published' }), documentId: 'doc-1', liveMaskCount: 0 })).toBe(false);
    expect(predrawnBackgroundCanArchive({ background, documentId: 'doc-1', liveMaskCount: 0 })).toBe(true);
  });

  it('restores the canonical mask when browsing back from a different working background', () => {
    const canonical = {
      kind: 'predrawn' as const,
      schemaVersion: 2 as const,
      backgroundVersionId: 'background-a',
      occlusionVersionId: 'mask-a',
      frameWidth: 10,
      frameHeight: 10,
      worldBounds: { minX: 0, minY: 0, width: 10, height: 10 },
    };
    const working = {
      ...canonical,
      backgroundVersionId: 'background-b',
      occlusionVersionId: 'mask-b',
    };
    expect(predrawnPreferredMaskId('background-a', working, canonical)).toBe('mask-a');
    expect(predrawnPreferredMaskId('background-b', working, canonical)).toBe('mask-b');
    expect(predrawnPreferredMaskId('background-c', working, canonical)).toBe('');
  });

  it('loads the next raw background own grid instead of retaining an archived selection grid', () => {
    const raw = version({ id: '44444444-4444-4444-8444-444444444444' });
    const registration = 'v4;10,10,0,0,10,0,10,10,0,10;1,1;0,1;0,1;0,0,10,0,10,10,0,10';
    const child = version({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'warped',
      parent_version_id: raw.id,
      operation: { registration },
    });
    expect(predrawnRegistrationForBackground(raw, [child, raw])).toMatchObject({
      sourceWidth: 10,
      sourceHeight: 10,
      gridColumns: 1,
      gridRows: 1,
    });
  });

  it('never deduplicates a raw import against another official collaborator document', () => {
    const matching = {
      provenance: {
        sourceSha256: 'a'.repeat(64),
        environmentGeometrySha256: 'b'.repeat(64),
      },
      world_bounds: { minX: -1, minY: -2, width: 100, height: 80 },
    };
    const foreign = version({ ...matching, document_id: 'doc-foreign', status: 'published' });
    const owned = version({
      ...matching,
      id: '66666666-6666-4666-8666-666666666666',
      document_id: 'doc-owned',
    });
    const input = {
      documentId: 'doc-owned',
      sourceSha256: 'a'.repeat(64),
      environmentGeometrySha256: 'b'.repeat(64),
      worldBounds: matching.world_bounds,
    };
    expect(reusablePredrawnRawVersion([foreign], input)).toBeUndefined();
    expect(reusablePredrawnRawVersion([foreign, owned], input)).toBe(owned);
  });
});
