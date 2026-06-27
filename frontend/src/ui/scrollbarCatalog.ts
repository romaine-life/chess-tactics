// Scrollbar-grip candidates — a carved wooden element generated several ways. These are SPRITE
// assets (a single element, not a tileable surface), so they live in their own catalog section
// rather than under Surfaces. One entry is the preferred default. Adding one = one entry here.

export interface ScrollbarAsset {
  name: string;
  label: string;
  approach: 'raw' | 'pixelated' | 'forge' | 'pixellab';
  material: string;
  file: string; // served path under public/
  preferred?: boolean; // the chosen default among the options
}

// PixelLab + Forge are actual carved grips. The 'pixelated' and 'raw' bake-off entries were raw
// oak MATERIAL, not scrollbar shapes — pulled from the catalog (the PNGs stay on disk as material
// refs). Add a grip = one entry here.
export const SCROLLBAR_ASSETS: ScrollbarAsset[] = [
  { name: 'oak-pixellab', label: 'Oak · PixelLab', approach: 'pixellab', material: 'wood-oak', file: '/assets/ui/scrollbars/oak-pixellab.png', preferred: true },
  { name: 'oak-forge', label: 'Oak · Forge', approach: 'forge', material: 'wood-oak', file: '/assets/ui/scrollbars/oak-forge.png' },
];
