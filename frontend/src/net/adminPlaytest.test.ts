import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeAdminPlaytest } from './adminPlaytest';

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
});
