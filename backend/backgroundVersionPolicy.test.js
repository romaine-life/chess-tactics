'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  ENVIRONMENT_GEOMETRY_SCHEMA,
  LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
  backgroundVersionAttemptStageIssue,
  backgroundVersionLineageIssue,
  backgroundVersionStoredContractIssue,
  backgroundVersionStoredOcclusionChain,
  backgroundVersionV2GeometrySha256,
  generationAttemptSelectionDisposition,
  normalizeBackgroundVersionCreate,
  normalizeBackgroundVersionIdempotencyKey,
  normalizeMoveHighlightProfile,
  normalizePredrawnVersionSurface,
  normalizeWorldBounds,
  parseBackgroundVersionUploadPath,
  rawBackgroundVersionContractIssue,
  rawBackgroundVersionContractBindingIssue,
  sourceArtworkVersionContractIssue,
} = require('./backgroundVersionPolicy');

const SOURCE_ID = '2b130a39-6090-48f8-923a-f9d06601829d';
const RAW_ID = 'f53a2944-95ba-4897-a5db-42df04753ed1';
const WARPED_ID = '39ec915c-cec2-47a7-8111-d5bcaf0b5b38';
const MASK_ID = '2c7c3d23-4913-4671-b7d9-5fddbe564150';
const PARENT_MASK_ID = 'cccf9d08-0ba2-4820-966f-75c31786d832';
const REFINED_MASK_ID = '669186fc-3c1c-4847-a60e-c06d45bfc236';
const BOUNDS = { minX: -72, minY: 14, width: 960, height: 540 };
const GEOMETRY_SHA256 = 'd'.repeat(64);
const SOURCE_WIDTH = 100;
const SOURCE_HEIGHT = 80;
const REGISTRATION = '100,80,50,0,100,40,50,80,0,40';
const MESH_REGISTRATION = 'v5;100,80,50,0,100,40,50,80,0,40;2,2;0,0.5,1;0,0.5,1;;1,1,51,40';
const PREDRAWN_PNG_ENCODER = 'png-rgba8-filter0-stored-deflate-v1';
const PREDRAWN_COORDINATE_BASIS = 'board-world-pixels-v1';
const CLIENT_RAW_IDEMPOTENCY_KEY = `predrawn-raw:${'a'.repeat(64)}:9a5aa8c5-49ab-42b6-b1be-d21f32fbd21b`;
const ATTEMPT_ID = '608c5148-a2f7-4ea1-a6db-32bb76026549';
const SEMANTIC_BOARD_CODE = 'immutable-unit-free-board-code';
const SEMANTIC_BOARD_SHA256 = crypto.createHash('sha256').update(SEMANTIC_BOARD_CODE).digest('hex');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Canonical(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}
const base = {
  world_bounds: BOUNDS,
  operation: {
    kind: 'raw-generated-v2',
    untouched: true,
    coordinateBasis: PREDRAWN_COORDINATE_BASIS,
    viewingPane: BOUNDS,
    environmentGeometrySchema: 'predrawn-environment-geometry-v2',
    environmentGeometrySha256: GEOMETRY_SHA256,
  },
  provenance: {
    pipeline: 'imagegen',
    run: 'run-1',
    sourceSha256: 'e'.repeat(64),
    environmentGeometrySha256: GEOMETRY_SHA256,
  },
};

function sourceMetadata(backgroundMode = 'legacy') {
  const sourceBackgroundVersionId = backgroundMode === 'ai' ? RAW_ID : null;
  const sourceOcclusionVersionId = backgroundMode === 'ai' ? MASK_ID : null;
  const frame = {
    version: 1,
    x: BOUNDS.minX,
    y: BOUNDS.minY,
    width: BOUNDS.width,
    height: BOUNDS.height,
  };
  const semanticRequest = {
    schema: 'predrawn-generation-semantic-request-v2',
    levelId: 'level-a',
    workingCopyDocumentRevision: 7,
    workingCopyLevelSha256: 'a'.repeat(64),
    boardCode: SEMANTIC_BOARD_CODE,
    boardSha256: SEMANTIC_BOARD_SHA256,
    generationFrame: frame,
    worldBounds: BOUNDS,
    backgroundMode,
    sourceBackgroundVersionId,
    sourceOcclusionVersionId,
    environmentGeometrySchema: ENVIRONMENT_GEOMETRY_SCHEMA,
    environmentGeometrySha256: GEOMETRY_SHA256,
  };
  const semanticRequestSha256 = sha256Canonical(semanticRequest);
  return {
    world_bounds: BOUNDS,
    operation: {
      kind: 'generation-source-v2',
      coordinateBasis: PREDRAWN_COORDINATE_BASIS,
      viewingPane: BOUNDS,
      generationFrame: frame,
      backgroundMode,
      sourceBackgroundVersionId,
      sourceOcclusionVersionId,
      workingCopyDocumentRevision: 7,
      workingCopyLevelSha256: 'a'.repeat(64),
      environmentGeometrySchema: ENVIRONMENT_GEOMETRY_SCHEMA,
      environmentGeometrySha256: GEOMETRY_SHA256,
      semanticBoardSha256: SEMANTIC_BOARD_SHA256,
      semanticRequest,
      semanticRequestSha256,
    },
    provenance: {
      sourceSha256: 'b'.repeat(64),
      workingCopyLevelSha256: 'a'.repeat(64),
      backgroundMode,
      sourceBackgroundVersionId,
      sourceOcclusionVersionId,
      workingCopyDocumentRevision: 7,
      generationFrame: frame,
      environmentGeometrySha256: GEOMETRY_SHA256,
      semanticBoardSha256: SEMANTIC_BOARD_SHA256,
      semanticRequestSha256,
    },
  };
}

function attemptSourceRequest(source) {
  const request = {
    schema: 'predrawn-generation-attempt-source-v1',
    sourceArtworkVersionId: String(source.id),
    sourceArtworkSha256: source.blob_sha256,
    semanticRequestSha256: source.operation.semanticRequestSha256,
    semanticRequest: source.operation.semanticRequest,
  };
  return { ...request, requestSha256: sha256Canonical(request) };
}

function metadataFor(kind, sourceBackgroundVersionId = null) {
  const operation = {
    ...base.operation,
    kind: kind === 'raw' ? 'raw-generated-v2' : kind === 'warped' ? 'grid-warp-v1' : 'occlusion-depth-v1',
    ...(kind === 'warped' ? {
      registration: REGISTRATION,
      sourceWidth: SOURCE_WIDTH,
      sourceHeight: SOURCE_HEIGHT,
      rasterScale: 1,
      encoder: PREDRAWN_PNG_ENCODER,
      coordinateBasis: PREDRAWN_COORDINATE_BASIS,
      attemptProcessingRevision: 0,
    } : {}),
    ...(kind === 'occlusion' ? {
      encoding: 'rgb24-signed-half-depth-alpha',
      sourceBackgroundVersionId,
      maskCount: 3,
      encoder: PREDRAWN_PNG_ENCODER,
      coordinateBasis: PREDRAWN_COORDINATE_BASIS,
    } : {}),
    ...(kind === 'raw' ? {} : { outputSha256: 'f'.repeat(64) }),
  };
  return {
    ...base,
    operation,
    provenance: {
      ...base.provenance,
      ...(kind === 'warped' ? {
        processor: 'shared-predrawn-rasterizer-v1',
        parentVersionId: RAW_ID,
        attemptProcessingRevision: 0,
      } : {}),
      ...(kind === 'occlusion' ? {
        processor: 'canonical-depth-mask-v1',
        sourceBackgroundVersionId,
      } : {}),
      ...(kind === 'raw' ? {} : { outputSha256: operation.outputSha256 }),
    },
  };
}

