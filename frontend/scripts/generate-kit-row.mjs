// Row 9-slice, extracted from settings-audio-concept-v1.png by lifting only
// clean regions: left cap (real corner brackets) + ONE verified-clean middle
// column (tiles with nothing to repeat-stamp) + right cap. No content, no
// repeating accents. Deterministic; re-run to regenerate.
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyAsset } from './verify-kit-asset.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcPath = `${root}../docs/art/ui-screen-concepts/generated/settings-audio-concept-v1.png`;
const outDir = `${root}public/assets/ui/kit/`;
mkdirSync(outDir, { recursive: true });
const src = PNG.sync.read(readFileSync(srcPath));

// MASTER AUDIO row frame band (verified clean of slider content).
// Measured at clean column x=870: top border y=211-212, bottom border y=292-293.
// Band must enclose BOTH borders (the previous y=210..290 clipped the bottom).
const Y0 = 208, Y1 = 296;           // frame top..bottom, both borders inside
const H = Y1 - Y0;                   // 88
const LCAP_X = 404, LCAP_W = 20;     // left brackets, before the speaker icon (~x434)
const RCAP_X = 1505, RCAP_W = 20;    // right brackets, past the ON toggle (~x1490)
const MIDCOL_X = 870, MID_W = 4;     // verified-clean column (between label and toggle)

function copyCol(dst, dx, sx, sy0, h) {
  for (let y = 0; y < h; y += 1) {
    const si = ((sy0 + y) * src.width + sx) * 4;
    const di = (y * dst.width + dx) * 4;
    dst.data[di] = src.data[si];
    dst.data[di + 1] = src.data[si + 1];
    dst.data[di + 2] = src.data[si + 2];
    dst.data[di + 3] = 255;
  }
}

function build(scale) {
  const W = LCAP_W + MID_W + RCAP_W;     // 44
  const base = new PNG({ width: W, height: H });
  for (let i = 0; i < LCAP_W; i += 1) copyCol(base, i, LCAP_X + i, Y0, H);
  for (let i = 0; i < MID_W; i += 1) copyCol(base, LCAP_W + i, MIDCOL_X, Y0, H);
  for (let i = 0; i < RCAP_W; i += 1) copyCol(base, LCAP_W + MID_W + i, RCAP_X + i, Y0, H);
  if (scale === 1) return base;
  const out = new PNG({ width: W * scale, height: H * scale });
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      const si = (((y / scale) | 0) * base.width + ((x / scale) | 0)) * 4;
      const di = (y * out.width + x) * 4;
      out.data[di] = base.data[si]; out.data[di + 1] = base.data[si + 1];
      out.data[di + 2] = base.data[si + 2]; out.data[di + 3] = base.data[si + 3];
    }
  }
  return out;
}

const row1 = build(1);
verifyAsset(row1, { label: 'row' }); // GATE: throws on clip/missing-border
writeFileSync(`${outDir}row.png`, PNG.sync.write(row1));
writeFileSync(`${outDir}row@2x.png`, PNG.sync.write(build(2)));
console.log('row.png', `${LCAP_W + MID_W + RCAP_W}x${H}`, '@2x', `${(LCAP_W + MID_W + RCAP_W) * 2}x${H * 2}  (verified)`);
