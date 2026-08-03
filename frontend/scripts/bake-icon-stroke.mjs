#!/usr/bin/env node
// Bake a stroke onto a pixel-art icon.
//
// An INNER stroke: the outermost N rings of the sprite's own opaque pixels become
// the outline colour. The silhouette never grows, so nothing clips at the native
// canvas edge and nothing is resampled — the uploaded bytes stay native 1x, and
// the outline becomes part of the sprite exactly as the accepted ui-kit icons are
// built (their silhouette edge is already near-black).
//
// This is deterministic image logic, so it lives in git while the bytes it
// produces live in blob storage (docs/runtime-asset-contract.md). It does not
// draw art: it recolours pixels the generator already placed.
//
//   node scripts/bake-icon-stroke.mjs <in.png> <out.png> [--width 1] [--colour 05080c]
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const OPAQUE = 128;

/**
 * Grow the silhouette by `width` pixels of `colour`. This is the stroke that
 * separates a mark from a dark, textured wall: an inner stroke only eats the
 * sprite's own mass, which on a mid-dark background makes it read as LESS, not
 * more. Requires that much transparent margin on the native canvas.
 * @returns {Buffer}
 */
export function outerStroke(bytes, width = 2, colour = [5, 8, 12]) {
  if (!Number.isInteger(width) || width < 1 || width > 8) {
    throw new Error('stroke width must be an integer from 1 through 8');
  }
  const png = PNG.sync.read(bytes);
  const { width: w, height: h, data } = png;
  const opaque = new Uint8Array(w * h);
  for (let index = 0; index < w * h; index += 1) opaque[index] = data[index * 4 + 3] >= OPAQUE ? 1 : 0;

  // Chebyshev distance from every transparent pixel to the nearest opaque one.
  const distance = new Int16Array(w * h).fill(-1);
  const queue = [];
  for (let index = 0; index < w * h; index += 1) if (opaque[index]) { distance[index] = 0; queue.push(index); }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const step = distance[index];
    if (step >= width) continue;
    const x = index % w;
    const y = (index - x) / w;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const next = ny * w + nx;
        if (distance[next] !== -1) continue;
        distance[next] = step + 1;
        queue.push(next);
      }
    }
  }
  for (let index = 0; index < w * h; index += 1) {
    if (distance[index] < 1 || distance[index] > width) continue;
    data[index * 4] = colour[0];
    data[index * 4 + 1] = colour[1];
    data[index * 4 + 2] = colour[2];
    data[index * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** @returns {Buffer} the same PNG with its outermost `width` opaque rings recoloured. */
export function innerStroke(bytes, width = 1, colour = [5, 8, 12]) {
  if (!Number.isInteger(width) || width < 1 || width > 8) {
    throw new Error('stroke width must be an integer from 1 through 8');
  }
  const png = PNG.sync.read(bytes);
  const { width: w, height: h, data } = png;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] >= OPAQUE;

  // Chebyshev distance from every opaque pixel to the nearest non-opaque one.
  // Outside the canvas counts as non-opaque, so a sprite that touches the frame
  // is still outlined along that edge rather than left open.
  const distance = new Int16Array(w * h).fill(-1);
  const queue = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!opaque(x, y)) continue;
      let border = false;
      for (let dy = -1; dy <= 1 && !border; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((!dx && !dy) || opaque(x + dx, y + dy)) continue;
          border = true;
          break;
        }
      }
      if (!border) continue;
      distance[y * w + x] = 1;
      queue.push(x, y);
    }
  }
  for (let head = 0; head < queue.length; head += 2) {
    const x = queue[head];
    const y = queue[head + 1];
    const step = distance[y * w + x];
    if (step >= width) continue;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!opaque(nx, ny) || distance[ny * w + nx] !== -1) continue;
        distance[ny * w + nx] = step + 1;
        queue.push(nx, ny);
      }
    }
  }
  for (let index = 0; index < w * h; index += 1) {
    if (distance[index] < 1 || distance[index] > width) continue;
    data[index * 4] = colour[0];
    data[index * 4 + 1] = colour[1];
    data[index * 4 + 2] = colour[2];
  }
  return PNG.sync.write(png);
}

/**
 * Crop to the occupied pixels, then pad to the square that bounds them.
 *
 * A 64x64 canvas is a frame, not a size: two icons that fill 20 and 62 of it
 * draw at wildly different scales and carry wildly different invisible padding,
 * which is what makes a row of marks look unevenly spaced. Trimming to the ink
 * makes the element's box the ART, so the only spacing left is the one the
 * layout asks for. Square, so the seat can stay square and `contain` can size
 * every mark by its longest edge.
 *
 * Pure crop and pad — no resampling, so the bytes stay honestly native 1x.
 * @returns {Buffer}
 */
export function trimToInkSquare(bytes) {
  const png = PNG.sync.read(bytes);
  const { width: w, height: h, data } = png;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] < OPAQUE) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('icon has no occupied pixels');
  const inkWidth = maxX - minX + 1;
  const inkHeight = maxY - minY + 1;
  const side = Math.max(inkWidth, inkHeight);
  const offsetX = Math.floor((side - inkWidth) / 2);
  const offsetY = Math.floor((side - inkHeight) / 2);
  const out = new PNG({ width: side, height: side });
  out.data.fill(0);
  for (let y = 0; y < inkHeight; y += 1) {
    for (let x = 0; x < inkWidth; x += 1) {
      const from = ((minY + y) * w + (minX + x)) * 4;
      const to = ((offsetY + y) * side + (offsetX + x)) * 4;
      out.data[to] = data[from];
      out.data[to + 1] = data[from + 1];
      out.data[to + 2] = data[from + 2];
      out.data[to + 3] = data[from + 3];
    }
  }
  return PNG.sync.write(out);
}

export function parseColour(value) {
  const hex = String(value).replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`--colour must be a 6-digit hex value, got ${value}`);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

if ((process.argv[1] ?? '').endsWith('bake-icon-stroke.mjs')) {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  const [input, output] = argv.filter((value, index) => !value.startsWith('--') && !argv[index - 1]?.startsWith('--'));
  if (!input || !output) {
    console.error('usage: bake-icon-stroke.mjs <in.png> <out.png> [--mode outer|inner] [--width 2] [--colour 05080c]');
    process.exit(2);
  }
  const mode = flag('mode', 'outer');
  if (mode !== 'outer' && mode !== 'inner') throw new Error('--mode must be outer or inner');
  const stroke = mode === 'outer' ? outerStroke : innerStroke;
  let bytes = stroke(readFileSync(input), Number(flag('width', mode === 'outer' ? 2 : 1)), parseColour(flag('colour', '05080c')));
  if (argv.includes('--trim')) bytes = trimToInkSquare(bytes);
  writeFileSync(output, bytes);
  console.log(`wrote ${output}`);
}
