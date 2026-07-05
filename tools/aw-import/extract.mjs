import fs from 'fs';
import { lz77 } from './lz77.mjs';

// Extract every map from a ROM as {off,w,h,fmt,grid:Uint16Array (row-major)}.
export function extractMaps(rom) {
  const maps = [];
  for (let off = 0; off < rom.length - 4; off++) {
    if (rom[off] !== 0x10) continue;
    const size = rom[off + 1] | (rom[off + 2] << 8) | (rom[off + 3] << 16);
    if (size < 40 || size > 16384) continue;
    const r = lz77(rom, off);
    if (!r) continue;
    const d = r.data, dec = d.length;
    let w, h, tstart, fmt;
    if (dec >= 8 && (() => { w = d.readUInt16LE(0); h = d.readUInt16LE(2); return w >= 8 && w <= 60 && h >= 8 && h <= 60 && dec === 4 + 2 * w * h; })()) { tstart = 4; fmt = 'u16'; }
    else if ((() => { w = d[0]; h = d[1]; return w >= 8 && w <= 60 && h >= 8 && h <= 60 && dec === 2 + 2 * w * h; })()) { tstart = 2; fmt = 'u8'; }
    else continue;
    const grid = new Uint16Array(w * h);
    for (let i = 0; i < w * h; i++) grid[i] = d.readUInt16LE(tstart + i * 2);
    maps.push({ off, w, h, fmt, grid });
  }
  return maps;
}
