'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const {
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
} = require('./liveMediaPolicy');

const originalSha = 'a'.repeat(64);
const replacementSha = 'b'.repeat(64);
const raster = (overrides = {}) => ({
  media_type: 'image/png',
  blob_sha256: originalSha,
  width: 96,
  height: 180,
  native_evidence: {
    native1x: true,
    spatialResampling: false,
    sourceWidth: 96,
    sourceHeight: 180,
    sourceSha256: originalSha,
  },
  ...overrides,
});

test('raster native evidence is required to identify the exact uploaded bytes', () => {
  const missingSha = raster({ native_evidence: { ...raster().native_evidence } });
  delete missingSha.native_evidence.sourceSha256;
  assert.match(nativeMediaEvidenceIssue(missingSha), /sourceSha256 is required/);
  assert.equal(nativeMediaEvidenceIssue(raster()), null);
});

test('same-dimension replacement bytes clear stale native evidence', () => {
  const current = raster();
  assert.equal(preservesNativeEvidenceForUpload(current, {
    sha256: replacementSha,
    mediaType: 'image/png',
    width: 96,
    height: 180,
  }), false);
  assert.equal(preservesNativeEvidenceForUpload(current, {
    sha256: originalSha,
    mediaType: 'image/png',
    width: 96,
    height: 180,
  }), true);
});

test('container-backed readiness requires at least one active critical live slot', () => {
  assert.equal(liveCatalogReadinessIssue({ slots: [] }), null);
  assert.match(liveCatalogReadinessIssue({ slots: [] }, { requireCritical: true }), /no active critical slot/);
  assert.match(liveCatalogReadinessIssue({
    slots: [{ lifecycleState: 'active', availabilityPolicy: 'decorative', media: { sha256: originalSha } }],
  }, { requireCritical: true }), /no active critical slot/);
  assert.equal(liveCatalogReadinessIssue({
    slots: [{ lifecycleState: 'active', availabilityPolicy: 'critical', media: { sha256: originalSha } }],
  }, { requireCritical: true }), null);
});

function predrawn(overrides = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    slot: 'boards/fortress-gate/plate.png',
    domain: 'background',
    role: 'media',
    media_type: 'image/png',
    blob_sha256: originalSha,
    width: 1672,
    height: 941,
    metadata: {
      runtime: {
        component: PREDRAWN_BOARD_COMPONENT,
        variant: 'fortress-gate',
        frameWidth: 1672,
        frameHeight: 941,
        frameCount: 1,
      },
    },
    ...overrides,
  };
}

function predrawnProof(row = predrawn()) {
  const surfaceUrl = 'http://127.0.0.1:5173/editor/level?levelId=off-l-fortress-gate&document=proof-doc';
  const alignment = 'v4;1672,941,1034.223,96.015,1375.402,300.134,611.986,723.847,281.123,532.992;5,11;0,0.2,0.4,0.6,0.8,1;0,0.090909,0.181818,0.272727,0.363636,0.454545,0.545455,0.636364,0.727273,0.818182,0.909091,1;1020.229,112.223,1346.622,295.818,628.558,699.729,302.166,516.133';
  return {
    schema: PREDRAWN_BOARD_PROOF_SCHEMA,
    surfaceUrl,
    renderer: PREDRAWN_BOARD_PROOF_RENDERER,
    canonicalScale: 1,
    assetLocalScale: 1,
    alignmentApplied: true,
    alignment,
    alignmentSha256: createHash('sha256').update(alignment, 'utf8').digest('hex'),
    deterministicProof: true,
    boardSlug: 'fortress-gate',
    levelId: 'off-l-fortress-gate',
    frameWidth: 1672,
    frameHeight: 941,
    previewSha256: row.blob_sha256,
    selectedCandidates: [{
      slot: row.slot,
      versionId: row.id,
      sha256: row.blob_sha256,
      rowRevision: 1,
    }],
    slotSnapshots: [{ slot: row.slot, rowRevision: 0, activeVersionId: null }],
  };
}

test('pre-drawn board projection accepts exact candidate-declared native PNG dimensions', () => {
  const row = predrawn();
  assert.equal(predrawnBoardSlotSlug(row.slot), 'fortress-gate');
  assert.equal(predrawnBoardMediaIssue(row), null);
  assert.match(predrawnBoardMediaIssue(predrawn({ media_type: 'image/webp' })), /image\/png/);
  assert.match(predrawnBoardMediaIssue(predrawn({ height: 940 })), /frame dimensions/);
  assert.match(predrawnBoardMediaIssue(predrawn({ domain: 'terrain' })), /background domain/);
  assert.match(predrawnBoardMediaIssue(predrawn({ role: 'plate' })), /media role/);
  assert.match(predrawnBoardMediaIssue(predrawn({
    metadata: { runtime: { ...row.metadata.runtime, variant: 'another-board' } },
  })), /variant/);
});

test('pre-drawn board owner proof pins the editor level, dimensions, slot, version, and exact bytes', () => {
  const row = predrawn();
  const proof = predrawnProof(row);
  assert.equal(predrawnBoardOwnerProofIssue(row, proof, proof.surfaceUrl), null);
  assert.equal(predrawnBoardAlignmentIssue(proof.alignment, 1672, 941), null);
  assert.match(predrawnBoardOwnerProofIssue(row, {
    ...proof,
    frameHeight: 940,
  }, proof.surfaceUrl), /frame dimensions/);
  assert.match(predrawnBoardOwnerProofIssue(row, {
    ...proof,
    previewSha256: replacementSha,
  }, proof.surfaceUrl), /preview hash/);
  assert.match(predrawnBoardOwnerProofIssue(predrawn({ blob_sha256: null }), {
    ...proof,
    previewSha256: null,
  }, proof.surfaceUrl), /preview hash/);
  assert.match(predrawnBoardOwnerProofIssue(row, {
    ...proof,
    selectedCandidates: [{ ...proof.selectedCandidates[0], sha256: replacementSha }],
  }, proof.surfaceUrl), /candidate bytes/);
  assert.match(predrawnBoardOwnerProofIssue(row, {
    ...proof,
    alignmentSha256: replacementSha,
  }, proof.surfaceUrl), /alignment hash/);
  assert.match(predrawnBoardOwnerProofIssue(row, {
    ...proof,
    surfaceUrl: 'http://127.0.0.1:5173/studio?levelId=off-l-fortress-gate',
  }, 'http://127.0.0.1:5173/studio?levelId=off-l-fortress-gate'), /Level Editor/);
});
