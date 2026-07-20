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
  /** Current server-side writer-fence generation, when edit sessions are enabled. */
  edit_generation?: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface EditorDocumentEditFence {
  edit_session_id: string;
  edit_session_key: string;
  edit_generation: number;
}

export type EditorDocumentEditSessionState = 'active' | 'waiting' | 'displaced' | 'expired' | 'closed';
export type EditorDocumentSessionRelationship = 'this_tab' | 'same_device' | 'other_device';

/** One authenticated browser/page session observing or editing a document. */
export interface EditorDocumentEditSession {
  session_id: string;
  document_id: string;
  state: EditorDocumentEditSessionState;
  edit_generation: number;
  name: string;
  email: string;
  client_label: string | null;
  opened_at: string | null;
  last_seen_at: string | null;
  last_edit_at: string | null;
  lease_expires_at: string | null;
}

export interface EditorDocumentActiveEditor {
  session_id: string;
  name: string;
  email: string;
  client_label: string | null;
  opened_at: string | null;
  last_seen_at: string | null;
  last_edit_at: string | null;
  relationship: EditorDocumentSessionRelationship;
}

/** Durable attribution for the most recent authority holder; explicitly not live presence. */
export interface EditorDocumentLastEditor extends EditorDocumentActiveEditor {
  state: Exclude<EditorDocumentEditSessionState, 'active' | 'waiting'>;
  live: false;
}

export interface EditorDocumentEditPresence {
  document_id: string;
  edit_generation: number;
  active_editor: EditorDocumentActiveEditor | null;
  last_editor: EditorDocumentLastEditor | null;
  can_take_over: boolean;
  server_time: string;
}

export type EditorDocumentRecoveryCaptureSource = 'server-acknowledged' | 'displaced-client-upload';
export type EditorDocumentRecoveryReason = 'takeover' | 'lease-expired' | 'displaced-upload' | 'pre-restore';

/** Owner-visible checkpoint preserved before or after edit-session displacement. */
export interface EditorDocumentRecovery {
  recovery_id: string;
  document_id: string;
  source_session_id: string;
  displaced_by_session_id: string | null;
  source_editor: {
    session_id: string;
    name: string;
    email: string;
    client_label: string;
  };
  level: Level;
  document_revision: number;
  edit_generation: number;
  capture_source: EditorDocumentRecoveryCaptureSource;
  body_checkpoint_at: string | null;
  reason: EditorDocumentRecoveryReason;
  created_at: string | null;
  /** First restore acknowledgement; captured body and provenance remain immutable. */
  resolved_at: string | null;
}

/** @deprecated Prefer EditorDocumentRecovery; recoveries can also be pre-restore checkpoints. */
export type EditorDocumentDisplacedRecovery = EditorDocumentRecovery;

export interface EditorDocumentEditSessionResult {
  session: EditorDocumentEditSession;
  presence: EditorDocumentEditPresence;
  recovery?: EditorDocumentDisplacedRecovery | null;
}

export interface EditorDocumentEditPresenceResult {
  session?: EditorDocumentEditSession;
  presence: EditorDocumentEditPresence;
  recovery?: EditorDocumentDisplacedRecovery | null;
}

export interface EditorDocumentRecoveryListResult {
  recoveries: EditorDocumentRecovery[];
}

export interface EditorDocumentRecoveryUploadResult {
  session: EditorDocumentEditSession;
  presence: EditorDocumentEditPresence;
  recovery: EditorDocumentRecovery;
}

export interface EditorDocumentRecoveryRestoreResult {
  document: EditorDocument;
  recovery: EditorDocumentRecovery;
  preserved_current_recovery: EditorDocumentRecovery;
}

export interface EditorDocumentRecoveryDeleteResult {
  recovery: EditorDocumentRecovery;
}

export type EditorDocumentEditSessionErrorCode =
  | 'editor_document_session_displaced'
  | 'editor_document_session_expired'
  | 'editor_document_session_not_active'
  | 'editor_document_edit_session_key_invalid'
  | 'editor_document_edit_generation_conflict'
  | 'editor_document_edit_session_required'
  | 'editor_document_takeover_conflict'
  | 'editor_document_session_not_displaced';

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

export type EditorDocumentRevisionReason =
  | 'migration'
  | 'resolve'
  | 'create'
  | 'autosave'
  | 'save'
  | 'discard'
  | 'restore'
  | 'canonical-refresh';

export interface EditorDocumentRevisionSummary {
  revision: number;
  saved_revision: number;
  name: string;
  reason: EditorDocumentRevisionReason;
  restored_from_revision: number | null;
  body_hash: string;
  body_bytes: number;
  created_at: string | null;
}

