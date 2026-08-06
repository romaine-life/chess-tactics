import { describe, expect, it } from 'vitest';
import { encodeBoard } from '@chess-tactics/board-render';
import type {
  PredrawnBackgroundVersion,
  PredrawnGenerationAttempt,
} from '../net/predrawnBackgroundVersions';
import {
  nextPredrawnAttemptCreationIntent,
  nextPredrawnPipelineSourceAttemptCreationIntent,
  predrawnAttemptArchiveAction,
  predrawnAttemptArchivePolicy,
  predrawnAttemptCanProcess,
  predrawnAttemptForSurface,
  predrawnCreationAttemptModels,
  predrawnGenerationReferenceLabel,
  predrawnLatestCommittedArtifact,
} from './predrawnCreationAttempts';

const SOURCE_A = '11111111-1111-4111-8111-111111111111';
const RAW_A = '22222222-2222-4222-8222-222222222222';
const WARP_A = '33333333-3333-4333-8333-333333333333';
const MASK_A = '44444444-4444-4444-8444-444444444444';
const ATTEMPT_A = '55555555-5555-4555-8555-555555555555';
const BOUNDS = { minX: -100, minY: -50, width: 1600, height: 900 };
const GEOMETRY_SHA256 = 'a'.repeat(64);
const SOURCE_CONTENT_SHA256 = 'b'.repeat(64);
const SEMANTIC_REQUEST_SHA256 = 'c'.repeat(64);
const BOARD_CODE = encodeBoard({
  cols: 2,
  rows: 2,
  cells: {},
  units: {},
  doodads: {},
  props: {},
  cover: {},
  coverTypes: {},
  features: {},
  featureCuts: {},
  featureExits: {},
  zones: {},
});
const SEMANTIC_REQUEST = {
  schema: 'predrawn-generation-semantic-request-v2' as const,
  levelId: 'level-1',
  workingCopyDocumentRevision: 4,
  workingCopyLevelSha256: 'd'.repeat(64),
  boardCode: BOARD_CODE,
  boardSha256: 'e'.repeat(64),
  generationFrame: { version: 1 as const, x: -100, y: -50, width: 1600, height: 900 },
  worldBounds: BOUNDS,
  backgroundMode: 'legacy' as const,
  sourceBackgroundVersionId: null,
  sourceOcclusionVersionId: null,
  environmentGeometrySchema: 'predrawn-environment-geometry-v2' as const,
  environmentGeometrySha256: GEOMETRY_SHA256,
};
const SOURCE_REQUEST = {
  schema: 'predrawn-generation-attempt-source-v1' as const,
  sourceArtworkVersionId: SOURCE_A,
  sourceArtworkSha256: SOURCE_CONTENT_SHA256,
  semanticRequestSha256: SEMANTIC_REQUEST_SHA256,
  semanticRequest: SEMANTIC_REQUEST,
  requestSha256: 'f'.repeat(64),
};

function version(
  kind: PredrawnBackgroundVersion['kind'],
  id: string,
  overrides: Partial<PredrawnBackgroundVersion> = {},
): PredrawnBackgroundVersion {
  const sourceMetadata = kind === 'source' ? {
    operation: {
      semanticRequest: SEMANTIC_REQUEST,
      semanticRequestSha256: SEMANTIC_REQUEST_SHA256,
      environmentGeometrySha256: GEOMETRY_SHA256,
    },
    content_sha256: SOURCE_CONTENT_SHA256,
  } : {};
  const generatedMetadata = kind === 'raw' ? {
    operation: {
      environmentGeometrySha256: GEOMETRY_SHA256,
      sourceArtworkVersionId: SOURCE_A,
      sourceArtworkSha256: SOURCE_CONTENT_SHA256,
    },
    provenance: {
      sourceArtworkVersionId: SOURCE_A,
      sourceArtworkSha256: SOURCE_CONTENT_SHA256,
    },
  } : {};
  const derivativeMetadata = kind === 'warped' ? {
    operation: {
      environmentGeometrySha256: GEOMETRY_SHA256,
      registration: '1600,900,800,0,1600,450,800,900,0,450',
    },
  } : kind === 'occlusion' ? {
    operation: { environmentGeometrySha256: GEOMETRY_SHA256 },
  } : {};
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
    world_bounds: BOUNDS,
    operation: {},
    provenance: {},
    environment_geometry_sha256_v2: null,
    pipeline_source_eligible: kind === 'raw',
    pipeline_source_issue: kind === 'raw' ? null : 'Only raw artwork can seed a processing attempt.',
    content_sha256: id.replaceAll('-', '').padEnd(64, 'a').slice(0, 64),
    content_url: `/api/background-versions/${id}/content`,
    created_at: '2026-07-20T00:00:00.000Z',
    created_by: 'Owner',
    updated_at: '2026-07-20T00:00:00.000Z',
    ...sourceMetadata,
    ...generatedMetadata,
    ...derivativeMetadata,
    ...overrides,
  };
}

