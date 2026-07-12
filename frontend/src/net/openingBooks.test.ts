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

  it('round-trips the TD run library and caps each run (probe log + ledger, newest windows)', async () => {
    const doc = {
      opts: { games: 600, seed: 1 }, seedCount: 3,
      session: {
        train: { game: 50, weights: { pawn: 0.1 }, outcomes: { playerWins: 1, draws: 49, enemyWins: 0 } },
        probe: null, lastGame: null,
        ledger: Array.from({ length: 2100 }, (_, i) => ({ game: i + 1, winner: 'draw', plies: 3, epsilon: 0.5, delta: {} })),
      },
      probeLog: Array.from({ length: 450 }, (_, i) => ({ game: (i + 1) * 25, winRate: 0.5 })),
      summary: null, kept: false,
    };
    const lib = { nextId: 3, activeId: 2, runs: [{ id: 2, name: 'Run 2', ...doc }] };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await saveOpeningBooks('lvl-td', { nextId: 1, books: [], tdRuns: lib } as never);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    const run = sent.data.tdRuns.runs[0];
    expect(sent.data.tdRuns.activeId).toBe(2);
    expect(run.session.train.game).toBe(50);
    expect(run.probeLog).toHaveLength(400);              // newest window kept
    expect(run.probeLog[0].game).toBe(51 * 25);          // oldest 50 dropped
    expect(run.session.ledger).toHaveLength(2000);       // ledger window
    expect(run.session.ledger[0].game).toBe(101);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { nextId: 1, books: [], tdRuns: lib } }));
    const loaded = await loadOpeningBooks('lvl-td');
    expect(loaded.tdRuns?.runs[0].session.train.game).toBe(50);
  });

  it('migrates the retired single-run tdSession field into the library as Run 1 on load, and never writes it back', async () => {
    const doc = {
      opts: { games: 600, seed: 1 }, seedCount: 3,
      session: { train: { game: 600, weights: { pawn: 0.1 }, outcomes: { playerWins: 70, draws: 457, enemyWins: 73 } }, probe: null, lastGame: null },
      probeLog: [{ game: 600, winRate: 0.8125 }],
      summary: null, kept: true,
      adoption: { at: 'then', vector: [1], pieceValues: {}, fromGames: 600, seeds: [1], source: 'live-weights' },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { nextId: 1, books: [], tdSession: doc } }));
    const loaded = await loadOpeningBooks('lvl-legacy');
    expect(loaded.tdSession).toBeUndefined();
    expect(loaded.tdRuns).toEqual({ nextId: 2, activeId: 1, runs: [{ id: 1, name: 'Run 1', ...doc }] });

    // The migrated shape is what persists — the legacy field is gone from the PUT.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await saveOpeningBooks('lvl-legacy', loaded);
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent.data.tdSession).toBeUndefined();
    expect(sent.data.tdRuns.runs[0].kept).toBe(true);
    expect(sent.data.tdRuns.runs[0].adoption.fromGames).toBe(600);
  });

  it('a blob with BOTH fields keeps the library and drops the stale legacy field', async () => {
    const mk = (game: number) => ({
      opts: { games: 10, seed: 1 }, seedCount: 1,
      session: { train: { game, weights: {}, outcomes: { playerWins: 0, draws: game, enemyWins: 0 } }, probe: null, lastGame: null },
      probeLog: [], summary: null, kept: false,
    });
    const lib = { nextId: 4, activeId: 3, runs: [{ id: 3, name: 'Run 3', ...mk(7) }] };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { nextId: 1, books: [], tdSession: mk(2), tdRuns: lib } }));
    const loaded = await loadOpeningBooks('lvl-both');
    expect(loaded.tdSession).toBeUndefined();
    expect(loaded.tdRuns).toEqual(lib);
  });

  it('throws HttpError on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'sign_in_required' }));
    await expect(saveOpeningBooks('lvl-b', { nextId: 1, books: [] })).rejects.toMatchObject({ status: 401 });
  });
});
