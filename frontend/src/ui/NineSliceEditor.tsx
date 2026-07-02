// 9-slice editor. You align a kit 9-slice by nudging its pieces one pixel at a
// time; the tool renders the rest of the frame from those nudges, live.
//
// Decomposition (the model we settled on):
//   - FRAME: the cool corner-frame pixels + the straight edge atoms, tuned as one layer.
//   - BRACKET: the gold corner decoration, tuned with the same control profile.
//   - CONTENT: an inset guide marking where text/icons start (consumption-side).
// Toggle the outer/content guide boxes (fixed at the footprint) to align against.
//
// Edge handedness is copied verbatim from scripts/assemble-frame.mjs (the proven
// assembler): right = rot90(edge), left = flipH(right), top = edge, bottom =
// flipV(edge). Same rot90 pixel transform, so left/right can't reverse.
//
// In dev, Save writes config/nine-slice/<asset>.json and regenerates the asset
// (via the Vite dev endpoint). Routing follows repo convention (lazy in App.tsx).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import nineSliceRegistry from '../../config/nine-slice-registry.json';
import { SURFACE_ASSETS } from './surfaceCatalog';

type Off = { dx: number; dy: number };
type Frame = { w: number; h: number };
type BracketCorner = 'tl' | 'tr' | 'bl' | 'br';
type BracketScope = 'all' | 'top' | 'bottom' | 'left' | 'right' | BracketCorner;
type BracketCorners = Record<BracketCorner, Off>;
type EdgeSide = 'top' | 'bottom' | 'left' | 'right';
type EdgeSides = Record<EdgeSide, Off>;
type EditState = { keyline: Off; frameCorners: BracketCorners; edge: Off; edgeSides: EdgeSides; frameScale: number; bracket: Off; bracketCorners: BracketCorners; content: number; fill: number; bracketScale: number };
type PieceKey = 'frame' | 'bracket' | 'pipes';

type Asset = { id: string; label: string; corner: string; edge: string; fill: string; target: string; frame: Frame; carve?: boolean; flipSides?: boolean };

// Derived from the SINGLE registry (shared with the Node bake + the catalog). Every
// atom-built frame appears here automatically — adding one is a registry edit, not a
// code change in three files.
type RegAsset = { label: string; atoms: { corner: string; edge: string; fill: string }; frame: Frame; carve?: boolean; flipSides?: boolean; variants: { out: string }[] };
const REGISTRY = (nineSliceRegistry as { assets: Record<string, RegAsset> }).assets;
const ASSETS: Asset[] = Object.entries(REGISTRY).map(([id, a]) => ({
  id,
  label: a.label,
  corner: `/assets/ui/kit/atoms/${a.atoms.corner}.png`,
  edge: `/assets/ui/kit/atoms/${a.atoms.edge}.png`,
  fill: `/assets/ui/kit/atoms/${a.atoms.fill}.png`,
  target: `/assets/ui/kit/${a.variants[0].out}`,
  frame: a.frame,
  carve: !!a.carve,
  flipSides: !!a.flipSides,
}));

// 0 = no content inset, matching the bake's fallback (normalizeConfig in
// scripts/nine-slice-kit.mjs) so an unsaved asset previews exactly what it bakes.
const DEFAULT_CONTENT = 0;
// 0 = the fill boundary IS the footprint edge (no inset). The fill box marks where a surface
// painted behind this frame should stop — the frame's corners can bleed outside it.
const DEFAULT_FILL = 0;
const DEFAULT_BRACKET_SCALE = 1;
const DEFAULT_FRAME_SCALE = 1;
const ZERO_OFF: Off = { dx: 0, dy: 0 };
const CORNERS: BracketCorner[] = ['tl', 'tr', 'bl', 'br'];
const SIDES: EdgeSide[] = ['top', 'bottom', 'left', 'right'];
const ZERO_BRACKET_CORNERS: BracketCorners = {
  tl: { dx: 0, dy: 0 },
  tr: { dx: 0, dy: 0 },
  bl: { dx: 0, dy: 0 },
  br: { dx: 0, dy: 0 },
};
const ZERO_EDGE_SIDES: EdgeSides = {
  top: { dx: 0, dy: 0 },
  bottom: { dx: 0, dy: 0 },
  left: { dx: 0, dy: 0 },
  right: { dx: 0, dy: 0 },
};
const BRACKET_SCOPES: { key: BracketScope; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'top', label: 'top' },
  { key: 'bottom', label: 'bottom' },
  { key: 'left', label: 'left' },
  { key: 'right', label: 'right' },
  { key: 'tl', label: 'TL' },
  { key: 'tr', label: 'TR' },
  { key: 'bl', label: 'BL' },
  { key: 'br', label: 'BR' },
];
const STORAGE_KEY = 'nine-slice-editor-v4';
const Z = 6;

function cloneBracketCorners(src?: Partial<BracketCorners>): BracketCorners {
  return {
    tl: { ...(src?.tl ?? ZERO_OFF) },
    tr: { ...(src?.tr ?? ZERO_OFF) },
    bl: { ...(src?.bl ?? ZERO_OFF) },
    br: { ...(src?.br ?? ZERO_OFF) },
  };
}

function cloneEdgeSides(src?: Partial<EdgeSides>): EdgeSides {
  return {
    top: { ...(src?.top ?? ZERO_OFF) },
    bottom: { ...(src?.bottom ?? ZERO_OFF) },
    left: { ...(src?.left ?? ZERO_OFF) },
    right: { ...(src?.right ?? ZERO_OFF) },
  };
}

