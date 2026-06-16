// Asset frame/inset styling, ported from app.js (frameStyleForAsset, insetStyle,
// renderModeButton geometry). These turn a sprite-sheet rect into the CSS custom
// properties the existing style.css uses (.catalog-frame, .mode-button-9slice,
// .mode-button-icon) so the rendered output matches the legacy DOM exactly.
//
// The DB-backed catalog stores per-asset geometry under entry.slots
// ({sheet, states, rules, rect}) and descriptive fields under entry.metadata
// ({type, title, summary, source}); this module adapts an AssetCatalogEntry into
// the legacy asset shape and computes the frame styles.

import type { CSSProperties } from 'react';
import type { AssetCatalogEntry } from '../../render/assetCatalog';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AssetState {
  label?: string;
  rect: Rect;
}

export interface AssetSheet {
  image?: string;
  width?: number;
  height?: number;
}

export interface AssetRules {
  textInset?: Rect;
  iconSlot?: Rect;
  arrowSlot?: Rect;
  hitbox?: Rect;
  states?: string[];
  text?: string;
  sizing?: string;
  fitsSlot?: string;
  background?: string;
  notes?: string[];
}

export interface AssetSource {
  kind?: string;
  image?: string;
  reference?: string;
  note?: string;
}

/** The legacy asset shape app.js's renderers consumed, recovered from an entry. */
export interface CatalogAsset {
  id: string;
  type: string;
  status: string;
  title: string;
  summary: string;
  source: AssetSource;
  sheet: AssetSheet;
  states: Record<string, AssetState>;
  rules: AssetRules;
  rect: Rect | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asRect(value: unknown): Rect | null {
  if (!isRecord(value)) return null;
  const { x, y, w, h } = value;
  if (typeof x === 'number' && typeof y === 'number' && typeof w === 'number' && typeof h === 'number') {
    return { x, y, w, h };
  }
  return null;
}

function asRules(value: unknown): AssetRules {
  if (!isRecord(value)) return {};
  const out: AssetRules = {};
  if (asRect(value.textInset)) out.textInset = asRect(value.textInset)!;
  if (asRect(value.iconSlot)) out.iconSlot = asRect(value.iconSlot)!;
  if (asRect(value.arrowSlot)) out.arrowSlot = asRect(value.arrowSlot)!;
  if (asRect(value.hitbox)) out.hitbox = asRect(value.hitbox)!;
  if (Array.isArray(value.states)) out.states = value.states.filter((s): s is string => typeof s === 'string');
  if (Array.isArray(value.notes)) out.notes = value.notes.filter((n): n is string => typeof n === 'string');
  if (typeof value.text === 'string') out.text = value.text;
  if (typeof value.sizing === 'string') out.sizing = value.sizing;
  if (typeof value.fitsSlot === 'string') out.fitsSlot = value.fitsSlot;
  if (typeof value.background === 'string') out.background = value.background;
  return out;
}

function asStates(value: unknown): Record<string, AssetState> {
  if (!isRecord(value)) return {};
  const out: Record<string, AssetState> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const rect = asRect(raw.rect);
    if (!rect) continue;
    out[key] = { label: asString(raw.label) || undefined, rect };
  }
  return out;
}

/**
 * Recover the legacy CatalogAsset shape from a DB-backed entry. The entry's
 * image URL streams the sprite sheet, so we always prefer it for the frame
 * background. Returns null if the entry lacks the geometry a card needs.
 */
export function entryToAsset(entry: AssetCatalogEntry): CatalogAsset {
  const slots = entry.slots || {};
  const meta = entry.metadata || {};
  const sheetRaw = isRecord(slots.sheet) ? slots.sheet : {};
  return {
    id: entry.id,
    type: asString(meta.type, entry.id),
    status: entry.status || asString(meta.status, 'draft'),
    title: asString(meta.title, entry.id),
    summary: asString(meta.summary),
    source: isRecord(meta.source) ? (meta.source as AssetSource) : {},
    // The image bytes always stream from the entry's image URL; sheet width/height
    // come from the stored geometry so background scaling stays exact.
    sheet: {
      image: entry.image,
      width: typeof sheetRaw.width === 'number' ? sheetRaw.width : undefined,
      height: typeof sheetRaw.height === 'number' ? sheetRaw.height : undefined,
    },
    states: asStates(slots.states),
    rules: asRules(slots.rules),
    rect: asRect(slots.rect),
  };
}

/**
 * The CSS custom properties for a sprite-sheet crop, matching app.js
 * frameStyleForAsset. Falls back to a whole-image crop if sheet dims are absent.
 */
export function frameStyleForAsset(asset: CatalogAsset, frame: Rect): CSSProperties {
  const sheet = asset.sheet || {};
  const sheetWidth = sheet.width || frame.w;
  const sheetHeight = sheet.height || frame.h;
  const scaleX = (sheetWidth / frame.w) * 100;
  const scaleY = (sheetHeight / frame.h) * 100;
  const maxX = Math.max(1, sheetWidth - frame.w);
  const maxY = Math.max(1, sheetHeight - frame.h);
  const posX = maxX === 1 ? 0 : (frame.x / maxX) * 100;
  const posY = maxY === 1 ? 0 : (frame.y / maxY) * 100;
  const imageUrl = String(sheet.image || '').replace(/["'\\\n\r]/g, '');
  return {
    '--asset-image': `url(${imageUrl})`,
    '--asset-bg-x': `${posX.toFixed(4)}%`,
    '--asset-bg-y': `${posY.toFixed(4)}%`,
    '--asset-bg-w': `${scaleX.toFixed(4)}%`,
    '--asset-bg-h': `${scaleY.toFixed(4)}%`,
    '--asset-aspect': `${frame.w} / ${frame.h}`,
  } as CSSProperties;
}

/** Inset (slot) positioning as a fraction of the frame, matching insetStyle. */
export function insetStyle(inset: Rect | undefined, frame: Rect): CSSProperties {
  if (!inset) return {};
  const frameWidth = (frame && frame.w) || 1;
  const frameHeight = (frame && frame.h) || 1;
  return {
    left: `${((inset.x / frameWidth) * 100).toFixed(3)}%`,
    top: `${((inset.y / frameHeight) * 100).toFixed(3)}%`,
    width: `${((inset.w / frameWidth) * 100).toFixed(3)}%`,
    height: `${((inset.h / frameHeight) * 100).toFixed(3)}%`,
  };
}