export interface EditorDocumentRevisionListResult {
  revisions: EditorDocumentRevisionSummary[];
  next_before: number | null;
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

/**
 * A writer-fence rejection is intentionally separate from content CAS. The
 * caller must resolve edit-session authority before deciding what to do with
 * its in-memory/browser recovery; merely adopting the returned document
 * revision must never make a displaced session writable again.
 */
export class EditorDocumentEditSessionError extends HttpError {
  readonly code: EditorDocumentEditSessionErrorCode;
  readonly document: EditorDocument | null;
  readonly session: EditorDocumentEditSession | null;
  readonly presence: EditorDocumentEditPresence | null;
  readonly recovery: EditorDocumentDisplacedRecovery | null;

  constructor(
    action: string,
    status: number,
    code: EditorDocumentEditSessionErrorCode,
    payload: {
      document?: EditorDocument | null;
      session?: EditorDocumentEditSession | null;
      presence?: EditorDocumentEditPresence | null;
      recovery?: EditorDocumentDisplacedRecovery | null;
    } = {},
    details: string = code,
  ) {
    super(action, status, details);
    this.name = 'EditorDocumentEditSessionError';
    this.code = code;
    this.document = payload.document ?? null;
    this.session = payload.session ?? null;
    this.presence = payload.presence ?? null;
    this.recovery = payload.recovery ?? null;
  }
}

export function isEditorDocumentConflict(error: unknown): error is EditorDocumentConflictError {
  return error instanceof EditorDocumentConflictError;
}

export function isEditorDocumentBaselineConflict(error: unknown): error is EditorDocumentConflictError {
  return error instanceof EditorDocumentConflictError && error.conflict === 'baseline';
}

export function isEditorDocumentEditSessionError(error: unknown): error is EditorDocumentEditSessionError {
  return error instanceof EditorDocumentEditSessionError;
}

export function editorDocumentEditFence(
  session: Pick<EditorDocumentEditSession, 'session_id' | 'edit_generation'>,
  sessionKey: string,
): EditorDocumentEditFence {
  return {
    edit_session_id: session.session_id,
    edit_session_key: sessionKey,
    edit_generation: session.edit_generation,
  };
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

function editSessionUrl(documentId: string, sessionId?: string): string {
  const base = `${documentUrl(documentId)}/edit-sessions`;
  return sessionId ? `${base}/${encodeURIComponent(sessionId)}` : base;
}

function recoveryUrl(documentId: string, recoveryId?: string): string {
  const base = `${documentUrl(documentId)}/recoveries`;
  return recoveryId ? `${base}/${encodeURIComponent(recoveryId)}` : base;
}

function editFenceFields(fence?: EditorDocumentEditFence): Record<string, string | number> {
  return fence ? {
    edit_session_id: fence.edit_session_id,
    edit_session_key: fence.edit_session_key,
    edit_generation: fence.edit_generation,
  } : {};
}

function errorDetails(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as { error?: unknown; details?: unknown };
  const parts = [record.error, record.details]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return parts.length ? parts.join(': ') : undefined;
}

const EDIT_SESSION_ERROR_CODES = new Set<EditorDocumentEditSessionErrorCode>([
  'editor_document_session_displaced',
  'editor_document_session_expired',
  'editor_document_session_not_active',
  'editor_document_edit_session_key_invalid',
  'editor_document_edit_generation_conflict',
  'editor_document_edit_session_required',
  'editor_document_takeover_conflict',
  'editor_document_session_not_displaced',
]);

function editSessionErrorCode(raw: unknown): EditorDocumentEditSessionErrorCode | null {
  return typeof raw === 'string' && EDIT_SESSION_ERROR_CODES.has(raw as EditorDocumentEditSessionErrorCode)
    ? raw as EditorDocumentEditSessionErrorCode
    : null;
}

async function throwEditorDocumentResponseError(action: string, response: Response): Promise<never> {
  try {
    const body = await response.clone().json() as Partial<EditorDocumentResponse> & {
      error?: unknown;
      details?: unknown;
      session?: EditorDocumentEditSession | null;
      presence?: EditorDocumentEditPresence | null;
      recovery?: EditorDocumentDisplacedRecovery | null;
    };
    const sessionCode = editSessionErrorCode(body.error);
    if (sessionCode) {
      throw new EditorDocumentEditSessionError(action, response.status, sessionCode, {
        document: body.document ?? null,
        session: body.session ?? null,
        presence: body.presence ?? null,
        recovery: body.recovery ?? null,
      }, errorDetails(body));
    }
    if (
      response.status === 409
      && body.document
      && (body.error === 'editor_document_revision_conflict' || body.error === 'editor_document_baseline_conflict')
    ) {
      const conflict = body.error === 'editor_document_baseline_conflict' ? 'baseline' : 'revision';
      throw new EditorDocumentConflictError(action, body.document, conflict, errorDetails(body));
    }
  } catch (error) {
    if (error instanceof EditorDocumentEditSessionError || error instanceof EditorDocumentConflictError) throw error;
    // A malformed structured error still falls through to HttpError, preserving
    // the response status and any backend text it can read.
  }
  throw await HttpError.fromResponse(action, response);
}

async function documentFromResponse(action: string, response: Response): Promise<EditorDocument> {
  if (!response.ok) return throwEditorDocumentResponseError(action, response);
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

/** List bounded, body-free checkpoints for one owner-scoped working copy. */
export async function listEditorDocumentRevisions(
  documentId: string,
  options: { limit?: number; before?: number } = {},
): Promise<EditorDocumentRevisionListResult> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.before !== undefined) params.set('before', String(options.before));
  const query = params.toString();
  const response = await editorDocumentFetch(`${documentUrl(documentId)}/revisions${query ? `?${query}` : ''}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-cache',
  });
  if (!response.ok) throw await HttpError.fromResponse('list-editor-document-revisions', response);
  const body = await response.json() as Partial<EditorDocumentRevisionListResult>;
  return {
    revisions: Array.isArray(body.revisions) ? body.revisions : [],
    next_before: typeof body.next_before === 'number' && Number.isSafeInteger(body.next_before)
      ? body.next_before
      : null,
  };
}

/** Restore historical content as a new session-fenced, CAS-protected working-copy revision. */
export function restoreEditorDocumentRevision(
  documentId: string,
  expectedRevision: number,
  targetRevision: number,
  fence: EditorDocumentEditFence,
): Promise<EditorDocument> {
  return postDocument(
    'restore-editor-document-revision',
    `${documentUrl(documentId)}/revisions/restore`,
    {
      revision: expectedRevision,
      target_revision: targetRevision,
      ...editFenceFields(fence),
    },
  );
}

async function editSessionResultFromResponse(
  action: string,
  response: Response,
): Promise<EditorDocumentEditSessionResult> {
  if (!response.ok) return throwEditorDocumentResponseError(action, response);
  return await response.json() as EditorDocumentEditSessionResult;
}

/**
 * Open this page/tab's durable edit session. `session_id` is client-generated
 * so a lost response can be retried idempotently; `device_id` groups tabs only
 * for attribution. `session_key` is separate bearer authority and is never
 * returned by the server or shown in presence.
 */
export async function openEditorDocumentEditSession(
  documentId: string,
  input: { session_id: string; session_key: string; device_id: string; client_label?: string },
): Promise<EditorDocumentEditSessionResult> {
  const response = await editorDocumentFetch(editSessionUrl(documentId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  return editSessionResultFromResponse('open-editor-document-edit-session', response);
}

/** Renew the active writer lease using the page-held session credential. */
export async function heartbeatEditorDocumentEditSession(
  documentId: string,
  sessionId: string,
  sessionKey: string,
): Promise<EditorDocumentEditSessionResult> {
  const response = await editorDocumentFetch(`${editSessionUrl(documentId, sessionId)}/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ session_key: sessionKey }),
  });
  return editSessionResultFromResponse('heartbeat-editor-document-edit-session', response);
}

