import {
  decodeBoard,
  normalizePredrawnMoveHighlightProfile,
  type BoardBackgroundMode,
  type EditorBoard,
  type PredrawnMoveHighlightProfile,
  type PredrawnBoardWorldBounds,
  type PredrawnGenerationFrame,
  type VersionedPredrawnBoardSurface,
} from '@chess-tactics/board-render';
import type {
  PredrawnBackgroundVersion,
  PredrawnGenerationAttempt,
} from '../net/predrawnBackgroundVersions';
import {
  PREDRAWN_BOARD_ARTIFACT_STAGE_TITLE,
  type PredrawnBoardArtifact,
} from './predrawnBoardArtifacts';

export interface PredrawnCreationAttemptModel {
  attempt: PredrawnGenerationAttempt;
  sourceArtwork?: PredrawnBackgroundVersion;
  processing?: {
    board: EditorBoard;
    cells: { x: number; y: number }[];
    generationFrame: PredrawnGenerationFrame;
    worldBounds: PredrawnBoardWorldBounds;
    environmentGeometrySha256: string;
    semanticRequestSha256: string;
  };
  artifacts: PredrawnBoardArtifact[];
  generated?: PredrawnBoardArtifact;
  generatedPending?: PredrawnBackgroundVersion;
  warped?: PredrawnBoardArtifact;
  warpedPending?: PredrawnBackgroundVersion;
  occlusionReady?: PredrawnBoardArtifact;
  occlusionPending?: PredrawnBackgroundVersion;
  moveHighlightProfile?: PredrawnMoveHighlightProfile;
  issue?: string;
}

export interface PredrawnAttemptCreationIntent {
  sourceVersionId: string;
  label: string;
  idempotencyKey: string;
}

export interface PredrawnPipelineSourceAttemptCreationIntent {
  pipelineSourceVersionId: string;
  label: string;
  idempotencyKey: string;
}

export interface PredrawnAttemptArchivePolicy {
  archivable: boolean;
  dormantWorkingSelection: boolean;
  dormantCanonicalSelection: boolean;
  blockedByWorkingSelection: boolean;
  blockedByCanonicalSelection: boolean;
  blockedByPublishedVersion: boolean;
}

export type PredrawnAttemptArchiveActionState =
  | 'no-slot'
  | 'read-only'
  | 'cloud-sync'
  | 'busy'
  | 'working-ai'
  | 'canonical-ai'
  | 'published'
  | 'dormant-legacy'
  | 'unused'
  | 'unavailable';

export interface PredrawnAttemptArchiveAction {
  ready: boolean;
  state: PredrawnAttemptArchiveActionState;
  explanation: string;
}

function surfaceReferencesAttempt(
  surface: VersionedPredrawnBoardSurface | undefined,
  ownedVersionIds: ReadonlySet<string>,
): boolean {
  return Boolean(
    surface
    && (
      ownedVersionIds.has(surface.backgroundVersionId)
      || Boolean(surface.occlusionVersionId && ownedVersionIds.has(surface.occlusionVersionId))
    )
  );
}

/**
 * A slot owns only its deterministic warp and occlusion outputs. Its raw input can be shared by
 * other slots and therefore never makes this slot "in use." Remembered selections protect a slot
 * only while their Level actually renders AI artwork; Legacy selections are dormant and are
 * forgotten atomically by the archive transaction.
 */
