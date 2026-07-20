import { drawableAssets, requiredDrawableDefault } from '@chess-tactics/board-render';

export interface TileSideItem {
  id: string;
  label: string;
  src: string;
  role: string;
}

const currentItems = (): TileSideItem[] => drawableAssets('subterrain').map((asset) => ({
  id: asset.id,
  label: asset.label,
  src: asset.media.surface.media.immutableUrl,
  role: 'subterrain',
}));

export const TILE_SIDE_ITEMS: TileSideItem[] = new Proxy([] as TileSideItem[], {
  get: (_target, property) => {
    const current = currentItems();
    const value = Reflect.get(current, property);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});

export const tileSideItemById = (id: string | undefined): TileSideItem | undefined =>
  TILE_SIDE_ITEMS.find((item) => item.id === id);

export const defaultTileSideItem = (): TileSideItem => {
  const id = requiredDrawableDefault('subterrain').id;
  const item = tileSideItemById(id);
  if (!item) throw new Error(`Subterrain default ${id} is unavailable`);
  return item;
};
