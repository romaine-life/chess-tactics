import {
  isVersionedPredrawnBoardSurface,
  normalizePredrawnMoveHighlightProfile,
  predrawnEnvironmentGeometryFingerprintInputV2,
  type EditorBoard,
  type PredrawnBoardSurface,
  type VersionedPredrawnBoardSurface,
} from '@chess-tactics/board-render';
import type { PredrawnBackgroundVersion } from '../net/predrawnBackgroundVersions';
import {
  predrawnBoardArtifactForSurface,
  predrawnBoardArtifactWorkflow,
  type PredrawnBoardArtifact,
} from './predrawnBoardArtifacts';

export type PredrawnEnvironmentGeometryDigests = {
  v1: string;
  v2: string;
};

export type PredrawnEnvironmentGeometryReference = {
  schema: 'predrawn-environment-geometry-v1' | 'predrawn-environment-geometry-v2';
  sha256: string;
};

/**
 * A session handoff may hydrate the exact board already on screen. Preserve the completed
 * immutable-art validation in that case; resetting it to `checking` without changing this input
 * would leave the AI plate hidden because the validation effect has no reason to run again.
 */
export function predrawnSelectionNeedsRevalidation(
  current: EditorBoard,
  next: EditorBoard,
): boolean {
  return JSON.stringify(current.surface) !== JSON.stringify(next.surface)
    || predrawnEnvironmentGeometryFingerprintInputV2(current)
      !== predrawnEnvironmentGeometryFingerprintInputV2(next);
}

export type PredrawnSelectionValidity =
  | { kind: 'missing' }
  | { kind: 'unavailable' }
  | { kind: 'stale'; artifact: PredrawnBoardArtifact }
  | { kind: 'valid'; artifact: PredrawnBoardArtifact };

/**
 * The version list could not be READ.
 *
 * This is never a verdict about the artwork. The level's selection, its published raster and its
 * lineage are all untouched; the only thing missing is the answer. A backend restart or an expired
 * sign-in must therefore leave a state that retries, not a permanent one that hides a plate the
 * level still holds (ADR-0521).
 */
export type PredrawnSelectionReadFailure = {
  kind: 'unreachable';
  /** True only for an authoritative 401, which ADR-0306's session owner must also be told about. */
  signedOut: boolean;
  message: string;
};

/**
 * An installed board plate: the pre-pipeline selection, a live-media slot plus its own frame size
 * and hand registration.
 *
 * It is a SETTLED state, and a drawable one. There is no version list to ask about, because a plate
 * has no pipeline lineage — it is complete in the board code that names it, and the renderer resolves
 * it straight from the media catalog. Treating "not a versioned selection" as `missing` said a level
 * holding artwork held none, and hid a plate that serves perfectly (ADR-0528).
 */
export type PredrawnSelectionPlate = { kind: 'plate' };

/** Every state the editor can hold for its remembered selection, settled or not. */
export type PredrawnSelectionCheck =
  | PredrawnSelectionValidity
  | PredrawnSelectionPlate
  | { kind: 'checking' }
  // The check could not be ATTEMPTED — distinct from a read that was attempted and failed, because
  // this one clears when its missing input arrives rather than by asking the server again.
  | { kind: 'error'; message: string }
  | PredrawnSelectionReadFailure;

/**
 * The state a board's own surface settles into before any server read.
 *
 * Every place that re-seeds the check — mount, document load, commit, undo, redo — must ask this
 * one question, so a plate can never be re-seeded as `missing` by one path that forgot about it.
 */
export function predrawnSelectionSeed(
  surface: PredrawnBoardSurface | undefined,
): PredrawnSelectionCheck {
  if (!surface) return { kind: 'missing' };
  return isVersionedPredrawnBoardSurface(surface) ? { kind: 'checking' } : { kind: 'plate' };
}

/**
 * Whether the remembered selection has been proven enough to PAINT.
 *
 * Fail-closed still governs versioned artwork: only a `valid` lineage draws. A plate is proven by
 * being one, so it is the one settled state that needs no list.
 */
export function predrawnSelectionIsDrawable(check: PredrawnSelectionCheck): boolean {
  return check.kind === 'valid' || check.kind === 'plate';
}

export function predrawnSelectionReadFailure(
  cause: unknown,
  signedOut: boolean,
): PredrawnSelectionReadFailure {
  return {
    kind: 'unreachable',
    signedOut,
    message: cause instanceof Error
      ? cause.message
      : 'The immutable artwork selection could not be checked.',
  };
}

