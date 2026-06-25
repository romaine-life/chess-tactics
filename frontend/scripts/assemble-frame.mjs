// Assemble a 9-slice frame from codex-painted ATOMS (corner / edge / fill).
// Corner is mirrored into all 4 corners, edge tiled (rotated for sides), fill
// tiled in the middle. Result is symmetric BY CONSTRUCTION — no extraction.
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const A = `${root}public/assets/ui/kit/atoms/`;
const load = (f) => PNG.sync.read(readFileSync(`${A}${f}.png`));
const corner = load('corner'), edge = load('edge'), fill = load('fill');
const CW = corner.width, CH = corner.height;

const id = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };
function np(w, h) { const o = new PNG({ width: w, height: h }); o.data.fill(0); return o; }
function map(img, fn) { const [w, h] = fn.dims(img); const o = np(w, h); for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const c = id(img, ...fn(img, x, y)); const i = (y * w + x) * 4; for (let k = 0; k < 4; k += 1) o.data[i + k] = c[k]; } return o; }
const flipH = (img) => map(img, Object.assign((m, x, y) => [m.width - 1 - x, y], { dims: (m) => [m.width, m.height] }));
const flipV = (img) => map(img, Object.assign((m, x, y) => [x, m.height - 1 - y], { dims: (m) => [m.width, m.height] }));
const rot90 = (img) => map(img, Object.assign((m, x, y) => [y, m.height - 1 - x], { dims: (m) => [m.height, m.width] }));
function comp(o, img, sx, sy) { for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) { const dx = sx + x, dy = sy + y; if (dx < 0 || dy < 0 || dx >= o.width || dy >= o.height) continue; const c = id(img, x, y); const a = c[3] / 255; const i = (dy * o.width + dx) * 4; o.data[i] = Math.round(c[0] * a + o.data[i] * (1 - a)); o.data[i + 1] = Math.round(c[1] * a + o.data[i + 1] * (1 - a)); o.data[i + 2] = Math.round(c[2] * a + o.data[i + 2] * (1 - a)); o.data[i + 3] = Math.max(o.data[i + 3], c[3]); } }
function tile(o, t, x0, y0, x1, y1) { for (let y = y0; y < y1; y += t.height) for (let x = x0; x < x1; x += t.width) comp(o, t, x, y); }

export function buildFrame(W, H) {
  const o = np(W, H);
  tile(o, fill, 0, 0, W, H);                                   // fill base
  const eL = rot90(edge), eR = flipH(eL), eB = flipV(edge);    // side/bottom edges from the one horizontal edge
  tile(o, edge, CW, 0, W - CW, edge.height);                   // top
  tile(o, eB, CW, H - edge.height, W - CW, H);                 // bottom
  tile(o, eL, 0, CH, eL.width, H - CH);                        // left
  tile(o, eR, W - eR.width, CH, W, H - CH);                    // right
  comp(o, corner, 0, 0);                                       // 4 mirrored corners
  comp(o, flipH(corner), W - CW, 0);
  comp(o, flipV(corner), 0, H - CH);
  comp(o, flipH(flipV(corner)), W - CW, H - CH);
  return o;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = `${root}public/assets/ui/kit/_gen/`;
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}panel.png`, PNG.sync.write(buildFrame(128, 128)));
  writeFileSync(`${out}row.png`, PNG.sync.write(buildFrame(140, 56)));
  console.log('assembled panel 128x128 and row 140x56 from atoms');
}
