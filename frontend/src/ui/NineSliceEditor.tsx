// 9-slice editor — the dev's calibration bench (ADR-0054). Control shape:
//
//   LAYER tabs (gold | cool) — the two disjoint pixel layers of the corner atom
//     (warm gold decoration vs cool frame), each with its own scale knob.
//   3×3 SPATIAL SELECTOR — click the part of the frame you mean: a corner cell
//     (2-axis screen-direction d-pad), a side cell (1-axis d-pad along the side's
//     normal; cool sides move corner-pair and/or pipe per the member toggles,
//     both on = the rigid seam-safe side move), or center (whole-layer symmetric
//     out/in steppers). All multi-member moves are ATOMIC: one shared clamped
//     delta — everything moves or nothing does, so a side can never shear apart.
//   HAND-OFF BOXES — content (where text starts) and fill (where a backing
//     surface stops): human-calibrated values that code consumes, never baked.
//
// State is per-element absolutes matching the kit's canonical config exactly
// (brackets/coolCorners per corner, pipes one number per side), inward-positive,
// so mirror symmetry = literally equal values (the asymmetry chip watches this).
// Edge handedness: right = rot90(scaled edge), left = flipH(right), bottom =
// flipV(top) — every mirror/rotation AFTER scaling, identical to the Node bake.
//
// In dev, Save writes config/nine-slice/<asset>.json and regenerates the asset
// (via the Vite dev endpoint). Routing follows repo convention (lazy in App.tsx).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import nineSliceRegistry from '../../config/nine-slice-registry.json';
import { SURFACE_ASSETS } from './surfaceCatalog';

type Off = { dx: number; dy: number };
type Frame = { w: number; h: number };
type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Side = 'top' | 'bottom' | 'left' | 'right';
// What's selected in the 3×3 spatial selector: a corner cell, a side cell, or the center.
type Sel = Corner | Side | 'center';
// The two disjoint pixel layers of a frame (the warm/cool split of the corner atom).
type Layer = 'gold' | 'cool';
type Corners = Record<Corner, Off>;
type Pipes = Record<Side, number>;
// Per-element ABSOLUTES (ADR-0054) — exactly the render degrees of freedom, matching
// the kit's canonical config shape. Values are inward-positive in each element's own
// corner/side space (mirrored axes negate on draw), so a mirror-symmetric frame is
// one whose stored values are literally equal. Pipes carry ONE number each: their
// normal-axis offset (a pipe tiles its full span; tangent movement is meaningless).
type EditState = { coolCorners: Corners; pipes: Pipes; frameScale: number; brackets: Corners; bracketScale: number; content: number; fill: number };

type Asset = { id: string; label: string; corner: string; edge: string; fill: string; target: string; frame: Frame; carve?: boolean; flipSides?: boolean; theme?: string };

// Derived from the SINGLE registry (shared with the Node bake + the catalog). Every
// atom-built frame appears here automatically — adding one is a registry edit, not a
// code change in three files.
// `bar` (divider) assets declare only `edge`; corner/fill are optional so the registry JSON
// (which now holds a bar) still satisfies this type. Bars are filtered out before ASSETS reads
// corner/fill, so the frame path only ever sees the full atom set.
type RegAsset = { label: string; theme?: string; kind?: string; sides?: string; atoms: { corner?: string; edge?: string; fill?: string }; frame: Frame; carve?: boolean; flipSides?: boolean; variants: { out: string }[] };
const REGISTRY = (nineSliceRegistry as { assets: Record<string, RegAsset> }).assets;
// `bar` (divider) and `junction` (tee/cross) assets are composed straight from atoms with no
// per-corner geometry, so this 3×3 corner editor can't calibrate them — their pixels are fully
// determined by construction. Excluded here (a frame needs the full corner/edge/fill triple).
const ASSETS: Asset[] = Object.entries(REGISTRY).filter(([, a]) => a.kind !== 'bar' && a.kind !== 'junction').map(([id, a]) => ({
  id,
  label: a.label,
  corner: `/assets/ui/kit/atoms/${a.atoms.corner}.png`,
  edge: `/assets/ui/kit/atoms/${a.atoms.edge}.png`,
  fill: `/assets/ui/kit/atoms/${a.atoms.fill}.png`,
  target: `/assets/ui/kit/${a.variants[0].out}`,
  frame: a.frame,
  carve: !!a.carve,
  flipSides: !!a.flipSides,
  theme: a.theme,
}));
// The family (same theme) an asset belongs to — the frames that share one shape.
function familyOf(assetId: string): Asset[] {
  const theme = ASSETS.find((a) => a.id === assetId)?.theme;
  return theme ? ASSETS.filter((a) => a.theme === theme) : [];
}

// 0 = no content inset, matching the bake's fallback (normalizeConfig in
// scripts/nine-slice-kit.mjs) so an unsaved asset previews exactly what it bakes.
const DEFAULT_CONTENT = 0;
// 0 = the fill boundary IS the footprint edge (no inset). The fill box marks where a surface
// painted behind this frame should stop — the frame's corners can bleed outside it.
const DEFAULT_FILL = 0;
const DEFAULT_BRACKET_SCALE = 1;
const DEFAULT_FRAME_SCALE = 1;
const ZERO_OFF: Off = { dx: 0, dy: 0 };
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];
const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];
// Screen→stored sign per corner: stored offsets are inward-positive, so screen
// arrows negate on each mirrored axis (x for the right column, y for the bottom row).
const CORNER_MIRROR: Record<Corner, { x: 1 | -1; y: 1 | -1 }> = {
  tl: { x: 1, y: 1 }, tr: { x: -1, y: 1 }, bl: { x: 1, y: -1 }, br: { x: -1, y: -1 },
};
// A side's one degree of freedom (its normal axis) and its screen→stored sign.
const SIDE_AXIS: Record<Side, 'dx' | 'dy'> = { top: 'dy', bottom: 'dy', left: 'dx', right: 'dx' };
const SIDE_SIGN: Record<Side, 1 | -1> = { top: 1, bottom: -1, left: 1, right: -1 };
const SIDE_CORNERS: Record<Side, [Corner, Corner]> = { top: ['tl', 'tr'], bottom: ['bl', 'br'], left: ['tl', 'bl'], right: ['tr', 'br'] };
// v5: per-element absolutes (older entries hold the retired global+residual shape).
const STORAGE_KEY = 'nine-slice-editor-v5';
const MIN_SCALE = 0.25;
const MAX_INSPECT_Z = 6;
const MAX_INSPECT_DIM = 1024;
function inspectZoomForFrame(width: number, height: number): number {
  const maxDim = Math.max(width, height, 1);
  return Math.max(1, Math.min(MAX_INSPECT_Z, Math.floor(MAX_INSPECT_DIM / maxDim)));
}
// The 3×3 spatial selector — you click the part of the frame you mean.
const SEL_CELLS: { key: Sel; glyph: string; title: string }[] = [
  { key: 'tl', glyph: '◤', title: 'top-left corner' },
  { key: 'top', glyph: '━', title: 'top side' },
  { key: 'tr', glyph: '◥', title: 'top-right corner' },
  { key: 'left', glyph: '┃', title: 'left side' },
  { key: 'center', glyph: '▣', title: 'whole layer (symmetric out/in)' },
  { key: 'right', glyph: '┃', title: 'right side' },
  { key: 'bl', glyph: '◣', title: 'bottom-left corner' },
  { key: 'bottom', glyph: '━', title: 'bottom side' },
  { key: 'br', glyph: '◢', title: 'bottom-right corner' },
];

function cloneCorners(src?: Partial<Corners>): Corners {
  return {
    tl: { ...(src?.tl ?? ZERO_OFF) },
    tr: { ...(src?.tr ?? ZERO_OFF) },
    bl: { ...(src?.bl ?? ZERO_OFF) },
    br: { ...(src?.br ?? ZERO_OFF) },
  };
}

function clonePipes(src?: Partial<Pipes>): Pipes {
  return { top: src?.top ?? 0, bottom: src?.bottom ?? 0, left: src?.left ?? 0, right: src?.right ?? 0 };
}

