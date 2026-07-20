const assert = require('node:assert/strict');
const test = require('node:test');
const { createCanvas } = require('@napi-rs/canvas');
const {
  predrawnBoardRasterBounds,
  predrawnBoardRasterTransform,
} = require('@chess-tactics/board-render');

const { __testing, renderBoardThumbnail, BOARD_THUMB_W, BOARD_THUMB_H } = require('./boardThumbnail');

const {
  ThumbnailAssetStore,
  ThumbnailFontRegistry,
  ThumbnailMediaUnavailableError,
  Semaphore,
  constants,
  loadSpriteWithAvailability,
  mapWithConcurrency,
  paintOccludedThumbnailOp,
  paintPredrawnThumbnailOp,
  pngHeaderDimensions,
  sha256,
  sourceAvailabilityPolicy,
} = __testing;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function fakeDecoder(bytes) {
  return { width: 1, height: 1, payload: bytes.toString('utf8') };
}

test('runtime list derivative is a compact fixed-size PNG and needs no shell artwork', async () => {
  let unexpectedLoad = false;
  const png = await renderBoardThumbnail({
    plan: {
      ops: [],
      bounds: { minX: 0, minY: 0, width: 1, height: 1 },
      framingBounds: { minX: 0, minY: 0, width: 1, height: 1 },
    },
    loadDynamicSprite: async () => {
      unexpectedLoad = true;
      throw new Error('empty board should not request artwork');
    },
    mediaCatalogRevision: 1,
  });
  assert.deepEqual(pngHeaderDimensions(png), { width: BOARD_THUMB_W, height: BOARD_THUMB_H });
  assert.equal(unexpectedLoad, false);
});

test('production source loading and decoding serialize maximum-size assets', () => {
  assert.equal(constants.SPRITE_LOAD_CONCURRENCY, 1);
  assert.equal(constants.SPRITE_DECODE_CONCURRENCY, 1);
});

test('asset byte loading obeys the one-source concurrency ceiling', async () => {
  let activeLoads = 0;
  let maxActiveLoads = 0;
  const store = new ThumbnailAssetStore({
    decodeSpriteFn: async (bytes) => fakeDecoder(bytes),
    maxCacheWeight: 4096,
    maxLoadConcurrency: constants.SPRITE_LOAD_CONCURRENCY,
    maxDecodeConcurrency: 2,
  });

  await Promise.all(Array.from({ length: 8 }, (_, index) => (
    store.load(`/assets/source-${index}.png`, async () => {
      activeLoads += 1;
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeLoads -= 1;
      return Buffer.from(`source-${index}`);
    }, 1)
  )));

  assert.equal(maxActiveLoads, 1);
});

test('sprite and font bytes can share one process-wide source limiter', async () => {
  let activeLoads = 0;
  let maxActiveLoads = 0;
  const sharedLimiter = new Semaphore(constants.SPRITE_LOAD_CONCURRENCY);
  const trackLoad = async (value) => {
    activeLoads += 1;
    maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeLoads -= 1;
    return Buffer.from(value);
  };
  const store = new ThumbnailAssetStore({
    decodeSpriteFn: async (bytes) => fakeDecoder(bytes),
    maxCacheWeight: 4096,
    sourceLoadLimiter: sharedLimiter,
  });
  const fonts = new ThumbnailFontRegistry({
    globalFonts: { register: (_bytes, family) => ({ family }) },
    sourceLoadLimiter: sharedLimiter,
  });

  await Promise.all([
    ...Array.from({ length: 4 }, (_, index) => (
      store.load(`/assets/shared-${index}.png`, () => trackLoad(`sprite-${index}`), 1)
    )),
    ...Array.from({ length: 4 }, (_, index) => (
      fonts.ensure(() => trackLoad(`font-${index}`), index, `/api/media/${String(index).padStart(64, '0')}`)
    )),
  ]);

  assert.equal(maxActiveLoads, 1);
});

test('default thumbnail peak model stays below the 256 MiB pod budget', () => {
  const MIB = 1024 * 1024;
  const retainedDefaults = (
    24 * MIB // final thumbnail PNG cache
    + constants.SPRITE_CACHE_MAX_WEIGHT
    + 32 * MIB // generic live-media encoded-byte cache
    + 24 * MIB // unit sprite encoded-byte cache
  );
  const worstCasePipeline = constants.SPRITE_LOAD_CONCURRENCY * (
    32 * MIB // maximum encoded live-media object
    + constants.MAX_RASTER_PIXELS * 4 // decoded RGBA pixels
  );
  const pngFallbackPipeline = constants.SPRITE_LOAD_CONCURRENCY * (
    32 * MIB // maximum encoded live-media object
    + constants.MAX_PNG_FALLBACK_PIXELS * 4 * 3 // PNGjs pixels + ImageData + canvas
  );
  const modeledPeak = retainedDefaults + worstCasePipeline;

  assert.equal(modeledPeak, 176 * MIB);
  assert.ok(retainedDefaults + pngFallbackPipeline <= modeledPeak);
  assert.ok(modeledPeak < 256 * MIB);
});

