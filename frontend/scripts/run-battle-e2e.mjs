#!/usr/bin/env node
// Live-input E2E for the Run battle loop: proves an anonymous player can actually
// PLAY with real hit-tested mouse clicks (the unit tests exercise stores and rules,
// not the pointer path — an invisible overlay shielding the board passes every unit
// test while making the game unplayable; see the strategikon-slot regression, #552).
//
// Drives a FRESH anonymous profile end-to-end: start run → leave the opening Sectio without buying → begin battle
// → click a unit's tile → click a legal destination → assert the move commits, the
// enemy replies, and the open Strategikon still takes the pointer. Fails loudly at
// the exact step where a click is swallowed.
//
// Usage: npm run e2e:run-battle -- <base-url>   (needs a live dev server; anonymous
// runs live in the browser profile, so every invocation starts clean)

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
if (!base) { console.error('usage: npm run e2e:run-battle -- <base-url>'); process.exit(2); }
const transitionOnly = process.argv.includes('--transition-only');
const deploymentOnly = process.argv.includes('--deployment-only');
const undoOnly = process.argv.includes('--undo-only');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROMES.find(existsSync);
if (!executablePath) { console.error('No Chrome/Edge found.'); process.exit(1); }
mkdirSync('tmp-shots', { recursive: true });
const browserProfile = mkdtempSync(join(tmpdir(), 'ct-run-battle-'));

const browser = await puppeteer.launch({
  executablePath,
  userDataDir: browserProfile,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--host-resolver-rules=MAP *.localhost 127.0.0.1', '--hide-scrollbars'],
});

