// Contract test for the opening-books net client: asserts URL/method/body shape
// against a fetch mock, the empty-blob-on-miss fallback, the traj cap applied on
// save, and that a non-ok status (e.g. 401 signed-out) throws HttpError so the
// caller can decide.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpError } from './http';
import { loadOpeningBooks, saveOpeningBooks } from './openingBooks';
import type { BooksBlob, OpeningBook } from '../lab/openingBooks';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

const bookObj = (id: number, trajLen: number): OpeningBook => ({
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

describe('loadOpeningBooks', () => {
  it('GETs the level-scoped url with credentials and returns the stored blob', async () => {
    const blob: BooksBlob = { nextId: 5, books: [bookObj(4, 2)] };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: blob }));

    const out = await loadOpeningBooks('lvl-a');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/opening-books/lvl-a');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
    expect(out).toEqual(blob);
  });

  it('encodes a level id with url-unsafe characters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { nextId: 1, books: [] } }));
    await loadOpeningBooks('a/b c');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/opening-books/a%2Fb%20c');
  });

  it('returns an empty blob when the server reports no stored books', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { nextId: 1, books: [] } }));
    expect(await loadOpeningBooks('never-saved')).toEqual({ nextId: 1, books: [] });
  });

  it('returns an empty blob when the payload is malformed (no books array)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));
    expect(await loadOpeningBooks('lvl-x')).toEqual({ nextId: 1, books: [] });
  });

  it('defaults nextId to 1 when books are valid but nextId is missing/non-number', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { books: [bookObj(4, 1)] } }));
    const out = await loadOpeningBooks('lvl-y');
    expect(out.nextId).toBe(1);
    expect(out.books).toHaveLength(1);
  });

  it('throws HttpError with the status on a signed-out 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'sign_in_required' }));
    await expect(loadOpeningBooks('lvl-a')).rejects.toMatchObject({ status: 401 });
    await expect(loadOpeningBooks('lvl-a')).rejects.toBeInstanceOf(HttpError);
  });
});

describe('saveOpeningBooks', () => {
  it('PUTs { data } as JSON with credentials to the level-scoped url', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const blob: BooksBlob = { nextId: 3, books: [bookObj(2, 2)] };

    await saveOpeningBooks('lvl-b', blob);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/opening-books/lvl-b');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(init.headers['content-type']).toBe('application/json');
    const sent = JSON.parse(init.body);
    expect(sent).toEqual({ data: blob });
  });

  it('caps each book trajectory to the newest 400 points before persisting', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await saveOpeningBooks('lvl-cap', { nextId: 2, books: [bookObj(1, 500)] });

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body) as { data: BooksBlob };
    const traj = sent.data.books[0].session.traj;
    expect(traj).toHaveLength(400);
    expect(traj[0].step).toBe(100);   // oldest 100 dropped
    expect(traj[399].step).toBe(499); // newest kept
  });

  it('round-trips the TD session document and caps its probe log', async () => {
    const doc = {
      opts: { games: 600, seed: 1 }, seedCount: 3,
      session: { train: { game: 50, weights: { pawn: 0.1 }, outcomes: { playerWins: 1, draws: 49, enemyWins: 0 } }, probe: null, lastGame: null },
      probeLog: Array.from({ length: 450 }, (_, i) => ({ game: (i + 1) * 25, winRate: 0.5 })),
      summary: null, kept: false,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await saveOpeningBooks('lvl-td', { nextId: 1, books: [], tdSession: doc } as never);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.data.tdSession.session.train.game).toBe(50);
    expect(sent.data.tdSession.probeLog).toHaveLength(400);      // newest window kept
    expect(sent.data.tdSession.probeLog[0].game).toBe(51 * 25);  // oldest 50 dropped

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { nextId: 1, books: [], tdSession: doc } }));
    const loaded = await loadOpeningBooks('lvl-td');
    expect(loaded.tdSession?.session.train.game).toBe(50);
  });

  it('throws HttpError on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'sign_in_required' }));
    await expect(saveOpeningBooks('lvl-b', { nextId: 1, books: [] })).rejects.toMatchObject({ status: 401 });
  });
});