test('multi-copy PNG fallback admits a native pre-drawn scene but rejects large rasters', () => {
  const header = (width, height) => {
    const bytes = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    bytes.write('IHDR', 12, 'ascii');
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return bytes;
  };

  assert.deepEqual(pngHeaderDimensions(header(512, 512)), { width: 512, height: 512 });
  assert.deepEqual(pngHeaderDimensions(header(1672, 941)), { width: 1672, height: 941 });
  assert.equal(pngHeaderDimensions(header(2048, 2048)), null);
});

test('missing decorative prop or wall art resolves to an omitted image', async () => {
  const store = new ThumbnailAssetStore({ decodeSpriteFn: async (bytes) => fakeDecoder(bytes) });
  const image = await loadSpriteWithAvailability(
    store,
    '/assets/wall-decor/missing.png',
    async () => null,
    1,
    constants.AVAILABILITY_DECORATIVE,
  );
  assert.equal(image, null);
});

test('decorative storage and decode failures also resolve to omission', async () => {
  const storageStore = new ThumbnailAssetStore({ decodeSpriteFn: async (bytes) => fakeDecoder(bytes) });
  assert.equal(await loadSpriteWithAvailability(
    storageStore,
    '/assets/props/missing-object.png',
    async () => { throw new Error('blob object missing'); },
    1,
    constants.AVAILABILITY_DECORATIVE,
  ), null);

  const corruptStore = new ThumbnailAssetStore({
    decodeSpriteFn: async () => { throw new Error('decode failed'); },
  });
  assert.equal(await loadSpriteWithAvailability(
    corruptStore,
    '/assets/wall-decor/corrupt.png',
    async () => Buffer.from('corrupt'),
    1,
    constants.AVAILABILITY_DECORATIVE,
  ), null);
});

test('missing critical terrain remains fatal', async () => {
  const store = new ThumbnailAssetStore({ decodeSpriteFn: async (bytes) => fakeDecoder(bytes) });
  await assert.rejects(
    loadSpriteWithAvailability(
      store,
      '/assets/tiles/surface/water-0-side.png',
      async () => null,
      1,
      constants.AVAILABILITY_CRITICAL,
    ),
    (error) => error instanceof ThumbnailMediaUnavailableError,
  );
});

test('availability resolver failures and unknown policies fail closed', () => {
  assert.equal(sourceAvailabilityPolicy(() => { throw new Error('bad snapshot'); }, '/assets/x.png'), 'critical');
  assert.equal(sourceAvailabilityPolicy(() => 'unknown', '/assets/x.png'), 'critical');
  assert.equal(sourceAvailabilityPolicy(() => 'decorative', '/assets/x.png'), 'decorative');
});

test('catalog revisions isolate in-flight semantic sprite loads without cache clears', async () => {
  const oldStarted = deferred();
  const releaseOld = deferred();
  const store = new ThumbnailAssetStore({
    decodeSpriteFn: async (bytes) => fakeDecoder(bytes),
    maxCacheWeight: 1024,
    maxLoadConcurrency: 4,
    maxDecodeConcurrency: 2,
  });
  const src = '/assets/tiles/surface/water-0-side.png';

  const oldLoad = store.load(src, async () => {
    oldStarted.resolve();
    await releaseOld.promise;
    return Buffer.from('old-catalog-pixels');
  }, 41);
  await oldStarted.promise;

  const current = await store.load(src, async () => Buffer.from('current-catalog-pixels'), 42);
  releaseOld.resolve();
  const old = await oldLoad;

  assert.equal(current.payload, 'current-catalog-pixels');
  assert.equal(old.payload, 'old-catalog-pixels');

  let unexpectedReload = false;
  const currentAgain = await store.load(src, async () => {
    unexpectedReload = true;
    return Buffer.from('wrong');
  }, 42);
  assert.equal(currentAgain, current);
  assert.equal(unexpectedReload, false);
});

