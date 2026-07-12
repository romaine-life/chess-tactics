// Builds a diagnostic 1:1 family proof from already-admitted rail pixels.
// This composes source art without resizing or drawing any chrome artwork.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const repo = resolve(frontend, '..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const attemptId = args.id;
if (!attemptId) throw new Error('usage: node scripts/build-native-rail-review.mjs --id=<admitted-attempt-id> [--out=<path>]');

const sourceDir = resolve(frontend, `public/assets/ui/chrome-candidates/native-rails-v1/${attemptId}`);
const report = JSON.parse(readFileSync(resolve(sourceDir, 'report.json'), 'utf8'));
const horizontalRecord = report.accepted.find((entry) => entry.orientation === 'horizontal');
const verticalRecord = report.accepted.find((entry) => entry.orientation === 'vertical');
if (!horizontalRecord || !verticalRecord) throw new Error(`${attemptId}: review requires both orientations`);

const horizontal = PNG.sync.read(readFileSync(resolve(frontend, `public${horizontalRecord.src}`)));
const vertical = PNG.sync.read(readFileSync(resolve(frontend, `public${verticalRecord.src}`)));
const width = 640;
const height = 360;
const out = new PNG({ width, height });

function setPixel(x, y, rgba) {
  const index = (y * width + x) * 4;
  out.data[index] = rgba[0];
  out.data[index + 1] = rgba[1];
  out.data[index + 2] = rgba[2];
  out.data[index + 3] = rgba[3];
}

for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
  const checker = (Math.floor(x / 12) + Math.floor(y / 12)) % 2;
  setPixel(x, y, checker ? [12, 25, 34, 255] : [6, 17, 25, 255]);
}

function composite(source, dx, dy) {
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    const sourceIndex = (y * source.width + x) * 4;
    const alpha = source.data[sourceIndex + 3] / 255;
    if (!alpha) continue;
    const targetX = dx + x;
    const targetY = dy + y;
    if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) continue;
    const targetIndex = (targetY * width + targetX) * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      out.data[targetIndex + channel] = Math.round(source.data[sourceIndex + channel] * alpha + out.data[targetIndex + channel] * (1 - alpha));
    }
    out.data[targetIndex + 3] = 255;
  }
}

for (let x = 0; x < width; x += horizontal.width) {
  composite(horizontal, x, 0);
  composite(horizontal, x, height - horizontal.height);
}
for (let y = 0; y < height; y += vertical.height) {
  composite(vertical, 0, y);
  composite(vertical, width - vertical.width, y);
}

const outPath = resolve(frontend, args.out ?? `../docs/art/chrome-native-rails/v1/reviews/${attemptId}.png`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, PNG.sync.write(out));
console.log(`wrote ${outPath} at 1:1 from ${horizontal.width}x${horizontal.height} and ${vertical.width}x${vertical.height} members`);
