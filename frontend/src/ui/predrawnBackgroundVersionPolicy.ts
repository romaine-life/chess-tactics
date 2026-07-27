import {
  parsePredrawnBoardRegistration,
  type PredrawnBoardCornerRegistration,
  type PredrawnBoardWorldBounds,
  type VersionedPredrawnBoardSurface,
} from '@chess-tactics/board-render';
import type { PredrawnBackgroundVersion } from '../net/predrawnBackgroundVersions';

const BACKGROUND_VERSION_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:@+-]{1,200}$/;

export function predrawnBackgroundVersionIdempotencyKey(
  kind: 'raw' | 'warp' | 'occlusion',
  semanticSha256: string,
  nonce: string,
): string {
  if (!/^[0-9a-f]{64}$/.test(semanticSha256)) {
    throw new Error('Background version idempotency requires a lowercase semantic SHA-256.');
  }
  const key = `predrawn-${kind}:${semanticSha256}:${nonce}`;
  if (!BACKGROUND_VERSION_IDEMPOTENCY_KEY.test(key)) {
    throw new Error('Background version idempotency key is outside the server contract.');
  }
  return key;
}

export function visiblePredrawnBackgrounds(
  versions: readonly PredrawnBackgroundVersion[],
): PredrawnBackgroundVersion[] {
  return versions.filter((version) => version.kind !== 'occlusion' && version.status !== 'archived');
}

function registrationFromVersion(
  version: PredrawnBackgroundVersion | undefined,
): PredrawnBoardCornerRegistration | undefined {
  const serialized = version?.operation.registration;
  return typeof serialized === 'string' ? parsePredrawnBoardRegistration(serialized) : undefined;
}

/**
 * Read only the registration committed by this exact version. Revision workflows must use this
 * instead of searching a raw source's children because one raw source may seed several attempts.
 */
export function predrawnDirectRegistrationForBackground(
  version: PredrawnBackgroundVersion | undefined,
): PredrawnBoardCornerRegistration | undefined {
  return registrationFromVersion(version);
}

export function predrawnRegistrationForBackground(
  version: PredrawnBackgroundVersion,
  versionsNewestFirst: readonly PredrawnBackgroundVersion[],
): PredrawnBoardCornerRegistration | undefined {
  const direct = registrationFromVersion(version);
  if (direct || version.kind !== 'raw') return direct;
  const newestWarpedChild = versionsNewestFirst.find((candidate) => (
    candidate.kind === 'warped'
    && candidate.status !== 'archived'
    && candidate.parent_version_id === version.id
  ));
  return registrationFromVersion(newestWarpedChild);
}

export function reusablePredrawnRawVersion(
  versions: readonly PredrawnBackgroundVersion[],
  input: {
    documentId: string;
    sourceSha256: string;
    environmentGeometrySha256: string;
    worldBounds: PredrawnBoardWorldBounds;
  },
): PredrawnBackgroundVersion | undefined {
  return versions.find((candidate) => (
    candidate.document_id === input.documentId
    && candidate.kind === 'raw'
    && candidate.status !== 'archived'
    && candidate.provenance.sourceSha256 === input.sourceSha256
    && candidate.provenance.environmentGeometrySha256 === input.environmentGeometrySha256
    && candidate.world_bounds.minX === input.worldBounds.minX
    && candidate.world_bounds.minY === input.worldBounds.minY
    && candidate.world_bounds.width === input.worldBounds.width
    && candidate.world_bounds.height === input.worldBounds.height
  ));
}

export function newestPredrawnBackground(
  versionsNewestFirst: readonly PredrawnBackgroundVersion[],
): PredrawnBackgroundVersion | undefined {
  return versionsNewestFirst[0];
}

export function predrawnMaskHasUsableContent(version: PredrawnBackgroundVersion | undefined): boolean {
  return Boolean(
    version?.kind === 'occlusion'
    && version.content_url
    && version.frame_width
    && version.frame_height
    && (version.status === 'ready' || version.status === 'published'),
  );
}

export function predrawnSelectionMatchesSurface(
  background: PredrawnBackgroundVersion | undefined,
  mask: PredrawnBackgroundVersion | undefined,
  surface: VersionedPredrawnBoardSurface | undefined,
): boolean {
  return Boolean(
    surface
    && surface.backgroundVersionId === background?.id
    && (surface.occlusionVersionId ?? '') === (mask?.id ?? ''),
  );
}

export function predrawnPreferredMaskId(
  backgroundId: string,
  currentSurface?: VersionedPredrawnBoardSurface,
  canonicalSurface?: VersionedPredrawnBoardSurface,
): string {
  if (currentSurface?.backgroundVersionId === backgroundId) {
    return currentSurface.occlusionVersionId ?? '';
  }
  if (canonicalSurface?.backgroundVersionId === backgroundId) {
    return canonicalSurface.occlusionVersionId ?? '';
  }
  return '';
}

export function predrawnBackgroundCanArchive(input: {
  background: PredrawnBackgroundVersion | undefined;
  documentId: string;
  currentSurface?: VersionedPredrawnBoardSurface;
  canonicalSurface?: VersionedPredrawnBoardSurface;
  liveMaskCount: number;
}): boolean {
  const { background } = input;
  return Boolean(
    background
    && background.document_id === input.documentId
    && background.status !== 'published'
    && input.currentSurface?.backgroundVersionId !== background.id
    && input.canonicalSurface?.backgroundVersionId !== background.id
    && input.liveMaskCount === 0,
  );
}
