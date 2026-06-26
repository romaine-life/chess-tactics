// Assemble the settings-row 9-slice from its atoms (ADR-0012): row-corner (forged
// via forge-atom, ADR-0013/0014) mirrored into four, with the rail edge + navy fill
// derived from that same corner so the rail tiles seamlessly.
//
// assemble-frame fills the WHOLE canvas with the navy fill, then lays the frame on
// top — which paints navy past the rail into the atoms' transparent exterior (the
// "blue bleed outside the border"). The atoms are correct; the canvas-fill is not.
// So after assembly we carve the exterior back to transparent: flood from the canvas
// edges across the dark navy, stopping at the (brighter) rail. The rail encloses the
// interior, so the interior navy is untouched.
import { buildFrameFrom } from './assemble-frame.mjs';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const A = `${root}public/assets/ui/kit/atoms/`;
const load = (f) => PNG.sync.read(readFileSync(`${A}${f}.png`));

const RAIL_MIN = 45; // max-channel >= this is rail; below is navy/fill (carveable)

function carveExterior(png) {
  const { width: w, height: h, data } = png;
  const i4 = (x, y) => (y * w + x) * 4;
  const isNavy = (x, y) => { const i = i4(x, y); return data[i + 3] > 20 && Math.max(data[i], data[i + 1], data[i + 2]) < RAIL_MIN; };
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const p = y * w + x; if (seen[p]) return; seen[p] = 1; stack.push(x, y); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const y = stack.pop(); const x = stack.pop();
    if (!isNavy(x, y)) continue;      // rail / already-clear → boundary, don't expand
    data[i4(x, y) + 3] = 0;           // carve exterior navy to transparent
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return png;
}

const frame = buildFrameFrom(load('row-corner'), load('row-edge'), load('row-fill'), 160, 112);
carveExterior(frame);
writeFileSync(`${root}public/assets/ui/kit/row.png`, PNG.sync.write(frame));
console.log('assembled + carved row.png 160x112 (exterior transparent, no bleed)');
