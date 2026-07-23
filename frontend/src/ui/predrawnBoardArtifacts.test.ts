import { describe, expect, it } from 'vitest';
import type { PredrawnBackgroundVersion } from '../net/predrawnBackgroundVersions';
import {
  predrawnBoardArtifactForSurface,
  predrawnBoardArtifactStoredChildren,
  predrawnBoardArtifactWorkflow,
  predrawnBoardSurfaceForArtifact,
} from './predrawnBoardArtifacts';

const RAW_A = '11111111-1111-4111-8111-111111111111';
const WARP_A = '22222222-2222-4222-8222-222222222222';
const MASK_A = '33333333-3333-4333-8333-333333333333';

function version(
  kind: PredrawnBackgroundVersion['kind'],
  id: string,
  overrides: Partial<PredrawnBackgroundVersion> = {},
): PredrawnBackgroundVersion {
  return {
    id,
    document_id: 'doc-1',
    level_id: 'level-1',
    kind,
    label: `${kind} ${id.slice(0, 4)}`,
    parent_version_id: null,
    source_background_version_id: null,
    status: 'ready',
    row_revision: 1,
    frame_width: 1600,
    frame_height: 900,
    world_bounds: { minX: -100, minY: -50, width: 1600, height: 900 },
    operation: {},
    provenance: {},
    environment_geometry_sha256_v2: null,
    content_sha256: id.replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
    content_url: `/api/background-versions/${id}/content`,
    created_at: '2026-07-20T00:00:00.000Z',
    created_by: 'Owner',
    updated_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

function raw(id = RAW_A, overrides: Partial<PredrawnBackgroundVersion> = {}): PredrawnBackgroundVersion {
  return version('raw', id, overrides);
}

function warped(
  id = WARP_A,
  parentId = RAW_A,
  overrides: Partial<PredrawnBackgroundVersion> = {},
): PredrawnBackgroundVersion {
  return version('warped', id, {
    parent_version_id: parentId,
    source_background_version_id: parentId,
    ...overrides,
  });
}

function mask(
  id = MASK_A,
  sourceId = WARP_A,
  overrides: Partial<PredrawnBackgroundVersion> = {},
): PredrawnBackgroundVersion {
  return version('occlusion', id, {
    source_background_version_id: sourceId,
    ...overrides,
  });
}

describe('pre-drawn board artifact workflow', () => {
  it('presents raw, warp, and mask rows as three board artifacts with one selection each', () => {
    const generated = raw();
    const aligned = warped();
    const occlusionReady = mask();
    const model = predrawnBoardArtifactWorkflow([occlusionReady, generated, aligned]);

    expect(model.rejected).toEqual([]);
    expect(model.artifacts.map((artifact) => ({
      id: artifact.id,
      stage: artifact.stage,
      title: artifact.title,
      parent: artifact.parentArtifactId,
    }))).toEqual([
      { id: RAW_A, stage: 'generated', title: 'Codex-generated board', parent: null },
      { id: WARP_A, stage: 'warped', title: 'Warped board', parent: RAW_A },
      { id: MASK_A, stage: 'occlusion-ready', title: 'Occlusion-ready board', parent: WARP_A },
    ]);

    expect(model.artifacts[0].surface.backgroundVersionId).toBe(RAW_A);
    expect(model.artifacts[0].surface).not.toHaveProperty('occlusionVersionId');
    expect(model.artifacts[1].surface.backgroundVersionId).toBe(WARP_A);
    expect(model.artifacts[1].surface).not.toHaveProperty('occlusionVersionId');
    expect(model.artifacts[2].surface).toMatchObject({
      backgroundVersionId: WARP_A,
      occlusionVersionId: MASK_A,
    });
    expect(model.artifacts[2].backgroundVersion).toBe(aligned);
    expect(model.artifacts[2].occlusionVersion).toBe(occlusionReady);
  });

  it('groups multiple roots and branches deterministically regardless of API order', () => {
    const rawOld = raw(RAW_A, { created_at: '2026-07-20T01:00:00Z' });
    const warpOld = warped(WARP_A, RAW_A, { created_at: '2026-07-20T02:00:00Z' });
    const maskOld = mask(MASK_A, WARP_A, { created_at: '2026-07-20T03:00:00Z' });
    const warpNewId = '44444444-4444-4444-8444-444444444444';
    const maskNewId = '55555555-5555-4555-8555-555555555555';
    const directMaskId = '66666666-6666-4666-8666-666666666666';
    const rawNewId = '77777777-7777-4777-8777-777777777777';
    const warpNew = warped(warpNewId, RAW_A, { created_at: '2026-07-20T04:00:00Z' });
    const maskNew = mask(maskNewId, warpNewId, { created_at: '2026-07-20T05:00:00Z' });
    const directMask = mask(directMaskId, RAW_A, { created_at: '2026-07-20T06:00:00Z' });
    const rawNew = raw(rawNewId, { created_at: '2026-07-20T07:00:00Z' });
    const rows = [rawOld, warpOld, maskOld, warpNew, maskNew, directMask, rawNew];

    const expected = [rawNewId, RAW_A, warpNewId, maskNewId, WARP_A, MASK_A];
    const forward = predrawnBoardArtifactWorkflow(rows);
    const reverse = predrawnBoardArtifactWorkflow([...rows].reverse());
    expect(forward.artifacts.map((artifact) => artifact.id)).toEqual(expected);
    expect(reverse.artifacts.map((artifact) => artifact.id)).toEqual(expected);
    expect(forward.rejected).toContainEqual(expect.objectContaining({
      versionId: directMaskId,
      reason: 'invalid-lineage',
    }));
  });

  it('orders occlusion refinements after their exact prior artifact', () => {
    const refinedMaskId = '88888888-8888-4888-8888-888888888888';
    const first = mask(MASK_A, WARP_A, { created_at: '2026-07-20T03:00:00Z' });
    const refined = mask(refinedMaskId, WARP_A, {
      parent_version_id: MASK_A,
      created_at: '2026-07-20T04:00:00Z',
    });
    const model = predrawnBoardArtifactWorkflow([refined, warped(), raw(), first]);

    expect(model.rejected).toEqual([]);
    expect(model.artifacts.map((artifact) => artifact.id)).toEqual([RAW_A, WARP_A, MASK_A, refinedMaskId]);
    expect(model.artifacts.at(-1)?.parentArtifactId).toBe(MASK_A);
  });

  it('fails closed for missing or archived lineage without hiding unrelated valid roots', () => {
    const archivedRawId = '99999999-9999-4999-8999-999999999999';
    const orphanWarpId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const orphanMaskId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const valid = raw();
    const archived = raw(archivedRawId, { status: 'archived' });
    const childOfArchived = warped(orphanWarpId, archivedRawId);
    const childOfMissing = mask(orphanMaskId, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    const model = predrawnBoardArtifactWorkflow([childOfArchived, valid, childOfMissing, archived]);

    expect(model.artifacts.map((artifact) => artifact.id)).toEqual([RAW_A]);
    expect(model.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({ versionId: archivedRawId, reason: 'archived' }),
      expect.objectContaining({ versionId: orphanWarpId, reason: 'parent-archived' }),
      expect.objectContaining({ versionId: orphanMaskId, reason: 'missing-parent' }),
    ]));
  });

  it('rejects an occlusion artifact whose dimensions or bounds do not match its source board', () => {
    const mismatched = mask(MASK_A, WARP_A, {
      frame_width: 1599,
      world_bounds: { minX: -100, minY: -50, width: 1599, height: 900 },
    });
    const model = predrawnBoardArtifactWorkflow([raw(), warped(), mismatched]);

    expect(model.artifacts.map((artifact) => artifact.id)).toEqual([RAW_A, WARP_A]);
    expect(model.rejected).toContainEqual(expect.objectContaining({
      versionId: MASK_A,
      reason: 'surface-mismatch',
    }));
  });

  it('round-trips exact working and canonical surfaces through one artifact identity', () => {
    const model = predrawnBoardArtifactWorkflow([raw(), warped(), mask()]);
    const finalArtifact = model.artifacts.find((artifact) => artifact.id === MASK_A)!;
    const surface = predrawnBoardSurfaceForArtifact(finalArtifact);

    expect(surface).not.toBe(finalArtifact.surface);
    expect(surface.worldBounds).not.toBe(finalArtifact.surface.worldBounds);
    expect(predrawnBoardArtifactForSurface(model.artifacts, surface)).toBe(finalArtifact);
    expect(predrawnBoardArtifactForSurface(model.artifacts, {
      ...surface,
      frameWidth: surface.frameWidth + 1,
    })).toBeUndefined();
    expect(predrawnBoardArtifactForSurface(model.artifacts, {
      ...surface,
      occlusionVersionId: undefined,
    })?.id).toBe(WARP_A);
  });

  it('rejects duplicate ids rather than choosing an input-order winner', () => {
    const first = raw();
    const duplicate = raw(RAW_A, { label: 'Conflicting duplicate' });
    const model = predrawnBoardArtifactWorkflow([duplicate, first]);

    expect(model.artifacts).toEqual([]);
    expect(model.rejected).toEqual([expect.objectContaining({
      versionId: RAW_A,
      reason: 'duplicate-id',
    })]);
  });

  it('retains unfinished stored children as archive protection even when they are not selectable', () => {
    const generated = raw();
    const unfinishedWarp = warped(WARP_A, RAW_A, {
      status: 'draft',
      content_sha256: null,
      content_url: null,
      frame_width: null,
      frame_height: null,
    });
    const archivedWarp = warped('44444444-4444-4444-8444-444444444444', RAW_A, {
      status: 'archived',
    });
    const workflow = predrawnBoardArtifactWorkflow([generated, unfinishedWarp, archivedWarp]);

    expect(workflow.artifacts.map((artifact) => artifact.id)).toEqual([RAW_A]);
    expect(predrawnBoardArtifactStoredChildren(
      [generated, unfinishedWarp, archivedWarp],
      workflow.artifacts[0],
    ).map((child) => child.id)).toEqual([WARP_A]);
  });
});
