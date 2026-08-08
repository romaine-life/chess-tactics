// Record the board-assembly beat as a filmstrip: navigate a real /play route and record the
// live scene canvas frame by frame from inside the page, then tile chosen frames into one
// labelled strip. Reviewing a drop needs the frames BETWEEN the two settled states, which a
// single settled screenshot can never show, and a CDP screenshot loop is far too slow to
// sample a ~620ms fall.
//
//   node scripts/capture-board-assembly.mjs <url> [--out <path>] [--size WxH]
//                                           [--frames 10] [--record 4000] [--scale 0.6]
//
// Recording starts on the first frame whose canvas has any painted pixels — the board reveal —
// so the strip always opens on the entrance rather than on however long art decode happened
// to take. Every frame comes from one live run, so this is a recording of the real transition.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const url = argv[0];
const flag = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? (argv[i + 1] ?? true) : def; };
const out = String(flag('out', 'tmp-shots/board-assembly.png'));
const [w, h] = String(flag('size', '1100x760')).split('x').map(Number);
const selector = String(flag('selector', 'canvas.tileset-scene-layer'));
const wanted = Number(flag('frames', 10));
const recordMs = Number(flag('record', 4000));
const scale = Number(flag('scale', 0.6));

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!url || url.startsWith('--')) {
  console.error('usage: capture-board-assembly <url> [--out path] [--size WxH] [--frames n] [--record ms] [--scale n]');
  process.exit(2);
}
if (!executablePath) { console.error('No Chrome/Edge found.'); process.exit(1); }
mkdirSync(dirname(out), { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  userDataDir: mkdtempSync(join(tmpdir(), 'ct-assembly-')),
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars',
    '--host-resolver-rules=MAP *.localhost 127.0.0.1'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector(selector, { timeout: 90_000 });

  const recorded = await page.evaluate(async (sel, budgetMs, downscale) => {
    const scene = document.querySelector(sel);
    if (!scene) return { error: 'no canvas' };
    // Terrain and scene are separate stacked compositors. Recording only one of them produces a
    // strip on a void, which is unreadable for judging where a prop is relative to its tile — so
    // composite every board canvas in DOM (paint) order, honouring their laid-out offsets.
    const layers = () => [...document.querySelectorAll('canvas.tileset-terrain-layer, canvas.tileset-scene-layer')];
    const frames = [];
    const scratch = document.createElement('canvas');
    const scratchCtx = scratch.getContext('2d');
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 64;
    const probeCtx = probe.getContext('2d', { willReadFrequently: true });
    const painted = () => {
      if (!scene.width || !scene.height) return false;
      probeCtx.clearRect(0, 0, 64, 64);
      probeCtx.drawImage(scene, 0, 0, scene.width, scene.height, 0, 0, 64, 64);
      const { data } = probeCtx.getImageData(0, 0, 64, 64);
      for (let i = 3; i < data.length; i += 4) if (data[i] > 8) return true;
      return false;
    };

    await new Promise((resolve) => {
      let start = null;
      let frame = null;
      const tick = (timeMs) => {
        if (start == null) {
          if (!painted()) { requestAnimationFrame(tick); return; }
          start = timeMs;
          const rects = layers().map((layer) => layer.getBoundingClientRect());
          frame = {
            left: Math.min(...rects.map((r) => r.left)),
            top: Math.min(...rects.map((r) => r.top)),
            right: Math.max(...rects.map((r) => r.right)),
            bottom: Math.max(...rects.map((r) => r.bottom)),
          };
          scratch.width = Math.max(1, Math.round((frame.right - frame.left) * downscale));
          scratch.height = Math.max(1, Math.round((frame.bottom - frame.top) * downscale));
        }
        scratchCtx.fillStyle = '#0a0e13';
        scratchCtx.fillRect(0, 0, scratch.width, scratch.height);
        for (const layer of layers()) {
          const rect = layer.getBoundingClientRect();
          scratchCtx.drawImage(
            layer,
            (rect.left - frame.left) * downscale,
            (rect.top - frame.top) * downscale,
            rect.width * downscale,
            rect.height * downscale,
          );
        }
        frames.push({ at: Math.round(timeMs - start), data: scratch.toDataURL('image/jpeg', 0.85) });
        if (timeMs - start >= budgetMs) { resolve(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { frames };
  }, selector, recordMs, scale);

  if (recorded.error) throw new Error(recorded.error);
  const all = recorded.frames;
  if (!all.length) throw new Error('recorded no frames');

  // Even sample across the recording so the strip covers the whole beat rather than crowding
  // whichever section happened to render fastest.
  const picked = Array.from({ length: Math.min(wanted, all.length) }, (_, index) =>
    all[Math.round((index * (all.length - 1)) / Math.max(1, Math.min(wanted, all.length) - 1))]);

  const buffers = picked.map((frame) => Buffer.from(frame.data.split(',')[1], 'base64'));
  const metas = await Promise.all(buffers.map((buffer) => sharp(buffer).metadata()));
  const cellW = Math.max(...metas.map((meta) => meta.width));
  const cellH = Math.max(...metas.map((meta) => meta.height));
  const columns = Math.min(5, picked.length);
  const rows = Math.ceil(picked.length / columns);
  const label = 26;
  const gap = 8;

  const composites = [];
  picked.forEach((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = gap + column * (cellW + gap);
    const top = gap + row * (cellH + label + gap);
    composites.push({ input: buffers[index], left, top: top + label });
    composites.push({
      input: Buffer.from(
        `<svg width="${cellW}" height="${label}"><text x="4" y="18" font-family="monospace" font-size="17" fill="#8fe3ff">+${frame.at}ms</text></svg>`,
      ),
      left,
      top,
    });
  });

  await sharp({
    create: {
      width: gap + columns * (cellW + gap),
      height: gap + rows * (cellH + label + gap),
      channels: 4,
      background: '#0a0e13',
    },
  }).composite(composites).png().toFile(out);

  console.log(`wrote ${out} — ${picked.length}/${all.length} frames spanning ${all[all.length - 1].at}ms`);
} finally {
  await browser.close();
}
