import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentLiveMediaCatalog, resetLiveMediaCatalog } from '@chess-tactics/board-render';
import { loadLiveMediaCatalog } from './liveMedia';

const catalog = {
  schemaVersion: 1,
  revision: 4,
  updatedAt: '2026-07-11T00:00:00.000Z',
  slots: [{
    slot: 'tiles/surface/water-default-side.png',
    domain: 'terrain',
    role: 'side',
    availabilityPolicy: 'critical',
    activeVersionId: '00000000-0000-4000-8000-000000000001',
    rowRevision: 2,
    metadata: {},
    versionStatus: 'accepted',
    productionEligible: true,
    versionMetadata: {},
    provenance: { generator: 'synthetic-test' },
    nativeEvidence: { reviewedAt1x: true },
    media: {
      url: '/assets/tiles/surface/water-default-side.png',
      immutableUrl: `/api/media/${'a'.repeat(64)}`,
      sha256: 'a'.repeat(64),
      mediaType: 'image/png',
      width: 96,
      height: 180,
      byteLength: 3573,
    },
  }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetLiveMediaCatalog();
});

describe('live media client', () => {
  it('requires and applies the backend catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => catalog })));
    expect(await loadLiveMediaCatalog()).toBe(true);
    expect(currentLiveMediaCatalog()?.revision).toBe(4);
  });

  it('does not select a Git or empty fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => 'unavailable' })));
    await expect(loadLiveMediaCatalog()).rejects.toThrow();
    expect(currentLiveMediaCatalog()).toBeNull();
  });
});
