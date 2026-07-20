import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Level } from '../core/level';
import {
  EditorDocumentConflictError,
  EditorDocumentEditSessionError,
  appendDisplacedEditorDocumentRecovery,
  autosaveEditorDocument,
  autosaveEditorDocumentOnPageHide,
  closeEditorDocumentEditSession,
  createEditorDocument,
  deleteEditorDocumentRecovery,
  deleteNeverSavedEditorDocument,
  discardEditorDocumentChanges,
  editorDocumentEditFence,
  heartbeatEditorDocumentEditSession,
  isEditorDocumentConflict,
  isEditorDocumentEditSessionError,
  listEditorDocumentRevisions,
  listEditorDocuments,
  listEditorDocumentRecoveries,
  loadEditorDocument,
  loadEditorDocumentEditPresence,
  openEditorDocumentEditSession,
  resolveEditorDocument,
  restoreEditorDocumentRevision,
  restoreEditorDocumentRecovery,
  saveEditorDocument,
  takeOverEditorDocumentEditSession,
  type EditorDocument,
  type EditorDocumentEditFence,
  type EditorDocumentEditPresence,
  type EditorDocumentEditSession,
  type EditorDocumentRecovery,
} from './editorDocuments';
import { HttpError } from './http';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const level = { id: 'level-a', name: 'Level A' } as unknown as Level;
const document: EditorDocument = {
  document_id: 'doc-7f3c',
  level_id: 'level-a',
  workspace_kind: 'user',
  workspace_id: 'campaign',
  level,
  revision: 4,
  saved_revision: 2,
  dirty: true,
  has_saved_baseline: true,
  never_saved: false,
  baseline_conflict: false,
  created_at: '2026-07-10T01:00:00.000Z',
  updated_at: '2026-07-10T01:01:00.000Z',
};

const editFence: EditorDocumentEditFence = {
  edit_session_id: 'session-tab-a',
  edit_session_key: 'a'.repeat(64),
  edit_generation: 12,
};

const editSession: EditorDocumentEditSession = {
  session_id: 'session-tab-a',
  document_id: 'doc-7f3c',
  state: 'active',
  edit_generation: 12,
  name: 'Nelson',
  email: 'nelson@example.com',
  client_label: 'Chrome · bridge worktree',
  opened_at: '2026-07-20T01:00:00.000Z',
  last_seen_at: '2026-07-20T01:01:00.000Z',
  last_edit_at: null,
  lease_expires_at: '2026-07-20T01:02:00.000Z',
};

const editPresence: EditorDocumentEditPresence = {
  document_id: 'doc-7f3c',
  edit_generation: 12,
  active_editor: {
    session_id: 'session-tab-a',
    name: 'Nelson',
    email: 'nelson@example.com',
    client_label: 'Chrome · bridge worktree',
    opened_at: '2026-07-20T01:00:00.000Z',
    last_seen_at: '2026-07-20T01:01:00.000Z',
    last_edit_at: null,
    relationship: 'this_tab',
  },
  last_editor: null,
  can_take_over: false,
  server_time: '2026-07-20T01:01:00.000Z',
};

const recovery: EditorDocumentRecovery = {
  recovery_id: 'recovery-1',
  document_id: document.document_id,
  source_session_id: editSession.session_id,
  displaced_by_session_id: 'session-tab-b',
  source_editor: {
    session_id: editSession.session_id,
    name: editSession.name,
    email: editSession.email,
    client_label: editSession.client_label ?? '',
  },
  level,
  document_revision: 4,
  edit_generation: 12,
  capture_source: 'server-acknowledged',
  body_checkpoint_at: '2026-07-20T01:01:30.000Z',
  reason: 'takeover',
  created_at: '2026-07-20T01:02:00.000Z',
  resolved_at: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editor document resolution', () => {
  it('resolves a saved level into the default user workspace', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document }));

    await expect(resolveEditorDocument('level-a')).resolves.toEqual(document);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/resolve');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ level_id: 'level-a' });
  });

  it('passes an official workspace explicitly', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document }));

    await resolveEditorDocument('a/b c', { workspace_kind: 'official', workspace_id: 'default' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      level_id: 'a/b c',
      workspace_kind: 'official',
      workspace_id: 'default',
    });
  });

  it('creates a new unsaved working document through the same resolve endpoint', async () => {
    const newDocument = { ...document, saved_revision: 0, dirty: true };
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { document: newDocument }));

    await expect(createEditorDocument(level)).resolves.toEqual(newDocument);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/editor-documents/resolve');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ level });
  });
});

