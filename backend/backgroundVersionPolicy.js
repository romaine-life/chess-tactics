'use strict';

const crypto = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:@+-]{1,200}$/;
const KINDS = new Set(['source', 'raw', 'warped', 'occlusion']);
const SOURCE_STATUSES = new Set(['ready', 'published']);
const LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA = 'predrawn-environment-geometry-v1';
const ENVIRONMENT_GEOMETRY_SCHEMA = 'predrawn-environment-geometry-v2';
const STORED_ENVIRONMENT_GEOMETRY_SCHEMAS = new Set([
  LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
  ENVIRONMENT_GEOMETRY_SCHEMA,
]);
const PREDRAWN_PNG_ENCODER = 'png-rgba8-filter0-stored-deflate-v1';
const PREDRAWN_COORDINATE_BASIS = 'board-world-pixels-v1';
const WARP_PROCESSOR_BY_OPERATION = Object.freeze({
  'grid-warp-v1': 'shared-predrawn-rasterizer-v1',
  'grid-warp-v2': 'shared-predrawn-rasterizer-v2',
});
const OCCLUSION_PROCESSOR = 'canonical-depth-mask-v1';
const LEGACY_SOURCE_SEMANTIC_REQUEST_SCHEMA = 'predrawn-generation-semantic-request-v1';
const SOURCE_SEMANTIC_REQUEST_SCHEMA = 'predrawn-generation-semantic-request-v2';
const GENERATION_REFERENCE_GRID_OVERLAYS = new Set(['none', 'playable']);
const ATTEMPT_SOURCE_REQUEST_SCHEMA = 'predrawn-generation-attempt-source-v1';
const ATTEMPT_PIPELINE_SOURCE_REQUEST_SCHEMA = 'predrawn-processing-attempt-input-v1';
const ATTEMPT_INTAKE_SOURCE_REQUEST_SCHEMA = 'predrawn-ai-artwork-intake-v1';
const MOVE_HIGHLIGHT_PROFILE_SCHEMA = 'predrawn-move-highlight-profile-v1';
const MOVE_HIGHLIGHT_COORDINATE_BASIS = 'cell-diamond-10000-v1';
const DEFAULT_MOVE_HIGHLIGHT_FOOTPRINT = Object.freeze([
  5000, 0,
  10000, 5000,
  5000, 10000,
  0, 5000,
]);
let parsePredrawnBoardRegistration = null;
let serializePredrawnBoardPreviewRegistration = null;
let sharedRendererLoadFailure = null;
try {
  ({
    parsePredrawnBoardRegistration,
    serializePredrawnBoardPreviewRegistration,
  } = require('@chess-tactics/board-render'));
} catch (error) {
  // Keep unrelated backend routes available if the shared renderer is absent,
  // but fail closed below rather than accepting an unvalidated warp recipe.
  // Remember why it is absent: swallowing the reason is what let a missing
  // build artifact masquerade as invalid caller data (see the probe below).
  sharedRendererLoadFailure = error;
}

// The shared renderer owns the only canonical registration grammar, and this
// module reaches it through the package's `require` condition — the bundled
// `packages/board-render/dist/index.cjs`, which is a gitignored build artifact.
// A checkout that has never run that build loads this policy with no parser at
// all, in which case EVERY registration looks unparseable.
//
// That is a build fault, not a caller's bad data, and the two must never share
// an error string. Reporting it as a rejected registration turns one missing
// artifact into a fleet of phantom "invalid registration" failures that read
// exactly like a serializer bug and send the reader hunting for a divergence
// that does not exist. Fail closed, but say which of the two actually happened.
function predrawnRegistrationSupportIssue() {
  if (
    typeof parsePredrawnBoardRegistration === 'function'
    && typeof serializePredrawnBoardPreviewRegistration === 'function'
  ) return null;
  const reason = sharedRendererLoadFailure
    ? sharedRendererLoadFailure.message
    : '@chess-tactics/board-render exported no registration grammar';
  return 'the shared board renderer is unavailable, so warp registrations cannot be validated'
    + ` — build it with \`npm run build:board-render\` (${reason})`;
}
const CREATE_KEYS = new Set([
  'kind', 'label',
  'parent_version_id', 'parentVersionId',
  'source_background_version_id', 'sourceBackgroundVersionId',
  'attempt_id', 'attemptId',
  'world_bounds', 'worldBounds',
  'operation', 'provenance',
  'idempotency_key', 'idempotencyKey',
  // These authorize the enclosing editor mutation. They are intentionally not
  // persisted in version metadata or included in the idempotency fingerprint.
  'edit_session_id', 'edit_session_key', 'edit_generation',
]);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObjectRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizedUuid(value) {
  const id = String(value || '').trim().toLowerCase();
  return UUID.test(id) ? id : null;
}

function normalizeBackgroundVersionIdempotencyKey(value) {
  const key = String(value ?? '').trim();
  return IDEMPOTENCY_KEY.test(key) ? key : null;
}

function parseBackgroundVersionUploadPath(value) {
  const pathOnly = String(value || '').split('?', 1)[0];
  const match = /^\/api\/editor-documents\/([^/]+)\/background-versions\/([0-9a-f-]+)\/content$/i.exec(pathOnly);
  if (!match) return null;
  let documentId;
  try { documentId = decodeURIComponent(match[1]); } catch { return null; }
  const versionId = normalizedUuid(match[2]);
  return documentId && versionId ? { documentId, versionId } : null;
}

function sameWorldBounds(left, right) {
  return isObjectRecord(left) && isObjectRecord(right)
    && left.minX === right.minX && left.minY === right.minY
    && left.width === right.width && left.height === right.height;
}

function sameEnvironmentGeometry(left, right) {
  const leftGeometry = backgroundVersionEnvironmentGeometry(left);
  const rightGeometry = backgroundVersionEnvironmentGeometry(right);
  if (!leftGeometry || !rightGeometry) return false;
  const leftV2 = backgroundVersionV2GeometrySha256(left);
  const rightV2 = backgroundVersionV2GeometrySha256(right);
  if (leftV2 && rightV2) return leftV2 === rightV2;
  // Before the first migration boundary, an entirely legacy stored lineage is
  // still internally valid when all immutable v1 metadata agrees. It cannot be
  // extended by a v2 child until the external v2 binding is established.
  return leftGeometry.schema === LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA
    && rightGeometry.schema === LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA
    && leftGeometry.sha256 === rightGeometry.sha256;
}

function backgroundVersionEnvironmentGeometry(row) {
  const schema = row?.operation?.environmentGeometrySchema;
  const sha256 = row?.operation?.environmentGeometrySha256;
  if (
    !STORED_ENVIRONMENT_GEOMETRY_SCHEMAS.has(schema)
    || !SHA256.test(sha256 || '')
    || row?.provenance?.environmentGeometrySha256 !== sha256
  ) return null;
  return { schema, sha256 };
}

function backgroundVersionV2GeometrySha256(row) {
  const geometry = backgroundVersionEnvironmentGeometry(row);
  if (!geometry) return null;
  if (geometry.schema === ENVIRONMENT_GEOMETRY_SCHEMA) return geometry.sha256;
  const binding = row?.environment_geometry_binding;
  return binding?.legacy_environment_geometry_schema === LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA
    && binding?.legacy_environment_geometry_sha256 === geometry.sha256
    && binding?.environment_geometry_schema === ENVIRONMENT_GEOMETRY_SCHEMA
    && SHA256.test(binding?.environment_geometry_sha256 || '')
    ? binding.environment_geometry_sha256
    : null;
}

