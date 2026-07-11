import { afterEach, describe, it, expect, vi } from 'vitest';
import { HttpError } from './http';
import { fetchMeStatus, isUnauthorized, signInHref } from './auth';

afterEach(() => vi.unstubAllGlobals());

describe('HttpError', () => {
  it('carries the status code and a descriptive message', () => {
    const err = new HttpError('save', 401);
    expect(err.status).toBe(401);
    expect(err.message).toContain('save');
    expect(err.message).toContain('401');
    expect(err).toBeInstanceOf(Error);
  });

  it('includes backend details when present', () => {
    const err = new HttpError('save-official', 400, 'invalid_workspace: levels.off-l.layers.zones contains an invalid zone');
    expect(err.status).toBe(400);
    expect(err.details).toContain('invalid_workspace');
    expect(err.message).toContain('levels.off-l.layers.zones');
  });
});

describe('isUnauthorized', () => {
  it('is true only for a 401-bearing error', () => {
    expect(isUnauthorized(new HttpError('load', 401))).toBe(true);
    expect(isUnauthorized(new HttpError('load', 404))).toBe(false);
    expect(isUnauthorized(new HttpError('save', 503))).toBe(false);
    expect(isUnauthorized(new Error('boom'))).toBe(false);
    expect(isUnauthorized(null)).toBe(false);
    expect(isUnauthorized(undefined)).toBe(false);
    expect(isUnauthorized('401')).toBe(false);
  });
});

describe('signInHref', () => {
  it('encodes the returnTo path so the backend can round-trip it', () => {
    expect(signInHref('/edit')).toBe('/api/auth/sign-in?returnTo=%2Fedit');
    expect(signInHref('/design/main-menu?x=1')).toBe('/api/auth/sign-in?returnTo=%2Fdesign%2Fmain-menu%3Fx%3D1');
  });
});

describe('fetchMeStatus', () => {
  it('keeps an unreachable auth service distinct from a signed-out response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(fetchMeStatus()).resolves.toEqual({
      user: { signed_in: false },
      reachable: false,
    });
  });

  it('reports a normal signed-out auth payload as reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ signed_in: false }), { status: 200 })));
    await expect(fetchMeStatus()).resolves.toEqual({
      user: { signed_in: false },
      reachable: true,
    });
  });
});
