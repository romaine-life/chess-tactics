import type { Level } from '../core/level';
import { HttpError } from './http';

export type EditorDocumentWorkspaceKind = 'user' | 'official';

/**
 * User workspaces are the default and must be omitted. Official editors select
 * the canonical workspace explicitly so the same level id cannot resolve into
 * the wrong document.
 */
export interface EditorDocumentWorkspaceSelector {
  workspace_kind: 'official';
  workspace_id: string;
}

export interface EditorDocument {
  /** Opaque, globally unique identity used in editor URLs and API paths. */
  document_id: string;
  level_id: string;
  workspace_kind: EditorDocumentWorkspaceKind;
  workspace_id: string;
  level: Level;
  revision: number;
  saved_revision: number;
  dirty: boolean;
  has_saved_baseline: boolean;
  never_saved: boolean;
  /** The canonical saved level changed after this dirty working copy branched. */
  baseline_conflict: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export type EditorDocumentListStatus = 'all' | 'dirty' | 'never-saved';

/** Private, account-scoped metadata for discovery UI. It deliberately omits the Level body. */
export interface EditorDocumentSummary {
  document_id: string;
  level_id: string;
  workspace_kind: EditorDocumentWorkspaceKind;
  workspace_id: string;
  name: string;
  revision: number;
  saved_revision: number;
  dirty: boolean;
  has_saved_baseline: boolean;
  never_saved: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface EditorDocumentListResult {
  documents: EditorDocumentSummary[];
  next_offset: number | null;
}

interface EditorDocumentResponse {
  document: EditorDocument;
  workspace_revision?: unknown;
}

export interface EditorDocumentSaveResult {
  document: EditorDocument;
  /** Canonical workspace CAS token advanced by the same Save transaction. */
  workspace_revision: number | null;
}

const EDITOR_REQUEST_TIMEOUT_MS = 15_000;

async function editorDocumentFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), EDITOR_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export class EditorDocumentConflictError extends HttpError {
  readonly document: EditorDocument;
  readonly conflict: 'revision' | 'baseline';

  constructor(
    action: string,
    document: EditorDocument,
    conflict: 'revision' | 'baseline' = 'revision',
    details = conflict === 'baseline' ? 'editor_document_baseline_conflict' : 'editor_document_revision_conflict',
  ) {
    super(action, 409, details);
    this.name = 'EditorDocumentConflictError';
    this.document = document;
    this.conflict = conflict;
  }
}

export function isEditorDocumentConflict(error: unknown): error is EditorDocumentConflictError {
  return error instanceof EditorDocumentConflictError;
}

export function isEditorDocumentBaselineConflict(error: unknown): error is EditorDocumentConflictError {
  return error instanceof EditorDocumentConflictError && error.conflict === 'baseline';
}

function workspaceFields(workspace?: EditorDocumentWorkspaceSelector): Record<string, string> {
  if (!workspace) return {};
  return {
    workspace_kind: workspace.workspace_kind,
    workspace_id: workspace.workspace_id,
  };
}

function documentUrl(documentId: string): string {
  return `/api/editor-documents/${encodeURIComponent(documentId)}`;
}

function errorDetails(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as { error?: unknown; details?: unknown };
  const parts = [record.error, record.details]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return parts.length ? parts.join(': ') : undefined;
}

async function documentFromResponse(action: string, response: Response): Promise<EditorDocument> {
  if (!response.ok) {
    if (response.status === 409) {
      try {
        const body = await response.clone().json() as Partial<EditorDocumentResponse> & {
          error?: unknown;
          details?: unknown;
        };
        if (body.document) {
          const conflict = body.error === 'editor_document_baseline_conflict' ? 'baseline' : 'revision';
          throw new EditorDocumentConflictError(action, body.document, conflict, errorDetails(body));
        }
      } catch (error) {
        if (error instanceof EditorDocumentConflictError) throw error;
        // A malformed conflict response still falls through to a normal
        // HttpError, preserving the status and any textual backend detail.
      }
    }
    throw await HttpError.fromResponse(action, response);
  }
  return ((await response.json()) as EditorDocumentResponse).document;
}

async function postDocument(
  action: string,
  url: string,
  body: Record<string, unknown>,
): Promise<EditorDocument> {
  const response = await editorDocumentFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  return documentFromResponse(action, response);
}

/** Resolve (or initialize) the signed-in user's working copy for a saved level. */
export function resolveEditorDocument(
  levelId: string,
  workspace?: EditorDocumentWorkspaceSelector,
): Promise<EditorDocument> {
  return postDocument('resolve-editor-document', '/api/editor-documents/resolve', {
    level_id: levelId,
    ...workspaceFields(workspace),
  });
}

/**
 * Create a new unsaved working document. The backend assigns the durable level
 * id immediately; the canonical level is created only by an explicit Save.
 */
export function createEditorDocument(
  level: Level,
  workspace?: EditorDocumentWorkspaceSelector,
): Promise<EditorDocument> {
  return postDocument('create-editor-document', '/api/editor-documents/resolve', {
    level,
    ...workspaceFields(workspace),
  });
}

/** Load an existing working copy by its opaque document identity. */
export async function loadEditorDocument(
  documentId: string,
): Promise<EditorDocument> {
  const response = await editorDocumentFetch(documentUrl(documentId), {
    method: 'GET',
    credentials: 'include',
    cache: 'no-cache',
  });
  return documentFromResponse('load-editor-document', response);
}

/**
 * Discover the signed-in account's recent private working copies. Reading this list neither
 * creates documents nor grants access; opening a result uses its existing opaque document id.
 */
export async function listEditorDocuments(options: {
  status?: EditorDocumentListStatus;
  limit?: number;
  offset?: number;
} = {}): Promise<EditorDocumentListResult> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const query = params.toString();
  const response = await editorDocumentFetch(`/api/editor-documents${query ? `?${query}` : ''}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-cache',
  });
  if (!response.ok) throw await HttpError.fromResponse('list-editor-documents', response);
  const body = await response.json() as Partial<EditorDocumentListResult>;
  return {
    documents: Array.isArray(body.documents) ? body.documents : [],
    next_offset: typeof body.next_offset === 'number' && Number.isSafeInteger(body.next_offset)
      ? body.next_offset
      : null,
  };
}

/** Persist a document using compare-and-swap against the observed revision. */
export async function autosaveEditorDocument(
  documentId: string,
  level: Level,
  expectedRevision: number,
): Promise<EditorDocument> {
  const body = JSON.stringify({
    revision: expectedRevision,
    level,
  });
  const response = await editorDocumentFetch(documentUrl(documentId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    // Browsers cap keepalive bodies (commonly 64 KiB). Small normal autosaves survive a page
    // transition; larger Levels still autosave normally instead of failing solely due to that cap.
    keepalive: new TextEncoder().encode(body).byteLength <= 60_000,
    body,
  });
  return documentFromResponse('autosave-editor-document', response);
}

/**
 * Best-effort last-chance write for a page lifecycle departure. `keepalive` lets the browser
 * finish the small same-origin request after the document starts unloading. Normal in-app
 * autosave still reads and applies the acknowledgement; this is only the crash-window backstop.
 */
export function autosaveEditorDocumentOnPageHide(
  documentId: string,
  level: Level,
  expectedRevision: number,
): void {
  void fetch(documentUrl(documentId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    keepalive: true,
    body: JSON.stringify({
      revision: expectedRevision,
      level,
    }),
  }).catch(() => undefined);
}

/** Restore the working copy from the canonical saved level. */
export function discardEditorDocumentChanges(
  documentId: string,
  expectedRevision: number,
): Promise<EditorDocument> {
  return postDocument('discard-editor-document', `${documentUrl(documentId)}/discard`, {
    revision: expectedRevision,
  });
}

/**
 * Promote the working copy to the canonical saved level. Supplying `level`
 * folds the latest unsent edit into the same transaction, avoiding a debounce
 * race between autosave and Save.
 */
export async function saveEditorDocument(
  documentId: string,
  expectedRevision: number,
  level?: Level,
  campaignId?: string | null,
): Promise<EditorDocumentSaveResult> {
  const response = await editorDocumentFetch(`${documentUrl(documentId)}/save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      revision: expectedRevision,
      ...(level ? { level } : {}),
      ...(campaignId !== undefined ? { campaign_id: campaignId } : {}),
    }),
  });
  const metadataResponse = response.clone();
  const document = await documentFromResponse('save-editor-document', response);
  const metadata = await metadataResponse.json() as EditorDocumentResponse;
  const workspaceRevision = metadata.workspace_revision;
  return {
    document,
    workspace_revision: typeof workspaceRevision === 'number'
      && Number.isSafeInteger(workspaceRevision)
      && workspaceRevision >= 0
      ? workspaceRevision
      : null,
  };
}
