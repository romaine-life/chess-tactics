import { afterEach, describe, expect, it, vi } from 'vitest';
import { craftActiveRunFromLink } from './activeRun';

afterEach(() => vi.unstubAllGlobals());

describe('crafted active Run responses', () => {
  it('carries the server-authorized terminal board landing beside, not inside, the Run', async () => {
    const run = { id: 'run-crafted', phase: 'battle', battleIndex: 2 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      run,
      revision: 7,
      updated_at: '2026-08-05T00:00:00.000Z',
      battleResult: 'player',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(craftActiveRunFromLink('abcdef123456')).resolves.toEqual({
      run,
      revision: 7,
      updated_at: '2026-08-05T00:00:00.000Z',
      battleResult: 'player',
    });
    expect(run).not.toHaveProperty('battleResult');
    expect(fetchMock).toHaveBeenCalledWith('/api/active-run/craft/abcdef123456', expect.objectContaining({ method: 'POST' }));
  });

  it('treats an absent or unknown landing as an ordinary crafted Run', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      run: { id: 'run-ordinary', phase: 'battle', battleIndex: 0 },
      revision: 1,
      battleResult: 'enemy',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await expect(craftActiveRunFromLink('abcdef123456')).resolves.toMatchObject({ battleResult: null });
  });
});
