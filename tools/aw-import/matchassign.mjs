import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { extractMaps } from './extract.mjs';
import { categoryOf } from './legend.mjs';

const TILE = 16;
const HC_NAMES = ['', 'Border Skirmish', 'Orange Dawn', "Andy's Time", 'Mountain Ops', 'Sea for All', 'POW Rescue', 'Test of Time', 'Liberation', 'Toy Box', 'Tanks!!!', 'Reclamation', 'T-Minus 15', 'Two-Week Test', 'Nature Walk', 'Neotanks!?', 'Factory Blues', 'Silo Scramble', 'Show Stopper', "Sensei's Return", 'Duty and Honor', 'A Mirror Darkly', 'Foul Play', 'Sea of Hope', "The Hunt's End", 'Sea Fortress', "Drake's Dilemma", 'Sinking Feeling', 'To The Rescue', 'Navy Vs Air', 'Rain of Fire', 'Danger x9', 'Great Sea Battle', 'Hot Pursuit', 'Final Front'];
const chapter = (hc) => hc <= 8 ? 'Orange Star' : hc <= 16 ? 'Blue Moon' : hc <= 24 ? 'Yellow Comet' : hc <= 32 ? 'Green Earth' : 'Black Hole';

const rom = fs.readFileSync(process.argv[2]);
const GBA = 0x08000000, toOff = (p) => (p >= GBA && p < 0x0a000000) ? (p - GBA) : null;
const byOff = new Map(extractMaps(rom).map((m) => [m.off, m]));
const isWater = (id) => id === 360 ? true : id >= 300 ? false : categoryOf(id) === 'water';
const romWater = (m) => { const s = new Set(); for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (isWater(m.grid[y * m.w + x])) s.add(`${x},${y}`); return s; };

const kept = [];
for (let i = 0x640000; i < 0x660000 - 16; i += 4) {
  if (rom.readUInt32LE(i) !== rom.readUInt32LE(i + 4)) continue;
  const off = toOff(rom.readUInt32LE(i)); if (off == null || !byOff.has(off)) continue;
  const m = byOff.get(off); let w = 0; for (const id of m.grid) if (isWater(id)) w++;
  if (w / (m.w * m.h) > 0.55) continue;
  kept.push({ off, w: m.w, h: m.h, water: romWater(m) });
}
function imgWater(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const cols = Math.floor(png.width / TILE), rows = Math.floor(png.height / TILE), s = new Set();
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    let blue = 0; for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const si = ((cy * TILE + y) * png.width + (cx * TILE + x)) * 4, r = png.data[si], g = png.data[si + 1], b = png.data[si + 2]; if (b > 90 && b > r + 25 && b > g + 5) blue++; }
    if (blue / (TILE * TILE) > 0.35) s.add(`${cx},${cy}`);
  }
  return { cols, rows, water: s };
}
const imgs = fs.readdirSync('AW2_hard').filter((x) => /^aw2hcm\d+\.png$/.test(x)).map((f) => ({ hc: +f.match(/aw2hcm(\d+)/)[1], ...imgWater(path.join('AW2_hard', f)) }));
const iou = (a, b) => { let n = 0; for (const k of a) if (b.has(k)) n++; const u = a.size + b.size - n; return u ? n / u : 0; };

// candidate pairs (same dims), greedy-assign by IoU desc
const pairs = [];
for (const k of kept) for (const im of imgs) if (im.cols === k.w && im.rows === k.h) pairs.push({ off: k.off, hc: im.hc, iou: iou(k.water, im.water) });
pairs.sort((a, b) => b.iou - a.iou);
const assigned = {}, usedHc = new Set(), usedOff = new Set();
for (const p of pairs) { if (usedOff.has(p.off) || usedHc.has(p.hc)) continue; assigned[p.off] = { hc: p.hc, iou: p.iou }; usedOff.add(p.off); usedHc.add(p.hc); }

const out = {};
for (const k of kept) {
  const a = assigned[k.off];
  const sameDim = imgs.filter((im) => im.cols === k.w && im.rows === k.h).length;
  const confident = a ? (sameDim === 1 || a.iou > 0.3) : false;
  out['0x' + k.off.toString(16)] = a ? { hc: a.hc, name: HC_NAMES[a.hc], chapter: chapter(a.hc), iou: +a.iou.toFixed(2), confident } : { hc: null };
}
fs.writeFileSync('hcmap.json', JSON.stringify(out, null, 0));
console.log('offset            HC  name                    chapter        iou   confident');
for (const [off, v] of Object.entries(out).sort((a, b) => (a[1].hc || 99) - (b[1].hc || 99)))
  console.log(`${off.padEnd(10)} HC${String(v.hc).padStart(2, '0')}  ${(v.name || '?').padEnd(22)} ${(v.chapter || '').padEnd(13)} ${String(v.iou).padEnd(5)} ${v.confident ? 'yes' : 'NO — verify'}`);
