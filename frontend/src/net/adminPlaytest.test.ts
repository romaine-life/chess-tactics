import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeAdminPlaytest } from './adminPlaytest';
import { isReauthenticationRequired, isUnauthorized } from './auth';

describe('admin playtest authorization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the exact intervention to the admin-gated endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await authorizeAdminPlaytest({ action: 'gain-gold', amountTenths: 25 });

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/playtest/authorize', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ action: 'gain-gold', amountTenths: 25 }),
    }));
  });

  // The whole seam, because each half is easy to change without the other: requireAdmin's step-up
  // body, HttpError's `error: details` join, and the predicate the controls branch on. When it
  // breaks, the owner is told `authorize-admin-playtest failed (401):
  // insufficient_user_authentication` and offered nothing — which is what sent this to a session.
  it('reports an expired admin window as a re-authentication, not a sign-out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'insufficient_user_authentication', reauthenticate: '/api/auth/sign-in?prompt=login' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )));

    const error = await authorizeAdminPlaytest({ action: 'win-battle' }).catch((thrown: unknown) => thrown);

    expect(isReauthenticationRequired(error)).toBe(true);
    expect(isUnauthorized(error)).toBe(false);
  });

  it('reports a real sign-out as a sign-out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'sign_in_required' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )));

    const error = await authorizeAdminPlaytest({ action: 'win-battle' }).catch((thrown: unknown) => thrown);

    expect(isReauthenticationRequired(error)).toBe(false);
    expect(isUnauthorized(error)).toBe(true);
  });
});
