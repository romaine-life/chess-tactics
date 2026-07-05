// Shared kit for baking /nine-slice-editor configs into committed assets.
//
// One place defines, per asset: which atoms it uses, its frame size, and which
// output PNGs (incl. palette-swapped variants like the cyan active state). The
// apply CLI (apply-nine-slice.mjs) and the per-asset generators both go through
// buildAsset(), so there is a SINGLE bake implementation and the editor's offsets
// can't diverge between tools.
//
// Config shape (ADR-0054): per-element ABSOLUTES — exactly the render degrees of
// freedom, nothing layered or dead. All positions are inward-positive in each
// element's own corner/side space (mirrored axes negate on draw), so a mirror-
// symmetric frame is one whose values are literally equal.
//   - brackets     {tl,tr,bl,br} of {dx,dy} -> the warm gold corner pixels (baked)
//   - coolCorners  {tl,tr,bl,br} of {dx,dy} -> the cool corner-frame pixels (baked)
//   - pipes        {top,bottom,left,right} one number each -> the straight edge
//                  runs, along their normal axis only (a pipe tiles its full span,
//                  so tangent movement is meaningless) (baked)
//   - bracketScale / frameScale -> scale the gold layer / the cool layer (corner
//                  pixels + pipe thickness together) (baked)
//   - content / fill -> consumption-side, human-calibrated (element padding /
//                  where a backing surface stops). Recorded, never baked.
// The legacy global+residual shape (keyline/frameCorners, edge/edgeSides,
// bracket/bracketCorners) is folded into absolutes on read — the renderer only
// ever saw the sums.
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ATOMS = `${root}public/assets/ui/kit/atoms/`;
export const KIT = `${root}public/assets/ui/kit/`;
// Transparent-interior "line" variants (ornament only) live here, beside panel-line.png.
// They are the fix for the 9-slice fill problem (see bakeLine / ADR-0034).
export const LINE_DIR = `${root}public/assets/ui/explore/frames/`;
export const CONFIG_DIR = `${root}config/nine-slice/`;

// Single source of truth — the SAME registry the in-app editor and the catalog
// edit-link read (config/nine-slice-registry.json). Add a frame there and it
// becomes bakeable, editable, and catalog-linked with no code change here.
const REG = JSON.parse(readFileSync(`${root}config/nine-slice-registry.json`, 'utf8'));
const PALETTES = REG.palettes ?? {};
// Resolve each variant's palette name (e.g. "gold2cyan") to its actual swap map.
export const REGISTRY = Object.fromEntries(Object.entries(REG.assets).map(([id, a]) => [id, {
  ...a,
  variants: a.variants.map((v) => ({ ...v, swap: v.swap ? PALETTES[v.swap] : undefined })),
  // Semantic-accent twins of the `line` frame: resolve each tone's palette name to its
  // swap map, exactly like a variant, so bakeLine(id, swap) can re-colour the ornament.
  lineTones: a.lineTones ? a.lineTones.map((t) => ({ ...t, swap: t.swap ? PALETTES[t.swap] : undefined })) : undefined,
}]));

