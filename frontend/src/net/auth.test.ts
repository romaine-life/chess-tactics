import { afterEach, describe, it, expect, vi } from 'vitest';
import { HttpError } from './http';
import {
  fetchMeStatus,
  isReauthenticationRequired,
  isUnauthorized,
  signInHref,
  updateDisplayName,
} from './auth';

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

  it('does not treat a restart-time non-2xx response as a sign-out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('backend is starting', { status: 404 })));
    await expect(fetchMeStatus()).resolves.toEqual({
      user: { signed_in: false },
      reachable: false,
    });
  });

  it('requires the successful response to carry the auth contract', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
    await expect(fetchMeStatus()).resolves.toEqual({
      user: { signed_in: false },
      reachable: false,
    });
  });

});

describe('updateDisplayName', () => {
  it('preserves an authoritative 401 for the shared session owner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'sign_in_required' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )));

    await expect(updateDisplayName('Renamed')).rejects.toMatchObject({ status: 401 });
  });
});

describe('step-up challenges are not sign-outs', () => {
  it('keeps a step-up 401 out of the sign-out classifier', () => {
    const stepUp = new HttpError('publish officials', 401, 'insufficient_user_authentication');
    // The session is alive; only the admin window lapsed (ADR-0576, decision 3). Reporting this
    // to the session owner would sign the whole shell out over a session that never ended.
    expect(isReauthenticationRequired(stepUp)).toBe(true);
    expect(isUnauthorized(stepUp)).toBe(false);
  });

  it('still treats an ordinary 401 as an authoritative sign-out', () => {
    const signedOut = new HttpError('save level', 401, 'sign_in_required');
    expect(isReauthenticationRequired(signedOut)).toBe(false);
    expect(isUnauthorized(signedOut)).toBe(true);
  });
});
