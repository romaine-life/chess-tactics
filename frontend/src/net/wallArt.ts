import {
  applyDrawableCatalog,
  applyWallArtCatalog,
  currentWallArt,
  type WallArtMap,
} from '@chess-tactics/board-render';
import { fetchDrawableCatalog } from './drawableCatalog';
import {
  fetchAdminDrawableCatalog,
  saveDrawableAssetBatch,
  type AdminDrawableAsset,
  type SaveDrawableAssetInput,
} from './drawableCatalogAdmin';

const wallArtBehavior = (entry: WallArtMap[string]): Record<string, unknown> => ({
  span: entry.span ?? 1,
  slots: entry.slots,
  ...(entry.reflection ? { reflection: entry.reflection } : {}),
});

const installedWallArt = (assets: AdminDrawableAsset[]): AdminDrawableAsset[] =>
  assets.filter((asset) => asset.kind === 'wall-art' && asset.lifecycleState === 'active');

/** Save the Wall Art instrument through the canonical drawable catalog.
 * Removed records are retired; no whole-document overlay or Git baseline exists. */
export async function saveLiveWallArt(
  next: WallArtMap,
  previous: WallArtMap = currentWallArt(),
): Promise<{ revision: number }> {
  const admin = await fetchAdminDrawableCatalog();
  const existing = new Map(admin.assets.map((asset) => [asset.id, asset]));
  const active = installedWallArt(admin.assets);
  const changes: SaveDrawableAssetInput[] = [];

  for (const [sortOrder, id] of Object.keys(next).sort().entries()) {
    const entry = next[id];
    const current = existing.get(id);
    const unchanged = current?.lifecycleState === 'active'
      && current.kind === 'wall-art'
      && current.label === entry.label
      && JSON.stringify(current.behavior) === JSON.stringify(wallArtBehavior(entry));
    if (unchanged && JSON.stringify(previous[id]) === JSON.stringify(entry)) continue;
    changes.push({
      id,
      kind: 'wall-art',
      label: entry.label,
      sortOrder: current?.sortOrder ?? sortOrder,
      lifecycleState: 'active',
      behavior: wallArtBehavior(entry),
      metadata: current?.metadata ?? {},
      media: {},
      expectedRevision: current?.rowRevision ?? 0,
    });
  }

  for (const current of active) {
    if (Object.hasOwn(next, current.id)) continue;
    changes.push({
      id: current.id,
      kind: current.kind,
      label: current.label,
      sortOrder: current.sortOrder,
      lifecycleState: 'retired',
      behavior: current.behavior,
      metadata: current.metadata,
      media: Object.fromEntries(Object.entries(current.media).map(([role, value]) => [role, value.slot])),
      expectedRevision: current.rowRevision,
    });
  }

  const revision = changes.length
    ? (await saveDrawableAssetBatch(changes)).catalogRevision
    : admin.revision;
  applyDrawableCatalog(await fetchDrawableCatalog());
  applyWallArtCatalog();
  return { revision };
}