/**
 * Release this page's session without changing the document body or fencing
 * generation. Closing is idempotent and also retires waiting-only sessions.
 */
export async function closeEditorDocumentEditSession(
  documentId: string,
  sessionId: string,
  sessionKey: string,
): Promise<EditorDocumentEditSessionResult> {
  const response = await editorDocumentFetch(editSessionUrl(documentId, sessionId), {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ session_key: sessionKey }),
  });
  return editSessionResultFromResponse('close-editor-document-edit-session', response);
}

/** Read attributed writer presence without acquiring or transferring authority. */
export async function loadEditorDocumentEditPresence(
  documentId: string,
  viewer: { session_id: string; session_key: string; device_id: string },
): Promise<EditorDocumentEditPresenceResult> {
  const response = await editorDocumentFetch(`${documentUrl(documentId)}/edit-presence`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    cache: 'no-cache',
    body: JSON.stringify(viewer),
  });
  if (!response.ok) return throwEditorDocumentResponseError('load-editor-document-edit-presence', response);
  return await response.json() as EditorDocumentEditPresenceResult;
}

/**
 * Explicitly transfer writer authority to an already-open session. The observed
 * generation fences the takeover itself; callers must still use the returned
 * generation on every document mutation.
 */
export async function takeOverEditorDocumentEditSession(
  documentId: string,
  sessionId: string,
  sessionKey: string,
  expectedGeneration: number,
): Promise<EditorDocumentEditSessionResult> {
  const response = await editorDocumentFetch(`${editSessionUrl(documentId, sessionId)}/takeover`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ session_key: sessionKey, expected_generation: expectedGeneration }),
  });
  return editSessionResultFromResponse('take-over-editor-document-edit-session', response);
}

