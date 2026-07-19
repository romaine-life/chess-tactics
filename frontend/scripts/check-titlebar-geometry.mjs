#!/usr/bin/env node
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const url = args[0];
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};
const [width, height] = String(flag('size', '1280x800')).split('x').map(Number);
const tolerance = Number(flag('tolerance', '0.51'));
const chromes = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = chromes.find(existsSync);

if (!url || url.startsWith('--')) {
  console.error('usage: npm run verify:titlebar -- <live-url> [--size 1280x800]');
  process.exit(2);
}
if (!executablePath) {
  console.error(`No Chrome/Edge found. Checked:\n${chromes.join('\n')}`);
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--disable-background-networking', '--no-first-run'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 8000 })
    .catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }));
  await page.waitForSelector('.app-titlebar-contributed-controls > .titlebar-control', { timeout: 15000 });
  await page.waitForSelector('.header-account-cluster .titlebar-control', { timeout: 15000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 200));

  const geometry = await page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };
    const bar = document.querySelector('.app-shell-titlebar');
    const lane = document.querySelector('.app-titlebar-control-lane');
    const divider = document.querySelector('.app-titlebar-persistent-divider');
    const outerDivider = document.querySelector('.app-shell-outer-divider');
    const contributed = [...document.querySelectorAll('.app-titlebar-contributed-controls > .titlebar-control')];
    const persistent = [...document.querySelectorAll('.header-account-cluster .titlebar-control')];
    const outerDividerRect = rect(outerDivider);
    const outerDividerStyle = getComputedStyle(outerDivider, '::before');
    const horizontalDividerTop = outerDividerRect.top + Number.parseFloat(outerDividerStyle.top);
    const barStyle = getComputedStyle(bar);
    return {
      expectedGap: Number.parseFloat(barStyle.getPropertyValue('--titlebar-control-gap')),
      bar: rect(bar),
      lane: rect(lane),
      divider: rect(divider),
      horizontalDividerTop,
      contributed: contributed.map((element) => ({ id: element.dataset.titlebarControlId, ...rect(element) })),
      persistent: persistent.map((element) => ({ label: element.getAttribute('aria-label') ?? element.title, ...rect(element) })),
    };
  });

  const failures = [];
  const near = (actual, expected, relation) => {
    if (Math.abs(actual - expected) > tolerance) {
      failures.push(`${relation}: expected ${expected}px, received ${actual}px`);
    }
  };
  const controls = [...geometry.contributed, ...geometry.persistent];
  const baseline = controls[0].bottom;
  const top = controls[0].top;
  for (const control of controls.slice(1)) {
    near(control.bottom, baseline, `${control.id ?? control.label} bottom alignment`);
    near(control.top, top, `${control.id ?? control.label} top alignment`);
  }
  near(geometry.lane.bottom, geometry.horizontalDividerTop, 'control lane to horizontal divider');
  near(top - geometry.lane.top, geometry.horizontalDividerTop - baseline, 'top and bottom control clearance');
  if (geometry.horizontalDividerTop - baseline < -tolerance) {
    failures.push(`controls overlap the horizontal divider by ${baseline - geometry.horizontalDividerTop}px`);
  }
  near(geometry.divider.left - geometry.contributed.at(-1).right, geometry.expectedGap, 'contributed control to divider');
  near(geometry.persistent[0].left - geometry.divider.right, geometry.expectedGap, 'divider to persistent control');
  near(geometry.bar.right - geometry.persistent.at(-1).right, geometry.expectedGap, 'last control to viewport edge');

  const summary = {
    viewport: `${width}x${height}`,
    expectedGap: geometry.expectedGap,
    buttonTop: top,
    buttonBottom: baseline,
    horizontalDividerTop: geometry.horizontalDividerTop,
    bottomClearance: geometry.horizontalDividerTop - baseline,
    contributedToDivider: geometry.divider.left - geometry.contributed.at(-1).right,
    dividerToPersistent: geometry.persistent[0].left - geometry.divider.right,
    trailingEdge: geometry.bar.right - geometry.persistent.at(-1).right,
  };

  if (failures.length) {
    console.error('Title-bar geometry violations:');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`✓ Title-bar geometry OK\n${JSON.stringify(summary, null, 2)}`);
  }
} finally {
  await browser.close();
}
