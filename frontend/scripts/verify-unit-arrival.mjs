#!/usr/bin/env node
// Live pixel gate for the board's unit-arrival entrance (ADR-0045 / ADR-0351 / ADR-0353).
//
// The defect this exists to catch: a cold battlefield is revealed with its whole army already
// SEATED at final positions, the units then VANISH, and only then does the staggered drop-in
// play. Arrival motion is activation-gated, but the reveal happens during the scene entrance —
// so the first visible frames showed a state the entrance was about to undo.
//
// It is asserted on real pixels rather than on DOM state, because "what the player saw" is the
// only claim worth making here: an opaque route veil can cover a technically-visible board, and
// a DOM flag cannot tell you whether a unit was painted.
//
// Method: record the live entrance with a CDP screencast, then measure, for every frame, the
// fraction of BOARD pixels that still disagree strongly with the settled frame. A correct
// entrance only ever converges on its final composition — terrain fades up, then units drop in.
// Seated-then-vanished units are the one thing that makes that convergence go backwards, so a
// large disagreement AFTER the board has already resolved is exactly this bug and nothing else.
// Missing units move several percent of the board's pixels; swaying grass moves a fraction of
// one percent, which is why the measure counts strongly-changed pixels rather than mean error.
//
// Usage:
//   node scripts/verify-unit-arrival.mjs <battle-url> [--size WxH] [--timeout ms] [--out dir]
//     [--click <selector>]   let the first scene settle, then navigate by clicking (menu → battle)
//     [--keep-frames]        write every recorded frame, not just the filmstrip

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer-core';

const argv = process.argv.slice(2);
const url = argv[0];
const flag = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? (argv[i + 1] ?? true) : def; };
const has = (name) => argv.includes(`--${name}`);

const [w, h] = String(flag('size', '1280x800')).split('x').map(Number);
const timeout = Math.max(1_000, Number(flag('timeout', 60_000)) || 60_000);
const outDir = resolve(process.cwd(), String(flag('out', 'tmp-shots/arrival')));
const click = flag('click');
const keepFrames = has('keep-frames');
// Board pixels disagreeing with the settled frame by more than this in any channel are counted.
const PIXEL_TOLERANCE = 60;
// At or below this share of changed pixels the board has resolved: terrain is up, the fade is
// done, and the army is seated. Measured settled-with-swaying-grass frames sit under 0.007.
const RESOLVED = 0.012;
// A resolved board that later disagrees this strongly is missing units it had already shown.
// A full army removal measures above 0.04.
const REGRESSION = 0.025;
// The battlefield has reached the player's screen once this much of the board region agrees with
// the settled composition: the outgoing screen is gone and the scene is no longer faded out.
const ON_SCREEN = 0.10;
// Slack for the single frame in which a fresh mount commits its staging. Anything longer is a
// window the player spent looking at an army that was about to be taken away.
const EARLY_REVEAL_MS = 50;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!url || url.startsWith('--')) {
  console.error('usage: verify-unit-arrival <battle-url> [--size WxH] [--timeout ms] [--out dir] [--click selector] [--keep-frames]');
  process.exit(2);
}
if (!executablePath) { console.error(`No Chrome/Edge found. Checked:\n${CHROMES.join('\n')}`); process.exit(1); }
mkdirSync(outDir, { recursive: true });

/** Share of a rectangle's pixels that disagree strongly with the settled frame, 0..1. */
function changedShare(frame, settled, rect) {
  let changed = 0;
  let samples = 0;
  const x1 = Math.max(0, Math.floor(rect.x));
  const y1 = Math.max(0, Math.floor(rect.y));
  const x2 = Math.min(frame.width, Math.ceil(rect.x + rect.width));
  const y2 = Math.min(frame.height, Math.ceil(rect.y + rect.height));
  for (let y = y1; y < y2; y += 2) {
    for (let x = x1; x < x2; x += 2) {
      const i = (y * frame.width + x) * 4;
      const delta = Math.max(
        Math.abs(frame.data[i] - settled.data[i]),
        Math.abs(frame.data[i + 1] - settled.data[i + 1]),
        Math.abs(frame.data[i + 2] - settled.data[i + 2]),
      );
      samples += 1;
      if (delta > PIXEL_TOLERANCE) changed += 1;
    }
  }
  return samples ? changed / samples : 1;
}