describe('editor document edit sessions', () => {
  it('projects the mutation-fence fields from the acknowledged session', () => {
    expect(editorDocumentEditFence(editSession, editFence.edit_session_key)).toEqual(editFence);
  });

  it('opens an idempotent client-named session with device attribution', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { session: editSession, presence: editPresence }));

    await expect(openEditorDocumentEditSession('doc/a b', {
      session_id: 'session-tab-a',
      session_key: editFence.edit_session_key,
      device_id: 'device-browser-a',
      client_label: 'Chrome · bridge worktree',
    })).resolves.toEqual({ session: editSession, presence: editPresence });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc%2Fa%20b/edit-sessions');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(init.body)).toEqual({
      session_id: 'session-tab-a',
      session_key: editFence.edit_session_key,
      device_id: 'device-browser-a',
      client_label: 'Chrome · bridge worktree',
    });
  });

  it('heartbeats the addressed session without inventing another identity', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { session: editSession, presence: editPresence }));

    await heartbeatEditorDocumentEditSession('doc-7f3c', 'session/tab a', editFence.edit_session_key);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-7f3c/edit-sessions/session%2Ftab%20a/heartbeat');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(init.body)).toEqual({ session_key: editFence.edit_session_key });
  });

  it('closes only the addressed session with its page-held credential', async () => {
    const closedSession = { ...editSession, state: 'closed', lease_expires_at: null };
    const releasedPresence = { ...editPresence, active_editor: null, can_take_over: false };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      session: closedSession,
      presence: releasedPresence,
      recovery,
    }));

    await expect(closeEditorDocumentEditSession('doc/a b', 'session/tab a', editFence.edit_session_key)).resolves.toEqual({
      session: closedSession,
      presence: releasedPresence,
      recovery,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc%2Fa%20b/edit-sessions/session%2Ftab%20a');
    expect(init).toMatchObject({ method: 'DELETE', credentials: 'include' });
    expect(JSON.parse(init.body)).toEqual({ session_key: editFence.edit_session_key });
  });

  it('reads attributed presence for this session and device without acquiring authority', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { session: editSession, presence: editPresence }));

    await expect(loadEditorDocumentEditPresence('doc-7f3c', {
      session_id: 'session/tab a',
      session_key: editFence.edit_session_key,
      device_id: 'device browser a',
    })).resolves.toEqual({ session: editSession, presence: editPresence });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-7f3c/edit-presence');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-cache' });
    expect(JSON.parse(init.body)).toEqual({
      session_id: 'session/tab a',
      session_key: editFence.edit_session_key,
      device_id: 'device browser a',
    });
  });

  it('takes over only the observed writer generation', async () => {
    const takenOver = { ...editSession, edit_generation: 13 };
    const presence = { ...editPresence, edit_generation: 13 };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { session: takenOver, presence }));

    await expect(takeOverEditorDocumentEditSession('doc-7f3c', 'session-tab-b', editFence.edit_session_key, 12))
      .resolves.toEqual({ session: takenOver, presence });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-7f3c/edit-sessions/session-tab-b/takeover');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(init.body)).toEqual({ session_key: editFence.edit_session_key, expected_generation: 12 });
  });

  it('lists attributed owner recoveries without changing edit authority', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { recoveries: [recovery] }));

    await expect(listEditorDocumentRecoveries('doc/a b')).resolves.toEqual({ recoveries: [recovery] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc%2Fa%20b/recoveries');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-cache' });
  });

  it('uploads a displaced in-memory candidate without acquiring authority', async () => {
    const uploaded = { ...recovery, capture_source: 'displaced-client-upload' as const, reason: 'displaced-upload' as const };
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {
      session: { ...editSession, state: 'displaced' },
      presence: editPresence,
      recovery: uploaded,
    }));

    await expect(appendDisplacedEditorDocumentRecovery('doc-7f3c', 'session/tab a', editFence.edit_session_key, level, 4, 12))
      .resolves.toMatchObject({ recovery: uploaded });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-7f3c/edit-sessions/session%2Ftab%20a/recoveries');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(init.body)).toEqual({ revision: 4, edit_generation: 12, session_key: editFence.edit_session_key, level });
  });

  it('restores through the current writer fence and returns the preserved current checkpoint', async () => {
    const resolvedRecovery = { ...recovery, resolved_at: '2026-07-20T01:03:00.000Z' };
    const preservedCurrent = {
      ...recovery,
      recovery_id: 'recovery-before-restore',
      reason: 'pre-restore' as const,
    };
    const restoredDocument = { ...document, revision: 5 };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      document: restoredDocument,
      recovery: resolvedRecovery,
      preserved_current_recovery: preservedCurrent,
    }));

    await expect(restoreEditorDocumentRecovery('doc/a b', 'recovery/one', 4, editFence)).resolves.toEqual({
      document: restoredDocument,
      recovery: resolvedRecovery,
      preserved_current_recovery: preservedCurrent,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc%2Fa%20b/recoveries/recovery%2Fone/restore');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(init.body)).toEqual({ revision: 4, ...editFence });
  });

  it('deletes exactly one owner recovery only through the current writer fence', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { recovery }));

    await expect(deleteEditorDocumentRecovery('doc/a b', 'recovery/one', editFence)).resolves.toEqual({ recovery });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc%2Fa%20b/recoveries/recovery%2Fone');
    expect(init).toMatchObject({ method: 'DELETE', credentials: 'include' });
    expect(JSON.parse(init.body)).toEqual(editFence);
  });
});

