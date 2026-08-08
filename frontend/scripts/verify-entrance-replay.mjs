// Prove a Studio entrance actually PLAYS, and plays AGAIN. A screenshot gated on the element
// existing proves it mounted, which is not the same claim and is how a dead replay shipped.
//
//   node scripts/verify-entrance-replay.mjs <studio-url> [--button "Play entrance"]
//
// Presses the button, samples the previewed sprite's own screen position every frame, and fails
// unless it travelled a real distance and came to rest. Then presses it a SECOND time and demands
// the same travel, because the bug this exists to catch is a replay that only ever runs once.
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer-core';

const url = process.argv[2];
const label = process.argv.includes('--button') ? process.argv[process.argv.indexOf('--button') + 1] : 'Play entrance';
const selector = '.pc-entrance';
const MIN_TRAVEL_PX = 20;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!url || url.startsWith('--')) { console.error('usage: verify-entrance-replay <studio-url> [--button label]'); process.exit(2); }
if (!executablePath) { console.error('No Chrome/Edge found.'); process.exit(1); }

const browser = await puppeteer.launch({
  executablePath,
  userDataDir: mkdtempSync(join(tmpdir(), 'ct-entrance-')),
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--host-resolver-rules=MAP *.localhost 127.0.0.1'],
});

const fail = (message) => { console.error(`entrance replay FAILED: ${message}`); };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector(selector, { timeout: 90_000 });

  const press = async () => {
    const pressed = await page.evaluate((text) => {
      const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === text);
      if (!button) return false;
      button.click();
      return true;
    }, label);
    if (!pressed) throw new Error(`no button labelled "${label}"`);
  };

  // Sample the sprite's own laid-out position, which is what a viewer sees — not React state.
  const record = async (ms) => page.evaluate((sel, budget) => new Promise((resolve) => {
    const samples = [];
    const start = performance.now();
    const tick = () => {
      const node = document.querySelector(sel);
      const rect = node?.getBoundingClientRect();
      if (rect) samples.push({ at: Math.round(performance.now() - start), top: rect.top, opacity: Number(getComputedStyle(node).opacity) });
      if (performance.now() - start < budget) requestAnimationFrame(tick);
      else resolve(samples);
    };
    requestAnimationFrame(tick);
  }), selector, ms);

  const runs = [];
  for (const run of [1, 2]) {
    await press();
    const samples = await record(1600);
    if (samples.length < 10) throw new Error(`run ${run} produced ${samples.length} samples`);
    const tops = samples.map((sample) => sample.top);
    const travel = Math.max(...tops) - Math.min(...tops);
    const settledTail = tops.slice(-6);
    const restless = Math.max(...settledTail) - Math.min(...settledTail);
    const visible = samples.some((sample) => sample.opacity > 0.9);
    runs.push({ run, samples: samples.length, travel: Math.round(travel), restless: Math.round(restless), visible });
    if (travel < MIN_TRAVEL_PX) throw new Error(`run ${run} moved ${travel.toFixed(1)}px — the entrance did not play`);
    if (!visible) throw new Error(`run ${run} never became visible`);
    if (restless > 1) throw new Error(`run ${run} never settled (${restless.toFixed(1)}px of drift at the end)`);
  }

  console.log(`entrance replay OK: ${runs.map((r) => `run ${r.run} travelled ${r.travel}px over ${r.samples} frames and settled`).join('; ')}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
