// Server-side board thumbnail compositor — renders a level's OG card (1200x630 PNG) in Node with
// NO browser. The board geometry comes from the bundled pure render plan (generated/board-render.cjs,
// the SAME code the live editor uses); this file only composites: it loads the committed sprite PNGs
// off disk, draws them at the planned positions with @napi-rs/canvas, letterboxes the board into a
// hero area, and paints the title/subtitle/wordmark. Pixel art stays crisp (imageSmoothingEnabled
// off). Used by the on-demand GET /assets/level-thumb/:key.png route in server.js.

const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// OG card geometry (1200x630 is the Discord/Twitter summary_large_image size).
const CARD_W = 1200;
const CARD_H = 630;
const PAD = 56;
const HERO_TOP = 100; // below the wordmark
const HERO_BOTTOM = 500; // above the title block
// Unit sprite object-fit:contain box — mirrors bakeBoardThumbnail's UNIT_IMG_MAX_W/H (fixed art frame).
const UNIT_IMG_MAX_W = 78;
const UNIT_IMG_MAX_H = 92;

// The pixel-art display font, registered once from the committed otf. Falls back to a system stack
// if absent so a render never fails on a missing font.
let fontFamily = 'sans-serif';
let fontRegistered = false;
function ensureFont(frontendDir) {
  if (fontRegistered) return;
  fontRegistered = true;
  try {
    const otf = path.join(frontendDir, 'assets', 'fonts', 'advance-wars-2-gba', 'advance-wars-2-gba.otf');
    if (fs.existsSync(otf) && GlobalFonts.registerFromPath(otf, 'AW2 Server')) fontFamily = 'AW2 Server';
  } catch { /* keep the fallback font */ }
}

// Decoded-sprite cache: the same tile/unit PNGs recur across every board, so decode each once.
// Keyed by absolute disk path; null marks a known-missing sprite (skipped, like the client bake).
const spriteCache = new Map();
async function loadSprite(frontendDir, src) {
  // src is origin-absolute ('/assets/units/king/navy-blue/south.png'); map to the served dir on disk.
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
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

/**
 * Render a level's OG card to a PNG Buffer.
 * @param {{ plan: {ops:Array,bounds:{minX:number,minY:number,width:number,height:number}},
 *           frontendDir: string, title: string, subtitle?: string, backgroundSrc?: string }} args
 */
async function renderLevelCard({ plan, frontendDir, title, subtitle, backgroundSrc }) {
  ensureFont(frontendDir);
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');

  // Background: the game's world backdrop (cover-fit, centered) so the card reads like the played
  // board sitting in its scene — the same image .skirmish-screen::before uses. Falls back to a flat
  // dark gradient if the scene can't be loaded.
  let drewWorld = false;
  if (backgroundSrc) {
    const world = await loadSprite(frontendDir, backgroundSrc);
    if (world && world.width && world.height) {
      const cover = Math.max(CARD_W / world.width, CARD_H / world.height);
      const w = world.width * cover;
      const h = world.height * cover;
      ctx.imageSmoothingEnabled = true; // photographic scene, not pixel art
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
  // Dark-edge scrim (mirrors the game's ::before 90° gradient) + a stronger bottom fade, so the
  // wordmark and title stay legible over a busy scene.
  const scrim = ctx.createLinearGradient(0, 0, CARD_W, 0);
  scrim.addColorStop(0, 'rgba(2,8,13,0.72)');
  scrim.addColorStop(0.46, 'rgba(3,15,26,0.24)');
  scrim.addColorStop(1, 'rgba(2,7,12,0.78)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const fade = ctx.createLinearGradient(0, CARD_H * 0.5, 0, CARD_H);
  fade.addColorStop(0, 'rgba(3,9,15,0)');
  fade.addColorStop(1, 'rgba(3,9,15,0.72)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Board: letterbox the native-size plan into the hero rect, nearest-neighbour (pixel art).
  const { ops, bounds } = plan;
  const heroW = CARD_W - PAD * 2;
  const heroH = HERO_BOTTOM - HERO_TOP;
  const scale = Math.min(heroW / Math.max(1, bounds.width), heroH / Math.max(1, bounds.height));
  const drawnW = bounds.width * scale;
  const drawnH = bounds.height * scale;
  const originX = PAD + (heroW - drawnW) / 2;
  const originY = HERO_TOP + (heroH - drawnH) / 2;
  ctx.imageSmoothingEnabled = false;

  // Decode every unique sprite once, then composite in plan order (already z-sorted).
  const uniqueSrcs = [...new Set(ops.map((o) => o.src))];
  const images = new Map();
  await Promise.all(uniqueSrcs.map(async (src) => { images.set(src, await loadSprite(frontendDir, src)); }));

  for (const op of ops) {
    const img = images.get(op.src);
    if (!img) continue;
    if (op.contain) {
      // object-fit:contain into the unit seat box, centred (mirrors bakeBoardThumbnail).
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
      // Sprite-sheet frame (ground-cover tuft): draw the source sub-rect (frame 0) into the dest.
      ctx.drawImage(img, op.sx || 0, op.sy || 0, op.sw, op.sh,
        originX + (op.dx - bounds.minX) * scale, originY + (op.dy - bounds.minY) * scale, op.dw * scale, op.dh * scale);
    } else {
      ctx.drawImage(img, originX + (op.dx - bounds.minX) * scale, originY + (op.dy - bounds.minY) * scale, op.dw * scale, op.dh * scale);
    }
  }

  // Wordmark (top-left): a gold pip + "CHESS TACTICS".
  ctx.fillStyle = '#e8c86a';
  ctx.fillRect(PAD, 44, 22, 22);
  ctx.fillStyle = '#7fd4c8';
  ctx.font = `22px "${fontFamily}"`;
  ctx.textBaseline = 'middle';
  ctx.fillText('CHESS TACTICS', PAD + 34, 56);

  // Title (level name) + subtitle (campaign · objective), bottom-left.
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
