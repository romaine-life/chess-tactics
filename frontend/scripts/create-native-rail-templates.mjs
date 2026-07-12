// Creates geometry-only image-generation guides. These are masks, not UI art:
// generated pixels may be admitted only by import-native-rail-attempt.mjs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const spec = JSON.parse(readFileSync(resolve(frontend, 'config/native-rail-generation.json'), 'utf8'));
const outDir = resolve(frontend, '../docs/art/chrome-native-rails/v1/templates');
const KEY = [255, 0, 255, 255];
const PLACEHOLDERS = {
  outer: [28, 57, 78, 255],
  inner: [24, 46, 63, 255],
};

function setPixel(png, x, y, rgba) {
  const index = (y * png.width + x) * 4;
  png.data[index] = rgba[0];
  png.data[index + 1] = rgba[1];
  png.data[index + 2] = rgba[2];
  png.data[index + 3] = rgba[3];
}

function fillRect(png, rect, rgba) {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) setPixel(png, x, y, rgba);
  }
}

function insetRect(rect, inset) {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    w: Math.max(1, rect.w - inset * 2),
    h: Math.max(1, rect.h - inset * 2),
  };
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

for (const [role, roleSpec] of Object.entries(spec.roles)) {
  for (const [templateId, template] of Object.entries(roleSpec.templates)) {
    if (!templateId.startsWith('codex')) continue;
    const png = new PNG({ width: template.width, height: template.height });
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) setPixel(png, x, y, KEY);
    }
    for (const cell of templateCells(template, roleSpec.thickness)) {
      fillRect(png, insetRect(cell, template.guideInset ?? 0), PLACEHOLDERS[role]);
    }
    const suffix = template.revision ? `-v${template.revision}` : '';
    const path = resolve(outDir, `${role}-${templateId}-rail-template${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, PNG.sync.write(png));
    console.log(`wrote ${path} (${png.width}x${png.height}, ${roleSpec.thickness}px lanes)`);
  }
}
