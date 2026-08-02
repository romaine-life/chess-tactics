'use strict';

const { createHash } = require('node:crypto');

const SHA256 = /^[0-9a-f]{64}$/;
const PREDRAWN_BOARD_SLOT = /^boards\/([a-z0-9][a-z0-9._-]{0,119})\/plate\.png$/;
const PREDRAWN_BOARD_COMPONENT = 'predrawn-board-plate';
const PREDRAWN_BOARD_PROOF_SCHEMA = 'predrawn-board-canonical-level-proof-v1';
const PREDRAWN_BOARD_PROOF_RENDERER = 'LevelEditor/PredrawnBoardLayer';
const RUN_RELIC_ICON_COMPONENT = 'run-relic-icon';
const RUN_RELIC_ICON_SLOT = /^ui\/run\/relics\/([a-z][a-z0-9-]{0,79})\.png$/;
const RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SCHEMA = 'run-relic-resized-production-exception-v1';
const RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SHA_BY_SLOT = Object.freeze({
  'ui/run/relics/congressional-approval.png': '928f9ceb7a5612ff0d2216b70422b972b04492a4c9ed277e5122721b390c52d0',
  'ui/run/relics/deployment-vehicle.png': 'd004c0f5be36094ebc137a9cdbebfe69d847636a7c8ddaff50bac8b687aac0bc',
  'ui/run/relics/inspirational-record.png': 'b6d18510fcff3e374a1899421b2928fb16cd79c0108ad00179059cca539e309d',
  'ui/run/relics/mercenary-boat.png': '9e5945cc9c200d1e3818e10f3f6e3494150ce83f30aa95c7e499daa4462ae1e8',
  'ui/run/relics/mercenarys-rifle.png': 'afe1a1f718a4406a60ae85adb002af846ef4a9c6000c20b97d67a0b57c06fa60',
  'ui/run/relics/merchants-shopkey.png': 'c8e0e45f9b863e42401c8e72cf0c42364a3c70c0c8dfb7362978b79e9b5adfa0',
  'ui/run/relics/occult-dagger.png': 'bc7984ccbabf45e39e672957d7ed1e2716c7e82e14b671fcbed38a7f82b9208d',
  'ui/run/relics/training-linens.png': 'e1349bd32f7bcaccbd706dbc55a6f97df8a0dd96533f309d1e2c0ea38aabf461',
});
const RUN_RESOURCE_ICON_COMPONENT = 'run-resource-icon';
const RUN_RESOURCE_ICON_SLOT = /^ui\/run\/resources\/([a-z][a-z0-9-]{0,79})\.png$/;
const GAME_CONDITION_ICON_BY_SLOT = Object.freeze({
  'ui/kit/icons/game/plagued.png': Object.freeze({ component: 'unit-ability-icon', variant: 'plagued' }),
  'ui/kit/icons/card-properties/pestiferous.png': Object.freeze({ component: 'card-property-icon', variant: 'pestiferous' }),
});
const SFX_SAMPLE_COMPONENT = 'sfx-sample';
const SFX_SAMPLE_PROOF_RENDERER = 'SfxViewer/ExactCandidateAudition';
const SFX_SAMPLE_PROOF_SCHEMA = 'sfx-sample-exact-byte-proof-v1';
const SFX_SAMPLE_SLOT = /^sfx\/([a-z0-9][a-z0-9_-]{0,63})\/v([0-9]+)\.(aac|flac|m4a|mp3|oga|ogg|wav|webm)$/;
const SFX_MEDIA_TYPE_BY_EXTENSION = Object.freeze({
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
});

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