const browserProfile = mkdtempSync(join(tmpdir(), 'ct-arrival-'));
const browser = await puppeteer.launch({
  executablePath,
  userDataDir: browserProfile,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--disable-background-networking',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars',
    '--host-resolver-rules=MAP *.localhost 127.0.0.1'],
});

let failure = null;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });

  // Loopback dev sign-in, exactly as scripts/shot.mjs does.
  const target = new URL(url);
  if (['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.hostname.endsWith('.localhost')) {
    const signIn = new URL('/api/auth/sign-in', target);
    signIn.searchParams.set('returnTo', '/api/auth/me');
    const authResponse = await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout });
    if (!authResponse?.ok()) throw new Error(`dev sign-in failed (${authResponse?.status() ?? 'no response'})`);
  }

  // A per-frame lifecycle trace, recorded beside the pixels. The pixel measure proves what the
  // player saw; this proves it deterministically, because the visible window can be shorter than
  // the board's own fade on a fast machine and still be the same defect.
  await page.evaluateOnNewDocument(() => {
    window.__ctLifecycle = { states: [], earlyRevealMs: 0, entrances: 0 };
    let last = '';
    let lastAt = null;
    let stagedThisMount = false;
    let pendingEarlyMs = 0;
    const sample = () => {
      const trace = window.__ctLifecycle;
      const board = document.querySelector('.skirmish-board-lab');
      const revealed = Boolean(board) && !board.classList.contains('is-board-loading');
      const staged = board?.getAttribute('data-arriving') === 'true';
      const now = performance.now();
      if (!board) {
        // No battlefield mounted: whatever this mount accumulated proved nothing.
        stagedThisMount = false;
        pendingEarlyMs = 0;
      } else if (staged && !stagedThisMount) {
        // This mount does play an entrance, so any time it spent revealed-but-unstaged was time
        // the player spent looking at units that were about to be removed.
        stagedThisMount = true;
        trace.entrances += 1;
        trace.earlyRevealMs += pendingEarlyMs;
        pendingEarlyMs = 0;
      }
      if (revealed && !staged && !stagedThisMount && lastAt !== null) pendingEarlyMs += now - lastAt;
      lastAt = now;
      const state = [
        document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') ?? '-',
        board ? (revealed ? 'board:revealed' : 'board:hidden') : 'board:absent',
        staged ? 'arrivals:staged' : 'arrivals:none',
      ].join(' ');
      if (state !== last && trace.states.length < 400) {
        last = state;
        trace.states.push({ t: Math.round(now), state });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  const cdp = await page.createCDPSession();
  const frames = [];
  let recording = false;
  cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
    if (recording) frames.push({ t: metadata.timestamp * 1000, data });
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });

  const startRecording = async () => {
    recording = true;
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  };

  const settledScene = "document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'";
  if (click) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForFunction(settledScene, { timeout });
    // Enter the battlefield once and come back before recording. A player reaching their second
    // battle has warm modules and warm art, which is when the board finishes preparing while the
    // scene entrance is still running — precisely the ordering this gate is about. A cold first
    // entry can hide the defect behind its own slow load.
    await page.waitForSelector(String(click), { visible: true, timeout });
    await page.click(String(click));
    await page.waitForSelector('.skirmish-board-lab', { timeout });
    await page.waitForFunction(settledScene, { timeout });
    await new Promise((r) => setTimeout(r, 1_500));
    await page.goBack({ waitUntil: 'domcontentloaded', timeout });
    await page.waitForFunction(settledScene, { timeout });
    await page.waitForSelector(String(click), { visible: true, timeout });
    await startRecording();
    await page.click(String(click));
  } else {
    await startRecording();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  }

  await page.waitForSelector('.skirmish-board-lab', { timeout });
  await page.waitForFunction(
    "document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'",
    { timeout },
  );
  // Record past the entrance: ARRIVAL_BASE_MS + the full staggered wave, plus slack.
  await new Promise((r) => setTimeout(r, 2_500));
  await cdp.send('Page.stopScreencast');
  recording = false;

  const board = await page.$('.skirmish-board-lab');
  const rect = await board?.boundingBox();
  if (!rect) throw new Error('the battlefield board had no rendered bounds');
  const settled = PNG.sync.read(await page.screenshot());

  if (frames.length < 10) throw new Error(`screencast captured only ${frames.length} frames`);
  // Screencast frames are stamped in epoch seconds and the lifecycle trace in page time. Share
  // one clock so a recorded frame can be named by the lifecycle state it belongs to.
  const pageEpoch = await page.evaluate(() => Date.now() - performance.now());
  const origin = frames[0].t;
  const track = frames.map((frame, index) => ({
    index,
    ms: Math.round(frame.t - origin),
    pageMs: frame.t - pageEpoch,
    changed: changedShare(PNG.sync.read(Buffer.from(frame.data, 'base64')), settled, rect),
    data: frame.data,
  }));

  // A resolved frame followed by a materially unresolved one is the seated-then-vanish bug.
  let resolvedFrame = null;
  let worst = null;
  for (const frame of track) {
    if (!resolvedFrame && frame.changed <= RESOLVED) resolvedFrame = frame;
    if (resolvedFrame && frame.changed >= REGRESSION && (!worst || frame.changed > worst.changed)) {
      worst = frame;
    }
  }
  if (!resolvedFrame) throw new Error('the battlefield never resolved to its settled composition');

  const lifecycle = await page.evaluate(() => window.__ctLifecycle ?? null);
  // The filmstrip is named from the pixels, not the DOM: the frame that matters is the first one
  // in which the battlefield is actually on the player's screen.
  const onScreen = track.find((frame) => frame.changed <= ON_SCREEN) ?? null;
  const after = (frame, ms) => (frame ? track.find((other) => other.pageMs >= frame.pageMs + ms) ?? null : null);

  const filmstrip = [];
  const pick = (label, frame) => { if (frame) filmstrip.push({ label, frame }); };
  pick('1-board-on-screen', onScreen);
  pick('2-entrance-midway', after(onScreen, 300));
  pick('3-settled', track[track.length - 1]);
  pick('4-worst-regression', worst);
  for (const { label, frame } of filmstrip) {
    writeFileSync(join(outDir, `${label}.png`), Buffer.from(frame.data, 'base64'));
  }
  if (keepFrames) {
    for (const frame of track) {
      writeFileSync(join(outDir, `frame-${String(frame.index).padStart(3, '0')}-${frame.ms}ms.png`), Buffer.from(frame.data, 'base64'));
    }
  }
  writeFileSync(join(outDir, 'lifecycle.json'), `${JSON.stringify(lifecycle, null, 1)}\n`);
  writeFileSync(
    join(outDir, 'track.json'),
    `${JSON.stringify(track.map(({ ms, changed }) => ({ ms, changed: Number(changed.toFixed(5)) })), null, 1)}\n`,
  );

  if (!lifecycle?.entrances) {
    failure = 'no unit entrance was observed on this battlefield — the gate had no target';
  } else if (lifecycle.earlyRevealMs > EARLY_REVEAL_MS) {
    failure = `the battlefield was revealed with its army seated for ${Math.round(lifecycle.earlyRevealMs)}ms `
      + 'before the entrance was staged — those units were shown, removed, and re-entered. '
      + `See ${join(outDir, 'lifecycle.json')}`;
  } else if (worst) {
    failure = `the battlefield resolved at ${resolvedFrame.ms}ms and then went BACKWARDS: `
      + `${(worst.changed * 100).toFixed(1)}% of its pixels disagreed with the settled board at ${worst.ms}ms. `
      + 'Units were painted seated, removed, and re-entered. '
      + `See ${join(outDir, '4-worst-regression.png')}`;
  } else {
    console.log(`unit arrival OK: ${lifecycle.entrances} entrance(s) staged before reveal `
      + `(${Math.round(lifecycle.earlyRevealMs)}ms revealed-but-unstaged), and ${track.length} recorded frames `
      + `converge on the settled board (resolved at ${resolvedFrame.ms}ms, never regressed past `
      + `${(REGRESSION * 100).toFixed(1)}%)`);
  }
  console.log(`wrote entrance filmstrip to ${outDir}`);
} finally {
  await browser.close();
  rmSync(browserProfile, { recursive: true, force: true });
}

if (failure) {
  console.error(failure);
  process.exit(9);
}
