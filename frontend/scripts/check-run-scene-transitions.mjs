#!/usr/bin/env node
// Live capability/lifecycle gate for Run scene ownership and selection (ADR-0383, ADR-0445).
//
// Usage: npm run verify:run-scenes -- '<bona-vacantia-craft-url>'

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const start = process.argv[2];
if (!start) {
  console.error("usage: npm run verify:run-scenes -- '<bona-vacantia-craft-url>'");
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
const startUrl = new URL(start);
const origin = startUrl.origin;
const profile = mkdtempSync(join(tmpdir(), 'ct-run-scenes-'));
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

const settled = "document.querySelector('[data-scene-phase]')?.getAttribute('data-scene-phase') === 'current'";

async function auditViewport(page, expectedView) {
  return page.evaluate((expected) => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && box.width > 0
        && box.height > 0;
    };
    const all = [...document.querySelectorAll('[data-run-scene-view]')];
    const visibleViews = all.filter(visible);
    const outsideAuthority = all.filter((node) => !node.closest('.run-scene-slot[data-scene-instance]'));
    return {
      expected,
      visibleViews: visibleViews.map((node) => node.getAttribute('data-run-scene-view')),
      outsideAuthority: outsideAuthority.length,
      totalContributions: all.length,
    };
  }, expectedView);
}

