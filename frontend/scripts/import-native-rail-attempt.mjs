// Admits generated rails by fixed 1:1 crop only. This script deliberately has no
// resize path: an attempt with the wrong canvas, lane, continuity, or seam fails.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
const sourceArg = args.source;
const attemptId = args.id;
if (!role || !provider || !sourceArg || !attemptId) {
  throw new Error('usage: node scripts/import-native-rail-attempt.mjs --role=outer|inner --provider=<configured template> --id=<id> --source=<alpha.png>');
}
const roleSpec = spec.roles[role];
const template = roleSpec?.templates?.[provider];
if (!template) throw new Error(`unknown role/provider ${role}/${provider}`);

const sourcePath = resolve(frontend, sourceArg);
const source = PNG.sync.read(readFileSync(sourcePath));
if (source.width !== template.width || source.height !== template.height) {
  throw new Error(`${attemptId}: source must remain ${template.width}x${template.height}; got ${source.width}x${source.height}. Resizing is prohibited.`);
}

function patternCells(pattern, thickness) {
  const candidateIndices = pattern.candidateIndices ? new Set(pattern.candidateIndices) : null;
  return Array.from({ length: pattern.count }, (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    const horizontal = pattern.orientation === 'horizontal';
    return {
      id: `${pattern.idPrefix ?? pattern.fit}-${pattern.orientation}-${number}`,
      fit: pattern.fit,
      edge: horizontal ? (index % 2 ? 'bottom' : 'top') : (index % 2 ? 'right' : 'left'),
      x: horizontal ? pattern.crossStart : pattern.start + index * pattern.pitch,
      y: horizontal ? pattern.start + index * pattern.pitch : pattern.crossStart,
      w: horizontal ? pattern.length : thickness,
      h: horizontal ? thickness : pattern.length,
      admit: candidateIndices ? candidateIndices.has(index) : true,
    };
  });
}

function templateCells(template, thickness) {
  if (template.cells) return template.cells;
  const patterns = template.patterns ?? (template.pattern ? [template.pattern] : []);
  if (!patterns.length) throw new Error('template must define cells, pattern, or patterns');
  return patterns.flatMap((pattern) => patternCells(pattern, thickness));
}

const cells = templateCells(template, roleSpec.thickness);
const admittedCells = cells.filter((cell) => cell.admit !== false);
if (!admittedCells.length) throw new Error(`${attemptId}: template has no admitted candidate lanes`);
const cellAt = new Int16Array(source.width * source.height);
cellAt.fill(-1);
for (let index = 0; index < cells.length; index += 1) {
  const cell = cells[index];
  const shortAxis = Math.min(cell.w, cell.h);
  if (shortAxis !== roleSpec.thickness) throw new Error(`${cell.id}: lane is ${shortAxis}px, expected ${roleSpec.thickness}px`);
  for (let y = cell.y; y < cell.y + cell.h; y += 1) for (let x = cell.x; x < cell.x + cell.w; x += 1) {
    const pixel = y * source.width + x;
    if (cellAt[pixel] !== -1) throw new Error(`${cell.id}: lane overlaps ${cells[cellAt[pixel]].id}`);
    cellAt[pixel] = index;
  }
}

let outsidePixels = 0;
for (let pixel = 0; pixel < source.width * source.height; pixel += 1) {
  if (source.data[pixel * 4 + 3] > 24 && cellAt[pixel] === -1) outsidePixels += 1;
}
if (outsidePixels) throw new Error(`${attemptId}: ${outsidePixels} opaque pixels exist outside the assigned rail lanes`);

function crop(cell) {
  const out = new PNG({ width: cell.w, height: cell.h });
  for (let y = 0; y < cell.h; y += 1) for (let x = 0; x < cell.w; x += 1) {
    const sourceIndex = ((cell.y + y) * source.width + cell.x + x) * 4;
    const outIndex = (y * out.width + x) * 4;
    source.data.copy(out.data, outIndex, sourceIndex, sourceIndex + 4);
  }
  return out;
}