function meshWarpMetadata() {
  const metadata = metadataFor('warped');
  return {
    ...metadata,
    operation: {
      ...metadata.operation,
      kind: 'grid-warp-v2',
      registration: MESH_REGISTRATION,
    },
    provenance: {
      ...metadata.provenance,
      processor: 'shared-predrawn-rasterizer-v2',
    },
  };
}

test('accepts the bounded client idempotency key contract and rejects the former raw key shape', () => {
  assert.equal(normalizeBackgroundVersionIdempotencyKey(CLIENT_RAW_IDEMPOTENCY_KEY), CLIENT_RAW_IDEMPOTENCY_KEY);
  assert.ok(CLIENT_RAW_IDEMPOTENCY_KEY.length <= 200);
  assert.equal(normalizeBackgroundVersionIdempotencyKey(`predrawn-raw:${'a'.repeat(64)}:-1,2,3,4`), null);
  assert.equal(normalizeBackgroundVersionIdempotencyKey(`predrawn-raw:${'a'.repeat(180)}:overflow`), null);
});

test('normalizes immutable raw, warped, and occlusion create contracts', () => {
  assert.deepEqual(normalizeBackgroundVersionCreate({
    kind: 'raw',
    ...base,
    edit_session_id: 'f53a2944-95ba-4897-a5db-42df04753ed1',
    edit_session_key: 'private-writer-credential',
    edit_generation: 4,
  }).value, {
    kind: 'raw',
    label: 'Raw background version',
    parent_version_id: null,
    source_background_version_id: null,
    world_bounds: BOUNDS,
    operation: base.operation,
    provenance: base.provenance,
  });
  assert.equal(normalizeBackgroundVersionCreate({
    kind: 'warped', parentVersionId: RAW_ID.toUpperCase(), source_background_version_id: RAW_ID, ...metadataFor('warped'),
  }).value.parent_version_id, RAW_ID);
  assert.equal(normalizeBackgroundVersionCreate({
    kind: 'occlusion', source_background_version_id: WARPED_ID, parent_version_id: MASK_ID, ...metadataFor('occlusion', WARPED_ID),
  }).value.source_background_version_id, WARPED_ID);
});

test('accepts minimal source metadata for server canonicalization and validates stored source truth', () => {
  const minimal = normalizeBackgroundVersionCreate({
    kind: 'source',
    label: 'Saved legacy source',
    operation: { kind: 'generation-source-v2', capture: 'owner-frame' },
    provenance: { sourceSha256: 'b'.repeat(64), originalFileName: 'source.png' },
  });
  assert.deepEqual(minimal.value, {
    kind: 'source',
    label: 'Saved legacy source',
    parent_version_id: null,
    source_background_version_id: null,
    world_bounds: null,
    operation: { kind: 'generation-source-v2', capture: 'owner-frame' },
    provenance: { sourceSha256: 'b'.repeat(64), originalFileName: 'source.png' },
  });

  const stored = {
    id: SOURCE_ID,
    document_id: 'document-a',
    level_id: 'level-a',
    kind: 'source',
    label: 'Saved legacy source',
    status: 'ready',
    blob_sha256: 'b'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    parent_version_id: null,
    source_background_version_id: null,
    ...sourceMetadata(),
  };
  assert.equal(sourceArtworkVersionContractIssue(stored), null);
  assert.equal(backgroundVersionStoredContractIssue(stored), null);
  const griddedStored = JSON.parse(JSON.stringify(stored));
  griddedStored.operation.gridOverlay = 'playable';
  griddedStored.provenance.gridOverlay = 'playable';
  griddedStored.operation.semanticRequest.gridOverlay = 'playable';
  griddedStored.operation.semanticRequestSha256 = sha256Canonical(griddedStored.operation.semanticRequest);
  griddedStored.provenance.semanticRequestSha256 = griddedStored.operation.semanticRequestSha256;
  assert.equal(sourceArtworkVersionContractIssue(griddedStored), null);
  const legacyStored = JSON.parse(JSON.stringify(stored));
  legacyStored.operation.kind = 'generation-source-v1';
  legacyStored.operation.canonicalDocumentRevision = legacyStored.operation.workingCopyDocumentRevision;
  legacyStored.operation.canonicalLevelSha256 = legacyStored.operation.workingCopyLevelSha256;
  delete legacyStored.operation.workingCopyDocumentRevision;
  delete legacyStored.operation.workingCopyLevelSha256;
  legacyStored.provenance.canonicalDocumentRevision = legacyStored.provenance.workingCopyDocumentRevision;
  legacyStored.provenance.canonicalLevelSha256 = legacyStored.provenance.workingCopyLevelSha256;
  delete legacyStored.provenance.workingCopyDocumentRevision;
  delete legacyStored.provenance.workingCopyLevelSha256;
  legacyStored.operation.semanticRequest.schema = 'predrawn-generation-semantic-request-v1';
  legacyStored.operation.semanticRequest.canonicalDocumentRevision = legacyStored.operation.semanticRequest.workingCopyDocumentRevision;
  legacyStored.operation.semanticRequest.canonicalLevelSha256 = legacyStored.operation.semanticRequest.workingCopyLevelSha256;
  delete legacyStored.operation.semanticRequest.workingCopyDocumentRevision;
  delete legacyStored.operation.semanticRequest.workingCopyLevelSha256;
  legacyStored.operation.semanticRequestSha256 = sha256Canonical(legacyStored.operation.semanticRequest);
  legacyStored.provenance.semanticRequestSha256 = legacyStored.operation.semanticRequestSha256;
  assert.equal(sourceArtworkVersionContractIssue(legacyStored), null);
  assert.match(sourceArtworkVersionContractIssue({
    ...stored,
    operation: { ...stored.operation, gridOverlay: 'whole' },
    provenance: { ...stored.provenance, gridOverlay: 'whole' },
  }), /gridOverlay must be none or playable/);
  assert.match(sourceArtworkVersionContractIssue({
    ...stored,
    operation: { ...stored.operation, backgroundMode: 'ai' },
    provenance: { ...stored.provenance, backgroundMode: 'ai' },
  }), /requires sourceBackgroundVersionId/);
  assert.match(sourceArtworkVersionContractIssue({
    ...stored,
    provenance: { ...stored.provenance, workingCopyLevelSha256: 'c'.repeat(64) },
  }), /working-copy Level digest/);
  assert.match(sourceArtworkVersionContractIssue({
    ...stored,
    operation: { ...stored.operation, environmentGeometrySha256: 'c'.repeat(64) },
  }), /geometry digest/);
  assert.match(sourceArtworkVersionContractIssue({
    ...stored,
    operation: { ...stored.operation, workingCopyDocumentRevision: 0 },
  }), /positive document revision/);
  assert.match(sourceArtworkVersionContractIssue({
    ...stored,
    operation: {
      ...stored.operation,
      semanticRequest: {
        ...stored.operation.semanticRequest,
        boardCode: `${stored.operation.semanticRequest.boardCode}-changed`,
      },
    },
  }), /semantic board snapshot digest/);
});

