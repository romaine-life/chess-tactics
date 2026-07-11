// Training Gym opening-book persistence client. Contract mirrors backend
// /api/opening-books/:levelId: books are account-scoped, one JSONB blob per
// (owner, level) — a whole BooksBlob {nextId, books} fetched/upserted as a unit.
// Replaces the former per-browser localStorage store.

import { HttpError } from './http';
import { emptyBlob, capSessionForStorage, type BooksBlob } from '../lab/openingBooks';

// One fetch core (mirrors net/campaignWorkspace.ts): same credentials + JSON +
// ok-check + HttpError in one place, so 401/retry handling is a single edit.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new HttpError(`${method} ${path}`, res.status);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Load a level's books for the signed-in account (empty blob if none stored).
 * Throws HttpError on non-ok (e.g. 401 signed-out) so the caller decides. */
export async function loadOpeningBooks(levelId: string): Promise<BooksBlob> {
  const data = await request<{ data?: Partial<BooksBlob> }>('GET', `/api/opening-books/${encodeURIComponent(levelId)}`);
  const blob = data.data;
  if (!blob || !Array.isArray(blob.books)) return emptyBlob();
  return {
    nextId: typeof blob.nextId === 'number' ? blob.nextId : 1,
    books: blob.books,
    ...(Array.isArray(blob.adoptedWeights) ? { adoptedWeights: blob.adoptedWeights } : {}),
    ...(blob.tdSession && typeof blob.tdSession === 'object' ? { tdSession: blob.tdSession } : {}),
  };
}

/** Persist a level's books (each book's trajectory capped so the blob stays
 * bounded). Throws HttpError on non-ok. */
export async function saveOpeningBooks(levelId: string, blob: BooksBlob): Promise<void> {
  const capped: BooksBlob = {
    nextId: blob.nextId,
    books: blob.books.map((b) => ({ ...b, session: capSessionForStorage(b.session) })),
    ...(blob.adoptedWeights ? { adoptedWeights: blob.adoptedWeights } : {}),
    // Bound the TD document too: the probe log is its only unbounded part (one entry
    // per probe cadence) — keep the newest window.
    ...(blob.tdSession ? { tdSession: { ...blob.tdSession, probeLog: blob.tdSession.probeLog.slice(-400) } } : {}),
  };
  await request<{ ok: boolean }>('PUT', `/api/opening-books/${encodeURIComponent(levelId)}`, { data: capped });
}
