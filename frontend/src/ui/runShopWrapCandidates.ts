// Review-only manifest of generated shop wrap-art candidates mounted by
// RunShopArtReview. Review mounting does not promote a candidate; an accepted
// candidate moves to the live-media pipeline with provenance.

export interface RunShopWrapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RunShopWrapCandidate {
  id: string;
  label: string;
  engine: 'pixellab' | 'codex';
  /** seat = wraps each displayed card; band = wraps the whole card row. */
  kind: 'seat' | 'band';
  src: string;
  canvas: { w: number; h: number };
  /** Where the live card (seat) or card row (band) sits inside the canvas, in pixels. */
  window: RunShopWrapRect;
}

/** Fraction of the window tucked under the live card so ragged paint edges never peek out. */
export const RUN_SHOP_WRAP_BLEED = 0.01;

/** The card width the shop grid tops out at; wrap tracks scale from it. */
const CARD_MAX_WIDTH = 236;

function bledWindow({ window: raw }: RunShopWrapCandidate): RunShopWrapRect {
  return {
    x: raw.x + RUN_SHOP_WRAP_BLEED * raw.w,
    y: raw.y + RUN_SHOP_WRAP_BLEED * raw.h,
    w: raw.w * (1 - 2 * RUN_SHOP_WRAP_BLEED),
    h: raw.h * (1 - 2 * RUN_SHOP_WRAP_BLEED),
  };
}

/**
 * Band mounting: the art hangs around the card grid via negative insets,
 * percentages of the grid box per CSS absolute-offset rules.
 */
export function runShopWrapInsets(candidate: RunShopWrapCandidate): Record<string, string> {
  const { canvas } = candidate;
  const win = bledWindow(candidate);
  const percent = (value: number): string => `${(-value * 100).toFixed(3)}%`;
  return {
    '--wrap-left': percent(win.x / win.w),
    '--wrap-right': percent((canvas.w - win.x - win.w) / win.w),
    '--wrap-top': percent(win.y / win.h),
    '--wrap-bottom': percent((canvas.h - win.y - win.h) / win.h),
  };
}

/**
 * Seat mounting: the seat is a padded box sized to the whole canvas so grid
 * cells reserve the overhang; the card fills the content box. Padding
 * percentages all resolve against the element's inline size, so every side is
 * normalized by the canvas width.
 */
export function runShopWrapSeatPadding(candidate: RunShopWrapCandidate): Record<string, string> {
  const { canvas } = candidate;
  const win = bledWindow(candidate);
  const percent = (value: number): string => `${(value * 100).toFixed(3)}%`;
  return {
    '--wrap-pad-left': percent(win.x / canvas.w),
    '--wrap-pad-right': percent((canvas.w - win.x - win.w) / canvas.w),
    '--wrap-pad-top': percent(win.y / canvas.w),
    '--wrap-pad-bottom': percent((canvas.h - win.y - win.h) / canvas.w),
  };
}

/** Grid track width that shows the seat's full canvas when the card is at its widest. */
export function runShopWrapSeatTrack(candidate: RunShopWrapCandidate): string {
  const win = bledWindow(candidate);
  return `${(CARD_MAX_WIDTH * (candidate.canvas.w / win.w)).toFixed(1)}px`;
}

export const RUN_SHOP_WRAP_CANDIDATES: readonly RunShopWrapCandidate[] = [
  {
    id: 'pixellab-alcove',
    label: 'Alcove niche',
    engine: 'pixellab',
    kind: 'seat',
    src: new URL('../art/run-shop-wrap/pixellab-alcove.png', import.meta.url).href,
    canvas: { w: 349, h: 454 },
    window: { x: 74, y: 83, w: 206, h: 294 },
  },
  {
    id: 'pixellab-awning',
    label: 'Awning stall',
    engine: 'pixellab',
    kind: 'seat',
    src: new URL('../art/run-shop-wrap/pixellab-awning.png', import.meta.url).href,
    canvas: { w: 404, h: 524 },
    window: { x: 42, y: 48, w: 320, h: 448 },
  },
];