test('attempt policy owns exactly one source-linked result per stage', () => {
  const source = {
    id: SOURCE_ID,
    document_id: 'document-a',
    kind: 'source',
    status: 'ready',
    blob_sha256: 'b'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    ...sourceMetadata(),
  };
  const attempt = {
    id: ATTEMPT_ID,
    document_id: 'document-a',
    origin: 'source',
    source_version_id: SOURCE_ID,
    source_request: attemptSourceRequest(source),
    generated_version_id: null,
    warped_version_id: null,
    occlusion_version_id: null,
    status: 'active',
    processing_revision: 0,
  };
  const generated = {
    id: RAW_ID,
    document_id: 'document-a',
    kind: 'raw',
    status: 'ready',
    blob_sha256: 'e'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    parent_version_id: null,
    source_background_version_id: null,
    ...base,
    operation: {
      ...base.operation,
      sourceArtworkVersionId: SOURCE_ID,
      sourceArtworkSha256: source.blob_sha256,
    },
    provenance: {
      ...base.provenance,
      sourceArtworkVersionId: SOURCE_ID,
      sourceArtworkSha256: source.blob_sha256,
    },
  };
  assert.equal(backgroundVersionAttemptStageIssue(generated, attempt, {
    sourceArtwork: source,
  }), null);
  assert.match(backgroundVersionAttemptStageIssue(generated, {
    ...attempt,
    source_request: {
      ...attempt.source_request,
      sourceArtworkSha256: '0'.repeat(64),
    },
  }, {
    sourceArtwork: source,
  }), /does not exactly match/);
  assert.match(backgroundVersionAttemptStageIssue(generated, {
    ...attempt,
    generated_version_id: RAW_ID,
  }, { sourceArtwork: source, generated }), /already has a Raw Pipeline Source/);
  assert.match(backgroundVersionAttemptStageIssue({
    ...generated,
    world_bounds: { ...generated.world_bounds, minX: generated.world_bounds.minX + 1 },
  }, attempt, { sourceArtwork: source }), /world bounds/);
  assert.match(backgroundVersionAttemptStageIssue(generated, {
    ...attempt,
    origin: 'migrated-history',
    source_version_id: null,
  }, {}), /Historical attempts/i);

  const warpedMetadata = metadataFor('warped');
  const warped = {
    id: WARPED_ID,
    document_id: 'document-a',
    kind: 'warped',
    status: 'ready',
    blob_sha256: 'f'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    parent_version_id: RAW_ID,
    source_background_version_id: RAW_ID,
    world_bounds: BOUNDS,
    operation: warpedMetadata.operation,
    provenance: warpedMetadata.provenance,
  };
  const generatedAttempt = { ...attempt, generated_version_id: RAW_ID };
  assert.equal(backgroundVersionAttemptStageIssue(warped, generatedAttempt, {
    sourceArtwork: source,
    generated,
  }), null);
  assert.match(backgroundVersionAttemptStageIssue({
    ...warped,
    operation: { ...warped.operation, attemptProcessingRevision: 1 },
  }, generatedAttempt, {
    sourceArtwork: source,
    generated,
  }), /current processing revision/);
  assert.match(backgroundVersionAttemptStageIssue(warped, {
    ...generatedAttempt,
    processing_revision: 1,
  }, {
    sourceArtwork: source,
    generated,
  }), /current processing revision/);

  const occlusionMetadata = metadataFor('occlusion', WARPED_ID);
  const occlusion = {
    id: MASK_ID,
    document_id: 'document-a',
    kind: 'occlusion',
    status: 'ready',
    blob_sha256: 'f'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    parent_version_id: null,
    source_background_version_id: WARPED_ID,
    world_bounds: BOUNDS,
    operation: occlusionMetadata.operation,
    provenance: occlusionMetadata.provenance,
  };
  const moveHighlightProfile = normalizeMoveHighlightProfile({
    schema: 'predrawn-move-highlight-profile-v1',
    backgroundVersionId: WARPED_ID,
    coordinateBasis: 'cell-diamond-10000-v1',
    environmentGeometrySha256: GEOMETRY_SHA256,
    cells: {},
  }, {
    backgroundVersionId: WARPED_ID,
    environmentGeometrySha256: GEOMETRY_SHA256,
  }).value;
  assert.ok(moveHighlightProfile);
  const warpedAttempt = {
    ...generatedAttempt,
    warped_version_id: WARPED_ID,
    move_highlight_profile: moveHighlightProfile,
    move_highlight_profile_sha256: moveHighlightProfile.profileSha256,
    move_highlight_profile_warped_version_id: WARPED_ID,
  };
  assert.equal(backgroundVersionAttemptStageIssue(occlusion, warpedAttempt, {
    sourceArtwork: source,
    generated,
    warped,
  }), null);
  assert.match(backgroundVersionAttemptStageIssue(occlusion, {
    ...warpedAttempt,
    move_highlight_profile: null,
    move_highlight_profile_sha256: null,
    move_highlight_profile_warped_version_id: null,
  }, {
    sourceArtwork: source,
    generated,
    warped,
  }), /fit and save/);
  assert.match(backgroundVersionAttemptStageIssue({
    ...occlusion,
    parent_version_id: PARENT_MASK_ID,
  }, warpedAttempt, {
    sourceArtwork: source,
    generated,
    warped,
  }), /cannot refine/);
});

