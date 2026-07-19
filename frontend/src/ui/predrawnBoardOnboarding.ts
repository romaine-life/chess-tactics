import {
  acceptLiveMediaVersions,
  createLiveMediaVersion,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  uploadLiveMediaVersionContent,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaSlot,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';

export const PREDRAWN_BOARD_MEDIA_COMPONENT = 'predrawn-board-plate';
export const PREDRAWN_BOARD_PROOF_SCHEMA = 'predrawn-board-canonical-level-proof-v1';
export const PREDRAWN_BOARD_PROOF_RENDERER = 'LevelEditor/PredrawnBoardLayer';

export interface PredrawnBoardMediaInstallInput {
  levelId: string;
  levelName: string;
  previewSrc: string;
  surfaceUrl: string;
  alignment: string;
  frameWidth: number;
  frameHeight: number;
  provenance: Record<string, unknown>;
}

export interface PredrawnBoardMediaInstallResult {
  slot: string;
  sha256: string;
  version: AdminLiveMediaVersion;
  catalog: AdminLiveMediaCatalog;
  alreadyAccepted: boolean;
}

function normalizedLevelSlug(levelId: string): string {
  return levelId
    .trim()
    .toLowerCase()
    .replace(/^(?:off|usr)-l-/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function predrawnBoardSlotForLevel(levelId: string): string {
  const slug = normalizedLevelSlug(levelId);
  if (!slug) throw new Error('The level id cannot produce a board-media slot.');
  return `boards/${slug}/plate.png`;
}

/** Text provenance for the current isolated Fortress Gate generation run. */
export function predrawnBoardGenerationProvenance(
  levelId: string,
  previewSrc: string,
): Record<string, unknown> {
  const base = {
    pipeline: 'predrawn-board-editor-onboarding-v1',
    levelId,
    reviewedPreview: previewSrc,
  };
  if (
    levelId !== 'off-l-fortress-gate'
    || !previewSrc.endsWith('/fortress-gate-codex-seamless-v1.png')
  ) return base;
  return {
    ...base,
    generator: 'OpenAI image generation',
    generationRunId: 'fortress-gate-isolated-v1',
    packetSha256: 'f29aa39c7e8ea72c9537f1571e92a7b7f1763d5e81fb7e900926bb74290c75dd',
    promptSha256: '72bd42f94209136e2d3af5d557e1cb3fb673b4a47b64b265aa19c113513e4dd8',
    referencesSha256: '8e6c7a18b5205b251af0189143b6fb3f731a1a6bdc6b87e03c68ebd1a30a7fb4',
  };
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: Blob | string): Promise<string> {
  const bytes = typeof value === 'string'
    ? new TextEncoder().encode(value)
    : await value.arrayBuffer();
  return bytesToHex(await crypto.subtle.digest('SHA-256', bytes));
}

function slotFor(catalog: AdminLiveMediaCatalog, slot: string): AdminLiveMediaSlot | undefined {
  return catalog.slots.find((candidate) => candidate.slot === slot);
}

function versionForHash(
  catalog: AdminLiveMediaCatalog,
  slot: string,
  sha256: string,
  status?: AdminLiveMediaVersion['status'],
  alignmentSha256?: string,
): AdminLiveMediaVersion | undefined {
  return catalog.versions.find((version) => (
    version.slot === slot
    && version.media?.sha256 === sha256
    && (status === undefined || version.status === status)
    && (alignmentSha256 === undefined || version.provenance.alignmentSha256 === alignmentSha256)
  ));
}

function acceptedVersionMatchesReview(
  version: AdminLiveMediaVersion | undefined,
  sha256: string,
  alignmentSha256: string,
): version is AdminLiveMediaVersion {
  const evidence = version?.reviewEvidence.evidence;
  return version?.status === 'accepted'
    && version.media?.sha256 === sha256
    && isRecord(evidence)
    && evidence.schema === PREDRAWN_BOARD_PROOF_SCHEMA
    && evidence.previewSha256 === sha256
    && evidence.alignmentSha256 === alignmentSha256;
}

export function predrawnBoardReviewProof(input: {
  install: PredrawnBoardMediaInstallInput;
  slot: AdminLiveMediaSlot;
  version: AdminLiveMediaVersion;
  sha256: string;
  alignmentSha256: string;
}): Record<string, unknown> {
  const { install, slot, version, sha256, alignmentSha256 } = input;
  return {
    schema: PREDRAWN_BOARD_PROOF_SCHEMA,
    surfaceUrl: install.surfaceUrl,
    renderer: PREDRAWN_BOARD_PROOF_RENDERER,
    canonicalScale: 1,
    assetLocalScale: 1,
    deterministicProof: true,
    alignmentApplied: true,
    alignment: install.alignment,
    alignmentSha256,
    previewSha256: sha256,
    boardSlug: normalizedLevelSlug(install.levelId),
    levelId: install.levelId,
    frameWidth: install.frameWidth,
    frameHeight: install.frameHeight,
    selectedCandidates: [{
      slot: slot.slot,
      versionId: version.id,
      sha256,
      rowRevision: version.rowRevision,
    }],
    slotSnapshots: [{
      slot: slot.slot,
      rowRevision: slot.rowRevision,
      activeVersionId: slot.activeVersionId,
    }],
  };
}

/**
 * Upload, hash-pin, review, and atomically accept the exact image already mounted in the Level
 * Editor. Authentication comes from the owner's current same-origin browser session.
 */
export async function installPredrawnBoardMedia(
  install: PredrawnBoardMediaInstallInput,
): Promise<PredrawnBoardMediaInstallResult> {
  const slot = predrawnBoardSlotForLevel(install.levelId);
  const response = await fetch(install.previewSrc, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`The reviewed board image could not be read (${response.status}).`);
  const bytes = await response.blob();
  if (bytes.type && bytes.type !== 'image/png') throw new Error('The reviewed board image must be a PNG.');
  const sha256 = await sha256Hex(bytes);
  const alignmentSha256 = await sha256Hex(install.alignment);

  let catalog = await fetchAdminLiveMediaCatalog();
  let mediaSlot = slotFor(catalog, slot);
  const active = mediaSlot?.activeVersionId
    ? catalog.versions.find((version) => version.id === mediaSlot?.activeVersionId)
    : undefined;
  if (acceptedVersionMatchesReview(active, sha256, alignmentSha256)) {
    return { slot, sha256, version: active, catalog, alreadyAccepted: true };
  }

  let version = versionForHash(catalog, slot, sha256, 'candidate', alignmentSha256);
  if (!version) {
    version = await createLiveMediaVersion({
      slot,
      domain: 'background',
      role: 'media',
      label: `${install.levelName} board background`,
      availabilityPolicy: 'critical',
      slotMetadata: { acceptance: { mode: 'standalone' } },
      metadata: {
        runtime: {
          component: PREDRAWN_BOARD_MEDIA_COMPONENT,
          variant: normalizedLevelSlug(install.levelId),
          frameWidth: install.frameWidth,
          frameHeight: install.frameHeight,
          frameCount: 1,
          altText: '',
        },
      },
      provenance: {
        ...install.provenance,
        reviewedPreview: install.previewSrc,
        reviewedPreviewSha256: sha256,
        alignmentSha256,
      },
      nativeEvidence: {
        native1x: true,
        spatialResampling: false,
        sourceWidth: install.frameWidth,
        sourceHeight: install.frameHeight,
        sourceSha256: sha256,
      },
    }, `predrawn-${normalizedLevelSlug(install.levelId)}-${sha256.slice(0, 24)}-${alignmentSha256.slice(0, 24)}`);
  }

  if (!version.media) {
    version = await uploadLiveMediaVersionContent({
      id: version.id,
      expectedRevision: version.rowRevision,
      bytes,
      mediaType: 'image/png',
    });
  }
  if (version.media?.sha256 !== sha256) {
    throw new Error('The uploaded candidate does not match the image that was reviewed.');
  }

  catalog = await fetchAdminLiveMediaCatalog();
  version = catalog.versions.find((candidate) => candidate.id === version?.id) ?? version;
  mediaSlot = slotFor(catalog, slot);
  if (!mediaSlot) throw new Error(`The permanent image slot ${slot} was not created.`);

  version = await reviewLiveMediaVersion({
    id: version.id,
    expectedRevision: version.rowRevision,
    notes: 'Owner approved this exact image and alignment in the canonical Level Editor.',
    surfaceUrl: install.surfaceUrl,
    evidence: predrawnBoardReviewProof({ install, slot: mediaSlot, version, sha256, alignmentSha256 }),
  });

  catalog = await fetchAdminLiveMediaCatalog();
  version = catalog.versions.find((candidate) => candidate.id === version?.id) ?? version;
  mediaSlot = slotFor(catalog, slot);
  if (!mediaSlot) throw new Error(`The permanent image slot ${slot} disappeared before acceptance.`);
  await acceptLiveMediaVersions([{
    id: version.id,
    expectedRevision: version.rowRevision,
    expectedSlotRevision: mediaSlot.rowRevision,
    expectedActiveVersionId: mediaSlot.activeVersionId,
  }]);

  catalog = await fetchAdminLiveMediaCatalog();
  mediaSlot = slotFor(catalog, slot);
  const accepted = mediaSlot?.activeVersionId
    ? catalog.versions.find((candidate) => candidate.id === mediaSlot?.activeVersionId)
    : undefined;
  if (!accepted || accepted.id !== version.id || accepted.media?.sha256 !== sha256 || accepted.status !== 'accepted') {
    throw new Error('The permanent image pointer did not acknowledge the reviewed candidate.');
  }
  return { slot, sha256, version: accepted, catalog, alreadyAccepted: false };
}
