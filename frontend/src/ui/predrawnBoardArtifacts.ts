import type { VersionedPredrawnBoardSurface } from '@chess-tactics/board-render';
import type { PredrawnBackgroundVersion } from '../net/predrawnBackgroundVersions';

export type PredrawnBoardArtifactStage = 'generated' | 'warped' | 'occlusion-ready';

export const PREDRAWN_BOARD_ARTIFACT_STAGE_TITLE: Readonly<Record<PredrawnBoardArtifactStage, string>> = {
  generated: 'Raw pipeline source',
  warped: 'Warped board',
  'occlusion-ready': 'Board with occlusion mask',
};

/**
 * One owner-facing board artifact. The final stage remains a raster plus its
 * exact depth mask internally, but callers select this single object rather
 * than coordinating two independent controls.
 */
export interface PredrawnBoardArtifact {
  /** The immutable row that gives this artifact its identity. */
  id: string;
  stage: PredrawnBoardArtifactStage;
  title: string;
  version: PredrawnBackgroundVersion;
  backgroundVersion: PredrawnBackgroundVersion;
  occlusionVersion?: PredrawnBackgroundVersion;
  parentArtifactId: string | null;
  lineageRootVersionId: string;
  surface: VersionedPredrawnBoardSurface;
}

export type PredrawnBoardArtifactRejectionReason =
  | 'archived'
  | 'content-not-ready'
  | 'duplicate-id'
  | 'invalid-lineage'
  | 'lineage-cycle'
  | 'missing-parent'
  | 'parent-archived'
  | 'surface-mismatch';

export interface PredrawnBoardArtifactRejection {
  versionId: string;
  reason: PredrawnBoardArtifactRejectionReason;
  detail: string;
}

export interface PredrawnBoardArtifactWorkflow {
  artifacts: PredrawnBoardArtifact[];
  rejected: PredrawnBoardArtifactRejection[];
}

/**
 * Every retained descendant row that must protect one artifact from archive.
 * Draft uploads count even though they are intentionally absent from the
 * selectable artifact model; otherwise an interrupted child upload could be
 * orphaned by archiving its visible parent.
 */
export function predrawnBoardArtifactStoredChildren(
  versions: readonly PredrawnBackgroundVersion[],
  artifact: PredrawnBoardArtifact | undefined,
): PredrawnBackgroundVersion[] {
  if (!artifact) return [];
  return versions.filter((version) => (
    version.status !== 'archived'
    && version.id !== artifact.version.id
    && (
      version.parent_version_id === artifact.version.id
      || version.source_background_version_id === artifact.version.id
    )
  ));
}

function positiveSafeInteger(value: number | null): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function finiteWorldBounds(version: PredrawnBackgroundVersion): boolean {
  const { minX, minY, width, height } = version.world_bounds;
  return Number.isFinite(minX)
    && Number.isFinite(minY)
    && Number.isFinite(width)
    && Number.isFinite(height)
    && width > 0
    && height > 0;
}

function hasUsableContent(version: PredrawnBackgroundVersion): boolean {
  return (version.status === 'ready' || version.status === 'published')
    && Boolean(version.content_sha256)
    && Boolean(version.content_url)
    && positiveSafeInteger(version.frame_width)
    && positiveSafeInteger(version.frame_height)
    && finiteWorldBounds(version);
}

function sameWorldBounds(
  left: PredrawnBackgroundVersion['world_bounds'],
  right: PredrawnBackgroundVersion['world_bounds'],
): boolean {
  return left.minX === right.minX
    && left.minY === right.minY
    && left.width === right.width
    && left.height === right.height;
}

function sameScope(left: PredrawnBackgroundVersion, right: PredrawnBackgroundVersion): boolean {
  return left.document_id === right.document_id && left.level_id === right.level_id;
}

function surfaceFor(
  background: PredrawnBackgroundVersion,
  occlusion?: PredrawnBackgroundVersion,
): VersionedPredrawnBoardSurface {
  return {
    kind: 'predrawn',
    schemaVersion: 2,
    backgroundVersionId: background.id,
    ...(occlusion ? { occlusionVersionId: occlusion.id } : {}),
    frameWidth: background.frame_width!,
    frameHeight: background.frame_height!,
    worldBounds: { ...background.world_bounds },
  };
}

function versionOrder(left: PredrawnBackgroundVersion, right: PredrawnBackgroundVersion): number {
  const leftTime = Date.parse(left.created_at ?? '');
  const rightTime = Date.parse(right.created_at ?? '');
  const normalizedLeft = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
  const normalizedRight = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;
  return normalizedRight - normalizedLeft || left.id.localeCompare(right.id);
}

const CHILD_STAGE_ORDER: Readonly<Record<PredrawnBoardArtifactStage, number>> = {
  generated: 0,
  warped: 1,
  'occlusion-ready': 2,
};

function artifactSiblingOrder(left: PredrawnBoardArtifact, right: PredrawnBoardArtifact): number {
  return CHILD_STAGE_ORDER[left.stage] - CHILD_STAGE_ORDER[right.stage]
    || versionOrder(left.version, right.version);
}