test('attempt policy lets an exact Raw Pipeline Source immediately seed a separate processing attempt', () => {
  const sourceAttemptId = ATTEMPT_ID;
  const childAttemptId = '018c996b-403f-4284-a983-f74792587680';
  const pipelineSource = {
    id: RAW_ID,
    document_id: 'document-a',
    level_id: 'level-a',
    kind: 'raw',
    label: 'Prior raw source',
    status: 'ready',
    blob_sha256: 'e'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    parent_version_id: null,
    source_background_version_id: null,
    ...base,
  };
  const semanticRequest = sourceMetadata().operation.semanticRequest;
  const requestWithoutDigest = {
    schema: 'predrawn-processing-attempt-input-v1',
    inputRole: 'raw-pipeline-source',
    inputVersionId: RAW_ID,
    inputSha256: pipelineSource.blob_sha256,
    sourceAttemptId,
    semanticRequestSha256: sha256Canonical(semanticRequest),
    semanticRequest,
  };
  const attempt = {
    id: childAttemptId,
    document_id: 'document-a',
    level_id: 'level-a',
    origin: 'pipeline-source',
    source_version_id: RAW_ID,
    source_attempt_id: sourceAttemptId,
    source_request: {
      ...requestWithoutDigest,
      requestSha256: sha256Canonical(requestWithoutDigest),
    },
    generated_version_id: RAW_ID,
    warped_version_id: null,
    occlusion_version_id: null,
    status: 'active',
  };
  const warpMetadata = metadataFor('warped');
  const warped = {
    id: WARPED_ID,
    document_id: 'document-a',
    level_id: 'level-a',
    kind: 'warped',
    status: 'ready',
    blob_sha256: '8'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    parent_version_id: RAW_ID,
    source_background_version_id: RAW_ID,
    world_bounds: BOUNDS,
    operation: warpMetadata.operation,
    provenance: warpMetadata.provenance,
  };

  assert.equal(backgroundVersionAttemptStageIssue(warped, attempt, {
    sourceArtwork: pipelineSource,
    generated: pipelineSource,
  }), null);
  assert.match(backgroundVersionAttemptStageIssue(warped, {
    ...attempt,
    source_request: {
      ...attempt.source_request,
      inputSha256: '0'.repeat(64),
    },
  }, {
    sourceArtwork: pipelineSource,
    generated: pipelineSource,
  }), /does not exactly match/);
  assert.match(backgroundVersionAttemptStageIssue(warped, {
    ...attempt,
    generated_version_id: null,
  }, {
    sourceArtwork: pipelineSource,
    generated: pipelineSource,
  }), /must begin with its exact Raw Pipeline Source/);
  assert.match(backgroundVersionAttemptStageIssue({
    ...pipelineSource,
    id: 'eb6bde67-696b-45d7-804f-70dbc7e52914',
  }, attempt, {
    sourceArtwork: pipelineSource,
  }), /already has a Raw Pipeline Source/);
});

test('attempt policy accepts source-agnostic AI artwork intake without a Generation Reference', () => {
  const pipelineSource = {
    id: RAW_ID,
    document_id: 'document-a',
    level_id: 'level-a',
    kind: 'raw',
    label: 'Imported AI artwork',
    status: 'ready',
    blob_sha256: 'e'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    parent_version_id: null,
    source_background_version_id: null,
    ...base,
  };
  const semanticRequest = sourceMetadata().operation.semanticRequest;
  const requestWithoutDigest = {
    schema: 'predrawn-ai-artwork-intake-v1',
    inputRole: 'raw-ai-artwork',
    inputVersionId: RAW_ID,
    inputSha256: pipelineSource.blob_sha256,
    semanticRequestSha256: sha256Canonical(semanticRequest),
    semanticRequest,
  };
  const attempt = {
    id: ATTEMPT_ID,
    document_id: 'document-a',
    level_id: 'level-a',
    origin: 'source',
    source_version_id: RAW_ID,
    source_attempt_id: null,
    source_request: {
      ...requestWithoutDigest,
      requestSha256: sha256Canonical(requestWithoutDigest),
    },
    generated_version_id: RAW_ID,
    warped_version_id: null,
    occlusion_version_id: null,
    status: 'active',
  };
  const warpMetadata = metadataFor('warped');
  const warped = {
    id: WARPED_ID,
    document_id: 'document-a',
    level_id: 'level-a',
    kind: 'warped',
    status: 'ready',
    blob_sha256: '8'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    parent_version_id: RAW_ID,
    source_background_version_id: RAW_ID,
    world_bounds: BOUNDS,
    operation: warpMetadata.operation,
    provenance: warpMetadata.provenance,
  };

  assert.equal(backgroundVersionAttemptStageIssue(warped, attempt, {
    sourceArtwork: pipelineSource,
    generated: pipelineSource,
  }), null);
  assert.match(backgroundVersionAttemptStageIssue(warped, {
    ...attempt,
    source_request: { ...attempt.source_request, inputRole: 'raw-pipeline-source' },
  }, {
    sourceArtwork: pipelineSource,
    generated: pipelineSource,
  }), /immutable raw artwork request/);
});

test('new versions require v2 while immutable v1 rows resolve only through an exact external binding', () => {
  const legacy = {
    kind: 'raw',
    ...base,
    operation: {
      ...base.operation,
      environmentGeometrySchema: LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
    },
  };
  assert.equal(ENVIRONMENT_GEOMETRY_SCHEMA, 'predrawn-environment-geometry-v2');
  assert.match(normalizeBackgroundVersionCreate(legacy).error, /predrawn-environment-geometry-v2/);

  const stored = {
    id: RAW_ID,
    document_id: 'document-a',
    label: 'Immutable v1 raw',
    status: 'ready',
    blob_sha256: 'a'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    parent_version_id: null,
    source_background_version_id: null,
    ...legacy,
  };
  assert.equal(backgroundVersionStoredContractIssue(stored), null);
  assert.equal(backgroundVersionV2GeometrySha256(stored), null);
  assert.equal(backgroundVersionV2GeometrySha256({
    ...stored,
    environment_geometry_binding: {
      legacy_environment_geometry_schema: LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
      legacy_environment_geometry_sha256: GEOMETRY_SHA256,
      environment_geometry_schema: ENVIRONMENT_GEOMETRY_SCHEMA,
      environment_geometry_sha256: 'b'.repeat(64),
    },
  }), 'b'.repeat(64));
  assert.equal(backgroundVersionV2GeometrySha256({
    ...stored,
    environment_geometry_binding: {
      legacy_environment_geometry_schema: LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
      legacy_environment_geometry_sha256: 'c'.repeat(64),
      environment_geometry_schema: ENVIRONMENT_GEOMETRY_SCHEMA,
      environment_geometry_sha256: 'b'.repeat(64),
    },
  }), null);
});

test('rejects ambiguous lineage, injected status, and unbounded operation metadata', () => {
  assert.match(normalizeBackgroundVersionCreate({ kind: 'raw', parent_version_id: RAW_ID, ...base }).error, /raw versions/);
  assert.match(normalizeBackgroundVersionCreate({ kind: 'warped', ...base }).error, /require parent/);
  assert.match(normalizeBackgroundVersionCreate({ kind: 'occlusion', ...base }).error, /require source/);
  assert.match(normalizeBackgroundVersionCreate({ kind: 'raw', status: 'published', ...base }).error, /unsupported fields/);
  const nested = {};
  let cursor = nested;
  for (let index = 0; index < 10; index += 1) cursor = cursor.next = {};
  assert.match(normalizeBackgroundVersionCreate({ kind: 'raw', ...base, operation: nested }).error, /nesting limit/);
  assert.match(normalizeBackgroundVersionCreate({
    kind: 'raw', ...base, operation: { ...base.operation, environmentGeometrySha256: 'BAD' },
  }).error, /lowercase SHA-256/);
  assert.match(normalizeBackgroundVersionCreate({
    kind: 'occlusion', source_background_version_id: WARPED_ID, ...metadataFor('occlusion', RAW_ID),
  }).error, /source must equal/);
  assert.match(normalizeBackgroundVersionCreate({
    kind: 'warped', parent_version_id: RAW_ID, source_background_version_id: RAW_ID, ...metadataFor('warped'),
    provenance: { ...metadataFor('warped').provenance, outputSha256: '0'.repeat(64) },
  }).error, /must equal the operation output/);
});

