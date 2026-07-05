import fs from 'fs';
import { lz77 } from './lz77.mjs';

const romPath = process.argv[2];
const rom = fs.readFileSync(romPath);

// Structural map detector. A decompressed block is a map if its header-encoded w,h
// exactly account for its size as a grid of u16 terrain values.
function asMap(data) {
  const dec = data.length;
  // Format A: u16 width, u16 height, then w*h u16 terrain values => dec == 4 + 2*w*h
  if (dec >= 8) {
    const w = data.readUInt16LE(0), h = data.readUInt16LE(2);
    if (w >= 8 && w <= 60 && h >= 8 && h <= 60 && dec === 4 + 2 * w * h)
      return { w, h, fmt: 'u16', tstart: 4 };
  }
  // Format B: u8 width, u8 height, then w*h u16 => dec == 2 + 2*w*h
  {
    const w = data[0], h = data[1];
    if (w >= 8 && w <= 60 && h >= 8 && h <= 60 && dec === 2 + 2 * w * h)
      return { w, h, fmt: 'u8', tstart: 2 };
  }
  return null;
}

const maps = [];
const valHist = {};
for (let off = 0; off < rom.length - 4; off++) {
  if (rom[off] !== 0x10) continue;
  const size = rom[off + 1] | (rom[off + 2] << 8) | (rom[off + 3] << 16);
  if (size < 40 || size > 16384) continue;
  const r = lz77(rom, off);
  if (!r) continue;
  const m = asMap(r.data);
  if (!m) continue;
  // terrain value histogram
  const vals = new Set();
  for (let i = m.tstart; i < r.data.length; i += 2) {
    const v = r.data.readUInt16LE(i);
    valHist[v] = (valHist[v] || 0) + 1;
    vals.add(v);
  }
  maps.push({ off, ...m, clen: r.compressedLen, distinct: vals.size, maxv: Math.max(...vals) });
}

console.log('MAPS FOUND:', maps.length, '  ROM:', romPath.split(/[\\/]/).pop());
const bySize = {};
maps.forEach((m) => { const k = `${m.w}x${m.h}`; bySize[k] = (bySize[k] || 0) + 1; });
console.log('by dimension:', Object.entries(bySize).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}:${c}`).join('  '));
console.log('--- maps (offset w x h fmt clen distinctVals maxVal) ---');
for (const m of maps) console.log('0x' + m.off.toString(16).padStart(6, '0'), `${m.w}x${m.h}`.padEnd(7), m.fmt, 'clen=' + m.clen, 'distinct=' + m.distinct, 'maxv=' + m.maxv);
console.log('--- terrain value histogram (value:count), sorted by value ---');
console.log(Object.entries(valHist).map(([v, c]) => [+v, c]).sort((a, b) => a[0] - b[0]).map(([v, c]) => `${v}:${c}`).join('  '));
