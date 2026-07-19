// Server-side social-card compositor for level/map OG thumbnails.
// The draw plan comes from @chess-tactics/board-render, the same DOM-free
// render geometry the in-app LevelThumbnail uses.

const { createHash } = require('node:crypto');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const {
  predrawnOcclusionMasksInFront,
  rasterizePredrawnBoardPixels,
} = require('@chess-tactics/board-render');

const CARD_W = 1200;
const CARD_H = 630;
const PAD = 56;
const TITLEBAR_H = 84;
const TITLEBAR_RULE_H = 14;
const HERO_TOP = TITLEBAR_H;
const HERO_BOTTOM = CARD_H;

const MAX_RASTER_PIXELS = 8 * 1024 * 1024;
const MAX_PNG_FALLBACK_PIXELS = 2 * 1024 * 1024;
const SPRITE_CACHE_MAX_WEIGHT = 32 * 1024 * 1024;
const SPRITE_SOURCE_BINDING_MAX = 512;
// Uploads may be as large as 32 MiB and decoded rasters may occupy another
// 32 MiB. Serialize the shared source/decode pipeline so retained caches plus
// one worst-case decode stay below the 256 MiB pod limit.
const SPRITE_LOAD_CONCURRENCY = 1;
const SPRITE_DECODE_CONCURRENCY = 1;
const FONT_SOURCE_BINDING_MAX = 8;
const AVAILABILITY_CRITICAL = 'critical';
const AVAILABILITY_DECORATIVE = 'decorative';

class ThumbnailMediaUnavailableError extends Error {
  constructor(src) {
    super(`live media is unavailable: ${src}`);
    this.name = 'ThumbnailMediaUnavailableError';
    this.code = 'THUMBNAIL_MEDIA_UNAVAILABLE';
  }
}

function normalizeRevision(revision) {
  return String(revision ?? 'unversioned');
}

function normalizeLoadedBytes(value, src) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value == null) throw new ThumbnailMediaUnavailableError(src);
  throw new Error(`live media returned invalid bytes: ${src}`);
}