test('decoded sprites deduplicate by content hash across distinct semantic slots', async () => {
  let decodeCount = 0;
  const bytes = Buffer.from('shared-pixels');
  const store = new ThumbnailAssetStore({
    decodeSpriteFn: async (value) => {
      decodeCount += 1;
      return fakeDecoder(value);
    },
    maxCacheWeight: 1024,
  });

  const first = await store.load('/assets/tiles/a.png', async () => bytes, 1);
  const second = await store.load('/assets/tiles/b.png', async () => bytes, 2);

  assert.equal(first, second);
  assert.equal(decodeCount, 1);
});

test('decoded sprite cache evicts by conservative byte weight', async () => {
  let decodeCount = 0;
  const store = new ThumbnailAssetStore({
    decodeSpriteFn: async (bytes) => {
      decodeCount += 1;
      return { width: 3, height: 3, payload: bytes.toString('utf8') };
    },
    // Each entry weighs 3 * 3 * 4 decoded bytes + 10 encoded bytes = 46.
    maxCacheWeight: 80,
    maxSourceBindings: 8,
  });
  const a = Buffer.from('aaaaaaaaaa');
  const b = Buffer.from('bbbbbbbbbb');

  await store.load('/assets/a.png', async () => a, 1);
  await store.load('/assets/b.png', async () => b, 1);
  const afterTwo = store.stats();
  assert.deepEqual(afterTwo.decoded, { size: 1, weight: 46, maxWeight: 80 });

  let reloads = 0;
  await store.load('/assets/a.png', async () => {
    reloads += 1;
    return a;
  }, 1);
  assert.equal(reloads, 1);
  assert.equal(decodeCount, 3);
  assert.ok(store.stats().decoded.weight <= 80);
});

test('sprite decoding has a process-wide concurrency ceiling per asset store', async () => {
  let active = 0;
  let maxActive = 0;
  const store = new ThumbnailAssetStore({
    decodeSpriteFn: async (bytes) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return fakeDecoder(bytes);
    },
    maxCacheWeight: 4096,
    maxLoadConcurrency: 8,
    maxDecodeConcurrency: 2,
  });

  await Promise.all(Array.from({ length: 10 }, (_, index) => (
    store.load(`/assets/sprite-${index}.png`, async () => Buffer.from(`pixels-${index}`), 1)
  )));

  assert.equal(maxActive, 2);
  assert.equal(store.stats().decodeInflight, 0);
});

test('bulk sprite scheduling starts only the configured number of workers', async () => {
  let active = 0;
  let maxActive = 0;
  const values = Array.from({ length: 40 }, (_, index) => index);

  const mapped = await mapWithConcurrency(values, 3, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return value * 2;
  });

  assert.equal(maxActive, 3);
  assert.deepEqual(mapped, values.map((value) => value * 2));
});

test('immutable media URLs reject bytes that do not match their SHA', async () => {
  const expectedBytes = Buffer.from('expected');
  const wrongBytes = Buffer.from('wrong');
  const store = new ThumbnailAssetStore({ decodeSpriteFn: async (bytes) => fakeDecoder(bytes) });

  await assert.rejects(
    store.load(`/api/media/${sha256(expectedBytes)}`, async () => wrongBytes, 1),
    /hash mismatch/,
  );
});

test('font registration is keyed by font SHA, not catalog revision aliases', async () => {
  const registered = [];
  const registry = new ThumbnailFontRegistry({
    globalFonts: {
      register(bytes, family) {
        registered.push({ bytes: Buffer.from(bytes), family });
        return { family };
      },
    },
    maxSourceBindings: 3,
  });
  const bytes = Buffer.from('one-font-file');
  const expectedFamily = `AW2 Server ${sha256(bytes)}`;

  for (let revision = 1; revision <= 20; revision += 1) {
    assert.equal(await registry.ensure(async () => bytes, revision, `/api/media/${sha256(bytes)}`), expectedFamily);
  }
  assert.equal(registered.length, 1);
  assert.deepEqual(registry.stats(), { registrations: 1, sourceBindings: 3 });

  let unexpectedReload = false;
  assert.equal(await registry.ensure(async () => {
    unexpectedReload = true;
    return Buffer.from('wrong');
  }, 20, `/api/media/${sha256(bytes)}`), expectedFamily);
  assert.equal(unexpectedReload, false);

  const changedBytes = Buffer.from('changed-font-file');
  assert.equal(
    await registry.ensure(async () => changedBytes, 21, `/api/media/${sha256(changedBytes)}`),
    `AW2 Server ${sha256(changedBytes)}`,
  );
  assert.equal(registered.length, 2);
});

