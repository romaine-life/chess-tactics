// Training Gym opening-book persistence client. Contract mirrors backend
// /api/opening-books/:levelId: books are account-scoped, one JSONB blob per
// (owner, level) — a whole BooksBlob {nextId, books} fetched/upserted as a unit.
// Replaces the former per-browser localStorage store.

import { HttpError } from './http';
import {
  emptyBlob, capSessionForStorage, migrateLevelAi, migrateTdRuns, sanitizeLevelAi, sanitizeTdRuns,
  type BooksBlob,
} from '../lab/openingBooks';
import type { TdLedgerRow, TdRunDoc } from '../lab/tdSession';

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
 * The retired fields migrate here — the single-run `tdSession` into the `tdRuns`
 * library, then the bare `adoptedWeights`/`tdAdoption` pair into the `levelAi`
 * approach document — and both documents are sanitized (malformed entries dropped),
 * so every consumer sees the one current, renderable shape.
 * Throws HttpError on non-ok (e.g. 401 signed-out) so the caller decides. */
export async function loadOpeningBooks(levelId: string): Promise<BooksBlob> {
  const data = await request<{ data?: Partial<BooksBlob> }>('GET', `/api/opening-books/${encodeURIComponent(levelId)}`);
  const blob = data.data;
  if (!blob || !Array.isArray(blob.books)) return emptyBlob();
  const levelAi = blob.levelAi && typeof blob.levelAi === 'object' ? sanitizeLevelAi(blob.levelAi) : undefined;
  return migrateLevelAi(migrateTdRuns({
    nextId: typeof blob.nextId === 'number' ? blob.nextId : 1,
    books: blob.books,
    ...(levelAi ? { levelAi } : {}),
    ...(Array.isArray(blob.adoptedWeights) ? { adoptedWeights: blob.adoptedWeights } : {}),
    ...(blob.tdSession && typeof blob.tdSession === 'object' ? { tdSession: blob.tdSession } : {}),
    ...(blob.tdRuns && typeof blob.tdRuns === 'object' && Array.isArray(blob.tdRuns.runs) ? { tdRuns: sanitizeTdRuns(blob.tdRuns) } : {}),
    ...(blob.tdAdoption && typeof blob.tdAdoption === 'object' ? { tdAdoption: blob.tdAdoption } : {}),
  }));
}

// Whole-library PUTs meet a hard backend body cap (express.json 4mb), so storage is
// bounded per run AND runs are stored lean: ledger numbers are rounded to display
// precision (deltas render at 4 decimals, ε at 2 — full doubles would triple the
// row size for digits nothing reads), the OPEN run keeps a deep ledger window, and
// shelved runs keep a shorter one (their headline numbers — values, probes, summary,
// outcomes — are kept in full either way).
const LEDGER_ROWS_OPEN = 2000;
const LEDGER_ROWS_SHELVED = 400;
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

function capLedgerRow(row: TdLedgerRow): TdLedgerRow {
  const delta = {} as TdLedgerRow['delta'];
  for (const k of Object.keys(row.delta) as Array<keyof TdLedgerRow['delta']>) delta[k] = round6(row.delta[k]);
  return { ...row, epsilon: round6(row.epsilon), delta };
}

/** Bound one run for storage: newest windows of the probe log and the per-game
 * ledger (the traj-cap idiom the books use), ledger rows rounded to display
 * precision. */
function capTdRun(run: TdRunDoc, isOpen: boolean): TdRunDoc {
  const ledger = run.session.ledger;
  return {
    ...run,
    probeLog: (run.probeLog ?? []).slice(-400),
    session: {
      ...run.session,
      ...(ledger ? { ledger: ledger.slice(-(isOpen ? LEDGER_ROWS_OPEN : LEDGER_ROWS_SHELVED)).map(capLedgerRow) } : {}),
    },
  };
}

/** Persist a level's books (each book's trajectory and each TD run capped so the
 * blob stays bounded). Throws HttpError on non-ok. `keepalive` is for
 * flush-on-pagehide: the request outlives the tab (best effort — the browser caps
 * such bodies at ~64KB, so a large library may not flush; the debounced saves
 * before it are the durable path). */
export async function saveOpeningBooks(levelId: string, blob: BooksBlob, keepalive = false): Promise<void> {
  const capped: BooksBlob = {
    nextId: blob.nextId,
    books: blob.books.map((b) => ({ ...b, session: capSessionForStorage(b.session) })),
    ...(blob.levelAi ? { levelAi: blob.levelAi } : {}),
    ...(blob.tdRuns ? { tdRuns: { ...blob.tdRuns, runs: blob.tdRuns.runs.map((r) => capTdRun(r, r.id === blob.tdRuns?.activeId)) } } : {}),
  };
  await request<{ ok: boolean }>('PUT', `/api/opening-books/${encodeURIComponent(levelId)}`, { data: capped }, keepalive);
}
