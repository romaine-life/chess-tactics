import { drawableAssets } from '@chess-tactics/board-render';

export interface ScrollbarAsset {
  name: string;
  label: string;
  slot: string;
  file: string;
  kind: 'sprite' | 'texture';
  width: number;
  height: number;
}

/** Project the scrollbar browser entirely from installed drawable rows. */
export function liveScrollbarAssets(): ScrollbarAsset[] {
  return drawableAssets('ui-scrollbar').map((asset) => {
    const previewKind = asset.behavior.previewKind;
    const binding = asset.media.preview;
    if ((previewKind !== 'sprite' && previewKind !== 'texture') || !binding?.media.width || !binding.media.height) {
      throw new Error(`UI scrollbar ${asset.id} is incomplete`);
    }
    return {
      name: asset.id,
      label: asset.label,
      slot: binding.slot,
      file: binding.media.immutableUrl,
      kind: previewKind,
      width: binding.media.width,
      height: binding.media.height,
    };
  });
}