function jsonValueIssue(value, label, {
  allowEmpty = false,
  maxBytes = 64 * 1024,
  maxDepth = 8,
} = {}) {
  if (!isObjectRecord(value)) return `${label} must be an object`;
  if (!allowEmpty && Object.keys(value).length === 0) return `${label} must not be empty`;
  let encoded;
  try { encoded = JSON.stringify(value); } catch { return `${label} must be JSON serializable`; }
  if (!encoded || Buffer.byteLength(encoded, 'utf8') > maxBytes) return `${label} exceeds its size limit`;

  const visit = (entry, depth) => {
    if (depth > maxDepth) return `${label} exceeds its nesting limit`;
    if (entry === null || typeof entry === 'boolean' || typeof entry === 'string') return null;
    if (typeof entry === 'number') return Number.isFinite(entry) ? null : `${label} contains a non-finite number`;
    if (Array.isArray(entry)) {
      if (entry.length > 4096) return `${label} contains an oversized array`;
      for (const child of entry) {
        const issue = visit(child, depth + 1);
        if (issue) return issue;
      }
      return null;
    }
    if (!isObjectRecord(entry)) return `${label} contains a non-JSON value`;
    const keys = Object.keys(entry);
    if (keys.length > 4096 || keys.some((key) => !key || key.length > 200)) {
      return `${label} contains invalid object keys`;
    }
    for (const child of Object.values(entry)) {
      const issue = visit(child, depth + 1);
      if (issue) return issue;
    }
    return null;
  };
  return visit(value, 0);
}

function normalizeWorldBounds(value) {
  if (!isObjectRecord(value)) return { error: 'world_bounds must be an object' };
  const allowed = new Set(['minX', 'minY', 'width', 'height']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { error: 'world_bounds contains unsupported fields' };
  }
  const result = {
    minX: value.minX,
    minY: value.minY,
    width: value.width,
    height: value.height,
  };
  if (
    !Number.isFinite(result.minX) || !Number.isFinite(result.minY)
    || !Number.isFinite(result.width) || !Number.isFinite(result.height)
    || Math.abs(result.minX) > 10_000_000 || Math.abs(result.minY) > 10_000_000
    || result.width <= 0 || result.height <= 0
    || result.width > 10_000_000 || result.height > 10_000_000
  ) return { error: 'world_bounds must contain finite, positive dimensions in range' };
  return { value: result };
}

function normalizedMoveHighlightNumber(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10000) {
    return null;
  }
  return value;
}

function sameNumberArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeMoveHighlightFootprint(value) {
  if (!Array.isArray(value) || value.length !== 8) {
    return { error: 'each move-highlight footprint must contain four x/y points' };
  }
  const normalized = value.map(normalizedMoveHighlightNumber);
  if (normalized.some((entry) => entry === null)) {
    return { error: 'move-highlight footprint coordinates must be integer units from 0 through 10000' };
  }
  const [
    topX, topY,
    rightX, rightY,
    bottomX, bottomY,
    leftX, leftY,
  ] = normalized;
  if (topY > 5000 || rightX < 5000 || bottomY < 5000 || leftX > 5000) {
    return { error: 'move-highlight footprint points must stay on their named side of the canonical cell' };
  }
  const points = [
    [topX, topY],
    [rightX, rightY],
    [bottomX, bottomY],
    [leftX, leftY],
  ];
  if (points.some(([x, y]) => Math.abs(x - 5000) + Math.abs(y - 5000) > 5000)) {
    return { error: 'move-highlight footprint points must stay inside the canonical cell diamond' };
  }
  let doubledArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    doubledArea += point[0] * next[1] - point[1] * next[0];
    const after = points[(index + 2) % points.length];
    const edgeX = next[0] - point[0];
    const edgeY = next[1] - point[1];
    const nextEdgeX = after[0] - next[0];
    const nextEdgeY = after[1] - next[1];
    if (edgeX * nextEdgeY - edgeY * nextEdgeX <= 10000) {
      return { error: 'move-highlight footprints must remain strictly convex and non-folded' };
    }
  }
  if (doubledArea < 2_000_000) {
    return { error: 'move-highlight footprints must retain a visible area' };
  }
  return { value: normalized };
}

function normalizeMoveHighlightCells(value, columns, rows, playableCellKeys) {
  if (!isObjectRecord(value)) return { error: 'move-highlight profile cells must be an object' };
  const entries = Object.entries(value);
  if (entries.length > Math.min(4096, columns * rows)) {
    return { error: 'move-highlight profile contains too many cell overrides' };
  }
  const cells = {};
  // Code-unit order, not localeCompare: collation depends on the host's default
  // locale and on the ICU build shipped with the running Node, so it is not a
  // stable basis for anything a canonical contract observes.
  for (const [key, footprint] of entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
    const match = /^(\d{1,2}),(\d{1,2})$/.exec(key);
    const x = match ? Number(match[1]) : -1;
    const y = match ? Number(match[2]) : -1;
    if (
      !match
      || x >= columns
      || y >= rows
      || (playableCellKeys && !playableCellKeys.has(key))
    ) {
      return { error: `move-highlight profile cell ${key} is outside its bound board` };
    }
    const normalized = normalizeMoveHighlightFootprint(footprint);
    if (normalized.error) return { error: `${key}: ${normalized.error}` };
    if (!sameNumberArray(normalized.value, DEFAULT_MOVE_HIGHLIGHT_FOOTPRINT)) {
      cells[key] = normalized.value;
    }
  }
  return { value: cells };
}

function moveHighlightProfileUnsignedValue(value) {
  return {
    schema: value.schema,
    backgroundVersionId: value.backgroundVersionId,
    coordinateBasis: value.coordinateBasis,
    environmentGeometrySha256: value.environmentGeometrySha256,
    cells: value.cells,
  };
}

function moveHighlightProfileSha256(value) {
  return sha256Text(canonicalJson(moveHighlightProfileUnsignedValue(value)));
}

function normalizeMoveHighlightProfile(value, expected = {}) {
  if (!isObjectRecord(value)) return { error: 'move-highlight profile must be an object' };
  const allowed = new Set([
    'schema',
    'backgroundVersionId',
    'coordinateBasis',
    'environmentGeometrySha256',
    'cells',
    'profileSha256',
  ]);
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return { error: `move-highlight profile contains unsupported fields: ${unsupported.sort().join(', ')}` };
  }
  const backgroundVersionId = normalizedUuid(value.backgroundVersionId);
  const boardColumns = expected.boardColumns ?? 64;
  const boardRows = expected.boardRows ?? 64;
  if (
    value.schema !== MOVE_HIGHLIGHT_PROFILE_SCHEMA
    || value.coordinateBasis !== MOVE_HIGHLIGHT_COORDINATE_BASIS
    || !backgroundVersionId
    || !Number.isSafeInteger(boardColumns)
    || !Number.isSafeInteger(boardRows)
    || boardColumns < 1
    || boardColumns > 64
    || boardRows < 1
    || boardRows > 64
    || !SHA256.test(value.environmentGeometrySha256 || '')
  ) {
    return { error: 'move-highlight profile metadata is malformed' };
  }
  if (
    (expected.backgroundVersionId && backgroundVersionId !== expected.backgroundVersionId)
    || (expected.boardColumns && boardColumns !== expected.boardColumns)
    || (expected.boardRows && boardRows !== expected.boardRows)
    || (
      expected.environmentGeometrySha256
      && value.environmentGeometrySha256 !== expected.environmentGeometrySha256
    )
  ) {
    return { error: 'move-highlight profile does not match its exact warped board geometry' };
  }
  const cells = normalizeMoveHighlightCells(
    value.cells,
    boardColumns,
    boardRows,
    expected.playableCellKeys,
  );
  if (cells.error) return cells;
  const normalized = {
    schema: MOVE_HIGHLIGHT_PROFILE_SCHEMA,
    backgroundVersionId,
    coordinateBasis: MOVE_HIGHLIGHT_COORDINATE_BASIS,
    environmentGeometrySha256: value.environmentGeometrySha256,
    cells: cells.value,
  };
  const sha256 = moveHighlightProfileSha256(normalized);
  if (value.profileSha256 !== undefined && value.profileSha256 !== sha256) {
    return { error: 'move-highlight profile digest does not match its canonical content' };
  }
  return { value: { ...normalized, profileSha256: sha256 } };
}