function runRelicIconSlotId(slot) {
  const match = RUN_RELIC_ICON_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

function runResourceIconSlotId(slot) {
  const match = RUN_RESOURCE_ICON_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

function gameConditionIconSlot(slot) {
  return GAME_CONDITION_ICON_BY_SLOT[String(slot || '')] ?? null;
}

function sfxSampleSlot(slot) {
  const match = SFX_SAMPLE_SLOT.exec(String(slot || ''));
  if (!match) return null;
  const variantIndex = Number(match[2]);
  if (!Number.isSafeInteger(variantIndex) || variantIndex < 0 || variantIndex > 9999) return null;
  return { soundSetKey: match[1], variantIndex, extension: match[3] };
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

/**
 * Domain-owned runtime projection for one native Run relic icon. Relic
 * membership remains in the drawable catalog; the semantic slot only carries
 * the exact reviewed pixels for that installed record.
 */
function runRelicIconMediaIssue(row, projectedRuntime = null) {
  const relicId = runRelicIconSlotId(row.slot);
  if (!relicId) return 'Run relic icon slots must match ui/run/relics/<relic-id>.png';
  if (row.domain !== 'ui-kit') return 'Run relic icons require the ui-kit domain';
  if (row.role !== 'icon') return 'Run relic icons require the icon role';
  if (row.media_type !== 'image/png') return 'Run relic icons require image/png';
  if (Number(row.width) !== 64 || Number(row.height) !== 64) {
    return 'Run relic icons must be native 64x64 rasters';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run relic icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run relic icon runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_RELIC_ICON_COMPONENT) {
    return `Run relic icon metadata.runtime.component must be ${RUN_RELIC_ICON_COMPONENT}`;
  }
  if (runtime.variant !== relicId) return 'Run relic icon variant must match its semantic slot id';
  if (runtime.frameWidth !== 64 || runtime.frameHeight !== 64 || runtime.frameCount !== 1) {
    return 'Run relic icon runtime geometry must describe one native 64x64 frame';
  }
  if (runtime.nativeRole !== RUN_RELIC_ICON_COMPONENT) {
    return `Run relic icon metadata.runtime.nativeRole must be ${RUN_RELIC_ICON_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Run relic icon metadata.runtime.altText must be empty because the relic label owns its accessible name';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one native Run resource icon. The
 * surrounding live number owns the accessible currency value.
 */
function runResourceIconMediaIssue(row, projectedRuntime = null) {
  const resourceId = runResourceIconSlotId(row.slot);
  if (!resourceId) return 'Run resource icon slots must match ui/run/resources/<resource-id>.png';
  if (row.domain !== 'ui-kit') return 'Run resource icons require the ui-kit domain';
  if (row.role !== 'icon') return 'Run resource icons require the icon role';
  if (row.media_type !== 'image/png') return 'Run resource icons require image/png';
  if (Number(row.width) !== 64 || Number(row.height) !== 64) {
    return 'Run resource icons must be native 64x64 rasters';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run resource icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run resource icon runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_RESOURCE_ICON_COMPONENT) {
    return `Run resource icon metadata.runtime.component must be ${RUN_RESOURCE_ICON_COMPONENT}`;
  }
  if (runtime.variant !== resourceId) return 'Run resource icon variant must match its semantic slot id';
  if (runtime.frameWidth !== 64 || runtime.frameHeight !== 64 || runtime.frameCount !== 1) {
    return 'Run resource icon runtime geometry must describe one native 64x64 frame';
  }
  if (runtime.nativeRole !== RUN_RESOURCE_ICON_COMPONENT) {
    return `Run resource icon metadata.runtime.nativeRole must be ${RUN_RESOURCE_ICON_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Run resource icon metadata.runtime.altText must be empty because the live value owns its accessible name';
  }
  return null;
}

/**
 * Domain-owned runtime projection for the native icons that distinguish a
 * unit condition from the card property that grants it. Their exact semantic
 * slots are closed so an arbitrary ui-kit candidate cannot become runtime UI.
 */
function gameConditionIconMediaIssue(row, projectedRuntime = null) {
  const contract = gameConditionIconSlot(row.slot);
  if (!contract) return 'game condition icons require a registered semantic slot';
  if (row.domain !== 'ui-kit') return 'game condition icons require the ui-kit domain';
  if (row.role !== 'icon') return 'game condition icons require the icon role';
  if (row.media_type !== 'image/png') return 'game condition icons require image/png';
  if (Number(row.width) !== 64 || Number(row.height) !== 64) {
    return 'game condition icons must be native 64x64 rasters';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'game condition icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `game condition icon runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== contract.component) {
    return `game condition icon metadata.runtime.component must be ${contract.component}`;
  }
  if (runtime.variant !== contract.variant) return 'game condition icon variant must match its semantic slot';
  if (runtime.frameWidth !== 64 || runtime.frameHeight !== 64 || runtime.frameCount !== 1) {
    return 'game condition icon runtime geometry must describe one native 64x64 frame';
  }
  if (runtime.nativeRole !== contract.component) {
    return `game condition icon metadata.runtime.nativeRole must be ${contract.component}`;
  }
  if (runtime.altText !== '') {
    return 'game condition icon metadata.runtime.altText must be empty because the adjacent label owns its accessible name';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one authored one-shot take. Sound-set
 * labels, gains, and assignments remain in the DB-owned SFX profile.
 */
function sfxSampleMediaIssue(row, projectedRuntime = null) {
  const slot = sfxSampleSlot(row.slot);
  if (!slot) return 'SFX sample slots must match sfx/<sound-set>/v<n>.<supported-audio-format>';
  if (row.domain !== 'sfx') return 'SFX samples require the sfx domain';
  if (row.role !== 'audio') return 'SFX samples require the audio role';
  if (row.media_type !== SFX_MEDIA_TYPE_BY_EXTENSION[slot.extension]) {
    return 'SFX sample media type must match its slot extension';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'SFX samples require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'state', 'durationMs', 'loop']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `SFX sample runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== SFX_SAMPLE_COMPONENT) {
    return `SFX sample metadata.runtime.component must be ${SFX_SAMPLE_COMPONENT}`;
  }
  if (runtime.variant !== slot.soundSetKey) return 'SFX sample variant must match its sound-set slot key';
  if (runtime.state !== 'one-shot') return 'SFX sample runtime state must be one-shot';
  if (!Number.isSafeInteger(runtime.durationMs) || runtime.durationMs < 1 || runtime.durationMs > 3_600_000) {
    return 'SFX sample runtime durationMs must be a positive bounded integer';
  }
  if (runtime.loop !== false) return 'SFX one-shot runtime loop must be false';
  return null;
}

function sfxSampleOwnerProofIssue(row, proof, surfaceUrl = null) {
  const slot = sfxSampleSlot(row.slot);
  if (!slot) return 'SFX sample proof requires a typed SFX sample slot';
  if (!isObjectRecord(proof) || proof.schema !== SFX_SAMPLE_PROOF_SCHEMA) {
    return `SFX sample review requires ${SFX_SAMPLE_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== SFX_SAMPLE_PROOF_RENDERER
    || proof.exactByteAudition !== true
    || proof.playbackRate !== 1
  ) return 'SFX sample proof must use the exact-byte Studio audition at playback rate 1';
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'SFX sample proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'SFX sample proof surfaceUrl is invalid'; }
  if (
    parsedSurface.pathname !== '/studio'
    || parsedSurface.searchParams.get('mode') !== 'viewer'
    || parsedSurface.searchParams.get('vk') !== 'sfx'
    || parsedSurface.searchParams.get('sfxReview') !== String(row.id)
  ) return 'SFX sample proof must identify its exact Studio candidate audition';

  const runtime = mediaVersionMetadata(row).runtime;
  const decoded = proof.decodedAudio;
  if (
    !isObjectRecord(decoded)
    || !Number.isSafeInteger(decoded.durationMs)
    || Math.abs(decoded.durationMs - Number(runtime?.durationMs)) > 20
    || !Number.isSafeInteger(decoded.sampleRate) || decoded.sampleRate < 8_000 || decoded.sampleRate > 384_000
    || !Number.isSafeInteger(decoded.channels) || decoded.channels < 1 || decoded.channels > 16
  ) return 'SFX sample proof must record valid decoded audio geometry matching the candidate duration';

  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'SFX sample proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'SFX sample proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'SFX sample proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'SFX sample proof slot snapshot is invalid';
  }
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
  if (evidence.schema === RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SCHEMA) {
    const expectedSha256 = RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SHA_BY_SLOT[String(row.slot || '')];
    if (!expectedSha256) return 'ADR-0332 resized production evidence is restricted to its eight Run relic slots';
    if (normalizedSha(row.blob_sha256) !== expectedSha256 || normalizedSha(evidence.outputSha256) !== expectedSha256) {
      return 'ADR-0332 resized production evidence does not authorize these uploaded bytes';
    }
    if (
      evidence.decision !== 'ADR-0332'
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false
      || evidence.spatialResampling !== true
    ) return 'ADR-0332 resized production evidence is incomplete';
    if (
      Number(row.width) !== 64 || Number(row.height) !== 64
      || Number(evidence.outputWidth) !== 64 || Number(evidence.outputHeight) !== 64
      || Number(evidence.sourceWidth) !== 1254 || Number(evidence.sourceHeight) !== 1254
    ) return 'ADR-0332 resized production evidence has invalid source or output dimensions';
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(evidence.sourceVersionId || ''))
      || !normalizedSha(evidence.sourceSha256)
      || evidence.transform !== 'chroma-key-crop-nearest-neighbor-fit-52-alpha-threshold-96'
    ) return 'ADR-0332 resized production evidence is missing its archived source or exact transform';
    return null;
  }
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
  RUN_RELIC_ICON_COMPONENT,
  RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SCHEMA,
  RUN_RESOURCE_ICON_COMPONENT,
  SFX_SAMPLE_COMPONENT,
  SFX_SAMPLE_PROOF_RENDERER,
  SFX_SAMPLE_PROOF_SCHEMA,
  liveCatalogReadinessIssue,
  gameConditionIconMediaIssue,
  gameConditionIconSlot,
  nativeMediaEvidenceIssue,
  predrawnBoardAlignmentIssue,
  predrawnBoardMediaIssue,
  predrawnBoardOwnerProofIssue,
  predrawnBoardSlotSlug,
  preservesNativeEvidenceForUpload,
  runRelicIconMediaIssue,
  runRelicIconSlotId,
  runResourceIconMediaIssue,
  runResourceIconSlotId,
  sfxSampleMediaIssue,
  sfxSampleOwnerProofIssue,
  sfxSampleSlot,
};