const DEFAULT_EDIT: EditState = {
  coolCorners: cloneCorners(),
  pipes: clonePipes(),
  frameScale: DEFAULT_FRAME_SCALE,
  brackets: cloneCorners(),
  bracketScale: DEFAULT_BRACKET_SCALE,
  content: DEFAULT_CONTENT,
  fill: DEFAULT_FILL,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizedOff(value: unknown, fallback: Off): Off {
  const raw = asRecord(value);
  return {
    dx: finiteNumber(raw.dx, fallback.dx),
    dy: finiteNumber(raw.dy, fallback.dy),
  };
}

function normalizedCorners(value: unknown, fallback: Corners): Corners {
  const raw = asRecord(value);
  return {
    tl: normalizedOff(raw.tl, fallback.tl),
    tr: normalizedOff(raw.tr, fallback.tr),
    bl: normalizedOff(raw.bl, fallback.bl),
    br: normalizedOff(raw.br, fallback.br),
  };
}

// Legacy fold (matches the kit's normalizeConfig): global offset + per-corner
// residuals sum into per-corner absolutes.
function foldedCorners(global: unknown, per: unknown): Corners {
  const g = normalizedOff(global, ZERO_OFF);
  const p = normalizedCorners(per, cloneCorners());
  return {
    tl: { dx: g.dx + p.tl.dx, dy: g.dy + p.tl.dy },
    tr: { dx: g.dx + p.tr.dx, dy: g.dy + p.tr.dy },
    bl: { dx: g.dx + p.bl.dx, dy: g.dy + p.bl.dy },
    br: { dx: g.dx + p.br.dx, dy: g.dy + p.br.dy },
  };
}

function roundedScale(value: unknown, fallback: number): number {
  return Math.max(MIN_SCALE, Math.min(4, Math.round(finiteNumber(value, fallback) * 100) / 100));
}

// Accepts the canonical per-element shape AND the retired global+residual shape
// (canonical field wins per element group), so old exports/localStorage still load.
function normalizedEdit(value: unknown, fallback: EditState = DEFAULT_EDIT): EditState {
  const raw = asRecord(value);
  const legacyEdge = asRecord(raw.edge);
  const legacySides = asRecord(raw.edgeSides);
  const n = (v: unknown) => finiteNumber(v, 0);
  const pipes: Pipes = raw.pipes
    ? clonePipes({
      top: finiteNumber(asRecord(raw.pipes).top, fallback.pipes.top),
      bottom: finiteNumber(asRecord(raw.pipes).bottom, fallback.pipes.bottom),
      left: finiteNumber(asRecord(raw.pipes).left, fallback.pipes.left),
      right: finiteNumber(asRecord(raw.pipes).right, fallback.pipes.right),
    })
    : (raw.edge || raw.edgeSides)
      ? {
        top: n(legacyEdge.dy) + n(asRecord(legacySides.top).dy),
        bottom: n(legacyEdge.dy) + n(asRecord(legacySides.bottom).dy),
        left: n(legacyEdge.dx) + n(asRecord(legacySides.left).dx),
        right: n(legacyEdge.dx) + n(asRecord(legacySides.right).dx),
      }
      : clonePipes(fallback.pipes);
  return {
    coolCorners: raw.coolCorners
      ? normalizedCorners(raw.coolCorners, fallback.coolCorners)
      : (raw.keyline || raw.frameCorners) ? foldedCorners(raw.keyline, raw.frameCorners) : cloneCorners(fallback.coolCorners),
    pipes,
    frameScale: roundedScale(raw.frameScale ?? raw.edgeScale, fallback.frameScale),
    brackets: raw.brackets
      ? normalizedCorners(raw.brackets, fallback.brackets)
      : (raw.bracket || raw.bracketCorners) ? foldedCorners(raw.bracket, raw.bracketCorners) : cloneCorners(fallback.brackets),
    bracketScale: roundedScale(raw.bracketScale, fallback.bracketScale),
    content: Math.max(0, Math.round(finiteNumber(raw.content, fallback.content))),
    fill: Math.max(0, Math.round(finiteNumber(raw.fill, fallback.fill))),
  };
}

function pastedAssetId(value: unknown): string | null {
  const asset = asRecord(value).asset;
  return typeof asset === 'string' && REGISTRY[asset] ? asset : null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// Content fingerprint (first 5 bytes of SHA-256, hex) of the EXACT tile bytes the
// server hands this page — fetched with no-store so it reflects what's on the wire,
// not a cached copy. This is what makes "the file I checked" and "the pixels you're
// looking at" the same string: it hashes the same bytes the editor assembles from.
async function tileFingerprint(url: string): Promise<string> {
  const buf = await (await fetch(url, { cache: 'no-store' })).arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0); return c;
}

function flip(src: CanvasImageSource, w: number, h: number, fx: boolean, fy: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  g.translate(fx ? w : 0, fy ? h : 0); g.scale(fx ? -1 : 1, fy ? -1 : 1); g.drawImage(src, 0, 0); return c;
}

function scaleCanvas(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  if (scale === 1) return src;
  const w = src.width, h = src.height;
  const dw = Math.max(1, Math.round(w * scale)), dh = Math.max(1, Math.round(h * scale));
  const s = src.getContext('2d')!.getImageData(0, 0, w, h);
  const c = document.createElement('canvas'); c.width = dw; c.height = dh;
  const g = c.getContext('2d')!, d = g.createImageData(dw, dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = Math.min(w - 1, Math.floor(x / scale));
    const sy = Math.min(h - 1, Math.floor(y / scale));
    const si = (sy * w + sx) * 4, di = (y * dw + x) * 4;
    for (let k = 0; k < 4; k++) d.data[di + k] = s.data[si + k];
  }
  g.putImageData(d, 0, 0);
  return c;
}

// rot90 copied from assemble-frame.mjs: dest(x,y) = src(y, h-1-x). Same chirality
// as the proven assembler, so the side edges land on the correct sides.
function rot90(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const sd = toCanvas(src, w, h).getContext('2d')!.getImageData(0, 0, w, h);
  const dW = h, dH = w;
  const c = document.createElement('canvas'); c.width = dW; c.height = dH;
  const dctx = c.getContext('2d')!; const dd = dctx.createImageData(dW, dH);
  for (let y = 0; y < dH; y++) for (let x = 0; x < dW; x++) {
    const si = ((h - 1 - x) * w + y) * 4, di = (y * dW + x) * 4;
    for (let k = 0; k < 4; k++) dd.data[di + k] = sd.data[si + k];
  }
  dctx.putImageData(dd, 0, 0); return c;
}

// Carve navy bleed outside the rail back to transparent (ports generate-row's
// carveExterior to canvas): flood from the edges across dark navy, stop at the
// brighter rail. Mirrors what the shipped row.png does, so the preview matches.
function carveExterior(canvas: HTMLCanvasElement): void {
  const { width: w, height: h } = canvas; const g = canvas.getContext('2d')!;
  const img = g.getImageData(0, 0, w, h); const d = img.data;
  const i4 = (x: number, y: number) => (y * w + x) * 4;
  const isNavy = (x: number, y: number) => { const i = i4(x, y); return d[i + 3] > 20 && Math.max(d[i], d[i + 1], d[i + 2]) < 45; };
  const seen = new Uint8Array(w * h); const stack: number[] = [];
  const push = (x: number, y: number) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const p = y * w + x; if (seen[p]) return; seen[p] = 1; stack.push(x, y); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) { const y = stack.pop()!, x = stack.pop()!; if (!isNavy(x, y)) continue; d[i4(x, y) + 3] = 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  g.putImageData(img, 0, 0);
}

// Split a corner atom into base (cool keyline) and accent (warm gold bracket).
function splitWarm(img: HTMLImageElement): { base: HTMLCanvasElement; accent: HTMLCanvasElement; hasAccent: boolean } {
  const w = img.width, h = img.height;
  const d = toCanvas(img, w, h).getContext('2d')!.getImageData(0, 0, w, h);
  const base = document.createElement('canvas'); base.width = w; base.height = h;
  const accent = document.createElement('canvas'); accent.width = w; accent.height = h;
  const bg = base.getContext('2d')!, ag = accent.getContext('2d')!;
  const bd = bg.createImageData(w, h), ad = ag.createImageData(w, h);
  let hasAccent = false;
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i], b = d.data[i + 2], a = d.data[i + 3];
    const warm = a > 40 && r > b + 15;
    const t = warm ? ad : bd;
    for (let k = 0; k < 4; k++) t.data[i + k] = d.data[i + k];
    if (warm) hasAccent = true;
  }
  bg.putImageData(bd, 0, 0); ag.putImageData(ad, 0, 0);
  return { base, accent, hasAccent };
}

// Bounding box of a piece's opaque pixels — used to clamp nudges so a piece can't
// be pushed out of the footprint, and to compute "max out" (offset = -min = flush).
function opaqueBox(c: HTMLCanvasElement): { minX: number; minY: number; maxX: number; maxY: number } {
  const { width: w, height: h } = c; const d = c.getContext('2d')!.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return maxX < 0 ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : { minX, minY, maxX, maxY };
}

function scaleBox(box: { minX: number; minY: number; maxX: number; maxY: number }, scale: number): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.ceil(box.minX * scale),
    minY: Math.ceil(box.minY * scale),
    maxX: Math.ceil((box.maxX + 1) * scale) - 1,
    maxY: Math.ceil((box.maxY + 1) * scale) - 1,
  };
}

const tileH = (g: CanvasRenderingContext2D, t: HTMLCanvasElement, x0: number, x1: number, y: number) => {
  for (let x = x0; x < x1; x += t.width) {
    const sw = Math.min(t.width, x1 - x);
    if (sw > 0) g.drawImage(t, 0, 0, sw, t.height, x, y, sw, t.height);
  }
};
const tileV = (g: CanvasRenderingContext2D, t: HTMLCanvasElement, y0: number, y1: number, x: number) => {
  for (let y = y0; y < y1; y += t.height) {
    const sh = Math.min(t.height, y1 - y);
    if (sh > 0) g.drawImage(t, 0, 0, t.width, sh, x, y, t.width, sh);
  }
};
const tileRect = (g: CanvasRenderingContext2D, t: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number) => {
  for (let y = y0; y < y1; y += t.height) for (let x = x0; x < x1; x += t.width) {
    const sw = Math.min(t.width, x1 - x);
    const sh = Math.min(t.height, y1 - y);
    if (sw > 0 && sh > 0) g.drawImage(t, 0, 0, sw, sh, x, y, sw, sh);
  }
};

type Loaded = {
  base: HTMLCanvasElement;
  accent: HTMLCanvasElement;
  hasAccent: boolean;
  edge: HTMLImageElement;
  fill: HTMLImageElement;
  target: HTMLImageElement | null;
  cw: number;
  ch: number;
  ew: number;
  eh: number;
  baseBox: { minX: number; minY: number; maxX: number; maxY: number };
  accentBox: { minX: number; minY: number; maxX: number; maxY: number };
};

