// Runtime loader for the DB-backed main-menu asset catalog. The backend serves
// the catalog metadata at GET /api/design-assets (slots/status/metadata + a
// per-asset image URL); the binary PNGs stream from
// GET /api/design-assets/:id/image. Everything is best-effort, mirroring
// render/sprites.ts: any fetch/parse failure returns null so callers fall back
// to the baked catalog (bakedCatalogFallback) or their own defaults.
//
// The typed shape is validated at the trust boundary (same spirit as
// core/level.ts validateLevel): we only surface entries that carry a usable id.

export interface AssetCatalogEntry {
  id: string;
  status: string | null;
  /** Geometry the catalog carries for this asset: {sheet, states, rules, rect} (whichever exist). */
  slots: Record<string, unknown>;
  metadata: Record<string, unknown>;
  revision: number;
  updatedAt: string | null;
  /** URL the image bytes stream from (GET /api/design-assets/:id/image). */
  image: string;
}

export interface AssetCatalog {
  entries: AssetCatalogEntry[];
  byId: Map<string, AssetCatalogEntry>;
  storeSchemaVersion: number | null;
}

interface RawAsset {
  id?: unknown;
  status?: unknown;
  slots?: unknown;
  metadata?: unknown;
  revision?: unknown;
  updated_at?: unknown;
  image?: unknown;
}

interface RawCatalogResponse {
  assets?: unknown;
  store_schema_version?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Build the per-image URL without a network round-trip (callers compositing icons). */
export function assetImageUrl(id: string, base = ''): string {
  return `${base}/api/design-assets/${encodeURIComponent(id)}/image`;
}

function normalizeEntry(raw: RawAsset, base: string): AssetCatalogEntry | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  return {
    id,
    status: typeof raw.status === 'string' ? raw.status : null,
    slots: isRecord(raw.slots) ? raw.slots : {},
    metadata: isRecord(raw.metadata) ? raw.metadata : {},
    revision: typeof raw.revision === 'number' && Number.isFinite(raw.revision) ? raw.revision : 0,
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
    // Trust the server-provided URL when present; otherwise derive it so the
    // entry is always usable.
    image: typeof raw.image === 'string' && raw.image ? `${base}${raw.image}` : assetImageUrl(id, base),
  };
}

function toCatalog(response: RawCatalogResponse, base: string): AssetCatalog {
  const rawAssets = Array.isArray(response.assets) ? response.assets : [];
  const entries: AssetCatalogEntry[] = [];
  for (const raw of rawAssets) {
    if (!isRecord(raw)) continue;
    const entry = normalizeEntry(raw as RawAsset, base);
    if (entry) entries.push(entry);
  }
  const byId = new Map<string, AssetCatalogEntry>();
  for (const entry of entries) byId.set(entry.id, entry);
  return {
    entries,
    byId,
    storeSchemaVersion:
      typeof response.store_schema_version === 'number' ? response.store_schema_version : null,
  };
}

/**
 * Load the catalog from the backend. `base` lets callers/tests point at a
 * different origin; defaults to same-origin. Returns null (never throws) if the
 * catalog cannot be loaded, so callers can branch to bakedCatalogFallback() or
 * their own defaults.
 */
export async function loadAssetCatalog(base = ''): Promise<AssetCatalog | null> {
  try {
    const res = await fetch(`${base}/api/design-assets`);
    if (!res.ok) return null;
    const body = (await res.json()) as RawCatalogResponse;
    if (!body || typeof body !== 'object' || !Array.isArray(body.assets)) return null;
    return toCatalog(body, base);
  } catch {
    return null;
  }
}

/**
 * The committed catalog that seeds the DB doubles as the offline fallback. It is
 * imported lazily (dynamic import) so it is only pulled into the bundle when a
 * caller actually invokes the fallback, keeping the happy path tree-shakeable.
 * Image URLs still point at the API route so a single fallback path works once
 * the backend recovers.
 */
export async function bakedCatalogFallback(base = ''): Promise<AssetCatalog> {
  const baked = (await import('../asset-catalog.json')).default as { assets?: unknown };
  const rawAssets = Array.isArray(baked.assets) ? baked.assets : [];
  const normalized: RawAsset[] = rawAssets
    .filter((asset): asset is Record<string, unknown> => isRecord(asset))
    .map((asset) => {
      const slots: Record<string, unknown> = {};
      for (const key of ['sheet', 'states', 'rules', 'rect'] as const) {
        if (asset[key] !== undefined) slots[key] = asset[key];
      }
      return {
        id: asset.id,
        status: asset.status,
        slots,
        metadata: {
          type: asset.type ?? null,
          title: asset.title ?? null,
          summary: asset.summary ?? null,
          source: asset.source ?? null,
        },
        revision: 0,
        updated_at: null,
        image: typeof asset.id === 'string' ? assetImageUrl(asset.id, base) : undefined,
      };
    });
  return toCatalog({ assets: normalized, store_schema_version: null }, base);
}
