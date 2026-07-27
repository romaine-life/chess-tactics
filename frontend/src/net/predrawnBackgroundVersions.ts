import type {
  PredrawnBoardWorldBounds,
  PredrawnMoveHighlightCells,
  PredrawnMoveHighlightProfile,
} from '@chess-tactics/board-render';
import type { Level } from '../core/level';
import {
  throwEditorDocumentResponseError,
  type EditorDocument,
  type EditorDocumentEditFence,
} from './editorDocuments';
import { HttpError } from './http';

export type PredrawnBackgroundVersionKind = 'source' | 'raw' | 'warped' | 'occlusion';
export type PredrawnBackgroundVersionStatus = 'draft' | 'ready' | 'published' | 'archived';
export type PredrawnGenerationAttemptStatus = 'active' | 'archived';
export type PredrawnGenerationAttemptOrigin = 'source' | 'pipeline-source' | 'migrated-history';

export interface PredrawnGenerationSemanticRequest {
  schema: 'predrawn-generation-semantic-request-v1';
  levelId: string;
  canonicalDocumentRevision: number;
  canonicalLevelSha256: string;
  boardCode: string;
  boardSha256: string;
  generationFrame: {
    version: 1;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  worldBounds: PredrawnBoardWorldBounds;
  backgroundMode: 'legacy' | 'ai';
  sourceBackgroundVersionId: string | null;
  sourceOcclusionVersionId: string | null;
  environmentGeometrySchema: 'predrawn-environment-geometry-v2';
  environmentGeometrySha256: string;
}

export interface PredrawnGenerationAttemptSourceRequest {
  schema: 'predrawn-generation-attempt-source-v1';
  sourceArtworkVersionId: string;
  sourceArtworkSha256: string;
  semanticRequestSha256: string;
  semanticRequest: PredrawnGenerationSemanticRequest;
  requestSha256: string;
}

export interface PredrawnGenerationAttemptPipelineSourceRequest {
  schema: 'predrawn-processing-attempt-input-v1';
  inputRole: 'raw-pipeline-source';
  inputVersionId: string;
  inputSha256: string;
  sourceAttemptId: string;
  semanticRequestSha256: string;
  semanticRequest: PredrawnGenerationSemanticRequest;
  requestSha256: string;
}

export interface PredrawnBackgroundVersion {
  id: string;
  document_id: string;
  level_id: string;
  kind: PredrawnBackgroundVersionKind;
  label: string;
  parent_version_id: string | null;
  source_background_version_id: string | null;
  status: PredrawnBackgroundVersionStatus;
  row_revision: number;
  frame_width: number | null;
  frame_height: number | null;
  world_bounds: PredrawnBoardWorldBounds;
  operation: Record<string, unknown>;
  provenance: Record<string, unknown>;
  /** Cover-independent v2 geometry, either native metadata or a durable migrated-v1 binding. */
  environment_geometry_sha256_v2: string | null;
  /** Server-owned decision about whether this exact retained raw can seed a processing attempt. */
  pipeline_source_eligible: boolean;
  pipeline_source_issue: string | null;
  content_sha256: string | null;
  content_url: string | null;
  created_at: string | null;
  created_by: string;
  updated_at: string | null;
}

export interface CreatePredrawnBackgroundVersionInput {
  kind: PredrawnBackgroundVersionKind;
  label: string;
  attempt_id?: string;
  parent_version_id?: string;
  source_background_version_id?: string;
  world_bounds?: PredrawnBoardWorldBounds;
  operation: Record<string, unknown>;
  provenance: Record<string, unknown>;
  idempotency_key: string;
}

export interface PredrawnGenerationAttempt {
  id: string;
  document_id: string;
  level_id: string;
  label: string;
  origin: PredrawnGenerationAttemptOrigin;
  source_version_id: string | null;
  source_attempt_id: string | null;
  source_request:
    | PredrawnGenerationAttemptSourceRequest
    | PredrawnGenerationAttemptPipelineSourceRequest
    | null;
  generated_version_id: string | null;
  warped_version_id: string | null;
  occlusion_version_id: string | null;
  move_highlight_profile: PredrawnMoveHighlightProfile | null;
  move_highlight_profile_sha256: string | null;
  move_highlight_profile_warped_version_id: string | null;
  processing_revision: number;
  status: PredrawnGenerationAttemptStatus;
  row_revision: number;
  created_by: string;
  created_at: string | null;
  updated_at: string | null;
  archived_at: string | null;
}

export interface PredrawnGenerationAttemptWorkspaceMutationResult {
  document: EditorDocument;
  forgotten_selection: {
    working_copy: boolean;
    canonical: boolean;
    version_ids: string[];
  };
  canonical_level: Level | null;
  /** CAS token for the canonical workspace identified by document.workspace_kind/workspace_id. */
  workspace_revision: number | null;
  thumbnail_ready: boolean;
  idempotent_replay: boolean;
}

export interface PredrawnGenerationAttemptArchiveResult
  extends PredrawnGenerationAttemptWorkspaceMutationResult {
  attempt: PredrawnGenerationAttempt;
}

export interface PredrawnGenerationAttemptDiscardWarpResult {
  attempt: PredrawnGenerationAttempt;
  discarded_version: PredrawnBackgroundVersion;
  idempotent_replay: boolean;
}

export interface PredrawnGenerationAttemptDiscardOcclusionResult
  extends PredrawnGenerationAttemptWorkspaceMutationResult {
  attempt: PredrawnGenerationAttempt;
  detached_version: PredrawnBackgroundVersion;
  selection: {
    working_copy_fell_back: boolean;
    canonical_reference_retained: boolean;
  };
  detached_version_archived: boolean;
  retained_reason: 'canonical-reference' | 'published-history' | null;
  idempotent_replay: boolean;
}

export interface PredrawnGenerationAttemptMoveHighlightProfileResult {
  attempt: PredrawnGenerationAttempt;
  idempotent_replay: boolean;
}

function finiteNonnegativeInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatRetainedBytes(value: unknown): string | undefined {
  const bytes = finiteNonnegativeInteger(value);
  if (bytes === undefined) return undefined;
  if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / (1024 ** 2)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} bytes`;
}

export function predrawnBackgroundVersionErrorDetails(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as { error?: unknown; details?: unknown };
  const detailText = typeof record.details === 'string' && record.details.trim()
    ? record.details.trim()
    : Array.isArray(record.details)
      ? record.details
        .filter((detail): detail is string => typeof detail === 'string' && Boolean(detail.trim()))
        .map((detail) => detail.trim())
        .join(' ') || undefined
    : undefined;
  if (typeof record.error !== 'string') return undefined;
  const details = record.details && typeof record.details === 'object'
    ? record.details as Record<string, unknown>
    : {};
  if (record.error === 'background_version_document_quota_exceeded') {
    const limit = finiteNonnegativeInteger(details.limit) ?? 256;
    return `This level has reached its ${limit}-version background history limit. Archiving versions does not reclaim this limit; reuse the retained history or move the work to a new level document.`;
  }
  if (record.error === 'background_version_owner_blob_quota_exceeded') {
    const used = formatRetainedBytes(details.used_bytes);
    const limit = formatRetainedBytes(details.limit_bytes);
    const additional = formatRetainedBytes(details.attempted_additional_bytes);
    const usage = used && limit ? ` (${used} of ${limit} retained${additional ? `; this upload adds ${additional}` : ''})` : '';
    return `Background art storage is full${usage}. Reuse an existing exact version or ask an administrator to reclaim retained blob storage.`;
  }
  if (record.error === 'background_version_upload_busy') {
    return 'Another raw background upload for this level is still running. Wait for it to finish, then try again.';
  }
  if (record.error === 'background_version_conflict') {
    const currentRevision = finiteNonnegativeInteger(details.current_revision);
    return `This background version changed during the operation${currentRevision === undefined ? '' : ` (current revision ${currentRevision})`}. Refresh the version list and try again.`;
  }
  if (record.error === 'background_version_schema_contract_violation') {
    const constraint = typeof details.constraint === 'string' ? details.constraint : undefined;
    return `The server database rejected this artwork operation because its schema is incompatible${constraint ? ` (${constraint})` : ''}. The operation was rolled back; report this as a server migration failure.`;
  }
  if (record.error === 'schema_migration_required') {
    return 'The server database is missing a required migration. Nothing was changed. Apply the server migration, then refresh this page and try again.';
  }
  if (record.error === 'schema_migration_history_invalid') {
    return 'The server found that an already-recorded database migration no longer matches the code. Nothing was changed. Restore the original migration and add the fix as a new migration before retrying.';
  }
  if (record.error === 'schema_migration_execution_failed') {
    const failedMigration = details.failed_migration
      && typeof details.failed_migration === 'object'
      && !Array.isArray(details.failed_migration)
      ? details.failed_migration as Record<string, unknown>
      : {};
    const failedVersion = finiteNonnegativeInteger(failedMigration.version);
    const failedName = typeof failedMigration.name === 'string' && failedMigration.name.trim()
      ? failedMigration.name.trim()
      : undefined;
    const failedPhase = typeof failedMigration.phase === 'string' && failedMigration.phase.trim()
      ? failedMigration.phase.trim()
      : typeof details.failed_phase === 'string' && details.failed_phase.trim()
        ? details.failed_phase.trim()
        : undefined;
    const failedIdentity = failedVersion === undefined && !failedName
      ? ''
      : ` Database migration${failedVersion === undefined ? '' : ` ${failedVersion}`}${failedName ? ` ("${failedName}")` : ''} failed${failedPhase ? ` during ${failedPhase}` : ''}.`;
    const phaseOnly = !failedIdentity && failedPhase
      ? ` The migration stopped during ${failedPhase}.`
      : '';
    return `This artwork action did not run because the server database migration stopped.${failedIdentity}${phaseOnly} Check the server migration output, repair or rerun the migration, then refresh this page and try again.`;
  }
  if (
    record.error === 'generation_attempt_not_found'
    || record.error === 'generation_attempt_archived'
  ) {
    return detailText
      ?? 'This pipeline slot changed or was already prepared in another request. Refresh the artwork workspace and continue from the slot now shown.';
  }
  if (record.error === 'generation_attempt_conflict') {
    return detailText
      ?? 'This pipeline slot changed while its grid editor was opening. Refresh the artwork workspace and try Adjust grid again.';
  }
  if (
    record.error === 'generation_attempt_published'
    || record.error === 'generation_attempt_in_use'
  ) {
    return detailText
      ?? 'This slot has an artwork result that is actively used or published, so its raw input cannot replace the slot in place.';
  }
  if (
    record.error === 'generation_attempt_warp_conflict'
    || record.error === 'generation_attempt_warp_not_found'
  ) {
    return detailText
      ?? 'This slot’s warped board changed before it could be discarded. Refresh the artwork workspace and try again from the result now shown.';
  }
  if (record.error === 'generation_attempt_occlusion_exists') {
    return detailText
      ?? 'This slot already has a board with an occlusion mask, so its warped parent cannot be discarded.';
  }
  if (
    record.error === 'generation_attempt_occlusion_conflict'
    || record.error === 'generation_attempt_occlusion_not_found'
  ) {
    return detailText
      ?? 'This slot’s board with an occlusion mask changed before it could be discarded. Refresh the artwork workspace and try again from the result now shown.';
  }
  if (
    record.error === 'generation_attempt_occlusion_parent_missing'
    || record.error === 'generation_attempt_occlusion_reference_invalid'
  ) {
    return detailText
      ?? 'This board with an occlusion mask no longer matches the slot’s warped board. Refresh the artwork workspace before retrying it.';
  }
  if (record.error === 'generation_attempt_warp_published') {
    return detailText
      ?? 'This warped board is published history and cannot be discarded.';
  }
  if (record.error === 'generation_attempt_warp_in_use') {
    return detailText
      ?? 'This warped board is selected by the working or saved Level. Select another board version before discarding it.';
  }
  if (record.error === 'generation_attempt_document_quota_exceeded') {
    return detailText
      ?? 'This slot cannot be continued because the level has reached its retained background-history limit.';
  }
  if (
    record.error === 'generation_attempt_idempotency_conflict'
  ) {
    return detailText
      ?? 'The server could not safely identify this Adjust grid request. Refresh the artwork workspace and try again.';
  }
  if (
    record.error.startsWith('generation_attempt_pipeline_source_')
    || record.error === 'generation_attempt_source_request_invalid'
    || record.error === 'background_source_generation_frame_required'
    || record.error === 'background_source_board_invalid'
    || record.error === 'background_source_level_unsaved'
    || record.error === 'background_source_level_changed'
  ) {
    return detailText
      ?? 'This saved Pipeline Source cannot start a processing attempt. Refresh the artwork workspace and choose an available source.';
  }
  if (
    record.error.includes('move_highlight_profile')
    || record.error === 'invalid_generation_attempt_stage'
  ) {
    return detailText
      ?? 'This cyan cell fit no longer matches the exact warped board. Refresh the pipeline slot and fit it again.';
  }
  return undefined;
}

async function jsonResponse<T>(action: string, response: Response): Promise<T> {
  if (!response.ok) {
    try {
      const body = await response.clone().json();
      const details = predrawnBackgroundVersionErrorDetails(body);
      if (details) throw new HttpError(action, response.status, details);
    } catch (error) {
      if (error instanceof HttpError) throw error;
    }
    return throwEditorDocumentResponseError(action, response);
  }
  return response.json() as Promise<T>;
}

function collectionUrl(documentId: string): string {
  return `/api/editor-documents/${encodeURIComponent(documentId)}/background-versions`;
}

function attemptsUrl(documentId: string): string {
  return `/api/editor-documents/${encodeURIComponent(documentId)}/generation-attempts`;
}

export async function listPredrawnBackgroundVersions(
  documentId: string,
): Promise<PredrawnBackgroundVersion[]> {
  const response = await fetch(collectionUrl(documentId), {
    credentials: 'include',
    cache: 'no-store',
  });
  const body = await jsonResponse<{ versions: PredrawnBackgroundVersion[] }>(
    'list-predrawn-background-versions',
    response,
  );
  return body.versions;
}

export async function createPredrawnBackgroundVersion(
  documentId: string,
  input: CreatePredrawnBackgroundVersionInput,
  fence: EditorDocumentEditFence,
): Promise<PredrawnBackgroundVersion> {
  const response = await fetch(collectionUrl(documentId), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotency_key,
    },
    body: JSON.stringify({ ...input, ...fence }),
  });
  const body = await jsonResponse<{ version: PredrawnBackgroundVersion }>(
    'create-predrawn-background-version',
    response,
  );
  return body.version;
}

export async function uploadPredrawnBackgroundVersionContent(input: {
  documentId: string;
  versionId: string;
  expectedRevision: number;
  bytes: Blob;
  fence: EditorDocumentEditFence;
}): Promise<PredrawnBackgroundVersion> {
  const response = await fetch(
    `${collectionUrl(input.documentId)}/${encodeURIComponent(input.versionId)}/content`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'image/png',
        'If-Match': `"${input.expectedRevision}"`,
        'X-Editor-Edit-Session-Id': input.fence.edit_session_id,
        'X-Editor-Edit-Session-Key': input.fence.edit_session_key,
        'X-Editor-Edit-Generation': String(input.fence.edit_generation),
      },
      body: input.bytes,
    },
  );
  const body = await jsonResponse<{ version: PredrawnBackgroundVersion }>(
    'upload-predrawn-background-version',
    response,
  );
  return body.version;
}

export async function archivePredrawnBackgroundVersion(input: {
  documentId: string;
  versionId: string;
  expectedRevision: number;
  fence: EditorDocumentEditFence;
}): Promise<PredrawnBackgroundVersion> {
  const response = await fetch(
    `${collectionUrl(input.documentId)}/${encodeURIComponent(input.versionId)}/archive`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_revision: input.expectedRevision, ...input.fence }),
    },
  );
  const body = await jsonResponse<{ version: PredrawnBackgroundVersion }>(
    'archive-predrawn-background-version',
    response,
  );
  return body.version;
}

export async function listPredrawnGenerationAttempts(
  documentId: string,
): Promise<PredrawnGenerationAttempt[]> {
  const response = await fetch(attemptsUrl(documentId), {
    credentials: 'include',
    cache: 'no-store',
  });
  const body = await jsonResponse<{ attempts: PredrawnGenerationAttempt[] }>(
    'list-predrawn-generation-attempts',
    response,
  );
  return body.attempts;
}

type CreatePredrawnGenerationAttemptInput = {
  documentId: string;
  label: string;
  idempotencyKey: string;
  fence: EditorDocumentEditFence;
} & (
  | {
      sourceVersionId: string;
      pipelineSourceVersionId?: never;
    }
  | {
      sourceVersionId?: never;
      pipelineSourceVersionId: string;
    }
);

export async function createPredrawnGenerationAttempt(
  input: CreatePredrawnGenerationAttemptInput,
): Promise<PredrawnGenerationAttempt> {
  const sourceBinding = input.pipelineSourceVersionId
    ? {
        pipeline_source_version_id: input.pipelineSourceVersionId,
      }
    : { source_version_id: input.sourceVersionId };
  const response = await fetch(attemptsUrl(input.documentId), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      ...sourceBinding,
      label: input.label,
      idempotency_key: input.idempotencyKey,
      ...input.fence,
    }),
  });
  const body = await jsonResponse<{ attempt: PredrawnGenerationAttempt }>(
    'create-predrawn-generation-attempt',
    response,
  );
  return body.attempt;
}

export async function archivePredrawnGenerationAttempt(input: {
  documentId: string;
  attemptId: string;
  expectedRevision: number;
  documentRevision: number;
  fence: EditorDocumentEditFence;
}): Promise<PredrawnGenerationAttemptArchiveResult> {
  const response = await fetch(
    `${attemptsUrl(input.documentId)}/${encodeURIComponent(input.attemptId)}/archive`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_revision: input.expectedRevision,
        document_revision: input.documentRevision,
        ...input.fence,
      }),
    },
  );
  return jsonResponse<PredrawnGenerationAttemptArchiveResult>(
    'archive-predrawn-generation-attempt',
    response,
  );
}

export async function discardPredrawnGenerationAttemptWarp(input: {
  documentId: string;
  attemptId: string;
  expectedRevision: number;
  expectedWarpedVersionId: string;
  fence: EditorDocumentEditFence;
}): Promise<PredrawnGenerationAttemptDiscardWarpResult> {
  const response = await fetch(
    `${attemptsUrl(input.documentId)}/${encodeURIComponent(input.attemptId)}/discard-warp`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_revision: input.expectedRevision,
        expected_warped_version_id: input.expectedWarpedVersionId,
        ...input.fence,
      }),
    },
  );
  return jsonResponse<PredrawnGenerationAttemptDiscardWarpResult>(
    'discard-predrawn-generation-attempt-warp',
    response,
  );
}

export async function discardPredrawnGenerationAttemptOcclusion(input: {
  documentId: string;
  attemptId: string;
  expectedRevision: number;
  expectedOcclusionVersionId: string;
  documentRevision: number;
  fence: EditorDocumentEditFence;
}): Promise<PredrawnGenerationAttemptDiscardOcclusionResult> {
  const response = await fetch(
    `${attemptsUrl(input.documentId)}/${encodeURIComponent(input.attemptId)}/discard-occlusion`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_revision: input.expectedRevision,
        expected_occlusion_version_id: input.expectedOcclusionVersionId,
        document_revision: input.documentRevision,
        ...input.fence,
      }),
    },
  );
  return jsonResponse<PredrawnGenerationAttemptDiscardOcclusionResult>(
    'discard-predrawn-generation-attempt-occlusion',
    response,
  );
}

export async function updatePredrawnGenerationAttemptMoveHighlightProfile(input: {
  documentId: string;
  attemptId: string;
  expectedRevision: number;
  expectedWarpedVersionId: string;
  cells: PredrawnMoveHighlightCells;
  fence: EditorDocumentEditFence;
}): Promise<PredrawnGenerationAttemptMoveHighlightProfileResult> {
  const response = await fetch(
    `${attemptsUrl(input.documentId)}/${encodeURIComponent(input.attemptId)}/move-highlight-profile`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_revision: input.expectedRevision,
        expected_warped_version_id: input.expectedWarpedVersionId,
        cells: input.cells,
        ...input.fence,
      }),
    },
  );
  return jsonResponse<PredrawnGenerationAttemptMoveHighlightProfileResult>(
    'update-predrawn-generation-attempt-move-highlight-profile',
    response,
  );
}

export function predrawnBackgroundVersionContentUrl(versionId: string): string {
  return `/api/background-versions/${encodeURIComponent(versionId)}/content`;
}
