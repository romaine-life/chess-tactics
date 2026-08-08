import {
  normalizePredrawnMoveHighlightProfile,
  predrawnEnvironmentGeometryFingerprintInputV2,
  type EditorBoard,
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