function optionalUuid(raw, snakeKey, camelKey) {
  const supplied = raw[snakeKey] ?? raw[camelKey];
  if (supplied === undefined || supplied === null || supplied === '') return { value: null };
  const id = normalizedUuid(supplied);
  return id ? { value: id } : { error: `${snakeKey} must be a UUID` };
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function canonicalPredrawnRegistration(value) {
  if (
    typeof value !== 'string'
    || typeof parsePredrawnBoardRegistration !== 'function'
    || typeof serializePredrawnBoardPreviewRegistration !== 'function'
  ) return null;
  try {
    const parsed = parsePredrawnBoardRegistration(value);
    if (!parsed || serializePredrawnBoardPreviewRegistration(parsed) !== value) return null;
    return parsed;
  } catch {
    return null;
  }
}

function rawBackgroundVersionContractBindingIssue(candidate) {
  const binding = candidate?.raw_contract_binding;
  if (!isObjectRecord(binding)) return 'raw contract binding must be an object';
  if (!isObjectRecord(candidate?.operation)) return 'raw operation must be an object';
  if (
    Object.hasOwn(candidate.operation, 'coordinateBasis')
    || Object.hasOwn(candidate.operation, 'viewingPane')
  ) {
    return 'raw contract binding may only repair an operation missing coordinateBasis and viewingPane';
  }
  if (
    binding.legacy_operation_kind !== 'raw-generated-v2'
    || binding.legacy_operation_kind !== candidate.operation.kind
  ) {
    return 'raw contract binding operation kind does not match the immutable raw operation';
  }
  if (
    !SHA256.test(binding.legacy_operation_sha256 || '')
    || binding.legacy_operation_sha256 !== sha256Text(canonicalJson(candidate.operation))
  ) {
    return 'raw contract binding operation digest does not match the immutable raw operation';
  }
  if (binding.coordinate_basis !== PREDRAWN_COORDINATE_BASIS) {
    return `raw contract binding coordinate basis must be ${PREDRAWN_COORDINATE_BASIS}`;
  }
  const bounds = normalizeWorldBounds(candidate.world_bounds);
  if (bounds.error) return bounds.error;
  const viewingPane = normalizeWorldBounds(binding.viewing_pane);
  if (viewingPane.error) {
    return `raw contract binding viewing pane is invalid: ${viewingPane.error}`;
  }
  if (!sameWorldBounds(viewingPane.value, bounds.value)) {
    return 'raw contract binding viewing pane must exactly equal world_bounds';
  }
  return null;
}

function effectiveRawOperation(candidate) {
  if (!candidate?.raw_contract_binding) return { operation: candidate?.operation };
  const bindingIssue = rawBackgroundVersionContractBindingIssue(candidate);
  if (bindingIssue) return { error: bindingIssue };
  return {
    operation: {
      ...candidate.operation,
      coordinateBasis: candidate.raw_contract_binding.coordinate_basis,
      viewingPane: candidate.raw_contract_binding.viewing_pane,
    },
  };
}

function rawBackgroundVersionContractIssue(candidate) {
  if (!candidate || candidate.kind !== 'raw') return 'background version must be raw';
  const resolved = effectiveRawOperation(candidate);
  if (resolved.error) return `raw contract binding is invalid: ${resolved.error}`;
  const operation = resolved.operation;
  if (!isObjectRecord(operation)) return 'raw operation must be an object';
  if (operation.coordinateBasis !== PREDRAWN_COORDINATE_BASIS) {
    return `raw operation.coordinateBasis must be ${PREDRAWN_COORDINATE_BASIS}`;
  }
  if (operation.untouched !== true) return 'raw operation.untouched must be true';

  const bounds = normalizeWorldBounds(candidate.world_bounds);
  if (bounds.error) return bounds.error;
  const viewingPane = normalizeWorldBounds(operation.viewingPane);
  if (viewingPane.error) {
    return `raw operation.viewingPane is invalid: ${viewingPane.error}`;
  }
  if (!sameWorldBounds(viewingPane.value, bounds.value)) {
    return 'raw operation.viewingPane must exactly equal world_bounds';
  }
  return null;
}

function sourceSnapshotFieldsForOperation(operation) {
  if (operation?.kind === 'generation-source-v2') {
    return {
      schema: SOURCE_SEMANTIC_REQUEST_SCHEMA,
      revisionKey: 'workingCopyDocumentRevision',
      levelSha256Key: 'workingCopyLevelSha256',
      label: 'working-copy',
    };
  }
  if (operation?.kind === 'generation-source-v1') {
    return {
      schema: LEGACY_SOURCE_SEMANTIC_REQUEST_SCHEMA,
      revisionKey: 'canonicalDocumentRevision',
      levelSha256Key: 'canonicalLevelSha256',
      label: 'canonical',
    };
  }
  return null;
}

function sourceSnapshotFieldsForSemanticRequest(request) {
  if (request?.schema === SOURCE_SEMANTIC_REQUEST_SCHEMA) {
    return {
      revisionKey: 'workingCopyDocumentRevision',
      levelSha256Key: 'workingCopyLevelSha256',
    };
  }
  if (request?.schema === LEGACY_SOURCE_SEMANTIC_REQUEST_SCHEMA) {
    return {
      revisionKey: 'canonicalDocumentRevision',
      levelSha256Key: 'canonicalLevelSha256',
    };
  }
  return null;
}

function sourceArtworkVersionContractIssue(candidate) {
  if (!candidate || candidate.kind !== 'source') return 'background version must be a Generation Reference';
  const operation = candidate.operation;
  const provenance = candidate.provenance;
  if (!isObjectRecord(operation)) return 'source operation must be an object';
  if (!isObjectRecord(provenance)) return 'source provenance must be an object';
  const snapshotFields = sourceSnapshotFieldsForOperation(operation);
  if (!snapshotFields) return 'source operation.kind must be generation-source-v1 or generation-source-v2';
  if (operation.coordinateBasis !== PREDRAWN_COORDINATE_BASIS) {
    return `source operation.coordinateBasis must be ${PREDRAWN_COORDINATE_BASIS}`;
  }
  if (operation.backgroundMode !== 'legacy' && operation.backgroundMode !== 'ai') {
    return 'source operation.backgroundMode must be legacy or ai';
  }
  if (!SHA256.test(operation[snapshotFields.levelSha256Key] || '')) {
    return `source operation.${snapshotFields.levelSha256Key} must be a lowercase SHA-256 digest`;
  }
  if (provenance[snapshotFields.levelSha256Key] !== operation[snapshotFields.levelSha256Key]) {
    return `source provenance.${snapshotFields.levelSha256Key} must equal the operation ${snapshotFields.label} Level digest`;
  }
  if (provenance.backgroundMode !== operation.backgroundMode) {
    return 'source provenance.backgroundMode must equal operation.backgroundMode';
  }
  const gridOverlay = operation.gridOverlay ?? 'none';
  if (!GENERATION_REFERENCE_GRID_OVERLAYS.has(gridOverlay)) {
    return 'source operation.gridOverlay must be none or playable';
  }
  if ((provenance.gridOverlay ?? 'none') !== gridOverlay) {
    return 'source provenance.gridOverlay must equal operation.gridOverlay';
  }
  if (operation.environmentGeometrySchema !== ENVIRONMENT_GEOMETRY_SCHEMA) {
    return `source operation.environmentGeometrySchema must be ${ENVIRONMENT_GEOMETRY_SCHEMA}`;
  }
  if (!SHA256.test(operation.environmentGeometrySha256 || '')) {
    return 'source operation.environmentGeometrySha256 must be a lowercase SHA-256 digest';
  }
  if (provenance.environmentGeometrySha256 !== operation.environmentGeometrySha256) {
    return 'source provenance.environmentGeometrySha256 must equal the operation geometry digest';
  }
  if (
    !Number.isSafeInteger(operation[snapshotFields.revisionKey])
    || operation[snapshotFields.revisionKey] < 1
  ) {
    return `source operation.${snapshotFields.revisionKey} must be a positive document revision`;
  }
  if (provenance[snapshotFields.revisionKey] !== operation[snapshotFields.revisionKey]) {
    return `source provenance.${snapshotFields.revisionKey} must equal the operation`;
  }

  const bounds = normalizeWorldBounds(candidate.world_bounds);
  if (bounds.error) return bounds.error;
  const viewingPane = normalizeWorldBounds(operation.viewingPane);
  if (viewingPane.error) {
    return `source operation.viewingPane is invalid: ${viewingPane.error}`;
  }
  if (!sameWorldBounds(viewingPane.value, bounds.value)) {
    return 'source operation.viewingPane must exactly equal world_bounds';
  }
  const frame = operation.generationFrame;
  if (
    !isObjectRecord(frame)
    || !Number.isSafeInteger(frame.version) || frame.version < 1
    || !Number.isSafeInteger(frame.x) || !Number.isSafeInteger(frame.y)
    || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height)
    || frame.width <= 0 || frame.height <= 0
    || frame.width > 8192 || frame.height > 8192
    || frame.width * 9 !== frame.height * 16
    || frame.x !== bounds.value.minX || frame.y !== bounds.value.minY
    || frame.width !== bounds.value.width || frame.height !== bounds.value.height
  ) {
    return 'source operation.generationFrame must exactly describe world_bounds';
  }
  if (
    !isObjectRecord(provenance.generationFrame)
    || provenance.generationFrame.version !== frame.version
    || provenance.generationFrame.x !== frame.x
    || provenance.generationFrame.y !== frame.y
    || provenance.generationFrame.width !== frame.width
    || provenance.generationFrame.height !== frame.height
  ) {
    return 'source provenance.generationFrame must equal operation.generationFrame';
  }

  const sourceBackgroundVersionId = operation.sourceBackgroundVersionId ?? null;
  const sourceOcclusionVersionId = operation.sourceOcclusionVersionId ?? null;
  if (
    (sourceBackgroundVersionId !== null && !normalizedUuid(sourceBackgroundVersionId))
    || (sourceOcclusionVersionId !== null && !normalizedUuid(sourceOcclusionVersionId))
  ) {
    return 'source operation selected artwork ids must be UUIDs or null';
  }
  if (operation.backgroundMode === 'ai' && !sourceBackgroundVersionId) {
    return 'an AI source requires sourceBackgroundVersionId';
  }
  if (operation.backgroundMode === 'legacy' && (sourceBackgroundVersionId || sourceOcclusionVersionId)) {
    return 'a legacy source cannot name active AI artwork';
  }
  if (
    (provenance.sourceBackgroundVersionId ?? null) !== sourceBackgroundVersionId
    || (provenance.sourceOcclusionVersionId ?? null) !== sourceOcclusionVersionId
  ) {
    return 'source provenance selected artwork ids must equal the operation';
  }

  const semanticRequest = operation.semanticRequest;
  if (!isObjectRecord(semanticRequest) || semanticRequest.schema !== snapshotFields.schema) {
    return `source operation.semanticRequest.schema must be ${snapshotFields.schema}`;
  }
  if (
    typeof semanticRequest.levelId !== 'string'
    || !semanticRequest.levelId
    || (candidate.level_id !== undefined && semanticRequest.levelId !== candidate.level_id)
  ) {
    return 'source semantic request levelId must equal the source Level';
  }
  if (
    typeof semanticRequest.boardCode !== 'string'
    || semanticRequest.boardCode.length < 1
    || Buffer.byteLength(semanticRequest.boardCode, 'utf8') > 512 * 1024
  ) {
    return 'source semantic request boardCode must be a bounded immutable board snapshot';
  }
  const semanticBoardSha256 = sha256Text(semanticRequest.boardCode);
  if (
    !SHA256.test(semanticRequest.boardSha256 || '')
    || semanticRequest.boardSha256 !== semanticBoardSha256
    || operation.semanticBoardSha256 !== semanticBoardSha256
    || provenance.semanticBoardSha256 !== semanticBoardSha256
  ) {
    return 'source semantic board snapshot digest is invalid';
  }
  if (
    semanticRequest[snapshotFields.revisionKey] !== operation[snapshotFields.revisionKey]
    || semanticRequest[snapshotFields.levelSha256Key] !== operation[snapshotFields.levelSha256Key]
    || semanticRequest.backgroundMode !== operation.backgroundMode
    || (semanticRequest.sourceBackgroundVersionId ?? null) !== sourceBackgroundVersionId
    || (semanticRequest.sourceOcclusionVersionId ?? null) !== sourceOcclusionVersionId
    || semanticRequest.environmentGeometrySchema !== operation.environmentGeometrySchema
    || semanticRequest.environmentGeometrySha256 !== operation.environmentGeometrySha256
    || (semanticRequest.gridOverlay ?? 'none') !== gridOverlay
    || !sameWorldBounds(semanticRequest.worldBounds, bounds.value)
    || canonicalJson(semanticRequest.generationFrame) !== canonicalJson(frame)
  ) {
    return `source semantic request must exactly bind its ${snapshotFields.label} revision, frame, bounds, and geometry`;
  }
  const semanticRequestSha256 = sha256Text(canonicalJson(semanticRequest));
  if (
    operation.semanticRequestSha256 !== semanticRequestSha256
    || provenance.semanticRequestSha256 !== semanticRequestSha256
  ) {
    return 'source semantic request digest is invalid';
  }
  return null;
}

