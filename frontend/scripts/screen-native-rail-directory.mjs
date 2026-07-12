// Screens isolated transparent candidates at their native pixels. Transparent
// canvas trim is allowed; resizing, clipping painted pixels, and seam repair are not.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const spec = JSON.parse(readFileSync(resolve(frontend, 'config/native-rail-generation.json'), 'utf8'));
const MAX_REPEAT_SEAM_DELTA = 18;
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

const role = args.role;
const provider = args.provider;
const sourceDirArg = args['source-dir'];
const sourceSheetArg = args['source-sheet'];
const attemptId = args.id;
const fit = args.fit ?? 'repeat';
if (!role || !provider || (!sourceDirArg && !sourceSheetArg) || (sourceDirArg && sourceSheetArg) || !attemptId) {
  throw new Error('usage: node scripts/screen-native-rail-directory.mjs --role=outer|inner --provider=<provider> --fit=repeat|long --id=<id> (--source-dir=<dir> | --source-sheet=<png>)');
}
if (fit !== 'repeat' && fit !== 'long') throw new Error(`unknown rail fit ${fit}`);
const target = spec.roles[role]?.thickness;
if (!target) throw new Error(`unknown rail role ${role}`);

function alphaBounds(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    if (png.data[(y * png.width + x) * 4 + 3] <= 24) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function crop(png, bounds) {
  const out = new PNG({ width: bounds.w, height: bounds.h });
  for (let y = 0; y < bounds.h; y += 1) for (let x = 0; x < bounds.w; x += 1) {
    const sourceIndex = ((bounds.y + y) * png.width + bounds.x + x) * 4;
    const outIndex = (y * out.width + x) * 4;
    png.data.copy(out.data, outIndex, sourceIndex, sourceIndex + 4);
  }
  return out;
}

function alphaComponents(png) {
  const seen = new Uint8Array(png.width * png.height);
  const components = [];
  const stack = [];
  const isPainted = (index) => png.data[index * 4 + 3] > 24;
  for (let start = 0; start < seen.length; start += 1) {
    if (seen[start] || !isPainted(start)) continue;
    let minX = png.width;
    let minY = png.height;
    let maxX = -1;
    let maxY = -1;
    let pixels = 0;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    while (stack.length) {
      const index = stack.pop();
      const x = index % png.width;
      const y = Math.floor(index / png.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixels += 1;
      if (x > 0) {
        const next = index - 1;
        if (!seen[next] && isPainted(next)) { seen[next] = 1; stack.push(next); }
      }
      if (x + 1 < png.width) {
        const next = index + 1;
        if (!seen[next] && isPainted(next)) { seen[next] = 1; stack.push(next); }
      }
      if (y > 0) {
        const next = index - png.width;
        if (!seen[next] && isPainted(next)) { seen[next] = 1; stack.push(next); }
      }
      if (y + 1 < png.height) {
        const next = index + png.width;
        if (!seen[next] && isPainted(next)) { seen[next] = 1; stack.push(next); }
      }
    }
    components.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, pixels });
  }
  return components.sort((a, b) => a.y - b.y || a.x - b.x);
}

function seamScore(png, horizontal) {
  const cross = horizontal ? png.height : png.width;
  const last = (horizontal ? png.width : png.height) - 1;
  let channelDelta = 0;
  let alphaMismatches = 0;
  let activeCrossSections = 0;
  for (let offset = 0; offset < cross; offset += 1) {
    const a = horizontal ? offset * png.width * 4 : offset * 4;
    const b = horizontal ? (offset * png.width + last) * 4 : (last * png.width + offset) * 4;
    if (png.data[a + 3] <= 24 && png.data[b + 3] <= 24) continue;
    activeCrossSections += 1;
    for (let channel = 0; channel < 4; channel += 1) channelDelta += Math.abs(png.data[a + channel] - png.data[b + channel]);
    if ((png.data[a + 3] > 24) !== (png.data[b + 3] > 24)) alphaMismatches += 1;
  }
  return { averageDelta: activeCrossSections ? channelDelta / (activeCrossSections * 4) : 0, alphaMismatches };
}