/** List unresolved and resolved immutable owner recoveries, newest first. */
export async function listEditorDocumentRecoveries(
  documentId: string,
): Promise<EditorDocumentRecoveryListResult> {
  const response = await editorDocumentFetch(recoveryUrl(documentId), {
    method: 'GET',
    credentials: 'include',
    cache: 'no-cache',
  });
  if (!response.ok) return throwEditorDocumentResponseError('list-editor-document-recoveries', response);
  const body = await response.json() as Partial<EditorDocumentRecoveryListResult>;
  return { recoveries: Array.isArray(body.recoveries) ? body.recoveries : [] };
}

/**
 * Upload the last in-memory candidate after this session has been displaced or
 * expired. This creates recovery material only; it never reacquires authority
 * or mutates the working document.
 */
export async function appendDisplacedEditorDocumentRecovery(
  documentId: string,
  sessionId: string,
  sessionKey: string,
  level: Level,
  observedRevision: number,
  observedGeneration: number,
): Promise<EditorDocumentRecoveryUploadResult> {
  const response = await editorDocumentFetch(`${editSessionUrl(documentId, sessionId)}/recoveries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      revision: observedRevision,
      edit_generation: observedGeneration,
      session_key: sessionKey,
      level,
    }),
  });
  if (!response.ok) return throwEditorDocumentResponseError('append-displaced-editor-document-recovery', response);
  return await response.json() as EditorDocumentRecoveryUploadResult;
}

/**
 * Restore one recovery through the current writer fence. The backend first
 * preserves the document being replaced, so restore remains reversible.
 */
export async function restoreEditorDocumentRecovery(
  documentId: string,
  recoveryId: string,
  expectedRevision: number,
  fence: EditorDocumentEditFence,
): Promise<EditorDocumentRecoveryRestoreResult> {
  const response = await editorDocumentFetch(`${recoveryUrl(documentId, recoveryId)}/restore`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      revision: expectedRevision,
      ...editFenceFields(fence),
    }),
  });
  if (!response.ok) return throwEditorDocumentResponseError('restore-editor-document-recovery', response);
  return await response.json() as EditorDocumentRecoveryRestoreResult;
}

/** Delete one owner recovery without changing the working document. */
export async function deleteEditorDocumentRecovery(
  documentId: string,
  recoveryId: string,
  fence: EditorDocumentEditFence,
): Promise<EditorDocumentRecoveryDeleteResult> {
  const response = await editorDocumentFetch(recoveryUrl(documentId, recoveryId), {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(editFenceFields(fence)),
  });
  if (!response.ok) return throwEditorDocumentResponseError('delete-editor-document-recovery', response);
  return await response.json() as EditorDocumentRecoveryDeleteResult;
}

/** Persist a document using compare-and-swap against the observed revision. */
export async function autosaveEditorDocument(
  documentId: string,
  level: Level,
  expectedRevision: number,
  fence?: EditorDocumentEditFence,
): Promise<EditorDocument> {
  const body = JSON.stringify({
    revision: expectedRevision,
    level,
    ...editFenceFields(fence),
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
  fence?: EditorDocumentEditFence,
): void {
  void fetch(documentUrl(documentId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    keepalive: true,
    body: JSON.stringify({
      revision: expectedRevision,
      level,
      ...editFenceFields(fence),
    }),
  }).catch(() => undefined);
}

/** Restore the working copy from the canonical saved level. */
export function discardEditorDocumentChanges(
  documentId: string,
  expectedRevision: number,
  fence?: EditorDocumentEditFence,
): Promise<EditorDocument> {
  return postDocument('discard-editor-document', `${documentUrl(documentId)}/discard`, {
    revision: expectedRevision,
    ...editFenceFields(fence),
  });
}

/** Permanently remove a never-saved working copy using its observed revision. */
export async function deleteNeverSavedEditorDocument(
  documentId: string,
  expectedRevision: number,
  fence?: EditorDocumentEditFence,
): Promise<EditorDocument> {
  const response = await editorDocumentFetch(documentUrl(documentId), {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ revision: expectedRevision, ...editFenceFields(fence) }),
  });
  return documentFromResponse('delete-never-saved-editor-document', response);
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
  fence?: EditorDocumentEditFence,
): Promise<EditorDocumentSaveResult> {
  const response = await editorDocumentFetch(`${documentUrl(documentId)}/save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      revision: expectedRevision,
      ...(level ? { level } : {}),
      ...(campaignId !== undefined ? { campaign_id: campaignId } : {}),
      ...editFenceFields(fence),
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
