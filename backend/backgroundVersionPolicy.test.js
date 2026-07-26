'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ENVIRONMENT_GEOMETRY_SCHEMA,
  LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
  backgroundVersionLineageIssue,
  backgroundVersionStoredContractIssue,
  backgroundVersionStoredOcclusionChain,
  backgroundVersionV2GeometrySha256,
  normalizeBackgroundVersionCreate,
  normalizeBackgroundVersionIdempotencyKey,
  normalizePredrawnVersionSurface,
  normalizeWorldBounds,
  parseBackgroundVersionUploadPath,
  rawBackgroundVersionContractIssue,
} = require('./backgroundVersionPolicy');

const RAW_ID = 'f53a2944-95ba-4897-a5db-42df04753ed1';
const WARPED_ID = '39ec915c-cec2-47a7-8111-d5bcaf0b5b38';
const MASK_ID = '2c7c3d23-4913-4671-b7d9-5fddbe564150';
const PARENT_MASK_ID = 'cccf9d08-0ba2-4820-966f-75c31786d832';
const REFINED_MASK_ID = '669186fc-3c1c-4847-a60e-c06d45bfc236';
const BOUNDS = { minX: -72.5, minY: 14, width: 960, height: 540 };
const GEOMETRY_SHA256 = 'd'.repeat(64);
const SOURCE_WIDTH = 100;
const SOURCE_HEIGHT = 80;
const REGISTRATION = '100,80,50,0,100,40,50,80,0,40';
const PREDRAWN_PNG_ENCODER = 'png-rgba8-filter0-stored-deflate-v1';
const PREDRAWN_COORDINATE_BASIS = 'board-world-pixels-v1';
const CLIENT_RAW_IDEMPOTENCY_KEY = `predrawn-raw:${'a'.repeat(64)}:9a5aa8c5-49ab-42b6-b1be-d21f32fbd21b`;
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
      } : {}),
      ...(kind === 'occlusion' ? {
        processor: 'canonical-depth-mask-v1',
        sourceBackgroundVersionId,
      } : {}),
      ...(kind === 'raw' ? {} : { outputSha256: operation.outputSha256 }),
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

  assert.match(normalizeBackgroundVersionCreate(withOperation({ kind: 'grid-warp-v2' })).error, /operation.kind/);
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
    { ...warped, world_bounds: { width: 960, minY: 14, height: 540, minX: -72.5 } },
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

  assert.equal(backgroundVersionStoredContractIssue(raw), null);
  assert.equal(backgroundVersionStoredContractIssue(warped, raw, raw), null);
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