// Assemble the 9-slice at an arbitrary W×H (no margin) with the per-element
// offsets baked in. This is the single source of truth for both the editor canvas
// and the live previews, so a preview can never diverge from what you're editing.
// bracketScale enlarges the gold corner bracket; frameScale enlarges the cool frame layer
// (corner-frame pixels and straight pipes). Both use nearest-neighbour scaling.
// The Node bake mirrors this split-layer model.
function buildFrameCanvas(L: Loaded, edit: EditState, w: number, h: number, carve = false, flipSides = false, noFill = false): HTMLCanvasElement {
  const { cw, ch, ew, eh } = L;
  const W = Math.max(2 * cw, w), H = Math.max(2 * ch, h);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  // noFill = ornament only (transparent interior) — the "line" frame a surface shows through.
  if (!noFill) tileRect(g, toCanvas(L.fill, L.fill.width, L.fill.height), 0, 0, W, H);
  // INVARIANT (mirrors the Node bake): every mirror/rotation happens AFTER scaling,
  // from ONE scaled source per atom — floor-sampled nearest-neighbour scaling does
  // not commute with mirroring, so scaling pre-flipped art breaks mirror symmetry
  // by 1px at non-integer scales.
  const topS = scaleCanvas(toCanvas(L.edge, ew, eh), edit.frameScale);
  const botS = flip(topS, topS.width, topS.height, false, true);
  // Side edges via rot90 of the SCALED top; flipSides swaps L/R for beveled rails
  // (row) so the bevel matches the corner at the join instead of reversing.
  const r = rot90(topS, topS.width, topS.height);
  const fr = flip(r, r.width, r.height, true, false);
  const rightS = flipSides ? fr : r;
  const leftS = flipSides ? r : fr;
  // Pipes are an underlay, drawn once at their scaled thickness. At scale 1 they
  // span corner-to-corner (matches every scale-1 bake byte-for-byte). At scale > 1
  // they span the FULL side, so a nudged corner sliding over them can never expose
  // an empty seam behind its arms — the line simply continues underneath.
  const px0 = edit.frameScale > 1 ? 0 : cw;
  const py0 = edit.frameScale > 1 ? 0 : ch;
  tileH(g, topS, px0, W - px0, edit.pipes.top);
  tileH(g, botS, px0, W - px0, H - botS.height - edit.pipes.bottom);
  tileV(g, leftS, py0, H - py0, edit.pipes.left);
  tileV(g, rightS, py0, H - py0, W - rightS.width - edit.pipes.right);
  // Each corner clipped to its quadrant (mirrors the Node bake's compRect): a corner
  // scaled past the half-way point fills its side to the midline and meets its
  // neighbour there instead of overlapping. Below that the corner is inside its
  // quadrant so the clip does nothing (scale ≤ 1.5 renders identically).
  const midX = Math.ceil(W / 2), midY = Math.ceil(H / 2);
  const drawClipped = (img: HTMLCanvasElement, dx: number, dy: number, x0: number, y0: number, x1: number, y1: number) => {
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    g.drawImage(img, dx, dy); g.restore();
  };
  const corner = (art: HTMLCanvasElement, scale: number, corners: Corners) => {
    const tl = scaleCanvas(art, scale);
    const dw = tl.width, dh = tl.height;
    const tr = flip(tl, dw, dh, true, false);
    const bl = flip(tl, dw, dh, false, true);
    const br = flip(tl, dw, dh, true, true);
    drawClipped(tl, corners.tl.dx, corners.tl.dy, 0, 0, midX, midY);
    drawClipped(tr, W - dw - corners.tr.dx, corners.tr.dy, midX, 0, W, midY);
    drawClipped(bl, corners.bl.dx, H - dh - corners.bl.dy, 0, midY, midX, H);
    drawClipped(br, W - dw - corners.br.dx, H - dh - corners.br.dy, midX, midY, W, H);
  };
  corner(L.base, edit.frameScale, edit.coolCorners); // cool frame corners
  if (L.hasAccent) corner(L.accent, edit.bracketScale, edit.brackets); // gold bracket
  if (carve) carveExterior(c);
  return c;
}

// Editor asset ids + labels, exported so the host studio can default/seed the frame
// selection without reaching into the registry itself.
export const NINE_SLICE_ASSETS: { id: string; label: string }[] = ASSETS.map((a) => ({ id: a.id, label: a.label }));
export const DEFAULT_NINE_SLICE_ASSET = ASSETS[0].id;