/**
 * Adapt immutable raster/mask rows into the linear board-artifact vocabulary.
 *
 * Input order is irrelevant. Roots and sibling alternatives are newest first,
 * while every parent is emitted before its descendants. Invalid lineage never
 * produces a partially usable artifact or Level surface.
 */
export function predrawnBoardArtifactWorkflow(
  versions: readonly PredrawnBackgroundVersion[],
): PredrawnBoardArtifactWorkflow {
  const idCounts = new Map<string, number>();
  for (const version of versions) idCounts.set(version.id, (idCounts.get(version.id) ?? 0) + 1);

  const byId = new Map<string, PredrawnBackgroundVersion>();
  for (const version of [...versions].sort(versionOrder)) {
    if (idCounts.get(version.id) === 1) byId.set(version.id, version);
  }

  const artifactsById = new Map<string, PredrawnBoardArtifact | null>();
  const rejectionsById = new Map<string, PredrawnBoardArtifactRejection>();
  const resolving = new Set<string>();

  const reject = (
    version: PredrawnBackgroundVersion,
    reason: PredrawnBoardArtifactRejectionReason,
    detail: string,
  ): null => {
    if (!rejectionsById.has(version.id)) {
      rejectionsById.set(version.id, { versionId: version.id, reason, detail });
    }
    artifactsById.set(version.id, null);
    return null;
  };

  for (const version of versions) {
    if ((idCounts.get(version.id) ?? 0) > 1) {
      reject(version, 'duplicate-id', 'The immutable version id appears more than once.');
    }
  }

  const resolve = (version: PredrawnBackgroundVersion): PredrawnBoardArtifact | null => {
    if (artifactsById.has(version.id)) return artifactsById.get(version.id) ?? null;
    if (resolving.has(version.id)) {
      return reject(version, 'lineage-cycle', 'The immutable version lineage contains a cycle.');
    }
    if (version.status === 'archived') {
      return reject(version, 'archived', 'Archived versions are retained history, not selectable artifacts.');
    }
    if (!hasUsableContent(version)) {
      return reject(version, 'content-not-ready', 'The immutable PNG content or dimensions are not ready.');
    }

    resolving.add(version.id);
    let artifact: PredrawnBoardArtifact | null = null;

    if (version.kind === 'raw') {
      if (version.parent_version_id || version.source_background_version_id) {
        artifact = reject(version, 'invalid-lineage', 'A generated board cannot have a parent or source raster.');
      } else {
        artifact = {
          id: version.id,
          stage: 'generated',
          title: PREDRAWN_BOARD_ARTIFACT_STAGE_TITLE.generated,
          version,
          backgroundVersion: version,
          parentArtifactId: null,
          lineageRootVersionId: version.id,
          surface: surfaceFor(version),
        };
      }
    } else if (version.kind === 'warped') {
      const parentId = version.parent_version_id;
      if (!parentId || version.source_background_version_id !== parentId) {
        artifact = reject(version, 'invalid-lineage', 'A warped board must name one identical raw parent and source.');
      } else {
        const parent = byId.get(parentId);
        if (!parent) {
          artifact = reject(version, 'missing-parent', 'The warped board raw parent is unavailable.');
        } else if (parent.status === 'archived') {
          artifact = reject(version, 'parent-archived', 'The warped board raw parent is archived.');
        } else if (parent.kind !== 'raw' || !sameScope(version, parent)) {
          artifact = reject(version, 'invalid-lineage', 'The warped board parent is not a raw board in this lineage.');
        } else {
          const parentArtifact = resolve(parent);
          if (!parentArtifact) {
            artifact = reject(version, 'missing-parent', 'The warped board raw parent is not a usable artifact.');
          } else {
            artifact = {
              id: version.id,
              stage: 'warped',
              title: PREDRAWN_BOARD_ARTIFACT_STAGE_TITLE.warped,
              version,
              backgroundVersion: version,
              parentArtifactId: parentArtifact.id,
              lineageRootVersionId: parentArtifact.lineageRootVersionId,
              surface: surfaceFor(version),
            };
          }
        }
      }
    } else {
      const sourceId = version.source_background_version_id;
      const source = sourceId ? byId.get(sourceId) : undefined;
      if (!sourceId || !source) {
        artifact = reject(version, 'missing-parent', 'The source raster for this board with an occlusion mask is unavailable.');
      } else if (source.status === 'archived') {
        artifact = reject(version, 'parent-archived', 'The source raster for this board with an occlusion mask is archived.');
      } else if (source.kind !== 'warped' || !sameScope(version, source)) {
        artifact = reject(version, 'invalid-lineage', 'A board with an occlusion mask must descend from a warped board in this lineage.');
      } else {
        const sourceArtifact = resolve(source);
        if (!sourceArtifact) {
          artifact = reject(version, 'missing-parent', 'The source for this board with an occlusion mask is not usable.');
        } else if (
          version.frame_width !== source.frame_width
          || version.frame_height !== source.frame_height
          || !sameWorldBounds(version.world_bounds, source.world_bounds)
        ) {
          artifact = reject(version, 'surface-mismatch', 'The occlusion output does not exactly match its source board.');
        } else {
          let parentArtifactId = sourceArtifact.id;
          if (version.parent_version_id) {
            const parent = byId.get(version.parent_version_id);
            if (!parent) {
              artifact = reject(version, 'missing-parent', 'The prior board with an occlusion mask is unavailable.');
            } else if (parent.status === 'archived') {
              artifact = reject(version, 'parent-archived', 'The prior board with an occlusion mask is archived.');
            } else if (
              parent.kind !== 'occlusion'
              || parent.source_background_version_id !== sourceId
              || !sameScope(version, parent)
            ) {
              artifact = reject(version, 'invalid-lineage', 'The occlusion refinement parent belongs to another board.');
            } else {
              const parentArtifact = resolve(parent);
              if (!parentArtifact) {
                artifact = reject(version, 'missing-parent', 'The prior board with an occlusion mask is not usable.');
              } else {
                parentArtifactId = parentArtifact.id;
              }
            }
          }
          if (!artifact && !rejectionsById.has(version.id)) {
            artifact = {
              id: version.id,
              stage: 'occlusion-ready',
              title: PREDRAWN_BOARD_ARTIFACT_STAGE_TITLE['occlusion-ready'],
              version,
              backgroundVersion: source,
              occlusionVersion: version,
              parentArtifactId,
              lineageRootVersionId: sourceArtifact.lineageRootVersionId,
              surface: surfaceFor(source, version),
            };
          }
        }
      }
    }

    resolving.delete(version.id);
    artifactsById.set(version.id, artifact);
    return artifact;
  };

  for (const version of byId.values()) resolve(version);

  const artifacts = [...artifactsById.values()].filter(
    (artifact): artifact is PredrawnBoardArtifact => artifact !== null,
  );
  const children = new Map<string, PredrawnBoardArtifact[]>();
  const roots: PredrawnBoardArtifact[] = [];
  for (const artifact of artifacts) {
    if (!artifact.parentArtifactId) {
      roots.push(artifact);
      continue;
    }
    const siblings = children.get(artifact.parentArtifactId) ?? [];
    siblings.push(artifact);
    children.set(artifact.parentArtifactId, siblings);
  }
  roots.sort((left, right) => versionOrder(left.version, right.version));
  for (const siblings of children.values()) siblings.sort(artifactSiblingOrder);

  const ordered: PredrawnBoardArtifact[] = [];
  const append = (artifact: PredrawnBoardArtifact): void => {
    ordered.push(artifact);
    for (const child of children.get(artifact.id) ?? []) append(child);
  };
  for (const root of roots) append(root);

  return {
    artifacts: ordered,
    rejected: [...rejectionsById.values()].sort((left, right) => left.versionId.localeCompare(right.versionId)),
  };
}