function attempt(
  id = ATTEMPT_A,
  overrides: Partial<PredrawnGenerationAttempt> = {},
): PredrawnGenerationAttempt {
  return {
    id,
    document_id: 'doc-1',
    level_id: 'level-1',
    label: `Attempt ${id.slice(0, 4)}`,
    origin: 'source',
    source_version_id: SOURCE_A,
    source_attempt_id: null,
    source_request: SOURCE_REQUEST,
    generated_version_id: RAW_A,
    warped_version_id: WARP_A,
    occlusion_version_id: MASK_A,
    move_highlight_profile: null,
    move_highlight_profile_sha256: null,
    move_highlight_profile_warped_version_id: null,
    processing_revision: 0,
    status: 'active',
    row_revision: 4,
    created_by: 'Owner',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T03:00:00.000Z',
    archived_at: null,
    ...overrides,
  };
}

function completeVersions(): PredrawnBackgroundVersion[] {
  return [
    version('source', SOURCE_A),
    version('raw', RAW_A),
    version('warped', WARP_A, {
      parent_version_id: RAW_A,
      source_background_version_id: RAW_A,
    }),
    version('occlusion', MASK_A, {
      source_background_version_id: WARP_A,
    }),
  ];
}

describe('pre-drawn creation attempts', () => {
  it('presents legacy stored source labels as Generation References', () => {
    expect(predrawnGenerationReferenceLabel({ label: 'Source artwork 3' })).toBe('Generation reference 3');
    expect(predrawnGenerationReferenceLabel({ label: '' }, 1)).toBe('Generation reference 2');
    expect(predrawnGenerationReferenceLabel({ label: 'Bridge repaint' })).toBe('Bridge repaint');
  });

  it('retains one create intent across uncertain retries and rotates after source changes', () => {
    const first = nextPredrawnAttemptCreationIntent(
      undefined,
      SOURCE_A,
      'Attempt 1',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(nextPredrawnAttemptCreationIntent(
      first,
      SOURCE_A,
      'Attempt 2',
      '22222222-2222-4222-8222-222222222222',
    )).toBe(first);
    expect(nextPredrawnAttemptCreationIntent(
      first,
      '99999999-9999-4999-8999-999999999999',
      'Attempt 2',
      '22222222-2222-4222-8222-222222222222',
    )).toEqual({
      sourceVersionId: '99999999-9999-4999-8999-999999999999',
      label: 'Attempt 2',
      idempotencyKey: 'attempt:99999999-9999-4999-8999-999999999999:22222222-2222-4222-8222-222222222222',
    });
  });

  it('retains a pipeline-source create intent for the exact saved raw image', () => {
    const first = nextPredrawnPipelineSourceAttemptCreationIntent(
      undefined,
      RAW_A,
      'Attempt 2',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(nextPredrawnPipelineSourceAttemptCreationIntent(
      first,
      RAW_A,
      'Changed label',
      '22222222-2222-4222-8222-222222222222',
    )).toBe(first);
    expect(first).toEqual({
      pipelineSourceVersionId: RAW_A,
      label: 'Attempt 2',
      idempotencyKey: `attempt:pipeline-source:${RAW_A}:11111111-1111-4111-8111-111111111111`,
    });
  });

  it('resolves one source and one committed artifact for each pipeline stage', () => {
    const [model] = predrawnCreationAttemptModels([attempt()], completeVersions());

    expect(model.issue).toBeUndefined();
    expect(model.sourceArtwork?.id).toBe(SOURCE_A);
    expect(model.artifacts.map(({ id, stage, parentArtifactId }) => ({
      id,
      stage,
      parentArtifactId,
    }))).toEqual([
      { id: RAW_A, stage: 'generated', parentArtifactId: null },
      { id: WARP_A, stage: 'warped', parentArtifactId: RAW_A },
      { id: MASK_A, stage: 'occlusion-ready', parentArtifactId: WARP_A },
    ]);
    expect(model.generated?.surface).toMatchObject({
      backgroundVersionId: RAW_A,
    });
    expect(model.warped?.surface).toMatchObject({
      backgroundVersionId: WARP_A,
    });
    expect(model.occlusionReady?.surface).toMatchObject({
      backgroundVersionId: WARP_A,
      occlusionVersionId: MASK_A,
    });
    expect(predrawnLatestCommittedArtifact(model)?.id).toBe(MASK_A);
    expect(predrawnAttemptCanProcess(model)).toBe(true);
  });

  it('resolves imported AI artwork without a Generation Reference binding', () => {
    const raw = version('raw', RAW_A, {
      content_sha256: SOURCE_CONTENT_SHA256,
      operation: { environmentGeometrySha256: GEOMETRY_SHA256 },
      provenance: {},
    });
    const intakeRequest = {
      schema: 'predrawn-ai-artwork-intake-v1' as const,
      inputRole: 'raw-ai-artwork' as const,
      inputVersionId: RAW_A,
      inputSha256: SOURCE_CONTENT_SHA256,
      semanticRequestSha256: SEMANTIC_REQUEST_SHA256,
      semanticRequest: SEMANTIC_REQUEST,
      requestSha256: 'f'.repeat(64),
    };
    const [model] = predrawnCreationAttemptModels([attempt(ATTEMPT_A, {
      source_version_id: RAW_A,
      source_request: intakeRequest,
      source_attempt_id: null,
      generated_version_id: RAW_A,
      warped_version_id: null,
      occlusion_version_id: null,
    })], [raw]);

    expect(model.issue).toBeUndefined();
    expect(model.sourceArtwork?.id).toBe(RAW_A);
    expect(model.generated?.id).toBe(RAW_A);
    expect(predrawnAttemptCanProcess(model)).toBe(true);
  });

  it('embeds one exact saved cyan-footprint snapshot into the warped and occlusion surfaces', () => {
    const profile = {
      schema: 'predrawn-move-highlight-profile-v1' as const,
      backgroundVersionId: WARP_A,
      coordinateBasis: 'cell-diamond-10000-v1' as const,
      environmentGeometrySha256: GEOMETRY_SHA256,
      cells: {},
      profileSha256: '9'.repeat(64),
    };
    const [model] = predrawnCreationAttemptModels([attempt(ATTEMPT_A, {
      move_highlight_profile: profile,
      move_highlight_profile_sha256: profile.profileSha256,
      move_highlight_profile_warped_version_id: WARP_A,
    })], completeVersions());

    expect(model.issue).toBeUndefined();
    expect(model.moveHighlightProfile).toEqual(profile);
    expect(model.generated?.surface.schemaVersion).toBe(2);
    expect(model.warped?.surface).toMatchObject({
      schemaVersion: 3,
      moveHighlightProfile: profile,
    });
    expect(model.occlusionReady?.surface).toMatchObject({
      schemaVersion: 3,
      moveHighlightProfile: profile,
    });
    expect(predrawnAttemptForSurface([model], model.warped?.surface)).toBe(model);
    expect(predrawnAttemptForSurface([model], {
      kind: 'predrawn',
      schemaVersion: 2,
      backgroundVersionId: WARP_A,
      frameWidth: 1600,
      frameHeight: 900,
      worldBounds: BOUNDS,
    })).toBeUndefined();
  });

  it('fails closed when a cyan-footprint draft names a cell outside its semantic board', () => {
    const profile = {
      schema: 'predrawn-move-highlight-profile-v1' as const,
      backgroundVersionId: WARP_A,
      coordinateBasis: 'cell-diamond-10000-v1' as const,
      environmentGeometrySha256: GEOMETRY_SHA256,
      cells: {
        '0,0': [5000, 500, 9500, 5000, 5000, 9500, 500, 5000] as const,
      },
      profileSha256: '9'.repeat(64),
    };
    const [model] = predrawnCreationAttemptModels([attempt(ATTEMPT_A, {
      move_highlight_profile: profile,
      move_highlight_profile_sha256: profile.profileSha256,
      move_highlight_profile_warped_version_id: WARP_A,
    })], completeVersions());

    expect(model.issue).toMatch(/outside its exact board/);
    expect(model.warped).toBeUndefined();
  });

  it('keeps alternatives in separate attempts even when they share one source artwork', () => {
    const attemptBId = '66666666-6666-4666-8666-666666666666';
    const rawBId = '77777777-7777-4777-8777-777777777777';
    const attempts = [
      attempt(ATTEMPT_A, { created_at: '2026-07-20T01:00:00Z' }),
      attempt(attemptBId, {
        generated_version_id: rawBId,
        warped_version_id: null,
        occlusion_version_id: null,
        created_at: '2026-07-20T02:00:00Z',
      }),
    ];
    const models = predrawnCreationAttemptModels(attempts, [
      ...completeVersions(),
      version('raw', rawBId),
    ]);

    expect(models.map((model) => ({
      attempt: model.attempt.id,
      source: model.sourceArtwork?.id,
      artifacts: model.artifacts.map((artifact) => artifact.id),
    }))).toEqual([
      { attempt: attemptBId, source: SOURCE_A, artifacts: [rawBId] },
      { attempt: ATTEMPT_A, source: SOURCE_A, artifacts: [RAW_A, WARP_A, MASK_A] },
    ]);
  });

  it('uses an existing Raw Pipeline Source as the immutable input of a separate attempt', () => {
    const childAttemptId = '66666666-6666-4666-8666-666666666666';
    const rawInput = version('raw', RAW_A);
    const pipelineRequest = {
      schema: 'predrawn-processing-attempt-input-v1' as const,
      inputRole: 'raw-pipeline-source' as const,
      inputVersionId: RAW_A,
      inputSha256: rawInput.content_sha256!,
      sourceAttemptId: ATTEMPT_A,
      semanticRequestSha256: SEMANTIC_REQUEST_SHA256,
      semanticRequest: SEMANTIC_REQUEST,
      requestSha256: '9'.repeat(64),
    };
    const sourceAttempt = attempt(ATTEMPT_A, {
      origin: 'migrated-history',
      source_version_id: null,
      source_request: null,
      warped_version_id: null,
      occlusion_version_id: null,
      created_at: '2026-07-20T01:00:00Z',
    });
    const childAttempt = attempt(childAttemptId, {
      origin: 'pipeline-source',
      source_version_id: RAW_A,
      source_attempt_id: ATTEMPT_A,
      source_request: pipelineRequest,
      generated_version_id: RAW_A,
      warped_version_id: null,
      occlusion_version_id: null,
      created_at: '2026-07-20T02:00:00Z',
    });

    const models = predrawnCreationAttemptModels(
      [sourceAttempt, childAttempt],
      [version('source', SOURCE_A), rawInput],
    );
    const child = models.find((model) => model.attempt.id === childAttemptId);
    const source = models.find((model) => model.attempt.id === ATTEMPT_A);

    expect(child?.issue).toBeUndefined();
    expect(child?.sourceArtwork?.id).toBe(RAW_A);
    expect(child?.generated?.id).toBe(RAW_A);
    expect(child?.artifacts.map((artifact) => artifact.id)).toEqual([RAW_A]);
    expect(predrawnAttemptCanProcess(child)).toBe(true);
    expect(source?.attempt.origin).toBe('migrated-history');
    expect(source?.artifacts.map((artifact) => artifact.id)).toEqual([RAW_A]);
  });

  it('accepts a new warp against a historical raw through its effective v2 geometry binding', () => {
    const childAttemptId = '66666666-6666-4666-8666-666666666666';
    const legacyGeometrySha256 = '1'.repeat(64);
    const rawInput = version('raw', RAW_A, {
      environment_geometry_sha256_v2: GEOMETRY_SHA256,
      operation: {
        environmentGeometrySha256: legacyGeometrySha256,
        sourceArtworkVersionId: SOURCE_A,
        sourceArtworkSha256: SOURCE_CONTENT_SHA256,
      },
    });
    const pipelineRequest = {
      schema: 'predrawn-processing-attempt-input-v1' as const,
      inputRole: 'raw-pipeline-source' as const,
      inputVersionId: RAW_A,
      inputSha256: rawInput.content_sha256!,
      sourceAttemptId: ATTEMPT_A,
      semanticRequestSha256: SEMANTIC_REQUEST_SHA256,
      semanticRequest: SEMANTIC_REQUEST,
      requestSha256: '9'.repeat(64),
    };
    const warped = version('warped', WARP_A, {
      parent_version_id: RAW_A,
      source_background_version_id: RAW_A,
      environment_geometry_sha256_v2: GEOMETRY_SHA256,
    });
    const [model] = predrawnCreationAttemptModels([
      attempt(childAttemptId, {
        origin: 'pipeline-source',
        source_version_id: RAW_A,
        source_attempt_id: ATTEMPT_A,
        source_request: pipelineRequest,
        generated_version_id: RAW_A,
        warped_version_id: WARP_A,
        occlusion_version_id: null,
      }),
    ], [rawInput, warped]);

    expect(model.issue).toBeUndefined();
    expect(model.artifacts.map(({ id, stage }) => ({ id, stage }))).toEqual([
      { id: RAW_A, stage: 'generated' },
      { id: WARP_A, stage: 'warped' },
    ]);
    expect(predrawnAttemptCanProcess(model)).toBe(true);
  });

  it('rejects a second raw image as the output of a Pipeline-Source attempt', () => {
    const secondRawId = '77777777-7777-4777-8777-777777777777';
    const rawInput = version('raw', RAW_A);
    const [model] = predrawnCreationAttemptModels([
      attempt('66666666-6666-4666-8666-666666666666', {
        origin: 'pipeline-source',
        source_version_id: RAW_A,
        source_attempt_id: ATTEMPT_A,
        source_request: {
          schema: 'predrawn-processing-attempt-input-v1',
          inputRole: 'raw-pipeline-source',
          inputVersionId: RAW_A,
          inputSha256: rawInput.content_sha256!,
          sourceAttemptId: ATTEMPT_A,
          semanticRequestSha256: SEMANTIC_REQUEST_SHA256,
          semanticRequest: SEMANTIC_REQUEST,
          requestSha256: '9'.repeat(64),
        },
        generated_version_id: secondRawId,
        warped_version_id: null,
        occlusion_version_id: null,
      }),
    ], [rawInput, version('raw', secondRawId)]);

    expect(model.issue).toMatch(/does not use its exact saved Raw Pipeline Source/);
    expect(model.artifacts).toEqual([]);
  });

  it('ignores uncommitted branches instead of turning them into extra stages', () => {
    const alternateRawId = '88888888-8888-4888-8888-888888888888';
    const alternateWarpId = '99999999-9999-4999-8999-999999999999';
    const [model] = predrawnCreationAttemptModels([attempt()], [
      ...completeVersions(),
      version('raw', alternateRawId),
      version('warped', alternateWarpId, {
        parent_version_id: RAW_A,
        source_background_version_id: RAW_A,
      }),
    ]);

    expect(model.artifacts.map((artifact) => artifact.id)).toEqual([RAW_A, WARP_A, MASK_A]);
  });

  it('fails closed when a committed stage does not exactly descend from the prior stage', () => {
    const wrongParentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const rows = completeVersions().map((row) => (
      row.id === WARP_A
        ? { ...row, parent_version_id: wrongParentId }
        : row
    ));
    const [model] = predrawnCreationAttemptModels([attempt()], rows);

    expect(model.issue).toMatch(/does not exactly descend/);
    expect(model.artifacts.map((artifact) => artifact.id)).toEqual([RAW_A]);
    expect(model.warped).toBeUndefined();
    expect(model.occlusionReady).toBeUndefined();
  });

  it('requires an available immutable source for new attempts but preserves migrated history honestly', () => {
    const withoutSource = completeVersions().filter((row) => row.id !== SOURCE_A);
    const [sourceAttempt] = predrawnCreationAttemptModels([attempt()], withoutSource);
    const [migratedAttempt] = predrawnCreationAttemptModels([
      attempt(ATTEMPT_A, {
        origin: 'migrated-history',
        source_version_id: null,
        source_request: null,
      }),
    ], withoutSource);

    expect(sourceAttempt.issue).toMatch(/generation reference.*unavailable/i);
    expect(sourceAttempt.artifacts).toEqual([]);
    expect(migratedAttempt.issue).toBeUndefined();
    expect(migratedAttempt.sourceArtwork).toBeUndefined();
    expect(migratedAttempt.artifacts.map((artifact) => artifact.id))
      .toEqual([RAW_A, WARP_A, MASK_A]);
    expect(predrawnAttemptCanProcess(migratedAttempt)).toBe(false);
  });

  it('exposes a valid reserved draft slot for an exact resumable upload', () => {
    const draftRaw = version('raw', RAW_A, {
      status: 'draft',
      frame_width: null,
      frame_height: null,
      content_sha256: null,
      content_url: null,
    });
    const [model] = predrawnCreationAttemptModels([
      attempt(ATTEMPT_A, {
        warped_version_id: null,
        occlusion_version_id: null,
      }),
    ], [version('source', SOURCE_A), draftRaw]);

    expect(model.issue).toBeUndefined();
    expect(model.generated).toBeUndefined();
    expect(model.generatedPending?.id).toBe(RAW_A);
    expect(model.artifacts).toEqual([]);
  });

  it('fails closed when an occupied stage pointer is missing or invalid instead of reopening the slot', () => {
    const [missing] = predrawnCreationAttemptModels([
      attempt(ATTEMPT_A, {
        warped_version_id: null,
        occlusion_version_id: null,
      }),
    ], [version('source', SOURCE_A)]);
    const [wrongSource] = predrawnCreationAttemptModels([
      attempt(ATTEMPT_A, {
        warped_version_id: null,
        occlusion_version_id: null,
      }),
    ], [
      version('source', SOURCE_A),
      version('raw', RAW_A, {
        operation: {
          environmentGeometrySha256: GEOMETRY_SHA256,
          sourceArtworkVersionId: '99999999-9999-4999-8999-999999999999',
          sourceArtworkSha256: SOURCE_CONTENT_SHA256,
        },
      }),
    ]);

    expect(missing.issue).toMatch(/invalid or unavailable/);
    expect(missing.generatedPending).toBeUndefined();
    expect(wrongSource.issue).toMatch(/immutable Generation Reference request/);
    expect(wrongSource.generated).toBeUndefined();
  });

  it('locks a source attempt that lacks its immutable semantic request', () => {
    const [model] = predrawnCreationAttemptModels([
      attempt(ATTEMPT_A, {
        source_request: null,
        generated_version_id: null,
        warped_version_id: null,
        occlusion_version_id: null,
      }),
    ], [version('source', SOURCE_A)]);

    expect(model.issue).toMatch(/immutable generation reference request/i);
    expect(model.processing).toBeUndefined();
  });

  it('finds the exact attempt that owns the selected installed surface', () => {
    const [model] = predrawnCreationAttemptModels([attempt()], completeVersions());

    expect(predrawnAttemptForSurface([model], model.occlusionReady?.surface)).toBe(model);
    expect(predrawnAttemptForSurface([model], {
      ...model.occlusionReady!.surface,
      occlusionVersionId: undefined,
    })).toBe(model);
    expect(predrawnAttemptForSurface([model], {
      ...model.occlusionReady!.surface,
      backgroundVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    })).toBeUndefined();
    expect(predrawnAttemptForSurface([model], undefined)).toBeUndefined();
  });

  it('allows archive to forget only dormant Legacy selections', () => {
    const surface = {
      kind: 'predrawn' as const,
      schemaVersion: 2 as const,
      backgroundVersionId: WARP_A,
      occlusionVersionId: MASK_A,
      frameWidth: 1600,
      frameHeight: 900,
      worldBounds: BOUNDS,
    };
    const policy = predrawnAttemptArchivePolicy({
      attempt: attempt(),
      versions: completeVersions(),
      workingBackgroundMode: 'legacy',
      workingSurface: surface,
      canonicalBackgroundMode: 'legacy',
      canonicalSurface: surface,
    });

    expect(policy).toEqual({
      archivable: true,
      dormantWorkingSelection: true,
      dormantCanonicalSelection: true,
      blockedByWorkingSelection: false,
      blockedByCanonicalSelection: false,
      blockedByPublishedVersion: false,
    });
  });

  it('uses one visible gate for every archive precondition and both ready states', () => {
    const readyPolicy = {
      archivable: true,
      dormantWorkingSelection: false,
      dormantCanonicalSelection: false,
      blockedByWorkingSelection: false,
      blockedByCanonicalSelection: false,
      blockedByPublishedVersion: false,
    };
    const base = {
      attemptSelected: true,
      canWrite: true,
      workingCopySyncState: 'saved',
      busy: false,
      policy: readyPolicy,
      canonicalActionLabel: 'Save' as const,
    };

    expect(predrawnAttemptArchiveAction({ ...base, attemptSelected: false })).toMatchObject({
      ready: false,
      state: 'no-slot',
      explanation: 'Select a pipeline slot to archive.',
    });
    expect(predrawnAttemptArchiveAction({ ...base, canWrite: false })).toMatchObject({
      ready: false,
      state: 'read-only',
    });
    expect(predrawnAttemptArchiveAction({ ...base, workingCopySyncState: 'saving' })).toMatchObject({
      ready: false,
      state: 'cloud-sync',
    });
    expect(predrawnAttemptArchiveAction({ ...base, busy: true })).toMatchObject({
      ready: false,
      state: 'busy',
    });
    expect(predrawnAttemptArchiveAction({
      ...base,
      policy: { ...readyPolicy, archivable: false, blockedByWorkingSelection: true },
    })).toMatchObject({
      ready: false,
      state: 'working-ai',
    });
    expect(predrawnAttemptArchiveAction({
      ...base,
      canonicalActionLabel: 'Publish',
      policy: { ...readyPolicy, archivable: false, blockedByCanonicalSelection: true },
    })).toEqual({
      ready: false,
      state: 'canonical-ai',
      explanation: 'This slot supplies the published Level’s active AI background. Switch that canonical Level to Legacy before archiving it.',
    });
    expect(predrawnAttemptArchiveAction({
      ...base,
      policy: { ...readyPolicy, archivable: false, blockedByPublishedVersion: true },
    })).toMatchObject({
      ready: false,
      state: 'published',
    });
    expect(predrawnAttemptArchiveAction({
      ...base,
      policy: { ...readyPolicy, dormantWorkingSelection: true },
    })).toMatchObject({
      ready: true,
      state: 'dormant-legacy',
    });
    expect(predrawnAttemptArchiveAction(base)).toMatchObject({
      ready: true,
      state: 'unused',
    });
  });

  it('protects a slot used by either active AI Level and fails closed on unknown canonical mode', () => {
    const surface = {
      kind: 'predrawn' as const,
      schemaVersion: 2 as const,
      backgroundVersionId: WARP_A,
      occlusionVersionId: MASK_A,
      frameWidth: 1600,
      frameHeight: 900,
      worldBounds: BOUNDS,
    };
    const workingActive = predrawnAttemptArchivePolicy({
      attempt: attempt(),
      versions: completeVersions(),
      workingBackgroundMode: 'ai',
      workingSurface: surface,
      canonicalBackgroundMode: 'legacy',
      canonicalSurface: surface,
    });
    const canonicalActive = predrawnAttemptArchivePolicy({
      attempt: attempt(),
      versions: completeVersions(),
      workingBackgroundMode: 'legacy',
      workingSurface: surface,
      canonicalBackgroundMode: 'ai',
      canonicalSurface: surface,
    });
    const canonicalUnknown = predrawnAttemptArchivePolicy({
      attempt: attempt(),
      versions: completeVersions(),
      workingBackgroundMode: 'legacy',
      workingSurface: surface,
      canonicalSurface: surface,
    });

    expect(workingActive).toMatchObject({
      archivable: false,
      blockedByWorkingSelection: true,
      dormantCanonicalSelection: true,
    });
    expect(canonicalActive).toMatchObject({
      archivable: false,
      dormantWorkingSelection: true,
      blockedByCanonicalSelection: true,
    });
    expect(canonicalUnknown).toMatchObject({
      archivable: false,
      blockedByCanonicalSelection: true,
    });
  });

  it('protects published derivatives while ignoring a shared raw source selection', () => {
    const published = completeVersions().map((row) => (
      row.id === WARP_A ? { ...row, status: 'published' as const } : row
    ));
    const rawSurface = {
      kind: 'predrawn' as const,
      schemaVersion: 2 as const,
      backgroundVersionId: RAW_A,
      frameWidth: 1600,
      frameHeight: 900,
      worldBounds: BOUNDS,
    };

    expect(predrawnAttemptArchivePolicy({
      attempt: attempt(),
      versions: published,
      workingBackgroundMode: 'legacy',
    })).toMatchObject({
      archivable: false,
      blockedByPublishedVersion: true,
    });
    expect(predrawnAttemptArchivePolicy({
      attempt: attempt(),
      versions: completeVersions(),
      workingBackgroundMode: 'ai',
      workingSurface: rawSurface,
      canonicalBackgroundMode: 'legacy',
    })).toMatchObject({
      archivable: true,
      blockedByWorkingSelection: false,
      dormantWorkingSelection: false,
    });
  });
});
