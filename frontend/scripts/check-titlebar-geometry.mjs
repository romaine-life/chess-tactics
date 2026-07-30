#!/usr/bin/env node
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const url = args[0];
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};
const [width, height] = String(flag('size', '1280x800')).split('x').map(Number);
const scale = Math.max(1, Number(flag('scale', '1')) || 1);
const tolerance = Number(flag('tolerance', '0.51'));
const chromes = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = chromes.find(existsSync);

if (!url || url.startsWith('--')) {
  console.error('usage: npm run verify:titlebar -- <live-url> [--size 1280x800] [--scale 1]');
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
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 8000 })
    .catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }));
  await page.waitForSelector('.app-shell-titlebar', { timeout: 15000 });
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
    const fill = document.querySelector('.app-titlebar-fill');
    const lane = document.querySelector('.app-titlebar-control-lane');
    const divider = document.querySelector('.app-titlebar-persistent-divider');
    const outerDivider = document.querySelector('.app-shell-outer-divider');
    const contributed = [...document.querySelectorAll('.app-titlebar-contributed-controls > .titlebar-control')];
    const persistent = [...document.querySelectorAll('.header-account-cluster .titlebar-control')];
    const controls = [...contributed, ...persistent];
    controls.forEach((element, paintIndex) => {
      element.dataset.titlebarPaintProbeIndex = String(paintIndex);
    });
    const outerDividerRect = rect(outerDivider);
    const outerDividerStyle = getComputedStyle(outerDivider, '::before');
    const horizontalDividerTop = outerDividerRect.top + Number.parseFloat(outerDividerStyle.top);
    const horizontalDividerBottom = horizontalDividerTop + Number.parseFloat(outerDividerStyle.height);
    const barStyle = getComputedStyle(bar);
    return {
      expectedGap: Number.parseFloat(barStyle.getPropertyValue('--titlebar-control-gap')),
      bar: rect(bar),
      fill: rect(fill),
      lane: rect(lane),
      divider: rect(divider),
      horizontalDividerTop,
      horizontalDividerBottom,
      contributed: contributed.map((element) => ({
        id: element.dataset.titlebarControlId,
        paintIndex: Number(element.dataset.titlebarPaintProbeIndex),
        ...rect(element),
      })),
      persistent: persistent.map((element) => ({
        label: element.getAttribute('aria-label') ?? element.title,
        paintIndex: Number(element.dataset.titlebarPaintProbeIndex),
        ...rect(element),
      })),
    };
  });

  const failures = [];
  const near = (actual, expected, relation) => {
    if (Math.abs(actual - expected) > tolerance) {
      failures.push(`${relation}: expected ${expected}px, received ${actual}px`);
    }
  };
  const controls = [...geometry.contributed, ...geometry.persistent];
  await page.addStyleTag({
    content: `
      html,
      body {
        background: transparent !important;
      }
      body * {
        visibility: hidden !important;
      }
      [data-titlebar-paint-probe-surface="true"] {
        background: transparent !important;
        visibility: visible !important;
      }
      [data-titlebar-paint-probe-surface="true"]::before,
      [data-titlebar-paint-probe-surface="true"]::after {
        content: none !important;
      }
      [data-titlebar-paint-probe-active="true"],
      [data-titlebar-paint-probe-active="true"]::before,
      [data-titlebar-paint-probe-active="true"]::after {
        visibility: visible !important;
      }
    `,
  });
  const paintedControls = [];
  for (const control of controls) {
    await page.evaluate(({ paintIndex, top, left, width: controlWidth, height: controlHeight }) => {
      document.querySelector('[data-titlebar-paint-probe-surface="true"]')?.remove();
      const source = document.querySelector(`[data-titlebar-paint-probe-index="${paintIndex}"]`);
      if (!source) return;
      const surface = document.createElement('div');
      surface.className = 'chrome-family-surface';
      surface.dataset.titlebarPaintProbeSurface = 'true';
      const target = source.cloneNode(true);
      target.replaceChildren();
      target.removeAttribute('id');
      target.dataset.titlebarPaintProbeActive = 'true';
      target.setAttribute('aria-hidden', 'true');
      target.style.setProperty('position', 'fixed', 'important');
      target.style.setProperty('inset', `${top}px auto auto ${left}px`, 'important');
      target.style.setProperty('inline-size', `${controlWidth}px`, 'important');
      target.style.setProperty('block-size', `${controlHeight}px`, 'important');
      target.style.setProperty('margin', '0', 'important');
      surface.append(target);
      document.body.append(surface);
    }, {
      paintIndex: control.paintIndex,
      top: control.top,
      left: control.left,
      width: control.width,
      height: control.height,
    });
    const clip = {
      x: Math.max(0, Math.floor(control.left - 32)),
      y: Math.max(0, Math.floor(geometry.bar.top)),
      width: Math.min(width, Math.ceil(control.right + 32)) - Math.max(0, Math.floor(control.left - 32)),
      height: Math.min(height, Math.ceil(geometry.bar.bottom)) - Math.max(0, Math.floor(geometry.bar.top)),
    };
    const buffer = await page.screenshot({ clip, omitBackground: true });
    const image = PNG.sync.read(buffer);
    let paintedTop = image.height;
    let paintedBottom = -1;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if (image.data[(y * image.width + x) * 4 + 3] <= 8) continue;
        paintedTop = Math.min(paintedTop, y);
        paintedBottom = Math.max(paintedBottom, y);
      }
    }
    if (paintedBottom < paintedTop) {
      failures.push(`${control.id ?? control.label} produced no visible control pixels`);
      continue;
    }
    const paintTop = clip.y + paintedTop / scale;
    const paintBottom = clip.y + (paintedBottom + 1) / scale;
    paintedControls.push({
      id: control.id,
      label: control.label,
      paintTop,
      paintBottom,
      topClearance: paintTop - geometry.bar.top,
      bottomClearance: geometry.horizontalDividerTop - paintBottom,
    });
  }
  await page.evaluate(() => {
    document.querySelector('[data-titlebar-paint-probe-surface="true"]')?.remove();
  });

  const baseline = controls[0].bottom;
  const top = controls[0].top;
  for (const control of controls.slice(1)) {
    near(control.bottom, baseline, `${control.id ?? control.label} bottom alignment`);
    near(control.top, top, `${control.id ?? control.label} top alignment`);
  }
  near(geometry.lane.bottom, geometry.horizontalDividerTop, 'control lane to horizontal divider');
  near(top - geometry.lane.top, geometry.horizontalDividerTop - baseline, 'top and bottom control clearance');
  near(geometry.fill.top, geometry.bar.top, 'title fill to viewport top');
  near(geometry.fill.left, geometry.bar.left, 'title fill to viewport left edge');
  near(geometry.fill.right, geometry.bar.right, 'title fill to viewport right edge');
  near(top - geometry.fill.top, geometry.horizontalDividerTop - baseline, 'top and bottom visible control clearance');
  for (const control of paintedControls) {
    near(
      control.topClearance,
      control.bottomClearance,
      `${control.id ?? control.label} painted top and bottom clearance`,
    );
  }
  if (geometry.horizontalDividerTop - baseline < -tolerance) {
    failures.push(`controls overlap the horizontal divider by ${baseline - geometry.horizontalDividerTop}px`);
  }
  if (geometry.fill.bottom > geometry.horizontalDividerBottom - 1 + tolerance) {
    failures.push(`title fill reaches below the divider's opaque boundary: expected at most ${geometry.horizontalDividerBottom - 1}px, received ${geometry.fill.bottom}px`);
  }
  if (geometry.contributed.length) {
    near(geometry.divider.left - geometry.contributed.at(-1).right, geometry.expectedGap, 'contributed control to divider');
  }
  near(geometry.persistent[0].left - geometry.divider.right, geometry.expectedGap, 'divider to persistent control');
  near(geometry.bar.right - geometry.persistent.at(-1).right, geometry.expectedGap, 'last control to viewport edge');

  const summary = {
    viewport: `${width}x${height}`,
    deviceScaleFactor: scale,
    bar: geometry.bar,
    expectedGap: geometry.expectedGap,
    buttonTop: top,
    buttonBottom: baseline,
    horizontalDividerTop: geometry.horizontalDividerTop,
    horizontalDividerBottom: geometry.horizontalDividerBottom,
    titleFillTop: geometry.fill.top,
    titleFillLeft: geometry.fill.left,
    titleFillRight: geometry.fill.right,
    titleFillBottom: geometry.fill.bottom,
    topClearanceFromFill: top - geometry.fill.top,
    bottomClearance: geometry.horizontalDividerTop - baseline,
    paintedControls,
    contributedToDivider: geometry.contributed.length
      ? geometry.divider.left - geometry.contributed.at(-1).right
      : null,
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