export function predrawnAttemptArchivePolicy(input: {
  attempt: Pick<PredrawnGenerationAttempt, 'warped_version_id' | 'occlusion_version_id'> | undefined;
  versions: readonly Pick<PredrawnBackgroundVersion, 'id' | 'status'>[];
  workingBackgroundMode: BoardBackgroundMode;
  workingSurface?: VersionedPredrawnBoardSurface;
  canonicalBackgroundMode?: BoardBackgroundMode;
  canonicalSurface?: VersionedPredrawnBoardSurface;
}): PredrawnAttemptArchivePolicy {
  const ownedVersionIds = new Set([
    input.attempt?.warped_version_id,
    input.attempt?.occlusion_version_id,
  ].filter((id): id is string => Boolean(id)));
  const workingReferencesAttempt = surfaceReferencesAttempt(input.workingSurface, ownedVersionIds);
  const canonicalReferencesAttempt = surfaceReferencesAttempt(input.canonicalSurface, ownedVersionIds);
  const blockedByWorkingSelection = workingReferencesAttempt
    && input.workingBackgroundMode === 'ai';
  // An unresolved canonical mode with a remembered surface fails closed until canonical state loads.
  const blockedByCanonicalSelection = canonicalReferencesAttempt
    && input.canonicalBackgroundMode !== 'legacy';
  const blockedByPublishedVersion = input.versions.some((version) => (
    ownedVersionIds.has(version.id) && version.status === 'published'
  ));
  return {
    archivable: Boolean(
      input.attempt
      && !blockedByWorkingSelection
      && !blockedByCanonicalSelection
      && !blockedByPublishedVersion
    ),
    dormantWorkingSelection: workingReferencesAttempt
      && input.workingBackgroundMode === 'legacy',
    dormantCanonicalSelection: canonicalReferencesAttempt
      && input.canonicalBackgroundMode === 'legacy',
    blockedByWorkingSelection,
    blockedByCanonicalSelection,
    blockedByPublishedVersion,
  };
}

/**
 * Keep the Archive slot button, its visible explanation, and its click handler on one gate.
 * The handler evaluates this same gate again after confirmation so a state change cannot turn an
 * enabled click into a silent return or archive a slot under stale assumptions.
 */
export function predrawnAttemptArchiveAction(input: {
  attemptSelected: boolean;
  canWrite: boolean;
  workingCopySyncState: string;
  busy: boolean;
  policy: PredrawnAttemptArchivePolicy;
  canonicalActionLabel: 'Save' | 'Publish';
}): PredrawnAttemptArchiveAction {
  const state: PredrawnAttemptArchiveActionState = !input.attemptSelected
    ? 'no-slot'
    : !input.canWrite
      ? 'read-only'
      : input.workingCopySyncState !== 'saved'
        ? 'cloud-sync'
        : input.busy
          ? 'busy'
          : input.policy.blockedByWorkingSelection
            ? 'working-ai'
            : input.policy.blockedByCanonicalSelection
              ? 'canonical-ai'
              : input.policy.blockedByPublishedVersion
                ? 'published'
                : !input.policy.archivable
                  ? 'unavailable'
                  : input.policy.dormantWorkingSelection || input.policy.dormantCanonicalSelection
                    ? 'dormant-legacy'
                    : 'unused';
  const explanation = state === 'no-slot'
    ? 'Select a pipeline slot to archive.'
    : state === 'read-only'
      ? 'Reload an owner editing page before archiving a pipeline slot.'
      : state === 'cloud-sync'
        ? 'Wait for cloud autosave to finish before archiving.'
        : state === 'busy'
          ? 'Wait for the current pipeline operation to finish.'
          : state === 'working-ai'
            ? 'This slot supplies the working Level’s active AI background. Switch the working Level to Legacy before archiving it.'
            : state === 'canonical-ai'
              ? `This slot supplies the ${input.canonicalActionLabel === 'Publish' ? 'published' : 'saved'} Level’s active AI background. Switch that canonical Level to Legacy before archiving it.`
              : state === 'published'
                ? 'This slot contains published artwork history and cannot be archived.'
                : state === 'dormant-legacy'
                  ? 'Archiving will forget this slot’s remembered AI selection; Legacy art will not change.'
                  : state === 'unused'
                    ? 'Archiving removes this unused slot from the active pipeline list; its immutable artwork remains retained in history.'
                    : 'This pipeline slot cannot be archived in its current state.';
  return {
    ready: state === 'dormant-legacy' || state === 'unused',
    state,
    explanation,
  };
}

