// Standard GBA BIOS LZ77 (compression type 0x10). Returns {data:Buffer, compressedLen} or null.
export function lz77(rom, off) {
  if (rom[off] !== 0x10) return null;
  const size = rom[off + 1] | (rom[off + 2] << 8) | (rom[off + 3] << 16);
  if (size < 8 || size > (1 << 20)) return null;
  const out = Buffer.alloc(size);
  let op = 0, p = off + 4;
  while (op < size) {
    if (p >= rom.length) return null;
    let flags = rom[p++];
    for (let i = 0; i < 8 && op < size; i++) {
      if (flags & 0x80) {
        if (p + 1 >= rom.length) return null;
        const b0 = rom[p++], b1 = rom[p++];
        const len = (b0 >> 4) + 3;
        const disp = (((b0 & 0x0f) << 8) | b1) + 1;
        if (disp > op) return null; // back-reference before output start => not valid LZ77
        for (let k = 0; k < len && op < size; k++) { out[op] = out[op - disp]; op++; }
      } else {
        out[op++] = rom[p++];
      }
      flags = (flags << 1) & 0xff;
    }
  }
  return { data: out, compressedLen: p - off, size };
}
