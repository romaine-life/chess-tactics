// Review-only shop wrap-art candidates mounted by RunShopArtReview. The bytes
// and the measured geometry both live in live media (ADR-0085) — candidate
// pixels are never committed — so this module reads them back off the admin
// catalog. Review mounting does not promote a candidate.
import { liveMediaSlotsWithPrefix } from '@chess-tactics/board-render';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';

export const RUN_SHOP_WRAP_SCHEMA = 'run-shop-wrap-candidate-v1';
export const RUN_SHOP_WRAP_SLOT_PREFIX = 'review/run-shop-wrap/';
/** Runtime home for an installed wrap; the live Shop reads this prefix. */
export const RUN_SHOP_WRAP_RUNTIME_PREFIX = 'ui/run/shop-wrap/';
export const RUN_SHOP_WRAP_RUNTIME_SCHEMA = 'run-shop-wrap-runtime-v1';

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
  /**
   * seat = wraps each displayed card; band = wraps the whole card row;
   * slots = one structure with a painted opening per card.
   */
  kind: 'seat' | 'band' | 'slots';
  src: string;
  canvas: { w: number; h: number };
  /** Where the live card (seat) or card row (band) sits inside the canvas, in pixels. */
  window: RunShopWrapRect;
  /** Band review row: how many cards, at what width, sit inside the window. */
  bandCards?: number;
  bandCardWidth?: number;
  /** slots kind: one measured opening per card, left to right. */
  slots?: readonly RunShopWrapRect[];
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

export interface RunShopWrapBandMount {
  shell: { width: number; height: number; margin: string };
  art: { left: number; top: number; width: number; height: number };
  grid: { columns: string; gap: number };
  cardWidth: number;
  cards: number;
}

// (Band mounting is pixel-exact; there is deliberately no percentage-inset path.)

/** Share of vertical overflow that rides up over the awning; the rest lands on the counter. */
const BAND_OVERFLOW_TOP_SHARE = 0.25;
const BAND_GAP = 16;

/**
 * Band mounting: width-fit the card row to the window, split any vertical
 * overflow between the top and bottom structure, and reserve layout space for
 * the full art overhang via margins. All in px for exactness.
 */
export function runShopWrapBandMount(candidate: RunShopWrapCandidate): RunShopWrapBandMount {
  const { canvas } = candidate;
  const win = bledWindow(candidate);
  const cards = candidate.bandCards ?? 3;
  const cardWidth = candidate.bandCardWidth ?? 236;
  const gridW = cards * cardWidth + (cards - 1) * BAND_GAP;
  const gridH = (cardWidth * 7) / 5;
  const s = gridW / win.w;
  const overflow = Math.max(0, gridH - win.h * s);
  const topOverhang = Math.max(0, win.y * s - overflow * BAND_OVERFLOW_TOP_SHARE);
  const bottomOverhang = Math.max(0, (canvas.h - win.y - win.h) * s - overflow * (1 - BAND_OVERFLOW_TOP_SHARE));
  const sideOverhang = win.x * s;
  return {
    shell: {
      width: gridW,
      height: gridH,
      margin: `${topOverhang.toFixed(1)}px auto ${bottomOverhang.toFixed(1)}px`,
    },
    art: {
      left: -sideOverhang,
      top: -topOverhang,
      width: canvas.w * s,
      height: canvas.h * s,
    },
    grid: { columns: `repeat(${cards}, ${cardWidth}px)`, gap: BAND_GAP },
    cardWidth,
    cards,
  };
}

export interface RunShopWrapLiveMount {
  frame: { width: number; height: number };
  cards: { left: number; top: number; width: number; gap: number };
  cardWidth: number;
}

/**
 * Live Shop mounting for a band wrap. The stall is laid out at a chosen
 * on-screen width and the card row is *contained* inside its measured window,
 * so a 3-card shop and a 4-card quartermaster shop both seat cleanly instead of
 * overflowing the awning.
 */
