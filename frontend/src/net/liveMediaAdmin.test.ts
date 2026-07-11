import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptLiveMediaVersions, reviewLiveMediaVersion } from './liveMediaAdmin';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('live-media admin client', () => {
  it('records nonempty hash-proof evidence with the observed candidate revision', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ version: { id: 'candidate' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await reviewLiveMediaVersion({
      id: '10000000-0000-4000-8000-000000000001',
      expectedRevision: 12,
      notes: 'Inspected at canonical one-times scale.',
      surfaceUrl: 'https://example.test/studio?sfamily=water',
      evidence: { sha256: 'a'.repeat(64), canonicalScale: 1 },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/media-versions/10000000-0000-4000-8000-000000000001/review',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    const reviewInit = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(reviewInit?.body))).toMatchObject({
      expectedRevision: 12,
      approved: true,
      notes: 'Inspected at canonical one-times scale.',
      evidence: { sha256: 'a'.repeat(64), canonicalScale: 1 },
    });
  });

  it('sends version and slot compare-and-swap state in the atomic batch', async () => {
    const response = { versions: [], catalogRevision: 9, batchId: 'batch' };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await acceptLiveMediaVersions([{
      id: '10000000-0000-4000-8000-000000000001',
      expectedRevision: 13,
      expectedSlotRevision: 21,
      expectedActiveVersionId: '20000000-0000-4000-8000-000000000001',
    }]);

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/media-versions/accept-batch', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
    const acceptInit = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(acceptInit?.body))).toEqual({
      items: [{
        id: '10000000-0000-4000-8000-000000000001',
        expectedRevision: 13,
        expectedSlotRevision: 21,
        expectedActiveVersionId: '20000000-0000-4000-8000-000000000001',
      }],
    });
  });
});
