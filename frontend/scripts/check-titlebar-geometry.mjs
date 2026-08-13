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
  // The named environment URL is a *.localhost host, which this browser must resolve itself.
  args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--disable-background-networking',
    '--no-first-run', '--host-resolver-rules=MAP *.localhost 127.0.0.1'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  // The account cluster this gate measures only exists for a signed-in owner, so a fresh
  // browser with no cookies waited 15s for a control that was never going to render and
  // reported a timeout instead of a geometry verdict. Acquire the backend's loopback-only
  // dev session first, exactly as scripts/shot.mjs does; never for a non-loopback target.
  const target = new URL(url);
  if (['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.hostname.endsWith('.localhost')) {
    const signIn = new URL('/api/auth/sign-in', target);
    signIn.searchParams.set('returnTo', '/api/auth/me');
    await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(() => {});
  }
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 8000 })
    .catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }));
  await page.waitForSelector('.app-shell-titlebar', { timeout: 15000 });
  await page.waitForSelector('.header-account-cluster .titlebar-control', { timeout: 15000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 200));

  const geometry = await page.evaluate(() => {
    const maybeRect = (element) => (element
      ? rect(element)
      : { top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 });
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
    const brandHome = document.querySelector('.brand-lockup[data-nav="/"]');
    const brandMark = document.querySelector('.brand-lockup-mark');
    const brandCopy = document.querySelector('.brand-lockup-copy');
    const fill = document.querySelector('.app-titlebar-fill');
    const lane = document.querySelector('.app-titlebar-control-lane');
    const divider = document.querySelector('.app-titlebar-persistent-divider');
    const outerDivider = document.querySelector('.app-shell-outer-divider');
    const contributed = [...document.querySelectorAll('.app-titlebar-contributed-controls > .titlebar-control')];
    // The invariant cluster is ONE divided box now, so the lane holds it as a single member: its
    // frame is what must clear the divider and the viewport edge by the canonical gap. The seats
    // inside it are measured against each other and against the box, never against the lane —
    // their edges are the box's rails, which is the whole point of the object.
    const cluster = document.querySelector('.header-account-cluster');
    const seats = [...document.querySelectorAll('.header-account-cluster .titlebar-control')];
    const clusterRails = [...document.querySelectorAll('.header-account-cluster .chrome-divided-grid__vertical-rail')];
    const framedSeats = [...document.querySelectorAll('.header-account-cluster [data-chrome-unit]')]
      .map((element) => element.getAttribute('aria-label') ?? element.className);
    const controls = [...contributed, cluster];
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
      brandHome: rect(brandHome),
      brandMark: rect(brandMark),
      brandCopy: rect(brandCopy),
      fill: rect(fill),
      lane: rect(lane),
      // The three horizontal regions of the bar. They share ONE grid track and are placed by
      // justify-self, so nothing stops them sliding over each other once the bar narrows.
      // Optional: a bar need not contribute a centre at all, and one that does may leave it
      // empty. `rect` assumes an element, so these ask for a zero box instead of throwing —
      // the gate crashed outright on a Strategikon route whose centre has no child.
      brandLayout: maybeRect(document.querySelector('.brand-lockup-layout')),
      center: maybeRect(document.querySelector('.app-shell-titlebar-center')),
      centerContent: maybeRect(document.querySelector('.app-shell-titlebar-center > *')),
      divider: rect(divider),
      horizontalDividerTop,
      horizontalDividerBottom,
      contributed: contributed.map((element) => ({
        id: element.dataset.titlebarControlId,
        paintIndex: Number(element.dataset.titlebarPaintProbeIndex),
        ...rect(element),
      })),
      cluster: {
        id: 'account-cluster-box',
        paintIndex: Number(cluster.dataset.titlebarPaintProbeIndex),
        ...rect(cluster),
      },
      seats: seats.map((element) => {
        const box = rect(element);
        // What the compartment actually SHOWS. A rail is drawn on the grid line and straddles
        // it, so it covers half its width from the cell on either side; the cell's own rect
        // says nothing about that. Measuring the cell is what let the middle seat ship 3.5px
        // narrower than the two beside it while every rect read a tidy 38.
        let left = box.left;
        let right = box.right;
        for (const rail of clusterRails.map(rect)) {
          if (rail.right > box.left && rail.right < box.right) left = Math.max(left, rail.right);
          if (rail.left < box.right && rail.left > box.left) right = Math.min(right, rail.left);
        }
        return {
          label: element.getAttribute('aria-label') ?? element.title,
          ...box,
          openingWidth: right - left,
          openingHeight: box.height,
        };
      }),
      framedSeats,
    };
  });

  const failures = [];
  const near = (actual, expected, relation) => {
    if (Math.abs(actual - expected) > tolerance) {
      failures.push(`${relation}: expected ${expected}px, received ${actual}px`);
    }
  };
  const controls = [...geometry.contributed, geometry.cluster];
  near(geometry.brandHome.top, geometry.brandMark.top, 'brand home top to shield');
  near(geometry.brandHome.right, geometry.brandMark.right, 'brand home right to shield');
  near(geometry.brandHome.bottom, geometry.brandMark.bottom, 'brand home bottom to shield');
  near(geometry.brandHome.left, geometry.brandMark.left, 'brand home left to shield');
  if (geometry.brandHome.right > geometry.brandCopy.left + tolerance) {
    failures.push(`brand home overlaps inert title copy by ${geometry.brandHome.right - geometry.brandCopy.left}px`);
  }
  // The bar's three regions — brand lockup, centre status, control lane — occupy the same grid
  // track and are placed with justify-self, so the layout does not reserve room for each: it
  // simply lets them overlap once the bar is narrower than their sum. On a 390px phone running
  // a Battle the centre spans the whole track and covers both the brand lockup and part of the
  // lane, which makes the home shield and the Run breadcrumb untappable — every tap in that
  // region lands on the status chip on top. Measured against the CONTENT of the centre, because
  // the centre element itself may legitimately stretch while its chips sit in the free space.
  const centerInk = geometry.centerContent.width > 0 ? geometry.centerContent : geometry.center;
  // A bar with no centre, or an empty one, has no region to collide with.
  if (centerInk.width > 0 && geometry.brandLayout.width > 0) {
    if (centerInk.left < geometry.brandLayout.right - tolerance) {
      failures.push(
        `title-bar centre overlaps the brand lockup by ${Math.round(geometry.brandLayout.right - centerInk.left)}px`
        + ' — the home shield and screen-name breadcrumb cannot be tapped',
      );
    }
    if (centerInk.right > geometry.lane.left + tolerance) {
      failures.push(
        `title-bar centre overlaps the control lane by ${Math.round(centerInk.right - geometry.lane.left)}px`,
      );
    }
  }
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
  near(geometry.cluster.left - geometry.divider.right, geometry.expectedGap, 'divider to cluster box');
  near(geometry.bar.right - geometry.cluster.right, geometry.expectedGap, 'cluster box to viewport edge');

  // Inside the box the seats answer to the box, not to the lane: every one shares the box's top
  // and bottom, and none of them carries a chrome unit of its own — a registered unit is what
  // brings a frame, and a frame in here draws a second edge a few pixels inside the box's.
  if (geometry.framedSeats.length) {
    failures.push(`cluster seats must not register their own chrome frame: ${geometry.framedSeats.join(', ')}`);
  }
  if (!geometry.seats.length) {
    failures.push('the invariant cluster box rendered no seats');
  }
  for (const seat of geometry.seats) {
    near(seat.top, geometry.seats[0].top, `cluster seat "${seat.label}" top alignment`);
    near(seat.bottom, geometry.seats[0].bottom, `cluster seat "${seat.label}" bottom alignment`);
    if (seat.left < geometry.cluster.left - tolerance || seat.right > geometry.cluster.right + tolerance) {
      failures.push(`cluster seat "${seat.label}" escapes the box it is a compartment of`);
    }
    // The compartment is what the eye compares, and every one of them is the same SQUARE. A cell
    // with a rail on both sides shows less of itself than one with a rail on one side, so equal
    // tracks give unequal compartments — measure the opening, never the cell.
    near(seat.openingWidth, seat.openingHeight, `cluster seat "${seat.label}" opening is square`);
    near(seat.openingWidth, geometry.seats[0].openingWidth, `cluster seat "${seat.label}" opening width`);
  }

  const summary = {
    viewport: `${width}x${height}`,
    deviceScaleFactor: scale,
    bar: geometry.bar,
    expectedGap: geometry.expectedGap,
    brandHome: geometry.brandHome,
    brandMark: geometry.brandMark,
    brandCopy: geometry.brandCopy,
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
    dividerToCluster: geometry.cluster.left - geometry.divider.right,
    trailingEdge: geometry.bar.right - geometry.cluster.right,
    clusterBox: geometry.cluster,
    clusterSeats: geometry.seats,
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
