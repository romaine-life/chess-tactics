import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const sourcePath = path.join(repoRoot, 'docs', 'art', 'ui-screen-concepts', '04-skirmish.png');
const outDir = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'concept-materials');

const crops = [
  { name: 'grass-a.png', x: 314, y: 502, width: 172, height: 118 },
  { name: 'grass-b.png', x: 722, y: 374, width: 172, height: 118 },
  { name: 'grass-c.png', x: 926, y: 528, width: 172, height: 118 },
  { name: 'stone-a.png', x: 572, y: 308, width: 152, height: 96 },
  { name: 'water-a.png', x: 424, y: 266, width: 172, height: 112 },
];

function cropPng(source, crop) {
  const output = new PNG({ width: crop.width, height: crop.height });
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const sx = crop.x + x;
      const sy = crop.y + y;
      const sourceIndex = (sy * source.width + sx) * 4;
      const outputIndex = (y * output.width + x) * 4;
      output.data[outputIndex] = source.data[sourceIndex];
      output.data[outputIndex + 1] = source.data[sourceIndex + 1];
      output.data[outputIndex + 2] = source.data[sourceIndex + 2];
      output.data[outputIndex + 3] = source.data[sourceIndex + 3];
    }
  }
  return output;
}

fs.mkdirSync(outDir, { recursive: true });
const source = PNG.sync.read(fs.readFileSync(sourcePath));

for (const crop of crops) {
  const output = cropPng(source, crop);
  fs.writeFileSync(path.join(outDir, crop.name), PNG.sync.write(output));
}

console.log(`Extracted ${crops.length} concept material crops to ${outDir}`);