/** Return a defensive copy of the one exact Level selection owned by an artifact. */
export function predrawnBoardSurfaceForArtifact(
  artifact: PredrawnBoardArtifact,
): VersionedPredrawnBoardSurface {
  const surface = {
    ...artifact.surface,
    worldBounds: { ...artifact.surface.worldBounds },
  };
  return surface.schemaVersion === 3
    ? {
        ...surface,
        moveHighlightProfile: {
          ...surface.moveHighlightProfile,
          cells: Object.fromEntries(
            Object.entries(surface.moveHighlightProfile.cells).map(([key, footprint]) => [
              key,
              [...footprint],
            ]),
          ),
        },
      }
    : surface;
}

export function predrawnBoardSurfacesEqual(
  left: VersionedPredrawnBoardSurface | undefined,
  right: VersionedPredrawnBoardSurface | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.backgroundVersionId === right.backgroundVersionId
    && left.occlusionVersionId === right.occlusionVersionId
    && left.frameWidth === right.frameWidth
    && left.frameHeight === right.frameHeight
    && left.worldBounds.minX === right.worldBounds.minX
    && left.worldBounds.minY === right.worldBounds.minY
    && left.worldBounds.width === right.worldBounds.width
    && left.worldBounds.height === right.worldBounds.height
    && left.schemaVersion === right.schemaVersion
    && (
      left.schemaVersion === 2
      || (
        right.schemaVersion === 3
        && left.moveHighlightProfile.profileSha256
          === right.moveHighlightProfile.profileSha256
      )
    );
}

/** Resolve a working/canonical Level selection back to its single UI artifact. */
export function predrawnBoardArtifactForSurface(
  artifacts: readonly PredrawnBoardArtifact[],
  surface: VersionedPredrawnBoardSurface | undefined,
): PredrawnBoardArtifact | undefined {
  if (!surface) return undefined;
  const artifactId = surface.occlusionVersionId ?? surface.backgroundVersionId;
  const artifact = artifacts.find((candidate) => candidate.id === artifactId);
  if (!artifact) return undefined;
  const expected = artifact.surface;
  if (!predrawnBoardSurfacesEqual(expected, surface)) return undefined;
  return artifact;
}