function generationAttemptSourceRequestIssue(attempt, sourceArtwork) {
  if (!isObjectRecord(attempt)) return 'generation attempt was not found';
  if (!isObjectRecord(sourceArtwork)) return 'the pipeline slot’s input artwork was not found';
  const request = attempt.source_request;
  const intakeBinding = request?.schema === ATTEMPT_INTAKE_SOURCE_REQUEST_SCHEMA;
  const pipelineSourceBinding = request?.schema === ATTEMPT_PIPELINE_SOURCE_REQUEST_SCHEMA;
  if (pipelineSourceBinding || intakeBinding) {
    if (
      sourceArtwork.kind !== 'raw'
      || !sourceArtwork.blob_sha256
      || !SOURCE_STATUSES.has(sourceArtwork.status)
    ) {
      return 'the processing attempt’s Raw Pipeline Source is not ready';
    }
    const rawIssue = rawBackgroundVersionContractIssue(sourceArtwork);
    if (rawIssue) {
      return `the processing attempt’s Raw Pipeline Source is invalid: ${rawIssue}`;
    }
    if (
      !isObjectRecord(request)
      || (
        pipelineSourceBinding
          ? attempt.origin !== 'pipeline-source'
            || request.inputRole !== 'raw-pipeline-source'
            || request.sourceAttemptId !== String(attempt.source_attempt_id || '')
          : attempt.origin !== 'source'
            || request.inputRole !== 'raw-ai-artwork'
            || attempt.source_attempt_id !== null
            || String(attempt.generated_version_id || '') !== String(sourceArtwork.id)
      )
    ) {
      return 'processing attempt has no immutable raw artwork request';
    }
    if (
      request.inputVersionId !== String(sourceArtwork.id)
      || request.inputSha256 !== sourceArtwork.blob_sha256
    ) {
      return 'the processing attempt does not exactly match its raw artwork input';
    }
    const semanticRequest = request.semanticRequest;
    const semanticSnapshotFields = sourceSnapshotFieldsForSemanticRequest(semanticRequest);
    const bounds = normalizeWorldBounds(sourceArtwork.world_bounds);
    const frame = semanticRequest?.generationFrame;
    if (
      !isObjectRecord(semanticRequest)
      || !semanticSnapshotFields
      || semanticRequest.levelId !== attempt.level_id
      || !Number.isSafeInteger(semanticRequest[semanticSnapshotFields?.revisionKey])
      || semanticRequest[semanticSnapshotFields?.revisionKey] < 1
      || !SHA256.test(semanticRequest[semanticSnapshotFields?.levelSha256Key] || '')
      || typeof semanticRequest.boardCode !== 'string'
      || semanticRequest.boardCode.length < 1
      || Buffer.byteLength(semanticRequest.boardCode, 'utf8') > 512 * 1024
      || !SHA256.test(semanticRequest.boardSha256 || '')
      || semanticRequest.boardSha256 !== sha256Text(semanticRequest.boardCode)
      || !isObjectRecord(frame)
      || !Number.isSafeInteger(frame.version) || frame.version < 1
      || !Number.isSafeInteger(frame.x) || !Number.isSafeInteger(frame.y)
      || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height)
      || frame.width <= 0 || frame.height <= 0
      || frame.width * 9 !== frame.height * 16
      || bounds.error
      || frame.x !== bounds.value.minX || frame.y !== bounds.value.minY
      || frame.width !== bounds.value.width || frame.height !== bounds.value.height
      || !sameWorldBounds(semanticRequest.worldBounds, bounds.value)
      || semanticRequest.environmentGeometrySchema !== ENVIRONMENT_GEOMETRY_SCHEMA
      || semanticRequest.environmentGeometrySha256 !== backgroundVersionV2GeometrySha256(sourceArtwork)
    ) {
      return 'the raw artwork request has an invalid canonical semantic snapshot';
    }
    const semanticRequestSha256 = sha256Text(canonicalJson(semanticRequest));
    if (
      request.semanticRequestSha256 !== semanticRequestSha256
      || !SHA256.test(request.semanticRequestSha256 || '')
    ) {
      return 'the raw artwork semantic request digest is invalid';
    }
    const requestWithoutDigest = { ...request };
    delete requestWithoutDigest.requestSha256;
    const requestSha256 = sha256Text(canonicalJson(requestWithoutDigest));
    if (!SHA256.test(request.requestSha256 || '') || request.requestSha256 !== requestSha256) {
      return 'processing attempt raw artwork request digest is invalid';
    }
    return null;
  }
  const sourceIssue = sourceArtworkVersionContractIssue(sourceArtwork);
  if (sourceIssue) return `the pipeline slot’s Generation Reference is invalid: ${sourceIssue}`;
  if (!isObjectRecord(request) || request.schema !== ATTEMPT_SOURCE_REQUEST_SCHEMA) {
    return 'generation attempt has no immutable source request';
  }
  if (
    request.sourceArtworkVersionId !== String(sourceArtwork.id)
    || request.sourceArtworkSha256 !== sourceArtwork.blob_sha256
    || request.semanticRequestSha256 !== sourceArtwork.operation.semanticRequestSha256
    || canonicalJson(request.semanticRequest) !== canonicalJson(sourceArtwork.operation.semanticRequest)
  ) {
    return 'the pipeline slot request does not exactly match its immutable Generation Reference';
  }
  const requestWithoutDigest = { ...request };
  delete requestWithoutDigest.requestSha256;
  const requestSha256 = sha256Text(canonicalJson(requestWithoutDigest));
  if (!SHA256.test(request.requestSha256 || '') || request.requestSha256 !== requestSha256) {
    return 'generation attempt source request digest is invalid';
  }
  return null;
}

