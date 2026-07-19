export const STUDIO_VIEWER_KIND_LABELS = {
  asset: 'Asset',
  artwork: 'Artwork',
  unitart: 'Unit Art',
  portrait: 'Portrait',
  nineslice: '9-Slice',
  divider: 'Divider',
  propseat: 'Prop Seat',
  tilecompare: 'Tile Pipeline',
  surfacetiles: 'Tileset Surfaces',
  sceneanim: 'Scene Animation',
  animscene: 'Animated Scene',
  artworkcompare: 'Art Compare',
  glossary: 'Glossary',
  surface: 'Surface',
  scrollbar: 'Scrollbar',
  slider: 'Slider',
  page: 'Page',
  chromelab: 'Chrome Lab',
  raillab: 'Rail Lab',
  tileside: 'Subterrain',
  walldecor: 'Wall Art Sources',
  wallart: 'Wall Art',
  sfx: 'Sound Assignments',
  gamelab: 'Game Lab',
  gym: 'Training Gym',
  solver: 'Board Solver',
  loading: 'Loading Lab',
} as const;

export type ViewerKind = keyof typeof STUDIO_VIEWER_KIND_LABELS;

export const STUDIO_VIEWER_KIND_OPTIONS = (
  Object.entries(STUDIO_VIEWER_KIND_LABELS) as Array<[ViewerKind, string]>
)
  .map(([id, label]) => ({ id, label }))
  .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

export function isViewerKind(value: string | null | undefined): value is ViewerKind {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(STUDIO_VIEWER_KIND_LABELS, value);
}