const DEFAULT_EDIT: EditState = {
  keyline: { dx: 0, dy: 0 },
  frameCorners: cloneBracketCorners(),
  edge: { dx: 0, dy: 0 },
  edgeSides: cloneEdgeSides(),
  frameScale: DEFAULT_FRAME_SCALE,
  bracket: { dx: 0, dy: 0 },
  bracketCorners: cloneBracketCorners(),
  content: DEFAULT_CONTENT,
  fill: DEFAULT_FILL,
  bracketScale: DEFAULT_BRACKET_SCALE,
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

function normalizedCorners(value: unknown, fallback: BracketCorners): BracketCorners {
  const raw = asRecord(value);
  return {
    tl: normalizedOff(raw.tl, fallback.tl),
    tr: normalizedOff(raw.tr, fallback.tr),
    bl: normalizedOff(raw.bl, fallback.bl),
    br: normalizedOff(raw.br, fallback.br),
  };
}

function normalizedEdgeSides(value: unknown, fallback: EdgeSides): EdgeSides {
  const raw = asRecord(value);
  return {
    top: normalizedOff(raw.top, fallback.top),
    bottom: normalizedOff(raw.bottom, fallback.bottom),
    left: normalizedOff(raw.left, fallback.left),
    right: normalizedOff(raw.right, fallback.right),
  };
}

function roundedScale(value: unknown, fallback: number): number {
  return Math.max(1, Math.min(4, Math.round(finiteNumber(value, fallback) * 100) / 100));
}

function normalizedEdit(value: unknown, fallback: EditState = DEFAULT_EDIT): EditState {
  const raw = asRecord(value);
  return {
    keyline: normalizedOff(raw.keyline, fallback.keyline),
    frameCorners: normalizedCorners(raw.frameCorners, fallback.frameCorners),
    edge: normalizedOff(raw.edge, fallback.edge),
    edgeSides: normalizedEdgeSides(raw.edgeSides, fallback.edgeSides),
    frameScale: roundedScale(raw.frameScale ?? raw.edgeScale, fallback.frameScale),
    bracket: normalizedOff(raw.bracket, fallback.bracket),
    bracketCorners: normalizedCorners(raw.bracketCorners, fallback.bracketCorners),
    content: Math.max(0, Math.round(finiteNumber(raw.content, fallback.content))),
    fill: Math.max(0, Math.round(finiteNumber(raw.fill, fallback.fill))),
    bracketScale: roundedScale(raw.bracketScale, fallback.bracketScale),
  };
}

function pastedAssetId(value: unknown): string | null {
  const asset = asRecord(value).asset;
  return typeof asset === 'string' && REGISTRY[asset] ? asset : null;
}

function cornersForScope(scope: BracketScope): BracketCorner[] {
  if (scope === 'all') return CORNERS;
  if (scope === 'top') return ['tl', 'tr'];
  if (scope === 'bottom') return ['bl', 'br'];
  if (scope === 'left') return ['tl', 'bl'];
  if (scope === 'right') return ['tr', 'br'];
  return [scope];
}

function sidesForScope(scope: BracketScope): EdgeSide[] {
  if (scope === 'all') return SIDES;
  if (scope === 'top') return ['top'];
  if (scope === 'bottom') return ['bottom'];
  if (scope === 'left') return ['left'];
  if (scope === 'right') return ['right'];
  return [];
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
  edgeMinDx: number;
  edgeMinDy: number;
  edgeMaxDx: number;
  edgeMaxDy: number;
};

// Assemble the 9-slice at an arbitrary W×H (no margin) with the edge/keyline/bracket
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
  const topY = edit.edge.dy + edit.edgeSides.top.dy;
  const bottomY = edit.edge.dy + edit.edgeSides.bottom.dy;
  const leftX = edit.edge.dx + edit.edgeSides.left.dx;
  const rightX = edit.edge.dx + edit.edgeSides.right.dx;
  // Pipes are an underlay, drawn once at their scaled thickness. At scale 1 they
  // span corner-to-corner (matches every scale-1 bake byte-for-byte). At scale > 1
  // they span the FULL side, so a nudged corner sliding over them can never expose
  // an empty seam behind its arms — the line simply continues underneath.
  const px0 = edit.frameScale > 1 ? 0 : cw;
  const py0 = edit.frameScale > 1 ? 0 : ch;
  tileH(g, topS, px0, W - px0, topY);
  tileH(g, botS, px0, W - px0, H - botS.height - bottomY);
  tileV(g, leftS, py0, H - py0, leftX);
  tileV(g, rightS, py0, H - py0, W - rightS.width - rightX);
  const corner = (art: HTMLCanvasElement, ox: number, oy: number, scale = 1, perCorner: BracketCorners = ZERO_BRACKET_CORNERS) => {
    const tl = scaleCanvas(art, scale);
    const dw = tl.width, dh = tl.height;
    const tr = flip(tl, dw, dh, true, false);
    const bl = flip(tl, dw, dh, false, true);
    const br = flip(tl, dw, dh, true, true);
    const p = perCorner;
    g.drawImage(tl, ox + p.tl.dx, oy + p.tl.dy);
    g.drawImage(tr, W - dw - (ox + p.tr.dx), oy + p.tr.dy);
    g.drawImage(bl, ox + p.bl.dx, H - dh - (oy + p.bl.dy));
    g.drawImage(br, W - dw - (ox + p.br.dx), H - dh - (oy + p.br.dy));
  };
  corner(L.base, edit.keyline.dx, edit.keyline.dy, edit.frameScale, edit.frameCorners); // cool frame corners
  if (L.hasAccent) corner(L.accent, edit.bracket.dx, edit.bracket.dy, edit.bracketScale, edit.bracketCorners); // gold bracket
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
export function NineSliceLab({ assetId, onAssetId, header }: { assetId: string; onAssetId: (id: string) => void; header?: ReactNode }): ReactElement {
  const asset = useMemo(() => ASSETS.find((a) => a.id === assetId) ?? ASSETS[0], [assetId]);
  const aid = asset.id;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [layerScope, setLayerScope] = useState<BracketScope>('all');
  // Fingerprints of the exact tile bytes this view is built from (corner/edge/fill),
  // shown in the header so the asset on screen is identifiable and matchable to disk.
  const [tileHashes, setTileHashes] = useState<{ corner?: string; edge?: string; fill?: string }>({});
  const [active, setActive] = useState<PieceKey>('bracket');
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
    // Only keep well-formed entries — a malformed/old saved shape must never blank the editor.
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const clean: Record<string, EditState> = {};
      for (const k of Object.keys(raw)) {
        const e = raw[k];
        if (e && e.keyline && typeof e.keyline.dx === 'number' && e.bracket && typeof e.bracket.dx === 'number') {
          clean[k] = normalizedEdit(e);
        }
      }
      return clean;
    } catch { return {}; }
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pvActualRef = useRef<HTMLCanvasElement>(null);
  const stored = edits[aid];
  const edit: EditState = {
    keyline: stored?.keyline ?? { dx: 0, dy: 0 },
    frameCorners: cloneBracketCorners(stored?.frameCorners),
    edge: stored?.edge ?? { dx: 0, dy: 0 },
    edgeSides: cloneEdgeSides(stored?.edgeSides),
    frameScale: stored?.frameScale ?? DEFAULT_FRAME_SCALE,
    bracket: stored?.bracket ?? { dx: 0, dy: 0 },
    bracketCorners: cloneBracketCorners(stored?.bracketCorners),
    content: stored?.content ?? DEFAULT_CONTENT,
    fill: stored?.fill ?? DEFAULT_FILL,
    bracketScale: stored?.bracketScale ?? DEFAULT_BRACKET_SCALE,
  };

  useEffect(() => {
    let live = true; setLoaded(null);
    Promise.all([loadImage(asset.corner), loadImage(asset.edge), loadImage(asset.fill), loadImage(asset.target).catch(() => null)])
      .then(([corner, edge, fill, target]) => {
        if (!live) return;
        const { base, accent, hasAccent } = splitWarm(corner);
        const topEdge = toCanvas(edge, edge.width, edge.height);
        const bottomEdge = flip(topEdge, topEdge.width, topEdge.height, false, true);
        const side = rot90(edge, edge.width, edge.height);
        const flippedSide = flip(side, side.width, side.height, true, false);
        const rightEdge = asset.flipSides ? flippedSide : side;
        const leftEdge = asset.flipSides ? side : flippedSide;
        const topBox = opaqueBox(topEdge);
        const bottomBox = opaqueBox(bottomEdge);
        const leftBox = opaqueBox(leftEdge);
        const rightBox = opaqueBox(rightEdge);
        const edgeMinDx = Math.max(-leftBox.minX, rightBox.maxX - rightEdge.width + 1);
        const edgeMinDy = Math.max(-topBox.minY, bottomBox.maxY - bottomEdge.height + 1);
        const edgeMaxDx = Math.max(edgeMinDx, Math.floor((asset.frame.w - leftEdge.width - rightEdge.width) / 2));
        const edgeMaxDy = Math.max(edgeMinDy, Math.floor((asset.frame.h - topEdge.height - bottomEdge.height) / 2));
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
          edgeMinDx,
          edgeMinDy,
          edgeMaxDx,
          edgeMaxDy,
        });
      }).catch(() => { if (live) setLoaded(null); });
    return () => { live = false; };
  }, [asset]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(edits)); }, [edits]);

  useEffect(() => {
    if (loaded && !loaded.hasAccent && active === 'bracket') setActive('frame');
  }, [loaded, active]);

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
  const maxFrameScale = loaded ? Math.max(1, Math.min(4, asset.frame.w / (2 * loaded.cw), asset.frame.h / (2 * loaded.ch))) : 4;
  const boxRange = (box: { minX: number; minY: number; maxX: number; maxY: number }, scale: number) => {
    const scaled = scaleBox(box, scale);
    const W = asset.frame.w, H = asset.frame.h;
    return { minX: -scaled.minX, maxX: W - 1 - scaled.maxX, minY: -scaled.minY, maxY: H - 1 - scaled.maxY };
  };
  const bracketRange = () => loaded ? boxRange(loaded.accentBox, edit.bracketScale) : null;
  const frameCornerRange = (scale = edit.frameScale) => loaded ? boxRange(loaded.baseBox, scale) : null;
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
  const edgeRange = (scale = edit.frameScale, sides = edit.edgeSides) => {
    const p = scaledPipes(scale);
    if (!p) return null;
    const topBox = opaqueBox(p.top);
    const bottomBox = opaqueBox(p.bottom);
    const leftBox = opaqueBox(p.left);
    const rightBox = opaqueBox(p.right);
    const minDx = Math.max(-leftBox.minX - sides.left.dx, rightBox.maxX - p.right.width + 1 - sides.right.dx);
    const minDy = Math.max(-topBox.minY - sides.top.dy, bottomBox.maxY - p.bottom.height + 1 - sides.bottom.dy);
    return {
      minDx,
      minDy,
      maxDx: Math.max(minDx, Math.floor((asset.frame.w - p.left.width - p.right.width) / 2) - Math.max(sides.left.dx, sides.right.dx)),
      maxDy: Math.max(minDy, Math.floor((asset.frame.h - p.top.height - p.bottom.height) / 2) - Math.max(sides.top.dy, sides.bottom.dy)),
    };
  };
  // Per-side range for the stored SUM (global edge + that side's residual): outward
  // limit = art flush with the footprint edge, inward limit = halfway to the
  // opposite pipe. Unlike edgeRange (the global clamp), each side is independent.
  const pipeSideRange = (side: EdgeSide, scale = edit.frameScale) => {
    const p = scaledPipes(scale);
    if (!p) return null;
    const box = opaqueBox(p[side]);
    if (side === 'top') return { min: -box.minY, max: Math.floor((asset.frame.h - p.top.height - p.bottom.height) / 2) };
    if (side === 'bottom') return { min: box.maxY - p.bottom.height + 1, max: Math.floor((asset.frame.h - p.top.height - p.bottom.height) / 2) };
    if (side === 'left') return { min: -box.minX, max: Math.floor((asset.frame.w - p.left.width - p.right.width) / 2) };
    return { min: box.maxX - p.right.width + 1, max: Math.floor((asset.frame.w - p.left.width - p.right.width) / 2) };
  };
  // Arrow deltas arrive in SCREEN space; offsets are stored inward-positive (mirrored
  // axes negate). Remap so the selected piece always moves in the arrow's screen
  // direction. 'all' stays symmetric (↓/→ = inward, ↑/← = outward); a side scope's
  // tangent axis stays a symmetric squeeze/spread of its corner pair.
  const screenToStored = (scope: BracketScope, dx: number, dy: number): [number, number] => {
    if (scope === 'tr') return [-dx, dy];
    if (scope === 'bl') return [dx, -dy];
    if (scope === 'br') return [-dx, -dy];
    if (scope === 'bottom') return [dx, -dy];
    if (scope === 'right') return [-dx, dy];
    return [dx, dy];
  };
  const withAxis = (o: Off, axis: 'dx' | 'dy', v: number): Off => (axis === 'dx' ? { ...o, dx: v } : { ...o, dy: v });
  const nudgeBracket = (sdx: number, sdy: number) => {
    const [dx, dy] = screenToStored(layerScope, sdx, sdy);
    const range = bracketRange();
    if (!range) return;
    const scoped = cornersForScope(layerScope);
    update((cur) => {
      const corners = cloneBracketCorners(cur.bracketCorners);
      if (layerScope === 'all') {
        const minDx = Math.max(...CORNERS.map((k) => range.minX - corners[k].dx));
        const maxDx = Math.min(...CORNERS.map((k) => range.maxX - corners[k].dx));
        const minDy = Math.max(...CORNERS.map((k) => range.minY - corners[k].dy));
        const maxDy = Math.min(...CORNERS.map((k) => range.maxY - corners[k].dy));
        return { ...cur, bracket: { dx: clamp(cur.bracket.dx + dx, minDx, maxDx), dy: clamp(cur.bracket.dy + dy, minDy, maxDy) } };
      }
      for (const k of scoped) {
        const actualX = clamp(cur.bracket.dx + corners[k].dx + dx, range.minX, range.maxX);
        const actualY = clamp(cur.bracket.dy + corners[k].dy + dy, range.minY, range.maxY);
        corners[k] = { dx: actualX - cur.bracket.dx, dy: actualY - cur.bracket.dy };
      }
      return { ...cur, bracketCorners: corners };
    });
  };
  const nudgeFrame = (sdx: number, sdy: number) => {
    const [dx, dy] = screenToStored(layerScope, sdx, sdy);
    const cornerRange = frameCornerRange();
    const edgeBaseRange = edgeRange();
    if (!cornerRange || !edgeBaseRange) return;
    const cornerScope = cornersForScope(layerScope);
    const sideScope = sidesForScope(layerScope);
    update((cur) => {
      const frameCorners = cloneBracketCorners(cur.frameCorners);
      const edgeSides = cloneEdgeSides(cur.edgeSides);
      if (layerScope === 'all') {
        const minDx = Math.max(...CORNERS.map((k) => cornerRange.minX - frameCorners[k].dx));
        const maxDx = Math.min(...CORNERS.map((k) => cornerRange.maxX - frameCorners[k].dx));
        const minDy = Math.max(...CORNERS.map((k) => cornerRange.minY - frameCorners[k].dy));
        const maxDy = Math.min(...CORNERS.map((k) => cornerRange.maxY - frameCorners[k].dy));
        return {
          ...cur,
          keyline: { dx: clamp(cur.keyline.dx + dx, minDx, maxDx), dy: clamp(cur.keyline.dy + dy, minDy, maxDy) },
          edge: { dx: clamp(cur.edge.dx + dx, edgeBaseRange.minDx, edgeBaseRange.maxDx), dy: clamp(cur.edge.dy + dy, edgeBaseRange.minDy, edgeBaseRange.maxDy) },
        };
      }
      if (sideScope.length === 1) {
        // RIGID side move along the side's normal axis: ONE shared delta, clamped so
        // both corners AND the pipe can take it — the side moves whole or not at all
        // (it must never shear apart when one member hits a clamp bound first).
        const side = sideScope[0];
        const axis: 'dx' | 'dy' = side === 'top' || side === 'bottom' ? 'dy' : 'dx';
        const d = axis === 'dy' ? dy : dx;
        const pr = pipeSideRange(side);
        if (d !== 0 && pr) {
          let lo = pr.min - (cur.edge[axis] + edgeSides[side][axis]);
          let hi = pr.max - (cur.edge[axis] + edgeSides[side][axis]);
          const cornerLo = axis === 'dx' ? cornerRange.minX : cornerRange.minY;
          const cornerHi = axis === 'dx' ? cornerRange.maxX : cornerRange.maxY;
          for (const k of cornerScope) {
            lo = Math.max(lo, cornerLo - (cur.keyline[axis] + frameCorners[k][axis]));
            hi = Math.min(hi, cornerHi - (cur.keyline[axis] + frameCorners[k][axis]));
          }
          const applied = lo <= hi ? clamp(d, lo, hi) : 0;
          for (const k of cornerScope) frameCorners[k] = withAxis(frameCorners[k], axis, frameCorners[k][axis] + applied);
          edgeSides[side] = withAxis(edgeSides[side], axis, edgeSides[side][axis] + applied);
        }
        // Tangent axis: symmetric squeeze/spread of the corner pair (pipes are
        // anchored along their own axis, so there is nothing rigid to move).
        const tAxis: 'dx' | 'dy' = axis === 'dy' ? 'dx' : 'dy';
        const t = tAxis === 'dx' ? dx : dy;
        if (t !== 0) {
          const tLo = tAxis === 'dx' ? cornerRange.minX : cornerRange.minY;
          const tHi = tAxis === 'dx' ? cornerRange.maxX : cornerRange.maxY;
          for (const k of cornerScope) {
            const actual = clamp(cur.keyline[tAxis] + frameCorners[k][tAxis] + t, tLo, tHi);
            frameCorners[k] = withAxis(frameCorners[k], tAxis, actual - cur.keyline[tAxis]);
          }
        }
        return { ...cur, frameCorners, edgeSides };
      }
      for (const k of cornerScope) {
        const actualX = clamp(cur.keyline.dx + frameCorners[k].dx + dx, cornerRange.minX, cornerRange.maxX);
        const actualY = clamp(cur.keyline.dy + frameCorners[k].dy + dy, cornerRange.minY, cornerRange.maxY);
        frameCorners[k] = { dx: actualX - cur.keyline.dx, dy: actualY - cur.keyline.dy };
      }
      return { ...cur, frameCorners, edgeSides };
    });
  };
  // Pipes as their own piece: move ONE pipe (or the global edge under 'all') without
  // touching any corner — the operation that used to require hand-editing JSON.
  const nudgePipes = (sdx: number, sdy: number) => {
    const [dx, dy] = screenToStored(layerScope, sdx, sdy);
    if (layerScope === 'all') {
      const range = edgeRange();
      if (!range) return;
      update((cur) => ({ ...cur, edge: { dx: clamp(cur.edge.dx + dx, range.minDx, range.maxDx), dy: clamp(cur.edge.dy + dy, range.minDy, range.maxDy) } }));
      return;
    }
    const sideScope = sidesForScope(layerScope);
    if (!sideScope.length) return;
    update((cur) => {
      const edgeSides = cloneEdgeSides(cur.edgeSides);
      for (const side of sideScope) {
        const axis: 'dx' | 'dy' = side === 'top' || side === 'bottom' ? 'dy' : 'dx';
        const d = axis === 'dy' ? dy : dx;
        if (!d) continue;
        const pr = pipeSideRange(side);
        if (!pr) continue;
        const sum = clamp(cur.edge[axis] + edgeSides[side][axis] + d, pr.min, pr.max);
        edgeSides[side] = withAxis(edgeSides[side], axis, sum - cur.edge[axis]);
      }
      return { ...cur, edgeSides };
    });
  };
  const nudge = (dx: number, dy: number) => {
    if (active === 'bracket') { nudgeBracket(dx, dy); return; }
    if (active === 'pipes') { nudgePipes(dx, dy); return; }
    nudgeFrame(dx, dy);
  };
  // Send the active piece to its max outward position — flush with the footprint corner.
  const maxOut = () => {
    if (!loaded) return;
    if (active === 'pipes') {
      const range = edgeRange();
      if (!range) return;
      update((cur) => {
        if (layerScope === 'all') return { ...cur, edge: { dx: range.minDx, dy: range.minDy }, edgeSides: cloneEdgeSides() };
        const edgeSides = cloneEdgeSides(cur.edgeSides);
        for (const side of sidesForScope(layerScope)) {
          const axis: 'dx' | 'dy' = side === 'top' || side === 'bottom' ? 'dy' : 'dx';
          const pr = pipeSideRange(side);
          if (pr) edgeSides[side] = withAxis(edgeSides[side], axis, pr.min - cur.edge[axis]);
        }
        return { ...cur, edgeSides };
      });
      return;
    }
    if (active === 'bracket') {
      const range = bracketRange();
      if (!range) return;
      const scoped = cornersForScope(layerScope);
      update((cur) => {
        const corners = cloneBracketCorners(cur.bracketCorners);
        if (layerScope === 'all') return { ...cur, bracket: { dx: range.minX, dy: range.minY }, bracketCorners: cloneBracketCorners() };
        for (const k of scoped) corners[k] = { dx: range.minX - cur.bracket.dx, dy: range.minY - cur.bracket.dy };
        return { ...cur, bracketCorners: corners };
      });
      return;
    }
    const cornerRange = frameCornerRange();
    const edgeBaseRange = edgeRange();
    if (!cornerRange || !edgeBaseRange) return;
    const cornerScope = cornersForScope(layerScope);
    const sideScope = sidesForScope(layerScope);
    update((cur) => {
      const frameCorners = cloneBracketCorners(cur.frameCorners);
      const edgeSides = cloneEdgeSides(cur.edgeSides);
      if (layerScope === 'all') {
        return {
          ...cur,
          keyline: { dx: cornerRange.minX, dy: cornerRange.minY },
          frameCorners: cloneBracketCorners(),
          edge: { dx: edgeBaseRange.minDx, dy: edgeBaseRange.minDy },
          edgeSides: cloneEdgeSides(),
        };
      }
      for (const k of cornerScope) frameCorners[k] = { dx: cornerRange.minX - cur.keyline.dx, dy: cornerRange.minY - cur.keyline.dy };
      for (const side of sideScope) {
        if (side === 'top' || side === 'bottom') edgeSides[side] = { ...edgeSides[side], dy: edgeBaseRange.minDy - cur.edge.dy };
        else edgeSides[side] = { ...edgeSides[side], dx: edgeBaseRange.minDx - cur.edge.dx };
      }
      return { ...cur, frameCorners, edgeSides };
    });
  };
  const setContent = (dc: number) => update((cur) => ({ ...cur, content: Math.max(0, (cur.content ?? DEFAULT_CONTENT) + dc) }));
  // Fill inset can't exceed half the smaller frame dim (box would invert); clamp to >= 0.
  const setFill = (df: number) => update((cur) => ({ ...cur, fill: Math.max(0, Math.min(Math.floor(Math.min(asset.frame.w, asset.frame.h) / 2) - 1, (cur.fill ?? DEFAULT_FILL) + df)) }));
  const setBracketScale = (next: number | ((cur: number) => number)) => update((cur) => {
    const raw = typeof next === 'function' ? next(cur.bracketScale ?? DEFAULT_BRACKET_SCALE) : next;
    return { ...cur, bracketScale: Math.max(1, Math.min(4, Math.round(raw * 100) / 100)) };
  });
  const setFrameScale = (next: number | ((cur: number) => number)) => update((cur) => {
    const raw = typeof next === 'function' ? next(cur.frameScale ?? DEFAULT_FRAME_SCALE) : next;
    const frameScale = clamp(Math.round(raw * 100) / 100, 1, maxFrameScale);
    const range = edgeRange(frameScale, cur.edgeSides);
    return {
      ...cur,
      frameScale,
      edge: range ? { dx: clamp(cur.edge.dx, range.minDx, range.maxDx), dy: clamp(cur.edge.dy, range.minDy, range.maxDy) } : cur.edge,
    };
  });
  // Per-control resets — each reverts ONE control to the asset's saved baseline (its shipped value),
  // the same "↺ back to default" every other Studio tuner gives its controls. Backing is preview-only,
  // so it resets to its neutral state (none).
  const baselineOf = (): EditState => baselineRef.current[aid] ?? DEFAULT_EDIT;
  const resetBracket = () => update((cur) => {
    const base = baselineOf();
    if (layerScope === 'all') return { ...cur, bracket: base.bracket, bracketCorners: cloneBracketCorners(base.bracketCorners) };
    const corners = cloneBracketCorners(cur.bracketCorners);
    const baseCorners = cloneBracketCorners(base.bracketCorners);
    for (const k of cornersForScope(layerScope)) corners[k] = baseCorners[k];
    return { ...cur, bracketCorners: corners };
  });
  const resetFrame = () => update((cur) => {
    const base = baselineOf();
    if (layerScope === 'all') {
      return {
        ...cur,
        keyline: base.keyline,
        frameCorners: cloneBracketCorners(base.frameCorners),
        edge: base.edge,
        edgeSides: cloneEdgeSides(base.edgeSides),
      };
    }
    const frameCorners = cloneBracketCorners(cur.frameCorners);
    const edgeSides = cloneEdgeSides(cur.edgeSides);
    const baseFrameCorners = cloneBracketCorners(base.frameCorners);
    const baseEdgeSides = cloneEdgeSides(base.edgeSides);
    for (const k of cornersForScope(layerScope)) frameCorners[k] = baseFrameCorners[k];
    for (const s of sidesForScope(layerScope)) edgeSides[s] = baseEdgeSides[s];
    return { ...cur, frameCorners, edgeSides };
  });
  const resetPipes = () => update((cur) => {
    const base = baselineOf();
    if (layerScope === 'all') return { ...cur, edge: base.edge, edgeSides: cloneEdgeSides(base.edgeSides) };
    const edgeSides = cloneEdgeSides(cur.edgeSides);
    const baseEdgeSides = cloneEdgeSides(base.edgeSides);
    for (const s of sidesForScope(layerScope)) edgeSides[s] = baseEdgeSides[s];
    return { ...cur, edgeSides };
  });
  const resetContent = () => update((cur) => ({ ...cur, content: baselineOf().content }));
  const resetFill = () => update((cur) => ({ ...cur, fill: baselineOf().fill }));
  const resetBracketScale = () => update((cur) => ({ ...cur, bracketScale: baselineOf().bracketScale ?? DEFAULT_BRACKET_SCALE }));
  const resetFrameScale = () => update((cur) => {
    const frameScale = clamp(baselineOf().frameScale ?? DEFAULT_FRAME_SCALE, 1, maxFrameScale);
    const range = edgeRange(frameScale, cur.edgeSides);
    return {
      ...cur,
      frameScale,
      edge: range ? { dx: clamp(cur.edge.dx, range.minDx, range.maxDx), dy: clamp(cur.edge.dy, range.minDy, range.maxDy) } : cur.edge,
    };
  });
  const resetAll = () => { update(() => baselineOf()); setBacking('none'); };

  useEffect(() => {
    if (!loaded || edit.frameScale <= maxFrameScale) return;
    update((cur) => ({ ...cur, frameScale: maxFrameScale }));
  }, [aid, loaded, edit.frameScale, maxFrameScale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const m = moves[e.key]; if (!m) return;
      e.preventDefault(); nudge(m[0], m[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, aid, loaded, edit.bracketScale, edit.frameScale, layerScope]);

  useEffect(() => {
    if (!loaded) return;
    const W = asset.frame.w, H = asset.frame.h;        // canvas = the asset footprint
    const off = buildFrameCanvas(loaded, edit, W, H, asset.carve, asset.flipSides);        // full frame (baked body)
    const orn = buildFrameCanvas(loaded, edit, W, H, asset.carve, asset.flipSides, true);  // ornament only (no fill)
    const g = off.getContext('2d')!; // status reads the full frame's opaque box

    const view = canvasRef.current; if (!view) return;
    view.width = W * Z; view.height = H * Z;
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
      vg.drawImage(orn, 0, 0, W, H, 0, 0, W * Z, H * Z);
    } else if (backing === 'fill') {
      vg.drawImage(off, 0, 0, W, H, 0, 0, W * Z, H * Z);   // the asset's baked body
    } else {
      vg.drawImage(orn, 0, 0, W, H, 0, 0, W * Z, H * Z);   // 'none' — ornament on the checkerboard
    }

    // Guides are FIXED references at the asset footprint — you position the
    // edge/keyline/bracket RELATIVE to them; they do NOT follow the art.
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
  }, [
    loaded,
    edit.keyline.dx,
    edit.keyline.dy,
    edit.frameCorners.tl.dx,
    edit.frameCorners.tl.dy,
    edit.frameCorners.tr.dx,
    edit.frameCorners.tr.dy,
    edit.frameCorners.bl.dx,
    edit.frameCorners.bl.dy,
    edit.frameCorners.br.dx,
    edit.frameCorners.br.dy,
    edit.edge.dx,
    edit.edge.dy,
    edit.edgeSides.top.dy,
    edit.edgeSides.bottom.dy,
    edit.edgeSides.left.dx,
    edit.edgeSides.right.dx,
    edit.frameScale,
    edit.bracket.dx,
    edit.bracket.dy,
    edit.bracketCorners.tl.dx,
    edit.bracketCorners.tl.dy,
    edit.bracketCorners.tr.dx,
    edit.bracketCorners.tr.dy,
    edit.bracketCorners.bl.dx,
    edit.bracketCorners.bl.dy,
    edit.bracketCorners.br.dx,
    edit.bracketCorners.br.dy,
    edit.bracketScale,
    edit.content,
    edit.fill,
    showOuter,
    showContent,
    showFill,
    backing,
    surfaceImg,
    asset,
  ]);

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
  }, [
    loaded,
    edit.keyline.dx,
    edit.keyline.dy,
    edit.frameCorners.tl.dx,
    edit.frameCorners.tl.dy,
    edit.frameCorners.tr.dx,
    edit.frameCorners.tr.dy,
    edit.frameCorners.bl.dx,
    edit.frameCorners.bl.dy,
    edit.frameCorners.br.dx,
    edit.frameCorners.br.dy,
    edit.edge.dx,
    edit.edge.dy,
    edit.edgeSides.top.dy,
    edit.edgeSides.bottom.dy,
    edit.edgeSides.left.dx,
    edit.edgeSides.right.dx,
    edit.frameScale,
    edit.bracket.dx,
    edit.bracket.dy,
    edit.bracketCorners.tl.dx,
    edit.bracketCorners.tl.dy,
    edit.bracketCorners.tr.dx,
    edit.bracketCorners.tr.dy,
    edit.bracketCorners.bl.dx,
    edit.bracketCorners.bl.dy,
    edit.bracketCorners.br.dx,
    edit.bracketCorners.br.dy,
    edit.bracketScale,
    asset,
    backing,
  ]);

  const liveConsumerFrameUrl = useMemo(() => {
    if (!loaded) return null;
    const frame = buildFrameCanvas(loaded, edit, asset.frame.w, asset.frame.h, asset.carve, asset.flipSides);
    return frame.toDataURL('image/png');
  }, [
    loaded,
    edit.keyline.dx,
    edit.keyline.dy,
    edit.frameCorners.tl.dx,
    edit.frameCorners.tl.dy,
    edit.frameCorners.tr.dx,
    edit.frameCorners.tr.dy,
    edit.frameCorners.bl.dx,
    edit.frameCorners.bl.dy,
    edit.frameCorners.br.dx,
    edit.frameCorners.br.dy,
    edit.edge.dx,
    edit.edge.dy,
    edit.edgeSides.top.dy,
    edit.edgeSides.bottom.dy,
    edit.edgeSides.left.dx,
    edit.edgeSides.right.dx,
    edit.frameScale,
    edit.bracket.dx,
    edit.bracket.dy,
    edit.bracketCorners.tl.dx,
    edit.bracketCorners.tl.dy,
    edit.bracketCorners.tr.dx,
    edit.bracketCorners.tr.dy,
    edit.bracketCorners.bl.dx,
    edit.bracketCorners.bl.dy,
    edit.bracketCorners.br.dx,
    edit.bracketCorners.br.dy,
    edit.bracketScale,
    asset,
  ]);
  const liveConsumerFrameStyle: CSSProperties | undefined = liveConsumerFrameUrl
    ? { borderImageSource: `url("${liveConsumerFrameUrl}")` }
    : undefined;

  const exportJson = JSON.stringify({
    asset: aid,
    keyline: edit.keyline,
    frameCorners: edit.frameCorners,
    edge: edit.edge,
    edgeSides: edit.edgeSides,
    frameScale: edit.frameScale,
    bracket: edit.bracket,
    bracketCorners: edit.bracketCorners,
    bracketScale: edit.bracketScale,
    content: edit.content,
    fill: edit.fill,
  }, null, 2);
  const pieces: PieceKey[] = loaded ? (loaded.hasAccent ? ['bracket', 'frame', 'pipes'] : ['frame', 'pipes']) : [];
  const pieceLabel = (k: PieceKey) => k;
  // Pipes have one degree of freedom each (their normal axis) — corner scopes don't
  // apply. The shared grid narrows to all + the four sides for the pipes piece.
  const scopesForPiece = (k: PieceKey) => (k === 'pipes' ? BRACKET_SCOPES.filter((s) => s.key === 'all' || sidesForScope(s.key).length === 1) : BRACKET_SCOPES);
  const setActivePiece = (k: PieceKey) => {
    setActive(k);
    if (k === 'pipes' && layerScope !== 'all' && sidesForScope(layerScope).length !== 1) setLayerScope('all');
  };
  const scopeLabel = BRACKET_SCOPES.find((s) => s.key === layerScope)?.label ?? layerScope;
  const activeLabel = layerScope !== 'all' ? `${pieceLabel(active)} ${scopeLabel}` : pieceLabel(active);
  const resetActive = active === 'frame' ? resetFrame : active === 'pipes' ? resetPipes : resetBracket;

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
      const warn = (j.warns && j.warns.length) ? ` · ⚠ ${j.warns.join('; ')}` : '';
      setSaveMsg(j.ok ? `saved ${j.config} → ${j.written.join(', ')}${warn} · hard-refresh to see it${j.note ? ` (${j.note})` : ''}` : `error: ${j.error}`);
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
          <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', maxWidth: '100%' }} />
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
          <div style={ST.pieceRow}>
            {pieces.map((k) => (
              <button key={k} type="button" onClick={() => setActivePiece(k)} style={{ ...ST.pieceBtn, ...(active === k ? ST.pieceBtnOn : {}) }}>{pieceLabel(k)}</button>
            ))}
          </div>
          <div style={ST.scopeBox}>
            <span style={ST.scopeLabel}>{pieceLabel(active)} scope</span>
            <div style={ST.scopeGrid}>
              {scopesForPiece(active).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setLayerScope(s.key)}
                  style={{ ...ST.scopeBtn, ...(layerScope === s.key ? ST.scopeBtnOn : {}) }}
                  title={`Nudge ${s.label} ${pieceLabel(active)} piece${cornersForScope(s.key).length > 1 || sidesForScope(s.key).length > 1 ? 's' : ''}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <p style={ST.hint}>
            Editing <b>{activeLabel}</b> — arrows nudge 1px in screen direction.
            {layerScope === 'all' && <> On <b>all</b>, ↓/→ push inward and ↑/← outward (symmetric).</>}
            {active === 'frame' && layerScope !== 'all' && sidesForScope(layerScope).length === 1 && <> A side moves rigid (corners + pipe together); the cross-axis squeezes its corner pair.</>}
            {active === 'pipes' && <> Moves the straight pipe only — corners stay put.</>}
          </p>
          <div style={ST.dpad}>
            <div /><button type="button" style={ST.nb} onClick={() => nudge(0, -1)}>↑</button><div />
            <button type="button" style={ST.nb} onClick={() => nudge(-1, 0)}>←</button>
            <button type="button" style={ST.nbReset} title={`Reset ${activeLabel} nudge to saved`} aria-label={`Reset ${activeLabel} nudge`} onClick={resetActive}>↺</button>
            <button type="button" style={ST.nb} onClick={() => nudge(1, 0)}>→</button>
            <div /><button type="button" style={ST.nb} onClick={() => nudge(0, 1)}>↓</button><div />
          </div>
          <button type="button" style={ST.maxBtn} onClick={maxOut}>⤢ Send {activeLabel} to max (flush to box corner)</button>
          {active === 'bracket' && (
            <>
              <div style={ST.tunerRow}>
                <span style={{ ...ST.sizeLabel, color: '#ffd98a', whiteSpace: 'nowrap' }}>Bracket size</span>
                <button type="button" style={ST.sb} onClick={() => setBracketScale((s) => s - 0.25)}>-</button>
                <span style={ST.sizeW}>x{edit.bracketScale.toFixed(2)}</span>
                <button type="button" style={ST.sb} onClick={() => setBracketScale((s) => s + 0.25)}>+</button>
                <button type="button" style={ST.sb} title="Reset bracket size to saved" aria-label="Reset bracket size" onClick={resetBracketScale}>↺</button>
              </div>
              <input type="range" min={1} max={4} step={0.05} value={edit.bracketScale} onChange={(e) => setBracketScale(Number(e.target.value))} style={{ display: 'block', width: '100%', minWidth: 0, boxSizing: 'border-box' }} aria-label="Bracket size" />
              <p style={ST.hint}>Scales the gold bracket layer only. Switch to <b>frame</b> for the cool frame and pipe layer.</p>
            </>
          )}
          {active === 'frame' && (
            <>
              <div style={ST.tunerRow}>
                <span style={{ ...ST.sizeLabel, color: '#9fd6ff', whiteSpace: 'nowrap' }}>Frame size</span>
                <button type="button" style={ST.sb} onClick={() => setFrameScale((s) => s - 0.25)}>-</button>
                <span style={ST.sizeW}>x{edit.frameScale.toFixed(2)}</span>
                <button type="button" style={ST.sb} onClick={() => setFrameScale((s) => s + 0.25)}>+</button>
                <button type="button" style={ST.sb} title="Reset frame size to saved" aria-label="Reset frame size" onClick={resetFrameScale}>↺</button>
              </div>
              <input type="range" min={1} max={maxFrameScale} step={0.05} value={edit.frameScale} onChange={(e) => setFrameScale(Number(e.target.value))} style={{ display: 'block', width: '100%', minWidth: 0, boxSizing: 'border-box' }} aria-label="Frame size" />
              <p style={ST.hint}>Scales the cool corner-frame pixels and straight pipes together.</p>
            </>
          )}
          <div style={ST.sizeBox}>
            <label style={ST.toggle}>
              <input type="checkbox" checked={showOuter} onChange={(e) => setShowOuter(e.target.checked)} />
              <span style={{ color: '#ff5cf0' }}>■</span> Outer box — outermost pixels of the 9-slice (centering guide)
            </label>
            <label style={ST.toggle}>
              <input type="checkbox" checked={showContent} onChange={(e) => setShowContent(e.target.checked)} />
              <span style={{ color: '#5cff9e' }}>■</span> Content box — where text / icons start
            </label>
            <div style={ST.insetRow}>
              <span style={ST.sizeW}>inset {edit.content}px</span>
              <button type="button" style={ST.sb} onClick={() => setContent(-1)}>-</button>
              <button type="button" style={ST.sb} onClick={() => setContent(1)}>+</button>
              <button type="button" style={ST.sb} title="Reset content inset to saved" aria-label="Reset content inset" onClick={resetContent}>↺</button>
            </div>
            <label style={ST.toggle}>
              <input type="checkbox" checked={showFill} onChange={(e) => setShowFill(e.target.checked)} />
              <span style={{ color: '#ffb454' }}>■</span> Fill box — where a surface fill stops (frame may bleed outside it)
            </label>
            <div style={ST.insetRow}>
              <span style={ST.sizeW}>inset {edit.fill}px</span>
              <button type="button" style={ST.sb} onClick={() => setFill(-1)}>-</button>
              <button type="button" style={ST.sb} onClick={() => setFill(1)}>+</button>
              <button type="button" style={ST.sb} title="Reset fill inset to saved" aria-label="Reset fill inset" onClick={resetFill}>↺</button>
            </div>
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
            <span style={ST.sizeLabel}>Preview only — you're editing the ornament; the body is a backing the consumer supplies. Save writes bracket, frame, sizes, content, and fill.</span>
          </div>
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
              ['bracket', `dx ${edit.bracket.dx}, dy ${edit.bracket.dy} · x${edit.bracketScale.toFixed(2)}`],
              ['bracket corners', `TL ${edit.bracketCorners.tl.dx},${edit.bracketCorners.tl.dy} TR ${edit.bracketCorners.tr.dx},${edit.bracketCorners.tr.dy} BL ${edit.bracketCorners.bl.dx},${edit.bracketCorners.bl.dy} BR ${edit.bracketCorners.br.dx},${edit.bracketCorners.br.dy}`],
              ['frame', `dx ${edit.keyline.dx}, dy ${edit.keyline.dy} · x${edit.frameScale.toFixed(2)}`],
              ['frame corners', `TL ${edit.frameCorners.tl.dx},${edit.frameCorners.tl.dy} TR ${edit.frameCorners.tr.dx},${edit.frameCorners.tr.dy} BL ${edit.frameCorners.bl.dx},${edit.frameCorners.bl.dy} BR ${edit.frameCorners.br.dx},${edit.frameCorners.br.dy}`],
              ['pipes', `dx ${edit.edge.dx}, dy ${edit.edge.dy}`],
              ['pipe sides', `T ${edit.edgeSides.top.dy} B ${edit.edgeSides.bottom.dy} L ${edit.edgeSides.left.dx} R ${edit.edgeSides.right.dx}`],
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
              <button type="button" style={ST.save} onClick={saveToDisk}>💾 Save to disk + regenerate (dev)</button>
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
  stage: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, overflow: 'auto', padding: 20 },
  previewStrip: { display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'center' },
  previewItem: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', padding: 16, background: '#0e1626', border: '1px solid #1b2740', borderRadius: 8 },
  previewLabel: { fontSize: 11, color: '#9fc4d5', letterSpacing: 0.3 },
  consumerPreview: { display: 'grid', placeItems: 'center', minWidth: 300, minHeight: 112, padding: '10px 18px', boxSizing: 'border-box' },
  previewNote: { fontSize: 12, color: '#9fc4d5', textAlign: 'center' },
  pieceRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(62px, 1fr))', gap: 6 },
  pieceBtn: { display: 'grid', placeItems: 'center', minWidth: 0, padding: '8px 6px', background: '#111a2c', color: '#c4d6e6', border: '1px solid #2a3c5e', borderRadius: 4, cursor: 'pointer', textTransform: 'none', lineHeight: 1.1, overflow: 'hidden' },
  pieceBtnOn: { background: '#1d5f9e', color: '#fff', borderColor: '#4fbdf0' },
  scopeBox: { display: 'grid', gap: 6, minWidth: 0 },
  scopeLabel: { fontSize: 11, color: '#ffd98a', lineHeight: 1, textTransform: 'uppercase' },
  scopeGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 4, minWidth: 0 },
  scopeBtn: { display: 'grid', placeItems: 'center', minWidth: 0, minHeight: 0, height: 28, padding: '0 4px', background: '#111a2c', color: '#c4d6e6', border: '1px solid #2a3c5e', borderRadius: 4, cursor: 'pointer', fontSize: 11, lineHeight: 1, textTransform: 'none', overflow: 'hidden' },
  scopeBtnOn: { background: '#6b4f1d', color: '#fff2c4', borderColor: '#d5a34a' },
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
