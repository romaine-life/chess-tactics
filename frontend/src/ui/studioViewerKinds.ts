export const STUDIO_VIEWER_KIND_LABELS = {
  asset: 'Asset',
  artwork: 'Artwork',
  sourceart: 'Source Art',
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
  wallcandidates: 'Wall Candidates',
  sfx: 'Sound Effects',
  gamelab: 'Game Lab',
  deployment: 'Deployment Lab',
  gym: 'Training Gym',
  solver: 'Board Solver',
  screenart: 'Screen Art',
  lipsanonmat: 'Lipsanon Mat',
  cardlayout: 'Card Layout',
  cardicons: 'Card Icon Fitting',
  cardprompts: 'Card Prompts',
  loading: 'Loading Lab',
} as const;

export type ViewerKind = keyof typeof STUDIO_VIEWER_KIND_LABELS;

export function isViewerKind(value: string | null | undefined): value is ViewerKind {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(STUDIO_VIEWER_KIND_LABELS, value);
}