/**
 * Only an unread list is worth asking about again. `stale` and `unavailable` are settled answers
 * about the artwork itself, and retrying them would spin against a server that keeps saying the
 * same thing; `missing` has nothing to ask about at all.
 */
export function predrawnSelectionReadShouldRetry(
  check: PredrawnSelectionCheck,
): check is PredrawnSelectionReadFailure {
  return check.kind === 'unreachable';
}

export function predrawnEnvironmentGeometryFromVersion(
  version: PredrawnBackgroundVersion | undefined,
): PredrawnEnvironmentGeometryReference | undefined {
  const migratedV2 = version?.environment_geometry_sha256_v2;
  if (typeof migratedV2 === 'string' && /^[0-9a-f]{64}$/.test(migratedV2)) {
    return { schema: 'predrawn-environment-geometry-v2', sha256: migratedV2 };
  }
  const digest = version?.operation.environmentGeometrySha256;
  const schema = version?.operation.environmentGeometrySchema;
  if (
    typeof digest !== 'string'
    || !/^[0-9a-f]{64}$/.test(digest)
    || (schema !== 'predrawn-environment-geometry-v1' && schema !== 'predrawn-environment-geometry-v2')
  ) return undefined;
  return { schema, sha256: digest };
}

export function predrawnEnvironmentGeometryMatches(
  reference: PredrawnEnvironmentGeometryReference | undefined,
  current: PredrawnEnvironmentGeometryDigests,
): boolean {
  if (!reference) return false;
  return reference.sha256 === (reference.schema === 'predrawn-environment-geometry-v2'
    ? current.v2
    : current.v1);
}

/**
 * Resolve the remembered Level surface against the exact usable immutable artifact and the
 * current baked-environment geometry. Every missing metadata or lineage case fails closed.
 */
export function predrawnSelectionValidity(
  surface: VersionedPredrawnBoardSurface | undefined,
  versions: readonly PredrawnBackgroundVersion[],
  currentGeometry: PredrawnEnvironmentGeometryDigests,
  currentBoard?: Pick<EditorBoard, 'cells'> & { predrawnGridDetached?: boolean },
): PredrawnSelectionValidity {
  // The owner has placed this grid over the plate by hand, so "does the raster depict this exact
  // terrain" is a question they have already answered. Identity, lineage, completeness, and
  // profile binding are all still proven below; only the geometry comparison is skipped.
  const gridDetached = currentBoard?.predrawnGridDetached === true;
  if (!surface) return { kind: 'missing' };
  const workflow = predrawnBoardArtifactWorkflow(versions);
  const lineageSurface: VersionedPredrawnBoardSurface = surface.schemaVersion === 3
    ? {
        kind: 'predrawn',
        schemaVersion: 2,
        backgroundVersionId: surface.backgroundVersionId,
        ...(surface.occlusionVersionId ? { occlusionVersionId: surface.occlusionVersionId } : {}),
        frameWidth: surface.frameWidth,
        frameHeight: surface.frameHeight,
        worldBounds: { ...surface.worldBounds },
      }
    : surface;
  const lineageArtifact = predrawnBoardArtifactForSurface(workflow.artifacts, lineageSurface);
  if (!lineageArtifact) return { kind: 'unavailable' };
  const artifact = surface.schemaVersion === 3
    ? { ...lineageArtifact, surface }
    : lineageArtifact;
  if (surface.schemaVersion === 3) {
    const profile = normalizePredrawnMoveHighlightProfile(surface.moveHighlightProfile);
    if (
      !profile
      || !currentBoard
      || lineageArtifact.stage === 'generated'
      || profile.backgroundVersionId !== surface.backgroundVersionId
      // A calibrated cell that the board no longer has is a broken profile only while the grid
      // still claims to be the artwork's own. Once the owner has moved or resized it, the cells
      // that fall away are simply uncalibrated and fall back to the full-cell highlight.
      || (!gridDetached && Object.keys(profile.cells).some((key) => !(key in currentBoard.cells)))
    ) {
      return { kind: 'unavailable' };
    }
    if (!gridDetached && profile.environmentGeometrySha256 !== currentGeometry.v2) {
      return { kind: 'stale', artifact };
    }
  }
  const versionsToValidate = [
    artifact.backgroundVersion,
    ...(artifact.occlusionVersion ? [artifact.occlusionVersion] : []),
  ];
  if (!gridDetached && versionsToValidate.some((version) => !predrawnEnvironmentGeometryMatches(
    predrawnEnvironmentGeometryFromVersion(version),
    currentGeometry,
  ))) {
    return { kind: 'stale', artifact };
  }
  return { kind: 'valid', artifact };
}