// The 9-slice editor as an embedded studio surface — the Assets editing kind, the
// frame twin of PortraitLab. It renders [main][aside] straight into the studio
// shell like every other Viewer surface: the canvas stage is the main pane, the
// editing controls are the Controls panel. Asset selection is owned by the studio
// (assetId/onAssetId ride its URL), so there is NO own route, NO page chrome, and
// NO "Back" link — the Catalog tab is back (docs/studio-control-architecture.md).
export function NineSliceLab({ assetId, onAssetId, header, zoom = 1 }: { assetId: string; onAssetId: (id: string) => void; header?: ReactNode; zoom?: number }): ReactElement {
  const asset = useMemo(() => ASSETS.find((a) => a.id === assetId) ?? ASSETS[0], [assetId]);
  const aid = asset.id;
  // The frames that share this asset's shape (same theme). Editing Shape edits the
  // whole family; only content/fill are per-member.
  const family = useMemo(() => familyOf(aid), [aid]);
  const familyNames = family.map((a) => a.label).join(' · ');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Selection = layer tab (gold | cool) + a cell of the 3×3 spatial selector.
  // The cool layer's side/center moves take their members from two toggles
  // (corners / pipe) — both on = the rigid seam-safe side move.
  // Top-level control tab: 'shape' edits the frame pixels (bakes into the PNG);
  // 'boxes' calibrates the consumption-side hand-off values (content / fill) that
  // code reads but that never bake — a different job, so its own tab.
  const [tab, setTab] = useState<'shape' | 'boxes'>('shape');
  const [layer, setLayer] = useState<Layer>('gold');
  const [sel, setSel] = useState<Sel>('center');
  const [memberCorners, setMemberCorners] = useState(true);
  const [memberPipe, setMemberPipe] = useState(true);
  // Fingerprints of the exact tile bytes this view is built from (corner/edge/fill),
  // shown in the header so the asset on screen is identifiable and matchable to disk.
  const [tileHashes, setTileHashes] = useState<{ corner?: string; edge?: string; fill?: string }>({});
  const [showOuter, setShowOuter] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [showFill, setShowFill] = useState(false);
  // What backs the ornament in the preview. The frame you edit IS the ornament (brackets +
  // keyline); the body/fill is a separate backing the consumer supplies, so it's a chosen layer
  // here, not a baked-in default. 'none' = ornament on the checkerboard (the honest default — and a
  // stray fill-coloured pixel in the art can't hide against it); 'fill' = the asset's baked body;
  // 'surface' = a real surface clipped to the fill box (audits the fill boundary).
  const [backing, setBacking] = useState<'none' | 'fill' | 'surface'>('none');
  const [previewSurfaceName, setPreviewSurfaceName] = useState(SURFACE_ASSETS[0]?.name ?? '');
  const [surfaceImg, setSurfaceImg] = useState<HTMLImageElement | null>(null);
  // gap from each outer-box edge to the art's outermost opaque pixel. + = gap inside; − = beyond (overflow).
  const [status, setStatus] = useState<{ top: number; right: number; bottom: number; left: number } | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>(() => {
    // Only keep well-formed entries — a malformed/old saved shape must never blank
    // the editor. normalizedEdit also folds the retired global+residual shape.
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const clean: Record<string, EditState> = {};
      for (const k of Object.keys(raw)) {
        const e = raw[k];
        if (e && typeof e === 'object' && !Array.isArray(e)) clean[k] = normalizedEdit(e);
      }
      return clean;
    } catch { return {}; }
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pvActualRef = useRef<HTMLCanvasElement>(null);
  const stored = edits[aid];
  const edit: EditState = {
    coolCorners: cloneCorners(stored?.coolCorners),
    pipes: clonePipes(stored?.pipes),
    frameScale: stored?.frameScale ?? DEFAULT_FRAME_SCALE,
    brackets: cloneCorners(stored?.brackets),
    bracketScale: stored?.bracketScale ?? DEFAULT_BRACKET_SCALE,
    content: stored?.content ?? DEFAULT_CONTENT,
    fill: stored?.fill ?? DEFAULT_FILL,
  };
  // One dependency key for effects that redraw from the full edit state.
  const editKey = JSON.stringify(edit);

  useEffect(() => {
    let live = true; setLoaded(null);
    Promise.all([loadImage(asset.corner), loadImage(asset.edge), loadImage(asset.fill), loadImage(asset.target).catch(() => null)])
      .then(([corner, edge, fill, target]) => {
        if (!live) return;
        const { base, accent, hasAccent } = splitWarm(corner);
        setLoaded({
          base,
          accent,
          hasAccent,
          edge,
          fill,
          target,
          cw: corner.width,
          ch: corner.height,
          ew: edge.width,
          eh: edge.height,
          baseBox: opaqueBox(base),
          accentBox: hasAccent ? opaqueBox(accent) : { minX: 0, minY: 0, maxX: corner.width - 1, maxY: corner.height - 1 },
        });
      }).catch(() => { if (live) setLoaded(null); });
    return () => { live = false; };
  }, [asset]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(edits)); }, [edits]);

  useEffect(() => {
    if (loaded && !loaded.hasAccent && layer === 'gold') setLayer('cool');
  }, [loaded, layer]);

  // Fingerprint the actual served bytes of this asset's tiles (no cache), so the
  // header shows exactly which artwork the on-screen frame is assembled from.
  useEffect(() => {
    let live = true;
    setTileHashes({});
    (async () => {
      const keys = ['corner', 'edge', 'fill'] as const;
      const entries = await Promise.all(keys.map(async (k) => [k, await tileFingerprint(asset[k]).catch(() => 'err')] as const));
      if (live) setTileHashes(Object.fromEntries(entries));
    })();
    return () => { live = false; };
  }, [asset]);

  // Load the chosen preview surface (for the fill preview).
  useEffect(() => {
    const s = SURFACE_ASSETS.find((a) => a.name === previewSurfaceName);
    if (!s) { setSurfaceImg(null); return; }
    let live = true;
    loadImage(s.file).then((img) => { if (live) setSurfaceImg(img); }).catch(() => { if (live) setSurfaceImg(null); });
    return () => { live = false; };
  }, [previewSurfaceName]);

  // Hydrate from the on-disk config (dev) the first time each asset is opened, so the
  // editor reflects what's actually baked — not stale localStorage or defaults. This
  // is what stops a fresh editor from saving default values over your real config.
  const hydrated = useRef<Set<string>>(new Set());
  // The saved/baked config each asset was hydrated from — a per-control "Reset" reverts to THIS
  // (its shipped value), mirroring the dressing rooms, rather than to a bare zero. Falls back to
  // DEFAULT_EDIT when no config has loaded (fresh asset / production, where there's no hydrate).
  const baselineRef = useRef<Record<string, EditState>>({});
  useEffect(() => {
    if (!((import.meta as { env?: { DEV?: boolean } }).env?.DEV) || hydrated.current.has(aid)) return;
    let live = true;
    fetch(`/__nine-slice/config?asset=${aid}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live || !j.ok || !j.config) return;
        hydrated.current.add(aid);
        const hydratedEdit = normalizedEdit(j.config);
        baselineRef.current[aid] = hydratedEdit;
        setEdits((prev) => ({ ...prev, [aid]: hydratedEdit }));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [aid]);

  const update = (mut: (cur: EditState) => EditState) => setEdits((prev) => {
    const cur = prev[aid] ?? DEFAULT_EDIT;
    return { ...prev, [aid]: mut(cur) };
  });
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  // A corner may grow until it fills its whole side (frame / corner) — quadrant
  // clipping lets it meet the opposite corner at the midline instead of overlapping.
  // Mirrors maxFrameScaleForAsset in the Node bake.
  const maxFrameScale = loaded ? Math.max(MIN_SCALE, Math.min(4, asset.frame.w / loaded.cw, asset.frame.h / loaded.ch)) : 4;
  const boxRange = (box: { minX: number; minY: number; maxX: number; maxY: number }, scale: number) => {
    const scaled = scaleBox(box, scale);
    const W = asset.frame.w, H = asset.frame.h;
    return { minX: -scaled.minX, maxX: W - 1 - scaled.maxX, minY: -scaled.minY, maxY: H - 1 - scaled.maxY };
  };
  const withAxis = (o: Off, axis: 'dx' | 'dy', v: number): Off => (axis === 'dx' ? { ...o, dx: v } : { ...o, dy: v });
  // Corner clamp range for a layer's ABSOLUTE offsets: outward limit = art flush
  // with the footprint corner, inward limit = art fully inside the footprint.
  const cornerRangeAt = (l: Layer, scale: number) => (loaded ? boxRange(l === 'gold' ? loaded.accentBox : loaded.baseBox, scale) : null);
  const cornerRange = (l: Layer = layer) => cornerRangeAt(l, l === 'gold' ? edit.bracketScale : edit.frameScale);
  // The four scaled pipe canvases, built EXACTLY like buildFrameCanvas does (mirror/
  // rotate after scaling), so clamp ranges are computed on the same pixels that draw.
  const scaledPipes = (scale = edit.frameScale) => {
    if (!loaded) return null;
    const top = scaleCanvas(toCanvas(loaded.edge, loaded.ew, loaded.eh), scale);
    const bottom = flip(top, top.width, top.height, false, true);
    const r = rot90(top, top.width, top.height);
    const fr = flip(r, r.width, r.height, true, false);
    return { top, bottom, right: asset.flipSides ? fr : r, left: asset.flipSides ? r : fr };
  };
  // A pipe's clamp range (absolute, its normal axis): outward limit = art flush
  // with the footprint edge, inward limit = halfway to the opposite pipe.
  const pipeSideRange = (side: Side, scale = edit.frameScale) => {
    const p = scaledPipes(scale);
    if (!p) return null;
    const box = opaqueBox(p[side]);
    if (side === 'top') return { min: -box.minY, max: Math.floor((asset.frame.h - p.top.height - p.bottom.height) / 2) };
    if (side === 'bottom') return { min: box.maxY - p.bottom.height + 1, max: Math.floor((asset.frame.h - p.top.height - p.bottom.height) / 2) };
    if (side === 'left') return { min: -box.minX, max: Math.floor((asset.frame.w - p.left.width - p.right.width) / 2) };
    return { min: box.maxX - p.right.width + 1, max: Math.floor((asset.frame.w - p.left.width - p.right.width) / 2) };
  };
  // Which members a side/center move touches. Corner cells always move their corner;
  // the gold layer has no pipes, so its toggles don't exist.
  const wantCorners = layer === 'gold' || memberCorners;
  const wantPipe = layer === 'cool' && memberPipe;
  const activeCorners = (cur: EditState) => (layer === 'gold' ? cur.brackets : cur.coolCorners);
  const putCorners = (cur: EditState, corners: Corners): EditState => (layer === 'gold' ? { ...cur, brackets: corners } : { ...cur, coolCorners: corners });
  // Single corner: d-pad in SCREEN direction, both axes, clamped. Member toggles
  // don't apply — a corner cell always moves exactly its corner.
  const nudgeCorner = (k: Corner, sdx: number, sdy: number) => {
    const r = cornerRange();
    if (!r) return;
    const m = CORNER_MIRROR[k];
    update((cur) => {
      const corners = cloneCorners(activeCorners(cur));
      corners[k] = {
        dx: clamp(corners[k].dx + sdx * m.x, r.minX, r.maxX),
        dy: clamp(corners[k].dy + sdy * m.y, r.minY, r.maxY),
      };
      return putCorners(cur, corners);
    });
  };
  // Side: RIGID move along the side's only axis (its normal). One shared delta is
  // clamped so every enabled member (corner pair and/or pipe) can take it — the
  // side moves whole or not at all; it can never shear apart at a clamp bound.
  const nudgeSideMove = (side: Side, screenDelta: number) => {
    if (!screenDelta) return;
    const d = screenDelta * SIDE_SIGN[side];
    const axis = SIDE_AXIS[side];
    const r = cornerRange();
    const pr = wantPipe ? pipeSideRange(side) : null;
    if (!r || (!wantCorners && !wantPipe)) return;
    update((cur) => {
      const corners = cloneCorners(activeCorners(cur));
      const pipes = clonePipes(cur.pipes);
      let lo = -Infinity, hi = Infinity;
      if (wantCorners) for (const k of SIDE_CORNERS[side]) {
        lo = Math.max(lo, (axis === 'dx' ? r.minX : r.minY) - corners[k][axis]);
        hi = Math.min(hi, (axis === 'dx' ? r.maxX : r.maxY) - corners[k][axis]);
      }
      if (wantPipe && pr) { lo = Math.max(lo, pr.min - pipes[side]); hi = Math.min(hi, pr.max - pipes[side]); }
      const a = lo <= hi ? clamp(d, lo, hi) : 0;
      if (!a) return cur;
      if (wantCorners) for (const k of SIDE_CORNERS[side]) corners[k] = withAxis(corners[k], axis, corners[k][axis] + a);
      if (wantPipe && pr) pipes[side] += a;
      return { ...putCorners(cur, corners), pipes };
    });
  };
  // Center: symmetric whole-layer seating, one axis at a time. dir +1 = inward,
  // -1 = outward. Atomic across all enabled members, so symmetry is preserved:
  // either every member moves or none does.
  const nudgeCenter = (axis: 'dx' | 'dy', dir: 1 | -1) => {
    const r = cornerRange();
    if (!r || (!wantCorners && !wantPipe)) return;
    const sides: Side[] = axis === 'dx' ? ['left', 'right'] : ['top', 'bottom'];
    update((cur) => {
      const corners = cloneCorners(activeCorners(cur));
      const pipes = clonePipes(cur.pipes);
      let lo = -Infinity, hi = Infinity;
      if (wantCorners) for (const k of CORNERS) {
        lo = Math.max(lo, (axis === 'dx' ? r.minX : r.minY) - corners[k][axis]);
        hi = Math.min(hi, (axis === 'dx' ? r.maxX : r.maxY) - corners[k][axis]);
      }
      if (wantPipe) for (const s of sides) { const pr = pipeSideRange(s); if (pr) { lo = Math.max(lo, pr.min - pipes[s]); hi = Math.min(hi, pr.max - pipes[s]); } }
      const a = lo <= hi ? clamp(dir, lo, hi) : 0;
      if (!a) return cur;
      if (wantCorners) for (const k of CORNERS) corners[k] = withAxis(corners[k], axis, corners[k][axis] + a);
      if (wantPipe) for (const s of sides) pipes[s] += a;
      return { ...putCorners(cur, corners), pipes };
    });
  };
  const nudge = (sdx: number, sdy: number) => {
    if (sel === 'center') return; // center seats via the labeled out/in steppers
    if ((SIDES as string[]).includes(sel)) {
      const side = sel as Side;
      nudgeSideMove(side, SIDE_AXIS[side] === 'dy' ? sdy : sdx);
      return;
    }
    nudgeCorner(sel as Corner, sdx, sdy);
  };
  // Send the selection to its max outward position — flush with the footprint.
  const flushOutward = () => {
    const r = cornerRange();
    if (!r) return;
    update((cur) => {
      const corners = cloneCorners(activeCorners(cur));
      const pipes = clonePipes(cur.pipes);
      if (sel === 'center') {
        if (wantCorners) for (const k of CORNERS) corners[k] = { dx: r.minX, dy: r.minY };
        if (wantPipe) for (const s of SIDES) { const pr = pipeSideRange(s); if (pr) pipes[s] = pr.min; }
      } else if ((SIDES as string[]).includes(sel)) {
        const side = sel as Side;
        const axis = SIDE_AXIS[side];
        if (wantCorners) for (const k of SIDE_CORNERS[side]) corners[k] = withAxis(corners[k], axis, axis === 'dx' ? r.minX : r.minY);
        if (wantPipe) { const pr = pipeSideRange(side); if (pr) pipes[side] = pr.min; }
      } else {
        corners[sel as Corner] = { dx: r.minX, dy: r.minY };
      }
      return { ...putCorners(cur, corners), pipes };
    });
  };
  const setContent = (dc: number) => update((cur) => ({ ...cur, content: Math.max(0, (cur.content ?? DEFAULT_CONTENT) + dc) }));
  // Fill inset can't exceed half the smaller frame dim (box would invert); clamp to >= 0.
  const setFill = (df: number) => update((cur) => ({ ...cur, fill: Math.max(0, Math.min(Math.floor(Math.min(asset.frame.w, asset.frame.h) / 2) - 1, (cur.fill ?? DEFAULT_FILL) + df)) }));
  // Scale changes shrink clamp ranges, so element values re-clamp with them — the
  // invariant "every stored value is inside its range" survives every operation.
  const clampCornersTo = (corners: Corners, r: { minX: number; maxX: number; minY: number; maxY: number }): Corners => ({
    tl: { dx: clamp(corners.tl.dx, r.minX, r.maxX), dy: clamp(corners.tl.dy, r.minY, r.maxY) },
    tr: { dx: clamp(corners.tr.dx, r.minX, r.maxX), dy: clamp(corners.tr.dy, r.minY, r.maxY) },
    bl: { dx: clamp(corners.bl.dx, r.minX, r.maxX), dy: clamp(corners.bl.dy, r.minY, r.maxY) },
    br: { dx: clamp(corners.br.dx, r.minX, r.maxX), dy: clamp(corners.br.dy, r.minY, r.maxY) },
  });
  const setBracketScale = (next: number | ((cur: number) => number)) => update((cur) => {
    const raw = typeof next === 'function' ? next(cur.bracketScale ?? DEFAULT_BRACKET_SCALE) : next;
    const bracketScale = Math.max(MIN_SCALE, Math.min(4, Math.round(raw * 100) / 100));
    const r = cornerRangeAt('gold', bracketScale);
    return { ...cur, bracketScale, brackets: r ? clampCornersTo(cur.brackets, r) : cur.brackets };
  });
  const setFrameScale = (next: number | ((cur: number) => number)) => update((cur) => {
    const raw = typeof next === 'function' ? next(cur.frameScale ?? DEFAULT_FRAME_SCALE) : next;
    const frameScale = clamp(Math.round(raw * 100) / 100, MIN_SCALE, maxFrameScale);
    const r = cornerRangeAt('cool', frameScale);
    const pipes = clonePipes(cur.pipes);
    for (const s of SIDES) { const pr = pipeSideRange(s, frameScale); if (pr) pipes[s] = clamp(pipes[s], pr.min, pr.max); }
    return { ...cur, frameScale, coolCorners: r ? clampCornersTo(cur.coolCorners, r) : cur.coolCorners, pipes };
  });
  // Per-selection reset — reverts exactly what the selection's controls can change
  // to the asset's saved baseline (its shipped value), the same "↺ back to default"
  // every other Studio tuner gives its controls.
  const baselineOf = (): EditState => baselineRef.current[aid] ?? DEFAULT_EDIT;
  const resetSelection = () => update((cur) => {
    const base = baselineOf();
    const corners = cloneCorners(activeCorners(cur));
    const baseCorners = cloneCorners(layer === 'gold' ? base.brackets : base.coolCorners);
    const pipes = clonePipes(cur.pipes);
    if (sel === 'center') {
      // center = the whole layer (per member toggles for cool)
      if (wantCorners) for (const k of CORNERS) corners[k] = { ...baseCorners[k] };
      if (wantPipe) for (const s of SIDES) pipes[s] = base.pipes[s];
    } else if ((SIDES as string[]).includes(sel)) {
      // a side's controls only change the normal-axis component (+ its pipe)
      const side = sel as Side;
      const axis = SIDE_AXIS[side];
      if (wantCorners) for (const k of SIDE_CORNERS[side]) corners[k] = withAxis(corners[k], axis, baseCorners[k][axis]);
      if (wantPipe) pipes[side] = base.pipes[side];
    } else {
      corners[sel as Corner] = { ...baseCorners[sel as Corner] };
    }
    return { ...putCorners(cur, corners), pipes };
  });
  const resetContent = () => update((cur) => ({ ...cur, content: baselineOf().content }));
  const resetFill = () => update((cur) => ({ ...cur, fill: baselineOf().fill }));
  const resetBracketScale = () => setBracketScale(baselineOf().bracketScale ?? DEFAULT_BRACKET_SCALE);
  const resetFrameScale = () => setFrameScale(baselineOf().frameScale ?? DEFAULT_FRAME_SCALE);
  const resetAll = () => { update(() => baselineOf()); setBacking('none'); };
  // Passive symmetry guard: with inward-positive storage, a mirror-symmetric frame
  // has literally equal values — any inequality is deliberate (or a mistake), so
  // name it instead of letting it hide until the consumed button looks off.
  const asymmetries = (() => {
    const out: string[] = [];
    const eq = (a: Off, b: Off) => a.dx === b.dx && a.dy === b.dy;
    for (const [label, g] of [['gold', edit.brackets], ['cool', edit.coolCorners]] as const) {
      if (!eq(g.tl, g.tr) || !eq(g.bl, g.br)) out.push(`${label} corners L≠R`);
      if (!eq(g.tl, g.bl) || !eq(g.tr, g.br)) out.push(`${label} corners T≠B`);
    }
    if (edit.pipes.left !== edit.pipes.right) out.push('pipes L≠R');
    if (edit.pipes.top !== edit.pipes.bottom) out.push('pipes T≠B');
    return out;
  })();

  useEffect(() => {
    if (!loaded || edit.frameScale <= maxFrameScale) return;
    update((cur) => ({ ...cur, frameScale: maxFrameScale }));
  }, [aid, loaded, edit.frameScale, maxFrameScale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== 'shape') return; // arrows nudge the frame; the Hand-off tab has no frame nudging
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const m = moves[e.key]; if (!m) return;
      e.preventDefault(); nudge(m[0], m[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, layer, sel, memberCorners, memberPipe, aid, loaded, edit.bracketScale, edit.frameScale]);

  useEffect(() => {
    if (!loaded) return;
    const W = asset.frame.w, H = asset.frame.h;        // canvas = the asset footprint
    const Z = inspectZoomForFrame(W, H) * (Number.isFinite(zoom) ? Math.max(0.25, Math.min(4, zoom)) : 1);
    const off = buildFrameCanvas(loaded, edit, W, H, asset.carve, asset.flipSides);        // full frame (baked body)
    const orn = buildFrameCanvas(loaded, edit, W, H, asset.carve, asset.flipSides, true);  // ornament only (no fill)
    const g = off.getContext('2d')!; // status reads the full frame's opaque box

    const view = canvasRef.current; if (!view) return;
    view.width = Math.max(1, Math.round(W * Z)); view.height = Math.max(1, Math.round(H * Z));
    const vg = view.getContext('2d')!; vg.imageSmoothingEnabled = false;
    for (let y = 0; y < view.height; y += 8) for (let x = 0; x < view.width; x += 8) { vg.fillStyle = ((x / 8 + y / 8) & 1) ? '#3a3f48' : '#2b2f37'; vg.fillRect(x, y, 8, 8); }
    if (backing === 'surface' && surfaceImg) {
      // Surface clipped to the FILL box, ornament on top — audits the fill boundary against a real
      // backing. Outside the fill box (the checkerboard ring) is whatever sits behind.
      const f = edit.fill;
      vg.save();
      vg.beginPath();
      vg.rect(f * Z, f * Z, (W - 2 * f) * Z, (H - 2 * f) * Z);
      vg.clip();
      const tile = 16 * Z; // 16 footprint px per tile — enough texture to read
      for (let y = 0; y < view.height; y += tile) for (let x = 0; x < view.width; x += tile) vg.drawImage(surfaceImg, x, y, tile, tile);
      vg.restore();
      vg.drawImage(orn, 0, 0, W, H, 0, 0, view.width, view.height);
    } else if (backing === 'fill') {
      vg.drawImage(off, 0, 0, W, H, 0, 0, view.width, view.height);   // the asset's baked body
    } else {
      vg.drawImage(orn, 0, 0, W, H, 0, 0, view.width, view.height);   // 'none' — ornament on the checkerboard
    }

    // Guides are FIXED references at the asset footprint — you position the
    // corners/pipes/brackets RELATIVE to them; they do NOT follow the art.
    // OUTER box = the footprint edge. CONTENT box = inset by `content` px.
    if (showOuter) {
      vg.strokeStyle = '#ff5cf0'; vg.lineWidth = 2;
      vg.strokeRect(0, 0, W * Z, H * Z);
    }
    if (showContent) {
      const c = edit.content;
      vg.strokeStyle = '#5cff9e'; vg.lineWidth = 2;
      vg.strokeRect(c * Z, c * Z, (W - 2 * c) * Z, (H - 2 * c) * Z);
    }
    // FILL box = where a surface behind this frame stops (inset by `fill` from the footprint).
    if (showFill) {
      const f = edit.fill;
      vg.strokeStyle = '#ffb454'; vg.lineWidth = 2;
      vg.strokeRect(f * Z, f * Z, (W - 2 * f) * Z, (H - 2 * f) * Z);
    }

    // STATUS: where the art's outermost opaque pixels sit vs the footprint edge.
    // Only surfaces on overflow (pixels beyond the box).
    const od = g.getImageData(0, 0, W, H).data;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (od[(y * W + x) * 4 + 3] > 20) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    setStatus(maxX < 0 ? null : { top: minY, left: minX, right: (W - 1) - maxX, bottom: (H - 1) - maxY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, editKey, showOuter, showContent, showFill, backing, surfaceImg, asset, zoom]);

  // LIVE preview — the exact assembled asset footprint. Consumer previews below use
  // real app DOM/CSS with this live frame source instead of a hand-drawn imitation.
  useEffect(() => {
    if (!loaded) return;
    const fw = asset.frame.w, fh = asset.frame.h;
    const draw = (ref: React.RefObject<HTMLCanvasElement | null>, w: number, h: number, scale: number) => {
      const cvs = ref.current; if (!cvs) return;
      const f = buildFrameCanvas(loaded, edit, w, h, asset.carve, asset.flipSides, backing !== 'fill');
      const sw = f.width, sh = f.height;
      cvs.width = sw * scale; cvs.height = sh * scale;
      const g = cvs.getContext('2d')!; g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cvs.width, cvs.height);
      g.drawImage(f, 0, 0, sw, sh, 0, 0, cvs.width, cvs.height);
    };
    draw(pvActualRef, fw, fh, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, editKey, asset, backing]);

  const liveConsumerFrameUrl = useMemo(() => {
    if (!loaded) return null;
    const frame = buildFrameCanvas(loaded, edit, asset.frame.w, asset.frame.h, asset.carve, asset.flipSides);
    return frame.toDataURL('image/png');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, editKey, asset]);
  const liveConsumerFrameStyle: CSSProperties | undefined = liveConsumerFrameUrl
    ? { borderImageSource: `url("${liveConsumerFrameUrl}")` }
    : undefined;

  // Canonical shape, same key order the kit writes — a saved config and an export
  // diff cleanly against each other.
  const exportJson = JSON.stringify({
    asset: aid,
    coolCorners: edit.coolCorners,
    pipes: edit.pipes,
    frameScale: edit.frameScale,
    brackets: edit.brackets,
    bracketScale: edit.bracketScale,
    content: edit.content,
    fill: edit.fill,
  }, null, 2);
  const layers: Layer[] = loaded ? (loaded.hasAccent ? ['gold', 'cool'] : ['cool']) : [];
  const layerLabel = (l: Layer) => (l === 'gold' ? 'gold brackets' : 'cool frame');
  const selLabel = sel === 'center' ? 'whole layer' : (CORNERS as string[]).includes(sel) ? sel.toUpperCase() : `${sel} side`;
  const activeLabel = `${layer} ${selLabel}`;
  const selIsSide = (SIDES as string[]).includes(sel);
  const selIsCorner = (CORNERS as string[]).includes(sel);
  const membersOff = layer === 'cool' && !memberCorners && !memberPipe && !selIsCorner;

  // Save straight to the on-disk config + regenerate the asset, via the dev-only
  // Vite endpoint. import.meta.env.DEV gates the button; the endpoint only exists
  // while `vite` is serving — so this whole path is dev-only by construction.
  const isDev = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  const [saveMsg, setSaveMsg] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const saveToDisk = async () => {
    setSaveMsg('saving…');
    try {
      const r = await fetch('/__nine-slice/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: exportJson });
      const j = await r.json();
      if (j.ok) baselineRef.current[aid] = edit; // the just-saved config is the new reset baseline
      const scope = j.theme ? `${j.theme} family (${j.family?.members?.length ?? family.length} frames)` : j.asset;
      // The endpoint pushes a live page reload after a save, so the app shows it
      // everywhere on navigation — this message is a brief confirmation before that.
      setSaveMsg(j.ok ? `saved ${scope} · applying live across the app…` : `error: ${j.error}`);
    } catch (e) { setSaveMsg(`error: ${String(e)}`); }
  };
  const applyImportJson = (mode: 'current' | 'named') => {
    const text = importJson.trim();
    if (!text) { setImportMsg('error: paste JSON first'); return; }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      setImportMsg(`error: ${e instanceof Error ? e.message : 'invalid JSON'}`);
      return;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      setImportMsg('error: JSON must be an object');
      return;
    }
    const named = pastedAssetId(raw);
    if (mode === 'named' && !named) {
      setImportMsg('error: JSON asset is not a known frame');
      return;
    }
    const targetAid = mode === 'named' ? named! : aid;
    const fallback = edits[targetAid] ?? baselineRef.current[targetAid] ?? DEFAULT_EDIT;
    const next = normalizedEdit(raw, fallback);
    setEdits((prev) => ({ ...prev, [targetAid]: next }));
    setSaveMsg('');
    if (mode === 'named') {
      baselineRef.current[targetAid] = baselineRef.current[targetAid] ?? fallback;
      hydrated.current.add(targetAid);
      if (targetAid !== aid) onAssetId(targetAid);
    }
    const note = mode === 'current' && named && named !== aid ? `; ignored asset ${named}` : '';
    setImportMsg(`loaded into ${targetAid}${note}`);
  };

  return (
    <>
      <section className="al-lab-main" aria-label="9-slice frame editor">
        <div style={ST.stage}>
          <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', height: 'auto' }} />
          <div style={ST.previewStrip}>
            <div style={ST.previewItem}><span style={ST.previewLabel}>actual size · 1×</span><canvas ref={pvActualRef} style={{ imageRendering: 'pixelated' }} /></div>
            <div style={ST.previewItem}>
              <span style={ST.previewLabel}>real button · 2× view</span>
              <div style={ST.consumerPreview}>
                {aid === 'mode-button' ? (
                  <button type="button" className="app-header-button" style={{ ...liveConsumerFrameStyle, transform: 'scale(2)', transformOrigin: 'center' }}>
                    Settings
                  </button>
                ) : (
                  <span style={ST.previewNote}>No placed app button consumes this frame yet.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      <aside className="tileset-view-controls" aria-label="9-slice controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-category-select" title="Which kit frame you're aligning.">
              <span>Frame</span>
              <select value={aid} onChange={(e) => onAssetId(e.target.value)} aria-label="9-slice frame">
                {ASSETS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            <div style={ST.fpBox}>
              <div style={ST.fpHead}>Tiles in this view — served path · sha-256[:5]</div>
              {(['corner', 'edge', 'fill'] as const).map((k) => (
                <div key={k} style={ST.fpRow}>
                  <span style={ST.fpPath}>{asset[k]}</span>
                  <span style={ST.fp}>{tileHashes[k] ?? '…'}</span>
                </div>
              ))}
            </div>
          <div style={ST.tabRow} role="tablist">
            {(['shape', 'boxes'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{ ...ST.tabBtn, ...(tab === t ? ST.tabBtnOn : {}) }}>
                {t === 'shape' ? 'Shape' : 'Hand-off boxes'}
              </button>
            ))}
          </div>
          {tab === 'shape' && (<>
          {asset.theme && (
            <div style={ST.familyBanner}>
              <div style={{ fontWeight: 700, color: '#ffd98a' }}>🔗 Editing the {asset.theme} family — one shared shape</div>
              <div style={{ fontSize: 12, color: '#cfe3ff', marginTop: 3, lineHeight: 1.4 }}>
                Every change here applies to all {family.length}: {familyNames}. They can't drift — one source. (Content &amp; fill stay per-frame — that's the Hand-off tab.)
              </div>
            </div>
          )}
          <div style={ST.pieceRow}>
            {layers.map((l) => (
              <button key={l} type="button" onClick={() => setLayer(l)} style={{ ...ST.pieceBtn, ...(layer === l ? (l === 'gold' ? ST.layerGoldOn : ST.pieceBtnOn) : {}) }}>{layerLabel(l)}</button>
            ))}
          </div>
          {layer === 'gold' ? (
            <>
              <div style={ST.tunerRow}>
                <span style={{ ...ST.sizeLabel, color: '#ffd98a', whiteSpace: 'nowrap' }}>Bracket size</span>
                <button type="button" style={ST.sb} onClick={() => setBracketScale((s) => s - 0.25)}>-</button>
                <span style={ST.sizeW}>x{edit.bracketScale.toFixed(2)}</span>
                <button type="button" style={ST.sb} onClick={() => setBracketScale((s) => s + 0.25)}>+</button>
                <button type="button" style={ST.sb} title="Reset bracket size to saved" aria-label="Reset bracket size" onClick={resetBracketScale}>↺</button>
              </div>
              <input type="range" min={MIN_SCALE} max={4} step={0.05} value={edit.bracketScale} onChange={(e) => setBracketScale(Number(e.target.value))} style={{ display: 'block', width: '100%', minWidth: 0, boxSizing: 'border-box' }} aria-label="Bracket size" />
            </>
          ) : (
            <>
              <div style={ST.tunerRow}>
                <span style={{ ...ST.sizeLabel, color: '#9fd6ff', whiteSpace: 'nowrap' }}>Frame size</span>
                <button type="button" style={ST.sb} onClick={() => setFrameScale((s) => s - 0.25)}>-</button>
                <span style={ST.sizeW}>x{edit.frameScale.toFixed(2)}</span>
                <button type="button" style={ST.sb} onClick={() => setFrameScale((s) => s + 0.25)}>+</button>
                <button type="button" style={ST.sb} title="Reset frame size to saved" aria-label="Reset frame size" onClick={resetFrameScale}>↺</button>
              </div>
              <input type="range" min={MIN_SCALE} max={maxFrameScale} step={0.05} value={edit.frameScale} onChange={(e) => setFrameScale(Number(e.target.value))} style={{ display: 'block', width: '100%', minWidth: 0, boxSizing: 'border-box' }} aria-label="Frame size" />
              <p style={ST.hint}>One line weight: frame size scales the cool corners and the pipes' thickness together.</p>
            </>
          )}
          <div style={ST.selRow}>
            <div style={ST.selGrid} role="group" aria-label="Frame part selector">
              {SEL_CELLS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  title={c.title}
                  onClick={() => setSel(c.key)}
                  style={{ ...ST.selBtn, ...(sel === c.key ? ST.selBtnOn : {}) }}
                >
                  {c.glyph}
                </button>
              ))}
            </div>
            <div style={ST.selSide}>
              <span style={ST.scopeLabel}>{activeLabel}</span>
              {layer === 'cool' && !selIsCorner && (
                <>
                  <label style={ST.toggle} title="Side/center moves include the corner pieces">
                    <input type="checkbox" checked={memberCorners} onChange={(e) => setMemberCorners(e.target.checked)} /> corners
                  </label>
                  <label style={ST.toggle} title="Side/center moves include the straight pipe(s)">
                    <input type="checkbox" checked={memberPipe} onChange={(e) => setMemberPipe(e.target.checked)} /> {sel === 'center' ? 'pipes' : 'pipe'}
                  </label>
                </>
              )}
            </div>
          </div>
          <p style={ST.hint}>
            {sel === 'center' && <>Symmetric seat of the whole layer — <b>out</b> toward the footprint edge, <b>in</b> toward the middle. Atomic: every member moves or none.</>}
            {selIsSide && <>Arrows move the {sel} side along its one axis{layer === 'cool' ? ' — both toggles on = the rigid, seam-safe side move' : ''}. Atomic: all enabled members or none.</>}
            {selIsCorner && <>Arrows move the {selLabel} corner in screen direction, clamped to the footprint.</>}
            {membersOff && <> <b>Both members are off — nothing to move.</b></>}
          </p>
          {sel === 'center' ? (
            <div style={ST.centerBox}>
              {([['dx', 'horizontal'], ['dy', 'vertical']] as ['dx' | 'dy', string][]).map(([axis, label]) => (
                <div key={axis} style={ST.centerRow}>
                  <span style={{ ...ST.sizeLabel, whiteSpace: 'nowrap' }}>{label}</span>
                  <button type="button" style={ST.inOutBtn} disabled={membersOff} onClick={() => nudgeCenter(axis, -1)}>⟵ out</button>
                  <button type="button" style={ST.inOutBtn} disabled={membersOff} onClick={() => nudgeCenter(axis, 1)}>in ⟶</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={ST.dpad}>
              <div />
              <button type="button" style={{ ...ST.nb, ...((membersOff || (selIsSide && SIDE_AXIS[sel as Side] === 'dx')) ? ST.nbOff : {}) }} disabled={membersOff || (selIsSide && SIDE_AXIS[sel as Side] === 'dx')} onClick={() => nudge(0, -1)}>↑</button>
              <div />
              <button type="button" style={{ ...ST.nb, ...((membersOff || (selIsSide && SIDE_AXIS[sel as Side] === 'dy')) ? ST.nbOff : {}) }} disabled={membersOff || (selIsSide && SIDE_AXIS[sel as Side] === 'dy')} onClick={() => nudge(-1, 0)}>←</button>
              <button type="button" style={ST.nbReset} title={`Reset ${selLabel} to saved`} aria-label={`Reset ${selLabel}`} onClick={resetSelection}>↺</button>
              <button type="button" style={{ ...ST.nb, ...((membersOff || (selIsSide && SIDE_AXIS[sel as Side] === 'dy')) ? ST.nbOff : {}) }} disabled={membersOff || (selIsSide && SIDE_AXIS[sel as Side] === 'dy')} onClick={() => nudge(1, 0)}>→</button>
              <div />
              <button type="button" style={{ ...ST.nb, ...((membersOff || (selIsSide && SIDE_AXIS[sel as Side] === 'dx')) ? ST.nbOff : {}) }} disabled={membersOff || (selIsSide && SIDE_AXIS[sel as Side] === 'dx')} onClick={() => nudge(0, 1)}>↓</button>
              <div />
            </div>
          )}
          <div style={ST.importActions}>
            <button type="button" style={ST.maxBtn} onClick={flushOutward} disabled={membersOff}>⤢ Flush {selLabel} outward</button>
            {sel === 'center' && <button type="button" style={ST.maxBtn} onClick={resetSelection}>↺ Reset {selLabel}</button>}
          </div>
          {asymmetries.length > 0 && (
            <div style={ST.asymBox} title="Mirror pairs with unequal values — deliberate asymmetry or a stray nudge">
              ⚠ asymmetric: {asymmetries.join(' · ')}
            </div>
          )}
          <label style={ST.toggle} title="Draw the footprint edge so you can centre the frame against it">
            <input type="checkbox" checked={showOuter} onChange={(e) => setShowOuter(e.target.checked)} />
            <span style={{ color: '#ff5cf0' }}>■</span> Outer box — footprint edge (centering guide)
          </label>
          </>)}
          {tab === 'boxes' && (<>
            <div style={ST.sizeBox}>
              {/* The two HUMAN-CALIBRATED values code consumes (ADR-0054): the dev lines
                  these boxes up against real pixels; consumers pad/clip by the result.
                  They bake into NO pixels — they ride in the config + generated CSS. */}
              <span style={ST.sectionHead}>Hand-off boxes{asset.theme ? ` · ${asset.label} only` : ''} — you calibrate, code consumes</span>
              <p style={ST.hint}>These are <b>per-frame</b>{asset.theme ? ' (unlike the shared Shape)' : ''} — they don't touch the frame art, just mark where consumers start their content and stop their backing. Save writes them to the config + generated CSS.</p>
              <label style={ST.toggle}>
                <input type="checkbox" checked={showContent} onChange={(e) => setShowContent(e.target.checked)} />
                <span style={{ color: '#5cff9e' }}>■</span> <b>Content box</b>&nbsp;— where text / icons start
              </label>
              <div style={ST.insetRow}>
                <span style={ST.sizeW}>inset {edit.content}px</span>
                <button type="button" style={ST.sb} onClick={() => setContent(-1)}>-</button>
                <button type="button" style={ST.sb} onClick={() => setContent(1)}>+</button>
                <button type="button" style={ST.sb} title="Reset content inset to saved" aria-label="Reset content inset" onClick={resetContent}>↺</button>
              </div>
              <label style={ST.toggle}>
                <input type="checkbox" checked={showFill} onChange={(e) => setShowFill(e.target.checked)} />
                <span style={{ color: '#ffb454' }}>■</span> <b>Fill box</b>&nbsp;— where a backing surface stops (frame may bleed outside it)
              </label>
              <div style={ST.insetRow}>
                <span style={ST.sizeW}>inset {edit.fill}px</span>
                <button type="button" style={ST.sb} onClick={() => setFill(-1)}>-</button>
                <button type="button" style={ST.sb} onClick={() => setFill(1)}>+</button>
                <button type="button" style={ST.sb} title="Reset fill inset to saved" aria-label="Reset fill inset" onClick={resetFill}>↺</button>
              </div>
            </div>
            <div style={ST.sizeBox}>
              <span style={ST.sectionHead}>Check against a backing</span>
              <span style={ST.sizeLabel}>Preview-only — drop a real surface behind the frame to line the fill box up against it. Not saved.</span>
              <div style={ST.backingRow}>
                <span style={{ ...ST.sizeLabel, color: '#cfe3ff', minWidth: 52 }}>Backing</span>
                <select value={backing} onChange={(e) => setBacking(e.target.value as 'none' | 'fill' | 'surface')} style={{ ...ST.select, fontSize: 13, flex: 1, minWidth: 0 }}>
                  <option value="none">None</option>
                  <option value="fill">Baked fill</option>
                  <option value="surface">Surface…</option>
                </select>
                <button type="button" style={ST.sb} title="Reset backing to None" aria-label="Reset backing" onClick={() => setBacking('none')}>↺</button>
              </div>
              {backing === 'surface' && (
                <div style={ST.sizeRow}>
                  <select value={previewSurfaceName} onChange={(e) => setPreviewSurfaceName(e.target.value)} style={{ ...ST.select, fontSize: 13, flex: 1, minWidth: 0 }}>
                    {SURFACE_ASSETS.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          </>)}
          {status && (status.top < 0 || status.right < 0 || status.bottom < 0 || status.left < 0) && (
            <div style={{ ...ST.statusBox, borderColor: '#e0556a', color: '#ff9aa8' }}>
              <div style={{ fontWeight: 700 }}>✗ overflow — pixels extend beyond the box</div>
              <div style={ST.statusGrid}>
                {status.top < 0 && <span>T {-status.top} over</span>}
                {status.right < 0 && <span>R {-status.right} over</span>}
                {status.bottom < 0 && <span>B {-status.bottom} over</span>}
                {status.left < 0 && <span>L {-status.left} over</span>}
              </div>
            </div>
          )}
          <div style={ST.offsets}>
            {([
              ['gold brackets', `TL ${edit.brackets.tl.dx},${edit.brackets.tl.dy} TR ${edit.brackets.tr.dx},${edit.brackets.tr.dy} BL ${edit.brackets.bl.dx},${edit.brackets.bl.dy} BR ${edit.brackets.br.dx},${edit.brackets.br.dy} · x${edit.bracketScale.toFixed(2)}`],
              ['cool corners', `TL ${edit.coolCorners.tl.dx},${edit.coolCorners.tl.dy} TR ${edit.coolCorners.tr.dx},${edit.coolCorners.tr.dy} BL ${edit.coolCorners.bl.dx},${edit.coolCorners.bl.dy} BR ${edit.coolCorners.br.dx},${edit.coolCorners.br.dy} · x${edit.frameScale.toFixed(2)}`],
              ['pipes', `T ${edit.pipes.top} B ${edit.pipes.bottom} L ${edit.pipes.left} R ${edit.pipes.right}`],
              ['content / fill', `${edit.content}px / ${edit.fill}px`],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={ST.offsetRow}>
                <span style={ST.offsetKey}>{k}</span>
                <span style={ST.offsetVal}>{v}</span>
              </div>
            ))}
          </div>
          <button type="button" style={ST.resetAll} onClick={resetAll}>↺ Reset all adjustments</button>
          {isDev && (
            <>
              <button type="button" style={ST.save} onClick={saveToDisk}>{asset.theme ? `💾 Save ${asset.theme} family (${family.length}) + apply live` : '💾 Save to disk + regenerate (dev)'}</button>
              {saveMsg && <div style={{ ...ST.hint, color: saveMsg.startsWith('error') ? '#ff9aa8' : '#9affc4' }}>{saveMsg}</div>}
            </>
          )}
          <details style={ST.details}>
            <summary style={ST.summary}>Import JSON</summary>
            <div style={ST.detailsBody}>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='{"asset":"mode-button",...}'
                style={ST.export}
              />
              <div style={ST.importActions}>
                <button type="button" style={ST.copy} onClick={() => applyImportJson('current')}>Apply to current</button>
                <button type="button" style={ST.copy} onClick={() => applyImportJson('named')}>Open named asset</button>
              </div>
              {importMsg && <div style={{ ...ST.hint, color: importMsg.startsWith('error') ? '#ff9aa8' : '#9affc4' }}>{importMsg}</div>}
            </div>
          </details>
          <details style={ST.details}>
            <summary style={ST.summary}>Export JSON</summary>
            <div style={ST.detailsBody}>
              <textarea readOnly value={exportJson} style={ST.export} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" style={ST.copy} onClick={() => navigator.clipboard?.writeText(exportJson)}>Copy JSON</button>
            </div>
          </details>
          </div>
        </section>
      </aside>
    </>
  );
}

const ST: Record<string, CSSProperties> = {
  select: { minWidth: 0, fontSize: 15, lineHeight: 1.2, padding: '4px 8px', background: '#111a2c', color: '#eaf3ff', border: '1px solid #2a3c5e', borderRadius: 4 },
  fpBox: { display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: '#0a0f1c', border: '1px solid #1b2740', borderRadius: 6 },
  fpHead: { fontSize: 11, color: '#7f93ad', letterSpacing: 0.2 },
  fpRow: { display: 'flex', flexWrap: 'wrap', gap: '0 10px', alignItems: 'baseline', justifyContent: 'space-between' },
  fpPath: { fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#9fc4d5', wordBreak: 'break-all' },
  fp: { fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#bfe3ff', fontWeight: 600, flex: 'none' },
  stage: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 26, overflow: 'auto', padding: 20, boxSizing: 'border-box' },
  previewStrip: { display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'center' },
  previewItem: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: 16, background: '#0e1626', border: '1px solid #1b2740', borderRadius: 8 },
  previewLabel: { fontSize: 11, color: '#9fc4d5', letterSpacing: 0.3 },
  consumerPreview: { display: 'grid', placeItems: 'center', minWidth: 300, minHeight: 112, padding: '10px 18px', boxSizing: 'border-box' },
  previewNote: { fontSize: 12, color: '#9fc4d5', textAlign: 'center' },
  familyBanner: { padding: '9px 11px', background: '#241d0a', border: '1px solid #6b5a1d', borderRadius: 8 },
  tabRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, background: '#0a0f1c', border: '1px solid #1b2740', borderRadius: 8 },
  tabBtn: { display: 'grid', placeItems: 'center', minWidth: 0, padding: '10px 8px', background: 'transparent', color: '#9fc4d5', border: '1px solid transparent', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 700, textTransform: 'none', lineHeight: 1.1 },
  tabBtnOn: { background: '#1d5f9e', color: '#fff', borderColor: '#4fbdf0' },
  pieceRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(62px, 1fr))', gap: 6 },
  pieceBtn: { display: 'grid', placeItems: 'center', minWidth: 0, padding: '8px 6px', background: '#111a2c', color: '#c4d6e6', border: '1px solid #2a3c5e', borderRadius: 4, cursor: 'pointer', textTransform: 'none', lineHeight: 1.1, overflow: 'hidden' },
  pieceBtnOn: { background: '#1d5f9e', color: '#fff', borderColor: '#4fbdf0' },
  layerGoldOn: { background: '#6b4f1d', color: '#fff2c4', borderColor: '#d5a34a' },
  scopeLabel: { fontSize: 11, color: '#ffd98a', lineHeight: 1.3, textTransform: 'uppercase' },
  selRow: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 12, alignItems: 'start' },
  selGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gridAutoRows: '34px', gap: 3 },
  selBtn: { display: 'grid', placeItems: 'center', minWidth: 0, minHeight: 0, padding: 0, background: '#111a2c', color: '#7f93ad', border: '1px solid #2a3c5e', borderRadius: 4, cursor: 'pointer', fontSize: 14, lineHeight: 1, overflow: 'hidden' },
  selBtnOn: { background: '#6b4f1d', color: '#fff2c4', borderColor: '#d5a34a' },
  selSide: { display: 'grid', gap: 6, alignContent: 'start', minWidth: 0 },
  centerBox: { display: 'grid', gap: 6 },
  centerRow: { display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr) minmax(0, 1fr)', gap: 6, alignItems: 'center' },
  inOutBtn: { display: 'grid', placeItems: 'center', minWidth: 0, minHeight: 0, height: 30, padding: '0 6px', background: '#111a2c', color: '#eaf3ff', border: '1px solid #2a3c5e', borderRadius: 5, cursor: 'pointer', fontSize: 12, lineHeight: 1, textTransform: 'none', overflow: 'hidden' },
  nbOff: { opacity: 0.3, cursor: 'default' },
  asymBox: { fontSize: 12, color: '#ffd98a', background: '#241d0a', border: '1px solid #6b5a1d', borderRadius: 6, padding: '6px 10px' },
  sectionHead: { fontSize: 11, color: '#ffd98a', letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 700 },
  hint: { fontSize: 13, color: '#9fc4d5', margin: 0, textTransform: 'none', fontWeight: 400, letterSpacing: 0 },
  dpad: { display: 'grid', gridTemplateColumns: 'repeat(3, 36px)', gridAutoRows: '36px', gap: 4, justifyContent: 'center' },
  nb: { display: 'grid', placeItems: 'center', minHeight: 0, padding: 0, fontFamily: 'system-ui, sans-serif', fontSize: 16, lineHeight: 1, background: '#111a2c', color: '#eaf3ff', border: '1px solid #2a3c5e', borderRadius: 6, cursor: 'pointer' },
  nbReset: { display: 'grid', placeItems: 'center', minHeight: 0, padding: 0, fontFamily: 'system-ui, sans-serif', fontSize: 14, lineHeight: 1, background: '#17223a', color: '#9fc4d5', border: '1px solid #2a3c5e', borderRadius: 6, cursor: 'pointer' },
  maxBtn: { display: 'grid', placeItems: 'center', minWidth: 0, padding: '9px 10px', background: '#15324a', color: '#bfe3ff', border: '1px solid #3a7fb0', borderRadius: 6, cursor: 'pointer', fontSize: 12, lineHeight: 1.2, textTransform: 'none' },
  resetAll: { padding: '9px 0', background: '#241a2b', color: '#e6c8ef', border: '1px solid #6b4f78', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  sizeBox: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderTop: '1px solid #1b2740' },
  sizeLabel: { fontSize: 12, lineHeight: 1.15, color: '#9fc4d5' },
  sizeRow: { display: 'flex', alignItems: 'center', gap: 6 },
  tunerRow: { display: 'grid', gridTemplateColumns: 'minmax(58px, 1fr) 30px 46px 30px 30px', alignItems: 'center', gap: 5, minWidth: 0 },
  insetRow: { display: 'grid', gridTemplateColumns: '78px 30px 30px 30px', alignItems: 'center', gap: 5, minWidth: 0 },
  backingRow: { display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) 30px', alignItems: 'center', gap: 5, minWidth: 0 },
  sizeW: { display: 'grid', placeItems: 'center', minWidth: 0, fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1, whiteSpace: 'nowrap', color: '#dbe9ff' },
  sb: { display: 'grid', placeItems: 'center', minWidth: 0, minHeight: 0, width: 30, height: 30, padding: 0, boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif', fontSize: 18, lineHeight: 1, background: '#111a2c', color: '#eaf3ff', border: '1px solid #2a3c5e', borderRadius: 5, cursor: 'pointer', overflow: 'hidden' },
  toggle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cfe3ff', textTransform: 'none', fontWeight: 400, letterSpacing: 0 },
  statusBox: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, padding: '8px 10px', border: '1px solid', borderRadius: 6, background: '#0a0f1c' },
  statusGrid: { display: 'flex', gap: 14, fontFamily: 'ui-monospace, monospace', fontSize: 13 },
  offsets: { display: 'grid', gap: 3, padding: '8px 10px', background: '#0a0f1c', border: '1px solid #1b2740', borderRadius: 6 },
  offsetRow: { display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', columnGap: 8, alignItems: 'baseline' },
  offsetKey: { fontSize: 11, color: '#7f93ad', lineHeight: 1.35 },
  offsetVal: { fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#dbe9ff', lineHeight: 1.35, overflowWrap: 'anywhere' },
  details: { border: '1px solid #1b2740', borderRadius: 6, background: '#0a0f1c', padding: '2px 0' },
  summary: { fontSize: 12, color: '#9fc4d5', padding: '6px 10px', cursor: 'pointer', userSelect: 'none' },
  detailsBody: { display: 'grid', gap: 6, padding: '4px 8px 8px' },
  export: { width: '100%', minHeight: 110, flexShrink: 0, resize: 'vertical', background: '#0a0f1c', color: '#dbe9ff', border: '1px solid #2a3c5e', borderRadius: 4, fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: 8, boxSizing: 'border-box' },
  importActions: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, minWidth: 0 },
  save: { padding: '10px 0', background: '#15532f', color: '#dffbe8', border: '1px solid #43b06a', borderRadius: 4, cursor: 'pointer', fontWeight: 700 },
  copy: { padding: '8px 0', background: '#1d5f9e', color: '#fff', border: '1px solid #4fbdf0', borderRadius: 4, cursor: 'pointer' },
};
