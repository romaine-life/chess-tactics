'use strict';

const { createHash } = require('node:crypto');

const SHA256 = /^[0-9a-f]{64}$/;
const PREDRAWN_BOARD_SLOT = /^boards\/([a-z0-9][a-z0-9._-]{0,119})\/plate\.png$/;
const PREDRAWN_BOARD_COMPONENT = 'predrawn-board-plate';
const PREDRAWN_BOARD_PROOF_SCHEMA = 'predrawn-board-canonical-level-proof-v1';
const PREDRAWN_BOARD_PROOF_RENDERER = 'LevelEditor/PredrawnBoardLayer';

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedSha(value) {
  const sha = String(value || '').trim().toLowerCase();
  return SHA256.test(sha) ? sha : null;
}

function predrawnBoardSlotSlug(slot) {
  const match = PREDRAWN_BOARD_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

function mediaVersionMetadata(row) {
  return isObjectRecord(row.version_metadata) ? row.version_metadata
    : isObjectRecord(row.metadata) ? row.metadata : {};
}

function predrawnBoardAlignmentIssue(value, frameWidth, frameHeight) {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    return 'pre-drawn board proof requires a canonical serialized alignment';
  }
  const sections = value.split(';');
  if (sections.length !== 6 || sections[0] !== 'v4') {
    return 'pre-drawn board alignment must use the canonical v4 payload';
  }
  const numbers = (text, count) => {
    const tokens = text.split(',');
    if (tokens.length !== count || tokens.some((token) => !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(token))) return null;
    const parsed = tokens.map(Number);
    return parsed.every(Number.isFinite) ? parsed : null;
  };
  const frameAndCorners = numbers(sections[1], 10);
  const grid = numbers(sections[2], 2);
  if (!frameAndCorners || !grid) return 'pre-drawn board alignment geometry is malformed';
  if (
    frameAndCorners[0] !== Number(frameWidth) || frameAndCorners[1] !== Number(frameHeight)
    || !Number.isInteger(grid[0]) || !Number.isInteger(grid[1])
    || grid[0] < 1 || grid[0] > 64 || grid[1] < 1 || grid[1] > 64
  ) return 'pre-drawn board alignment does not match the reviewed frame/grid';
  const columnGuides = numbers(sections[3], grid[0] + 1);
  const rowGuides = numbers(sections[4], grid[1] + 1);
  const boundary = numbers(sections[5], 8);
  if (!columnGuides || !rowGuides || !boundary) return 'pre-drawn board alignment guides or boundary are malformed';
  const monotonicUnitGuides = (guides) => (
    guides[0] === 0 && guides.at(-1) === 1
    && guides.every((guide, index) => guide >= 0 && guide <= 1 && (index === 0 || guide > guides[index - 1]))
  );
  if (!monotonicUnitGuides(columnGuides) || !monotonicUnitGuides(rowGuides)) {
    return 'pre-drawn board alignment guides must be strictly monotonic from 0 to 1';
  }
  const allPoints = [...frameAndCorners.slice(2), ...boundary];
  for (let index = 0; index < allPoints.length; index += 2) {
    if (
      allPoints[index] < 0 || allPoints[index] > Number(frameWidth)
      || allPoints[index + 1] < 0 || allPoints[index + 1] > Number(frameHeight)
    ) return 'pre-drawn board alignment points must lie inside the reviewed frame';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one complete pre-drawn level plate.
 * Dimensions are candidate-declared native geometry, not a global preset.
 */
function predrawnBoardMediaIssue(row, projectedRuntime = null) {
  const slug = predrawnBoardSlotSlug(row.slot);
  if (!slug) return 'pre-drawn board slots must match boards/<board-slug>/plate.png';
  if (row.domain !== 'background') return 'pre-drawn board plates require the background domain';
  if (row.role !== 'media') return 'pre-drawn board plates require the media role';
  if (row.media_type !== 'image/png') return 'pre-drawn board plates require image/png';
  if (
    !Number.isInteger(Number(row.width)) || Number(row.width) < 1
    || !Number.isInteger(Number(row.height)) || Number(row.height) < 1
  ) return 'pre-drawn board plates require decoded positive raster dimensions';

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'pre-drawn board plates require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `pre-drawn board runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== PREDRAWN_BOARD_COMPONENT) {
    return `pre-drawn board metadata.runtime.component must be ${PREDRAWN_BOARD_COMPONENT}`;
  }
  if (runtime.variant !== slug) return 'pre-drawn board runtime variant must match its semantic slot slug';
  if (runtime.frameWidth !== Number(row.width) || runtime.frameHeight !== Number(row.height)) {
    return 'pre-drawn board runtime frame dimensions must equal the uploaded PNG dimensions';
  }
  if (runtime.frameCount !== 1) return 'pre-drawn board runtime frameCount must be 1';
  return null;
}

function predrawnBoardOwnerProofIssue(row, proof, surfaceUrl = null) {
  const slug = predrawnBoardSlotSlug(row.slot);
  if (!slug) return 'pre-drawn board proof requires a canonical board slot';
  if (!isObjectRecord(proof) || proof.schema !== PREDRAWN_BOARD_PROOF_SCHEMA) {
    return `pre-drawn board review requires ${PREDRAWN_BOARD_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== PREDRAWN_BOARD_PROOF_RENDERER
    || proof.canonicalScale !== 1 || proof.assetLocalScale !== 1
    || proof.alignmentApplied !== true || proof.deterministicProof !== true
  ) return 'pre-drawn board proof must use the Level Editor renderer at exact canonical 1x';
  if (proof.boardSlug !== slug) return 'pre-drawn board proof does not match the semantic slot slug';
  if (proof.frameWidth !== Number(row.width) || proof.frameHeight !== Number(row.height)) {
    return 'pre-drawn board proof frame dimensions do not match the candidate bytes';
  }
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || normalizedSha(proof.previewSha256) !== candidateSha256) {
    return 'pre-drawn board proof preview hash does not match the candidate bytes';
  }
  const alignmentIssue = predrawnBoardAlignmentIssue(proof.alignment, row.width, row.height);
  if (alignmentIssue) return alignmentIssue;
  const alignmentSha256 = createHash('sha256').update(proof.alignment, 'utf8').digest('hex');
  if (normalizedSha(proof.alignmentSha256) !== alignmentSha256) {
    return 'pre-drawn board proof alignment hash does not match its canonical payload';
  }
  if (typeof proof.levelId !== 'string' || !proof.levelId.trim()) {
    return 'pre-drawn board proof requires the reviewed canonical level id';
  }
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'pre-drawn board proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'pre-drawn board proof surfaceUrl is invalid'; }
  if (parsedSurface.pathname !== '/editor/level' || parsedSurface.searchParams.get('levelId') !== proof.levelId) {
    return 'pre-drawn board proof must identify the reviewed Level Editor level';
  }
  if (!Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'pre-drawn board proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'pre-drawn board proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'pre-drawn board proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'pre-drawn board proof slot snapshot is invalid';
  }
  return null;
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

module.exports = {
  PREDRAWN_BOARD_COMPONENT,
  PREDRAWN_BOARD_PROOF_RENDERER,
  PREDRAWN_BOARD_PROOF_SCHEMA,
  liveCatalogReadinessIssue,
  nativeMediaEvidenceIssue,
  predrawnBoardAlignmentIssue,
  predrawnBoardMediaIssue,
  predrawnBoardOwnerProofIssue,
  predrawnBoardSlotSlug,
  preservesNativeEvidenceForUpload,
};