function derivativeOperationIssue(kind, operation, provenance, parentVersionId, sourceVersionId) {
  if (kind === 'warped') {
    const supportIssue = predrawnRegistrationSupportIssue();
    if (supportIssue) return supportIssue;
    const registration = canonicalPredrawnRegistration(operation.registration);
    if (!registration) {
      return 'warped operation.registration must be a valid canonical serialized registration';
    }
    const expectedOperationKind = registration.meshOverrides?.length
      ? 'grid-warp-v2'
      : 'grid-warp-v1';
    if (operation.kind !== expectedOperationKind) {
      return `warped operation.kind must be ${expectedOperationKind} for this registration`;
    }
    if (!positiveSafeInteger(operation.sourceWidth) || !positiveSafeInteger(operation.sourceHeight)) {
      return 'warped operation source dimensions must be positive integers';
    }
    if (
      operation.sourceWidth !== registration.sourceWidth
      || operation.sourceHeight !== registration.sourceHeight
    ) {
      return 'warped operation source dimensions must equal the registration source dimensions';
    }
    if (operation.rasterScale !== 1) return 'warped operation.rasterScale must be 1';
    if (operation.encoder !== PREDRAWN_PNG_ENCODER) {
      return `warped operation.encoder must be ${PREDRAWN_PNG_ENCODER}`;
    }
    if (operation.coordinateBasis !== PREDRAWN_COORDINATE_BASIS) {
      return `warped operation.coordinateBasis must be ${PREDRAWN_COORDINATE_BASIS}`;
    }
    const expectedProcessor = WARP_PROCESSOR_BY_OPERATION[expectedOperationKind];
    if (provenance.processor !== expectedProcessor) {
      return `warped provenance.processor must be ${expectedProcessor} for ${expectedOperationKind}`;
    }
    if (provenance.parentVersionId !== parentVersionId) {
      return 'warped provenance.parentVersionId must equal parent_version_id';
    }
    if (!sourceVersionId || sourceVersionId !== parentVersionId) {
      return 'warped source_background_version_id must equal parent_version_id';
    }
    return null;
  }
  if (kind !== 'occlusion') return null;
  if (operation.encoding !== 'rgb24-signed-half-depth-alpha') {
    return 'occlusion operation.encoding must be rgb24-signed-half-depth-alpha';
  }
  if (operation.sourceBackgroundVersionId !== sourceVersionId) {
    return 'occlusion operation source must equal source_background_version_id';
  }
  if (!Number.isSafeInteger(operation.maskCount) || operation.maskCount < 0) {
    return 'occlusion operation.maskCount must be a nonnegative integer';
  }
  if (operation.encoder !== PREDRAWN_PNG_ENCODER) {
    return `occlusion operation.encoder must be ${PREDRAWN_PNG_ENCODER}`;
  }
  if (operation.coordinateBasis !== PREDRAWN_COORDINATE_BASIS) {
    return `occlusion operation.coordinateBasis must be ${PREDRAWN_COORDINATE_BASIS}`;
  }
  if (provenance.processor !== OCCLUSION_PROCESSOR) {
    return `occlusion provenance.processor must be ${OCCLUSION_PROCESSOR}`;
  }
  if (provenance.sourceBackgroundVersionId !== sourceVersionId) {
    return 'occlusion provenance.sourceBackgroundVersionId must equal source_background_version_id';
  }
  return null;
}

