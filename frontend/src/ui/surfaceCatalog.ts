import { drawableAssets } from '@chess-tactics/board-render';

export interface SurfaceAsset {
  name: string;
  label: string;
  approach: string;
  material: string;
  file: string;
  tilePx: number;
}

const current = (): SurfaceAsset[] => drawableAssets('ui-surface').map((asset) => ({
  name: String(asset.behavior.value ?? asset.id),
  label: asset.label,
  approach: String(asset.behavior.approach ?? ''),
  material: String(asset.behavior.material ?? ''),
  file: asset.media.surface.media.immutableUrl,
  tilePx: Number(asset.behavior.tilePx),
}));

export const SURFACE_ASSETS: SurfaceAsset[] = new Proxy([] as SurfaceAsset[], {
  get(_target, property) { const values = current(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; },
});