function emptyCrossSections(png, horizontal) {
  const longAxis = horizontal ? png.width : png.height;
  const shortAxis = horizontal ? png.height : png.width;
  let missing = 0;
  for (let position = 0; position < longAxis; position += 1) {
    let painted = false;
    for (let offset = 0; offset < shortAxis; offset += 1) {
      const x = horizontal ? position : offset;
      const y = horizontal ? offset : position;
      if (png.data[(y * png.width + x) * 4 + 3] > 24) {
        painted = true;
        break;
      }
    }
    if (!painted) missing += 1;
  }
  return missing;
}

let sourceRecords;
let sourceMetadata;
if (sourceDirArg) {
  const sourceDir = resolve(frontend, sourceDirArg);
  sourceRecords = readdirSync(sourceDir)
    .filter((file) => file.toLowerCase().endsWith('.png'))
    .sort()
    .map((file) => ({ file, png: PNG.sync.read(readFileSync(resolve(sourceDir, file))) }));
  sourceMetadata = { sourceDir: sourceDirArg.replaceAll('\\', '/') };
} else {
  const sourceSheet = PNG.sync.read(readFileSync(resolve(frontend, sourceSheetArg)));
  sourceRecords = alphaComponents(sourceSheet).map((bounds, index) => ({
    file: `component-${String(index + 1).padStart(2, '0')}@${bounds.x},${bounds.y},${bounds.w},${bounds.h}`,
    png: crop(sourceSheet, bounds),
    sourceBounds: bounds,
  }));
  sourceMetadata = { sourceSheet: sourceSheetArg.replaceAll('\\', '/'), extraction: 'transparent-components' };
}
const report = { id: attemptId, provider, role, fit, nativeThickness: target, ...sourceMetadata, accepted: [], rejected: [] };
const passing = [];
for (const sourceRecord of sourceRecords) {
  const { file, png, sourceBounds } = sourceRecord;
  const bounds = alphaBounds(png);
  if (!bounds) {
    report.rejected.push({ file, sourceBounds, reason: 'empty alpha' });
    continue;
  }
  const horizontal = bounds.w >= bounds.h;
  const thickness = horizontal ? bounds.h : bounds.w;
  if (thickness !== target) {
    report.rejected.push({ file, sourceBounds, bounds, reason: `painted thickness ${thickness}px, expected exactly ${target}px` });
    continue;
  }
  const candidate = crop(png, bounds);
  const missingCrossSections = emptyCrossSections(candidate, horizontal);
  if (missingCrossSections) {
    report.rejected.push({ file, sourceBounds, bounds, missingCrossSections, reason: 'empty cross-sections break rail continuity' });
    continue;
  }
  const seam = fit === 'repeat' ? seamScore(candidate, horizontal) : null;
  if (seam && (seam.alphaMismatches || seam.averageDelta > MAX_REPEAT_SEAM_DELTA)) {
    report.rejected.push({ file, sourceBounds, bounds, seam, reason: 'repeat seam failed' });
    continue;
  }
  const sourceName = basename(file, '.png').replace(/[^a-zA-Z0-9_-]/g, '-');
  const outputFile = `${String(passing.length + 1).padStart(2, '0')}-${horizontal ? 'horizontal' : 'vertical'}-${sourceName}.png`;
  const record = {
    file,
    sourceBounds,
    src: `/assets/ui/chrome-candidates/native-rails-v1/${attemptId}/${outputFile}`,
    orientation: horizontal ? 'horizontal' : 'vertical',
    width: candidate.width,
    height: candidate.height,
    seam,
  };
  report.accepted.push(record);
  passing.push({ ...record, png: candidate });
}

const outDir = resolve(frontend, `public/assets/ui/chrome-candidates/native-rails-v1/${attemptId}`);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!passing.length) {
  throw new Error(`${attemptId}: 0/${sourceRecords.length} candidates passed exact ${target}px native size and ${fit} contract; report written to ${resolve(outDir, 'report.json')}`);
}
for (let index = 0; index < passing.length; index += 1) {
  const candidate = passing[index];
  const path = resolve(frontend, `public${candidate.src}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(candidate.png));
}
console.log(`${attemptId}: admitted ${passing.length}/${sourceRecords.length} ${fit} candidates at untouched ${target}px native thickness`);
