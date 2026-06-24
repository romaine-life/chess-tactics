// Tab 9-slices (active / inactive), EXTRACTED from settings-audio rail. The icon
// + label sit on the LEFT, so we lift the clean RIGHT edge cap + a clean middle
// column and mirror the cap for the (symmetric) left frame. Self-gated.
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyAsset } from './verify-kit-asset.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const gen = `${root}../docs/art/ui-screen-concepts/generated/`;
const outDir = `${root}public/assets/ui/kit/`;
mkdirSync(outDir, { recursive: true });

const TABS = {
  active: { src: 'settings-audio-concept-v1.png', Y0: 271, Y1: 360, CAP_X: 314, CAP_W: 20, MID_X: 285 },
  inactive: { src: 'settings-audio-concept-v1.png', Y0: 170, Y1: 253, CAP_X: 309, CAP_W: 20, MID_X: 285 },
};
const MID_W = 4;

function extract(cfg, scale) {
  const src = PNG.sync.read(readFileSync(`${gen}${cfg.src}`));
  const H = cfg.Y1 - cfg.Y0;
  const W = cfg.CAP_W + MID_W + cfg.CAP_W;
  const base = new PNG({ width: W, height: H });
  const col = (dx, sx) => {
    for (let y = 0; y < H; y += 1) {
      const si = ((cfg.Y0 + y) * src.width + sx) * 4; const di = (y * W + dx) * 4;
      base.data[di] = src.data[si]; base.data[di + 1] = src.data[si + 1];
      base.data[di + 2] = src.data[si + 2]; base.data[di + 3] = 255;
    }
  };
  for (let i = 0; i < cfg.CAP_W; i += 1) col(i, cfg.CAP_X + (cfg.CAP_W - 1 - i));   // left = mirror of right cap
  for (let i = 0; i < MID_W; i += 1) col(cfg.CAP_W + i, cfg.MID_X);                 // clean middle
  for (let i = 0; i < cfg.CAP_W; i += 1) col(cfg.CAP_W + MID_W + i, cfg.CAP_X + i); // right cap (real right edge)
  if (scale === 1) return base;
  const out = new PNG({ width: W * scale, height: H * scale });
  for (let y = 0; y < out.height; y += 1) for (let x = 0; x < out.width; x += 1) {
    const si = (((y / scale) | 0) * W + ((x / scale) | 0)) * 4; const di = (y * out.width + x) * 4;
    out.data[di] = base.data[si]; out.data[di + 1] = base.data[si + 1];
    out.data[di + 2] = base.data[si + 2]; out.data[di + 3] = base.data[si + 3];
  }
  return out;
}

for (const [name, cfg] of Object.entries(TABS)) {
  const png1 = extract(cfg, 1);
  verifyAsset(png1, { symmetric: true, label: `tab-${name}` });
  writeFileSync(`${outDir}tab-${name}.png`, PNG.sync.write(png1));
  writeFileSync(`${outDir}tab-${name}@2x.png`, PNG.sync.write(extract(cfg, 2)));
  console.log(`tab-${name}.png ${cfg.CAP_W * 2 + MID_W}x${cfg.Y1 - cfg.Y0}  (verified)`);
}
