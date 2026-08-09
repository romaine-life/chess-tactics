import { afterEach, describe, expect, it, vi } from 'vitest';
import { craftActiveRunFromLink, saveActiveRun } from './activeRun';

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json' },
});
const sentRun = (fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> => (
  JSON.parse(fetchMock.mock.calls[call][1].body).run
);

describe('saving an active Run', () => {
  // The War is every Battle's Level, snapshotted once at Run creation and never written again in
  // flight. Sending it with each save shipped ~325 KB to change ~3 KB, on every placement, and put
  // the body past the request ceiling — the save simply 413'd and nothing persisted.
  const run = { id: 'run-1', goldTenths: 40, war: { id: 'w', battles: [{ level: {} }] } } as never;

  it('leaves the War out of an ordinary save', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ run: { id: 'run-1' }, revision: 4 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveActiveRun(run, 3)).resolves.toMatchObject({ revision: 4 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentRun(fetchMock)).not.toHaveProperty('war');
    // Everything else still goes, and the caller's document is not mutated.
    expect(sentRun(fetchMock)).toMatchObject({ id: 'run-1', goldTenths: 40 });
    expect(run).toHaveProperty('war');
  });

  // A new Run's first save is exactly the case the server cannot stitch: it holds a different
  // Run's War, or none. It says so, and the client answers with the whole document.
  it('resends the whole document when the server is not holding this Run', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'active_run_war_required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(ok({ run: { id: 'run-1' }, revision: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveActiveRun(run, 0)).resolves.toMatchObject({ revision: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentRun(fetchMock, 0)).not.toHaveProperty('war');
    expect(sentRun(fetchMock, 1)).toHaveProperty('war');
  });

  it('does not retry a different rejection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'invalid_active_run', details: 'run.phase is invalid',
    }), { status: 400, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveActiveRun(run, 3)).rejects.toThrow(/run\.phase is invalid/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a revision conflict rather than resending', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'active_run_revision_conflict',
    }), { status: 409, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveActiveRun(run, 3)).rejects.toThrow(/409/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

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
