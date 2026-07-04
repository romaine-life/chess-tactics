// Pure-helper coverage for the per-level opening-book store: the id bookkeeping and
// session shape that make "switch the dropdown and the book's champion + curve come
// back" true. Persistence itself is account-scoped in the backend and covered by
// net/openingBooks.test.ts — these tests exercise only the framework-free helpers.

import { describe, it, expect } from 'vitest';
import {
  makeNewBook, deleteBook, updateBook, freshSession, emptyBlob,
  splitBook, trainPositions, holdoutPositions,
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

describe('train/holdout split (anti-overfit guard)', () => {
  const bookN = (n: number, split?: { holdout: number[] }): OpeningBook => ({
    id: 1,
    settings: { size: n, seedBase: 1, plies: 2, variety: 0.5 },
    positions: Array.from({ length: n }, (_, i) => ({ seed: i, moves: [] })),
    session: freshSession(),
    ...(split ? { split } : {}),
  });

  it('splitBook is deterministic, exactly the fraction, and disjoint-by-index', () => {
    expect(splitBook(20, 0.3, 0)).toEqual(splitBook(20, 0.3, 0));
    const s = splitBook(20, 0.3, 0);
    expect(s.holdout).toHaveLength(6); // ceil(20*0.3)
    expect(new Set(s.holdout).size).toBe(s.holdout.length);
    for (const i of s.holdout) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(20); }
  });

  it('a different salt yields a different partition', () => {
    expect(splitBook(20, 0.3, 0).holdout.join(',')).not.toBe(splitBook(20, 0.3, 7).holdout.join(','));
  });

  it('trainPositions and holdoutPositions are disjoint and cover every position', () => {
    const book = bookN(10, splitBook(10, 0.3));
    const train = trainPositions(book);
    const hold = holdoutPositions(book);
    expect(hold).toHaveLength(3);
    expect(train).toHaveLength(7);
    expect(new Set([...train, ...hold].map((p) => p.seed)).size).toBe(10);
  });

  it('back-compat: no split ⇒ train = all positions, holdout = []', () => {
    const book = bookN(5);
    expect(trainPositions(book)).toHaveLength(5);
    expect(holdoutPositions(book)).toHaveLength(0);
  });

  it('edge cases: empty book and fraction extremes', () => {
    expect(splitBook(0).holdout).toEqual([]);
    expect(splitBook(4, 0).holdout).toEqual([]);
    expect(splitBook(4, 1).holdout).toHaveLength(4);
  });
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
