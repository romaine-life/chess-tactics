import { drawableAssets } from '@chess-tactics/board-render';

export interface SliderAsset {
  name: string; label: string; approach: string; material: string; description: string;
  fill: string; channel: string; edge: string; handle: string; handleLight: string; handleDark: string; preferred?: boolean;
}
const current = (): SliderAsset[] => drawableAssets('ui-slider').map((asset) => ({
  name: String(asset.behavior.value ?? asset.id), label: asset.label,
  approach: String(asset.behavior.approach ?? ''), material: String(asset.behavior.material ?? ''),
  description: String(asset.metadata.description ?? ''), fill: String(asset.behavior.fill ?? ''), channel: String(asset.behavior.channel ?? ''),
  edge: String(asset.behavior.edge ?? ''), handle: String(asset.behavior.handle ?? ''), handleLight: String(asset.behavior.handleLight ?? ''),
  handleDark: String(asset.behavior.handleDark ?? ''), preferred: asset.behavior.preferred === true,
}));
export const SLIDER_ASSETS: SliderAsset[] = new Proxy([] as SliderAsset[], {
  get(_target, property) { const values = current(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; },
});