function normalizeBackgroundVersionCreate(raw, { allowLegacyEnvironmentGeometry = false } = {}) {
  if (!isObjectRecord(raw)) return { error: 'body must be an object' };
  const unsupported = Object.keys(raw).filter((key) => !CREATE_KEYS.has(key));
  if (unsupported.length) return { error: `unsupported fields: ${unsupported.sort().join(', ')}` };
  for (const [snake, camel] of [
    ['parent_version_id', 'parentVersionId'],
    ['source_background_version_id', 'sourceBackgroundVersionId'],
    ['attempt_id', 'attemptId'],
    ['world_bounds', 'worldBounds'],
    ['idempotency_key', 'idempotencyKey'],
  ]) {
    if (Object.hasOwn(raw, snake) && Object.hasOwn(raw, camel)) {
      return { error: `${snake} must not be supplied twice` };
    }
  }
  const kind = String(raw.kind || '').trim().toLowerCase();
  if (!KINDS.has(kind)) return { error: 'kind must be source, raw, warped, or occlusion' };
  const label = raw.label === undefined
    ? `${kind[0].toUpperCase()}${kind.slice(1)} background version`
    : String(raw.label).trim();
  if (!label || label.length > 160) return { error: 'label must contain 1 to 160 characters' };
  const parent = optionalUuid(raw, 'parent_version_id', 'parentVersionId');
  if (parent.error) return parent;
  const source = optionalUuid(raw, 'source_background_version_id', 'sourceBackgroundVersionId');
  if (source.error) return source;
  const attempt = optionalUuid(raw, 'attempt_id', 'attemptId');
  if (attempt.error) return attempt;
  const rawBounds = raw.world_bounds ?? raw.worldBounds;
  const bounds = kind === 'source' && rawBounds === undefined
    ? { value: null }
    : normalizeWorldBounds(rawBounds);
  if (bounds.error) return bounds;
  const operationIssue = jsonValueIssue(raw.operation, 'operation');
  if (operationIssue) return { error: operationIssue };
  const provenanceIssue = jsonValueIssue(raw.provenance, 'provenance', { maxBytes: 128 * 1024 });
  if (provenanceIssue) return { error: provenanceIssue };

  if ((kind === 'source' || kind === 'raw') && (parent.value || source.value)) {
    return { error: `${kind} versions cannot have parent or source background versions` };
  }
  if (kind === 'warped' && !parent.value) {
    return { error: 'warped versions require parent_version_id' };
  }
  if (kind === 'occlusion' && !source.value) {
    return { error: 'occlusion versions require source_background_version_id' };
  }

  const operation = raw.operation;
  const provenance = raw.provenance;
  if (kind === 'source') {
    if (
      operation.kind !== 'generation-source-v2'
      && !(allowLegacyEnvironmentGeometry && operation.kind === 'generation-source-v1')
    ) {
      return { error: 'source operation.kind must be generation-source-v2' };
    }
    if (!SHA256.test(provenance.sourceSha256 || '')) {
      return { error: 'source provenance.sourceSha256 must be a lowercase SHA-256 digest' };
    }
    return {
      value: {
        kind,
        label,
        parent_version_id: null,
        source_background_version_id: null,
        ...(attempt.value ? { attempt_id: attempt.value } : {}),
        world_bounds: bounds.value,
        operation: raw.operation,
        provenance: raw.provenance,
      },
    };
  }
  const allowedGeometrySchema = operation.environmentGeometrySchema === ENVIRONMENT_GEOMETRY_SCHEMA
    || (
      allowLegacyEnvironmentGeometry
      && operation.environmentGeometrySchema === LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA
    );
  if (!allowedGeometrySchema) {
    return { error: `operation.environmentGeometrySchema must be ${ENVIRONMENT_GEOMETRY_SCHEMA}` };
  }
  if (!SHA256.test(operation.environmentGeometrySha256 || '')) {
    return { error: 'operation.environmentGeometrySha256 must be a lowercase SHA-256 digest' };
  }
  if (provenance.environmentGeometrySha256 !== operation.environmentGeometrySha256) {
    return { error: 'provenance.environmentGeometrySha256 must equal the operation geometry digest' };
  }
  if (kind === 'warped') {
    if (!Object.hasOwn(WARP_PROCESSOR_BY_OPERATION, operation.kind)) {
      return { error: 'warped operation.kind must be grid-warp-v1 or grid-warp-v2' };
    }
  } else {
    const expectedOperationKind = {
      raw: 'raw-generated-v2',
      occlusion: 'occlusion-depth-v1',
    }[kind];
    if (operation.kind !== expectedOperationKind) {
      return { error: `${kind} operation.kind must be ${expectedOperationKind}` };
    }
  }
  if (kind === 'raw') {
    const rawContractIssue = rawBackgroundVersionContractIssue({
      kind,
      world_bounds: bounds.value,
      operation,
    });
    if (rawContractIssue) return { error: rawContractIssue };
  }
  const derivativeIssue = derivativeOperationIssue(
    kind,
    operation,
    provenance,
    parent.value,
    source.value,
  );
  if (derivativeIssue) return { error: derivativeIssue };
  if (kind === 'raw') {
    if (!SHA256.test(provenance.sourceSha256 || '')) {
      return { error: 'raw provenance.sourceSha256 must be a lowercase SHA-256 digest' };
    }
  } else {
    if (!SHA256.test(operation.outputSha256 || '')) {
      return { error: `${kind} operation.outputSha256 must be a lowercase SHA-256 digest` };
    }
    if (provenance.outputSha256 !== operation.outputSha256) {
      return { error: `${kind} provenance.outputSha256 must equal the operation output digest` };
    }
  }

  return {
    value: {
      kind,
      label,
      parent_version_id: parent.value,
      source_background_version_id: source.value,
      ...(attempt.value ? { attempt_id: attempt.value } : {}),
      world_bounds: bounds.value,
      operation: raw.operation,
      provenance: raw.provenance,
    },
  };
}

function backgroundVersionLineageIssue(
  candidate,
  parent,
  source,
  { allowArchivedSources = false } = {},
) {
  const sourceHasContent = (row) => Boolean(
    row?.blob_sha256
    && (
      SOURCE_STATUSES.has(row.status)
      || (allowArchivedSources && row.status === 'archived')
    )
  );
  if (candidate.kind === 'raw') {
    if (parent || source) return 'raw versions cannot have lineage references';
    return rawBackgroundVersionContractIssue(candidate);
  }
  if (candidate.kind === 'source') {
    if (parent || source) return 'source versions cannot have lineage references';
    return sourceArtworkVersionContractIssue(candidate);
  }
  if (candidate.kind === 'warped') {
    if (!parent) return 'warped source version was not found in this document';
    if (parent.kind !== 'raw') return 'warped versions must descend directly from a raw background version';
    const rawContractIssue = rawBackgroundVersionContractIssue(parent);
    if (rawContractIssue) return `warped raw parent is invalid: ${rawContractIssue}`;
    if (!sourceHasContent(parent)) return 'warped source content is not ready';
    if (source && String(source.id) !== String(parent.id)) {
      return 'a warped source_background_version_id must equal its parent_version_id';
    }
    if (
      !positiveSafeInteger(parent.width)
      || !positiveSafeInteger(parent.height)
      || candidate.operation.sourceWidth !== parent.width
      || candidate.operation.sourceHeight !== parent.height
    ) {
      return 'warped operation source dimensions must equal its raw parent content dimensions';
    }
    if (!sameEnvironmentGeometry(candidate, parent)) {
      return 'warped environment geometry must equal its raw parent';
    }
    return null;
  }
  if (!source) return 'occlusion source background was not found in this document';
  if (source.kind !== 'warped') return 'occlusion source must be a warped background version';
  if (!sourceHasContent(source)) return 'occlusion source content is not ready';
  if (!positiveSafeInteger(source.width) || !positiveSafeInteger(source.height)) {
    return 'occlusion source content dimensions are invalid';
  }
  if (!sameWorldBounds(candidate.world_bounds, source.world_bounds)) return 'occlusion world bounds must equal its source background';
  if (!sameEnvironmentGeometry(candidate, source)) {
    return 'occlusion environment geometry must equal its source background';
  }
  if (parent) {
    if (parent.kind !== 'occlusion') return 'an occlusion parent must also be an occlusion version';
    if (String(parent.source_background_version_id || '') !== String(source.id)) {
      return 'an occlusion parent must use the same source background';
    }
    if (!sourceHasContent(parent)) return 'occlusion parent content is not ready';
    if (
      parent.width !== source.width
      || parent.height !== source.height
      || !sameWorldBounds(parent.world_bounds, source.world_bounds)
    ) {
      return 'occlusion refinement dimensions and world bounds must equal its source background';
    }
    if (!sameEnvironmentGeometry(candidate, parent)) {
      return 'occlusion refinement geometry must equal its parent';
    }
  }
  return null;
}

