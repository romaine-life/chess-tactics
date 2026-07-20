import { drawableAssets, requiredDrawableDefault } from '@chess-tactics/board-render';

export interface SurfaceAsset {
  name: string;
  label: string;
  approach: string;
  material: string;
  file: string;
  tilePx: number;
}

const current = (): SurfaceAsset[] => drawableAssets('ui-surface').map((asset) => {
  const { value, approach, material, tilePx } = asset.behavior;
  const media = asset.media.surface?.media;
  if (typeof value !== 'string' || !value || typeof approach !== 'string' || !approach
    || typeof material !== 'string' || !material || !Number.isSafeInteger(tilePx) || Number(tilePx) < 1 || !media) {
    throw new Error(`UI surface ${asset.id} is incomplete`);
  }
  return { name: value, label: asset.label, approach, material, file: media.immutableUrl, tilePx: Number(tilePx) };
});

export const SURFACE_ASSETS: SurfaceAsset[] = new Proxy([] as SurfaceAsset[], {
  get(_target, property) { const values = current(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; },
});

export function defaultSurfaceAsset(): SurfaceAsset {
  const record = requiredDrawableDefault('ui-surface');
  const value = record.behavior.value;
  const projected = typeof value === 'string' ? current().find((asset) => asset.name === value) : undefined;
  if (!projected) throw new Error(`UI surface default ${record.id} is unavailable`);
  return projected;
}
