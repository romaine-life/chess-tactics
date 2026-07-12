// Training Gym opening-book persistence client. Contract mirrors backend
// /api/opening-books/:levelId: books are account-scoped, one JSONB blob per
// (owner, level) — a whole BooksBlob {nextId, books} fetched/upserted as a unit.
// Replaces the former per-browser localStorage store.

import { HttpError } from './http';
import { emptyBlob, capSessionForStorage, migrateTdRuns, type BooksBlob } from '../lab/openingBooks';
import type { TdRunDoc } from '../lab/tdSession';

// One fetch core (mirrors net/campaignWorkspace.ts): same credentials + JSON +
// ok-check + HttpError in one place, so 401/retry handling is a single edit.
// `keepalive` lets a save fired from pagehide outlive the tab (the browser caps
// keepalive bodies at ~64KB — callers use it for flush-on-close best effort).
async function request<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    ...(keepalive ? { keepalive: true } : {}),
  });
  if (!res.ok) throw new HttpError(`${method} ${path}`, res.status);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Load a level's books for the signed-in account (empty blob if none stored).
 * The retired single-run `tdSession` field migrates into the `tdRuns` library here,
 * so every consumer sees the one current shape.
 * Throws HttpError on non-ok (e.g. 401 signed-out) so the caller decides. */
export async function loadOpeningBooks(levelId: string): Promise<BooksBlob> {
  const data = await request<{ data?: Partial<BooksBlob> }>('GET', `/api/opening-books/${encodeURIComponent(levelId)}`);
  const blob = data.data;
  if (!blob || !Array.isArray(blob.books)) return emptyBlob();
  return migrateTdRuns({
    nextId: typeof blob.nextId === 'number' ? blob.nextId : 1,
    books: blob.books,
    ...(Array.isArray(blob.adoptedWeights) ? { adoptedWeights: blob.adoptedWeights } : {}),
    ...(blob.tdSession && typeof blob.tdSession === 'object' ? { tdSession: blob.tdSession } : {}),
    ...(blob.tdRuns && typeof blob.tdRuns === 'object' && Array.isArray(blob.tdRuns.runs) ? { tdRuns: blob.tdRuns } : {}),
  });
}

/** Bound one run for storage: the probe log and the per-game ledger grow with the
 * run — keep the newest windows (the traj-cap idiom the books use). */
function capTdRun(run: TdRunDoc): TdRunDoc {
  return {
    ...run,
    probeLog: (run.probeLog ?? []).slice(-400),
    session: {
      ...run.session,
      ...(run.session.ledger ? { ledger: run.session.ledger.slice(-2000) } : {}),
    },
  };
}

/** Persist a level's books (each book's trajectory and each TD run capped so the
 * blob stays bounded). Throws HttpError on non-ok. `keepalive` is for
 * flush-on-pagehide: the request outlives the tab (best effort — the browser caps
 * such bodies). */
export async function saveOpeningBooks(levelId: string, blob: BooksBlob, keepalive = false): Promise<void> {
  const capped: BooksBlob = {
    nextId: blob.nextId,
    books: blob.books.map((b) => ({ ...b, session: capSessionForStorage(b.session) })),
    ...(blob.adoptedWeights ? { adoptedWeights: blob.adoptedWeights } : {}),
    ...(blob.tdRuns ? { tdRuns: { ...blob.tdRuns, runs: blob.tdRuns.runs.map(capTdRun) } } : {}),
  };
  await request<{ ok: boolean }>('PUT', `/api/opening-books/${encodeURIComponent(levelId)}`, { data: capped }, keepalive);
}
