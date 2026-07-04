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

/** One point on a book's convergence curve — the worker's step output. Game outcomes
 * (this step's decisive/draw split) are optional so trajectories persisted before they
 * were surfaced still load. */
export interface GymPoint {
  step: number;
  score: number;
  yPlus: number;
  yMinus: number;
  c: number;
  a: number;
  theta: number[];
  games?: number;
  wins?: number;
  draws?: number;
  losses?: number;
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
  /** Optional deterministic train/holdout partition (holdout = indices into
   * positions). Absent ⇒ whole book is train, holdout empty (back-compat with
   * pre-split books). SPSA tunes on trainPositions; SPRT validates on
   * holdoutPositions — the anti-overfit guard: a champion must beat the shipped AI
   * on openings it never trained on. */
  split?: { holdout: number[] };
}

/** The per-level persisted blob: an id counter and the level's books. */
export interface BooksBlob {
  nextId: number;
  books: OpeningBook[];
  /** The eval-weight vector the owner ADOPTED for this level's live enemy AI (from a
   * gym champion that passed SPRT validation), or absent if none is adopted. This is
   * the durable, account-scoped copy; game/adoptedWeights mirrors it into a local
   * cache the live AI reads synchronously. */
  adoptedWeights?: number[];
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
  const blob: BooksBlob = { ...existingBlob, nextId: id + 1, books: [...existingBlob.books, book] };
  return { blob, book };
}

/** Remove a book by id (nextId is never rewound — ids stay stable/unique). The
 * level's adopted weights are book-independent, so they survive a book delete. */
export function deleteBook(blob: BooksBlob, id: number): BooksBlob {
  return { ...blob, books: blob.books.filter((b) => b.id !== id) };
}

/** Replace a book in the blob by id (returns a new blob; unchanged if id absent). */
export function updateBook(blob: BooksBlob, book: OpeningBook): BooksBlob {
  return { ...blob, books: blob.books.map((b) => (b.id === book.id ? book : b)) };
}

const clamp01ob = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Deterministic disjoint train/holdout partition of `positionCount` positions BY
 * INDEX (indices survive re-sorting and are compact to persist). Holdout = the
 * ceil(count × fraction) indices with the smallest seeded hash — stable, exactly the
 * fraction, and disjoint from train by construction. `salt` lets a book re-split
 * reproducibly (e.g. rotation across runs).
 */
export function splitBook(positionCount: number, holdoutFraction = 0.3, salt = 0): { holdout: number[] } {
  const n = Math.max(0, Math.floor(positionCount));
  const k = Math.min(n, Math.ceil(n * clamp01ob(holdoutFraction)));
  if (k <= 0) return { holdout: [] };
  const hash = (i: number): number => {
    let h = (((i + 1) * 2654435761) + (salt * 40503)) >>> 0;
    h ^= h >>> 15; h = (h * 2246822519) >>> 0;
    return h >>> 0;
  };
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => hash(a) - hash(b) || a - b);
  return { holdout: idx.slice(0, k).sort((a, b) => a - b) };
}

/** Positions SPSA trains on (everything not in the holdout). Absent split ⇒ all. */
export function trainPositions(book: OpeningBook): BookPosition[] {
  const h = new Set(book.split?.holdout ?? []);
  return h.size ? book.positions.filter((_, i) => !h.has(i)) : book.positions;
}

/** Positions the champion is SPRT-validated on (never trained). Absent split ⇒ []. */
export function holdoutPositions(book: OpeningBook): BookPosition[] {
  const h = new Set(book.split?.holdout ?? []);
  return h.size ? book.positions.filter((_, i) => h.has(i)) : [];
}
