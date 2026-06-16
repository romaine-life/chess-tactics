import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadAssetCatalog, assetImageUrl, bakedCatalogFallback } from './assetCatalog';

// Pure, no-network: fetch is stubbed so the loader's parsing and failure paths
// are exercised deterministically (same spirit as render/sprites best-effort).

const sampleResponse = {
  store_schema_version: 1,
  assets: [
    {
      id: 'button-9slice.main-menu',
      status: 'promoted',
      slots: { sheet: { image: '/x.png', width: 897, height: 488 }, states: { normal: {} } },
      metadata: { type: 'button-9slice.main-menu', title: 'Button' },
      revision: 3,
      updated_at: '2026-06-15T00:00:00.000Z',
      image: '/api/design-assets/button-9slice.main-menu/image',
    },
    {
      id: 'button-icon.main-menu.sword',
      status: 'promoted',
      slots: { rect: { x: 0, y: 0, w: 220, h: 220 } },
      metadata: {},
      revision: 0,
      updated_at: null,
      image: '/api/design-assets/button-icon.main-menu.sword/image',
    },
    // Entries without a usable id are dropped at the boundary.
    { status: 'draft' },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('assetImageUrl', () => {
  it('builds the per-image API route, with optional base', () => {
    expect(assetImageUrl('button-icon.main-menu.sword')).toBe(
      '/api/design-assets/button-icon.main-menu.sword/image',
    );
    expect(assetImageUrl('a.b', 'http://host')).toBe('http://host/api/design-assets/a.b/image');
  });
});

describe('loadAssetCatalog', () => {
  it('parses a catalog response into a typed list + id map', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => sampleResponse }) as unknown as Response),
    );
    const catalog = await loadAssetCatalog();
    expect(catalog).not.toBeNull();
    expect(catalog!.entries).toHaveLength(2); // the id-less entry is dropped
    expect(catalog!.storeSchemaVersion).toBe(1);
    const nine = catalog!.byId.get('button-9slice.main-menu');
    expect(nine).toBeTruthy();
    expect(nine!.status).toBe('promoted');
    expect(nine!.revision).toBe(3);
    expect(nine!.slots.sheet).toBeTruthy();
    expect(nine!.image).toBe('/api/design-assets/button-9slice.main-menu/image');
  });

  it('threads the base origin through fetch and image URLs', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => sampleResponse }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const catalog = await loadAssetCatalog('http://host');
    expect(fetchMock).toHaveBeenCalledWith('http://host/api/design-assets');
    expect(catalog!.byId.get('button-9slice.main-menu')!.image).toBe(
      'http://host/api/design-assets/button-9slice.main-menu/image',
    );
  });

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response));
    expect(await loadAssetCatalog()).toBeNull();
  });

  it('returns null when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect(await loadAssetCatalog()).toBeNull();
  });

  it('returns null when the body is not a catalog shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ nope: true }) }) as unknown as Response));
    expect(await loadAssetCatalog()).toBeNull();
  });
});

describe('bakedCatalogFallback', () => {
  it('parses the committed catalog into the same typed shape (offline fallback)', async () => {
    const catalog = await bakedCatalogFallback();
    expect(catalog.entries.length).toBeGreaterThan(0);
    const nine = catalog.byId.get('button-9slice.main-menu');
    expect(nine).toBeTruthy();
    // slots are projected from the baked sheet/states/rules/rect fields.
    expect(nine!.slots.sheet).toBeTruthy();
    expect(nine!.slots.states).toBeTruthy();
    // metadata carries the descriptive fields; the image points at the API route.
    expect(nine!.metadata.title).toBe('Main Menu Button 9-Slice');
    expect(nine!.image).toBe('/api/design-assets/button-9slice.main-menu/image');
  });
});