function sourceAvailabilityPolicy(sourceAvailability, src) {
  if (typeof sourceAvailability !== 'function') return AVAILABILITY_CRITICAL;
  try {
    return sourceAvailability(src) === AVAILABILITY_DECORATIVE
      ? AVAILABILITY_DECORATIVE
      : AVAILABILITY_CRITICAL;
  } catch {
    return AVAILABILITY_CRITICAL;
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function immutableSourceSha(src) {
  const value = String(src || '').split('?', 1)[0];
  const match = /^\/api\/(?:media\/|unit-sprites\/)([0-9a-f]{64})(?:\.png)?$/i.exec(value);
  return match ? match[1].toLowerCase() : null;
}

class WeightedLruCache {
  constructor(maxWeight) {
    this.maxWeight = Math.max(1, Number(maxWeight) || 1);
    this.weight = 0;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value, rawWeight) {
    const weight = Math.max(1, Math.floor(Number(rawWeight) || 1));
    const prior = this.entries.get(key);
    if (prior) {
      this.entries.delete(key);
      this.weight -= prior.weight;
    }
    if (weight > this.maxWeight) return false;
    while (this.entries.size && this.weight + weight > this.maxWeight) {
      const oldestKey = this.entries.keys().next().value;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this.weight -= oldest.weight;
    }
    this.entries.set(key, { value, weight });
    this.weight += weight;
    return true;
  }

  stats() {
    return { size: this.entries.size, weight: this.weight, maxWeight: this.maxWeight };
  }
}

class BoundedLruMap {
  constructor(maxEntries) {
    this.maxEntries = Math.max(1, Math.floor(Number(maxEntries) || 1));
    this.entries = new Map();
  }

  get(key) {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key);
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }

  get size() {
    return this.entries.size;
  }
}

class Semaphore {
  constructor(limit) {
    this.limit = Math.max(1, Math.floor(Number(limit) || 1));
    this.active = 0;
    this.waiters = [];
  }

  async run(task) {
    if (this.active >= this.limit) {
      await new Promise((resolve) => this.waiters.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await task();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}

async function mapWithConcurrency(values, limit, mapper) {
  const items = Array.from(values);
  if (!items.length) return [];
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(Number(limit) || 1)));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function pngHeaderDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  // PNGjs fallback temporarily owns decoded.data, ImageData, and a canvas.
  // Keep that multi-copy path bounded to small and native pre-drawn scenes; a
  // larger Skia decode failure is safer to omit/fail than to exhaust the pod.
  if (!width || !height || width * height > MAX_PNG_FALLBACK_PIXELS) return null;
  return { width, height };
}

async function decodeSprite(bytes, src) {
  try {
    return await loadImage(bytes);
  } catch (primaryError) {
    const header = pngHeaderDimensions(bytes);
    if (!header) throw primaryError;
    try {
      // Skia occasionally classifies browser-valid PNGs as SVG. PNGjs provides
      // a bounded decode fallback; the resulting temporary canvas is used only
      // for this server render and never changes the stored/live bytes.
      const { PNG } = require('pngjs');
      const decoded = PNG.sync.read(bytes);
      if (decoded.width !== header.width || decoded.height !== header.height) {
        throw new Error('PNG fallback dimensions differ from IHDR');
      }
      const canvas = createCanvas(decoded.width, decoded.height);
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(decoded.width, decoded.height);
      imageData.data.set(decoded.data);
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    } catch (fallbackError) {
      throw new Error(`live media decode failed for ${src}: ${fallbackError.message || primaryError.message}`);
    }
  }
}

function validateDecodedRaster(image, src, maxRasterPixels) {
  const width = Number(image && image.width);
  const height = Number(image && image.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`live media decode produced invalid dimensions for ${src}`);
  }
  if (width > Math.floor(maxRasterPixels / height)) {
    throw new Error(`live media raster exceeds thumbnail pixel limit: ${src}`);
  }
  return { width, height };
}

class ThumbnailAssetStore {
  constructor({
    decodeSpriteFn = decodeSprite,
    maxCacheWeight = SPRITE_CACHE_MAX_WEIGHT,
    maxSourceBindings = SPRITE_SOURCE_BINDING_MAX,
    maxLoadConcurrency = SPRITE_LOAD_CONCURRENCY,
    maxDecodeConcurrency = SPRITE_DECODE_CONCURRENCY,
    maxRasterPixels = MAX_RASTER_PIXELS,
    sourceLoadLimiter = null,
  } = {}) {
    this.decodeSpriteFn = decodeSpriteFn;
    this.maxRasterPixels = maxRasterPixels;
    this.decoded = new WeightedLruCache(maxCacheWeight);
    this.sourceBindings = new BoundedLruMap(maxSourceBindings);
    this.sourceInflight = new Map();
    this.decodeInflight = new Map();
    this.loadLimiter = sourceLoadLimiter || new Semaphore(maxLoadConcurrency);
    this.decodeLimiter = new Semaphore(maxDecodeConcurrency);
  }

  sourceKey(src, revision, immutableSha) {
    return immutableSha ? `sha256:${immutableSha}` : JSON.stringify([normalizeRevision(revision), src]);
  }

  async load(src, loadDynamicSprite, revision) {
    const source = String(src || '');
    if (typeof loadDynamicSprite !== 'function') throw new Error('live media loader is unavailable');
    const expectedImmutableSha = immutableSourceSha(source);
    const sourceKey = this.sourceKey(source, revision, expectedImmutableSha);
    const boundSha = expectedImmutableSha || this.sourceBindings.get(sourceKey);
    if (boundSha) {
      const cached = this.decoded.get(boundSha);
      if (cached) return cached;
    }

    const existingLoad = this.sourceInflight.get(sourceKey);
    if (existingLoad) return existingLoad;

    const loadPromise = this.loadLimiter.run(async () => {
      const reboundSha = expectedImmutableSha || this.sourceBindings.get(sourceKey);
      if (reboundSha) {
        const cached = this.decoded.get(reboundSha);
        if (cached) return cached;
      }

      const bytes = normalizeLoadedBytes(await loadDynamicSprite(source), source);
      const contentSha = sha256(bytes);
      if (expectedImmutableSha && expectedImmutableSha !== contentSha) {
        throw new Error(`live media hash mismatch for ${source}`);
      }
      if (!expectedImmutableSha) this.sourceBindings.set(sourceKey, contentSha);

      const cached = this.decoded.get(contentSha);
      if (cached) return cached;

      let decodePromise = this.decodeInflight.get(contentSha);
      if (!decodePromise) {
        decodePromise = this.decodeLimiter.run(async () => {
          const image = await this.decodeSpriteFn(bytes, source);
          const { width, height } = validateDecodedRaster(image, source, this.maxRasterPixels);
          // Count both decoded RGBA pixels and encoded input. Some native image
          // implementations retain encoded bytes, so this is intentionally
          // conservative even though the Buffer normally dies after decode.
          const cacheWeight = width * height * 4 + bytes.byteLength;
          this.decoded.set(contentSha, image, cacheWeight);
          return image;
        });
        this.decodeInflight.set(contentSha, decodePromise);
        decodePromise.finally(() => {
          if (this.decodeInflight.get(contentSha) === decodePromise) this.decodeInflight.delete(contentSha);
        }).catch(() => {});
      }
      return decodePromise;
    });
    this.sourceInflight.set(sourceKey, loadPromise);
    loadPromise.finally(() => {
      if (this.sourceInflight.get(sourceKey) === loadPromise) this.sourceInflight.delete(sourceKey);
    }).catch(() => {});
    return loadPromise;
  }

  stats() {
    return {
      decoded: this.decoded.stats(),
      sourceBindings: this.sourceBindings.size,
      sourceInflight: this.sourceInflight.size,
      decodeInflight: this.decodeInflight.size,
    };
  }
}

class ThumbnailFontRegistry {
  constructor({
    globalFonts = GlobalFonts,
    maxSourceBindings = FONT_SOURCE_BINDING_MAX,
    sourceLoadLimiter = null,
  } = {}) {
    this.globalFonts = globalFonts;
    this.registrations = new Map();
    this.sourceBindings = new BoundedLruMap(maxSourceBindings);
    this.sourceInflight = new Map();
    this.sourceLoadLimiter = sourceLoadLimiter || new Semaphore(SPRITE_LOAD_CONCURRENCY);
  }

  async ensure(loadDynamicSprite, revision, fontSrc) {
    if (typeof loadDynamicSprite !== 'function') throw new Error('live media loader is unavailable');
    if (typeof fontSrc !== 'string' || !fontSrc) throw new Error('live thumbnail font is unavailable');
    const sourceKey = JSON.stringify([normalizeRevision(revision), fontSrc]);
    const boundSha = this.sourceBindings.get(sourceKey);
    if (boundSha && this.registrations.has(boundSha)) return this.registrations.get(boundSha).family;

    const existingLoad = this.sourceInflight.get(sourceKey);
    if (existingLoad) return existingLoad;

    const loadPromise = this.sourceLoadLimiter.run(async () => {
      const bytes = normalizeLoadedBytes(await loadDynamicSprite(fontSrc), fontSrc);
      const contentSha = sha256(bytes);
      this.sourceBindings.set(sourceKey, contentSha);
      const existing = this.registrations.get(contentSha);
      if (existing) return existing.family;

      // The alias is content-addressed. Catalog revisions that point at the
      // same font reuse one native registration instead of adding aliases.
      const family = `AW2 Server ${contentSha}`;
      const key = this.globalFonts.register(bytes, family);
      if (!key) throw new Error('live thumbnail font is unavailable');
      this.registrations.set(contentSha, { family, key });
      return family;
    });
    this.sourceInflight.set(sourceKey, loadPromise);
    loadPromise.finally(() => {
      if (this.sourceInflight.get(sourceKey) === loadPromise) this.sourceInflight.delete(sourceKey);
    }).catch(() => {});
    return loadPromise;
  }

  stats() {
    return { registrations: this.registrations.size, sourceBindings: this.sourceBindings.size };
  }
}

const thumbnailSourceLoadLimiter = new Semaphore(SPRITE_LOAD_CONCURRENCY);
const thumbnailAssetStore = new ThumbnailAssetStore({ sourceLoadLimiter: thumbnailSourceLoadLimiter });
const thumbnailFontRegistry = new ThumbnailFontRegistry({ sourceLoadLimiter: thumbnailSourceLoadLimiter });

async function loadSpriteWithAvailability(assetStore, src, loadDynamicSprite, revision, availabilityPolicy) {
  try {
    return await assetStore.load(src, loadDynamicSprite, revision);
  } catch (error) {
    if (availabilityPolicy === AVAILABILITY_DECORATIVE) return null;
    throw error;
  }
}

async function loadSprite(src, loadDynamicSprite, revision, availabilityPolicy) {
  return loadSpriteWithAvailability(
    thumbnailAssetStore,
    src,
    loadDynamicSprite,
    revision,
    availabilityPolicy,
  );
}

function truncate(ctx, text, maxWidth) {
  let s = String(text == null ? '' : text);
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 1 && ctx.measureText(`${s}...`).width > maxWidth) s = s.slice(0, -1);
  return `${s}...`;
}

