// Bake ornament-only (transparent-interior) variants of the kit 9-slice frames, so a
// surface painted behind an element shows through instead of the baked navy fill. These
// solve the "navy ring" 9-slice fill problem for the settings dressing room (buttons /
// rows / boxes). Output lands beside the hand-made panel-line.png.
//
//   node scripts/bake-line-frames.mjs
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bakeLine } from './nine-slice-kit.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}public/assets/ui/explore/frames/`;
mkdirSync(out, { recursive: true });

// `panel` and `mode-button` bake to byte-identical frames, and the committed (hand-made)
// panel-line.png already covers BOTH the settings boxes and the tab buttons. The only
// genuinely-distinct frame is the steel row, so that is the one line asset we ship here.
for (const [asset, file] of [['row', 'row-line.png']]) {
  writeFileSync(`${out}${file}`, PNG.sync.write(bakeLine(asset)));
  console.log(`wrote explore/frames/${file}`);
}