test('requires raw inputs to declare an untouched board-world viewing pane', () => {
  const valid = { kind: 'raw', ...base };
  const withOperation = (changes) => ({
    ...valid,
    operation: { ...valid.operation, ...changes },
  });
  const withoutOperation = (key) => {
    const operation = { ...valid.operation };
    delete operation[key];
    return { ...valid, operation };
  };

  assert.equal(rawBackgroundVersionContractIssue(valid), null);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('coordinateBasis')).error, /coordinateBasis/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ coordinateBasis: 'frame-pixels' })).error, /coordinateBasis/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('untouched')).error, /untouched/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ untouched: false })).error, /untouched/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('viewingPane')).error, /viewingPane/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({
    viewingPane: { ...BOUNDS, width: BOUNDS.width + 1 },
  })).error, /exactly equal world_bounds/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({
    viewingPane: { ...BOUNDS, right: BOUNDS.minX + BOUNDS.width },
  })).error, /viewingPane is invalid/);

  // ADR-0158 requires migration rather than a legacy compatibility read at
  // the canonical boundary, so persisted rows receive the same strict check.
  assert.match(rawBackgroundVersionContractIssue({
    kind: 'raw',
    world_bounds: BOUNDS,
    operation: { kind: 'raw-generated-v2', untouched: true },
  }), /coordinateBasis/);
});

test('an external binding repairs only the omitted legacy raw coordinate contract', () => {
  const operation = {
    kind: 'raw-generated-v2',
    untouched: true,
    environmentGeometrySchema: LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
    environmentGeometrySha256: GEOMETRY_SHA256,
  };
  const legacyRaw = {
    id: RAW_ID,
    document_id: 'document-a',
    kind: 'raw',
    label: 'Historical untouched raw',
    parent_version_id: null,
    source_background_version_id: null,
    blob_sha256: base.provenance.sourceSha256,
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    world_bounds: BOUNDS,
    operation,
    provenance: {
      ...base.provenance,
      environmentGeometrySha256: GEOMETRY_SHA256,
    },
    status: 'ready',
  };
  const rawContractBinding = {
    legacy_operation_kind: 'raw-generated-v2',
    legacy_operation_sha256: sha256Canonical(operation),
    coordinate_basis: PREDRAWN_COORDINATE_BASIS,
    viewing_pane: BOUNDS,
  };
  const bound = {
    ...legacyRaw,
    raw_contract_binding: rawContractBinding,
  };

  assert.match(rawBackgroundVersionContractIssue(legacyRaw), /coordinateBasis/);
  assert.equal(rawBackgroundVersionContractBindingIssue(bound), null);
  assert.equal(rawBackgroundVersionContractIssue(bound), null);
  assert.equal(backgroundVersionStoredContractIssue(bound), null);
  assert.equal(Object.hasOwn(operation, 'coordinateBasis'), false);
  assert.equal(Object.hasOwn(operation, 'viewingPane'), false);
  assert.match(normalizeBackgroundVersionCreate({
    kind: 'raw',
    label: legacyRaw.label,
    world_bounds: legacyRaw.world_bounds,
    operation: {
      ...operation,
      environmentGeometrySchema: ENVIRONMENT_GEOMETRY_SCHEMA,
    },
    provenance: legacyRaw.provenance,
  }).error, /coordinateBasis/);

  assert.match(rawBackgroundVersionContractIssue({
    ...bound,
    raw_contract_binding: {
      ...rawContractBinding,
      legacy_operation_sha256: '0'.repeat(64),
    },
  }), /operation digest/);
  assert.match(rawBackgroundVersionContractIssue({
    ...bound,
    raw_contract_binding: {
      ...rawContractBinding,
      viewing_pane: { ...BOUNDS, minX: BOUNDS.minX + 1 },
    },
  }), /viewing pane must exactly equal/);
  assert.match(rawBackgroundVersionContractIssue({
    ...bound,
    operation: {
      ...operation,
      coordinateBasis: PREDRAWN_COORDINATE_BASIS,
    },
  }), /may only repair/);
});

test('accepts historical and shared-mesh warp contracts but rejects crossed pairs', () => {
  const valid = {
    kind: 'warped',
    parent_version_id: RAW_ID,
    source_background_version_id: RAW_ID,
    ...metadataFor('warped'),
  };
  const validMesh = {
    kind: 'warped',
    parent_version_id: RAW_ID,
    source_background_version_id: RAW_ID,
    ...meshWarpMetadata(),
  };
  assert.ok(normalizeBackgroundVersionCreate(valid).value);
  assert.ok(normalizeBackgroundVersionCreate(validMesh).value);
  assert.match(normalizeBackgroundVersionCreate({
    ...valid,
    operation: { ...valid.operation, kind: 'grid-warp-v2' },
    provenance: { ...valid.provenance, processor: 'shared-predrawn-rasterizer-v2' },
  }).error, /operation.kind must be grid-warp-v1/);
  assert.match(normalizeBackgroundVersionCreate({
    ...validMesh,
    operation: { ...validMesh.operation, kind: 'grid-warp-v1' },
    provenance: { ...validMesh.provenance, processor: 'shared-predrawn-rasterizer-v1' },
  }).error, /operation.kind must be grid-warp-v2/);
  assert.match(normalizeBackgroundVersionCreate({
    ...valid,
    provenance: { ...valid.provenance, processor: 'shared-predrawn-rasterizer-v2' },
  }).error, /processor must be shared-predrawn-rasterizer-v1/);
  assert.match(normalizeBackgroundVersionCreate({
    ...validMesh,
    provenance: { ...validMesh.provenance, processor: 'shared-predrawn-rasterizer-v1' },
  }).error, /processor must be shared-predrawn-rasterizer-v2/);
  assert.match(normalizeBackgroundVersionCreate({
    ...valid,
    operation: { ...valid.operation, kind: 'grid-warp-v3' },
  }).error, /operation.kind/);
});