function backgroundVersionStoredContractIssue(candidate, parent = null, source = null) {
  if (!isObjectRecord(candidate)) return 'background version must be an object';
  if (parent && String(candidate.parent_version_id || '') !== String(parent.id || '')) {
    return 'background version parent must equal parent_version_id';
  }
  if (source && String(candidate.source_background_version_id || '') !== String(source.id || '')) {
    return 'background version source must equal source_background_version_id';
  }
  if (
    parent
    && candidate.document_id !== undefined
    && parent.document_id !== candidate.document_id
  ) return 'background version parent must belong to the same document';
  if (
    source
    && candidate.document_id !== undefined
    && source.document_id !== candidate.document_id
  ) return 'background version source must belong to the same document';
  if (candidate.kind === 'occlusion' && parent) {
    const parentIssue = backgroundVersionStoredContractIssue(parent, null, source);
    if (parentIssue) return `occlusion parent is invalid: ${parentIssue}`;
  }

  const effectiveOperation = candidate.kind === 'raw'
    ? effectiveRawOperation(candidate)
    : { operation: candidate.operation };
  if (effectiveOperation.error) {
    return `raw contract binding is invalid: ${effectiveOperation.error}`;
  }
  const normalized = normalizeBackgroundVersionCreate({
    kind: candidate.kind,
    label: candidate.label,
    parent_version_id: candidate.parent_version_id,
    source_background_version_id: candidate.source_background_version_id,
    world_bounds: candidate.world_bounds,
    operation: effectiveOperation.operation,
    provenance: candidate.provenance,
  }, { allowLegacyEnvironmentGeometry: true });
  if (normalized.error) return normalized.error;
  return backgroundVersionLineageIssue(
    normalized.value,
    parent,
    source,
    // Archive is a lifecycle state, not lineage deletion. Canonical validation
    // must still validate an archived immutable ancestor without authorizing a
    // new derivative from it.
    { allowArchivedSources: true },
  );
}

function backgroundVersionStoredOcclusionChain(candidate, versionsById, source) {
  if (!isObjectRecord(candidate) || candidate.kind !== 'occlusion') {
    return { error: 'selected occlusion version must be an object' };
  }
  if (!(versionsById instanceof Map)) return { error: 'occlusion lineage index must be a Map' };

  const lineage = [];
  const visited = new Set();
  let current = candidate;
  while (current) {
    const currentId = normalizedUuid(current.id);
    if (!currentId) return { error: 'occlusion lineage contains an invalid version id' };
    if (visited.has(currentId)) return { error: `occlusion lineage cycle detected at ${currentId}` };
    visited.add(currentId);

    const parentId = current.parent_version_id === null || current.parent_version_id === undefined
      ? null
      : normalizedUuid(current.parent_version_id);
    if (current.parent_version_id != null && !parentId) {
      return { error: `occlusion ${currentId} has an invalid parent_version_id` };
    }
    if (parentId && visited.has(parentId)) {
      return { error: `occlusion lineage cycle detected at ${parentId}` };
    }
    const parent = parentId ? versionsById.get(parentId) || null : null;
    if (parentId && !parent) {
      return { error: `occlusion ancestor ${parentId} is missing` };
    }

    const contractIssue = backgroundVersionStoredContractIssue(current, parent, source);
    if (contractIssue) return { error: `occlusion ${currentId} is invalid: ${contractIssue}` };
    lineage.push(current);
    current = parent;
  }
  return { value: lineage };
}

