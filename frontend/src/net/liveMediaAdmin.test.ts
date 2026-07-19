import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acceptLiveMediaVersions,
  createLiveMediaVersion,
  reviewLiveMediaVersion,
  uploadLiveMediaVersionContent,
} from './liveMediaAdmin';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('live-media admin client', () => {
  it('creates and uploads a private candidate with idempotency and revision guards', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      version: { id, rowRevision: fetchMock.mock.calls.length },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const created = await createLiveMediaVersion({
      slot: 'boards/fortress-gate/plate.png',
      domain: 'background',
      role: 'media',
      label: 'Fortress Gate board background',
      provenance: { pipeline: 'predrawn-board-generation-v1' },
    }, 'predrawn-fortress-gate-aabbcc');
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    await uploadLiveMediaVersionContent({
      id: created.id,
      expectedRevision: 0,
      bytes: png,
      mediaType: 'image/png',
    });

    expect(fetchMock.mock.calls[0]).toEqual([
      '/api/admin/media-versions',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Idempotency-Key': 'predrawn-fortress-gate-aabbcc' }),
      }),
    ]);
    expect(fetchMock.mock.calls[1]).toEqual([
      `/api/admin/media-versions/${id}/content`,
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'image/png', 'If-Match': '"0"' }),
        body: png,
      }),
    ]);
  });

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