test('occluded thumbnail draws preserve flip and opacity in a sprite-local scratch canvas', () => {
  const source = createCanvas(4, 1);
  const sourceCtx = source.getContext('2d');
  for (const [x, color] of ['#ff0000', '#00ff00', '#0000ff', '#ffff00'].entries()) {
    sourceCtx.fillStyle = color;
    sourceCtx.fillRect(x, 0, 1, 1);
  }

  const maskSource = createCanvas(2, 1);
  const maskCtx = maskSource.getContext('2d');
  maskCtx.fillStyle = '#ffffff';
  maskCtx.fillRect(0, 0, 1, 1);

  const target = createCanvas(6, 1);
  const allocations = [];
  const op = {
    src: 'subject',
    layer: 'scene',
    dx: 1,
    dy: 0,
    dw: 4,
    dh: 1,
    z: 1,
    flipX: true,
    opacity: 0.5,
  };
  const mask = {
    src: 'mask',
    layer: 'scene',
    dx: 1,
    dy: 0,
    dw: 2,
    dh: 1,
    z: 2,
    flipX: true,
  };

  const scratchRect = paintOccludedThumbnailOp({
    target: target.getContext('2d'),
    op,
    image: source,
    masks: [mask],
    images: new Map([['mask', maskSource]]),
    projection: { originX: 0, originY: 0, minX: 0, minY: 0, scale: 1 },
    clipRect: { x: 0, y: 0, width: 6, height: 1 },
    createScratchCanvas(width, height) {
      allocations.push([width, height]);
      return createCanvas(width, height);
    },
  });

  assert.deepEqual(scratchRect, { x: 1, y: 0, width: 4, height: 1 });
  assert.deepEqual(allocations, [[4, 1]]);
  const pixels = target.getContext('2d').getImageData(0, 0, 6, 1).data;
  const pixel = (x) => Array.from(pixels.slice(x * 4, x * 4 + 4));
  assert.deepEqual(pixel(0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(1).slice(0, 3), [255, 255, 0]);
  assert.ok(pixel(1)[3] === 127 || pixel(1)[3] === 128);
  assert.deepEqual(pixel(2), [0, 0, 0, 0]);
  assert.deepEqual(pixel(3).slice(0, 3), [0, 255, 0]);
  assert.ok(pixel(3)[3] === 127 || pixel(3)[3] === 128);
  assert.deepEqual(pixel(4).slice(0, 3), [255, 0, 0]);
  assert.ok(pixel(4)[3] === 127 || pixel(4)[3] === 128);
  assert.deepEqual(pixel(5), [0, 0, 0, 0]);
});

test('registered pre-drawn thumbnail pixels follow the shared projective raster transform', () => {
  const registration = {
    sourceWidth: 4,
    sourceHeight: 4,
    north: [0, 0],
    east: [4, 0],
    south: [4, 4],
    west: [0, 4],
    gridColumns: 1,
    gridRows: 1,
    columnGuides: [0, 1],
    rowGuides: [0, 1],
  };
  const surface = {
    kind: 'predrawn',
    slot: 'boards/test/registered.png',
    frameWidth: 4,
    frameHeight: 4,
    registration,
  };
  const transform = predrawnBoardRasterTransform(surface, [{ x: 0, y: 0 }], registration);
  assert.ok(transform);
  const bounds = predrawnBoardRasterBounds(transform);
  assert.ok(bounds);

  const source = createCanvas(4, 4);
  const sourceContext = source.getContext('2d');
  sourceContext.fillStyle = '#ef3b24';
  sourceContext.fillRect(0, 0, 4, 4);

  const width = Math.ceil(bounds.width);
  const height = Math.ceil(bounds.height);
  const target = createCanvas(width, height);
  const painted = paintPredrawnThumbnailOp(
    target.getContext('2d'),
    {
      src: 'registered',
      layer: 'terrain',
      dx: bounds.minX,
      dy: bounds.minY,
      dw: bounds.width,
      dh: bounds.height,
      z: -100000,
      predrawnTransform: transform,
    },
    source,
    {
      originX: 0,
      originY: 0,
      minX: bounds.minX,
      minY: bounds.minY,
      scale: 1,
    },
  );

  assert.deepEqual(painted, { x: 0, y: 0, width, height });
  const pixels = target.getContext('2d').getImageData(0, 0, width, height).data;
  const alphaAt = (x, y) => pixels[(y * width + x) * 4 + 3];
  assert.equal(alphaAt(0, 0), 0);
  assert.equal(alphaAt(width - 1, 0), 0);
  assert.ok(alphaAt(Math.floor(width / 2), Math.floor(height / 2)) > 240);
});
