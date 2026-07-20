import { drawableAssets } from '@chess-tactics/board-render';
import type { TileFamilyId } from '../core/tileSockets';
import type { TileAsset } from './tileset';

const current = (): TileAsset[] => drawableAssets('terrain-review').map((asset) => {
  const family = asset.behavior.family;
  const preview = asset.media.preview?.media.immutableUrl;
  if (typeof family !== 'string' || !preview) throw new Error(`terrain review ${asset.id} is incomplete`);
  return {
    id: asset.id,
    label: asset.label,
    src: preview,
    role: asset.behavior.role === 'base' ? 'base' : 'non-production',
    kind: 'tile',
    source: 'live:drawable',
    method: typeof asset.metadata.method === 'string' ? asset.metadata.method : '',
    probability: 0,
    speculative: true,
    notes: typeof asset.metadata.status === 'string' ? asset.metadata.status : '',
    terrains: [family as TileFamilyId],
  };
});

export const nonProductionTileAssets: readonly TileAsset[] = new Proxy([] as TileAsset[], {
  get: (_target, property) => {
    const values = current();
    const value = Reflect.get(values, property);
    return typeof value === 'function' ? value.bind(values) : value;
  },
});

export const nonProductionTileFamilyOf = new Proxy(new Map<string, TileFamilyId>(), {
  get: (_target, property) => {
    const values = new Map(current().map((asset) => [asset.id, asset.terrains?.[0] as TileFamilyId]));
    const value = Reflect.get(values, property);
    return typeof value === 'function' ? value.bind(values) : value;
  },
});
