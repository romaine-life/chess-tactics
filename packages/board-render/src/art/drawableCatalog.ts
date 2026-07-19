export interface DrawableMediaDescriptor {
  url: string;
  immutableUrl: string;
  sha256: string;
  mediaType: string;
  byteLength: number;
  width: number | null;
  height: number | null;
}

export interface DrawableMediaRole {
  slot: string;
  media: DrawableMediaDescriptor;
}

export interface DrawableAsset {
  id: string;
  kind: string;
  label: string;
  sortOrder: number;
  lifecycleState: 'active';
  behavior: Record<string, unknown>;
  metadata: Record<string, unknown>;
  rowRevision: number;
  media: Record<string, DrawableMediaRole>;
}

export interface DrawableCatalog {
  schemaVersion: 1;
  revision: number;
  updatedAt: string | null;
  assets: DrawableAsset[];
}

const ID = /^[a-z][a-z0-9._-]{0,127}$/;
const KIND = /^[a-z][a-z0-9._-]{0,63}$/;
const SHA = /^[0-9a-f]{64}$/;
let catalog: DrawableCatalog | null = null;
let byId = new Map<string, DrawableAsset>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function failure(message: string): Error {
  return new Error(`invalid drawable catalog: ${message}`);
}

export function assertDrawableCatalog(value: unknown): asserts value is DrawableCatalog {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision)) throw failure('invalid header');
  if (value.updatedAt !== null && typeof value.updatedAt !== 'string') throw failure('updatedAt is invalid');
  if (!Array.isArray(value.assets)) throw failure('assets are missing');
  const ids = new Set<string>();
  for (const raw of value.assets) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !ID.test(raw.id)) throw failure('asset id is invalid');
    if (ids.has(raw.id)) throw failure(`duplicate asset ${raw.id}`);
    ids.add(raw.id);
    if (typeof raw.kind !== 'string' || !KIND.test(raw.kind)) throw failure(`${raw.id} kind is invalid`);
    if (typeof raw.label !== 'string' || !raw.label.trim()) throw failure(`${raw.id} label is invalid`);
    if (!Number.isSafeInteger(raw.sortOrder) || !Number.isSafeInteger(raw.rowRevision)) throw failure(`${raw.id} revision/order is invalid`);
    if (raw.lifecycleState !== 'active') throw failure(`${raw.id} is not active`);
    if (!isRecord(raw.behavior) || !isRecord(raw.metadata) || !isRecord(raw.media)) throw failure(`${raw.id} metadata is invalid`);
    for (const [role, rawRole] of Object.entries(raw.media)) {
      if (!KIND.test(role) || !isRecord(rawRole) || typeof rawRole.slot !== 'string' || !isRecord(rawRole.media)) {
        throw failure(`${raw.id} media role ${role} is invalid`);
      }
      const media = rawRole.media;
      if (typeof media.sha256 !== 'string' || !SHA.test(media.sha256)
        || media.immutableUrl !== `/api/media/${media.sha256}`
        || typeof media.url !== 'string' || typeof media.mediaType !== 'string'
        || !Number.isSafeInteger(media.byteLength) || Number(media.byteLength) <= 0) {
        throw failure(`${raw.id} media role ${role} descriptor is invalid`);
      }
    }
  }
}

export function applyDrawableCatalog(value: unknown): boolean {
  assertDrawableCatalog(value);
  const changed = catalog?.revision !== value.revision;
  catalog = value;
  byId = new Map(value.assets.map((asset) => [asset.id, asset]));
  return changed;
}

export function resetDrawableCatalog(): void {
  catalog = null;
  byId = new Map();
}

export function currentDrawableCatalog(): DrawableCatalog {
  if (!catalog) throw failure('catalog is not hydrated');
  return catalog;
}

export function drawableAssets(kind?: string): DrawableAsset[] {
  const assets = currentDrawableCatalog().assets;
  return (kind ? assets.filter((asset) => asset.kind === kind) : assets).slice();
}

export function drawableAsset(id: string): DrawableAsset | undefined {
  currentDrawableCatalog();
  return byId.get(id);
}

export function requiredDrawableAsset(id: string, kind?: string): DrawableAsset {
  const asset = drawableAsset(id);
  if (!asset || (kind && asset.kind !== kind)) throw failure(`required ${kind ?? 'asset'} ${id} is absent`);
  return asset;
}
