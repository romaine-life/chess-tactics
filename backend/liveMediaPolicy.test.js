'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { nativeMediaEvidenceIssue, preservesNativeEvidenceForUpload } = require('./liveMediaPolicy');

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
