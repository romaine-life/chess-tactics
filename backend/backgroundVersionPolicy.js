'use strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:@+-]{1,200}$/;
const KINDS = new Set(['raw', 'warped', 'occlusion']);
const SOURCE_STATUSES = new Set(['ready', 'published']);
const LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA = 'predrawn-environment-geometry-v1';
const ENVIRONMENT_GEOMETRY_SCHEMA = 'predrawn-environment-geometry-v2';
const STORED_ENVIRONMENT_GEOMETRY_SCHEMAS = new Set([
  LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
  ENVIRONMENT_GEOMETRY_SCHEMA,
]);
const PREDRAWN_PNG_ENCODER = 'png-rgba8-filter0-stored-deflate-v1';
const PREDRAWN_COORDINATE_BASIS = 'board-world-pixels-v1';
const WARP_PROCESSOR = 'shared-predrawn-rasterizer-v1';
const OCCLUSION_PROCESSOR = 'canonical-depth-mask-v1';
let parsePredrawnBoardRegistration = null;
let serializePredrawnBoardPreviewRegistration = null;
try {
  ({
    parsePredrawnBoardRegistration,
    serializePredrawnBoardPreviewRegistration,
  } = require('@chess-tactics/board-render'));
} catch {
  // Keep unrelated backend routes available if the shared renderer is absent,
  // but fail closed below rather than accepting an unvalidated warp recipe.
}
const CREATE_KEYS = new Set([
  'kind', 'label',
  'parent_version_id', 'parentVersionId',
  'source_background_version_id', 'sourceBackgroundVersionId',
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

function rawBackgroundVersionContractIssue(candidate) {
  if (!candidate || candidate.kind !== 'raw') return 'background version must be raw';
  const operation = candidate.operation;
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

function derivativeOperationIssue(kind, operation, provenance, parentVersionId, sourceVersionId) {
  if (kind === 'warped') {
    const registration = canonicalPredrawnRegistration(operation.registration);
    if (!registration) {
      return 'warped operation.registration must be a valid canonical serialized registration';
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
    if (provenance.processor !== WARP_PROCESSOR) {
      return `warped provenance.processor must be ${WARP_PROCESSOR}`;
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
    ['world_bounds', 'worldBounds'],
    ['idempotency_key', 'idempotencyKey'],
  ]) {
    if (Object.hasOwn(raw, snake) && Object.hasOwn(raw, camel)) {
      return { error: `${snake} must not be supplied twice` };
    }
  }
  const kind = String(raw.kind || '').trim().toLowerCase();
  if (!KINDS.has(kind)) return { error: 'kind must be raw, warped, or occlusion' };
  const label = raw.label === undefined
    ? `${kind[0].toUpperCase()}${kind.slice(1)} background version`
    : String(raw.label).trim();
  if (!label || label.length > 160) return { error: 'label must contain 1 to 160 characters' };
  const parent = optionalUuid(raw, 'parent_version_id', 'parentVersionId');
  if (parent.error) return parent;
  const source = optionalUuid(raw, 'source_background_version_id', 'sourceBackgroundVersionId');
  if (source.error) return source;
  const bounds = normalizeWorldBounds(raw.world_bounds ?? raw.worldBounds);
  if (bounds.error) return bounds;
  const operationIssue = jsonValueIssue(raw.operation, 'operation');
  if (operationIssue) return { error: operationIssue };
  const provenanceIssue = jsonValueIssue(raw.provenance, 'provenance', { maxBytes: 128 * 1024 });
  if (provenanceIssue) return { error: provenanceIssue };

  if (kind === 'raw' && (parent.value || source.value)) {
    return { error: 'raw versions cannot have parent or source background versions' };
  }
  if (kind === 'warped' && !parent.value) {
    return { error: 'warped versions require parent_version_id' };
  }
  if (kind === 'occlusion' && !source.value) {
    return { error: 'occlusion versions require source_background_version_id' };
  }

  const operation = raw.operation;
  const provenance = raw.provenance;
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
  const expectedOperationKind = {
    raw: 'raw-generated-v2',
    warped: 'grid-warp-v1',
    occlusion: 'occlusion-depth-v1',
  }[kind];
  if (operation.kind !== expectedOperationKind) {
    return { error: `${kind} operation.kind must be ${expectedOperationKind}` };
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

  const normalized = normalizeBackgroundVersionCreate({
    kind: candidate.kind,
    label: candidate.label,
    parent_version_id: candidate.parent_version_id,
    source_background_version_id: candidate.source_background_version_id,
    world_bounds: candidate.world_bounds,
    operation: candidate.operation,
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

function normalizePredrawnVersionSurface(value) {
  if (!isObjectRecord(value) || value.kind !== 'predrawn' || value.schemaVersion !== 2) return null;
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
  return {
    value: {
      background_version_id: backgroundVersionId,
      occlusion_version_id: occlusionVersionId,
      frame_width: value.frameWidth,
      frame_height: value.frameHeight,
      world_bounds: bounds.value,
    },
  };
}

module.exports = {
  ENVIRONMENT_GEOMETRY_SCHEMA,
  LEGACY_ENVIRONMENT_GEOMETRY_SCHEMA,
  backgroundVersionEnvironmentGeometry,
  backgroundVersionLineageIssue,
  backgroundVersionStoredContractIssue,
  backgroundVersionStoredOcclusionChain,
  backgroundVersionV2GeometrySha256,
  jsonValueIssue,
  normalizeBackgroundVersionCreate,
  normalizeBackgroundVersionIdempotencyKey,
  normalizePredrawnVersionSurface,
  normalizeWorldBounds,
  normalizedUuid,
  parseBackgroundVersionUploadPath,
  rawBackgroundVersionContractIssue,
  sameWorldBounds,
  sameEnvironmentGeometry,
};