test('rejects missing or unsupported deterministic warp metadata', () => {
  const valid = {
    kind: 'warped',
    parent_version_id: RAW_ID,
    source_background_version_id: RAW_ID,
    ...metadataFor('warped'),
  };
  const withOperation = (changes) => ({
    ...valid,
    operation: { ...valid.operation, ...changes },
  });
  const withoutOperation = (key) => {
    const operation = { ...valid.operation };
    delete operation[key];
    return { ...valid, operation };
  };
  const withProvenance = (changes) => ({
    ...valid,
    provenance: { ...valid.provenance, ...changes },
  });
  const withoutProvenance = (key) => {
    const provenance = { ...valid.provenance };
    delete provenance[key];
    return { ...valid, provenance };
  };

  assert.match(normalizeBackgroundVersionCreate(withoutOperation('registration')).error, /canonical serialized registration/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ registration: 'not-a-registration' })).error, /canonical serialized registration/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ registration: '100,080,50,0,100,40,50,80,0,40' })).error, /canonical serialized registration/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('sourceWidth')).error, /positive integers/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ sourceWidth: 0 })).error, /positive integers/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ sourceHeight: 81 })).error, /registration source dimensions/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('rasterScale')).error, /rasterScale must be 1/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ rasterScale: 0.5 })).error, /rasterScale must be 1/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('encoder')).error, /operation.encoder/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ encoder: 'browser-canvas-png' })).error, /operation.encoder/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('coordinateBasis')).error, /coordinateBasis/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ coordinateBasis: 'frame-pixels' })).error, /coordinateBasis/);
  assert.match(normalizeBackgroundVersionCreate(withoutProvenance('processor')).error, /provenance.processor/);
  assert.match(normalizeBackgroundVersionCreate(withProvenance({ processor: 'unknown-rasterizer' })).error, /provenance.processor/);
  assert.match(normalizeBackgroundVersionCreate(withoutProvenance('parentVersionId')).error, /parentVersionId/);
  assert.match(normalizeBackgroundVersionCreate(withProvenance({ parentVersionId: WARPED_ID })).error, /parentVersionId/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('outputSha256')).error, /outputSha256/);
  assert.match(normalizeBackgroundVersionCreate({
    ...valid,
    source_background_version_id: WARPED_ID,
  }).error, /source_background_version_id must equal/);
});

test('rejects missing or unsupported deterministic occlusion metadata', () => {
  const valid = {
    kind: 'occlusion',
    source_background_version_id: WARPED_ID,
    ...metadataFor('occlusion', WARPED_ID),
  };
  const withOperation = (changes) => ({
    ...valid,
    operation: { ...valid.operation, ...changes },
  });
  const withoutOperation = (key) => {
    const operation = { ...valid.operation };
    delete operation[key];
    return { ...valid, operation };
  };
  const withProvenance = (changes) => ({
    ...valid,
    provenance: { ...valid.provenance, ...changes },
  });
  const withoutProvenance = (key) => {
    const provenance = { ...valid.provenance };
    delete provenance[key];
    return { ...valid, provenance };
  };

  assert.match(normalizeBackgroundVersionCreate(withOperation({ kind: 'occlusion-depth-v2' })).error, /operation.kind/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('encoding')).error, /operation.encoding/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ encoding: 'alpha-only' })).error, /operation.encoding/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('sourceBackgroundVersionId')).error, /operation source/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ sourceBackgroundVersionId: RAW_ID })).error, /operation source/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('maskCount')).error, /nonnegative integer/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ maskCount: -1 })).error, /nonnegative integer/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ maskCount: 1.5 })).error, /nonnegative integer/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('encoder')).error, /operation.encoder/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ encoder: 'browser-canvas-png' })).error, /operation.encoder/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('coordinateBasis')).error, /coordinateBasis/);
  assert.match(normalizeBackgroundVersionCreate(withOperation({ coordinateBasis: 'frame-pixels' })).error, /coordinateBasis/);
  assert.match(normalizeBackgroundVersionCreate(withoutProvenance('processor')).error, /provenance.processor/);
  assert.match(normalizeBackgroundVersionCreate(withProvenance({ processor: 'unknown-mask-generator' })).error, /provenance.processor/);
  assert.match(normalizeBackgroundVersionCreate(withoutProvenance('sourceBackgroundVersionId')).error, /provenance.sourceBackgroundVersionId/);
  assert.match(normalizeBackgroundVersionCreate(withProvenance({ sourceBackgroundVersionId: RAW_ID })).error, /provenance.sourceBackgroundVersionId/);
  assert.match(normalizeBackgroundVersionCreate(withoutOperation('outputSha256')).error, /outputSha256/);
});

test('world bounds are exact finite positive rectangles', () => {
  assert.deepEqual(normalizeWorldBounds(BOUNDS), { value: BOUNDS });
  assert.match(normalizeWorldBounds({ ...BOUNDS, width: 0 }).error, /positive dimensions/);
  assert.match(normalizeWorldBounds({ ...BOUNDS, right: 10 }).error, /unsupported/);
});

test('lineage accepts background transforms and source-compatible mask refinements', () => {
  const rawMetadata = metadataFor('raw');
  const warpedMetadata = metadataFor('warped');
  const maskMetadata = metadataFor('occlusion', WARPED_ID);
  const raw = {
    id: RAW_ID,
    kind: 'raw',
    status: 'ready',
    blob_sha256: 'a'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    world_bounds: BOUNDS,
    operation: rawMetadata.operation,
    provenance: rawMetadata.provenance,
  };
  const warped = {
    id: WARPED_ID,
    kind: 'warped',
    status: 'published',
    blob_sha256: 'b'.repeat(64),
    width: BOUNDS.width,
    height: BOUNDS.height,
    world_bounds: BOUNDS,
    operation: warpedMetadata.operation,
    provenance: warpedMetadata.provenance,
  };
  const priorMask = {
    id: MASK_ID,
    kind: 'occlusion',
    status: 'ready',
    blob_sha256: 'c'.repeat(64),
    width: BOUNDS.width,
    height: BOUNDS.height,
    source_background_version_id: WARPED_ID,
    world_bounds: BOUNDS,
    operation: maskMetadata.operation,
    provenance: maskMetadata.provenance,
  };
  const warpedCandidate = { kind: 'warped', operation: warpedMetadata.operation, provenance: warpedMetadata.provenance };
  const maskCandidate = { kind: 'occlusion', world_bounds: BOUNDS, operation: maskMetadata.operation, provenance: maskMetadata.provenance };
  assert.equal(backgroundVersionLineageIssue(warpedCandidate, raw, null), null);
  assert.equal(backgroundVersionLineageIssue(warpedCandidate, raw, raw), null);
  assert.match(backgroundVersionLineageIssue(warpedCandidate, raw, warped), /must equal/);
  assert.match(backgroundVersionLineageIssue(warpedCandidate, warped, warped), /directly from a raw/);
  assert.match(backgroundVersionLineageIssue(warpedCandidate, { ...raw, width: SOURCE_WIDTH + 1 }, raw), /content dimensions/);
  assert.equal(backgroundVersionLineageIssue(
    maskCandidate,
    priorMask,
    { ...warped, world_bounds: { width: 960, minY: 14, height: 540, minX: -72 } },
  ), null);
  assert.match(backgroundVersionLineageIssue(
    { ...maskCandidate, world_bounds: { ...BOUNDS, width: 1 } }, null, warped,
  ), /world bounds/);
  assert.match(backgroundVersionLineageIssue(
    maskCandidate, { ...priorMask, source_background_version_id: RAW_ID }, warped,
  ), /same source/);
  assert.match(backgroundVersionLineageIssue(maskCandidate, null, { ...warped, width: null }), /dimensions are invalid/);
  assert.match(backgroundVersionLineageIssue(maskCandidate, null, raw), /warped background/);
  assert.match(backgroundVersionLineageIssue(
    maskCandidate,
    { ...priorMask, width: BOUNDS.width - 1 },
    warped,
  ), /refinement dimensions/);
  const staleGeometry = {
    operation: { ...warpedMetadata.operation, environmentGeometrySha256: 'c'.repeat(64) },
    provenance: { ...warpedMetadata.provenance, environmentGeometrySha256: 'c'.repeat(64) },
  };
  assert.match(backgroundVersionLineageIssue({ ...warpedCandidate, ...staleGeometry }, raw, null), /geometry/);
  assert.match(backgroundVersionLineageIssue({ ...maskCandidate, ...staleGeometry }, null, warped), /geometry/);
});