/** Present legacy stored Source Artwork labels in the owner-facing Generation Reference vocabulary. */
export function predrawnGenerationReferenceLabel(
  version: Pick<PredrawnBackgroundVersion, 'label'>,
  fallbackIndex?: number,
): string {
  const stored = version.label.trim();
  const legacyMatch = /^source artwork(?:\s+(\d+))?$/i.exec(stored);
  if (legacyMatch) {
    const suffix = legacyMatch[1] ?? (fallbackIndex === undefined ? '' : String(fallbackIndex + 1));
    return `Generation reference${suffix ? ` ${suffix}` : ''}`;
  }
  return stored || `Generation reference${fallbackIndex === undefined ? '' : ` ${fallbackIndex + 1}`}`;
}

/**
 * Keep one create-attempt intent stable across an uncertain response. A fresh intent is allocated
 * only when the owner chooses another source or the caller clears the acknowledged prior intent.
 */
export function nextPredrawnAttemptCreationIntent(
  current: PredrawnAttemptCreationIntent | undefined,
  sourceVersionId: string,
  label: string,
  nonce: string = crypto.randomUUID(),
): PredrawnAttemptCreationIntent {
  if (current?.sourceVersionId === sourceVersionId) return current;
  return {
    sourceVersionId,
    label,
    idempotencyKey: `attempt:${sourceVersionId}:${nonce}`,
  };
}

export function nextPredrawnPipelineSourceAttemptCreationIntent(
  current: PredrawnPipelineSourceAttemptCreationIntent | undefined,
  pipelineSourceVersionId: string,
  label: string,
  nonce: string = crypto.randomUUID(),
): PredrawnPipelineSourceAttemptCreationIntent {
  if (current?.pipelineSourceVersionId === pipelineSourceVersionId) return current;
  return {
    pipelineSourceVersionId,
    label,
    idempotencyKey: `attempt:pipeline-source:${pipelineSourceVersionId}:${nonce}`,
  };
}

function usable(version: PredrawnBackgroundVersion | undefined): version is PredrawnBackgroundVersion {
  return Boolean(
    version
    && version.status !== 'archived'
    && version.content_sha256
    && version.content_url
    && Number.isSafeInteger(version.frame_width)
    && Number(version.frame_width) > 0
    && Number.isSafeInteger(version.frame_height)
    && Number(version.frame_height) > 0,
  );
}