function drawTiledImage(ctx, img, x, y, width, height, tileWidth, tileHeight) {
  if (!img || !img.width || !img.height) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  for (let yy = y; yy < y + height; yy += tileHeight) {
    for (let xx = x; xx < x + width; xx += tileWidth) {
      ctx.drawImage(img, xx, yy, tileWidth, tileHeight);
    }
  }
  ctx.restore();
}

async function paintBackground(
  ctx,
  backgroundSrc,
  loadDynamicSprite,
  mediaCatalogRevision,
  sourceAvailability,
) {
  if (!backgroundSrc) throw new Error('live world background slot is missing');
  const world = await loadSprite(
    backgroundSrc,
    loadDynamicSprite,
    mediaCatalogRevision,
    sourceAvailabilityPolicy(sourceAvailability, backgroundSrc),
  );
  if (!world) return;
  if (!world.width || !world.height) throw new Error('live world background is invalid');
  const cover = Math.max(CARD_W / world.width, CARD_H / world.height);
  const w = world.width * cover;
  const h = world.height * cover;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(world, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);

  const sideScrim = ctx.createLinearGradient(0, 0, CARD_W, 0);
  sideScrim.addColorStop(0, 'rgba(2,8,13,0.72)');
  sideScrim.addColorStop(0.46, 'rgba(3,15,26,0.24)');
  sideScrim.addColorStop(1, 'rgba(2,7,12,0.78)');
  ctx.fillStyle = sideScrim;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const bottomFade = ctx.createLinearGradient(0, CARD_H * 0.5, 0, CARD_H);
  bottomFade.addColorStop(0, 'rgba(3,9,15,0)');
  bottomFade.addColorStop(1, 'rgba(3,9,15,0.72)');
  ctx.fillStyle = bottomFade;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

async function paintTitleBar(
  ctx,
  screenName,
  loadDynamicSprite,
  mediaCatalogRevision,
  fontFamily,
  sourceAvailability,
  uiMedia,
) {
  const [wood, band, diamond, shield] = await mapWithConcurrency([
    uiMedia.wood,
    uiMedia.band,
    uiMedia.diamond,
    uiMedia.shield,
  ], SPRITE_LOAD_CONCURRENCY, (src) => (
    loadSprite(
      src,
      loadDynamicSprite,
      mediaCatalogRevision,
      sourceAvailabilityPolicy(sourceAvailability, src),
    )
  ));

  ctx.imageSmoothingEnabled = false;
  drawTiledImage(ctx, wood, 0, 0, CARD_W, TITLEBAR_H, 1024, 1024);
  drawTiledImage(ctx, band, 0, TITLEBAR_H - TITLEBAR_RULE_H, CARD_W, TITLEBAR_RULE_H, 16, TITLEBAR_RULE_H);
  if (diamond) {
    const dh = 26;
    const dw = diamond.width * (dh / diamond.height);
    ctx.drawImage(diamond, (CARD_W - dw) / 2, TITLEBAR_H - dh, dw, dh);
  }

  const mark = 54;
  const markX = 32;
  const markY = 8;
  ctx.imageSmoothingEnabled = true;
  if (shield) ctx.drawImage(shield, markX, markY, mark, mark);

  const textX = markX + mark + 14;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = '#02070b';
  ctx.shadowOffsetY = 2;
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f0eadb';
  ctx.font = `25px "${fontFamily}"`;
  ctx.fillText('CHESS TACTICS', textX, 35);
  ctx.fillStyle = '#79d3ff';
  ctx.font = `15px "${fontFamily}"`;
  ctx.fillText(String(screenName || 'SKIRMISH').toUpperCase(), textX, 57);
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetY = 0;
}

function projectedDrawRect(op, projection) {
  return {
    x: projection.originX + (op.dx - projection.minX) * projection.scale,
    y: projection.originY + (op.dy - projection.minY) * projection.scale,
    width: op.dw * projection.scale,
    height: op.dh * projection.scale,
  };
}

function intersectPixelRect(rect, clipRect) {
  const left = Math.max(Math.floor(rect.x), Math.floor(clipRect.x));
  const top = Math.max(Math.floor(rect.y), Math.floor(clipRect.y));
  const right = Math.min(
    Math.ceil(rect.x + rect.width),
    Math.ceil(clipRect.x + clipRect.width),
  );
  const bottom = Math.min(
    Math.ceil(rect.y + rect.height),
    Math.ceil(clipRect.y + clipRect.height),
  );
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function withThumbnailOpacity(target, opacity, draw) {
  const factor = opacity == null ? 1 : Math.max(0, Math.min(1, opacity));
  if (factor >= 1) {
    draw();
    return;
  }
  const previous = target.globalAlpha;
  target.globalAlpha = previous * factor;
  try {
    draw();
  } finally {
    target.globalAlpha = previous;
  }
}

function paintPredrawnThumbnailOp(
  target,
  op,
  img,
  projection,
  offsetX = 0,
  offsetY = 0,
  createRasterCanvas = createCanvas,
) {
  const transform = op.predrawnTransform;
  if (!transform) throw new Error('pre-drawn thumbnail op has no registered transform');
  const projected = projectedDrawRect(op, projection);
  const left = Math.floor(Math.min(projected.x, projected.x + projected.width));
  const top = Math.floor(Math.min(projected.y, projected.y + projected.height));
  const right = Math.ceil(Math.max(projected.x, projected.x + projected.width));
  const bottom = Math.ceil(Math.max(projected.y, projected.y + projected.height));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;

  const sourceCanvas = createRasterCanvas(transform.frameWidth, transform.frameHeight);
  const sourceContext = sourceCanvas.getContext('2d');
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.drawImage(img, 0, 0, transform.frameWidth, transform.frameHeight);
  const source = sourceContext.getImageData(0, 0, transform.frameWidth, transform.frameHeight);
  const pixels = rasterizePredrawnBoardPixels({
    width: transform.frameWidth,
    height: transform.frameHeight,
    data: source.data,
  }, transform, {
    minX: projection.minX + (left - projection.originX) / projection.scale,
    minY: projection.minY + (top - projection.originY) / projection.scale,
    width: width / projection.scale,
    height: height / projection.scale,
    pixelWidth: width,
    pixelHeight: height,
  });

  const rasterCanvas = createRasterCanvas(width, height);
  const rasterContext = rasterCanvas.getContext('2d');
  const output = rasterContext.createImageData(width, height);
  output.data.set(pixels);
  rasterContext.putImageData(output, 0, 0);
  target.drawImage(rasterCanvas, left - offsetX, top - offsetY);
  return { x: left, y: top, width, height };
}

function paintThumbnailOp(target, op, img, projection, offsetX = 0, offsetY = 0) {
  const projected = projectedDrawRect(op, projection);
  const dx = projected.x - offsetX;
  const dy = projected.y - offsetY;
  const dw = projected.width;
  const dh = projected.height;
  const clipped = Array.isArray(op.clipPolygons) && op.clipPolygons.length > 0;

  withThumbnailOpacity(target, op.opacity, () => {
    if (op.predrawnTransform) {
      paintPredrawnThumbnailOp(target, op, img, projection, offsetX, offsetY);
      return;
    }
    if (clipped) {
      target.save();
      target.beginPath();
      for (const polygon of op.clipPolygons) {
        if (!Array.isArray(polygon) || polygon.length < 6) continue;
        target.moveTo(
          projection.originX + (polygon[0] - projection.minX) * projection.scale - offsetX,
          projection.originY + (polygon[1] - projection.minY) * projection.scale - offsetY,
        );
        for (let index = 2; index + 1 < polygon.length; index += 2) {
          target.lineTo(
            projection.originX + (polygon[index] - projection.minX) * projection.scale - offsetX,
            projection.originY + (polygon[index + 1] - projection.minY) * projection.scale - offsetY,
          );
        }
        target.closePath();
      }
      target.clip();
    }

    try {
      if (op.flipX) {
        target.save();
        target.translate(dx + dw, dy);
        target.scale(-1, 1);
      }
      try {
        const drawX = op.flipX ? 0 : dx;
        const drawY = op.flipX ? 0 : dy;
        if (op.contain) {
          const boxW = op.dw;
          const boxH = op.dh;
          const natW = img.width || boxW;
          const natH = img.height || boxH;
          const fit = Math.min(boxW / natW, boxH / natH);
          const w = natW * fit;
          const h = natH * fit;
          const cx = drawX + (op.dw - w) * projection.scale / 2;
          const cy = drawY + (op.dh - h) * projection.scale / 2;
          target.drawImage(img, cx, cy, w * projection.scale, h * projection.scale);
        } else if (op.sw != null) {
          target.drawImage(
            img,
            op.sx || 0,
            op.sy || 0,
            op.sw,
            op.sh || op.dh,
            drawX,
            drawY,
            dw,
            dh,
          );
        } else {
          target.drawImage(img, drawX, drawY, dw, dh);
        }
      } finally {
        if (op.flipX) target.restore();
      }
    } finally {
      if (clipped) target.restore();
    }
  });
}

function paintOccludedThumbnailOp({
  target,
  op,
  image,
  masks,
  images,
  projection,
  clipRect,
  createScratchCanvas = createCanvas,
}) {
  const scratchRect = intersectPixelRect(projectedDrawRect(op, projection), clipRect);
  if (!scratchRect) return null;

  const scratch = createScratchCanvas(scratchRect.width, scratchRect.height);
  const scratchCtx = scratch.getContext('2d');
  scratchCtx.imageSmoothingEnabled = false;
  scratchCtx.globalCompositeOperation = 'source-over';
  paintThumbnailOp(scratchCtx, op, image, projection, scratchRect.x, scratchRect.y);
  scratchCtx.save();
  scratchCtx.globalCompositeOperation = 'destination-out';
  for (const mask of masks) {
    const maskImage = images.get(mask.src);
    if (maskImage) {
      paintThumbnailOp(scratchCtx, mask, maskImage, projection, scratchRect.x, scratchRect.y);
    }
  }
  scratchCtx.restore();
  target.drawImage(scratch, scratchRect.x, scratchRect.y);
  return scratchRect;
}

async function renderLevelCard({
  plan,
  title,
  subtitle,
  screenName,
  backgroundSrc,
  loadDynamicSprite,
  mediaCatalogRevision,
  sourceAvailability,
  uiMedia,
  fontSrc,
}) {
  const renderRevision = normalizeRevision(mediaCatalogRevision);
  let fontFamily;
  try {
    fontFamily = await thumbnailFontRegistry.ensure(loadDynamicSprite, renderRevision, fontSrc);
  } catch (error) {
    if (sourceAvailabilityPolicy(sourceAvailability, fontSrc) === AVAILABILITY_DECORATIVE) {
      fontFamily = 'sans-serif';
    } else throw error;
  }
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');

  await paintBackground(
    ctx,
    backgroundSrc,
    loadDynamicSprite,
    renderRevision,
    sourceAvailability,
    uiMedia,
  );

  const { ops, bounds } = plan;
  const occlusionMasks = Array.isArray(plan.occlusionMasks) ? plan.occlusionMasks : [];
  const fitBounds = plan.framingBounds || bounds;
  const heroW = CARD_W - PAD * 2;
  const heroH = HERO_BOTTOM - HERO_TOP;
  const scale = Math.min(heroW / Math.max(1, fitBounds.width), heroH / Math.max(1, fitBounds.height));
  const drawnW = fitBounds.width * scale;
  const drawnH = fitBounds.height * scale;
  const originX = PAD + (heroW - drawnW) / 2;
  const originY = HERO_TOP + (heroH - drawnH) / 2;
  ctx.imageSmoothingEnabled = false;

  const images = new Map();
  const uniqueSources = [...new Set([...ops, ...occlusionMasks].map((op) => op.src))];
  const loadedImages = await mapWithConcurrency(uniqueSources, SPRITE_LOAD_CONCURRENCY, (src) => (
    loadSprite(
      src,
      loadDynamicSprite,
      renderRevision,
      sourceAvailabilityPolicy(sourceAvailability, src),
    )
  ));
  uniqueSources.forEach((src, index) => images.set(src, loadedImages[index]));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HERO_TOP, CARD_W, heroH);
  ctx.clip();
  const projection = {
    originX,
    originY,
    minX: fitBounds.minX,
    minY: fitBounds.minY,
    scale,
  };
  const heroClipRect = { x: 0, y: HERO_TOP, width: CARD_W, height: heroH };
  for (const op of ops) {
    const img = images.get(op.src);
    if (!img) continue;
    const masksInFront = op.layer === 'scene'
      ? predrawnOcclusionMasksInFront(op, occlusionMasks)
      : [];
    if (!masksInFront.length) {
      paintThumbnailOp(ctx, op, img, projection);
      continue;
    }
    paintOccludedThumbnailOp({
      target: ctx,
      op,
      image: img,
      masks: masksInFront,
      images,
      projection,
      clipRect: heroClipRect,
    });
  }
  ctx.restore();

  const titleScrim = ctx.createLinearGradient(0, 420, 0, CARD_H);
  titleScrim.addColorStop(0, 'rgba(2,7,12,0)');
  titleScrim.addColorStop(0.58, 'rgba(2,7,12,0.58)');
  titleScrim.addColorStop(1, 'rgba(2,7,12,0.9)');
  ctx.fillStyle = titleScrim;
  ctx.fillRect(0, 420, CARD_W, CARD_H - 420);

  await paintTitleBar(
    ctx,
    screenName || 'Level',
    loadDynamicSprite,
    renderRevision,
    fontFamily,
    sourceAvailability,
  );

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f2f6f7';
  ctx.font = `56px "${fontFamily}"`;
  ctx.fillText(truncate(ctx, title || 'Chess Tactics', CARD_W - PAD * 2), PAD, 560);
  if (subtitle) {
    ctx.fillStyle = '#9fb2ba';
    ctx.font = `26px "${fontFamily}"`;
    ctx.fillText(truncate(ctx, subtitle, CARD_W - PAD * 2), PAD, 598);
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderLevelCard,
  decodeSprite,
  CARD_W,
  CARD_H,
  __testing: {
    BoundedLruMap,
    WeightedLruCache,
    Semaphore,
    ThumbnailAssetStore,
    ThumbnailFontRegistry,
    ThumbnailMediaUnavailableError,
    immutableSourceSha,
    loadSpriteWithAvailability,
    mapWithConcurrency,
    paintOccludedThumbnailOp,
    paintPredrawnThumbnailOp,
    paintThumbnailOp,
    pngHeaderDimensions,
    projectedDrawRect,
    sha256,
    sourceAvailabilityPolicy,
    constants: {
      AVAILABILITY_CRITICAL,
      AVAILABILITY_DECORATIVE,
      MAX_RASTER_PIXELS,
      MAX_PNG_FALLBACK_PIXELS,
      SPRITE_CACHE_MAX_WEIGHT,
      SPRITE_DECODE_CONCURRENCY,
      SPRITE_LOAD_CONCURRENCY,
    },
  },
};
