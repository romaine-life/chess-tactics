// Build the settings "mode button" frame from the kit ATOMS — symmetric by
// construction, exactly like panel.png — replacing the old extracted (dirty,
// asymmetric) tab-active/tab-inactive crops.
//
//   mode-button.png         gold brackets   (inactive)
//   mode-button-active.png  cyan brackets   (active / selected)
//
// The cyan frame is a DELIBERATE palette swap of the corner atom's 4 gold ramp
// colours to a cyan ramp of matching luminance (shading reads identically; hue is
// the game's cyan). The navy structure colours are untouched. This is an indexed
// swap on a clean 7-colour atom — not a hue filter.
//
//   node scripts/generate-mode-button.mjs

import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildFrameFrom } from './assemble-frame.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const A = `${root}public/assets/ui/kit/atoms/`;
const OUT = `${root}public/assets/ui/kit/`;
const load = (f) => PNG.sync.read(readFileSync(`${A}${f}.png`));
const corner = load('corner'), edge = load('edge'), fill = load('fill');

// gold ramp -> cyan ramp (luminance-matched). Navy structure (#2f3a48, #414e61,
// #121c23) is intentionally left alone.
const GOLD2CYAN = {
  faefbb: 'd6f4ff', // highlight  lum 236 -> 236
  c79b55: '4fbdf0', // mid        lum 160 -> 162
  a7793d: '2f93dd', // shadow     lum 128 -> 126
  '5b4124': '14507f', // deep     lum  69 ->  68
};

const hex = (r, g, b) => `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

function swapPalette(src) {
  const o = new PNG({ width: src.width, height: src.height });
  src.data.copy(o.data);
  for (let i = 0; i < o.data.length; i += 4) {
    if (o.data[i + 3] === 0) continue;
    const t = GOLD2CYAN[hex(o.data[i], o.data[i + 1], o.data[i + 2])];
    if (t) {
      o.data[i] = parseInt(t.slice(0, 2), 16);
      o.data[i + 1] = parseInt(t.slice(2, 4), 16);
      o.data[i + 2] = parseInt(t.slice(4, 6), 16);
    }
  }
  return o;
}

const cyanCorner = swapPalette(corner);

const W = 72, H = 72; // 24px corners + tiled edges/centre; 9-slice at 24
writeFileSync(`${OUT}mode-button.png`, PNG.sync.write(buildFrameFrom(corner, edge, fill, W, H)));
writeFileSync(`${OUT}mode-button-active.png`, PNG.sync.write(buildFrameFrom(cyanCorner, edge, fill, W, H)));
writeFileSync(`${A}corner-cyan.png`, PNG.sync.write(cyanCorner)); // swapped atom, for inspection
console.log(`built mode-button.png + mode-button-active.png (${W}x${H}, 24px corners) from atoms`);
