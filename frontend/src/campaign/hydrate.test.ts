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
