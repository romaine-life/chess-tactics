const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const {
  WALL_ART_SLOT_DATUM,
  TILE_STEP_X,
  boardDrawOps,
  roadEdgeKey,
  wallArt,
  wallDecorAsset,
} = require('@chess-tactics/board-render');
const { paintBoardThumbnailOp } = require('./boardThumbnail');

const FRONTEND_PUBLIC = path.resolve(__dirname, '..', 'frontend', 'public');
const FIXED_BOUNDS = { minX: -256, minY: -384, width: 512, height: 640 };
const GALLERY_ART_ID = 'mirror-grand-gallery-wall';
const imageCache = new Map();

function edgeFor(face, index) {
  return face === 'west'
    ? roadEdgeKey(0, index, -1, index)
    : roadEdgeKey(index, 0, index, -1);
}

function galleryOps(face) {
  const edges = [0, 1, 2].map((index) => edgeFor(face, index));
  const board = {
    cols: 4,
    rows: 4,
    cells: {},
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {},
    featureCuts: {},
    featureExits: {},
    walls: Object.fromEntries(edges.map((edge) => [edge, 'stone'])),
    wallArt: { [edges[0]]: GALLERY_ART_ID },
  };
  const faceAsset = wallDecorAsset('mirror-grand-gallery').faces[face];
  const acceptedSources = new Set([faceAsset.src, faceAsset.glassSrc]);
  const allOps = boardDrawOps(board);
  const ops = allOps.filter((op) => acceptedSources.has(op.src));
  assert.equal(ops.filter((op) => op.src === faceAsset.glassSrc).length, 3);
  assert.equal(ops.filter((op) => op.src === faceAsset.src).length, 3);
  return { allOps, faceAsset, ops };
}

async function shippedImage(src) {
  if (!imageCache.has(src)) {
    const absolutePath = path.join(FRONTEND_PUBLIC, ...src.replace(/^\/+/, '').split('/'));
    imageCache.set(src, loadImage(absolutePath));
  }
  return imageCache.get(src);
}