test('v2 derivatives extend a bound immutable v1 parent but never an unbound or differently bound one', () => {
  const rawMetadata = metadataFor('raw');
  const warpedMetadata = metadataFor('warped');
  const maskMetadata = metadataFor('occlusion', WARPED_ID);
  const legacyGeometry = (metadata, v2Sha256 = GEOMETRY_SHA256) => ({
    operation: {
      ...metadata.operation,
      environmentGeometrySchema: LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
    },
    provenance: metadata.provenance,
    environment_geometry_binding: {
      legacy_environment_geometry_schema: LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
      legacy_environment_geometry_sha256: GEOMETRY_SHA256,
      environment_geometry_schema: ENVIRONMENT_GEOMETRY_SCHEMA,
      environment_geometry_sha256: v2Sha256,
    },
  });
  const legacyRaw = {
    id: RAW_ID,
    kind: 'raw',
    status: 'ready',
    blob_sha256: 'a'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    world_bounds: BOUNDS,
    ...legacyGeometry(rawMetadata),
  };
  const warpedCandidate = {
    kind: 'warped',
    operation: warpedMetadata.operation,
    provenance: warpedMetadata.provenance,
  };
  assert.equal(backgroundVersionLineageIssue(warpedCandidate, legacyRaw, legacyRaw), null);
  assert.match(backgroundVersionLineageIssue(
    warpedCandidate,
    { ...legacyRaw, environment_geometry_binding: null },
    null,
  ), /geometry/);
  assert.match(backgroundVersionLineageIssue(
    warpedCandidate,
    { ...legacyRaw, ...legacyGeometry(rawMetadata, '1'.repeat(64)) },
    null,
  ), /geometry/);

  const legacyWarped = {
    id: WARPED_ID,
    kind: 'warped',
    status: 'ready',
    blob_sha256: 'b'.repeat(64),
    width: BOUNDS.width,
    height: BOUNDS.height,
    world_bounds: BOUNDS,
    ...legacyGeometry(warpedMetadata),
  };
  const maskCandidate = {
    kind: 'occlusion',
    world_bounds: BOUNDS,
    operation: maskMetadata.operation,
    provenance: maskMetadata.provenance,
  };
  assert.equal(backgroundVersionLineageIssue(maskCandidate, null, legacyWarped), null);
});

test('stored warped selections validate their exact raw ancestor without reviving it', () => {
  const rawMetadata = metadataFor('raw');
  const warpedMetadata = metadataFor('warped');
  const meshWarpedMetadata = meshWarpMetadata();
  const raw = {
    id: RAW_ID,
    document_id: 'document-a',
    kind: 'raw',
    label: 'Archived immutable raw',
    status: 'archived',
    blob_sha256: 'a'.repeat(64),
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    parent_version_id: null,
    source_background_version_id: null,
    world_bounds: BOUNDS,
    operation: rawMetadata.operation,
    provenance: rawMetadata.provenance,
  };
  const warped = {
    id: WARPED_ID,
    document_id: 'document-a',
    kind: 'warped',
    label: 'Selected warp',
    status: 'ready',
    blob_sha256: 'b'.repeat(64),
    width: BOUNDS.width,
    height: BOUNDS.height,
    parent_version_id: RAW_ID,
    source_background_version_id: RAW_ID,
    world_bounds: BOUNDS,
    operation: warpedMetadata.operation,
    provenance: warpedMetadata.provenance,
  };
  const meshWarped = {
    ...warped,
    label: 'Selected shared-mesh warp',
    operation: meshWarpedMetadata.operation,
    provenance: meshWarpedMetadata.provenance,
  };

  assert.equal(backgroundVersionStoredContractIssue(raw), null);
  assert.equal(backgroundVersionStoredContractIssue(warped, raw, raw), null);
  assert.equal(backgroundVersionStoredContractIssue(meshWarped, raw, raw), null);
  assert.match(backgroundVersionStoredContractIssue({
    ...meshWarped,
    provenance: {
      ...meshWarped.provenance,
      processor: 'shared-predrawn-rasterizer-v1',
    },
  }, raw, raw), /processor must be shared-predrawn-rasterizer-v2/);
  assert.match(backgroundVersionStoredContractIssue(warped, {
    ...raw,
    operation: { ...raw.operation, coordinateBasis: 'frame-pixels' },
  }, raw), /coordinateBasis/);
  assert.match(backgroundVersionStoredContractIssue(
    warped,
    { ...raw, document_id: 'document-b' },
    raw,
  ), /same document/);
  assert.match(backgroundVersionStoredContractIssue({
    ...warped,
    operation: { ...warped.operation, coordinateBasis: 'frame-pixels' },
  }, raw, raw), /coordinateBasis/);
});

test('stored occlusion selections validate their exact source and refinement parent', () => {
  const warpedMetadata = metadataFor('warped');
  const maskMetadata = metadataFor('occlusion', WARPED_ID);
  const background = {
    id: WARPED_ID,
    document_id: 'document-a',
    kind: 'warped',
    label: 'Background',
    status: 'ready',
    blob_sha256: 'b'.repeat(64),
    width: BOUNDS.width,
    height: BOUNDS.height,
    parent_version_id: RAW_ID,
    source_background_version_id: RAW_ID,
    world_bounds: BOUNDS,
    operation: warpedMetadata.operation,
    provenance: warpedMetadata.provenance,
  };
  const grandparent = {
    id: MASK_ID,
    document_id: 'document-a',
    kind: 'occlusion',
    label: 'Archived mask grandparent',
    status: 'archived',
    blob_sha256: 'c'.repeat(64),
    width: BOUNDS.width,
    height: BOUNDS.height,
    parent_version_id: null,
    source_background_version_id: WARPED_ID,
    world_bounds: BOUNDS,
    operation: maskMetadata.operation,
    provenance: maskMetadata.provenance,
  };
  const parent = {
    ...grandparent,
    id: PARENT_MASK_ID,
    label: 'Archived mask parent',
    blob_sha256: 'd'.repeat(64),
    parent_version_id: MASK_ID,
  };
  const selected = {
    ...parent,
    id: REFINED_MASK_ID,
    label: 'Selected mask refinement',
    status: 'ready',
    blob_sha256: 'e'.repeat(64),
    parent_version_id: PARENT_MASK_ID,
  };
  const lineage = new Map([
    [selected.id, selected],
    [parent.id, parent],
    [grandparent.id, grandparent],
  ]);

  assert.equal(backgroundVersionStoredContractIssue(selected, parent, background), null);
  assert.deepEqual(
    backgroundVersionStoredOcclusionChain(selected, lineage, background).value.map((row) => row.id),
    [REFINED_MASK_ID, PARENT_MASK_ID, MASK_ID],
  );
  assert.match(backgroundVersionStoredOcclusionChain(selected, new Map([
    ...lineage,
    [grandparent.id, {
      ...grandparent,
      operation: { ...grandparent.operation, coordinateBasis: 'frame-pixels' },
    }],
  ]), background).error, /coordinateBasis/);
  assert.match(backgroundVersionStoredOcclusionChain(selected, new Map([
    ...lineage,
    [grandparent.id, { ...grandparent, document_id: 'document-b' }],
  ]), background).error, /same document/);
  assert.match(backgroundVersionStoredOcclusionChain(
    selected,
    new Map([...lineage].filter(([id]) => id !== MASK_ID)),
    background,
  ).error, /ancestor .* is missing/);
  assert.match(backgroundVersionStoredOcclusionChain(selected, new Map([
    ...lineage,
    [grandparent.id, { ...grandparent, parent_version_id: REFINED_MASK_ID }],
  ]), background).error, /cycle detected/);
  assert.match(backgroundVersionStoredContractIssue({
    ...selected,
    operation: { ...selected.operation, encoding: 'alpha-only' },
  }, parent, background), /operation.encoding/);
});