describe('editor document persistence', () => {
  it('lists private recent working-copy summaries without loading their level bodies', async () => {
    const summary = {
      document_id: 'doc-7f3c',
      level_id: 'level-a',
      workspace_kind: 'user',
      workspace_id: 'campaign',
      name: 'Level A',
      revision: 4,
      saved_revision: 2,
      dirty: true,
      has_saved_baseline: true,
      never_saved: false,
      created_at: '2026-07-10T01:00:00.000Z',
      updated_at: '2026-07-10T01:01:00.000Z',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { documents: [summary], next_offset: 20 }));

    await expect(listEditorDocuments({ status: 'all', limit: 20, offset: 0 })).resolves.toEqual({
      documents: [summary],
      next_offset: 20,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents?status=all&limit=20&offset=0');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-cache' });
    expect(summary).not.toHaveProperty('level');
  });

  it('loads an existing working copy without creating it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document }));

    await loadEditorDocument('doc/a b');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc%2Fa%20b');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-cache' });
  });

  it('lists body-free working-copy revision checkpoints', async () => {
    const revision = {
      revision: 4,
      saved_revision: 2,
      name: 'Level A',
      reason: 'autosave' as const,
      restored_from_revision: null,
      body_hash: 'abc123',
      body_bytes: 1234,
      created_at: '2026-07-10T01:01:00.000Z',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { revisions: [revision], next_before: 4 }));

    await expect(listEditorDocumentRevisions('doc/a b', { limit: 20, before: 9 })).resolves.toEqual({
      revisions: [revision],
      next_before: 4,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc%2Fa%20b/revisions?limit=20&before=9');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-cache' });
    expect(revision).not.toHaveProperty('level');
  });

  it('restores historical content as a new CAS-protected working revision', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document: { ...document, revision: 5 } }));

    await expect(restoreEditorDocumentRevision('doc-7f3c', 4, 2, editFence)).resolves.toMatchObject({ revision: 5 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-7f3c/revisions/restore');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(init.body)).toEqual({ revision: 4, target_revision: 2, ...editFence });
  });

  it('CAS-autosaves the complete level against the observed revision', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document: { ...document, revision: 5 } }));

    await autosaveEditorDocument('doc-7f3c', level, 4);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-7f3c');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({
      revision: 4,
      level,
    });
  });

  it('includes the edit-session fence on every working-copy mutation', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { document }))
      .mockResolvedValueOnce(jsonResponse(200, { document }))
      .mockResolvedValueOnce(jsonResponse(200, { document }))
      .mockResolvedValueOnce(jsonResponse(200, { document }))
      .mockResolvedValueOnce(jsonResponse(200, { document }))
      .mockResolvedValueOnce(jsonResponse(200, { document, workspace_revision: 9 }));

    await autosaveEditorDocument('doc-7f3c', level, 4, editFence);
    autosaveEditorDocumentOnPageHide('doc-7f3c', level, 4, editFence);
    await discardEditorDocumentChanges('doc-7f3c', 4, editFence);
    await deleteNeverSavedEditorDocument('doc-7f3c', 4, editFence);
    await restoreEditorDocumentRevision('doc-7f3c', 4, 2, editFence);
    await saveEditorDocument('doc-7f3c', 4, level, null, editFence);

    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse(init.body)).toMatchObject(editFence);
    }
    expect(JSON.parse(fetchMock.mock.calls[5][1].body)).toEqual({
      revision: 4,
      level,
      campaign_id: null,
      ...editFence,
    });
  });

  it('uses a keepalive request for the page-departure backstop', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document }));

    autosaveEditorDocumentOnPageHide('doc-7f3c', level, 4);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-7f3c');
    expect(init).toMatchObject({ method: 'PUT', credentials: 'include', keepalive: true });
    expect(JSON.parse(init.body)).toEqual({ revision: 4, level });
  });

  it('does not put an oversized normal autosave behind the browser keepalive body cap', async () => {
    const largeLevel = { ...level, notes: 'x'.repeat(61_000) } as unknown as Level;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document }));

    await autosaveEditorDocument('doc-7f3c', largeLevel, 4);

    expect(fetchMock.mock.calls[0][1].keepalive).toBe(false);
  });

  it('discards back to the canonical level with CAS protection', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document: { ...document, dirty: false } }));

    await discardEditorDocumentChanges('doc-7f3c', 4);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-7f3c/discard');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ revision: 4 });
  });

  it('CAS-deletes a never-saved working copy and returns the deleted document', async () => {
    const deleted = {
      ...document,
      saved_revision: 0,
      has_saved_baseline: false,
      never_saved: true,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document: deleted }));

    await expect(deleteNeverSavedEditorDocument('doc/a b', 4)).resolves.toEqual(deleted);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc%2Fa%20b');
    expect(init).toMatchObject({
      method: 'DELETE',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(init.body)).toEqual({ revision: 4 });
  });

  it('atomically saves the latest level even if autosave is still debounced', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      document: { ...document, dirty: false },
      workspace_revision: 9,
    }));

    await expect(saveEditorDocument('doc-7f3c', 4, level, 'c1')).resolves.toMatchObject({
      workspace_revision: 9,
      document: { document_id: 'doc-7f3c' },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-7f3c/save');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ revision: 4, level, campaign_id: 'c1' });
  });

  it('can promote an already-autosaved working copy without resending the level', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document: { ...document, dirty: false } }));

    await saveEditorDocument('doc-7f3c', 4);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ revision: 4 });
  });
});