function backgroundVersionAttemptStageIssue(candidate, attempt, {
  sourceArtwork = null,
  generated = null,
  warped = null,
} = {}) {
  if (!isObjectRecord(candidate)) return 'attempt stage must be a background version';
  if (!isObjectRecord(attempt)) return 'generation attempt was not found';
  if (attempt.status !== 'active') return 'generation attempt is archived';
  if (!['source', 'pipeline-source'].includes(attempt.origin) || !attempt.source_version_id) {
    return 'migrated historical attempts cannot accept new stages';
  }
  const rawInputBinding = attempt.origin === 'pipeline-source'
    || attempt.source_request?.schema === ATTEMPT_INTAKE_SOURCE_REQUEST_SCHEMA;
  const expectedInputKind = rawInputBinding ? 'raw' : 'source';
  if (
    !sourceArtwork
    || sourceArtwork.kind !== expectedInputKind
    || String(sourceArtwork.id) !== String(attempt.source_version_id)
    || !sourceArtwork.blob_sha256
    || !SOURCE_STATUSES.has(sourceArtwork.status)
    || (
      expectedInputKind === 'source'
        ? sourceArtworkVersionContractIssue(sourceArtwork)
        : rawBackgroundVersionContractIssue(sourceArtwork)
    )
  ) {
    return rawInputBinding
      ? 'the processing attempt’s raw artwork input is not ready'
      : 'the pipeline slot’s Generation Reference is not ready';
  }
  const sourceRequestIssue = generationAttemptSourceRequestIssue(attempt, sourceArtwork);
  if (sourceRequestIssue) return sourceRequestIssue;
  if (
    rawInputBinding
    && String(attempt.generated_version_id || '') !== String(sourceArtwork.id)
  ) {
    return attempt.origin === 'pipeline-source'
      ? 'the processing attempt must begin with its exact Raw Pipeline Source'
      : 'the processing attempt must begin with its exact raw artwork input';
  }
  if (
    candidate.document_id !== undefined
    && (
      sourceArtwork.document_id !== candidate.document_id
      || attempt.document_id !== candidate.document_id
    )
  ) {
    return 'the pipeline slot and Generation Reference must belong to the same document';
  }

  if (candidate.kind === 'raw') {
    if (attempt.generated_version_id) return 'the pipeline slot already has a Raw Pipeline Source';
    if (candidate.parent_version_id || candidate.source_background_version_id) {
      return 'a Raw Pipeline Source cannot have raster lineage';
    }
    if (!sameWorldBounds(candidate.world_bounds, sourceArtwork.world_bounds)) {
      return 'Raw Pipeline Source world bounds must equal its Generation Reference';
    }
    if (!sameEnvironmentGeometry(candidate, sourceArtwork)) {
      return 'Raw Pipeline Source geometry must equal its Generation Reference';
    }
    if (!rawInputBinding && (
      candidate.operation?.sourceArtworkVersionId !== String(sourceArtwork.id)
      || candidate.operation?.sourceArtworkSha256 !== sourceArtwork.blob_sha256
      || candidate.provenance?.sourceArtworkVersionId !== String(sourceArtwork.id)
      || candidate.provenance?.sourceArtworkSha256 !== sourceArtwork.blob_sha256
    )) {
      return 'Raw Pipeline Source metadata must name the slot’s Generation Reference and exact bytes';
    }
    return null;
  }

  if (
    !generated
    || generated.kind !== 'raw'
    || String(generated.id) !== String(attempt.generated_version_id)
  ) {
    return 'the pipeline slot’s Raw Pipeline Source is unavailable';
  }
  if (!generated.blob_sha256 || !SOURCE_STATUSES.has(generated.status)) {
    return 'the pipeline slot’s Raw Pipeline Source content is not ready';
  }
  if (candidate.kind === 'warped') {
    if (attempt.warped_version_id) return 'generation attempt already has warped artwork';
    const attemptProcessingRevision = Number(attempt.processing_revision ?? 0);
    if (!Number.isSafeInteger(attemptProcessingRevision) || attemptProcessingRevision < 0) {
      return 'generation attempt processing revision is invalid';
    }
    if (
      candidate.operation?.attemptProcessingRevision !== attemptProcessingRevision
      || candidate.provenance?.attemptProcessingRevision !== attemptProcessingRevision
    ) {
      return 'the warped board must use this slot’s current processing revision';
    }
    if (
      String(candidate.parent_version_id || '') !== String(generated.id)
      || String(candidate.source_background_version_id || '') !== String(generated.id)
    ) {
      return 'the warped board must use this slot’s Raw Pipeline Source';
    }
    return backgroundVersionLineageIssue(candidate, generated, generated);
  }

  if (candidate.kind !== 'occlusion') return 'a Generation Reference cannot be attached as a pipeline stage';
  if (attempt.occlusion_version_id) return 'generation attempt already has occlusion artwork';
  if (
    !warped
    || warped.kind !== 'warped'
    || String(warped.id) !== String(attempt.warped_version_id)
    || !warped.blob_sha256
    || !SOURCE_STATUSES.has(warped.status)
  ) {
    return 'generation attempt warped artwork content is not ready';
  }
  if (candidate.parent_version_id) {
    return 'an attempt owns one occlusion result and cannot refine an earlier mask';
  }
  if (String(candidate.source_background_version_id || '') !== String(warped.id)) {
    return 'occlusion artwork must use this attempt warped artwork';
  }
  const moveHighlightProfile = normalizeMoveHighlightProfile(
    attempt.move_highlight_profile,
    {
      backgroundVersionId: String(warped.id),
      environmentGeometrySha256: backgroundVersionV2GeometrySha256(warped),
    },
  );
  if (
    moveHighlightProfile.error
    || attempt.move_highlight_profile_sha256 !== moveHighlightProfile.value?.profileSha256
    || String(attempt.move_highlight_profile_warped_version_id || '') !== String(warped.id)
  ) {
    return 'fit and save this warped board’s cyan move-highlight cells before applying occlusion';
  }
  return backgroundVersionLineageIssue(candidate, null, warped);
}

function normalizePredrawnVersionSurface(value) {
  if (
    !isObjectRecord(value)
    || value.kind !== 'predrawn'
    || ![2, 3].includes(value.schemaVersion)
  ) return null;
  const backgroundVersionId = normalizedUuid(value.backgroundVersionId);
  const occlusionVersionId = value.occlusionVersionId === undefined || value.occlusionVersionId === null
    ? null
    : normalizedUuid(value.occlusionVersionId);
  const bounds = normalizeWorldBounds(value.worldBounds);
  if (
    !backgroundVersionId || (value.occlusionVersionId != null && !occlusionVersionId)
    || !Number.isInteger(value.frameWidth) || !Number.isInteger(value.frameHeight)
    || value.frameWidth < 1 || value.frameWidth > 32768
    || value.frameHeight < 1 || value.frameHeight > 32768
    || value.frameWidth * value.frameHeight > 8_388_608
    || bounds.error
  ) return { error: 'versioned pre-drawn surface is malformed' };
  if (value.schemaVersion === 2 && value.moveHighlightProfile !== undefined) {
    return { error: 'versioned pre-drawn surface is malformed' };
  }
  const moveHighlightProfile = value.schemaVersion === 3
    ? normalizeMoveHighlightProfile(value.moveHighlightProfile, { backgroundVersionId })
    : { value: null };
  if (moveHighlightProfile.error) {
    return { error: moveHighlightProfile.error };
  }
  return {
    value: {
      background_version_id: backgroundVersionId,
      occlusion_version_id: occlusionVersionId,
      frame_width: value.frameWidth,
      frame_height: value.frameHeight,
      world_bounds: bounds.value,
      ...(moveHighlightProfile.value
        ? { move_highlight_profile: moveHighlightProfile.value }
        : {}),
    },
  };
}

function generationAttemptSelectionDisposition(backgroundMode, selectedSurface, ownedVersionIds) {
  const owned = new Set(
    Array.from(ownedVersionIds || [], (id) => normalizedUuid(id)).filter(Boolean),
  );
  const selectedIds = [
    selectedSurface?.background_version_id,
    selectedSurface?.occlusion_version_id,
  ].map((id) => normalizedUuid(id)).filter(Boolean);
  const matchedVersionIds = [...new Set(selectedIds.filter((id) => owned.has(id)))].sort();
  if (!matchedVersionIds.length) {
    return { kind: 'unrelated', matched_version_ids: [] };
  }
  if (backgroundMode === 'ai') {
    return { kind: 'active', matched_version_ids: matchedVersionIds };
  }
  if (backgroundMode === 'legacy') {
    return { kind: 'dormant', matched_version_ids: matchedVersionIds };
  }
  return { kind: 'invalid', matched_version_ids: matchedVersionIds };
}

module.exports = {
  ATTEMPT_INTAKE_SOURCE_REQUEST_SCHEMA,
  ATTEMPT_PIPELINE_SOURCE_REQUEST_SCHEMA,
  ATTEMPT_SOURCE_REQUEST_SCHEMA,
  ENVIRONMENT_GEOMETRY_SCHEMA,
  LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
  LEGACY_SOURCE_SEMANTIC_REQUEST_SCHEMA,
  MOVE_HIGHLIGHT_COORDINATE_BASIS,
  MOVE_HIGHLIGHT_PROFILE_SCHEMA,
  PREDRAWN_COORDINATE_BASIS,
  SOURCE_SEMANTIC_REQUEST_SCHEMA,
  backgroundVersionEnvironmentGeometry,
  backgroundVersionAttemptStageIssue,
  backgroundVersionLineageIssue,
  backgroundVersionStoredContractIssue,
  backgroundVersionStoredOcclusionChain,
  backgroundVersionV2GeometrySha256,
  generationAttemptSelectionDisposition,
  generationAttemptSourceRequestIssue,
  jsonValueIssue,
  normalizeBackgroundVersionCreate,
  normalizeBackgroundVersionIdempotencyKey,
  normalizeMoveHighlightProfile,
  normalizePredrawnVersionSurface,
  normalizeWorldBounds,
  normalizedUuid,
  parseBackgroundVersionUploadPath,
  predrawnRegistrationSupportIssue,
  rawBackgroundVersionContractIssue,
  rawBackgroundVersionContractBindingIssue,
  sourceArtworkVersionContractIssue,
  sameWorldBounds,
  sameEnvironmentGeometry,
};
