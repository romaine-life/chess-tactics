import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test('retries official campaigns after a transient backend failure', async () => {
  vi.resetModules();
  let officialAttempts = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/official-campaigns/default')) {
      officialAttempts += 1;
      if (officialAttempts === 1) return { ok: false } as Response;
      return {
        ok: true,
        json: async () => ({
          portfolio: {
            data: {
              campaigns: [{
                id: 'off-c-recovered',
                name: 'Recovered campaign',
                levels: [],
                locked: true,
                chapters: 1,
                favorite: false,
                difficulty: 'normal',
                formatVersion: 1,
              }],
              levels: {},
            },
          },
        }),
      } as Response;
    }
    throw new Error('signed-out workspace');
  }));

  const { ensureCampaignsHydrated } = await import('./hydrate');
  const { useCampaigns } = await import('./store');

  await ensureCampaignsHydrated();
  expect(useCampaigns.getState().campaigns).toEqual([]);

  await ensureCampaignsHydrated();
  expect(officialAttempts).toBe(2);
  expect(useCampaigns.getState().campaigns.map((campaign) => campaign.id)).toEqual(['off-c-recovered']);
});

test('concurrent callers wait for the user workspace after officials merge', async () => {
  vi.resetModules();
  let signalWorkspaceRequested!: () => void;
  const workspaceRequested = new Promise<void>((resolve) => { signalWorkspaceRequested = resolve; });
  let releaseWorkspace!: (response: Response) => void;
  const workspaceResponse = new Promise<Response>((resolve) => { releaseWorkspace = resolve; });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/official-campaigns/default')) {
      return {
        ok: true,
        json: async () => ({ portfolio: { data: { campaigns: [{ id: 'off-c-one', name: 'One', levels: [], locked: true, chapters: 1, favorite: false, difficulty: 'normal', formatVersion: 1 }], levels: {} } } }),
      } as Response;
    }
    if (url.includes('/api/campaign-workspace')) {
      signalWorkspaceRequested();
      return workspaceResponse;
    }
    throw new Error(`unexpected fetch ${url}`);
  }));

  const { ensureCampaignsHydrated } = await import('./hydrate');
  const first = ensureCampaignsHydrated();
  await workspaceRequested;
  let secondResolved = false;
  const second = ensureCampaignsHydrated().then(() => { secondResolved = true; });
  await Promise.resolve();
  expect(secondResolved).toBe(false);

  releaseWorkspace({ ok: true, json: async () => ({ campaigns: [], levels: {} }) } as Response);
  await Promise.all([first, second]);
  expect(secondResolved).toBe(true);
});

test('reports an unavailable private workspace and retries only that slice', async () => {
  vi.resetModules();
  let officialAttempts = 0;
  let workspaceAttempts = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/official-campaigns/default')) {
      officialAttempts += 1;
      return new Response(JSON.stringify({ portfolio: { data: { campaigns: [], levels: {} } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/api/campaign-workspace')) {
      workspaceAttempts += 1;
      return workspaceAttempts === 1
        ? new Response(JSON.stringify({ error: 'workspace_unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ campaigns: [], levels: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));

  const { ensureCampaignsHydrated } = await import('./hydrate');
  expect(await ensureCampaignsHydrated()).toMatchObject({ officialAvailable: true, userWorkspace: 'unavailable' });
  expect(await ensureCampaignsHydrated()).toMatchObject({ officialAvailable: true, userWorkspace: 'loaded' });
  expect(officialAttempts).toBe(1);
  expect(workspaceAttempts).toBe(2);
});

test('treats signed-out as a settled private slice but not an unavailable response', async () => {
  const { isUserWorkspaceAvailable } = await import('./hydrate');
  expect(isUserWorkspaceAvailable('loaded')).toBe(true);
  expect(isUserWorkspaceAvailable('signed-out')).toBe(true);
  expect(isUserWorkspaceAvailable('unavailable')).toBe(false);
});