test('normalizes only complete versioned pre-drawn Level surfaces', () => {
  assert.deepEqual(normalizePredrawnVersionSurface({
    kind: 'predrawn',
    schemaVersion: 2,
    backgroundVersionId: WARPED_ID,
    occlusionVersionId: MASK_ID,
    frameWidth: 1280,
    frameHeight: 720,
    worldBounds: BOUNDS,
  }).value, {
    background_version_id: WARPED_ID,
    occlusion_version_id: MASK_ID,
    frame_width: 1280,
    frame_height: 720,
    world_bounds: BOUNDS,
  });
  assert.equal(normalizePredrawnVersionSurface({ kind: 'predrawn', slot: 'boards/legacy/plate.png' }), null);
  assert.match(normalizePredrawnVersionSurface({
    kind: 'predrawn', schemaVersion: 2, backgroundVersionId: 'not-a-uuid',
  }).error, /malformed/);

  const profile = normalizeMoveHighlightProfile({
    schema: 'predrawn-move-highlight-profile-v1',
    backgroundVersionId: WARPED_ID,
    coordinateBasis: 'cell-diamond-10000-v1',
    environmentGeometrySha256: GEOMETRY_SHA256,
    cells: {
      '1,1': [5000, 500, 9500, 5000, 5000, 9500, 500, 5000],
    },
  }, { backgroundVersionId: WARPED_ID }).value;
  assert.ok(profile);
  assert.deepEqual(normalizePredrawnVersionSurface({
    kind: 'predrawn',
    schemaVersion: 3,
    backgroundVersionId: WARPED_ID,
    frameWidth: 1280,
    frameHeight: 720,
    worldBounds: BOUNDS,
    moveHighlightProfile: profile,
  }).value, {
    background_version_id: WARPED_ID,
    occlusion_version_id: null,
    frame_width: 1280,
    frame_height: 720,
    world_bounds: BOUNDS,
    move_highlight_profile: profile,
  });
  assert.match(normalizePredrawnVersionSurface({
    kind: 'predrawn',
    schemaVersion: 3,
    backgroundVersionId: RAW_ID,
    frameWidth: 1280,
    frameHeight: 720,
    worldBounds: BOUNDS,
    moveHighlightProfile: profile,
  }).error, /exact warped board geometry/);
});

test('retains pinned raster-selection provenance on an occlusion create contract', () => {
  const metadata = metadataFor('occlusion', WARPED_ID);
  metadata.operation.selection = {
    processor: 'owner-raster-selection-v1',
    alphaSha256: '1'.repeat(64),
    modelId: 'Xenova/slimsam-77-uniform',
    modelRevision: '5850ab45f587c112167512ffef949107115e26a0',
    backend: 'webgpu',
    positivePointCount: 2,
    negativePointCount: 1,
    manualEditCount: 3,
  };
  metadata.operation.depthAssignment = {
    processor: 'screen-column-bottom-envelope-v1',
  };
  metadata.provenance.selectionProcessor = 'owner-raster-selection-v1';
  metadata.provenance.selectionModelId = 'Xenova/slimsam-77-uniform';
  metadata.provenance.selectionModelRevision = '5850ab45f587c112167512ffef949107115e26a0';
  metadata.provenance.selectionBackend = 'webgpu';

  const normalized = normalizeBackgroundVersionCreate({
    kind: 'occlusion',
    attempt_id: ATTEMPT_ID,
    source_background_version_id: WARPED_ID,
    ...metadata,
    edit_session_id: 'f53a2944-95ba-4897-a5db-42df04753ed1',
    edit_session_key: 'private-writer-credential',
    edit_generation: 4,
  });

  assert.equal(normalized.error, undefined);
  assert.deepEqual(normalized.value.operation.selection, metadata.operation.selection);
  assert.deepEqual(normalized.value.operation.depthAssignment, metadata.operation.depthAssignment);
  assert.equal(
    normalized.value.provenance.selectionModelRevision,
    metadata.provenance.selectionModelRevision,
  );
});

test('generation attempt archive distinguishes active AI use from dormant Legacy memory', () => {
  const selected = {
    background_version_id: WARPED_ID,
    occlusion_version_id: MASK_ID,
  };
  assert.deepEqual(
    generationAttemptSelectionDisposition('legacy', selected, [WARPED_ID, MASK_ID]),
    { kind: 'dormant', matched_version_ids: [MASK_ID, WARPED_ID].sort() },
  );
  assert.deepEqual(
    generationAttemptSelectionDisposition('ai', selected, [WARPED_ID]),
    { kind: 'active', matched_version_ids: [WARPED_ID] },
  );
  assert.deepEqual(
    generationAttemptSelectionDisposition('legacy', selected, [RAW_ID]),
    { kind: 'unrelated', matched_version_ids: [] },
  );
  assert.deepEqual(
    generationAttemptSelectionDisposition('unknown', selected, [MASK_ID]),
    { kind: 'invalid', matched_version_ids: [MASK_ID] },
  );
});

test('parses the original Express URL for raw background uploads', () => {
  assert.deepEqual(parseBackgroundVersionUploadPath(
    `/api/editor-documents/legacy-j5kip7ztaipw/background-versions/${RAW_ID}/content?ignored=1`,
  ), {
    documentId: 'legacy-j5kip7ztaipw',
    versionId: RAW_ID,
  });
  assert.equal(parseBackgroundVersionUploadPath('/'), null);
  assert.equal(parseBackgroundVersionUploadPath(
    `/api/editor-documents/bad%ZZ/background-versions/${RAW_ID}/content`,
  ), null);
});
