// Server-side social-card compositor for level/map OG thumbnails.
// The draw plan comes from @chess-tactics/board-render, the same DOM-free
// render geometry the in-app LevelThumbnail uses.

const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const CARD_W = 1200;
const CARD_H = 630;
const PAD = 56;
const TITLEBAR_H = 84;
const TITLEBAR_RULE_H = 14;
const HERO_TOP = TITLEBAR_H;
const HERO_BOTTOM = CARD_H;

let fontFamily = 'sans-serif';
let fontRegistered = false;
function ensureFont(frontendDir) {
  if (fontRegistered) return;
  fontRegistered = true;
  try {
    const otf = path.join(frontendDir, 'assets', 'fonts', 'advance-wars-2-gba', 'advance-wars-2-gba.otf');
    if (fs.existsSync(otf) && GlobalFonts.registerFromPath(otf, 'AW2 Server')) fontFamily = 'AW2 Server';
  } catch {
    // Keep the fallback font; a missing font should never break an unfurl.
  }
}

const spriteCache = new Map();
const SPRITE_CACHE_MAX = 64;
function setCachedSprite(key, image) {
  if (spriteCache.has(key)) spriteCache.delete(key);
  spriteCache.set(key, image);
  while (spriteCache.size > SPRITE_CACHE_MAX) spriteCache.delete(spriteCache.keys().next().value);
}