const fail = async (step, extra) => {
  console.error(`FAIL at ${step}${extra ? ' — ' + extra : ''}`);
  try { await browser.close(); } catch { /* already gone */ }
  rmSync(browserProfile, { recursive: true, force: true });
  process.exit(1);
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => console.error(`page error: ${error.message}`));
  // The named development backend carries the owner's verified grant for every
  // loopback request. This proof explicitly owns a disposable anonymous Run, so
  // answer only the read-only auth projection as signed out and leave all game,
  // content, media, and health requests on the real backend.
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    if (request.method() === 'GET' && requestUrl.pathname === '/api/auth/me') {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signed_in: false }),
      });
      return;
    }
    void request.continue();
  });

  const navigationResponse = await page.goto(`${base}/play/select/run/new`, { waitUntil: 'domcontentloaded' });

  // App booted: the authored scene director has committed the Run picker and released
  // the static bootstrap face. Rendered controls behind a still-preparing scene are not
  // interactive authority.
  try {
    await page.waitForFunction(() => document.querySelector('[data-scene-phase="current"]')
      && !document.getElementById('app-bootstrap-status')
      && [...document.querySelectorAll('button')]
        .some((button) => (button.textContent || '').trim() === 'Start Run' && !button.disabled));
  } catch {
    const bootState = await page.evaluate(async () => {
      const timeline = await import('/src/diagnostics/loadingTimeline.ts');
      const director = document.querySelector('.scene-director');
      const boundary = document.querySelector('.scene-boundary');
      return {
        href: window.location.href,
        title: document.title,
        body: document.body?.innerText?.slice(0, 800) ?? '',
        director: director ? {
          phase: director.getAttribute('data-scene-phase'),
          committed: director.getAttribute('data-scene-committed'),
          pending: director.getAttribute('data-scene-pending'),
        } : null,
        boundary: boundary ? {
          scene: boundary.getAttribute('data-scene'),
          participants: boundary.getAttribute('data-scene-participants'),
          unresolved: boundary.getAttribute('data-scene-unresolved'),
        } : null,
        timeline: timeline.loadingEvents().slice(-15),
      };
    });
    await fail('app boot', `HTTP ${navigationResponse?.status() ?? 'none'}; ${JSON.stringify(bootState)}`);
  }

  // Click a button by exact visible label via REAL mouse coordinates (hit-tested).
  // Waits until the button exists, has geometry, and is not inside an inert subtree
  // (scene transitions mark preparing regions inert — clicks there are void by design).
  const clickButton = async (label) => {
    try {
      await page.waitForFunction((text) => {
        const btn = [...document.querySelectorAll('button')]
          .find((b) => (b.textContent || '').trim() === text && b.getBoundingClientRect().width > 0);
        return !!btn && !btn.disabled && !btn.closest('[inert]');
      }, { timeout: 15_000 }, label);
    } catch {
      return false;
    }
    const point = await page.evaluate((text) => {
      const btn = [...document.querySelectorAll('button')]
        .find((b) => (b.textContent || '').trim() === text
          && b.getBoundingClientRect().width > 0
          && !b.disabled
          && !b.closest('[inert]'));
      if (!btn) return null;
      btn.scrollIntoView({ block: 'nearest' });
      // Aim like a user: pick a sample point inside the button that ACTUALLY hit-tests
      // to it (an unrelated element may overlap its geometric center).
      const r = btn.getBoundingClientRect();
      const samples = [[0.5, 0.5], [0.5, 0.25], [0.5, 0.75], [0.25, 0.5], [0.75, 0.5], [0.15, 0.15], [0.85, 0.85]];
      for (const [fx, fy] of samples) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const top = document.elementFromPoint(x, y);
        if (top && (top === btn || btn.contains(top))) return { x, y };
      }
      return null;
    }, label);
    if (!point) return false;
    await page.mouse.click(point.x, point.y);
    return true;
  };

  const buttonDiagnostics = (label) => page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => (candidate.textContent || '').trim() === text);
    if (!button) return { found: false };
    button.scrollIntoView({ block: 'nearest' });
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const director = document.querySelector('.scene-director');
    const boundary = document.querySelector('.scene-boundary');
    return {
      found: true,
      disabled: button.disabled,
      inert: Boolean(button.closest('[inert]')),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      hit: hit ? { tag: hit.tagName, className: hit.className, text: hit.textContent?.trim().slice(0, 120) } : null,
      director: director ? {
        phase: director.getAttribute('data-scene-phase'),
        committed: director.getAttribute('data-scene-committed'),
        pending: director.getAttribute('data-scene-pending'),
      } : null,
      boundary: boundary ? {
        scene: boundary.getAttribute('data-scene'),
        participants: boundary.getAttribute('data-scene-participants'),
        unresolved: boundary.getAttribute('data-scene-unresolved'),
      } : null,
    };
  }, label);

  const sceneDiagnostics = () => page.evaluate(async () => {
    const timeline = await import('/src/diagnostics/loadingTimeline.ts');
    const director = document.querySelector('.scene-director');
    return {
      director: director ? {
        phase: director.getAttribute('data-scene-phase'),
        committed: director.getAttribute('data-scene-committed'),
        pending: director.getAttribute('data-scene-pending'),
      } : null,
      boundaries: [...document.querySelectorAll('.scene-boundary')].map((boundary) => ({
        scene: boundary.getAttribute('data-scene'),
        role: boundary.getAttribute('data-scene-visual-role'),
        participants: boundary.getAttribute('data-scene-participants'),
        unresolved: boundary.getAttribute('data-scene-unresolved'),
        inert: boundary.hasAttribute('inert'),
        text: boundary.textContent?.replace(/\s+/g, ' ').trim().slice(0, 300),
      })),
      loading: timeline.loadingEvents().slice(-20),
    };
  });

  const waitPhase = async (phase, step) => {
    try {
      await page.waitForFunction(
        (want) => {
          const director = document.querySelector('.scene-director');
          const scenePhase = want === 'battle' || want === 'deployment' ? 'battlefield' : want;
          return director?.getAttribute('data-scene-phase') === 'current'
            && (director.getAttribute('data-scene-committed') ?? '').includes(`:${scenePhase}:`)
            && !director.getAttribute('data-scene-pending');
        },
        { timeout: 45_000 },
        phase,
      );
    } catch {
      await fail(step, `committed Run scene never became "${phase}"; ${JSON.stringify(await sceneDiagnostics())}`);
    }
  };

  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Start Run'));
  if (!await clickButton('Start Run')) await fail('start-run', JSON.stringify(await buttonDiagnostics('Start Run')));

  // A fresh Conflict can now begin with mandatory Bona Vacantia before its opening
  // Sectio. Wait for the director-owned destination, then take one of the ordinary
  // offers with a real hit-tested click (only Conscription Notice needs a second step).
  try {
    await page.waitForFunction(() => {
      const director = document.querySelector('.scene-director');
      const committed = director?.getAttribute('data-scene-committed') ?? '';
      return director?.getAttribute('data-scene-phase') === 'current'
        && (committed.includes(':bona-vacantia:') || committed.includes(':sectio:'));
    }, { timeout: 45_000 });
  } catch {
    await fail('start-run-phase', JSON.stringify(await sceneDiagnostics()));
  }
  const bonaOffer = await page.$('button.run-vacantia-take:not([data-lipsanon-id="conscription-notice"])');
  if (bonaOffer) {
    const offerBox = await bonaOffer.boundingBox();
    if (!offerBox) await fail('opening-bona-vacantia', 'ordinary lipsanon offer has no geometry');
    await page.mouse.click(offerBox.x + offerBox.width / 2, offerBox.y + offerBox.height / 2);
  }
  await waitPhase('sectio', 'start-run');

  if (deploymentOnly) {
    const prepared = await page.evaluate(async () => {
      const { useActiveRun } = await import('/src/run/store.ts');
      const { leaveSectio, prepareDeployment } = await import('/src/run/model.ts');
      const { deploymentOrderedUnitIds } = await import('/src/run/deployment.ts');
      const run = useActiveRun.getState().run;
      if (!run || run.phase !== 'sectio' || run.army.length < 3) return null;
      const cardOrder = deploymentOrderedUnitIds(prepareDeployment(leaveSectio(run)));
      const manuallyPlaced = new Set(cardOrder.slice(1, 3));
      if (cardOrder.length < 3 || manuallyPlaced.size !== 2) return null;
      const army = run.army.map((unit) => ({
        ...unit,
        abilities: [
          ...unit.abilities.filter((ability) => ability !== 'adlected'),
          ...(manuallyPlaced.has(unit.id) ? ['adlected'] : []),
        ],
      }));
      useActiveRun.getState().replace({ ...run, army, updatedAt: new Date().toISOString() });
      return army.filter((unit) => unit.abilities.includes('adlected')).map((unit) => unit.id);
    });
    if (prepared?.length !== 2) await fail('prepare-deployment-fixture', JSON.stringify(prepared));
  }

  await page.evaluate(() => {
    const outgoing = document.querySelector('.run-scene-slot');
    const nativeAnimate = Element.prototype.animate;
    const probe = {
      outgoing,
      nativeAnimate,
      frame: 0,
      sawPending: false,
      sawOverlap: false,
      sawEntering: false,
      retainedOutgoing: false,
      inertOutgoing: false,
      blankFrame: false,
      interactiveBeforeCommit: false,
      arrivalBeforeCommit: false,
      cameraSamples: [],
      visibleCameraFrames: 0,
      visibleEnteringCameraFrames: 0,
      dealAnimations: 0,
      dealAnimationRefs: [],
      dealConstructedBeforeCommit: false,
      dealPlayedBeforeCommit: false,
      dealAdvancedAfterCommit: false,
      dealCalls: [],
      dealCountSamples: [],
      farthestDealOrigin: 0,
    };
    window.__ctBattlefieldTransitionProbe = probe;
    Element.prototype.animate = function deploymentDealProbe(frames, options) {
      const animation = nativeAnimate.call(this, frames, options);
      if (this.matches?.('[data-deployment-flight-card], [data-deployment-remainder-flight]')) {
        const director = document.querySelector('.scene-director');
        probe.dealConstructedBeforeCommit ||= director?.getAttribute('data-scene-phase') !== 'current'
          || Boolean(director?.getAttribute('data-scene-pending'))
          || !(director?.getAttribute('data-scene-committed') ?? '').includes(':battlefield:');
        probe.dealAnimationRefs.push(animation);
        probe.dealCalls.push({
          phase: director?.getAttribute('data-scene-phase') ?? null,
          committed: director?.getAttribute('data-scene-committed') ?? null,
          pending: director?.getAttribute('data-scene-pending') ?? null,
          boundary: this.closest?.('.scene-boundary')?.className ?? null,
        });
        const first = Array.isArray(frames) ? frames[0] : null;
        const transform = first && typeof first === 'object' ? String(first.transform ?? '') : '';
        const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
        const centerDeck = document.querySelector('[data-deployment-center-deck]');
        if (match && centerDeck) {
          // The native animation has already installed its time-zero keyframe. Read the
          // transformed card directly: adding the authored translation again would count
          // the origin offset twice.
          const card = this.getBoundingClientRect();
          const source = centerDeck.getBoundingClientRect();
          const originX = card.left + card.width / 2;
          const originY = card.top + card.height / 2;
          const sourceX = source.left + source.width / 2;
          const sourceY = source.top + source.height / 2;
          probe.farthestDealOrigin = Math.max(
            probe.farthestDealOrigin,
            Math.hypot(originX - sourceX, originY - sourceY),
          );
        }
        probe.dealAnimations += 1;
      }
      return animation;
    };
    const tick = () => {
      const director = document.querySelector('.scene-director');
      const phase = director?.getAttribute('data-scene-phase') ?? 'missing';
      const pending = director?.getAttribute('data-scene-pending') ?? '';
      const deploymentCommitted = phase === 'current'
        && !pending
        && (director?.getAttribute('data-scene-committed') ?? '').includes(':battlefield:');
      if (probe.dealAnimationRefs.length > 0) {
        const times = probe.dealAnimationRefs.map((animation) => Number(animation.currentTime ?? 0));
        if (!deploymentCommitted) {
          probe.dealPlayedBeforeCommit ||= times.some((time) => time > 0.5);
        } else {
          probe.dealAdvancedAfterCommit ||= times.some((time) => time > 0.5);
        }
      }
      const dealCount = Number(document.querySelector('.run-deployment-card-count')?.textContent ?? NaN);
      if (Number.isFinite(dealCount) && probe.dealCountSamples.at(-1) !== dealCount) {
        probe.dealCountSamples.push(dealCount);
      }
      const boundaries = [...document.querySelectorAll('.scene-boundary')];
      const transitioning = phase !== 'current' && phase !== 'startup';
      probe.sawPending ||= pending.includes(':battlefield:');
      probe.sawOverlap ||= boundaries.some((entry) => entry.getAttribute('data-scene-visual-role') === 'outgoing')
        && boundaries.some((entry) => entry.getAttribute('data-scene-visual-role') === 'incoming');
      probe.sawEntering ||= phase === 'entering';
      probe.retainedOutgoing ||= transitioning && Boolean(probe.outgoing?.isConnected);
      probe.inertOutgoing ||= transitioning && Boolean(probe.outgoing?.closest('[inert]'));
      const incomingBoundary = boundaries
        .find((entry) => entry.getAttribute('data-scene-visual-role') === 'incoming');
      const incomingBoard = incomingBoundary?.querySelector('[data-testid="skirmish-board"]');
      const incomingOpacity = incomingBoundary
        ? Number.parseFloat(getComputedStyle(incomingBoundary).opacity)
        : 0;
      if (incomingBoard
        && !incomingBoard.classList.contains('is-board-loading')
        && incomingOpacity > 0.01) {
        const artLayer = incomingBoard.querySelector('.tileset-view-art-layer');
        if (artLayer) {
          const camera = [
            artLayer.style.getPropertyValue('--view-zoom'),
            artLayer.style.getPropertyValue('--view-pan-x'),
            artLayer.style.getPropertyValue('--view-pan-y'),
          ].join('|');
          probe.visibleCameraFrames += 1;
          if (phase === 'entering') probe.visibleEnteringCameraFrames += 1;
          if (probe.cameraSamples.at(-1)?.camera !== camera) {
            probe.cameraSamples.push({ phase, camera, opacity: incomingOpacity });
          }
        }
      }
      if (transitioning) {
        const visibleBoundary = boundaries.some((entry) => {
          const rect = entry.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && Number.parseFloat(getComputedStyle(entry).opacity) > 0.01;
        });
        if (!visibleBoundary) probe.blankFrame = true;
        if (incomingBoard?.getAttribute('data-interactive') === 'true') probe.interactiveBeforeCommit = true;
        if (incomingBoard?.getAttribute('data-arrival-state') === 'entering') probe.arrivalBeforeCommit = true;
      }
      probe.frame = requestAnimationFrame(tick);
    };
    probe.frame = requestAnimationFrame(tick);
  });

  if (!await clickButton('Continue to first Battle')) {
    await fail('opening-continue-without-purchase', JSON.stringify(await buttonDiagnostics('Continue to first Battle')));
  }
  await waitPhase('deployment', 'opening-continue-without-purchase');
  await page.waitForFunction(() => {
      const director = document.querySelector('.scene-director');
      return director?.getAttribute('data-scene-phase') === 'current'
      && (director.getAttribute('data-scene-committed') ?? '').includes(':battlefield:')
      && !director.getAttribute('data-scene-pending');
  });
  await page.waitForSelector('[data-deployment-stack-card]', { timeout: 5_000 });
  // Deployment begins as a committed, empty battlefield with the complete deck in the
  // middle. Nothing has moved or been revealed, and transport already owns its stable
  // Controls seat while the player decides whether to deal.
  const awaitingDealState = await page.evaluate(async () => {
    const { useActiveRun } = await import('/src/run/store.ts');
    const run = useActiveRun.getState().run;
    const deal = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Deal');
    const transportRect = document.querySelector('[data-testid="deployment-transport-control"]')?.getBoundingClientRect();
    const probe = window.__ctBattlefieldTransitionProbe;
    return {
      phase: run?.phase ?? null,
      stage: run?.deployment?.stage ?? null,
      placements: run?.deployment ? Object.keys(run.deployment.placements).length : null,
      totalCards: run?.cards.length ?? null,
      dealtCards: run?.deployment?.dealtCardIds.length ?? null,
      stackCards: document.querySelectorAll('[data-deployment-stack-card]').length,
      backs: document.querySelectorAll('[data-deployment-stack-card] .run-card-back').length,
      centerDeck: Boolean(document.querySelector('[data-deployment-center-deck]')),
      centerBacks: document.querySelectorAll('[data-deployment-center-deck] .run-card-back').length,
      centerCount: Number(document.querySelector('.run-deployment-center-count')?.textContent ?? NaN),
      board: Boolean(document.querySelector('[data-testid="skirmish-board"]')),
      deal: Boolean(deal),
      dealDisabled: deal?.disabled ?? null,
      playDisabled: document.querySelector('[data-testid="deployment-play"]')?.disabled ?? null,
      nextDisabled: document.querySelector('[data-testid="deployment-next"]')?.disabled ?? null,
      fullDeployDisabled: document.querySelector('[data-testid="deployment-full-deploy"]')?.disabled ?? null,
      transportRect: transportRect
        ? { x: transportRect.x, y: transportRect.y, width: transportRect.width, height: transportRect.height }
        : null,
      strategikonToggle: Boolean(document.querySelector('[data-testid="strategikon-toggle"]')),
      obsoleteDeploymentButton: [...document.querySelectorAll('.run-deployment-controls button')]
        .some((button) => button.textContent?.trim() === 'Deployment'),
      explanatoryCopy: document.body.textContent?.includes('These cards supply this combat') ?? false,
      confirmationCopy: document.body.textContent?.includes('Your deployment deal') ?? false,
      dealAnimations: probe?.dealAnimations ?? null,
    };
  });
  if (
    awaitingDealState.phase !== 'deployment'
    || awaitingDealState.stage !== 'awaiting-deal'
    || awaitingDealState.placements !== 0
    || awaitingDealState.totalCards < awaitingDealState.dealtCards
    || awaitingDealState.stackCards !== awaitingDealState.dealtCards
    || awaitingDealState.backs !== awaitingDealState.stackCards
    || !awaitingDealState.centerDeck
    || awaitingDealState.centerBacks !== Math.min(3, awaitingDealState.totalCards)
    || awaitingDealState.centerCount !== awaitingDealState.totalCards
    || !awaitingDealState.board
    || !awaitingDealState.deal
    || awaitingDealState.dealDisabled
    || !awaitingDealState.playDisabled
    || !awaitingDealState.nextDisabled
    || !awaitingDealState.fullDeployDisabled
    || !awaitingDealState.transportRect
    || !awaitingDealState.strategikonToggle
    || awaitingDealState.obsoleteDeploymentButton
    || awaitingDealState.explanatoryCopy
    || awaitingDealState.confirmationCopy
    || awaitingDealState.dealAnimations !== 0
  ) {
    await fail('deployment-awaiting-deal-boundary', JSON.stringify(awaitingDealState));
  }

  const awaitingDealShot = 'tmp-shots/run-opening-deployment-awaiting-deal.png';
  await page.screenshot({ path: awaitingDealShot });
  console.log('Deployment awaiting-deal screenshot:', awaitingDealShot);
  if (!await clickButton('Deal')) {
    await fail('deployment-deal', JSON.stringify(await buttonDiagnostics('Deal')));
  }
  await page.waitForFunction(() => document.querySelector('[data-deployment-card-stage="dealing"]'));
  const dealMotionShot = 'tmp-shots/run-opening-deployment-deal-motion.png';
  await page.screenshot({ path: dealMotionShot });
  console.log('Deployment deal-motion screenshot:', dealMotionShot);

  const dealingState = await page.evaluate(async () => {
    const { useActiveRun } = await import('/src/run/store.ts');
    const run = useActiveRun.getState().run;
    return {
      stage: run?.deployment?.stage ?? null,
      placements: run?.deployment ? Object.keys(run.deployment.placements).length : null,
      dealDisabled: [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Dealing…')?.disabled ?? null,
      playDisabled: document.querySelector('[data-testid="deployment-play"]')?.disabled ?? null,
      nextDisabled: document.querySelector('[data-testid="deployment-next"]')?.disabled ?? null,
      fullDeployDisabled: document.querySelector('[data-testid="deployment-full-deploy"]')?.disabled ?? null,
    };
  });
  if (
    dealingState.stage !== 'dealing'
    || dealingState.placements !== 0
    || !dealingState.dealDisabled
    || !dealingState.playDisabled
    || !dealingState.nextDisabled
    || !dealingState.fullDeployDisabled
  ) {
    await fail('deployment-dealing-boundary', JSON.stringify(dealingState));
  }

  try {
    await page.waitForFunction(() => document.querySelector('[data-deployment-stack-card].is-active.is-revealing'));
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  } catch {
    await fail('deployment-card-flip-motion', JSON.stringify(await sceneDiagnostics()));
  }
  const revealMotionShot = 'tmp-shots/run-opening-deployment-card-reveal.png';
  await page.screenshot({ path: revealMotionShot });
  console.log('Deployment card-reveal screenshot:', revealMotionShot);

  try {
    await page.waitForFunction(() => document.querySelector('[data-deployment-card-stage="unit"]')
      && !document.querySelector('[data-testid="deployment-next"]')?.disabled);
  } catch {
    const stalledDeal = await page.evaluate(async () => {
      const { useActiveRun } = await import('/src/run/store.ts');
      const run = useActiveRun.getState().run;
      const probe = window.__ctBattlefieldTransitionProbe;
      const director = document.querySelector('.scene-director');
      return {
        phase: run?.phase ?? null,
        stage: run?.deployment?.stage ?? null,
        transport: run?.deployment?.transport ?? null,
        placements: Object.keys(run?.deployment?.placements ?? {}).length,
        dealCount: document.querySelector('.run-deployment-card-count')?.textContent ?? null,
        centerCount: document.querySelector('.run-deployment-center-count')?.textContent ?? null,
        flightCount: document.querySelectorAll('[data-deployment-flight-card]').length,
        cards: [...document.querySelectorAll('[data-deployment-stack-card]')]
          .map((card) => ({ id: card.getAttribute('data-deployment-stack-card'), className: card.className })),
        animations: probe?.dealAnimationRefs.map((animation) => ({
          playState: animation.playState,
          currentTime: Number(animation.currentTime ?? 0),
          pending: animation.pending,
        })) ?? null,
        dealCalls: probe?.dealCalls ?? null,
        directorPhase: director?.getAttribute('data-scene-phase') ?? null,
        committed: director?.getAttribute('data-scene-committed') ?? null,
        pending: director?.getAttribute('data-scene-pending') ?? null,
      };
    });
    await fail('deployment-deal-settle', JSON.stringify(stalledDeal));
  }

  try {
    await page.waitForFunction(() => {
      const card = document.querySelector('[data-deployment-stack-card].is-active.is-revealed');
      const front = card?.querySelector('.run-deployment-stack-side.is-front');
      const rect = card?.getBoundingClientRect();
      if (!card || !front || !rect) return false;
      const paintedSide = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        .map((element) => element.closest('.run-deployment-stack-side'))
        .find(Boolean);
      return paintedSide === front;
    }, { timeout: 5_000 });
  } catch {
    const revealPresentation = await page.evaluate(() => {
      const card = document.querySelector('[data-deployment-stack-card].is-active');
      const front = card?.querySelector('.run-deployment-stack-side.is-front');
      const back = card?.querySelector('.run-deployment-stack-side.is-back');
      const rect = card?.getBoundingClientRect();
      const hitStack = rect
        ? document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          .slice(0, 8)
          .map((element) => ({ tag: element.tagName, className: element.className }))
        : [];
      return {
        className: card?.className ?? null,
        front: Boolean(front),
        frontLabel: front?.querySelector('.run-card-action')?.getAttribute('aria-label') ?? null,
        frontTransform: front ? getComputedStyle(front).transform : null,
        frontBackface: front ? getComputedStyle(front).backfaceVisibility : null,
        backTransform: back ? getComputedStyle(back).transform : null,
        backBackface: back ? getComputedStyle(back).backfaceVisibility : null,
        hitStack,
      };
    });
    await fail('deployment-card-reveal', JSON.stringify(revealPresentation));
  }

  const transportState = await page.evaluate(() => {
    const transportRect = document.querySelector('[data-testid="deployment-transport-control"]')?.getBoundingClientRect();
    return {
      stackCards: document.querySelectorAll('[data-deployment-stack-card]').length,
      count: Number(document.querySelector('.run-deployment-card-count')?.textContent ?? 0),
      board: Boolean(document.querySelector('[data-testid="skirmish-board"]')),
      playDisabled: document.querySelector('[data-testid="deployment-play"]')?.disabled ?? null,
      nextDisabled: document.querySelector('[data-testid="deployment-next"]')?.disabled ?? null,
      fullDeployDisabled: document.querySelector('[data-testid="deployment-full-deploy"]')?.disabled ?? null,
      transportRect: transportRect
        ? { x: transportRect.x, y: transportRect.y, width: transportRect.width, height: transportRect.height }
        : null,
      strategikonToggle: Boolean(document.querySelector('[data-testid="strategikon-toggle"]')),
    };
  });
  const transportGeometryChanged = !awaitingDealState.transportRect || !transportState.transportRect
    || ['x', 'y', 'width', 'height'].some((key) => (
      Math.abs(awaitingDealState.transportRect[key] - transportState.transportRect[key]) > 0.5
    ));
  if (
    transportState.stackCards === 0
    || transportState.count !== transportState.stackCards
    || !transportState.board
    || transportState.playDisabled
    || transportState.nextDisabled
    || transportState.fullDeployDisabled
    || transportGeometryChanged
    || !transportState.strategikonToggle
  ) {
    await fail('deployment-transport-boundary', JSON.stringify(transportState));
  }

  const battlefieldTransition = await page.evaluate(() => {
    const probe = window.__ctBattlefieldTransitionProbe;
    cancelAnimationFrame(probe.frame);
    Element.prototype.animate = probe.nativeAnimate;
    const director = document.querySelector('.scene-director');
    const finalArtLayer = document.querySelector('[data-testid="skirmish-board"] .tileset-view-art-layer');
    const finalCamera = finalArtLayer ? [
      finalArtLayer.style.getPropertyValue('--view-zoom'),
      finalArtLayer.style.getPropertyValue('--view-pan-x'),
      finalArtLayer.style.getPropertyValue('--view-pan-y'),
    ].join('|') : null;
    return {
      sawPending: probe.sawPending,
      sawOverlap: probe.sawOverlap,
      sawEntering: probe.sawEntering,
      retainedOutgoing: probe.retainedOutgoing,
      inertOutgoing: probe.inertOutgoing,
      blankFrame: probe.blankFrame,
      interactiveBeforeCommit: probe.interactiveBeforeCommit,
      arrivalBeforeCommit: probe.arrivalBeforeCommit,
      cameraSamples: probe.cameraSamples,
      visibleCameraFrames: probe.visibleCameraFrames,
      visibleEnteringCameraFrames: probe.visibleEnteringCameraFrames,
      dealAnimations: probe.dealAnimations,
      dealConstructedBeforeCommit: probe.dealConstructedBeforeCommit,
      dealPlayedBeforeCommit: probe.dealPlayedBeforeCommit,
      dealAdvancedAfterCommit: probe.dealAdvancedAfterCommit,
      dealCalls: probe.dealCalls,
      dealCountSamples: probe.dealCountSamples,
      farthestDealOrigin: probe.farthestDealOrigin,
      finalCamera,
      finalPhase: director?.getAttribute('data-scene-phase') ?? null,
      finalCommitted: director?.getAttribute('data-scene-committed') ?? null,
      finalPending: director?.getAttribute('data-scene-pending') ?? null,
    };
  });
  if (
    !battlefieldTransition.sawPending
    || !battlefieldTransition.sawOverlap
    || !battlefieldTransition.sawEntering
    || !battlefieldTransition.retainedOutgoing
    || !battlefieldTransition.inertOutgoing
    || battlefieldTransition.blankFrame
    || battlefieldTransition.interactiveBeforeCommit
    || battlefieldTransition.arrivalBeforeCommit
    || battlefieldTransition.visibleCameraFrames === 0
    || battlefieldTransition.visibleEnteringCameraFrames === 0
    || battlefieldTransition.cameraSamples.length !== 1
    || battlefieldTransition.cameraSamples[0]?.camera !== battlefieldTransition.finalCamera
    || battlefieldTransition.dealAnimations !== transportState.stackCards
      + (awaitingDealState.totalCards > awaitingDealState.dealtCards ? 1 : 0)
    || battlefieldTransition.dealConstructedBeforeCommit
    || battlefieldTransition.dealPlayedBeforeCommit
    || !battlefieldTransition.dealAdvancedAfterCommit
    || JSON.stringify(battlefieldTransition.dealCountSamples) !== JSON.stringify(
      Array.from({ length: transportState.stackCards + 1 }, (_, index) => index),
    )
    || battlefieldTransition.dealCalls.some((call) => (
      call.phase !== 'current'
      || call.pending
      || !call.committed?.includes(':battlefield:')
    ))
    || battlefieldTransition.farthestDealOrigin > 1.5
    || battlefieldTransition.finalPhase !== 'current'
    || !battlefieldTransition.finalCommitted?.includes(':battlefield:')
    || battlefieldTransition.finalPending
  ) {
    await fail('begin-deployment-transition', JSON.stringify(battlefieldTransition));
  }
  console.log('director-owned Sectio → empty Deployment, explicit center-deck partition, and counted deal: OK');

  await page.waitForFunction(() => document.querySelector('[data-testid="skirmish-board"]')
    ?.getAttribute('data-arriving') === 'false');
  const transitionShot = 'tmp-shots/run-deployment-transport.png';
  const transitionBoard = await page.$('.skirmish-war-room');
  if (!transitionBoard) await fail('transition-screenshot', 'Deployment battlefield unavailable after deal');
  await page.screenshot({ path: transitionShot });
  console.log('Deployment screenshot:', transitionShot);

  {
    const deploymentState = await page.evaluate(async () => {
      const { activeSkirmishStoreForDiagnostics } = await import('/src/game/SkirmishStoreContext.tsx');
      const { activeSkirmishViewStoreForDiagnostics } = await import('/src/game/SkirmishViewStoreContext.tsx');
      const board = document.querySelector('[data-testid="skirmish-board"]');
      const cameraLayer = board?.querySelector('.tileset-view-art-layer');
      const camera = () => cameraLayer ? [
        cameraLayer.style.getPropertyValue('--view-zoom'),
        cameraLayer.style.getPropertyValue('--view-pan-x'),
        cameraLayer.style.getPropertyValue('--view-pan-y'),
      ].join('|') : null;
      window.__ctDeploymentProbe = {
        board,
        boundary: board?.closest('.scene-boundary'),
        viewPane: board?.querySelector('.tileset-view-stage'),
        canvases: [...(board?.querySelectorAll('canvas') ?? [])],
        gameStore: activeSkirmishStoreForDiagnostics(),
        viewStore: activeSkirmishViewStoreForDiagnostics(),
        initialCamera: camera(),
        cameraSamples: [],
        lifecycleViolations: [],
        frame: 0,
      };
      const tick = () => {
        const probe = window.__ctDeploymentProbe;
        const currentBoard = document.querySelector('[data-testid="skirmish-board"]');
        const director = document.querySelector('.scene-director');
        const layer = currentBoard?.querySelector('.tileset-view-art-layer');
        const signature = layer ? [
          layer.style.getPropertyValue('--view-zoom'),
          layer.style.getPropertyValue('--view-pan-x'),
          layer.style.getPropertyValue('--view-pan-y'),
        ].join('|') : null;
        if (signature && probe.cameraSamples.at(-1) !== signature) probe.cameraSamples.push(signature);
        if (
          director?.getAttribute('data-scene-phase') !== 'current'
          || director.getAttribute('data-scene-pending')
          || currentBoard?.classList.contains('is-board-loading')
        ) {
          probe.lifecycleViolations.push({
            phase: director?.getAttribute('data-scene-phase') ?? null,
            pending: director?.getAttribute('data-scene-pending') ?? null,
            loading: currentBoard?.classList.contains('is-board-loading') ?? null,
          });
        }
        probe.frame = requestAnimationFrame(tick);
      };
      window.__ctDeploymentProbe.frame = requestAnimationFrame(tick);
      return {
        deployment: Boolean(document.querySelector('[data-testid="run-deployment"]')),
        pause: Boolean(document.querySelector('button[aria-label="Pause deployment"]')),
        play: Boolean(document.querySelector('[data-testid="deployment-play"]')),
        next: Boolean(document.querySelector('[data-testid="deployment-next"]')),
        fullDeploy: Boolean(document.querySelector('[data-testid="deployment-full-deploy"]')),
      };
    });
    if (
      !deploymentState.deployment
      || !deploymentState.pause
      || !deploymentState.play
      || !deploymentState.next
      || !deploymentState.fullDeploy
    ) {
      await fail('deployment-fixture', JSON.stringify(deploymentState));
    }

    const placementsBeforeStep = await page.evaluate(async () => {
      const { useActiveRun } = await import('/src/run/store.ts');
      return Object.keys(useActiveRun.getState().run?.deployment?.placements ?? {}).length;
    });
    const separatePlaceButton = await page.evaluate(() => [...document.querySelectorAll('button')]
      .some((button) => button.textContent?.trim().startsWith('Place ')));
    if (separatePlaceButton) await fail('deployment-next-control', 'a separate Place button was mounted');
    await page.click('[data-testid="deployment-next"]');
    await page.waitForFunction(async (before) => {
      const { useActiveRun } = await import('/src/run/store.ts');
      return Object.keys(useActiveRun.getState().run?.deployment?.placements ?? {}).length > before;
    }, {}, placementsBeforeStep);

    await page.click('[data-testid="deployment-full-deploy"]');
    // Full deploy is the fastest transport, not permission to answer required choices.
    // The fixture deliberately gives two units Adlected. Each highlighted-square choice
    // leaves transport paused, so the player must explicitly resume Full deploy afterward.
    for (let choice = 0; choice < 10; choice += 1) {
      await page.waitForFunction(() => (
        !document.querySelector('[data-testid="run-deployment"]')
        || Boolean(document.querySelector('button.run-deployment-cell.is-move:not([aria-disabled="true"])'))
        || (
          !document.querySelector('[data-testid="deployment-next"]')?.disabled
          && document.querySelector('[data-testid="deployment-full-deploy"]')?.getAttribute('aria-pressed') !== 'true'
        )
      ));
      if (!await page.$('[data-testid="run-deployment"]')) break;
      const legal = await page.$('button.run-deployment-cell.is-move:not([aria-disabled="true"])');
      if (!legal) {
        await page.click('[data-testid="deployment-full-deploy"]');
        continue;
      }
      const activeLabel = await page.$eval(
        '[data-testid="deployment-active-unit"]',
        (element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      );
      const box = await legal.boundingBox();
      if (!box) await fail('deployment-required-choice', 'highlighted square has no pointer geometry');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForFunction((previous) => {
        const active = document.querySelector('[data-testid="deployment-active-unit"]');
        return !document.querySelector('[data-testid="run-deployment"]')
          || !active
          || active.textContent?.replace(/\s+/g, ' ').trim() !== previous;
      }, {}, activeLabel);
    }
    try {
      await page.waitForFunction(() => document.querySelector('[data-testid="skirmish"]')
        && !document.querySelector('[data-testid="run-deployment"]'));
      await page.waitForFunction(() => document.querySelector('[data-testid="skirmish-board"]')
        ?.getAttribute('data-arriving') === 'false');
    } catch {
      const stalled = await page.evaluate(async () => {
        const { useActiveRun } = await import('/src/run/store.ts');
        const run = useActiveRun.getState().run;
        const director = document.querySelector('.scene-director');
        const board = document.querySelector('[data-testid="skirmish-board"]');
        return {
          phase: run?.phase ?? null,
          deploymentStage: run?.deployment?.stage ?? null,
          deploymentTransport: run?.deployment?.transport ?? null,
          activeCardIndex: run?.deployment?.activeCardIndex ?? null,
          unitCursor: run?.deployment?.unitCursor ?? null,
          settlingUnitIds: run?.deployment?.settlingUnitIds ?? null,
          directorPhase: director?.getAttribute('data-scene-phase') ?? null,
          committed: director?.getAttribute('data-scene-committed') ?? null,
          pending: director?.getAttribute('data-scene-pending') ?? null,
          arriving: board?.getAttribute('data-arriving') ?? null,
          controls: document.querySelector('.run-deployment-controls')?.textContent?.trim() ?? null,
        };
      });
      await fail('deployment-deploy-all-settle', JSON.stringify(stalled));
    }

    const deploymentResult = await page.evaluate(async () => {
      const { activeSkirmishStoreForDiagnostics } = await import('/src/game/SkirmishStoreContext.tsx');
      const { activeSkirmishViewStoreForDiagnostics } = await import('/src/game/SkirmishViewStoreContext.tsx');
      const probe = window.__ctDeploymentProbe;
      cancelAnimationFrame(probe.frame);
      const board = document.querySelector('[data-testid="skirmish-board"]');
      const gameStore = activeSkirmishStoreForDiagnostics();
      const viewStore = activeSkirmishViewStoreForDiagnostics();
      const currentCanvases = [...(board?.querySelectorAll('canvas') ?? [])];
      const finalLayer = board?.querySelector('.tileset-view-art-layer');
      const finalCamera = finalLayer ? [
        finalLayer.style.getPropertyValue('--view-zoom'),
        finalLayer.style.getPropertyValue('--view-pan-x'),
        finalLayer.style.getPropertyValue('--view-pan-y'),
      ].join('|') : null;
      return {
        battleControls: Boolean(document.querySelector('[data-testid="skirmish"]')),
        strategikonToggle: Boolean(document.querySelector('[data-testid="strategikon-toggle"]')),
        sameBoard: board === probe.board,
        sameBoundary: board?.closest('.scene-boundary') === probe.boundary,
        sameViewPane: board?.querySelector('.tileset-view-stage') === probe.viewPane,
        sameCanvases: currentCanvases.length === probe.canvases.length
          && currentCanvases.every((canvas, index) => canvas === probe.canvases[index]),
        sameGameStore: gameStore === probe.gameStore,
        sameViewStore: viewStore === probe.viewStore,
        initialCamera: probe.initialCamera,
        finalCamera,
        cameraSamples: probe.cameraSamples,
        lifecycleViolations: probe.lifecycleViolations,
        mountedGameStores: window.__ctMountedSkirmishStores?.length ?? 0,
        mountedViewStores: window.__ctMountedSkirmishViewStores?.length ?? 0,
      };
    });
    const deploymentShot = 'tmp-shots/run-deployment-battle-continuity.png';
    await page.screenshot({ path: deploymentShot });
    if (
      !deploymentResult.battleControls
      || !deploymentResult.strategikonToggle
      || !deploymentResult.sameBoard
      || !deploymentResult.sameBoundary
      || !deploymentResult.sameViewPane
      || !deploymentResult.sameCanvases
      || !deploymentResult.sameGameStore
      || !deploymentResult.sameViewStore
      || deploymentResult.initialCamera !== deploymentResult.finalCamera
      || deploymentResult.cameraSamples.some((camera) => camera !== deploymentResult.initialCamera)
      || deploymentResult.lifecycleViolations.length > 0
      || deploymentResult.mountedGameStores !== 1
      || deploymentResult.mountedViewStores !== 1
    ) {
      await fail('deployment-battle-continuity', JSON.stringify(deploymentResult));
    }
    console.log('Deployment Next placement → Full deploy with required pauses → Battle provider, DOM, canvas, camera, and Strategikon continuity: OK');
    console.log('Battle continuity screenshot:', deploymentShot);
    if (deploymentOnly) {
      console.log('PASS — Deployment partitions the centered deck, advances one unit with Next, resumes required pauses, and promotes the same battlefield in place');
      await browser.close();
      rmSync(browserProfile, { recursive: true, force: true });
      process.exit(0);
    }
  }
  if (transitionOnly) {
    console.log('PASS — opening Sectio Continue is optional-commerce and director-owned through Battle');
    await browser.close();
    rmSync(browserProfile, { recursive: true, force: true });
    process.exit(0);
  }

  // Pick a real legal move from the live store.
  const plan = await page.evaluate(async () => {
    const g = await import('/src/game/SkirmishStoreContext.tsx');
    const r = await import('/src/core/rules.ts');
    const activeRun = await import('/src/run/store.ts');
    const s = g.activeSkirmishStoreForDiagnostics()?.getState();
    const run = activeRun.useActiveRun.getState().run;
    if (!s || !run) return null;
    for (const p of s.game.pieces.filter((q) => q.side === 'player' && q.alive)) {
      const moves = r.legalMoves(p, s.game.pieces, s.game.size, s.env);
      if (moves.length) return {
        pieceId: p.id,
        type: p.type,
        from: { x: p.x, y: p.y },
        to: { x: moves[0].x, y: moves[0].y },
        goldTenths: run.goldTenths,
      };
    }
    return null;
  });
  if (!plan) {
    const gameState = await page.evaluate(async () => {
      const context = await import('/src/game/SkirmishStoreContext.tsx');
      const rules = await import('/src/core/rules.ts');
      const state = context.activeSkirmishStoreForDiagnostics()?.getState();
      return state ? {
        started: state.started,
        turn: state.game.turn,
        winner: state.game.winner,
        pieces: state.game.pieces.map((piece) => ({
          id: piece.id,
          side: piece.side,
          type: piece.type,
          alive: piece.alive,
          x: piece.x,
          y: piece.y,
          legal: rules.legalMoves(piece, state.game.pieces, state.game.size, state.env).length,
        })),
      } : null;
    });
    await fail('plan', JSON.stringify(gameState));
  }
  console.log('planned move:', JSON.stringify(plan));

  const tileCenter = (cell) => page.evaluate(({ x, y }) => {
    const btn = document.querySelector(`button.skirmish-board-cell-hit[data-cx="${x}"][data-cy="${y}"]`);
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, cell);

  // Select the piece by clicking its tile — the click must REACH the tile.
  const fromPoint = await tileCenter(plan.from);
  if (!fromPoint) await fail('select', 'source tile button missing');
  await page.mouse.click(fromPoint.x, fromPoint.y);
  try {
    await page.waitForFunction(
      (id) => import('/src/game/SkirmishStoreContext.tsx').then((m) => m.activeSkirmishStoreForDiagnostics()?.getState().selectedId === id),
      { timeout: 5_000 },
      plan.pieceId,
    );
  } catch {
    await fail('select', `clicking the unit tile did not select it — board clicks are still shielded`);
  }
  console.log('selection by real click: OK');

  // Commit the move by clicking the destination tile.
  const toPoint = await tileCenter(plan.to);
  if (!toPoint) await fail('move', 'destination tile button missing');
  await page.mouse.click(toPoint.x, toPoint.y);
  try {
    await page.waitForFunction(
      ({ pieceId, to }) => import('/src/game/SkirmishStoreContext.tsx').then((m) => {
        const s = m.activeSkirmishStoreForDiagnostics()?.getState();
        if (!s) return false;
        const p = s.game.pieces.find((q) => q.id === pieceId);
        return p && p.x === to.x && p.y === to.y;
      }),
      { timeout: 5_000 },
      plan,
    );
  } catch {
    await fail('move', 'clicking a legal destination did not commit the move');
  }
  console.log('move committed by real click: OK');

  if (!undoOnly) {
    // The default full-loop proof waits for the enemy answer. The focused Undo proof
    // deliberately clicks during that thinking window to verify cancellation too; unit
    // coverage separately proves that the same checkpoint rewinds an already-landed reply.
    try {
      await page.waitForFunction(
        () => import('/src/game/SkirmishStoreContext.tsx').then((m) => {
          const s = m.activeSkirmishStoreForDiagnostics()?.getState();
          if (!s) return false;
          return s.game.turn === 'player' && !s.game.winner;
        }),
        { timeout: 15_000 },
      );
    } catch {
      const replyState = await page.evaluate(async () => {
        const context = await import('/src/game/SkirmishStoreContext.tsx');
        const state = context.activeSkirmishStoreForDiagnostics()?.getState();
        return state ? {
          turn: state.game.turn,
          winner: state.game.winner,
          reason: state.game.reason,
          log: state.log.slice(0, 5),
        } : null;
      });
      await fail('enemy-reply', JSON.stringify(replyState));
    }
    console.log('enemy replied, turn returned: OK');
  }

  // Run Undo is a real Controls action: expose it through the HUD tab, prove its canonical
  // one-gold presentation is enabled, click it through hit-testing, and verify that the player
  // decision + enemy reply rewind while the Run pays exactly one gold.
  const controlsTab = await page.$('#skirmish-tab-controls');
  if (!controlsTab) await fail('undo-controls', 'Controls tab is missing');
  const controlsBox = await controlsTab.boundingBox();
  if (!controlsBox) await fail('undo-controls', 'Controls tab has no geometry');
  await page.mouse.click(controlsBox.x + controlsBox.width / 2, controlsBox.y + controlsBox.height / 2);
  await page.waitForSelector('[data-testid="undo-run-move"]:not([disabled])', { visible: true, timeout: 5_000 });
  const undoShot = 'tmp-shots/run-battle-undo-control.png';
  const controlsPanel = await page.$('.skirmish-controls-card');
  if (!controlsPanel) await fail('undo-controls', 'Controls panel did not open');
  await controlsPanel.screenshot({ path: undoShot });
  console.log('undo control screenshot:', undoShot);

  const undoButton = await page.$('[data-testid="undo-run-move"]');
  const undoBox = await undoButton?.boundingBox();
  if (!undoBox) await fail('undo', 'paid Undo button has no hit target');
  await page.mouse.click(undoBox.x + undoBox.width / 2, undoBox.y + undoBox.height / 2);
  try {
    await page.waitForFunction(
      ({ pieceId, from, goldTenths }) => Promise.all([
        import('/src/game/SkirmishStoreContext.tsx'),
        import('/src/run/store.ts'),
      ]).then(([gameContext, activeRun]) => {
        const state = gameContext.activeSkirmishStoreForDiagnostics()?.getState();
        const run = activeRun.useActiveRun.getState().run;
        const piece = state?.game.pieces.find((candidate) => candidate.id === pieceId);
        return state?.game.turn === 'player'
          && !state.game.winner
          && state.undoCheckpoint === null
          && piece?.x === from.x
          && piece?.y === from.y
          && run?.goldTenths === goldTenths - 10;
      }),
      { timeout: 5_000 },
      plan,
    );
  } catch {
    const undoState = await page.evaluate(async (planned) => {
      const gameContext = await import('/src/game/SkirmishStoreContext.tsx');
      const activeRun = await import('/src/run/store.ts');
      const state = gameContext.activeSkirmishStoreForDiagnostics()?.getState();
      const run = activeRun.useActiveRun.getState().run;
      return state && run ? {
        turn: state.game.turn,
        winner: state.game.winner,
        undo: Boolean(state.undoCheckpoint),
        goldTenths: run.goldTenths,
        piece: state.game.pieces.find((candidate) => candidate.id === planned.pieceId),
      } : null;
    }, plan);
    await fail('undo', JSON.stringify(undoState));
  }
  console.log(`${undoOnly ? 'thinking reply cancelled and player decision' : 'player decision and enemy reply'} undone for exactly one gold: OK`);

  const shot = 'tmp-shots/run-battle-e2e.png';
  const board = await page.$('.skirmish-war-room');
  if (board) await board.screenshot({ path: shot });
  console.log('screenshot:', shot);
  if (undoOnly) {
    console.log('PASS — paid Undo cancels a pending reply, restores the player decision, and costs exactly one gold');
    await browser.close();
    rmSync(browserProfile, { recursive: true, force: true });
    process.exit(0);
  }

  // The open Strategikon must still take the pointer (its slot re-enables it).
  const toggle = await page.$('[data-testid="strategikon-toggle"]');
  if (!toggle) await fail('strategikon-open', 'toggle not present in Controls');
  const toggleBox = await toggle.boundingBox();
  await page.mouse.click(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2);
  try {
    await page.waitForSelector('[data-testid="strategikon"]', { timeout: 10_000 });
  } catch {
    await fail('strategikon-open', 'workspace did not mount after a real toggle click');
  }
  const railHit = await page.evaluate(() => {
    const btn = document.querySelector('.strategikon-rail button');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { reachable: btn === top || btn.contains(top) || (top !== null && btn.closest('.strategikon-workspace') === top.closest('.strategikon-workspace') && top.closest('.strategikon-workspace') !== null) };
  });
  if (!railHit?.reachable) await fail('strategikon-open', 'open workspace does not receive the pointer');
  console.log('open Strategikon takes the pointer: OK');

  console.log('PASS — anonymous Run battle is fully playable and paid Undo is exact');
  await browser.close();
  rmSync(browserProfile, { recursive: true, force: true });
} catch (error) {
  console.error('FAIL (unexpected):', error);
  try { await browser.close(); } catch { /* already gone */ }
  rmSync(browserProfile, { recursive: true, force: true });
  process.exit(1);
}