export function runShopWrapLiveMount(
  candidate: RunShopWrapCandidate,
  cardCount: number,
  frameWidth: number,
): RunShopWrapLiveMount {
  const win = bledWindow(candidate);
  const s = frameWidth / candidate.canvas.w;
  const windowWidth = win.w * s;
  const windowHeight = win.h * s;
  const gap = BAND_GAP;
  const widthLimited = (windowWidth - (cardCount - 1) * gap) / cardCount;
  const heightLimited = (windowHeight * 5) / 7;
  const cardWidth = Math.max(0, Math.min(widthLimited, heightLimited));
  const rowWidth = cardCount * cardWidth + (cardCount - 1) * gap;
  return {
    frame: { width: frameWidth, height: candidate.canvas.h * s },
    cards: {
      left: win.x * s + (windowWidth - rowWidth) / 2,
      top: win.y * s + (windowHeight - (cardWidth * 7) / 5) / 2,
      width: rowWidth,
      gap,
    },
    cardWidth,
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

export interface RunShopWrapSlotMount {
  frame: { width: number; height: number };
  cards: readonly { left: number; top: number; width: number; height: number }[];
}

/**
 * Slots mounting: scale the whole painted structure so each opening reaches the
 * target card width, then seat one card in each measured opening.
 */
export function runShopWrapSlotMount(
  candidate: RunShopWrapCandidate,
  targetCardWidth = 145,
): RunShopWrapSlotMount {
  const slots = candidate.slots ?? [];
  if (!slots.length) throw new Error(`wrap candidate ${candidate.id} has no measured slots`);
  const averageSlotWidth = slots.reduce((total, slot) => total + slot.w, 0) / slots.length;
  const s = targetCardWidth / averageSlotWidth;
  const bleed = RUN_SHOP_WRAP_BLEED;
  return {
    frame: { width: candidate.canvas.w * s, height: candidate.canvas.h * s },
    cards: slots.map((slot) => ({
      left: (slot.x + bleed * slot.w) * s,
      top: (slot.y + bleed * slot.h) * s,
      width: slot.w * (1 - 2 * bleed) * s,
      height: slot.h * (1 - 2 * bleed) * s,
    })),
  };
}

const KINDS: readonly RunShopWrapCandidate['kind'][] = ['seat', 'band', 'slots'];
const ENGINES: readonly RunShopWrapCandidate['engine'][] = ['pixellab', 'codex'];

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function rect(value: unknown): RunShopWrapRect | null {
  const raw = object(value);
  if (!raw) return null;
  const { x, y, w, h } = raw;
  return [x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n)) && (w as number) > 0 && (h as number) > 0
    ? { x: x as number, y: y as number, w: w as number, h: h as number }
    : null;
}

function candidateFrom(version: AdminLiveMediaVersion): RunShopWrapCandidate | null {
  if (!version.slot?.startsWith(RUN_SHOP_WRAP_SLOT_PREFIX) || !version.media) return null;
  const metadata = object(version.metadata);
  if (metadata?.schema !== RUN_SHOP_WRAP_SCHEMA) return null;
  const canvas = rect({ x: 0, y: 0, ...object(metadata.canvas) });
  const window = rect(metadata.window);
  const id = typeof metadata.id === 'string' ? metadata.id : null;
  const label = typeof metadata.label === 'string' ? metadata.label : null;
  const kind = KINDS.find((value) => value === metadata.kind);
  const engine = ENGINES.find((value) => value === metadata.engine);
  if (!id || !label || !kind || !engine || !canvas || !window) return null;
  const slots = Array.isArray(metadata.slots)
    ? metadata.slots.map(rect).filter((value): value is RunShopWrapRect => value !== null)
    : [];
  if (kind === 'slots' && !slots.length) return null;
  return {
    id,
    label,
    engine,
    kind,
    src: version.media.url,
    canvas: { w: canvas.w, h: canvas.h },
    window,
    ...(typeof metadata.bandCards === 'number' ? { bandCards: metadata.bandCards } : {}),
    ...(typeof metadata.bandCardWidth === 'number' ? { bandCardWidth: metadata.bandCardWidth } : {}),
    ...(slots.length ? { slots } : {}),
  };
}

/**
 * Runtime wrap candidates awaiting the owner's install decision, read off the
 * same admin catalog. Typed runtime metadata is the geometry authority, so the
 * live Shop and this review surface measure the identical window.
 */
export function runShopWrapRuntimeCandidate(
  catalog: AdminLiveMediaCatalog,
): { candidate: RunShopWrapCandidate; version: AdminLiveMediaVersion } | null {
  // A candidate older than its slot's active version is superseded: offering it
  // would only produce a compare-and-swap conflict, so never surface it.
  const activeCreatedAt = new Map(catalog.slots.flatMap((slot) => {
    const active = catalog.versions.find((version) => version.id === slot.activeVersionId);
    return active ? [[slot.slot, active.createdAt] as const] : [];
  }));
  const pending = [...catalog.versions]
    .filter((version) => (
      version.slot?.startsWith(RUN_SHOP_WRAP_RUNTIME_PREFIX)
      && version.status === 'candidate'
      && version.createdAt > (activeCreatedAt.get(version.slot) ?? '')
    ))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!pending?.media) return null;
  const metadata = object(pending.metadata);
  const runtime = object(metadata?.runtime);
  const window = rect(runtime?.window);
  const kind = KINDS.find((value) => value === runtime?.kind);
  const canvasWidth = runtime?.canvasWidth;
  const canvasHeight = runtime?.canvasHeight;
  const variant = typeof runtime?.variant === 'string' ? runtime.variant : null;
  if (!window || !kind || !variant || typeof canvasWidth !== 'number' || typeof canvasHeight !== 'number') return null;
  return {
    version: pending,
    candidate: {
      id: variant,
      label: typeof pending.label === 'string' ? pending.label : variant,
      engine: 'codex',
      kind,
      src: pending.media.url,
      canvas: { w: canvasWidth, h: canvasHeight },
      window,
    },
  };
}