async function transition(page, {
  label,
  click,
  final,
  expectedView,
  relationship,
  continuityLipsanonId = null,
}) {
  await page.waitForFunction(settled, { timeout: TIMEOUT });
  await page.waitForSelector(click, { visible: true, timeout: TIMEOUT });
  await page.evaluate((continuityId) => {
    const director = document.querySelector('[data-scene-phase]');
    const snap = () => ({
      phase: director?.getAttribute('data-scene-phase') ?? 'missing',
      committed: director?.getAttribute('data-scene-committed') ?? '',
      pending: director?.getAttribute('data-scene-pending') ?? '',
      relationship: director?.getAttribute('data-scene-transition-relationship') ?? '',
    });
    window.__runSceneTrace = [snap()];
    new MutationObserver(() => window.__runSceneTrace.push(snap())).observe(director, {
      attributes: true,
      attributeFilter: [
        'data-scene-phase',
        'data-scene-committed',
        'data-scene-pending',
        'data-scene-transition-relationship',
      ],
    });
    window.__runSceneContinuityRecording = Boolean(continuityId);
    window.__runSceneContinuity = [];
    window.__runSceneFrameRecording = true;
    window.__runSceneFrames = [];
    const effectiveOpacity = (node) => {
      let opacity = 1;
      for (let current = node; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') return 0;
        opacity *= Number(style.opacity || 1);
      }
      return opacity;
    };
    const sample = () => {
      if (!window.__runSceneFrameRecording) return;
      const phase = director?.getAttribute('data-scene-phase') ?? 'missing';
      const relation = director?.getAttribute('data-scene-transition-relationship') ?? '';
      const viewport = document.querySelector('.shell-viewport-swap[data-scene-transition-target="gameplay-workspace"]');
      window.__runSceneFrames.push({
        phase,
        relationship: relation,
        viewportOpacity: viewport ? effectiveOpacity(viewport) : null,
        controlsOpacity: [...document.querySelectorAll('.shell-controls-panel')].map(effectiveOpacity),
        homepage: Boolean(document.querySelector('.scene-homepage-background')),
        layers: [...document.querySelectorAll('.scene-boundary')].map((node) => ({
          role: node.getAttribute('data-scene-visual-role'),
          opacity: Number(getComputedStyle(node).opacity),
        })),
      });
      if (window.__runSceneContinuityRecording && continuityId) {
        const icons = [...document.querySelectorAll(`.run-lipsanon-icon[data-lipsanon-id="${continuityId}"]`)]
          .map((node) => {
            const box = node.getBoundingClientRect();
            const opacity = effectiveOpacity(node);
            return {
              kind: node.closest('[data-scene-continuity-host]')
                ? 'carry'
                : node.closest('[data-testid="run-lipsanon-strip"]')
                  ? 'strip'
                  : node.closest('.lipsanon-mat-offer')
                    ? 'mat'
                    : 'other',
              opacity,
              visible: opacity > 0.01 && box.width > 0 && box.height > 0,
              x: Math.round(box.x),
              y: Math.round(box.y),
            };
          });
        window.__runSceneContinuity.push({ phase, icons });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, continuityLipsanonId);
  await page.click(click);
  await page.waitForFunction(final, { timeout: TIMEOUT });
  await new Promise((resolve) => { setTimeout(resolve, 250); });
  const audit = await page.evaluate(() => {
    window.__runSceneContinuityRecording = false;
    window.__runSceneFrameRecording = false;
    return {
      trace: window.__runSceneTrace,
      continuity: window.__runSceneContinuity,
      frames: window.__runSceneFrames,
    };
  });
  if (!Array.isArray(audit?.trace) || !Array.isArray(audit?.continuity) || !Array.isArray(audit?.frames)) {
    throw new Error(`Run scene audit state was lost: ${JSON.stringify(audit)}`);
  }
  const trace = audit.trace;
  const sequence = [];
  for (const entry of trace) {
    const previous = sequence[sequence.length - 1];
    if (
      !previous
      || previous.phase !== entry.phase
      || previous.committed !== entry.committed
      || previous.pending !== entry.pending
      || previous.relationship !== entry.relationship
    ) {
      sequence.push(entry);
    }
  }
  const phases = sequence.map((entry) => entry.phase);
  const violations = [];
  if (!sequence.some((entry) => entry.relationship === relationship)) {
    violations.push(`director never declared ${relationship}: ${JSON.stringify(sequence)}`);
  }
  if (relationship === 'selection-change' && phases.filter((phase) => phase === 'exiting').length !== 1) {
    violations.push(`selection expected one deselection phase; saw ${phases.join(' -> ')}`);
  }
  if (phases.filter((phase) => phase === 'loading').length !== 1) {
    violations.push(`expected exactly one preparation phase; saw ${phases.join(' -> ')}`);
  }
  if (!phases.includes('entering')) violations.push(`missing entrance; saw ${phases.join(' -> ')}`);
  if (phases[phases.length - 1] !== 'current') violations.push(`did not settle; saw ${phases.join(' -> ')}`);
  if (sequence[0]?.committed === sequence[sequence.length - 1]?.committed) {
    violations.push(`committed scene identity did not change (${sequence[0]?.committed})`);
  }
  const relationshipFrames = audit.frames.filter((frame) => frame.relationship === relationship);
  if (relationship === 'selection-change') {
    if (!relationshipFrames.some((frame) => frame.viewportOpacity !== null && frame.viewportOpacity < 0.05)) {
      violations.push('selection never reached its authored deselected viewport state');
    }
    if (relationshipFrames.some((frame) => frame.layers.length !== 1 || frame.layers[0].opacity < 0.99)) {
      violations.push('selection faded or duplicated its owning scene boundary');
    }
    if (
      !relationshipFrames.some((frame) => frame.controlsOpacity.length > 0)
      || relationshipFrames.some((frame) => frame.controlsOpacity.some((opacity) => opacity < 0.99))
    ) {
      violations.push('selection faded the retained Controls panel');
    }
  } else {
    const overlap = relationshipFrames.filter((frame) => frame.layers.length === 2);
    if (!overlap.some((frame) => frame.layers.every((layer) => layer.opacity > 0.01 && layer.opacity < 0.99))) {
      violations.push('scene replacement never produced an overlapping crossfade frame');
    }
    if (overlap.some((frame) => frame.layers.every((layer) => layer.opacity < 0.05))) {
      violations.push('scene replacement exposed a transparent midpoint');
    }
    if (relationshipFrames.some((frame) => frame.homepage)) {
      violations.push('Run scene replacement mounted the homepage fallback');
    }
  }
  const topology = await auditViewport(page, expectedView);
  if (topology.visibleViews.length !== 1 || topology.visibleViews[0] !== expectedView) {
    violations.push(`expected one visible ${expectedView} contribution; saw ${JSON.stringify(topology.visibleViews)}`);
  }
  if (topology.outsideAuthority !== 0) {
    violations.push(`${topology.outsideAuthority} Run viewport contribution(s) escaped the authored scene slot`);
  }
  if (continuityLipsanonId) {
    const blankFrame = audit.continuity.find((frame) => !frame.icons.some((icon) => icon.visible));
    if (blankFrame) {
      violations.push(`lipsanon continuity exposed a blank ${blankFrame.phase} frame: ${JSON.stringify(blankFrame.icons)}`);
    }
    if (!audit.continuity.some((frame) => (
      frame.phase === 'loading'
      && frame.icons.some((icon) => icon.kind === 'carry' && icon.visible)
    ))) {
      violations.push('landed lipsanon was not carried through destination preparation');
    }
    const finalStrip = audit.continuity[audit.continuity.length - 1]?.icons
      .filter((icon) => icon.kind === 'strip' && icon.visible) ?? [];
    if (finalStrip.length !== 1) {
      violations.push(`incoming strip did not finish with one visible ${continuityLipsanonId}: ${JSON.stringify(finalStrip)}`);
    } else {
      const [owner] = finalStrip;
      const misplacedCarry = audit.continuity
        .flatMap((frame) => (
          frame.phase === 'loading' || frame.phase === 'entering'
            ? frame.icons.filter((icon) => icon.kind === 'carry' && icon.visible)
            : []
        ))
        .find((icon) => Math.abs(icon.x - owner.x) > 1 || Math.abs(icon.y - owner.y) > 1);
      if (misplacedCarry) {
        violations.push(`continuity carry missed the canonical strip coordinate: carry=${JSON.stringify(misplacedCarry)} strip=${JSON.stringify(owner)}`);
      }
      const overlappingHandoff = audit.continuity.some((frame) => (
        frame.phase === 'entering'
        && frame.icons.some((icon) => icon.kind === 'carry' && icon.visible)
        && frame.icons.some((icon) => icon.kind === 'strip' && icon.visible)
      ));
      if (!overlappingHandoff) violations.push('incoming strip never became visible beneath the continuity carry');
    }
  }
  return { label, phases, relationship, topology, violations };
}

try {
  const page = await browser.newPage();
  // This wide/short shape reproduces the width-derived 16:9 mat overflow that once
  // exposed a native workspace scrollbar beside Controls.
  await page.setViewport({ width: 3440, height: 1440, deviceScaleFactor: 1 });

  const signIn = new URL('/api/auth/sign-in', origin);
  signIn.searchParams.set('returnTo', '/api/auth/me');
  const auth = await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  if (!auth?.ok()) throw new Error(`local sign-in failed (${auth?.status() ?? 'no response'})`);

  await page.goto(startUrl.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForFunction(
    `${settled} && Boolean(document.querySelector('[data-testid="run-bona-vacantia"]'))`,
    { timeout: TIMEOUT },
  );

  const matGeometry = await page.evaluate(() => {
    const content = document.querySelector('.run-vacantia-content');
    const stage = document.querySelector('.run-vacantia-content > .lipsanon-mat-stage');
    return {
      contentClientHeight: content?.clientHeight ?? -1,
      contentScrollHeight: content?.scrollHeight ?? -1,
      stageHeight: stage?.getBoundingClientRect().height ?? -1,
      overflowY: content ? getComputedStyle(content).overflowY : null,
    };
  });
  if (
    matGeometry.contentClientHeight < 1
    || matGeometry.contentScrollHeight !== matGeometry.contentClientHeight
    || Math.abs(matGeometry.stageHeight - matGeometry.contentClientHeight) > 1
    || matGeometry.overflowY !== 'hidden'
  ) {
    throw new Error(`Bona mat escaped its ultrawide scene slot: ${JSON.stringify(matGeometry)}`);
  }
  console.log(`OK Bona mat ultrawide geometry: ${JSON.stringify(matGeometry)}`);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.waitForFunction(settled, { timeout: TIMEOUT });

  const results = [];
  results.push(await transition(page, {
    label: 'Bona mat -> target ledger',
    click: '.run-vacantia-take[aria-label="Take Conscription Notice"]',
    final: `${settled} && new URLSearchParams(location.search).get('view') === 'bona-target' && Boolean(document.querySelector('[data-testid="run-bona-vacantia-target"]'))`,
    expectedView: 'bona-target',
    relationship: 'selection-change',
    continuityLipsanonId: 'conscription-notice',
  }));

  const targetUi = await page.evaluate(() => ({
    targetText: document.querySelector('[data-testid="run-bona-vacantia-target"]')?.textContent ?? '',
    targetIcons: document.querySelectorAll('[data-testid="run-bona-vacantia-target"] .run-lipsanon-icon').length,
    stripIcons: document.querySelectorAll('[data-testid="run-lipsanon-strip"] [data-lipsanon-id="conscription-notice"]').length,
    selectLabels: [...document.querySelectorAll('.run-army-ledger-row')].map((node) => node.getAttribute('aria-label')),
  }));
  const uiViolations = [];
  if (/Bona Vacantia/i.test(targetUi.targetText)) uiViolations.push('target workspace repeats “Bona Vacantia”');
  if (targetUi.targetIcons !== 0) uiViolations.push(`target workspace draws ${targetUi.targetIcons} duplicate lipsanon icon(s)`);
  if (targetUi.stripIcons !== 1) uiViolations.push(`held strip draws ${targetUi.stripIcons} Conscription Notice icons`);
  if (!targetUi.selectLabels.length || targetUi.selectLabels.some((label) => !label?.startsWith('Select '))) {
    uiViolations.push(`unit rows are not explicitly selectable: ${JSON.stringify(targetUi.selectLabels)}`);
  }
  results.push({ label: 'Target UI contract', phases: [], topology: null, violations: uiViolations });

  results.push(await transition(page, {
    label: 'Bona target ledger -> unit profile',
    click: '.run-army-ledger-row',
    final: `${settled} && Boolean(new URLSearchParams(location.search).get('unit')) && Boolean(document.querySelector('[data-testid="run-army-profile-workspace"]'))`,
    expectedView: 'bona-target',
    relationship: 'selection-change',
  }));

  await page.goto(new URL('/run?view=army', origin).href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForFunction(
    `${settled} && Boolean(document.querySelector('[data-testid="run-army-ledger-workspace"]'))`,
    { timeout: TIMEOUT },
  );
  results.push(await transition(page, {
    label: 'Army ledger -> unit profile',
    click: '.run-army-ledger-row',
    final: `${settled} && Boolean(new URLSearchParams(location.search).get('unit')) && Boolean(document.querySelector('[data-testid="run-army-profile-workspace"]'))`,
    expectedView: 'army',
    relationship: 'selection-change',
  }));

  await page.goto(startUrl.href, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForFunction(
    `${settled} && Boolean(document.querySelector('[data-testid="run-bona-vacantia"]'))`,
    { timeout: TIMEOUT },
  );
  results.push(await transition(page, {
    label: 'Ordinary Bona take -> Sectio continuity',
    click: '.run-vacantia-take[aria-label="Take Royal Decree"]',
    final: `${settled} && Boolean(document.querySelector('[data-testid="run-sectio-workspace"]'))`,
    expectedView: 'sectio',
    relationship: 'scene-replacement',
    continuityLipsanonId: 'royal-decree',
  }));

  let failed = false;
  for (const result of results) {
    const ok = result.violations.length === 0;
    failed ||= !ok;
    console.log(`${ok ? 'OK' : 'FAIL'} ${result.label}${result.phases.length ? `: ${result.phases.join(' -> ')}` : ''}`);
    if (!ok) console.error(`  ${result.violations.join('; ')}`);
  }
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
