import fs from 'fs';
// Minimal BMP decoder: BITMAPINFOHEADER, 24-bit / 32-bit / 8-bit palettized, BI_RGB. Returns {width,height,data:RGBA}.
export function decodeBMP(pathOrBuf) {
  const b = Buffer.isBuffer(pathOrBuf) ? pathOrBuf : fs.readFileSync(pathOrBuf);
  if (b[0] !== 0x42 || b[1] !== 0x4d) throw new Error('not BMP');
  const pixOff = b.readUInt32LE(10);
  const headerSize = b.readUInt32LE(14);
  const width = b.readInt32LE(18);
  let height = b.readInt32LE(22);
  const bpp = b.readUInt16LE(28);
  const compression = b.readUInt32LE(30);
  if (compression !== 0) throw new Error('unsupported compression ' + compression);
  const bottomUp = height > 0; height = Math.abs(height);
  let palette = null;
  if (bpp <= 8) {
    const palOff = 14 + headerSize;
    const n = 1 << bpp;
    palette = [];
    for (let i = 0; i < n; i++) {
      const o = palOff + i * 4;
      palette.push([b[o + 2], b[o + 1], b[o]]); // stored BGRA -> RGB
    }
  }
  const rowBytes = Math.floor((bpp * width + 31) / 32) * 4;
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = bottomUp ? (height - 1 - y) : y;
    const rowOff = pixOff + srcY * rowBytes;
    for (let x = 0; x < width; x++) {
      let r, g, bl;
      if (bpp === 24) { const o = rowOff + x * 3; bl = b[o]; g = b[o + 1]; r = b[o + 2]; }
      else if (bpp === 32) { const o = rowOff + x * 4; bl = b[o]; g = b[o + 1]; r = b[o + 2]; }
      else if (bpp === 8) { const idx = b[rowOff + x]; [r, g, bl] = palette[idx]; }
      else if (bpp === 4) { const byte = b[rowOff + (x >> 1)]; const idx = (x & 1) ? (byte & 0xf) : (byte >> 4); [r, g, bl] = palette[idx]; }
      else throw new Error('unsupported bpp ' + bpp);
      const di = (y * width + x) * 4;
      out[di] = r; out[di + 1] = g; out[di + 2] = bl; out[di + 3] = 255;
    }
  }
  return { width, height, data: out, bpp };
}
