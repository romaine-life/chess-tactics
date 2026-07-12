import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyLiveMediaCatalog,
  currentSeats,
  resetLiveMediaCatalog,
  resetPropSeats,
} from '@chess-tactics/board-render';
import { TEST_PROP_SEATS } from '../test/livePropSeats';
import { testGroundCoverCatalog, testStructureMediaSlots } from '../test/liveMediaCatalog';
import {
  currentLiveSeatsRevision,
  fetchLiveSeats,
  loadLiveSeats,
  resetLiveSeatsRevision,
  saveLiveSeats,
} from './propSeats';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  applyLiveMediaCatalog(testGroundCoverCatalog(testStructureMediaSlots()));
  resetPropSeats();
  resetLiveSeatsRevision();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetPropSeats();
  resetLiveSeatsRevision();
  resetLiveMediaCatalog();
  vi.restoreAllMocks();
});

describe('live prop seats', () => {
  it('fails a missing backend document instead of returning an empty overlay', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ error: 'prop_seats_store_unavailable' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    ));

    await expect(fetchLiveSeats()).rejects.toMatchObject({ status: 503 });
    expect(() => currentSeats()).toThrow(/not hydrated/);
  });

  it('rejects an incomplete successful response and remains unhydrated', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      portfolio: { data: { oak: TEST_PROP_SEATS.oak } },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(loadLiveSeats()).rejects.toThrow(/required prop "cottage" is missing/);
    expect(() => currentSeats()).toThrow(/not hydrated/);
  });

  it('hydrates exactly the complete backend document', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      portfolio: { data: TEST_PROP_SEATS, revision: 4 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(loadLiveSeats()).resolves.toBe(true);
    expect(currentSeats()).toEqual(TEST_PROP_SEATS);
    expect(currentLiveSeatsRevision()).toBe(4);
  });

  it('advances the compare-and-swap revision after every sequential save', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        return new Response(JSON.stringify({
          portfolio: { data: TEST_PROP_SEATS, revision: 4 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const request = JSON.parse(String(init.body)) as { expectedRevision: number };
      const revision = fetchMock.mock.calls.length === 2 ? 5 : 6;
      expect(request.expectedRevision).toBe(revision - 1);
      return new Response(JSON.stringify({
        portfolio: { data: TEST_PROP_SEATS, revision },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    globalThis.fetch = fetchMock;

    await loadLiveSeats();
    await expect(saveLiveSeats(TEST_PROP_SEATS)).resolves.toEqual({ revision: 5 });
    await expect(saveLiveSeats(TEST_PROP_SEATS)).resolves.toEqual({ revision: 6 });
    expect(currentLiveSeatsRevision()).toBe(6);
  });

  it('surfaces a stale save conflict without adopting its revision', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        return new Response(JSON.stringify({
          portfolio: { data: TEST_PROP_SEATS, revision: 4 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      expect(JSON.parse(String(init.body))).toMatchObject({ expectedRevision: 4 });
      return new Response(JSON.stringify({
        error: 'prop_seats_revision_conflict', currentRevision: 5,
      }), { status: 409, headers: { 'content-type': 'application/json' } });
    });
    globalThis.fetch = fetchMock;

    await loadLiveSeats();
    await expect(saveLiveSeats(TEST_PROP_SEATS)).rejects.toMatchObject({
      status: 409,
      details: 'prop_seats_revision_conflict',
    });
    // A conflict does not provide the current document, so advancing to its
    // revision here would let a retry overwrite content this tab never read.
    expect(currentLiveSeatsRevision()).toBe(4);
  });

  it('refuses to save before startup has loaded a revision', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(saveLiveSeats(TEST_PROP_SEATS)).rejects.toThrow(/before their live revision is loaded/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to PUT a partial document before making a request', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await expect(saveLiveSeats({ oak: TEST_PROP_SEATS.oak })).rejects.toThrow(/required prop "cottage" is missing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
