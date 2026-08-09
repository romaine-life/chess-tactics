#!/usr/bin/env node
// Live gate for the Commendatio card carry (ADR-0385, ADR-0516).
//
// Taking a King admits a card exactly as Adlectio does, so it gets the same travel
// into the Chartulary. It differs in one way that matters: the take ends its own phase. A carry
// released at landing therefore lets go while Deployment is still preparing, and the card is
// gone for that interval — the bug class ADR-0385 exists to prevent. This drives the real take
// and reads the real pixels rather than trusting that the launch is wired.
//
// Usage: npm run verify:grant-carry -- '<commendatio-craft-url>'

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const start = process.argv[2];
if (!start) {
  console.error("usage: npm run verify:grant-carry -- '<commendatio-craft-url>'");
  process.exit(2);
}

const chromes = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = chromes.find(existsSync);
if (!executablePath) {
  console.error(`No Chrome/Edge found. Checked:\n${chromes.join('\n')}`);
  process.exit(2);
}

const TIMEOUT = 30_000;
const settled = "document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'";
const GRANT_CARD = '[data-testid="run-commendatio-king-offers"] .run-card-action';

const profile = mkdtempSync(join(tmpdir(), 'ct-grant-carry-'));
const browser = await puppeteer.launch({
  executablePath,
  userDataDir: profile,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--host-resolver-rules=MAP *.localhost 127.0.0.1',
  ],
});

const violations = [];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(start, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForFunction(settled, { timeout: TIMEOUT });
  await page.waitForSelector(GRANT_CARD, { visible: true, timeout: TIMEOUT });

  // WHICH card the grant deals is content, not contract — take whichever is offered first.
  const offer = await page.evaluate((selector) => {
    const button = document.querySelector(selector);
    if (!button) return null;
    return {
      name: (button.getAttribute('aria-label') ?? '').replace(/^Take\s+/, '').split(' — ')[0],
      seatId: button.closest('.run-card-offer')?.getAttribute('data-run-sectio-offer-id') ?? null,
    };
  }, GRANT_CARD);
  if (!offer?.name) throw new Error('Commendatio offered no takeable King, so the carry cannot be driven');
  if (!offer.seatId) throw new Error('The offered card has no identified seat, so a duplicate cannot be detected');
  const offered = offer.name;

  await page.evaluate((seatId) => {
    const director = document.querySelector('[data-scene-phase]');
    const effectiveOpacity = (node) => {
      let opacity = 1;
      for (let current = node; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') return 0;
        opacity *= Number(style.opacity || 1);
      }
      return opacity;
    };
    window.__grantFrames = [];
    window.__grantRecording = true;
    const sample = () => {
      if (!window.__grantRecording) return;
      const flight = document.querySelector('[data-testid="run-card-flight"]');
      const mark = document.querySelector('[data-run-card-flight-target]');
      const markBox = mark?.getBoundingClientRect();
      let carry = null;
      if (flight) {
        const box = flight.getBoundingClientRect();
        const opacity = effectiveOpacity(flight);
        carry = {
          visible: opacity > 0.01 && box.width > 0 && box.height > 0,
          inContinuityLayer: Boolean(flight.closest('[data-scene-continuity-host]')),
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
        };
      }
      // The seat the copy left. While the copy is in the air the original must not still be
      // painted underneath it, or the take reads as two of the same card.
      const seat = document.querySelector(`.run-card-offer[data-run-sectio-offer-id="${CSS.escape(seatId)}"]`);
      window.__grantFrames.push({
        phase: director?.getAttribute('data-scene-phase') ?? 'missing',
        committed: director?.getAttribute('data-scene-committed') ?? '',
        carry,
        sourceOpacity: seat ? effectiveOpacity(seat) : null,
        mark: markBox ? { x: Math.round(markBox.x + markBox.width / 2), y: Math.round(markBox.y + markBox.height / 2) } : null,
        matPresent: Boolean(document.querySelector('[data-testid="run-commendatio-king-offers"]')),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, offer.seatId);

  await page.click(GRANT_CARD);
  // The take ends the phase; wait for the director to finish the whole replacement, then let
  // any release that was going to happen late actually happen before reading the tail.
  await page.waitForFunction(
    "document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') !== 'current'",
    { timeout: TIMEOUT },
  );
  await page.waitForFunction(settled, { timeout: TIMEOUT });
  await new Promise((resolve) => { setTimeout(resolve, 600); });

  const frames = await page.evaluate(() => {
    window.__grantRecording = false;
    return window.__grantFrames;
  });
  if (!Array.isArray(frames) || !frames.length) throw new Error('Grant carry audit state was lost');

  const firstCarry = frames.findIndex((frame) => frame.carry?.visible);
  if (firstCarry === -1) {
    violations.push(
      `taking the King (${offered}) never produced a visible card carry — the admission has no transfer at all`,
    );
  } else {
    // Every frame from the carry appearing to the director settling must still show it. A gap
    // here is the card blinking out while Deployment prepares underneath.
    const settleIndex = frames.findLastIndex((frame) => frame.phase !== 'current');
    const throughTransition = frames.slice(firstCarry, settleIndex + 1);
    const gaps = throughTransition.filter((frame) => !frame.carry?.visible).length;
    if (gaps) {
      violations.push(
        `card carry vanished for ${gaps} of ${throughTransition.length} frames between launch and the settled scene`,
      );
    }
    const escaped = throughTransition.filter((frame) => frame.carry && !frame.carry.inContinuityLayer).length;
    if (escaped) {
      violations.push(`card carry left the director-owned continuity layer on ${escaped} frames`);
    }
    const doubled = throughTransition.filter((frame) => (frame.sourceOpacity ?? 0) > 0.01).length;
    if (doubled) {
      violations.push(
        `the taken card was still painted in its own seat while the copy flew, on ${doubled} frames — it reads as two cards`,
      );
    }
    const launch = frames[firstCarry];
    const landing = frames.slice(0, settleIndex + 1).findLast((frame) => frame.carry?.visible) ?? launch;
    if (Math.hypot(landing.carry.x - launch.carry.x, landing.carry.y - launch.carry.y) < 40) {
      violations.push(`card carry never travelled: launched at ${launch.carry.x},${launch.carry.y} and stayed there`);
    }
    if (landing.mark) {
      const missBy = Math.round(Math.hypot(landing.carry.x - landing.mark.x, landing.carry.y - landing.mark.y));
      if (missBy > 48) {
        violations.push(`card carry did not come to rest on the Chartulary mark (off by ${missBy}px)`);
      }
    } else {
      violations.push('the Chartulary mark was absent, so the carry had no destination to land on');
    }
    console.log(
      `OK Opening grant carry (${offered}): visible for ${throughTransition.length} frames, `
      + `${launch.carry.x},${launch.carry.y} -> ${landing.carry.x},${landing.carry.y}`,
    );
  }

  const tail = frames[frames.length - 1];
  if (tail.carry) violations.push('the carried card was never released after the scene settled');
  if (tail.matPresent) violations.push('the grant mat survived its own take');
  if (frames[0].committed && tail.committed === frames[0].committed) {
    violations.push(`committed scene identity did not change (${tail.committed})`);
  }
  if (!violations.length) console.log('OK Carry released once Deployment settled; grant workspace replaced');
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}

if (violations.length) {
  console.error('Run grant carry check failed:\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
