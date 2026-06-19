import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const PIXELLAB_ACCOUNT_ID = '3b4f0480-f3cc-4383-b662-7259f13e2d7d';
const PIXELLAB_HOST = 'backblaze.pixellab.ai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendRoot, '..');

function usage() {
  console.log(
    [
      'Usage:',
      '  npm run pixellab:download -- <tileset-id> <name> [tile-count]',
      '',
      'Example:',
      '  npm run pixellab:download -- 2b24250f-51dd-4065-8258-9fbf05d9050f stone',
    ].join('\n'),
  );
}

function assertTilesetId(value) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(value)) {
    throw new Error(`Invalid PixelLab tileset id: ${value}`);
  }
}

function assertRunName(value) {
  if (!/^[a-z0-9_-]+$/i.test(value)) {
    throw new Error(`Run name may only contain letters, numbers, underscores, and hyphens: ${value}`);
  }
}

async function readPng(filePath) {
  const buffer = await fs.readFile(filePath);
  return PNG.sync.read(buffer);
}

function drawNearest(dest, src, offsetX, offsetY, scale) {
  for (let sy = 0; sy < src.height; sy += 1) {
    for (let sx = 0; sx < src.width; sx += 1) {
      const srcIndex = (src.width * sy + sx) << 2;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const tx = offsetX + sx * scale + dx;
          const ty = offsetY + sy * scale + dy;
          if (tx < 0 || ty < 0 || tx >= dest.width || ty >= dest.height) {
            continue;
          }
          const destIndex = (dest.width * ty + tx) << 2;
          dest.data[destIndex] = src.data[srcIndex];
          dest.data[destIndex + 1] = src.data[srcIndex + 1];
          dest.data[destIndex + 2] = src.data[srcIndex + 2];
          dest.data[destIndex + 3] = src.data[srcIndex + 3];
        }
      }
    }
  }
}

function drawPixelText(dest, text, x, y) {
  const glyphs = {
    0: ['111', '101', '101', '101', '111'],
    1: ['010', '110', '010', '010', '111'],
    2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '111', '001', '111'],
    4: ['101', '101', '111', '001', '001'],
    5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'],
    7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '111'],
    _: ['000', '000', '111', '000', '000'],
    t: ['111', '010', '010', '010', '011'],
    i: ['010', '000', '010', '010', '010'],
    l: ['100', '100', '100', '100', '111'],
    e: ['111', '100', '111', '100', '111'],
  };

  let cursorX = x;
  for (const char of text) {
    const glyph = glyphs[char] ?? ['000', '000', '000', '000', '000'];
    for (let gy = 0; gy < glyph.length; gy += 1) {
      for (let gx = 0; gx < glyph[gy].length; gx += 1) {
        if (glyph[gy][gx] !== '1') {
          continue;
        }
        const px = cursorX + gx * 2;
        const py = y + gy * 2;
        for (let yy = 0; yy < 2; yy += 1) {
          for (let xx = 0; xx < 2; xx += 1) {
            const tx = px + xx;
            const ty = py + yy;
            const index = (dest.width * ty + tx) << 2;
            dest.data[index] = 255;
            dest.data[index + 1] = 255;
            dest.data[index + 2] = 255;
            dest.data[index + 3] = 255;
          }
        }
      }
    }
    cursorX += 8;
  }
}

async function createContactSheet(runDir, tileCount, scale) {
  const cell = 224;
  const labelHeight = 24;
  const cols = 4;
  const rows = Math.ceil(tileCount / cols);
  const sheet = new PNG({ width: cols * cell, height: rows * (cell + labelHeight) });

  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = 18;
    sheet.data[i + 1] = 23;
    sheet.data[i + 2] = 31;
    sheet.data[i + 3] = 255;
  }

  for (let i = 0; i < tileCount; i += 1) {
    const tile = await readPng(path.join(runDir, `tile_${i}.png`));
    const col = i % cols;
    const row = Math.floor(i / cols);
    const drawWidth = tile.width * scale;
    const drawHeight = tile.height * scale;
    const x = col * cell + Math.floor((cell - drawWidth) / 2);
    const y = row * (cell + labelHeight) + labelHeight;

    drawPixelText(sheet, `tile_${i}`, col * cell + 8, row * (cell + labelHeight) + 6);
    drawNearest(sheet, tile, x, y, scale);
  }

  const sheetPath = path.join(runDir, 'contact-sheet-3x.png');
  await fs.writeFile(sheetPath, PNG.sync.write(sheet));
  return sheetPath;
}

async function main() {
  const [, , tilesetId, name, tileCountArg = '16'] = process.argv;
  if (!tilesetId || !name) {
    usage();
    process.exitCode = 1;
    return;
  }

  assertTilesetId(tilesetId);
  assertRunName(name);

  const tileCount = Number.parseInt(tileCountArg, 10);
  if (!Number.isInteger(tileCount) || tileCount < 1 || tileCount > 64) {
    throw new Error(`Tile count must be an integer from 1 to 64: ${tileCountArg}`);
  }

  const runDir = path.join(repoRoot, 'docs', 'art', 'pixellab-runs', `tiles-pro-${tilesetId}-${name}`);
  await fs.mkdir(runDir, { recursive: true });

  for (let i = 0; i < tileCount; i += 1) {
    const url = new URL(
      `/file/pixellab-tiles/${PIXELLAB_ACCOUNT_ID}/${tilesetId}/tile_${i}.png`,
      `https://${PIXELLAB_HOST}`,
    );
    if (url.protocol !== 'https:' || url.hostname !== PIXELLAB_HOST) {
      throw new Error(`Refusing unexpected PixelLab asset URL: ${url.href}`);
    }

    const outFile = path.join(runDir, `tile_${i}.png`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download tile_${i}.png: ${response.status} ${response.statusText}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await fs.writeFile(outFile, bytes);
    console.log(`downloaded tile_${i}.png (${bytes.length} bytes)`);
  }

  const sheetPath = await createContactSheet(runDir, tileCount, 3);
  console.log(`run_dir=${runDir}`);
  console.log(`contact_sheet=${sheetPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