const hex = (r, g, b) => `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
const isWarm = (r, g, b, a) => a > 40 && r > b + 15; // gold ramp is warm; keyline/navy are cool
const loadAtom = (n) => PNG.sync.read(readFileSync(`${ATOMS}${n}.png`));
const DEFAULT_BRACKET_SCALE = 1;
const DEFAULT_FRAME_SCALE = 1;
const n0 = (v) => (Number.isFinite(v) ? Number(v) : 0);
// Fold a (legacy) global offset + per-corner residuals into per-corner absolutes.
// With a zero global this doubles as the normalizer for the canonical shape.
function foldCorners(global, per = {}) {
  const gx = n0(global?.dx), gy = n0(global?.dy);
  return {
    tl: { dx: gx + n0(per.tl?.dx), dy: gy + n0(per.tl?.dy) },
    tr: { dx: gx + n0(per.tr?.dx), dy: gy + n0(per.tr?.dy) },
    bl: { dx: gx + n0(per.bl?.dx), dy: gy + n0(per.bl?.dy) },
    br: { dx: gx + n0(per.br?.dx), dy: gy + n0(per.br?.dy) },
  };
}
const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };
function np(w, h) { const o = new PNG({ width: w, height: h }); o.data.fill(0); return o; }
function map(img, fn) {
  const [w, h] = fn.dims(img);
  const o = np(w, h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const c = px(img, ...fn(img, x, y));
    const i = (y * w + x) * 4;
    for (let k = 0; k < 4; k += 1) o.data[i + k] = c[k];
  }
  return o;
}
const flipH = (img) => map(img, Object.assign((m, x, y) => [m.width - 1 - x, y], { dims: (m) => [m.width, m.height] }));
const flipV = (img) => map(img, Object.assign((m, x, y) => [x, m.height - 1 - y], { dims: (m) => [m.width, m.height] }));
const rot90 = (img) => map(img, Object.assign((m, x, y) => [y, m.height - 1 - x], { dims: (m) => [m.height, m.width] }));
function comp(o, img, sx, sy) {
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    const dx = sx + x, dy = sy + y;
    if (dx < 0 || dy < 0 || dx >= o.width || dy >= o.height) continue;
    const c = px(img, x, y);
    const a = c[3] / 255;
    const i = (dy * o.width + dx) * 4;
    o.data[i] = Math.round(c[0] * a + o.data[i] * (1 - a));
    o.data[i + 1] = Math.round(c[1] * a + o.data[i + 1] * (1 - a));
    o.data[i + 2] = Math.round(c[2] * a + o.data[i + 2] * (1 - a));
    o.data[i + 3] = Math.max(o.data[i + 3], c[3]);
  }
}
function compScaled(o, img, sx, sy, scale = 1) {
  const dw = Math.max(1, Math.round(img.width * scale));
  const dh = Math.max(1, Math.round(img.height * scale));
  for (let y = 0; y < dh; y += 1) for (let x = 0; x < dw; x += 1) {
    const dx = sx + x, dy = sy + y;
    if (dx < 0 || dy < 0 || dx >= o.width || dy >= o.height) continue;
    const srcX = Math.min(img.width - 1, Math.floor(x / scale));
    const srcY = Math.min(img.height - 1, Math.floor(y / scale));
    const c = px(img, srcX, srcY);
    const a = c[3] / 255;
    const i = (dy * o.width + dx) * 4;
    o.data[i] = Math.round(c[0] * a + o.data[i] * (1 - a));
    o.data[i + 1] = Math.round(c[1] * a + o.data[i + 1] * (1 - a));
    o.data[i + 2] = Math.round(c[2] * a + o.data[i + 2] * (1 - a));
    o.data[i + 3] = Math.max(o.data[i + 3], c[3]);
  }
}
function scalePng(img, scale = 1) {
  if (scale === 1) return img;
  const o = np(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
  compScaled(o, img, 0, 0, scale);
  return o;
}
function compClipped(o, img, sx, sy, clipX1, clipY1) {
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    const dx = sx + x, dy = sy + y;
    if (dx < 0 || dy < 0 || dx >= o.width || dy >= o.height || dx >= clipX1 || dy >= clipY1) continue;
    const c = px(img, x, y);
    const a = c[3] / 255;
    const i = (dy * o.width + dx) * 4;
    o.data[i] = Math.round(c[0] * a + o.data[i] * (1 - a));
    o.data[i + 1] = Math.round(c[1] * a + o.data[i + 1] * (1 - a));
    o.data[i + 2] = Math.round(c[2] * a + o.data[i + 2] * (1 - a));
    o.data[i + 3] = Math.max(o.data[i + 3], c[3]);
  }
}
function tile(o, t, x0, y0, x1, y1) {
  for (let y = y0; y < y1; y += t.height) for (let x = x0; x < x1; x += t.width) compClipped(o, t, x, y, x1, y1);
}
// Composite clipped to an arbitrary rect [x0,x1)×[y0,y1). Corners use this to stay
// inside their own quadrant, so a corner scaled past the half-way point meets its
// neighbour exactly at the midline instead of overlapping into it (no center pip).
function compRect(o, img, sx, sy, x0, y0, x1, y1) {
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    const dx = sx + x, dy = sy + y;
    if (dx < x0 || dy < y0 || dx >= x1 || dy >= y1 || dx >= o.width || dy >= o.height) continue;
    const c = px(img, x, y);
    const a = c[3] / 255;
    const i = (dy * o.width + dx) * 4;
    o.data[i] = Math.round(c[0] * a + o.data[i] * (1 - a));
    o.data[i + 1] = Math.round(c[1] * a + o.data[i + 1] * (1 - a));
    o.data[i + 2] = Math.round(c[2] * a + o.data[i + 2] * (1 - a));
    o.data[i + 3] = Math.max(o.data[i + 3], c[3]);
  }
}

// New image holding only the kept pixels, shifted by (dx,dy).
function layer(src, dx, dy, keep) {
  const { width: w, height: h } = src; const o = new PNG({ width: w, height: h }); o.data.fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; const r = src.data[i], g = src.data[i + 1], b = src.data[i + 2], a = src.data[i + 3];
    if (!keep(r, g, b, a)) continue;
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const j = (ny * w + nx) * 4; o.data[j] = r; o.data[j + 1] = g; o.data[j + 2] = b; o.data[j + 3] = a;
  }
  return o;
}
function splitCorner(corner) {
  return {
    base: layer(corner, 0, 0, (r, g, b, a) => a > 40 && !isWarm(r, g, b, a)),
    bracket: layer(corner, 0, 0, isWarm),
  };
}

function inspectCorner(base, bracket, cfg) {
  const o = np(base.width, base.height);
  compScaled(o, base, cfg.coolCorners.tl.dx, cfg.coolCorners.tl.dy, cfg.frameScale);
  compScaled(o, bracket, cfg.brackets.tl.dx, cfg.brackets.tl.dy, cfg.bracketScale);
  return o;
}

// Assemble the frame from separate corner-base, straight-edge, and bracket layers,
// matching the editor: `frame` is cool corner pixels + straight edges; `bracket`
// is the warm gold decoration. Both layers expose scope, nudge, and scale controls.
function buildFrameParts(baseCorner, bracketCorner, edge, fill, cfg, W, H, flipSides = false, noFill = false) {
  const cw = baseCorner.width, ch = baseCorner.height;
  const o = np(W, H);
  if (!noFill) tile(o, fill, 0, 0, W, H);

  // INVARIANT: every mirror/rotation happens AFTER scaling, from ONE scaled source
  // per atom. Floor-sampled nearest-neighbour scaling does not commute with
  // mirroring, so scaling pre-flipped art makes the four corners (and the four
  // pipes) drift out of mirror symmetry by 1px at non-integer scales — the
  // "inconsistently scaled frame" defect that had to be hand-nudged away per corner.
  const topEdge = scalePng(edge, cfg.frameScale);
  const eB = flipV(topEdge);
  const r = rot90(topEdge);
  const eR = flipSides ? flipH(r) : r;
  const eL = flipSides ? r : flipH(r);
  // Pipes are an underlay, drawn once at their scaled thickness. At scale 1 they
  // span corner-to-corner (keeps every scale-1 bake byte-stable). At scale > 1 they
  // span the FULL side: the scaled corners sit on top, so a nudged corner can never
  // expose an empty seam behind its arms — the line simply continues underneath.
  const px0 = cfg.frameScale > 1 ? 0 : cw;
  const py0 = cfg.frameScale > 1 ? 0 : ch;
  tile(o, topEdge, px0, cfg.pipes.top, W - px0, cfg.pipes.top + topEdge.height);
  tile(o, eB, px0, H - eB.height - cfg.pipes.bottom, W - px0, H - cfg.pipes.bottom);
  tile(o, eL, cfg.pipes.left, py0, cfg.pipes.left + eL.width, H - py0);
  tile(o, eR, W - eR.width - cfg.pipes.right, py0, W - cfg.pipes.right, H - py0);

  // Each corner is clipped to its own quadrant, so scaling a corner past the half-way
  // point (frameScale > frame/(2·corner)) lets it fill its side up to the midline and
  // meet the opposite corner seamlessly, instead of overlapping into it. Below that
  // point the corner is smaller than its quadrant, so the clip is a no-op (scale ≤ 1.5
  // bakes are byte-identical). This is what lets the frame keep getting thicker with
  // no wall — the footprint stays fixed, only the rail grows.
  const midX = Math.ceil(W / 2), midY = Math.ceil(H / 2);
  const corner = (img, scale, corners) => {
    const s = scalePng(img, scale);
    const dw = s.width, dh = s.height;
    compRect(o, s, corners.tl.dx, corners.tl.dy, 0, 0, midX, midY);
    compRect(o, flipH(s), W - dw - corners.tr.dx, corners.tr.dy, midX, 0, W, midY);
    compRect(o, flipV(s), corners.bl.dx, H - dh - corners.bl.dy, 0, midY, midX, H);
    compRect(o, flipH(flipV(s)), W - dw - corners.br.dx, H - dh - corners.br.dy, midX, midY, W, H);
  };
  corner(baseCorner, cfg.frameScale, cfg.coolCorners);
  corner(bracketCorner, cfg.bracketScale, cfg.brackets);
  return o;
}
// ── Rail-junction family + the section divider ("bar") ────────────────────────────
// The frame's `corner` atom IS the full junction treatment (steel rail turning + notch +
// gold bracket) for ONE concave angle. Higher-order junctions are just that atom MIRRORED
// into each concave angle they contain, sharing the through-rails — so a 3-way tee and a
// 4-way cross are DERIVED from the corner atom and match the frame corners by construction
// (same rail, same notch, same gold; no forged/hand-painted junction atom to drift). It is
// ADR-0012's one-corner-mirrored, generalized from a box (4 convex corners) to interior
// junctions:  corner = 2-way (exists) · tee = 3-way (2 concave angles) · cross = 4-way (4).
const JX_OVER = 3; // the 2px shared-rail region where two mirrored corners coincide

// Left tee (├): the side rail runs straight down; the branch leaves to the RIGHT. The upper
// concave angle is a bottom-left corner (flipV), the lower a top-left corner (as-is); their
// horizontal rails coincide as the single branch, their left rails as the through side-rail.
export function composeTee(corner) {
  const CW = corner.width, CH = corner.height;
  const o = np(CW, 2 * CH - JX_OVER);
  comp(o, flipV(corner), 0, 0);           // upper angle — gold opens up-right
  comp(o, corner, 0, CH - JX_OVER);        // lower angle — gold opens down-right
  return o;
}
// 4-way cross (+): a frame corner in every quadrant, all four sharing the crossed rails.
export function composeCross(corner) {
  const CW = corner.width, CH = corner.height;
  const W = 2 * CW - JX_OVER, H = 2 * CH - JX_OVER;
  const o = np(W, H);
  comp(o, flipH(flipV(corner)), 0, 0);     // NW quadrant
  comp(o, flipV(corner), W - CW, 0);        // NE quadrant
  comp(o, flipH(corner), 0, H - CH);        // SW quadrant
  comp(o, corner, W - CW, H - CH);          // SE quadrant
  return o;
}

// The section divider: a horizontal branch rail carrying a full THREE-WAY CORNER (composeTee)
// at each end, so it tees into the panel's side rail exactly as a frame corner reads — just
// branched. Sliced with a horizontal 1-D border-image (`0 capW 0 capW fill`, the 90°-rotate
// of the scrollbar's vertical 1-D slice); capW = tee width = corner width = barCapWidth().
export function buildBar(edgeAtom, cornerAtom, W) {
  const tee = composeTee(cornerAtom);
  const cap = tee.width;                        // = corner width
  const branchY = cornerAtom.height - JX_OVER;  // the shared branch-rail band (matches the tee)
  const o = np(W, tee.height);
  tile(o, edgeAtom, 0, branchY, W, branchY + edgeAtom.height); // branch rail, full width
  comp(o, tee, 0, 0);                            // left tee (├)
  comp(o, flipH(tee), W - cap, 0);                // right tee (┤)
  return o;
}

// The branch row of an AUTHORED tee atom = the centre of its widest opaque run (the horizontal
// branch arm is wider than the vertical spine), so the steel rail can be seated on it.
function teeBranchRow(tee) {
  const { width: w, height: h, data } = tee;
  let mw = 0; const rowW = new Array(h).fill(0);
  for (let y = 0; y < h; y++) { let a = -1, b = -1; for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 40) { if (a < 0) a = x; b = x; } rowW[y] = a < 0 ? 0 : b - a + 1; if (rowW[y] > mw) mw = rowW[y]; }
  let sum = 0, n = 0; for (let y = 0; y < h; y++) if (rowW[y] >= mw - 1) { sum += y; n++; }
  return n ? Math.round(sum / n) : Math.floor(h / 2);
}

// Nearest-neighbour scale (the same sampling a canvas drawImage with imageSmoothingEnabled=false
// does) — used to grow the tee to the divider viewer's "Junction size" without softening it.
function scaleNearest(src, factor) {
  if (factor === 1) return src;
  const w = Math.max(1, Math.round(src.width * factor)), h = Math.max(1, Math.round(src.height * factor));
  const o = np(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(src.width - 1, Math.floor(x * src.width / w)), sy = Math.min(src.height - 1, Math.floor(y * src.height / h));
    const si = (sy * src.width + sx) * 4, di = (y * w + x) * 4;
    o.data[di] = src.data[si]; o.data[di + 1] = src.data[si + 1]; o.data[di + 2] = src.data[si + 2]; o.data[di + 3] = src.data[si + 3];
  }
  return o;
}

// The section divider using an AUTHORED tee atom (corner-t.png) as the cap, instead of the
// composeTee derivation. The tee is used AS DRAWN — mirrored for the right cap — and the steel
// branch rail (edge atom) is tiled full-width, on the tee's branch row so the rail runs through the
// junction. `scale` grows the TEE only (the divider viewer's "Junction size"; the rail is not
// scaled); `jy` nudges the gold that many px below the rail (the viewer's "Align ↕"). These come
// from the asset's config (config/nine-slice/panel-divider.json), so the shipped bar equals what
// was hand-tuned in the viewer. Height = the scaled tee's height (+jy) so the consumer renders 1:1.
export function buildBarFromTee(edgeAtom, teeAtom, W, scale = 1, jy = 0) {
  const tee = scaleNearest(teeAtom, scale);
  const cap = tee.width;
  const teeY = Math.max(0, jy), railBelow = Math.max(0, -jy);
  const H = tee.height + Math.abs(jy);
  const o = np(W, H);
  const railY = Math.round(teeBranchRow(tee) + railBelow - edgeAtom.height / 2); // gold sits jy below the rail
  tile(o, edgeAtom, 0, railY, W, railY + edgeAtom.height); // branch rail, full width, on the branch
  comp(o, tee, 0, teeY);                                    // left cap (spine on the left rail)
  comp(o, flipH(tee), W - cap, teeY);                      // right cap (mirrored)
  return o;
}

// Carve navy bleed outside the rail back to transparent: flood from the canvas
// edges across dark navy, stopping at the brighter rail (which encloses the
// interior, so interior navy is untouched). Ported from generate-row.
const RAIL_MIN = 45; // max-channel >= this is rail; below is navy/fill (carveable)
function carveExterior(png) {
  const { width: w, height: h, data } = png;
  const i4 = (x, y) => (y * w + x) * 4;
  const isNavy = (x, y) => { const i = i4(x, y); return data[i + 3] > 20 && Math.max(data[i], data[i + 1], data[i + 2]) < RAIL_MIN; };
  const seen = new Uint8Array(w * h); const stack = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const p = y * w + x; if (seen[p]) return; seen[p] = 1; stack.push(x, y); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const y = stack.pop(); const x = stack.pop();
    if (!isNavy(x, y)) continue;
    data[i4(x, y) + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return png;
}

export function swapPalette(src, map) {
  const o = new PNG({ width: src.width, height: src.height }); src.data.copy(o.data);
  for (let i = 0; i < o.data.length; i += 4) {
    if (o.data[i + 3] === 0) continue;
    const t = map[hex(o.data[i], o.data[i + 1], o.data[i + 2])];
    if (t) { o.data[i] = parseInt(t.slice(0, 2), 16); o.data[i + 1] = parseInt(t.slice(2, 4), 16); o.data[i + 2] = parseInt(t.slice(4, 6), 16); }
  }
  return o;
}

export const SAVE_LOG = `${CONFIG_DIR}save-log.jsonl`;

// Append-only audit trail of every bake, so a save is detectable on the filesystem
// (not just in the browser). Each line: when, where it came from, the asset, the
// exact config written, and the output files. Read SAVE_LOG to see what changed.
export function logSave(source, asset, cfg, written) {
  const entry = { ts: new Date().toISOString(), source, asset, config: cfg, written };
  try { mkdirSync(CONFIG_DIR, { recursive: true }); appendFileSync(SAVE_LOG, `${JSON.stringify(entry)}\n`); } catch { /* logging must never break a bake */ }
  return entry;
}

export function normalizeConfig(c) {
  // Returns the CANONICAL shape (see file header): per-element absolutes. A legacy
  // config (global+residual fields) folds in transparently; a canonical config
  // passes through. Mixing is resolved per element group: canonical field wins.
  // Scale is clamped to [1,4] and rounded to 2 decimals — the SAME quantization the
  // editor applies (NineSliceEditor roundedScale), so a hand-edited high-precision
  // scale bakes exactly what the editor previews, not one Math.round(w*scale) off.
  const scale = (v, fb) => (Number.isFinite(v) ? Math.max(1, Math.min(4, Math.round(Number(v) * 100) / 100)) : fb);
  return {
    asset: c.asset,
    coolCorners: c.coolCorners ? foldCorners(undefined, c.coolCorners) : foldCorners(c.keyline, c.frameCorners),
    pipes: c.pipes ? {
      top: n0(c.pipes.top), bottom: n0(c.pipes.bottom), left: n0(c.pipes.left), right: n0(c.pipes.right),
    } : {
      top: n0(c.edge?.dy) + n0(c.edgeSides?.top?.dy),
      bottom: n0(c.edge?.dy) + n0(c.edgeSides?.bottom?.dy),
      left: n0(c.edge?.dx) + n0(c.edgeSides?.left?.dx),
      right: n0(c.edge?.dx) + n0(c.edgeSides?.right?.dx),
    },
    frameScale: scale(c.frameScale ?? c.edgeScale, DEFAULT_FRAME_SCALE),
    brackets: c.brackets ? foldCorners(undefined, c.brackets) : foldCorners(c.bracket, c.bracketCorners),
    bracketScale: scale(c.bracketScale, DEFAULT_BRACKET_SCALE),
    // 0 = no content inset. MUST stay in sync with NineSliceEditor's DEFAULT_CONTENT
    // (src/ui/NineSliceEditor.tsx) so an unsaved asset previews what it would bake.
    content: c.content ?? 0,
    // `fill` = uniform inset (px) from the footprint to the FILL boundary: where a surface
    // painted behind this frame should stop. The frame's ornament can bleed OUTSIDE this box
    // (corners extend out to feel alive), so the fill boundary is distinct from the footprint.
    // Consumption-side like `content` (not baked into the PNG); 0 = fill to the footprint edge.
    fill: c.fill ?? 0,
  };
}
// Ceiling on frameScale: a corner may grow until it fills its whole SIDE (frame /
// corner), where — clipped to its quadrant — it meets the opposite corner exactly at
// the midline. (The old ceiling was frame/(2·corner), the point where corners first
// touch; quadrant clipping lets them keep going cleanly past that, so the rail keeps
// thickening.) Beyond frame/corner the corner's solid bend would cross the midline and
// clip visibly, so that's the wall.
function maxFrameScaleForAsset(assetId) {
  const rec = REGISTRY[assetId];
  if (!rec) return 4;
  const corner = loadAtom(rec.atoms.corner);
  return Math.max(1, Math.min(4, rec.frame.w / corner.width, rec.frame.h / corner.height));
}
export function normalizeConfigForAsset(assetId, c) {
  // `bar` (divider) and `junction` (tee/cross) assets are composed straight from atoms with no
  // per-corner/pipe geometry, so they skip the frame normalizer entirely (it would load offsets
  // and a corner-scale they don't have).
  const kind = REGISTRY[assetId]?.kind;
  if (kind === 'junction') return { asset: assetId };
  // A `bar` carries only the divider's hand-tuned junction size + vertical nudge (from the viewer).
  if (kind === 'bar') return { asset: assetId, scale: Number.isFinite(c.scale) ? c.scale : 1, jy: Number.isFinite(c.jy) ? c.jy : 0 };
  const cfg = normalizeConfig({ ...c, asset: assetId });
  cfg.frameScale = Math.min(cfg.frameScale, maxFrameScaleForAsset(assetId));
  return cfg;
}
// A "theme" (registry `theme` key) is a FAMILY of frames that share ONE shape. The
// shared shaping (cool corners, pipes, scales, brackets) lives in a single file,
// config/nine-slice/themes/<theme>.json; each member's own file carries only its
// consumption-side boxes (content / fill). So the family cannot drift — there is one
// source for the shape, consumed identically by every member.
export const THEME_DIR = `${CONFIG_DIR}themes/`;
const SHAPE_FIELDS = ['coolCorners', 'pipes', 'frameScale', 'brackets', 'bracketScale'];
function pickShape(obj) { const o = {}; for (const k of SHAPE_FIELDS) if (obj && obj[k] !== undefined) o[k] = obj[k]; return o; }
export function themeOf(assetId) { return REGISTRY[assetId]?.theme ?? null; }
export function assetsInTheme(theme) { return Object.keys(REGISTRY).filter((id) => REGISTRY[id].theme === theme); }
export function loadTheme(theme) { try { return JSON.parse(readFileSync(`${THEME_DIR}${theme}.json`, 'utf8')); } catch { return {}; } }
export function saveTheme(theme, shape) {
  mkdirSync(THEME_DIR, { recursive: true });
  writeFileSync(`${THEME_DIR}${theme}.json`, `${JSON.stringify({ theme, ...normalizeShape(shape) }, null, 2)}\n`);
}
// Normalize just the shape half of a config (what a theme file stores), reusing the
// full normalizer so a theme file is always the canonical shape.
function normalizeShape(shape) { return pickShape(normalizeConfig({ ...shape, asset: '_theme' })); }
export function loadConfig(assetId) {
  // Composed-from-atoms assets carry no tunable frame geometry; a `junction` is fully determined,
  // a `bar` carries only the divider's hand-tuned junction size + nudge (read from its config file).
  const kind = REGISTRY[assetId]?.kind;
  if (kind === 'junction') return { asset: assetId };
  if (kind === 'bar') {
    try { return normalizeConfigForAsset(assetId, JSON.parse(readFileSync(`${CONFIG_DIR}${assetId}.json`, 'utf8'))); }
    catch { return { asset: assetId, scale: 1, jy: 0 }; }
  }
  const raw = JSON.parse(readFileSync(`${CONFIG_DIR}${assetId}.json`, 'utf8'));
  const theme = themeOf(assetId);
  // Themed assets: shaping ONLY from the theme file, boxes ONLY from the asset file
  // (strict — a member cannot override the family shape). Un-themed assets keep their
  // self-contained config.
  const composed = theme
    ? { asset: assetId, ...pickShape(loadTheme(theme)), content: raw.content ?? 0, fill: raw.fill ?? 0 }
    : raw;
  return normalizeConfigForAsset(assetId, composed);
}

// Bake an asset to in-memory PNGs WITHOUT writing — the pure core shared by
// buildAsset (which writes) and the bake parity test (which compares the result
// against the committed PNGs), so the writer and the test can never disagree about
// what a config bakes to. Returns { variants:[{out, png, inspect, inspectPng}], warns, note }.
// Bake a `bar` (divider) asset: the horizontal-rail primitive (buildBar), one output per
// variant with its optional palette swap. Bars carry no corner/pipe geometry, so this is a
// self-contained path that never touches the frame normalizer or the corner atom.
function bakeBar(assetId, rec, cfg = {}) {
  const edge = loadAtom(rec.atoms.edge);
  const { w } = rec.frame;                   // width; height follows the (scaled) tee
  const scale = Number.isFinite(cfg.scale) ? cfg.scale : 1, jy = Number.isFinite(cfg.jy) ? cfg.jy : 0;
  // Prefer an AUTHORED tee atom (used as drawn) over deriving one from the corner (composeTee).
  const teeAtom = rec.atoms.tee ? loadAtom(rec.atoms.tee) : null;
  const corner = teeAtom ? null : loadAtom(rec.atoms.corner);
  const variants = rec.variants.map((v) => {
    const e = v.swap ? swapPalette(edge, v.swap) : edge;
    if (teeAtom) {
      const t = v.swap ? swapPalette(teeAtom, v.swap) : teeAtom;
      return { out: v.out, png: buildBarFromTee(e, t, w, scale, jy), inspect: null, inspectPng: null };
    }
    const c = v.swap ? swapPalette(corner, v.swap) : corner;
    return { out: v.out, png: buildBar(e, c, w), inspect: null, inspectPng: null };
  });
  const cap = teeAtom ? Math.round(teeAtom.width * scale) : corner.width;
  return { variants, warns: [], note: `bar · ${teeAtom ? `authored tee ×${scale}` : 'derived corner'} · cap ${cap}px` };
}
// A `junction` asset bakes a single derived rail-junction PNG — tee (3-way) or cross (4-way) —
// from the frame's corner atom (composeTee / composeCross), keyed by its `sides` string.
function bakeJunction(assetId, rec) {
  const corner = loadAtom(rec.atoms.corner);
  const compose = rec.sides === 'NSEW' ? composeCross : composeTee;
  const variants = rec.variants.map((v) => {
    const c = v.swap ? swapPalette(corner, v.swap) : corner;
    return { out: v.out, png: compose(c), inspect: null, inspectPng: null };
  });
  return { variants, warns: [], note: `junction ${rec.sides} · derived from corner` };
}
// Cap-slice width (px) a `bar` asset's horizontal border-image uses — the full-corner tee
// width = corner width. One number the consumer CSS and the editor read so they can't disagree.
export function barCapWidth(assetId) {
  const rec = REGISTRY[assetId];
  if (!rec || rec.kind !== 'bar') return 0;
  const w = loadAtom(rec.atoms.tee || rec.atoms.corner).width;
  const scale = loadConfig(assetId)?.scale ?? 1; // the cap grows with the tuned junction size
  return Math.round(w * scale);
}

export function bakeAsset(assetId, cfgRaw) {
  const rec = REGISTRY[assetId];
  if (!rec) throw new Error(`nine-slice-kit: unknown asset "${assetId}" (known: ${Object.keys(REGISTRY).join(', ')})`);
  if (rec.kind === 'bar') return bakeBar(assetId, rec, normalizeConfigForAsset(assetId, cfgRaw));
  if (rec.kind === 'junction') return bakeJunction(assetId, rec);
  const cfg = normalizeConfigForAsset(assetId, cfgRaw);
  const { base, bracket } = splitCorner(loadAtom(rec.atoms.corner));
  const edge = loadAtom(rec.atoms.edge), fill = loadAtom(rec.atoms.fill);
  const { w, h } = rec.frame;
  const warns = [];
  const variants = rec.variants.map((v) => {
    // A variant's palette swap recolors the WHOLE frame (corner + edge + fill), so an
    // active/selected state can change the body + borders, not just the corner accent.
    const b = v.swap ? swapPalette(base, v.swap) : base;
    const br = v.swap ? swapPalette(bracket, v.swap) : bracket;
    const e = v.swap ? swapPalette(edge, v.swap) : edge;
    const fl = v.swap ? swapPalette(fill, v.swap) : fill;
    const frame = buildFrameParts(b, br, e, fl, cfg, w, h, !!rec.flipSides);
    if (rec.carve) carveExterior(frame);
    return { out: v.out, png: frame, inspect: v.inspect ?? null, inspectPng: v.inspect ? inspectCorner(b, br, cfg) : null };
  });
  const note = cfg.content ? `content ${cfg.content}px → ${rec.consume ? rec.consume.cssVar + ' (CSS)' : 'consumption-side'}` : null;
  return { variants, warns, note };
}

// Bake one asset from its config and WRITE the variant PNGs (and any inspection
// atom). Returns { written, warns, note } for the caller to report.
export function buildAsset(assetId, cfgRaw) {
  const { variants, warns, note } = bakeAsset(assetId, cfgRaw);
  const written = [];
  for (const v of variants) {
    writeFileSync(`${KIT}${v.out}`, PNG.sync.write(v.png));
    written.push(v.out);
    if (v.inspectPng) writeFileSync(`${ATOMS}${v.inspect}.png`, PNG.sync.write(v.inspectPng));
  }
  // Frames flagged with a `line` output also get their transparent-interior twin baked, so the
  // line variant can never drift from the filled frame (same atoms, same corner tune).
  const rec = REGISTRY[assetId];
  if (rec && rec.line) {
    writeFileSync(`${LINE_DIR}${rec.line}`, PNG.sync.write(bakeLine(assetId)));
    written.push(`explore/frames/${rec.line}`);
  }
  // Semantic-accent twins of the line frame — one per tone, same atoms + corner tune, so they
  // can never drift from the neutral twin (the parity test re-bakes each and pins it).
  for (const t of (rec?.lineTones ?? [])) {
    writeFileSync(`${LINE_DIR}${t.out}`, PNG.sync.write(bakeLine(assetId, t.swap)));
    written.push(`explore/frames/${t.out}`);
  }
  return { written, warns, note };
}

// Rebake EVERY member of a theme from its on-disk config (which now resolves the
// shared shape) — the family stays in lockstep because they all read the one theme
// file. Used by the dev-save endpoint after writing the theme shape.
export function buildFamily(theme) {
  const written = [];
  for (const id of assetsInTheme(theme)) written.push(...buildAsset(id, loadConfig(id)).written);
  return written;
}

// Bake an ornament-only (transparent-interior) variant of an asset's frame: the SAME
// tuned corner + edge atoms, but a fully transparent fill, and every remaining dark
// (navy) pixel masked back to transparent so only the bright rail/ornament survives.
// A surface painted behind the element then shows straight through the 9-slice instead
// of the baked navy fill. This is the GENERAL fix for the "navy ring" 9-slice fill
// problem (cf. the hand-made panel-line.png): dropping border-image `fill` alone is not
// enough because the 8 edge slices still carry the fill colour inward.
export function bakeLine(assetId, swap) {
  const rec = REGISTRY[assetId];
  if (!rec) throw new Error(`nine-slice-kit: unknown asset "${assetId}" (known: ${Object.keys(REGISTRY).join(', ')})`);
  let cfg; try { cfg = loadConfig(assetId); } catch { cfg = normalizeConfigForAsset(assetId, { asset: assetId }); }
  let { base, bracket } = splitCorner(loadAtom(rec.atoms.corner));
  let edge = loadAtom(rec.atoms.edge);
  // A tone twin (lineTones) recolours the ornament to a semantic accent — the same whole-frame
  // palette swap a filled variant uses. The tone palettes remap only the warm gold bracket ramp,
  // so the cool steel rail is left alone: every tone shares one frame, differing at the corners.
  if (swap) { base = swapPalette(base, swap); bracket = swapPalette(bracket, swap); edge = swapPalette(edge, swap); }
  const fillAtom = loadAtom(rec.atoms.fill);
  // Assemble from the corner + edge atoms with a TRANSPARENT fill. The navy interior lives
  // ENTIRELY in the fill atom, so this alone is the full ornament over a see-through center —
  // nothing to mask, nothing to carve. (Two cleanup passes were tried and rejected: a dark-pixel
  // MASK ate dark ornament down to a keyline; carveExterior ate a dark rail's outer bevel,
  // pulling the frame off the element edge so surface spilled outside it. A line frame must be
  // an ornament that reaches the element EDGE — corner brackets do; a continuous inset rail does
  // not, so a surfaced row uses the bracket frame, not its own rail. See ADR-0034 §D.)
  const clearFill = new PNG({ width: fillAtom.width, height: fillAtom.height }); clearFill.data.fill(0);
  const { w, h } = rec.frame;
  return buildFrameParts(base, bracket, edge, clearFill, cfg, w, h, !!rec.flipSides);
}

// Compare a freshly baked variant PNG to its committed file on disk, returning a
// plain serializable result so a (type-checked) test can assert bake parity without
// importing pngjs/fs/Buffer itself. Used by the nine-slice bake regression test.
export function diffCommitted(out, freshPng, dir = KIT) {
  const committed = PNG.sync.read(readFileSync(`${dir}${out}`));
  const sameSize = committed.width === freshPng.width && committed.height === freshPng.height;
  return {
    out,
    sameSize,
    samePixels: sameSize && Buffer.compare(committed.data, freshPng.data) === 0,
    committed: { w: committed.width, h: committed.height },
    fresh: { w: freshPng.width, h: freshPng.height },
  };
}

// Write the generated stylesheet that carries each asset's `content` into CSS as a
// custom property the consuming rule reads (e.g. .settings-tab padding). This is how
// `content` reaches the live element — same source of truth as the PNGs (the config).
// Aggregates ALL assets so the file is complete; called after any bake.
export function writeGeneratedCss() {
  const lines = [];
  for (const [id, rec] of Object.entries(REGISTRY)) {
    if (!rec.consume) continue;
    let cfg; try { cfg = loadConfig(id); } catch { continue; }
    lines.push(`  ${rec.consume.cssVar}: ${cfg.content}px; /* ${id} · ${rec.consume.selector} */`);
  }
  const css = `/* GENERATED by nine-slice-kit (apply-nine-slice / dev Save) — do not edit by hand.\n   Source of truth: config/nine-slice/<asset>.json */\n:root {\n${lines.join('\n')}\n}\n`;
  const dir = `${root}src/generated/`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}nine-slice.css`, css);
  return 'src/generated/nine-slice.css';
}