function crossSectionHasInk(png, horizontal, position) {
  const length = horizontal ? png.height : png.width;
  for (let offset = 0; offset < length; offset += 1) {
    const x = horizontal ? position : offset;
    const y = horizontal ? offset : position;
    if (png.data[(y * png.width + x) * 4 + 3] > 24) return true;
  }
  return false;
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

const accepted = [];
const failures = [];
for (const cell of admittedCells) {
  const png = crop(cell);
  const horizontal = cell.w > cell.h;
  const longAxis = horizontal ? png.width : png.height;
  const missing = [];
  for (let position = 0; position < longAxis; position += 1) {
    if (!crossSectionHasInk(png, horizontal, position)) missing.push(position);
  }
  if (missing.length) failures.push(`${cell.id}: ${missing.length} empty cross-sections break rail continuity`);

  let minShort = horizontal ? png.height : png.width;
  let maxShort = -1;
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    if (png.data[(y * png.width + x) * 4 + 3] <= 24) continue;
    const short = horizontal ? y : x;
    minShort = Math.min(minShort, short);
    maxShort = Math.max(maxShort, short);
  }
  const paintedThickness = maxShort >= minShort ? maxShort - minShort + 1 : 0;
  if (paintedThickness < roleSpec.thickness - 2) {
    failures.push(`${cell.id}: painted thickness ${paintedThickness}px does not meaningfully occupy its native ${roleSpec.thickness}px lane`);
  }

  const seam = cell.fit === 'repeat' ? seamScore(png, horizontal) : null;
  if (seam && (seam.alphaMismatches > 0 || seam.averageDelta > MAX_REPEAT_SEAM_DELTA)) {
    failures.push(`${cell.id}: repeat seam delta ${seam.averageDelta.toFixed(1)}, alpha mismatches ${seam.alphaMismatches}`);
  }
  accepted.push({ cell, png, paintedThickness, seam });
}

if (failures.length) {
  throw new Error(`${attemptId} rejected; no files written:\n- ${failures.join('\n- ')}`);
}

const outDir = resolve(frontend, `public/assets/ui/chrome-candidates/native-rails-v1/${attemptId}`);
const fits = new Set(accepted.map((result) => result.cell.fit));
if (fits.size !== 1) throw new Error(`${attemptId}: one admitted family attempt cannot mix rail fit contracts`);
const metadata = {
  id: attemptId,
  provider,
  role,
  nativeThickness: roleSpec.thickness,
  source: sourceArg.replaceAll('\\', '/'),
  scale: 1,
  resampled: false,
  edges: {},
};
const report = {
  id: attemptId,
  provider,
  role,
  fit: [...fits][0],
  nativeThickness: roleSpec.thickness,
  sourceSheet: sourceArg.replaceAll('\\', '/'),
  extraction: 'fixed-family-lanes-1:1',
  accepted: [],
  rejected: [],
};
rmSync(outDir, { recursive: true, force: true });
for (const result of accepted) {
  const file = `${result.cell.id}.png`;
  const path = resolve(outDir, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(result.png));
  metadata.edges[result.cell.id] = {
    src: `/assets/ui/chrome-candidates/native-rails-v1/${attemptId}/${file}`,
    width: result.png.width,
    height: result.png.height,
    paintedThickness: result.paintedThickness,
    seam: result.seam,
  };
  report.accepted.push({
    file,
    sourceBounds: { x: result.cell.x, y: result.cell.y, w: result.cell.w, h: result.cell.h },
    src: `/assets/ui/chrome-candidates/native-rails-v1/${attemptId}/${file}`,
    orientation: result.cell.w > result.cell.h ? 'horizontal' : 'vertical',
    width: result.png.width,
    height: result.png.height,
    seam: result.seam,
  });
}
writeFileSync(resolve(outDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
writeFileSync(resolve(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${attemptId}: accepted ${accepted.length} untouched 1:1 rail crops at ${roleSpec.thickness}px`);
