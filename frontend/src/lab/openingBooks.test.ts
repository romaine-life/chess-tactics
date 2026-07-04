// Pure-helper coverage for the per-level opening-book store: the id bookkeeping and
// session shape that make "switch the dropdown and the book's champion + curve come
// back" true. Persistence itself is account-scoped in the backend and covered by
// net/openingBooks.test.ts — these tests exercise only the framework-free helpers.

import { describe, it, expect } from 'vitest';
import {
  makeNewBook, deleteBook, updateBook, freshSession, emptyBlob,
  type BooksBlob, type OpeningBook,
} from './openingBooks';

const bookObj = (id: number, trajLen = 0): OpeningBook => ({
  id,
  settings: { size: 2, seedBase: 1, plies: 2, variety: 0.5 },
  positions: [{ seed: id, moves: [] }],
  session: {
    k: trajLen,
    theta: [1, 2, 3],
    champion: { step: trajLen - 1, score: 0.7, theta: [1, 2, 3] },
    established: 2,
    traj: Array.from({ length: trajLen }, (_, i) => ({ step: i, score: 0.5, yPlus: 0.5, yMinus: 0.5, c: 0.1, a: 0.1, theta: [1, 2, 3] })),
  },
});

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

describe('emptyBlob', () => {
  it('is a fresh blob: nextId 1, no books', () => {
    expect(emptyBlob()).toEqual({ nextId: 1, books: [] });
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
