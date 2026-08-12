import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminLiveMediaCatalogSnapshot,
  loadAdminLiveMediaCatalog,
  refreshAdminLiveMediaCatalog,
  resetAdminLiveMediaCatalog,
  subscribeAdminLiveMediaCatalog,
} from './useAdminLiveMediaCatalog';

const catalog = { schemaVersion: 1, revision: 1, updatedAt: null, slots: [], versions: [] };

vi.mock('../../net/liveMediaAdmin', () => ({ fetchAdminLiveMediaCatalog: vi.fn() }));

const { fetchAdminLiveMediaCatalog } = await import('../../net/liveMediaAdmin');
const fetchMock = vi.mocked(fetchAdminLiveMediaCatalog);

beforeEach(() => {
  resetAdminLiveMediaCatalog();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(catalog as never);
});

afterEach(() => resetAdminLiveMediaCatalog());

describe('the Studio’s shared admin live-media catalog', () => {
  // The Studio builds every category's state on mount, so all eight review hooks run whether or
  // not their category is the open one. One request per category, of a payload measured in
  // megabytes, of which at most one is ever looked at, is what this exists to prevent.
  it('reads once however many categories ask at the same time', async () => {
    await Promise.all([
      loadAdminLiveMediaCatalog(),
      loadAdminLiveMediaCatalog(),
      loadAdminLiveMediaCatalog(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(adminLiveMediaCatalogSnapshot().catalog).toBe(catalog);
  });

  it('serves a later caller from the cache without a second read', async () => {
    await loadAdminLiveMediaCatalog();
    await loadAdminLiveMediaCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // An install changes what is accepted, so every mounted category has to see the new catalog —
  // otherwise the one that installed and its neighbours disagree about what is installed.
  it('re-reads once for everybody when an install refreshes it, and tells them', async () => {
    await loadAdminLiveMediaCatalog();
    const seen: unknown[] = [];
    const unsubscribe = subscribeAdminLiveMediaCatalog(() => seen.push(adminLiveMediaCatalogSnapshot().catalog));

    const installed = { ...catalog, revision: 2 };
    fetchMock.mockResolvedValue(installed as never);
    await refreshAdminLiveMediaCatalog();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Cleared first so a stale catalog is never read as the current one, then republished.
    expect(seen).toEqual([null, installed]);
    expect(adminLiveMediaCatalogSnapshot().catalog).toBe(installed);
    unsubscribe();
  });

  it('reports a failed read to every subscriber and holds no catalog', async () => {
    fetchMock.mockRejectedValue(new Error('media catalog unavailable'));
    await loadAdminLiveMediaCatalog();
    expect(adminLiveMediaCatalogSnapshot()).toEqual({ catalog: null, error: 'media catalog unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops telling a subscriber that has unsubscribed', async () => {
    let calls = 0;
    const unsubscribe = subscribeAdminLiveMediaCatalog(() => { calls += 1; });
    await loadAdminLiveMediaCatalog();
    expect(calls).toBe(1);
    unsubscribe();
    await refreshAdminLiveMediaCatalog();
    expect(calls).toBe(1);
  });
});
