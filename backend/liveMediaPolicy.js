'use strict';

const SHA256 = /^[0-9a-f]{64}$/;

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedSha(value) {
  const sha = String(value || '').trim().toLowerCase();
  return SHA256.test(sha) ? sha : null;
}

function nativeMediaEvidenceIssue(row) {
  const isRaster = String(row.media_type || '').startsWith('image/') && row.media_type !== 'image/svg+xml';
  if (!isRaster) return null;
  const evidence = isObjectRecord(row.native_evidence) ? row.native_evidence : {};
  if (evidence.native1x !== true) return 'nativeEvidence.native1x must be true';
  if (evidence.spatialResampling !== false) return 'nativeEvidence.spatialResampling must be false';
  if (row.width !== null || row.height !== null) {
    if (Number(evidence.sourceWidth) !== Number(row.width) || Number(evidence.sourceHeight) !== Number(row.height)) {
      return 'nativeEvidence source dimensions must equal the uploaded image dimensions';
    }
  }
  if (!normalizedSha(evidence.sourceSha256) || normalizedSha(evidence.sourceSha256) !== normalizedSha(row.blob_sha256)) {
    return 'nativeEvidence.sourceSha256 is required and must equal the uploaded content hash';
  }
  return null;
}

function preservesNativeEvidenceForUpload(current, { sha256, mediaType, width, height }) {
  return nativeMediaEvidenceIssue({
    ...current,
    blob_sha256: normalizedSha(sha256),
    media_type: mediaType,
    width,
    height,
  }) === null;
}

function liveCatalogReadinessIssue(catalog, { requireCritical = false } = {}) {
  if (!catalog || !Array.isArray(catalog.slots)) return 'live media catalog is missing slots';
  if (!requireCritical) return null;
  const hasCritical = catalog.slots.some((slot) => (
    slot?.lifecycleState === 'active'
    && slot?.availabilityPolicy === 'critical'
    && slot?.media?.sha256
  ));
  return hasCritical ? null : 'live media catalog has no active critical slot';
}

module.exports = { liveCatalogReadinessIssue, nativeMediaEvidenceIssue, preservesNativeEvidenceForUpload };
