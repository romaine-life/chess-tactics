import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, requestJson } from './http';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  it('owns the authenticated JSON request shape for every client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ saved: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestJson<{ saved: boolean }>('POST', '/api/jobs', { name: 'one' }, { keepalive: true }))
      .resolves.toEqual({ saved: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/jobs', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'one' }),
      keepalive: true,
    }));
  });

  it('does not send a body for GET and handles an empty success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestJson<void>('GET', '/api/jobs')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('turns structured API failures into the shared HttpError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_job', details: 'missing seed' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })));

    const error = await requestJson('PUT', '/api/jobs/one').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      status: 400,
      details: 'invalid_job: missing seed',
      message: 'PUT /api/jobs/one failed (400): invalid_job: missing seed',
    });
  });
});