async function loadSprite(frontendDir, src, loadDynamicSprite) {
  const rel = String(src).replace(/^\/+/, '').split('/');
  const abs = path.join(frontendDir, ...rel);
  const dynamic = String(src).startsWith('/api/unit-sprites/');
  const cacheKey = dynamic ? String(src) : abs;
  if (spriteCache.has(cacheKey)) {
    const image = spriteCache.get(cacheKey);
    spriteCache.delete(cacheKey);
    spriteCache.set(cacheKey, image);
    return image;
  }
  let img = null;
  try {
    if (dynamic && typeof loadDynamicSprite === 'function') {
      const bytes = await loadDynamicSprite(src);
      if (bytes) img = await loadImage(bytes);
    } else {
      img = await loadImage(abs);
    }
  } catch { img = null; }
  if (img || !dynamic) setCachedSprite(cacheKey, img);
  return img;
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

async function paintBackground(ctx, frontendDir, backgroundSrc, loadDynamicSprite) {
  let drewWorld = false;
  if (backgroundSrc) {
    const world = await loadSprite(frontendDir, backgroundSrc, loadDynamicSprite);
    if (world && world.width && world.height) {
      const cover = Math.max(CARD_W / world.width, CARD_H / world.height);
      const w = world.width * cover;
      const h = world.height * cover;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(world, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
      drewWorld = true;
    }
  }
  if (!drewWorld) {
    const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
    bg.addColorStop(0, '#0c1620');
    bg.addColorStop(0.62, '#06101a');
    bg.addColorStop(1, '#05090d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

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

async function paintTitleBar(ctx, frontendDir, screenName, loadDynamicSprite) {
  const [wood, band, diamond, shield] = await Promise.all([
    loadSprite(frontendDir, '/assets/ui/surfaces/hybrid-wood-oak.png', loadDynamicSprite),
    loadSprite(frontendDir, '/assets/ui/titlebar/band-forged.png', loadDynamicSprite),
    loadSprite(frontendDir, '/assets/ui/titlebar/joint-diamond-forged.png', loadDynamicSprite),
    loadSprite(frontendDir, '/assets/ui/kit/icons/brand-shield.png', loadDynamicSprite),
  ]);

  ctx.imageSmoothingEnabled = false;
  if (wood) drawTiledImage(ctx, wood, 0, 0, CARD_W, TITLEBAR_H, 1024, 1024);
  else {
    ctx.fillStyle = '#22170e';
    ctx.fillRect(0, 0, CARD_W, TITLEBAR_H);
  }
  if (band) drawTiledImage(ctx, band, 0, TITLEBAR_H - TITLEBAR_RULE_H, CARD_W, TITLEBAR_RULE_H, 16, TITLEBAR_RULE_H);
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

function withOpacity(ctx, opacity, draw) {
  const factor = opacity == null ? 1 : Math.max(0, Math.min(1, opacity));
  if (factor >= 1) {
    draw();
    return;
  }
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * factor;
  try {
    draw();
  } finally {
    ctx.globalAlpha = previous;
  }
}

function withClipPolygons(ctx, op, originX, originY, fitBounds, scale, draw) {
  if (!Array.isArray(op.clipPolygons) || op.clipPolygons.length === 0) {
    draw();
    return;
  }
  ctx.save();
  ctx.beginPath();
  for (const polygon of op.clipPolygons) {
    if (!Array.isArray(polygon) || polygon.length < 6) continue;
    ctx.moveTo(originX + (polygon[0] - fitBounds.minX) * scale, originY + (polygon[1] - fitBounds.minY) * scale);
    for (let index = 2; index + 1 < polygon.length; index += 2) {
      ctx.lineTo(originX + (polygon[index] - fitBounds.minX) * scale, originY + (polygon[index + 1] - fitBounds.minY) * scale);
    }
    ctx.closePath();
  }
  ctx.clip();
  try {
    draw();
  } finally {
    ctx.restore();
  }
}

function withFlipX(ctx, op, originX, originY, fitBounds, scale, draw) {
  const dx = originX + (op.dx - fitBounds.minX) * scale;
  const dy = originY + (op.dy - fitBounds.minY) * scale;
  if (!op.flipX) {
    draw(dx, dy);
    return;
  }
  ctx.save();
  ctx.translate(dx + op.dw * scale, dy);
  ctx.scale(-1, 1);
  try {
    draw(0, 0);
  } finally {
    ctx.restore();
  }
}

function paintBoardThumbnailOp(ctx, img, op, originX, originY, fitBounds, scale) {
  withOpacity(ctx, op.opacity, () => {
    withClipPolygons(ctx, op, originX, originY, fitBounds, scale, () => {
      withFlipX(ctx, op, originX, originY, fitBounds, scale, (dx, dy) => {
        if (op.contain) {
          const boxW = op.dw;
          const boxH = op.dh;
          const natW = img.width || boxW;
          const natH = img.height || boxH;
          const fit = Math.min(boxW / natW, boxH / natH);
          const w = natW * fit;
          const h = natH * fit;
          const cx = dx + (op.dw - w) * scale / 2;
          const cy = dy + (op.dh - h) * scale / 2;
          ctx.drawImage(img, cx, cy, w * scale, h * scale);
        } else if (op.sw != null) {
          ctx.drawImage(img, op.sx || 0, op.sy || 0, op.sw, op.sh || op.dh, dx, dy, op.dw * scale, op.dh * scale);
        } else {
          ctx.drawImage(img, dx, dy, op.dw * scale, op.dh * scale);
        }
      });
    });
  });
}

async function renderLevelCard({ plan, frontendDir, title, subtitle, screenName, backgroundSrc, loadDynamicSprite }) {
  ensureFont(frontendDir);
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');

  await paintBackground(ctx, frontendDir, backgroundSrc, loadDynamicSprite);

  const { ops, bounds } = plan;
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
  await Promise.all([...new Set(ops.map((op) => op.src))].map(async (src) => {
    images.set(src, await loadSprite(frontendDir, src, loadDynamicSprite));
  }));

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HERO_TOP, CARD_W, heroH);
  ctx.clip();
  for (const op of ops) {
    const img = images.get(op.src);
    if (!img) continue;
    paintBoardThumbnailOp(ctx, img, op, originX, originY, fitBounds, scale);
  }
  ctx.restore();

  const titleScrim = ctx.createLinearGradient(0, 420, 0, CARD_H);
  titleScrim.addColorStop(0, 'rgba(2,7,12,0)');
  titleScrim.addColorStop(0.58, 'rgba(2,7,12,0.58)');
  titleScrim.addColorStop(1, 'rgba(2,7,12,0.9)');
  ctx.fillStyle = titleScrim;
  ctx.fillRect(0, 420, CARD_W, CARD_H - 420);

  await paintTitleBar(ctx, frontendDir, screenName || 'Level', loadDynamicSprite);

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

module.exports = { renderLevelCard, paintBoardThumbnailOp, CARD_W, CARD_H };