async function renderOps(ops) {
  const canvas = createCanvas(FIXED_BOUNDS.width, FIXED_BOUNDS.height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (const op of ops) {
    paintBoardThumbnailOp(
      ctx,
      await shippedImage(op.src),
      op,
      0,
      0,
      FIXED_BOUNDS,
      1,
    );
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function unionReference(ops, faceAsset) {
  return [faceAsset.glassSrc, faceAsset.src].map((src) => {
    const segments = ops.filter((op) => op.src === src);
    return {
      ...segments[0],
      clipPolygons: segments.flatMap((op) => op.clipPolygons ?? []),
    };
  });
}

function pixelDifference(actual, expected, horizontalFlip = false) {
  assert.equal(actual.width, expected.width);
  assert.equal(actual.height, expected.height);
  let pixels = 0;
  let channels = 0;
  let first = null;
  for (let y = 0; y < actual.height; y += 1) {
    for (let x = 0; x < actual.width; x += 1) {
      const actualOffset = (y * actual.width + x) * 4;
      const expectedX = horizontalFlip ? expected.width - 1 - x : x;
      const expectedOffset = (y * expected.width + expectedX) * 4;
      let pixelDiffers = false;
      for (let channel = 0; channel < 4; channel += 1) {
        if (actual.data[actualOffset + channel] === expected.data[expectedOffset + channel]) continue;
        channels += 1;
        pixelDiffers = true;
      }
      if (!pixelDiffers) continue;
      pixels += 1;
      first ??= {
        worldX: x + FIXED_BOUNDS.minX,
        worldY: y + FIXED_BOUNDS.minY,
        actual: [...actual.data.slice(actualOffset, actualOffset + 4)],
        expected: [...expected.data.slice(expectedOffset, expectedOffset + 4)],
      };
    }
  }
  return { pixels, channels, first };
}

function assertPixelExact(actual, expected, label, horizontalFlip = false) {
  const difference = pixelDifference(actual, expected, horizontalFlip);
  assert.deepEqual(difference, { pixels: 0, channels: 0, first: null }, `${label}: ${JSON.stringify(difference)}`);
}

function pixelAt(image, worldX, worldY) {
  const x = worldX - FIXED_BOUNDS.minX;
  const y = worldY - FIXED_BOUNDS.minY;
  const offset = (y * image.width + x) * 4;
  return [...image.data.slice(offset, offset + 4)];
}

function seamLeakage(production, wallOnly, continuous, face) {
  let candidates = 0;
  const leaks = [];
  const direction = face === 'west' ? -1 : 1;
  for (const boundary of [TILE_STEP_X, TILE_STEP_X * 2]) {
    for (let offset = -1; offset <= 1; offset += 1) {
      const worldX = direction * boundary + offset;
      for (let worldY = -240; worldY <= 64; worldY += 1) {
        const wallPixel = pixelAt(wallOnly, worldX, worldY);
        const continuousPixel = pixelAt(continuous, worldX, worldY);
        if (continuousPixel.every((value, channel) => value === wallPixel[channel])) continue;
        candidates += 1;
        const productionPixel = pixelAt(production, worldX, worldY);
        if (productionPixel.every((value, channel) => value === wallPixel[channel])) {
          leaks.push({ worldX, worldY, wallPixel, productionPixel, continuousPixel });
        }
      }
    }
  }
  return { candidates, leaks };
}

async function rawPixels(src) {
  const image = await shippedImage(src);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

test('Grand Gallery shipped north art is the exact horizontal counterpart of west', async () => {
  const asset = wallDecorAsset('mirror-grand-gallery');
  assert.equal(asset.faces.north.width, asset.faces.west.width);
  assert.equal(asset.faces.north.height, asset.faces.west.height);

  for (const layer of ['src', 'glassSrc']) {
    const west = await rawPixels(asset.faces.west[layer]);
    const north = await rawPixels(asset.faces.north[layer]);
    assertPixelExact(west, north, `shipped ${layer}`, true);
  }

  const slots = wallArt(GALLERY_ART_ID).slots;
  const westSlot = slots.find((slot) => slot.face === 'west');
  const northSlot = slots.find((slot) => slot.face === 'north');
  assert.equal(northSlot.x, 2 * WALL_ART_SLOT_DATUM.anchorX - westSlot.x, 'north mount x must complement west around the wall datum');
  assert.equal(asset.faces.north.mountX, asset.faces.north.width - asset.faces.west.mountX, 'north source mount must complement west');
});

for (const face of ['west', 'north']) {
  test(`Grand Gallery ${face} segmented production paint never exposes wall pixels at internal seams`, async () => {
    const { allOps, faceAsset, ops } = galleryOps(face);
    const mirrorSources = new Set([faceAsset.src, faceAsset.glassSrc]);
    const wallOps = allOps.filter((op) => !mirrorSources.has(op.src));
    const production = await renderOps(allOps);
    const wallOnly = await renderOps(wallOps);
    const continuous = await renderOps([...wallOps, ...unionReference(ops, faceAsset)]);
    const result = seamLeakage(production, wallOnly, continuous, face);
    assert.ok(result.candidates > 100, `${face} seam probe must cover mirror-painted reference pixels`);
    assert.deepEqual(result.leaks, [], `${face} exposed underlying wall pixels: ${JSON.stringify(result.leaks.slice(0, 5))}`);
  });
}

test('Grand Gallery production placement preserves exact north/west pixel and x-complement parity', async () => {
  const west = galleryOps('west');
  const north = galleryOps('north');

  for (const layer of ['src', 'glassSrc']) {
    const westOp = west.ops.find((op) => op.src === west.faceAsset[layer]);
    const northOp = north.ops.find((op) => op.src === north.faceAsset[layer]);
    assert.equal(northOp.dx, -westOp.dx - westOp.dw, `${layer} north x must complement west around world x=0`);
    assert.equal(northOp.dy, westOp.dy, `${layer} face y must match`);
    const westPixels = await renderOps([{ ...westOp, clipPolygons: undefined }]);
    const northPixels = await renderOps([{ ...northOp, clipPolygons: undefined }]);
    assertPixelExact(westPixels, northPixels, `${layer} unclipped production paint`, true);
  }

  for (let segment = 0; segment < 3; segment += 1) {
    const westClip = west.ops.filter((op) => op.src === west.faceAsset.glassSrc)[segment].clipPolygons[0];
    const northClip = north.ops.filter((op) => op.src === north.faceAsset.glassSrc)[segment].clipPolygons[0];
    const westPoints = [];
    const northPoints = [];
    for (let index = 0; index < westClip.length; index += 2) {
      westPoints.push(`${(-westClip[index]).toFixed(6)},${westClip[index + 1].toFixed(6)}`);
      northPoints.push(`${northClip[index].toFixed(6)},${northClip[index + 1].toFixed(6)}`);
    }
    assert.deepEqual(northPoints.sort(), westPoints.sort(), `segment ${segment} clip must complement around world x=0`);
  }
});
