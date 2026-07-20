import {
  currentDrawableCatalog,
  type DrawableAsset,
  type DrawableCatalog,
  type LiveMediaCatalog,
  type LiveMediaSlot,
} from '@chess-tactics/board-render';

export type StudioProductionStatus = 'accepted' | 'legacy-bridge' | 'mixed';
export type StudioAssetType = 'settings' | 'game' | 'shields' | 'frames' | 'structure';

export interface StudioLiveMediaRecord {
  id: string;
  label: string;
  primary: LiveMediaSlot;
  slots: readonly LiveMediaSlot[];
  immutableUrl: string;
  width: number | null;
  height: number | null;
  productionStatus: StudioProductionStatus;
  productionEligible: boolean;
  runtime: Readonly<Record<string, unknown>>;
}

export interface StudioAssetRecord extends StudioLiveMediaRecord {
  type: StudioAssetType;
  kind: 'glyph' | 'frame' | 'structure';
  name: string;
  front?: LiveMediaSlot;
  back?: LiveMediaSlot;
  structureId?: string;
}

export interface StudioAssetLibrary { revision: number; items: StudioAssetRecord[] }

export interface StudioArtworkRecord extends StudioLiveMediaRecord { groupId: string; sub: string }
export interface StudioArtworkGroup { id: string; label: string; items: StudioArtworkRecord[] }
export interface StudioArtworkLibrary { revision: number; groups: StudioArtworkGroup[]; items: StudioArtworkRecord[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringField(source: Record<string, unknown>, field: string): string | null {
  const value = source[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function runtimeOf(slot: LiveMediaSlot): Readonly<Record<string, unknown>> {
  const runtime = slot.versionMetadata.runtime;
  return isRecord(runtime) ? runtime : {};
}

function productionStatus(slots: readonly LiveMediaSlot[]): StudioProductionStatus {
  if (slots.every((slot) => slot.versionStatus === 'accepted' && slot.productionEligible)) return 'accepted';
  if (slots.every((slot) => slot.versionStatus === 'legacy-bridge' && !slot.productionEligible)) return 'legacy-bridge';
  return 'mixed';
}

function byLabelThenId<T extends { label: string; id: string }>(left: T, right: T): number {
  return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }) || left.id.localeCompare(right.id);
}

function liveRecord(asset: DrawableAsset, primary: LiveMediaSlot, slots: readonly LiveMediaSlot[]): StudioLiveMediaRecord {
  return {
    id: asset.id,
    label: asset.label,
    primary,
    slots,
    immutableUrl: primary.media.immutableUrl,
    width: primary.media.width,
    height: primary.media.height,
    productionStatus: productionStatus(slots),
    productionEligible: slots.every((slot) => slot.productionEligible),
    runtime: runtimeOf(primary),
  };
}

function catalogItems(drawables: DrawableCatalog): DrawableAsset[] {
  return drawables.assets.filter((asset) => asset.kind === 'studio-catalog-item');
}

function joinedSlots(asset: DrawableAsset, liveBySlot: ReadonlyMap<string, LiveMediaSlot>): Map<string, LiveMediaSlot> | null {
  const joined = new Map<string, LiveMediaSlot>();
  for (const [role, media] of Object.entries(asset.media)) {
    const slot = liveBySlot.get(media.slot);
    if (!slot || !slot.media.mediaType.startsWith('image/')) return null;
    joined.set(role, slot);
  }
  return joined;
}

/**
 * Project Studio assets from explicit database-owned catalog records. Semantic
 * media-slot strings are opaque join keys and never determine membership.
 */
export function buildStudioAssetLibrary(
  catalog: LiveMediaCatalog,
  drawables: DrawableCatalog = currentDrawableCatalog(),
): StudioAssetLibrary {
  const liveBySlot = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  const items: StudioAssetRecord[] = [];
  for (const asset of catalogItems(drawables)) {
    if (asset.behavior.library !== 'asset') continue;
    const type = stringField(asset.behavior, 'type');
    const kind = stringField(asset.behavior, 'kind');
    const name = stringField(asset.behavior, 'name');
    if (!type || !['settings', 'game', 'shields', 'frames', 'structure'].includes(type)
      || !kind || !['glyph', 'frame', 'structure'].includes(kind) || !name) continue;
    const joined = joinedSlots(asset, liveBySlot);
    const primaryRole = stringField(asset.behavior, 'primaryRole') ?? 'primary';
    const primary = joined?.get(primaryRole);
    if (!joined || !primary) continue;
    const slots = [...joined.values()];
    items.push({
      ...liveRecord(asset, primary, slots),
      type: type as StudioAssetType,
      kind: kind as StudioAssetRecord['kind'],
      name,
      front: joined.get('front'),
      back: joined.get('back'),
      structureId: stringField(asset.behavior, 'structureId') ?? undefined,
    });
  }
  items.sort(byLabelThenId);
  return { revision: catalog.revision, items };
}

/** Project the Artwork library from explicit database-owned catalog records. */
export function buildStudioArtworkLibrary(
  catalog: LiveMediaCatalog,
  drawables: DrawableCatalog = currentDrawableCatalog(),
): StudioArtworkLibrary {
  const liveBySlot = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  const groupLabels = new Map<string, string>();
  const items: StudioArtworkRecord[] = [];
  for (const asset of catalogItems(drawables)) {
    if (asset.behavior.library !== 'artwork') continue;
    const groupId = stringField(asset.behavior, 'groupId');
    const groupLabel = stringField(asset.behavior, 'groupLabel');
    const sub = stringField(asset.behavior, 'sub');
    if (!groupId || !groupLabel || !sub) continue;
    const joined = joinedSlots(asset, liveBySlot);
    const primary = joined?.get('primary');
    if (!joined || !primary) continue;
    const priorLabel = groupLabels.get(groupId);
    if (priorLabel && priorLabel !== groupLabel) continue;
    groupLabels.set(groupId, groupLabel);
    items.push({ ...liveRecord(asset, primary, [...joined.values()]), groupId, sub });
  }
  items.sort(byLabelThenId);
  const groups = [...groupLabels].map(([id, label]) => ({
    id,
    label,
    items: items.filter((item) => item.groupId === id),
  })).filter((group) => group.items.length).sort(byLabelThenId);
  return { revision: catalog.revision, groups, items: groups.flatMap((group) => group.items) };
}

export function mediaDimensions(record: Pick<StudioLiveMediaRecord, 'width' | 'height'>): string {
  return record.width && record.height ? `${record.width}×${record.height}` : '—';
}

export function studioProductionLabel(status: StudioProductionStatus): string {
  if (status === 'accepted') return 'accepted';
  if (status === 'legacy-bridge') return 'legacy bridge';
  return 'mixed pointers';
}
