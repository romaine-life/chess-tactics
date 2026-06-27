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

export const SCROLLBAR_ASSETS: ScrollbarAsset[] = [
  { name: 'oak-pixellab', label: 'Oak · PixelLab', approach: 'pixellab', material: 'wood-oak', file: '/assets/ui/scrollbars/oak-pixellab.png', preferred: true },
  { name: 'oak-forge', label: 'Oak · Forge', approach: 'forge', material: 'wood-oak', file: '/assets/ui/scrollbars/oak-forge.png' },
  { name: 'oak-pixelated', label: 'Oak · Pixelated', approach: 'pixelated', material: 'wood-oak', file: '/assets/ui/scrollbars/oak-pixelated.png' },
  { name: 'oak-raw', label: 'Oak · Raw', approach: 'raw', material: 'wood-oak', file: '/assets/ui/scrollbars/oak-raw.png' },
];
