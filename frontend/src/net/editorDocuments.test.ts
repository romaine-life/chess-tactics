import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Level } from '../core/level';
import {
  EditorDocumentConflictError,
  autosaveEditorDocument,
  autosaveEditorDocumentOnPageHide,
  createEditorDocument,
  discardEditorDocumentChanges,
  isEditorDocumentConflict,
  listEditorDocuments,
  loadEditorDocument,
  resolveEditorDocument,
  saveEditorDocument,
  type EditorDocument,
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

  it('atomically saves the latest level even if autosave is still debounced', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      document: { ...document, dirty: false },
      workspace_revision: 9,
    }));

    await expect(saveEditorDocument('doc-7f3c', 4, level)).resolves.toMatchObject({
      workspace_revision: 9,
      document: { document_id: 'doc-7f3c' },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-7f3c/save');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ revision: 4, level });
  });

  it('can promote an already-autosaved working copy without resending the level', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { document: { ...document, dirty: false } }));

    await saveEditorDocument('doc-7f3c', 4);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ revision: 4 });
  });
});

describe('editor document conflicts', () => {
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

  it('uses a normal HttpError for non-conflict failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'sign_in_required' }));

    await expect(loadEditorDocument('doc-7f3c')).rejects.toMatchObject({
      status: 401,
      details: 'sign_in_required',
    });
  });
});