function sameBounds(
  left: PredrawnBackgroundVersion['world_bounds'],
  right: PredrawnBackgroundVersion['world_bounds'],
): boolean {
  return left.minX === right.minX
    && left.minY === right.minY
    && left.width === right.width
    && left.height === right.height;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function pending(version: PredrawnBackgroundVersion): boolean {
  return version.status === 'draft'
    && !version.content_sha256
    && !version.content_url
    && version.frame_width === null
    && version.frame_height === null;
}

function effectiveEnvironmentGeometrySha256(
  version: PredrawnBackgroundVersion,
): unknown {
  return version.environment_geometry_sha256_v2
    ?? version.operation.environmentGeometrySha256;
}

function sourceProcessingContext(
  attempt: PredrawnGenerationAttempt,
  source: PredrawnBackgroundVersion,
): PredrawnCreationAttemptModel['processing'] | undefined {
  const binding = attempt.source_request;
  const semantic = binding?.semanticRequest;
  const generationReferenceBinding = binding?.schema === 'predrawn-generation-attempt-source-v1';
  const pipelineSourceBinding = binding?.schema === 'predrawn-processing-attempt-input-v1';
  const sourceSemantic = source.operation.semanticRequest;
  const sourceEnvironmentGeometrySha256 = effectiveEnvironmentGeometrySha256(source);
  if (
    (
      !generationReferenceBinding
      && !pipelineSourceBinding
    )
    || (
      generationReferenceBinding
      && (
        attempt.origin !== 'source'
        || binding.sourceArtworkVersionId !== source.id
        || binding.sourceArtworkSha256 !== source.content_sha256
        || binding.semanticRequestSha256 !== source.operation.semanticRequestSha256
        || canonicalJson(semantic) !== canonicalJson(sourceSemantic)
      )
    )
    || (
      pipelineSourceBinding
      && (
        attempt.origin !== 'pipeline-source'
        || binding.inputRole !== 'raw-pipeline-source'
        || binding.inputVersionId !== source.id
        || binding.inputSha256 !== source.content_sha256
        || binding.sourceAttemptId !== attempt.source_attempt_id
      )
    )
    || !digest(binding.requestSha256)
    || !digest(binding.semanticRequestSha256)
    || semantic?.schema !== 'predrawn-generation-semantic-request-v1'
    || semantic.levelId !== attempt.level_id
    || !Number.isSafeInteger(semantic.canonicalDocumentRevision)
    || semantic.canonicalDocumentRevision < 1
    || !digest(semantic.canonicalLevelSha256)
    || !digest(semantic.boardSha256)
    || !digest(semantic.environmentGeometrySha256)
    || semantic.environmentGeometrySchema !== 'predrawn-environment-geometry-v2'
    || !sameBounds(semantic.worldBounds, source.world_bounds)
    || semantic.generationFrame.x !== semantic.worldBounds.minX
    || semantic.generationFrame.y !== semantic.worldBounds.minY
    || semantic.generationFrame.width !== semantic.worldBounds.width
    || semantic.generationFrame.height !== semantic.worldBounds.height
    || semantic.generationFrame.width * 9 !== semantic.generationFrame.height * 16
    || semantic.environmentGeometrySha256 !== sourceEnvironmentGeometrySha256
    || typeof semantic.boardCode !== 'string'
  ) return undefined;
  const board = decodeBoard(semantic.boardCode);
  if (
    !board
    || Object.keys(board.units).length
    || Object.keys(board.cover ?? {}).length
  ) return undefined;
  return {
    board,
    cells: Array.from({ length: board.rows }, (_, y) => (
      Array.from({ length: board.cols }, (__, x) => ({ x, y }))
    )).flat(),
    generationFrame: { ...semantic.generationFrame },
    worldBounds: { ...semantic.worldBounds },
    environmentGeometrySha256: semantic.environmentGeometrySha256,
    semanticRequestSha256: binding.semanticRequestSha256,
  };
}

function generatedSlotIssue(
  version: PredrawnBackgroundVersion,
  attempt: PredrawnGenerationAttempt,
  source: PredrawnBackgroundVersion,
  processing: NonNullable<PredrawnCreationAttemptModel['processing']>,
): string | undefined {
  if (
    version.kind !== 'raw'
    || version.document_id !== attempt.document_id
    || version.level_id !== attempt.level_id
  ) return 'The processing attempt points to the wrong Raw Pipeline Source.';
  if (
    version.parent_version_id
    || version.source_background_version_id
    || !sameBounds(version.world_bounds, processing.worldBounds)
    || effectiveEnvironmentGeometrySha256(version) !== processing.environmentGeometrySha256
  ) {
    return attempt.origin === 'pipeline-source'
      ? 'The saved Pipeline Source does not match this processing attempt.'
      : 'The Raw Pipeline Source does not match the immutable Generation Reference request.';
  }
  if (attempt.origin === 'pipeline-source') {
    if (version.id !== source.id) {
      return 'The pipeline slot does not use its exact saved Raw Pipeline Source.';
    }
  } else if (
    version.operation.sourceArtworkVersionId !== source.id
    || version.operation.sourceArtworkSha256 !== source.content_sha256
    || version.provenance.sourceArtworkVersionId !== source.id
    || version.provenance.sourceArtworkSha256 !== source.content_sha256
  ) {
    return 'The Raw Pipeline Source does not match the immutable Generation Reference request.';
  }
  return undefined;
}

function warpedSlotIssue(
  version: PredrawnBackgroundVersion,
  attempt: PredrawnGenerationAttempt,
  generated: PredrawnBackgroundVersion,
): string | undefined {
  if (
    version.kind !== 'warped'
    || version.document_id !== attempt.document_id
    || version.level_id !== attempt.level_id
    || version.parent_version_id !== generated.id
    || version.source_background_version_id !== generated.id
    || effectiveEnvironmentGeometrySha256(version) !== effectiveEnvironmentGeometrySha256(generated)
    || typeof version.operation.registration !== 'string'
  ) return 'The warped board does not exactly descend from this slot’s Raw Pipeline Source.';
  return undefined;
}

function occlusionSlotIssue(
  version: PredrawnBackgroundVersion,
  attempt: PredrawnGenerationAttempt,
  warped: PredrawnBackgroundVersion,
): string | undefined {
  if (
    version.kind !== 'occlusion'
    || version.document_id !== attempt.document_id
    || version.level_id !== attempt.level_id
    || version.parent_version_id !== null
    || version.source_background_version_id !== warped.id
    || !sameBounds(version.world_bounds, warped.world_bounds)
    || effectiveEnvironmentGeometrySha256(version) !== effectiveEnvironmentGeometrySha256(warped)
  ) return 'The occlusion output does not exactly belong to this slot’s warped board.';
  return undefined;
}

function surfaceFor(
  background: PredrawnBackgroundVersion,
  occlusion?: PredrawnBackgroundVersion,
  moveHighlightProfile?: PredrawnMoveHighlightProfile,
): VersionedPredrawnBoardSurface {
  const base = {
    kind: 'predrawn' as const,
    backgroundVersionId: background.id,
    ...(occlusion ? { occlusionVersionId: occlusion.id } : {}),
    frameWidth: background.frame_width!,
    frameHeight: background.frame_height!,
    worldBounds: { ...background.world_bounds },
  };
  return moveHighlightProfile
    ? {
        ...base,
        schemaVersion: 3,
        moveHighlightProfile,
      }
    : {
        ...base,
        schemaVersion: 2,
      };
}

function generatedArtifact(version: PredrawnBackgroundVersion): PredrawnBoardArtifact {
  return {
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

function warpedArtifact(
  version: PredrawnBackgroundVersion,
  generated: PredrawnBoardArtifact,
  moveHighlightProfile?: PredrawnMoveHighlightProfile,
): PredrawnBoardArtifact {
  return {
    id: version.id,
    stage: 'warped',
    title: PREDRAWN_BOARD_ARTIFACT_STAGE_TITLE.warped,
    version,
    backgroundVersion: version,
    parentArtifactId: generated.id,
    lineageRootVersionId: generated.id,
    surface: surfaceFor(version, undefined, moveHighlightProfile),
  };
}

function occlusionArtifact(
  version: PredrawnBackgroundVersion,
  warped: PredrawnBoardArtifact,
  moveHighlightProfile?: PredrawnMoveHighlightProfile,
): PredrawnBoardArtifact {
  return {
    id: version.id,
    stage: 'occlusion-ready',
    title: PREDRAWN_BOARD_ARTIFACT_STAGE_TITLE['occlusion-ready'],
    version,
    backgroundVersion: warped.backgroundVersion,
    occlusionVersion: version,
    parentArtifactId: warped.id,
    lineageRootVersionId: warped.lineageRootVersionId,
    surface: surfaceFor(warped.backgroundVersion, version, moveHighlightProfile),
  };
}

function moveHighlightProfileForAttempt(
  attempt: PredrawnGenerationAttempt,
  warped: PredrawnBackgroundVersion,
  processing: NonNullable<PredrawnCreationAttemptModel['processing']>,
): { value?: PredrawnMoveHighlightProfile; error?: string } {
  const supplied = [
    attempt.move_highlight_profile,
    attempt.move_highlight_profile_sha256,
    attempt.move_highlight_profile_warped_version_id,
  ];
  if (supplied.every((value) => value === null || value === undefined)) return {};
  if (supplied.some((value) => value === null || value === undefined)) {
    return { error: 'This slot has an incomplete cyan move-highlight calibration.' };
  }
  const profile = normalizePredrawnMoveHighlightProfile(attempt.move_highlight_profile);
  if (
    !profile
    || profile.profileSha256 !== attempt.move_highlight_profile_sha256
    || profile.backgroundVersionId !== warped.id
    || attempt.move_highlight_profile_warped_version_id !== warped.id
    || profile.environmentGeometrySha256 !== processing.environmentGeometrySha256
  ) {
    return { error: 'This slot’s cyan move-highlight calibration does not match its exact warped board.' };
  }
  const playableCellKeys = new Set(Object.keys(processing.board.cells));
  if (Object.keys(profile.cells).some((key) => !playableCellKeys.has(key))) {
    return { error: 'This slot’s cyan move-highlight calibration names a cell outside its exact board.' };
  }
  return { value: profile };
}

/**
 * Resolve server-owned creation attempts into exactly one owner-facing artifact per committed
 * stage. A malformed pointer invalidates that attempt; it never falls back to a nearby lineage.
 */
export function predrawnCreationAttemptModels(
  attempts: readonly PredrawnGenerationAttempt[],
  versions: readonly PredrawnBackgroundVersion[],
): PredrawnCreationAttemptModel[] {
  const byId = new Map(versions.map((version) => [version.id, version]));
  return [...attempts]
    .filter((attempt) => attempt.status !== 'archived')
    .sort((left, right) => (
      Date.parse(right.created_at ?? '') - Date.parse(left.created_at ?? '')
      || right.id.localeCompare(left.id)
    ))
    .map((attempt) => {
      const model: PredrawnCreationAttemptModel = {
        attempt,
        sourceArtwork: attempt.source_version_id ? byId.get(attempt.source_version_id) : undefined,
        artifacts: [],
      };
      if (attempt.origin === 'source' || attempt.origin === 'pipeline-source') {
        const expectedSourceKind = attempt.origin === 'pipeline-source' ? 'raw' : 'source';
        if (!usable(model.sourceArtwork) || model.sourceArtwork.kind !== expectedSourceKind) {
          model.issue = attempt.origin === 'pipeline-source'
            ? 'The saved Raw Pipeline Source selected for this processing attempt is unavailable.'
            : 'The saved Generation Reference for this pipeline slot is unavailable.';
          return model;
        }
        model.processing = sourceProcessingContext(attempt, model.sourceArtwork);
        if (!model.processing) {
          model.issue = attempt.origin === 'pipeline-source'
            ? 'This processing attempt has no valid immutable Pipeline Source request.'
            : 'This pipeline slot has no valid immutable Generation Reference request.';
          return model;
        }
      }

      const generatedVersion = attempt.generated_version_id
        ? byId.get(attempt.generated_version_id)
        : undefined;
      if (attempt.generated_version_id) {
        if (!generatedVersion) {
          model.issue = 'The Raw Pipeline Source selected for this attempt is invalid or unavailable.';
          return model;
        }
        if (attempt.origin === 'source' || attempt.origin === 'pipeline-source') {
          const generatedIssue = generatedSlotIssue(
            generatedVersion,
            attempt,
            model.sourceArtwork!,
            model.processing!,
          );
          if (generatedIssue) {
            model.issue = generatedIssue;
            return model;
          }
        }
        if (pending(generatedVersion)) {
          model.generatedPending = generatedVersion;
          if (attempt.warped_version_id || attempt.occlusion_version_id) {
            model.issue = 'A later pipeline stage cannot exist while the Raw Pipeline Source upload is pending.';
          }
          return model;
        }
        if (!usable(generatedVersion)) {
          model.issue = 'The Raw Pipeline Source selected for this attempt is invalid or unavailable.';
          return model;
        }
        model.generated = generatedArtifact(generatedVersion);
        model.artifacts.push(model.generated);
      }

      const warpedVersion = attempt.warped_version_id
        ? byId.get(attempt.warped_version_id)
        : undefined;
      if (attempt.warped_version_id) {
        if (!model.generated || !warpedVersion) {
          model.issue = 'The warped board does not exactly descend from this slot’s Raw Pipeline Source.';
          return model;
        }
        const warpedIssue = warpedSlotIssue(warpedVersion, attempt, model.generated.version);
        if (warpedIssue) {
          model.issue = warpedIssue;
          return model;
        }
        if (pending(warpedVersion)) {
          model.warpedPending = warpedVersion;
          if (attempt.occlusion_version_id) {
            model.issue = 'An occlusion stage cannot exist while warped artwork upload is pending.';
          }
          return model;
        }
        if (!usable(warpedVersion)) {
          model.issue = 'The warped board does not exactly descend from this slot’s Raw Pipeline Source.';
          return model;
        }
        const moveHighlightProfile = model.processing
          ? moveHighlightProfileForAttempt(attempt, warpedVersion, model.processing)
          : {};
        if (moveHighlightProfile.error) {
          model.issue = moveHighlightProfile.error;
          return model;
        }
        model.moveHighlightProfile = moveHighlightProfile.value;
        model.warped = warpedArtifact(
          warpedVersion,
          model.generated,
          model.moveHighlightProfile,
        );
        model.artifacts.push(model.warped);
      }

      const occlusionVersion = attempt.occlusion_version_id
        ? byId.get(attempt.occlusion_version_id)
        : undefined;
      if (attempt.occlusion_version_id) {
        if (!model.warped || !occlusionVersion) {
          model.issue = 'The occlusion output does not exactly belong to this slot’s warped board.';
          return model;
        }
        const occlusionIssue = occlusionSlotIssue(
          occlusionVersion,
          attempt,
          model.warped.backgroundVersion,
        );
        if (occlusionIssue) {
          model.issue = occlusionIssue;
          return model;
        }
        if (pending(occlusionVersion)) {
          model.occlusionPending = occlusionVersion;
          return model;
        }
        if (
          !usable(occlusionVersion)
          || occlusionVersion.frame_width !== model.warped.backgroundVersion.frame_width
          || occlusionVersion.frame_height !== model.warped.backgroundVersion.frame_height
        ) {
          model.issue = 'The occlusion output does not exactly belong to this slot’s warped board.';
          return model;
        }
        model.occlusionReady = occlusionArtifact(
          occlusionVersion,
          model.warped,
          model.moveHighlightProfile,
        );
        model.artifacts.push(model.occlusionReady);
      }
      return model;
    });
}

export function predrawnAttemptForSurface(
  attempts: readonly PredrawnCreationAttemptModel[],
  surface: VersionedPredrawnBoardSurface | undefined,
): PredrawnCreationAttemptModel | undefined {
  if (!surface) return undefined;
  return attempts.find((attempt) => attempt.artifacts.some((artifact) => (
    artifact.surface.backgroundVersionId === surface.backgroundVersionId
    && artifact.surface.occlusionVersionId === surface.occlusionVersionId
    && (
      artifact.surface.schemaVersion === surface.schemaVersion
      && (
        artifact.surface.schemaVersion === 2
        || (
          surface.schemaVersion === 3
          && artifact.surface.moveHighlightProfile.profileSha256
            === surface.moveHighlightProfile.profileSha256
        )
      )
    )
  )));
}

export function predrawnLatestCommittedArtifact(
  attempt: PredrawnCreationAttemptModel | undefined,
): PredrawnBoardArtifact | undefined {
  return attempt?.occlusionReady ?? attempt?.warped ?? attempt?.generated;
}

export function predrawnAttemptCanProcess(
  attempt: PredrawnCreationAttemptModel | undefined,
): boolean {
  return Boolean(
    attempt
    && ['source', 'pipeline-source'].includes(attempt.attempt.origin)
    && attempt.attempt.status === 'active'
    && attempt.sourceArtwork
    && attempt.processing
    && !attempt.issue,
  );
}
