// Retention machinery for per-level opening books: the save/load round-trip that
// makes "switch the dropdown and the book's champion + curve come back" true, plus
// the id bookkeeping and the storage traj cap. Runs in the node env, so it stubs a
// global localStorage (the store reads the global, guarded by a typeof check).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadBooks, saveBooks, makeNewBook, deleteBook, updateBook, freshSession, emptyBlob,
  type BooksBlob, type OpeningBook, type GymPoint,
} from './openingBooks';

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string): string | null => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string): void => { map.set(k, String(v)); },
    removeItem: (k: string): void => { map.delete(k); },
    clear: (): void => map.clear(),
  };
}

const gp = (step: number): GymPoint => ({ step, score: 0.5, yPlus: 0.5, yMinus: 0.5, c: 0.1, a: 0.1, theta: [1, 2, 3] });

const bookObj = (id: number, trajLen = 0): OpeningBook => ({
  id,
  settings: { size: 2, seedBase: 1, plies: 2, variety: 0.5 },
  positions: [{ seed: id, moves: [] }],
  session: {
    k: trajLen,
    theta: [1, 2, 3],
    champion: { step: trajLen - 1, score: 0.7, theta: [1, 2, 3] },
    established: 2,
    traj: Array.from({ length: trajLen }, (_, i) => gp(i)),
  },
});

beforeEach(() => { vi.stubGlobal('localStorage', makeStorage()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('freshSession', () => {
  it('starts at the reference: score 0.5, step -1, k 0, empty curve', () => {
    const s = freshSession();
    expect(s.k).toBe(0);
    expect(s.established).toBe(0);
    expect(s.traj).toEqual([]);
    expect(s.champion.step).toBe(-1);
    expect(s.champion.score).toBe(0.5);
    expect(s.theta.length).toBeGreaterThan(0);
    expect(s.champion.theta).toEqual(s.theta);
  });
});

describe('makeNewBook', () => {
  it('assigns the next id, a fresh session, no positions, and advances nextId', () => {
    const one = makeNewBook(emptyBlob(), { size: 4, seedBase: 1, plies: 4, variety: 0.5 });
    expect(one.book.id).toBe(1);
    expect(one.blob.nextId).toBe(2);
    expect(one.book.positions).toEqual([]);
    expect(one.book.session).toEqual(freshSession());

    const two = makeNewBook(one.blob, { size: 8, seedBase: 10, plies: 6, variety: 1 });
    expect(two.book.id).toBe(2);
    expect(two.blob.nextId).toBe(3);
    expect(two.blob.books).toHaveLength(2);
  });
});

describe('save/load round-trip', () => {
  it('preserves each book\'s champion and full convergence curve — the retained session', () => {
    const blob: BooksBlob = { nextId: 3, books: [bookObj(1, 3), bookObj(2, 0)] };
    saveBooks('lvl-a', blob);
    const loaded = loadBooks('lvl-a');
    expect(loaded.books).toHaveLength(2);
    expect(loaded.nextId).toBe(3);
    // The literal "switch back and your training is exactly where you left it" claim:
    expect(loaded.books[0].session.champion).toEqual(blob.books[0].session.champion);
    expect(loaded.books[0].session.traj).toEqual(blob.books[0].session.traj);
    expect(loaded.books[0].settings).toEqual(blob.books[0].settings);
    expect(loaded.books[0].positions).toEqual(blob.books[0].positions);
  });

  it('an unknown level loads an empty blob (no crash)', () => {
    expect(loadBooks('never-saved')).toEqual(emptyBlob());
  });

  it('reconciles nextId above any stored id and drops malformed book entries', () => {
    const raw = JSON.stringify({
      nextId: 1, // stale/too-low on purpose
      books: [bookObj(5, 1), { id: 'x' }, null, { id: 6, settings: {} /* missing session */ }],
    });
    localStorage.setItem('gym-books:lvl-b', raw);
    const loaded = loadBooks('lvl-b');
    expect(loaded.books.map((b) => b.id)).toEqual([5]); // only the well-formed one survives
    expect(loaded.nextId).toBe(6); // max(1, maxId 5 + 1)
  });
});

describe('deleteBook / updateBook', () => {
  it('deleteBook removes only the target and never rewinds nextId', () => {
    const blob: BooksBlob = { nextId: 4, books: [bookObj(1), bookObj(2), bookObj(3)] };
    const after = deleteBook(blob, 2);
    expect(after.books.map((b) => b.id)).toEqual([1, 3]);
    expect(after.nextId).toBe(4);
  });

  it('updateBook replaces by id and is a no-op for an absent id', () => {
    const blob: BooksBlob = { nextId: 3, books: [bookObj(1), bookObj(2)] };
    const edited = { ...bookObj(2, 5) };
    const after = updateBook(blob, edited);
    expect(after.books.find((b) => b.id === 2)?.session.traj).toHaveLength(5);
    const noop = updateBook(blob, bookObj(99));
    expect(noop.books).toEqual(blob.books);
  });
});

describe('storage traj cap', () => {
  it('caps a persisted trajectory to the newest 400 points (unbounded-growth guard)', () => {
    const book = bookObj(1, 500); // steps 0..499
    saveBooks('lvl-cap', { nextId: 2, books: [book] });
    const loaded = loadBooks('lvl-cap');
    const traj = loaded.books[0].session.traj;
    expect(traj).toHaveLength(400);
    expect(traj[0].step).toBe(100);   // oldest 100 dropped
    expect(traj[399].step).toBe(499); // newest kept
  });
});
