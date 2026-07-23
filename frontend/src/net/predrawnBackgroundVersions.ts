import type { PredrawnBoardWorldBounds } from '@chess-tactics/board-render';
import { throwEditorDocumentResponseError, type EditorDocumentEditFence } from './editorDocuments';
import { HttpError } from './http';

export type PredrawnBackgroundVersionKind = 'raw' | 'warped' | 'occlusion';
export type PredrawnBackgroundVersionStatus = 'draft' | 'ready' | 'published' | 'archived';

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
  content_sha256: string | null;
  content_url: string | null;
  created_at: string | null;
  created_by: string;
  updated_at: string | null;
}

export interface CreatePredrawnBackgroundVersionInput {
  kind: PredrawnBackgroundVersionKind;
  label: string;
  parent_version_id?: string;
  source_background_version_id?: string;
  world_bounds: PredrawnBoardWorldBounds;
  operation: Record<string, unknown>;
  provenance: Record<string, unknown>;
  idempotency_key: string;
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

export function predrawnBackgroundVersionContentUrl(versionId: string): string {
  return `/api/background-versions/${encodeURIComponent(versionId)}/content`;
}
