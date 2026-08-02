import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Run card frames are generated on a flat near-black backdrop. The shipped
// standard/tactical/pestiferous frames keep that backdrop only as alpha-zeroed
// pixels, so the card reads as its own silhouette over the live scene. A frame
// that arrives fully opaque instead paints that backdrop, which shows up as a
// dark border around the card.
//
// This cuts the backdrop deterministically: flood the region reachable from the
// image border without crossing the frame body, then keep the frame body plus
// the RIM_PIXELS-wide dark outline it draws against the backdrop. Colour bytes
// are left untouched; only alpha is zeroed, matching the shipped frames.
//
// usage: node cut-card-frame-backdrop.mjs in.png out.png [--verify]
//        --verify only reports the mask against the input's existing alpha.

const BODY_LUMINANCE = 46; // steel/stone/cream frame body; backdrop plateaus near 20
const RIM_PIXELS = 2; // outline the frame draws against the backdrop
// The backdrop is the outer margin only (the drawn frames start within ~45px
// of the edge). Bounding the flood to that band keeps a gap in the frame's
// outer ring from draining the card's own dark interior.
const BACKDROP_BAND = 90;
const MAX_BACKDROP_SHARE = .25; // a cut larger than this is not a margin
const MIN_BACKDROP_SHARE = .03;

export function cardFrameBackdropMask(png) {
  const { width, height, data } = png;
  const count = width * height;
  const body = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const i = index * 4;
    body[index] = (data[i] + data[i + 1] + data[i + 2]) / 3 >= BODY_LUMINANCE ? 1 : 0;
  }

  // Everything the outside can reach without crossing the frame body.
  const outside = new Uint8Array(count);
  const stack = [];
  for (let x = 0; x < width; x += 1) stack.push(x, x + (height - 1) * width);
  for (let y = 0; y < height; y += 1) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const index = stack.pop();
    if (outside[index] || body[index]) continue;
    const x = index % width;
    const y = (index - x) / width;
    if (Math.min(x, y, width - 1 - x, height - 1 - y) >= BACKDROP_BAND) continue;
    outside[index] = 1;
    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - width);
    if (y < height - 1) stack.push(index + width);
  }

  // The frame's own outline sits just outside its body, so keep a thin rim.
  let rim = body;
  for (let pass = 0; pass < RIM_PIXELS; pass += 1) {
    const grown = new Uint8Array(count);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        grown[index] = rim[index]
          || (x > 0 && rim[index - 1]) || (x < width - 1 && rim[index + 1])
          || (y > 0 && rim[index - width]) || (y < height - 1 && rim[index + width])
          ? 1 : 0;
      }
    }
    rim = grown;
  }

  const backdrop = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) backdrop[index] = outside[index] && !rim[index] ? 1 : 0;
  return backdrop;
}

export function backdropCutReport(png, backdrop) {
  const { width, height } = png;
  let cut = 0;
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (backdrop[y * width + x]) { cut += 1; continue; }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  // A margin cut only ever removes a ring: nothing inside the kept silhouette.
  const inset = 60;
  let interior = 0;
  for (let y = minY + inset; y <= maxY - inset; y += 1) {
    for (let x = minX + inset; x <= maxX - inset; x += 1) if (backdrop[y * width + x]) interior += 1;
  }
  return { cut, share: cut / (width * height), kept: { minX, minY, maxX, maxY }, interior };
}

function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes('--verify');
  const [inPath, outPath] = args.filter((value) => !value.startsWith('--'));
  if (!inPath || (!outPath && !verifyOnly)) throw new Error('usage: cut-card-frame-backdrop.mjs in.png out.png [--verify]');
  const png = PNG.sync.read(readFileSync(inPath));
  const backdrop = cardFrameBackdropMask(png);
  const report = backdropCutReport(png, backdrop);
  const kept = report.kept;
  console.log(`${inPath} ${png.width}x${png.height}`);
  console.log(`  backdrop cut ${report.cut} px (${(report.share * 100).toFixed(1)}%)`);
  console.log(`  kept bbox ${kept.minX},${kept.minY} .. ${kept.maxX},${kept.maxY}`);

  if (verifyOnly) {
    let onlyMask = 0, onlyAlpha = 0;
    for (let index = 0; index < png.width * png.height; index += 1) {
      const transparent = png.data[index * 4 + 3] === 0;
      if (backdrop[index] && !transparent) onlyMask += 1;
      if (!backdrop[index] && transparent) onlyAlpha += 1;
    }
    console.log(`  vs existing alpha: mask-only ${onlyMask}, alpha-only ${onlyAlpha}`);
    return;
  }

  if (report.interior) throw new Error(`cut ${report.interior} px inside the frame silhouette; refusing to write`);
  if (report.share > MAX_BACKDROP_SHARE || report.share < MIN_BACKDROP_SHARE) {
    throw new Error(`backdrop share ${(report.share * 100).toFixed(1)}% is not a frame margin; refusing to write`);
  }
  for (let index = 0; index < png.width * png.height; index += 1) if (backdrop[index]) png.data[index * 4 + 3] = 0;
  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`  wrote ${outPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
