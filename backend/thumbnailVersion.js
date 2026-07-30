'use strict';

const crypto = require('node:crypto');
const {
  immutableShaFromSource,
  semanticSlotFromSource,
  thumbnailSourceAvailability,
} = require('./thumbnailAvailability');

const THUMBNAIL_DEPENDENCY_SCHEMA_VERSION = 1;
const KIND_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizedSourceDependencies(sourceDependencies) {
  if (!Array.isArray(sourceDependencies)) {
    throw new TypeError('thumbnail source dependencies must be an array');
  }
  const seen = new Set();
  return sourceDependencies.map((raw) => {
    if (!raw || typeof raw !== 'object') {
      throw new TypeError('thumbnail source dependency must be an object');
    }
    const src = typeof raw.src === 'string' ? raw.src : '';
    if (!src || seen.has(src)) {
      throw new Error(`thumbnail source dependency is ${src ? 'duplicated' : 'missing its source'}`);
    }
    seen.add(src);
    const availability = raw.availability;
    if (availability !== 'critical' && availability !== 'decorative') {
      throw new Error(`thumbnail source dependency ${src} has invalid availability`);
    }
    const sha256 = raw.sha256 == null ? null : String(raw.sha256);
    if (sha256 !== null && !SHA256_PATTERN.test(sha256)) {
      throw new Error(`thumbnail source dependency ${src} has invalid SHA-256`);
    }
    return {
      src,
      availability,
      sha256,
    };
  }).sort((left, right) => left.src.localeCompare(right.src));
}

function thumbnailPlanSources(plan, extraSources = []) {
  return [...new Set([
    ...(Array.isArray(plan?.ops) ? plan.ops.map((op) => op?.src) : []),
    ...(Array.isArray(plan?.occlusionMasks) ? plan.occlusionMasks.map((op) => op?.src) : []),
    plan?.predrawnBackgroundRaster?.src,
    plan?.occlusionDepthMap?.src,
    ...extraSources,
  ].filter((src) => typeof src === 'string' && src))].sort();
}

function thumbnailSourceDependencies(sources, { mediaCatalog, mediaAvailability } = {}) {
  const mediaSlots = new Map(
    (Array.isArray(mediaCatalog?.slots) ? mediaCatalog.slots : [])
      .map((entry) => [entry.slot, entry]),
  );
  return sources.map((src) => {
    const semanticSlot = semanticSlotFromSource(src);
    const slotEntry = semanticSlot ? mediaSlots.get(semanticSlot) : null;
    return {
      src,
      availability: thumbnailSourceAvailability(src, mediaAvailability),
      sha256: slotEntry?.media?.sha256 ?? immutableShaFromSource(src),
    };
  });
}

/**
 * Content-address one derived thumbnail from only the inputs that can change
 * its pixels. Catalog generation counters are deliberately absent: callers
 * project current catalogs into an exact render plan and exact source records
 * before invoking this function.
 */
function thumbnailContentVersion({
  kind,
  rendererRevision,
  renderInputs,
  sourceDependencies,
}) {
  if (typeof kind !== 'string' || !KIND_PATTERN.test(kind)) {
    throw new Error('thumbnail content kind is invalid');
  }
  if (!Number.isSafeInteger(rendererRevision) || rendererRevision < 1) {
    throw new Error('thumbnail renderer revision is invalid');
  }
  if (!renderInputs || typeof renderInputs !== 'object' || Array.isArray(renderInputs)) {
    throw new TypeError('thumbnail render inputs must be an object');
  }
  const fingerprint = crypto.createHash('sha256').update(canonicalJson({
    schemaVersion: THUMBNAIL_DEPENDENCY_SCHEMA_VERSION,
    kind,
    rendererRevision,
    renderInputs,
    sourceDependencies: normalizedSourceDependencies(sourceDependencies),
  })).digest('hex');
  return `${kind}-r${rendererRevision}-d${THUMBNAIL_DEPENDENCY_SCHEMA_VERSION}-${fingerprint}`;
}

function thumbnailContentVersionForPlan({
  kind,
  rendererRevision,
  plan,
  exactRenderInputs = { plan },
  extraSources = [],
  mediaCatalog,
  mediaAvailability,
}) {
  const sources = thumbnailPlanSources(plan, extraSources);
  return thumbnailContentVersion({
    kind,
    rendererRevision,
    renderInputs: exactRenderInputs,
    sourceDependencies: thumbnailSourceDependencies(sources, { mediaCatalog, mediaAvailability }),
  });
}

module.exports = {
  THUMBNAIL_DEPENDENCY_SCHEMA_VERSION,
  thumbnailContentVersion,
  thumbnailContentVersionForPlan,
  thumbnailPlanSources,
  thumbnailSourceDependencies,
};
