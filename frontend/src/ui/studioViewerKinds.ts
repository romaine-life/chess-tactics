export const STUDIO_VIEWER_KIND_LABELS = {
  asset: 'Asset',
  artwork: 'Artwork',
  sourceart: 'Source Art',
  unitart: 'Unit Art',
  unitroster: 'Unit Roster',
  portrait: 'Portrait',
  nineslice: '9-Slice',
  divider: 'Divider',
  propseat: 'Prop Seat',
  propcandidates: 'Animated Prop Artwork',
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
  cardsize: 'Card Size',
  carddivider: 'Card Gold Divider',
  // NOTE: `cardicons` was removed here. It was registered with no `viewerKind === 'cardicons'`
  // branch, so selecting it fell through the viewer chain and quietly rendered the Asset Lab —
  // a named destination showing an unrelated surface. Its `?runIconPairReview=1` alias still
  // canonicalises (see TilePreview's route reader) and now lands on the card categories rather
  // than on a name that resolves to nothing. check-studio-reachability.mjs makes a kind without
  // a render branch a build failure, so this cannot come back silently.
  cardfit: 'Card Fit',
  cardoutline: 'Card Outline',
  cardprompts: 'Card Prompts',
  loading: 'Loading Lab',
  mobilelab: 'Mobile Review',
} as const;

export type ViewerKind = keyof typeof STUDIO_VIEWER_KIND_LABELS;

export function isViewerKind(value: string | null | undefined): value is ViewerKind {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(STUDIO_VIEWER_KIND_LABELS, value);
}
