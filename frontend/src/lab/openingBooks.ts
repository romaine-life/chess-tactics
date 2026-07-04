// Per-level opening-book store: types + pure helpers.
//
// A level's gym state is a set of opening books. Each book bundles:
//   - its generation settings (size / seedBase / plies / variety),
//   - its generated positions (the seeded opening walks), and
//   - its RETAINED training session (SPSA step count, current theta, champion, the
//     convergence curve) — so switching between books restores each one's training
//     exactly where it was left, and a fresh book starts clean at 0.5.
//
// Persistence is account-scoped in the backend (net/openingBooks.ts, one blob row
// per (owner, level)). capSessionForStorage caps each book's traj before persisting
// so a long auto-run can't grow the blob without bound.

import { encodeWeights } from '../game/tuning';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import type { BookPosition, OpeningBookSettings } from '../game/openingBook';

/** One point on a book's convergence curve — the worker's step output. */
export interface GymPoint {
  step: number;
  score: number;
  yPlus: number;
  yMinus: number;
  c: number;
  a: number;
  theta: number[];
}

/** A book's RETAINED training state — the complete, portable SPSA session.
 * `k` is the next step index (also the SPSA step seed offset), so replaying k from
 * the master seed re-derives the trajectory. `champion` is the best point seen;
 * `established` counts steps since it last improved. */
export interface GymSession {
  k: number;
  theta: number[];
  champion: { step: number; score: number; theta: number[] };
  established: number;
  traj: GymPoint[];
}

/** One opening book: its settings, generated positions, and retained session. */
export interface OpeningBook {
  id: number;
  settings: OpeningBookSettings;
  positions: BookPosition[];
  session: GymSession;
}

/** The per-level persisted blob: an id counter and the level's books. */
export interface BooksBlob {
  nextId: number;
  books: OpeningBook[];
}

/** Default generation settings for a brand-new book (small, so a step lands fast). */
export const DEFAULT_BOOK_SETTINGS: OpeningBookSettings = { size: 4, seedBase: 1, plies: 4, variety: 0.5 };

/** How many trajectory points to KEEP IN STORAGE per book (the live in-memory traj
 * is unbounded; only persistence is capped, keeping the newest points). */
const MAX_STORED_TRAJ = 400;

/** A pristine session: even with the reference, champion = the reference itself. */
export function freshSession(): GymSession {
  const theta = encodeWeights(DEFAULT_EVAL_WEIGHTS);
  return {
    k: 0,
    theta,
    champion: { step: -1, score: 0.5, theta: theta.slice() },
    established: 0,
    traj: [],
  };
}

/** An empty blob (no books yet). */
export function emptyBlob(): BooksBlob {
  return { nextId: 1, books: [] };
}

/** Trim a session's trajectory for storage (keep the newest MAX_STORED_TRAJ). The
 * net client applies this to each book before persisting the blob. */
export function capSessionForStorage(session: GymSession): GymSession {
  if (session.traj.length <= MAX_STORED_TRAJ) return session;
  return { ...session, traj: session.traj.slice(session.traj.length - MAX_STORED_TRAJ) };
}

/** Create a new book (positions empty until generated) with a fresh session, append
 * it to the blob, and return the grown blob + the new book. */
export function makeNewBook(existingBlob: BooksBlob, settings: OpeningBookSettings): { blob: BooksBlob; book: OpeningBook } {
  const id = existingBlob.nextId;
  const book: OpeningBook = { id, settings: { ...settings }, positions: [], session: freshSession() };
  const blob: BooksBlob = { nextId: id + 1, books: [...existingBlob.books, book] };
  return { blob, book };
}

/** Remove a book by id (nextId is never rewound — ids stay stable/unique). */
export function deleteBook(blob: BooksBlob, id: number): BooksBlob {
  return { nextId: blob.nextId, books: blob.books.filter((b) => b.id !== id) };
}

/** Replace a book in the blob by id (returns a new blob; unchanged if id absent). */
export function updateBook(blob: BooksBlob, book: OpeningBook): BooksBlob {
  return { nextId: blob.nextId, books: blob.books.map((b) => (b.id === book.id ? book : b)) };
}
