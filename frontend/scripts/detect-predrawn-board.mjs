#!/usr/bin/env node
/**
 * Deterministically recover the playable top-plane corners from a generated board plate.
 *
 * Contract:
 * - the plate has a transparent or near-black exterior;
 * - its top plane is an orthographic isometric parallelogram;
 * - props may interrupt the silhouette, so individual extrema are not treated as edge lines.
 *
 * The detector fits the two long upper silhouette line families with a robust modal-intercept
 * search, intersects them for north, evaluates them at the foreground x-extrema for east/west,
 * and derives south by parallelogram closure. It refuses low-confidence fits and prints the
 * evidence used for review. It never edits the image.
 *
 * Usage:
 *   npm run predrawn:detect -- tmp-shots/controlled-pass/plate.png
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

const input = process.argv[2];
if (!input || input.startsWith('--')) {
  console.error('usage: detect-predrawn-board <plate.png> [--threshold <0..255>]');
  process.exit(2);
}

const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const threshold = Number(option('threshold', 20));
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255) {
  console.error('--threshold must be between 0 and 255');
  process.exit(2);
}

function median(values) {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function leastSquares(points) {
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }
  if (denominator < 1e-9) throw new Error('degenerate line fit');
  const slope = numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}

function robustLine(points, slopeMin, slopeMax) {
  let best;
  const steps = 400;
  for (let step = 0; step <= steps; step += 1) {
    const slope = slopeMin + ((slopeMax - slopeMin) * step) / steps;
    const bins = new Map();
    for (const point of points) {
      const bin = Math.round((point.y - slope * point.x) * 2);
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
    }
    let modalBin = 0;
    let modalCount = -1;
    for (const [bin, count] of bins) {
      if (count > modalCount) {
        modalBin = bin;
        modalCount = count;
      }
    }
    const intercept = modalBin / 2;
    const score = points.reduce(
      (count, point) => count + (Math.abs(point.y - (slope * point.x + intercept)) < 2 ? 1 : 0),
      0,
    );
    if (!best || score > best.score) best = { slope, intercept, score };
  }

  let fit = best;
  let inliers = points.filter(
    (point) => Math.abs(point.y - (fit.slope * point.x + fit.intercept)) < 3,
  );
  for (let iteration = 0; iteration < 4; iteration += 1) {
    fit = leastSquares(inliers);
    inliers = points.filter(
      (point) => Math.abs(point.y - (fit.slope * point.x + fit.intercept)) < 2.5,
    );
  }
  const residuals = inliers.map((point) => Math.abs(point.y - (fit.slope * point.x + fit.intercept)));
  return {
    ...fit,
    inliers: inliers.length,
    samples: points.length,
    inlierRatio: inliers.length / points.length,
    medianResidualPx: median(residuals),
  };
}

function atX(line, x) {
  return line.slope * x + line.intercept;
}

function intersection(a, b) {
  const denominator = a.slope - b.slope;
  if (Math.abs(denominator) < 1e-9) throw new Error('edge line families are parallel');
  const x = (b.intercept - a.intercept) / denominator;
  return [x, atX(a, x)];
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

const absoluteInput = resolve(input);
const png = PNG.sync.read(readFileSync(absoluteInput));
const { width, height, data } = png;
const topAtX = new Array(width).fill(Infinity);
let minX = Infinity;
let maxX = -Infinity;
let minY = Infinity;
let foregroundPixels = 0;

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    const alpha = data[offset + 3];
    const intensity = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    if (alpha <= 16 || intensity <= threshold) continue;
    foregroundPixels += 1;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    topAtX[x] = Math.min(topAtX[x], y);
  }
}

if (!Number.isFinite(minX) || foregroundPixels < 1000) {
  console.error('detector found no usable foreground');
  process.exit(1);
}

const apexXs = [];
for (let x = minX; x <= maxX; x += 1) if (topAtX[x] === minY) apexXs.push(x);
const apexX = apexXs.reduce((sum, x) => sum + x, 0) / apexXs.length;
const leftSamples = [];
const rightSamples = [];
for (let x = minX; x <= maxX; x += 1) {
  if (!Number.isFinite(topAtX[x])) continue;
  const point = { x, y: topAtX[x] };
  if (x <= apexX) leftSamples.push(point);
  if (x >= apexX) rightSamples.push(point);
}

const northWest = robustLine(leftSamples, -0.7, -0.3);
const northEast = robustLine(rightSamples, 0.3, 0.7);
const north = intersection(northEast, northWest);
const east = [maxX, atX(northEast, maxX)];
const west = [minX, atX(northWest, minX)];
const south = [east[0] + west[0] - north[0], east[1] + west[1] - north[1]];

const endpointResidual = {
  east: Math.abs(topAtX[maxX] - east[1]),
  west: Math.abs(topAtX[minX] - west[1]),
};
const failures = [];
for (const [name, line] of [['northWest', northWest], ['northEast', northEast]]) {
  if (line.inlierRatio < 0.42) failures.push(`${name} inlier ratio ${line.inlierRatio.toFixed(3)} < 0.42`);
  if (line.medianResidualPx > 1.25) failures.push(`${name} median residual ${line.medianResidualPx.toFixed(3)}px > 1.25px`);
}
if (Math.abs(north[0] - apexX) > 12 || Math.abs(north[1] - minY) > 12) {
  failures.push('fitted north corner disagrees with the foreground apex by more than 12px');
}
if (endpointResidual.east > 12 || endpointResidual.west > 12) {
  failures.push('a fitted side corner disagrees with its foreground x-extreme by more than 12px');
}
if (south[0] < 0 || south[0] >= width || south[1] < 0 || south[1] >= height) {
  failures.push('derived south corner lies outside the source image');
}

const corners = {
  north: north.map((value) => round(value)),
  east: east.map((value) => round(value)),
  south: south.map((value) => round(value)),
  west: west.map((value) => round(value)),
};
const cornerParam = [
  width,
  height,
  ...corners.north,
  ...corners.east,
  ...corners.south,
  ...corners.west,
].join(',');
const report = {
  detector: 'orthographic-top-plane-lines-v1',
  input: absoluteInput,
  source: { width, height },
  corners,
  evidence: {
    foregroundPixels,
    foregroundBounds: { minX, maxX, minY, apexX: round(apexX) },
    northWest,
    northEast,
    endpointResidualPx: Object.fromEntries(Object.entries(endpointResidual).map(([key, value]) => [key, round(value)])),
  },
  predrawnCorners: cornerParam,
  accepted: failures.length === 0,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
