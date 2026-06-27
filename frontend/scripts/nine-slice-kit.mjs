// Shared kit for baking /nine-slice-editor configs into committed assets.
//
// One place defines, per asset: which atoms it uses, its frame size, and which
// output PNGs (incl. palette-swapped variants like the cyan active state). The
// apply CLI (apply-nine-slice.mjs) and the per-asset generators both go through
// buildAsset(), so there is a SINGLE bake implementation and the editor's offsets
// can't diverge between tools.
//
// What bakes into the PNG vs not:
//   - bracket offset  -> shifts the warm gold pixels in the corner atom (baked)
//   - keyline offset  -> shifts the cool keyline/navy pixels in the corner atom
//                        (baked into the corner; edge keyline not shifted — see warn)
//   - content         -> consumption-side (element padding / where text+icons
//                        start). NOT baked into the PNG; recorded in the config.
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildFrameFrom } from './assemble-frame.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const ATOMS = `${root}public/assets/ui/kit/atoms/`;
const KIT = `${root}public/assets/ui/kit/`;
export const CONFIG_DIR = `${root}config/nine-slice/`;

// gold ramp -> cyan ramp (luminance-matched). Navy structure is left alone.
export const GOLD2CYAN = {
  faefbb: 'd6f4ff', // highlight  lum 236 -> 236
  c79b55: '4fbdf0', // mid        lum 160 -> 162
  a7793d: '2f93dd', // shadow     lum 128 -> 126
  '5b4124': '14507f', // deep     lum  69 ->  68
};

// Per-asset recipe. `atoms` are names in kit/atoms; `out`/`inspect` are written to
// kit/ and kit/atoms respectively. Add an entry here to make a new asset bakeable.
export const REGISTRY = {
  'mode-button': {
    atoms: { corner: 'corner', edge: 'edge', fill: 'fill' },
    frame: { w: 72, h: 72 },
    // content -> the consuming element's inner padding, via a CSS var the bake writes.
    consume: { selector: '.settings-tab', cssVar: '--settings-tab-content' },
    variants: [
      { out: 'mode-button.png' },
      { out: 'mode-button-active.png', swap: GOLD2CYAN, inspect: 'corner-cyan' },
    ],
  },
  'panel': {
    // Settings frames (.settings-frame / .app-titlebar) — same gold-keyline kit
    // family as the tabs, assembled from the shared atoms; a per-asset config tunes
    // it independently of mode-button. Consumed at a 24px slice (24px corner atom).
    atoms: { corner: 'corner', edge: 'edge', fill: 'fill' },
    frame: { w: 72, h: 72 },
    variants: [{ out: 'panel.png' }],
  },
  'row': {
    atoms: { corner: 'row-corner', edge: 'row-edge', fill: 'row-fill' },
    frame: { w: 160, h: 112 },
    // assemble-frame fills the whole canvas navy then lays the frame on top, which
    // bleeds navy past the rail into the transparent exterior — carve it back.
    carve: true,
    variants: [{ out: 'row.png' }],
  },
};

const hex = (r, g, b) => `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
const isWarm = (r, g, b, a) => a > 40 && r > b + 15; // gold ramp is warm; keyline/navy are cool
const loadAtom = (n) => PNG.sync.read(readFileSync(`${ATOMS}${n}.png`));

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
function over(base, top) {
  const o = new PNG({ width: base.width, height: base.height }); base.data.copy(o.data);
  for (let i = 0; i < top.data.length; i += 4) if (top.data[i + 3] > 0) { o.data[i] = top.data[i]; o.data[i + 1] = top.data[i + 1]; o.data[i + 2] = top.data[i + 2]; o.data[i + 3] = top.data[i + 3]; }
  return o;
}
// Tune a corner: cool base shifted by keyline, warm gold shifted by bracket. The
// gold's vacated cells become transparent so the frame fill shows through — exactly
// what the editor preview does.
function tuneCorner(corner, cfg) {
  const base = layer(corner, cfg.keyline.dx, cfg.keyline.dy, (r, g, b, a) => a > 40 && !isWarm(r, g, b, a));
  const gold = layer(corner, cfg.bracket.dx, cfg.bracket.dy, isWarm);
  return over(base, gold);
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
  return {
    asset: c.asset,
    keyline: { dx: c.keyline?.dx ?? 0, dy: c.keyline?.dy ?? 0 },
    bracket: { dx: c.bracket?.dx ?? 0, dy: c.bracket?.dy ?? 0 },
    content: c.content ?? 0,
  };
}
export function loadConfig(assetId) {
  return normalizeConfig(JSON.parse(readFileSync(`${CONFIG_DIR}${assetId}.json`, 'utf8')));
}

// Bake one asset from its config. Returns { written, warns, note } for the caller
// to report. Writes the variant PNGs (and any inspection atom).
export function buildAsset(assetId, cfgRaw) {
  const rec = REGISTRY[assetId];
  if (!rec) throw new Error(`nine-slice-kit: unknown asset "${assetId}" (known: ${Object.keys(REGISTRY).join(', ')})`);
  const cfg = normalizeConfig({ ...cfgRaw, asset: assetId });
  const corner = tuneCorner(loadAtom(rec.atoms.corner), cfg);
  const edge = loadAtom(rec.atoms.edge), fill = loadAtom(rec.atoms.fill);
  const { w, h } = rec.frame;
  const written = [], warns = [];
  if (cfg.keyline.dx || cfg.keyline.dy) warns.push('keyline baked into the corner only — edge keyline not shifted; keep keyline at 0 or regenerate the edge atom');
  for (const v of rec.variants) {
    const c = v.swap ? swapPalette(corner, v.swap) : corner;
    const frame = buildFrameFrom(c, edge, fill, w, h);
    if (rec.carve) carveExterior(frame);
    writeFileSync(`${KIT}${v.out}`, PNG.sync.write(frame));
    written.push(v.out);
    if (v.inspect) writeFileSync(`${ATOMS}${v.inspect}.png`, PNG.sync.write(c));
  }
  const note = cfg.content ? `content ${cfg.content}px → ${rec.consume ? rec.consume.cssVar + ' (CSS)' : 'consumption-side'}` : null;
  return { written, warns, note };
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
