// Server-side social-card compositor for level/map OG thumbnails.
// The draw plan comes from backend/generated/board-render.cjs, built from the
// same pure render geometry the in-app LevelThumbnail uses.

const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const CARD_W = 1200;
const CARD_H = 630;
const PAD = 56;
const HERO_TOP = 100;
const HERO_BOTTOM = 500;
const UNIT_IMG_MAX_W = 78;
const UNIT_IMG_MAX_H = 92;

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
async function loadSprite(frontendDir, src) {
  const rel = String(src).replace(/^\/+/, '').split('/');
  const abs = path.join(frontendDir, ...rel);
  if (spriteCache.has(abs)) return spriteCache.get(abs);
  let img = null;
  try { img = await loadImage(abs); } catch { img = null; }
  spriteCache.set(abs, img);
  return img;
}

function truncate(ctx, text, maxWidth) {
  let s = String(text == null ? '' : text);
  if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 1 && ctx.measureText(`${s}...`).width > maxWidth) s = s.slice(0, -1);
  return `${s}...`;
}

async function paintBackground(ctx, frontendDir, backgroundSrc) {
  let drewWorld = false;
  if (backgroundSrc) {
    const world = await loadSprite(frontendDir, backgroundSrc);
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

async function renderLevelCard({ plan, frontendDir, title, subtitle, backgroundSrc }) {
  ensureFont(frontendDir);
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');

  await paintBackground(ctx, frontendDir, backgroundSrc);

  const { ops, bounds } = plan;
  const heroW = CARD_W - PAD * 2;
  const heroH = HERO_BOTTOM - HERO_TOP;
  const scale = Math.min(heroW / Math.max(1, bounds.width), heroH / Math.max(1, bounds.height));
  const drawnW = bounds.width * scale;
  const drawnH = bounds.height * scale;
  const originX = PAD + (heroW - drawnW) / 2;
  const originY = HERO_TOP + (heroH - drawnH) / 2;
  ctx.imageSmoothingEnabled = false;

  const images = new Map();
  await Promise.all([...new Set(ops.map((op) => op.src))].map(async (src) => {
    images.set(src, await loadSprite(frontendDir, src));
  }));

  for (const op of ops) {
    const img = images.get(op.src);
    if (!img) continue;
    const dx = originX + (op.dx - bounds.minX) * scale;
    const dy = originY + (op.dy - bounds.minY) * scale;
    if (op.contain) {
      const boxW = Math.min(op.dw, UNIT_IMG_MAX_W);
      const boxH = Math.min(op.dh, UNIT_IMG_MAX_H);
      const natW = img.width || boxW;
      const natH = img.height || boxH;
      const fit = Math.min(boxW / natW, boxH / natH);
      const w = natW * fit;
      const h = natH * fit;
      const cx = op.dx + (op.dw - w) / 2;
      const cy = op.dy + (op.dh - h) / 2;
      ctx.drawImage(img, originX + (cx - bounds.minX) * scale, originY + (cy - bounds.minY) * scale, w * scale, h * scale);
    } else if (op.sw != null) {
      ctx.drawImage(img, op.sx || 0, op.sy || 0, op.sw, op.sh || op.dh, dx, dy, op.dw * scale, op.dh * scale);
    } else {
      ctx.drawImage(img, dx, dy, op.dw * scale, op.dh * scale);
    }
  }

  ctx.fillStyle = '#e8c86a';
  ctx.fillRect(PAD, 44, 22, 22);
  ctx.fillStyle = '#7fd4c8';
  ctx.font = `22px "${fontFamily}"`;
  ctx.textBaseline = 'middle';
  ctx.fillText('CHESS TACTICS', PAD + 34, 56);

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

module.exports = { renderLevelCard, CARD_W, CARD_H };
