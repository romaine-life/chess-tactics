import { drawableAssets } from '@chess-tactics/board-render';

export interface SliderAsset {
  name: string; label: string; approach: string; material: string; description: string;
  fill: string; channel: string; edge: string; handle: string; handleLight: string; handleDark: string; preferred?: boolean;
}
const current = (): SliderAsset[] => drawableAssets('ui-slider').map((asset) => {
  const fields = ['value', 'approach', 'material', 'fill', 'channel', 'edge', 'handle', 'handleLight', 'handleDark'] as const;
  if (fields.some((field) => typeof asset.behavior[field] !== 'string' || !asset.behavior[field])
    || typeof asset.behavior.preferred !== 'boolean' || typeof asset.metadata.description !== 'string') {
    throw new Error(`UI slider ${asset.id} is incomplete`);
  }
  return {
    name: asset.behavior.value as string, label: asset.label,
    approach: asset.behavior.approach as string, material: asset.behavior.material as string,
    description: asset.metadata.description, fill: asset.behavior.fill as string, channel: asset.behavior.channel as string,
    edge: asset.behavior.edge as string, handle: asset.behavior.handle as string, handleLight: asset.behavior.handleLight as string,
    handleDark: asset.behavior.handleDark as string, preferred: asset.behavior.preferred,
  };
});
export const SLIDER_ASSETS: SliderAsset[] = new Proxy([] as SliderAsset[], {
  get(_target, property) { const values = current(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; },
});
export function defaultSliderAsset(): SliderAsset {
  const matches = current().filter((asset) => asset.preferred === true);
  if (matches.length !== 1) throw new Error(`UI slider catalog expected one preferred row, found ${matches.length}`);
  return matches[0];
}