describe('editor document conflicts', () => {
  it('keeps a displaced writer-fence rejection distinct from content CAS', async () => {
    const displacedSession = { ...editSession, state: 'displaced' };
    const displacedPresence = {
      ...editPresence,
      can_take_over: true,
      active_editor: { ...editPresence.active_editor!, session_id: 'session-tab-b', relationship: 'other_device' },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: 'editor_document_session_displaced',
      document,
      session: displacedSession,
      presence: displacedPresence,
      recovery,
    }));

    const error = await autosaveEditorDocument('doc-7f3c', level, 4, editFence)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EditorDocumentEditSessionError);
    expect(error).toBeInstanceOf(HttpError);
    expect(isEditorDocumentEditSessionError(error)).toBe(true);
    expect(isEditorDocumentConflict(error)).toBe(false);
    expect(error).toMatchObject({
      status: 409,
      code: 'editor_document_session_displaced',
      document,
      session: displacedSession,
      presence: displacedPresence,
      recovery,
    });
  });

  it.each([
    'editor_document_session_expired',
    'editor_document_session_not_active',
    'editor_document_edit_session_required',
    'editor_document_takeover_conflict',
    'editor_document_session_not_displaced',
  ] as const)('types the %s edit-authority error', async (code) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: code, presence: editPresence }));

    const error = await discardEditorDocumentChanges('doc-7f3c', 4, editFence)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EditorDocumentEditSessionError);
    expect(error).toMatchObject({ code, presence: editPresence });
  });

  it('carries the current server document on a 409 so callers cannot overwrite it', async () => {
    const current = { ...document, revision: 9 };
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: 'editor_document_revision_conflict',
      document: current,
    }));

    const error = await autosaveEditorDocument('doc-7f3c', level, 4).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EditorDocumentConflictError);
    expect(error).toBeInstanceOf(HttpError);
    expect(isEditorDocumentConflict(error)).toBe(true);
    expect(error).toMatchObject({ status: 409, document: current });
  });

  it('distinguishes a changed canonical baseline from a working-copy revision race', async () => {
    const current = { ...document, baseline_conflict: true };
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: 'editor_document_baseline_conflict',
      document: current,
    }));

    const error = await saveEditorDocument('doc-7f3c', 4, level).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 409,
      conflict: 'baseline',
      document: current,
    });
  });

  it('carries the current server document when a delete loses its revision race', async () => {
    const current = {
      ...document,
      revision: 9,
      saved_revision: 0,
      has_saved_baseline: false,
      never_saved: true,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: 'editor_document_revision_conflict',
      document: current,
    }));

    const error = await deleteNeverSavedEditorDocument('doc-7f3c', 4)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EditorDocumentConflictError);
    expect(isEditorDocumentConflict(error)).toBe(true);
    expect(error).toMatchObject({ status: 409, conflict: 'revision', document: current });
  });

  it('does not mislabel a saved-baseline delete rejection as a revision conflict', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, {
      error: 'editor_document_delete_requires_never_saved',
      details: 'only a never-saved working copy can be deleted',
      document,
    }));

    const error = await deleteNeverSavedEditorDocument('doc-7f3c', 4)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).not.toBeInstanceOf(EditorDocumentConflictError);
    expect(isEditorDocumentConflict(error)).toBe(false);
    expect(error).toMatchObject({
      status: 409,
      details: 'editor_document_delete_requires_never_saved: only a never-saved working copy can be deleted',
    });
  });

  it('uses a normal HttpError for non-conflict failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'sign_in_required' }));

    await expect(loadEditorDocument('doc-7f3c')).rejects.toMatchObject({
      status: 401,
      details: 'sign_in_required',
    });
  });
});