/**
 * The installed wrap the live Shop should render, or null when none is active.
 * Geometry comes from the accepted slot's typed runtime metadata, which the
 * backend validated against the uploaded raster at acceptance time.
 */
export function installedRunShopWrap(): RunShopWrapCandidate | null {
  let slots;
  try {
    slots = liveMediaSlotsWithPrefix(RUN_SHOP_WRAP_RUNTIME_PREFIX);
  } catch {
    return null;
  }
  for (const slot of slots) {
    const runtime = object(slot.versionMetadata?.runtime) ?? object(slot.metadata?.runtime);
    const window = rect(runtime?.window);
    const kind = KINDS.find((value) => value === runtime?.kind);
    const variant = typeof runtime?.variant === 'string' ? runtime.variant : null;
    const canvasWidth = runtime?.canvasWidth;
    const canvasHeight = runtime?.canvasHeight;
    if (!window || !kind || !variant || typeof canvasWidth !== 'number' || typeof canvasHeight !== 'number') continue;
    return {
      id: variant,
      label: variant,
      engine: 'codex',
      kind,
      src: slot.media.immutableUrl,
      canvas: { w: canvasWidth, h: canvasHeight },
      window,
    };
  }
  return null;
}

/** Latest wrap candidate per review slot, ordered seat → band → slots for review. */
export function runShopWrapCandidates(catalog: AdminLiveMediaCatalog): readonly RunShopWrapCandidate[] {
  const latestBySlot = new Map<string, RunShopWrapCandidate>();
  [...catalog.versions]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .forEach((version) => {
      const candidate = candidateFrom(version);
      if (candidate && version.slot) latestBySlot.set(version.slot, candidate);
    });
  return [...latestBySlot.values()].sort((left, right) => (
    KINDS.indexOf(left.kind) - KINDS.indexOf(right.kind) || left.id.localeCompare(right.id)
  ));
}
