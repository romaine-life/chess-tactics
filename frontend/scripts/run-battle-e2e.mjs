#!/usr/bin/env node
// Live-input E2E for the Run battle loop: proves an anonymous player can actually
// PLAY with real hit-tested mouse clicks (the unit tests exercise stores and rules,
// not the pointer path — an invisible overlay shielding the board passes every unit
// test while making the game unplayable; see the strategikon-slot regression, #552).
//
// Drives a FRESH anonymous profile end-to-end: start run → take whatever the opening Bona
// Vacantia deals → draw the Deployment hand → seat every formation by aiming at a square and
// clicking → Begin Battle → click a unit's tile → click a legal destination → assert the move
// commits, the enemy replies, paid Undo rewinds for exactly ten gold, and the open Strategikon
// still takes the pointer. Fails loudly at the exact step where a click is swallowed.
//
// Two rules keep this from rotting again, both learned the hard way:
//   * Never name the content. Which relic or card the grant deals, and which piece has a legal
//     move, are the game's to choose — a selector pinned to one of them reports a timeout with
//     no verdict the day that content changes.
//   * Read the SCREEN, not a re-imported store. `import('/src/run/store.ts')` from an evaluate
//     answers from its own module record, which only catches up through the server; it reported
//     an empty board while three units stood on it.
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

// What paid Undo charges, read off the screen in whole gold (RUN_BATTLE_UNDO_COST_TENTHS).
const RUN_UNDO_COST_GOLD = 10;

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
  //
  // Patched IN THE PAGE rather than with CDP request interception. Interception routes the
  // whole module graph through this process, and a dev-server module request that stalls there
  // stalls forever — here that surfaced as an enemy that never replied, because the search it
  // runs never finished loading. Only fetch needs answering, so only fetch is patched.
  await page.evaluateOnNewDocument(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const href = typeof input === 'string' ? input
        : input instanceof Request ? input.url
          : String(input);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (method === 'GET' && new URL(href, location.href).pathname === '/api/auth/me') {
        return Promise.resolve(new Response(JSON.stringify({ signed_in: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      return nativeFetch(input, init);
    };
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

  // Same aiming as clickButton, addressed by testid. A control whose label carries live data --
  // "Draw 3 cards" -- has no fixed text to match on, and its testid is the stable handle.
  const clickTestId = async (testId) => {
    const selector = `[data-testid="${testId}"]`;
    try {
      await page.waitForFunction((css) => {
        const btn = document.querySelector(css);
        return !!btn && btn.getBoundingClientRect().width > 0 && !btn.disabled && !btn.closest('[inert]');
      }, { timeout: 15_000 }, selector);
    } catch {
      return false;
    }
    const point = await page.evaluate((css) => {
      const btn = document.querySelector(css);
      if (!btn || btn.disabled || btn.closest('[inert]')) return null;
      btn.scrollIntoView({ block: 'nearest' });
      const r = btn.getBoundingClientRect();
      const samples = [[0.5, 0.5], [0.5, 0.25], [0.5, 0.75], [0.25, 0.5], [0.75, 0.5], [0.15, 0.15], [0.85, 0.85]];
      for (const [fx, fy] of samples) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const top = document.elementFromPoint(x, y);
        if (top && (top === btn || btn.contains(top))) return { x, y };
      }
      return null;
    }, selector);
    if (!point) return false;
    await page.mouse.click(point.x, point.y);
    return true;
  };

  const testIdDiagnostics = (testId) => page.evaluate((css) => {
    const button = document.querySelector(css);
    if (!button) return { found: false };
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      found: true,
      label: button.textContent?.trim() ?? null,
      disabled: button.disabled,
      inert: Boolean(button.closest('[inert]')),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      hit: hit ? { tag: hit.tagName, className: hit.className } : null,
    };
  }, `[data-testid="${testId}"]`);

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

  // A fresh Conflict can begin with mandatory Bona Vacantia directly before Battle 1.
  // Wait for that director-owned destination (or immediate Deployment in a War with no
  // opening lipsanon) before installing the transition probe.
  try {
    await page.waitForFunction(() => {
      const director = document.querySelector('.scene-director');
      const committed = director?.getAttribute('data-scene-committed') ?? '';
      return director?.getAttribute('data-scene-phase') === 'current'
        && (committed.includes(':bona-vacantia:') || committed.includes(':battlefield:'));
    }, { timeout: 45_000 });
  } catch {
    await fail('start-run-phase', JSON.stringify(await sceneDiagnostics()));
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

  // WHAT the opening Bona Vacantia deals is content, not contract: a Run's opening grant is a
  // row of formation cards, and a Conflict that opens on the lipsanon mat offers relics. Take
  // whichever the mat is actually showing, and never name one — this step named a single
  // lipsanon, kept hunting its take button after the opening screen became a card grant, and
  // so clicked nothing and spent 45 seconds timing out on a phase that was never coming.
  const OPENING_OFFERS = [
    { kind: 'card', selector: '[data-testid="run-vacantia-card-offers"] .run-card-action:not([disabled])' },
    { kind: 'lipsanon', selector: 'button.run-vacantia-take[data-lipsanon-id]:not([disabled])' },
  ];
  const openingScene = await page.evaluate(() => (
    document.querySelector('.scene-director')?.getAttribute('data-scene-committed') ?? ''
  ));
  // A War with no opening Bona Vacantia goes straight to Deployment; there is nothing to take.
  if (openingScene.includes(':bona-vacantia:')) {
    let taken = null;
    for (const offer of OPENING_OFFERS) {
      const handle = await page.$(offer.selector);
      if (!handle) continue;
      // Read the label before the press: taking ends the phase, so the button is gone after.
      const label = await page.evaluate((element) => element.getAttribute('aria-label'), handle);
      const offerBox = await handle.boundingBox();
      if (!offerBox) {
        await fail('opening-bona-vacantia', `the ${offer.kind} offer "${label}" has no geometry — something is covering the mat`);
      }
      await page.mouse.click(offerBox.x + offerBox.width / 2, offerBox.y + offerBox.height / 2);
      taken = { kind: offer.kind, label };
      break;
    }
    if (!taken) {
      const mat = await page.evaluate(() => ({
        offerRows: [...document.querySelectorAll('[data-testid^="run-vacantia"]')].map((node) => node.dataset.testid),
        takeables: [...document.querySelectorAll('.run-card-action, .run-vacantia-take')]
          .map((node) => `${node.className}${node.disabled ? ' (disabled)' : ''}`),
      }));
      await fail('opening-bona-vacantia', `the Run is on Bona Vacantia and offered nothing takeable; ${JSON.stringify(mat)}`);
    }
    console.log(`opening Bona Vacantia: took the ${taken.kind} offer — ${taken.label}`);
  }
  await waitPhase('deployment', 'opening-bona-vacantia-to-deployment');
  await page.waitForFunction(() => {
      const director = document.querySelector('.scene-director');
      return director?.getAttribute('data-scene-phase') === 'current'
      && (director.getAttribute('data-scene-committed') ?? '').includes(':battlefield:')
      && !director.getAttribute('data-scene-pending');
  });
  await page.waitForSelector('[data-deployment-stack-card]', { timeout: 5_000 });
  // Deployment begins as a committed, empty battlefield with the complete deck in the
  // middle. Nothing has moved or been dealt, and the arranging panel is already DRESSED —
  // every control it will hold is on screen, answering nothing, so the deal does not re-lay
  // the panel under the player's hand at the one moment they are watching it.
  // Read the SCREEN, never a re-imported store. `import('/src/run/store.ts')` from an evaluate
  // resolves to a module record of its own, whose Run document only ever catches up through the
  // server — it reported an empty board while three units stood on it. Everything this proof is
  // about is on screen anyway, which is the whole point of driving it with a mouse.
  const awaitingDealState = await page.evaluate(async () => {
    // Found by testid, not by label: the label counts the hand ("Draw 3 cards").
    const deal = document.querySelector('[data-testid="deployment-deal"]');
    const begin = document.querySelector('[data-testid="arrangement-begin-battle"]');
    const probe = window.__ctBattlefieldTransitionProbe;
    const progress = document.querySelector('[data-testid="arrangement-progress"]')?.textContent?.trim() ?? null;
    return {
      stage: document.querySelector('[data-deployment-card-stage]')?.getAttribute('data-deployment-card-stage') ?? null,
      // Nothing is on the ground yet, and the panel already says how much there will be to put there.
      placed: Number(/(\d+) of \d+ on the board/.exec(progress ?? '')?.[1] ?? NaN),
      dealtCards: Number(/of (\d+) on the board/.exec(progress ?? '')?.[1] ?? NaN),
      totalCards: Number(document.querySelector('.run-deployment-center-count')?.textContent ?? NaN),
      stackCards: document.querySelectorAll('[data-deployment-stack-card]').length,
      backs: document.querySelectorAll('[data-deployment-stack-card] .run-card-back').length,
      centerDeck: Boolean(document.querySelector('[data-deployment-center-deck]')),
      centerBacks: document.querySelectorAll('[data-deployment-center-deck] .run-card-back').length,
      centerCount: Number(document.querySelector('.run-deployment-center-count')?.textContent ?? NaN),
      board: Boolean(document.querySelector('[data-testid="skirmish-board"]')),
      deal: Boolean(deal),
      dealDisabled: deal?.disabled ?? null,
      begin: Boolean(begin),
      beginDisabled: begin?.disabled ?? null,
      rotationControl: Boolean(document.querySelector('[data-testid="arrangement-rotation-control"]')),
      removeControl: Boolean(document.querySelector('[data-testid="arrangement-remove-formation"]')),
      progress: document.querySelector('[data-testid="arrangement-progress"]')?.textContent?.trim() ?? null,
      // Nothing is placeable before there is a hand: the board takes no arranging pointer yet.
      arrangingCells: document.querySelectorAll('.run-deployment-cell').length,
      strategikonToggle: Boolean(document.querySelector('[data-testid="strategikon-toggle"]')),
      obsoleteDeploymentButton: [...document.querySelectorAll('.run-deployment-controls button')]
        .some((button) => button.textContent?.trim() === 'Deployment'),
      explanatoryCopy: document.body.textContent?.includes('These cards supply this combat') ?? false,
      confirmationCopy: document.body.textContent?.includes('Your deployment deal') ?? false,
      dealAnimations: probe?.dealAnimations ?? null,
    };
  });
  if (
    awaitingDealState.stage !== 'awaiting-deal'
    || awaitingDealState.placed !== 0
    || !(awaitingDealState.dealtCards > 0)
    || awaitingDealState.totalCards < awaitingDealState.dealtCards
    || awaitingDealState.stackCards !== awaitingDealState.dealtCards
    || awaitingDealState.backs !== awaitingDealState.stackCards
    || !awaitingDealState.centerDeck
    || awaitingDealState.centerBacks !== Math.min(3, awaitingDealState.totalCards)
    || awaitingDealState.centerCount !== awaitingDealState.totalCards
    || !awaitingDealState.board
    || !awaitingDealState.deal
    || awaitingDealState.dealDisabled
    || !awaitingDealState.begin
    || !awaitingDealState.beginDisabled
    || !awaitingDealState.rotationControl
    || !awaitingDealState.removeControl
    || awaitingDealState.arrangingCells !== 0
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
  if (!await clickTestId('deployment-deal')) {
    await fail('deployment-deal', JSON.stringify(await testIdDiagnostics('deployment-deal')));
  }
  await page.waitForFunction(() => document.querySelector('[data-deployment-card-stage="dealing"]'));
  const dealMotionShot = 'tmp-shots/run-opening-deployment-deal-motion.png';
  await page.screenshot({ path: dealMotionShot });
  console.log('Deployment deal-motion screenshot:', dealMotionShot);

  const dealingState = await page.evaluate(() => ({
    stage: document.querySelector('[data-deployment-card-stage]')?.getAttribute('data-deployment-card-stage') ?? null,
    dealDisabled: document.querySelector('[data-testid="deployment-deal"]')?.disabled ?? null,
    beginDisabled: document.querySelector('[data-testid="arrangement-begin-battle"]')?.disabled ?? null,
    // The board must not take an arranging pointer while the cards are still in the air.
    arrangingCells: document.querySelectorAll('.run-deployment-cell').length,
  }));
  if (
    dealingState.stage !== 'dealing'
    || !dealingState.dealDisabled
    || !dealingState.beginDisabled
    || dealingState.arrangingCells !== 0
  ) {
    await fail('deployment-dealing-boundary', JSON.stringify(dealingState));
  }

  // The hand lands and the panel becomes an ARRANGING panel: a formation in hand, the board
  // taking the pointer on every square of the band, and Begin Battle still refusing until His
  // Grace is on the ground.
  // The centre deck goes with the deal, so arranging is read off the panel and the board: a
  // formation in hand, and every square of the band taking the pointer.
  try {
    await page.waitForFunction(() => document.querySelector('[data-testid="arrangement-hand-card"]')
      && document.querySelectorAll('.run-deployment-cell.is-band').length > 0
      && !document.querySelector('[data-deployment-card-stage="dealing"]'));
  } catch {
    await fail('deployment-hand-arrives', JSON.stringify(await sceneDiagnostics()));
  }
  const arrangingShot = 'tmp-shots/run-opening-deployment-arranging.png';
  await page.screenshot({ path: arrangingShot });
  console.log('Deployment arranging screenshot:', arrangingShot);

  const arrangingState = await page.evaluate(() => {
    const progress = document.querySelector('[data-testid="arrangement-progress"]')?.textContent?.trim() ?? '';
    return {
      placed: Number(/(\d+) of \d+ on the board/.exec(progress)?.[1] ?? NaN),
      handSize: Number(/of (\d+) on the board/.exec(progress)?.[1] ?? NaN),
      handCard: Boolean(document.querySelector('[data-testid="arrangement-hand-card"]')),
      // One mark per formation the player may place this Battle — a dealt reserve has no mark,
      // so the row is the admitted hand rather than the whole deal.
      handMarks: document.querySelectorAll('.run-arrangement-hand-mark').length,
      bandCells: document.querySelectorAll('.run-deployment-cell.is-band').length,
      placeableCells: document.querySelectorAll('.run-deployment-cell.is-placeable').length,
      seatedCells: document.querySelectorAll('.run-deployment-cell.is-seated-formation').length,
      beginDisabled: document.querySelector('[data-testid="arrangement-begin-battle"]')?.disabled ?? null,
      board: Boolean(document.querySelector('[data-testid="skirmish-board"]')),
      strategikonToggle: Boolean(document.querySelector('[data-testid="strategikon-toggle"]')),
    };
  });
  if (
    arrangingState.placed !== 0
    || arrangingState.seatedCells !== 0
    || !(arrangingState.handSize > 0)
    || !arrangingState.handCard
    || arrangingState.handMarks !== arrangingState.handSize
    || arrangingState.bandCells === 0
    || arrangingState.placeableCells === 0
    || !arrangingState.beginDisabled
    || !arrangingState.board
    || !arrangingState.strategikonToggle
  ) {
    await fail('deployment-arranging-boundary', JSON.stringify(arrangingState));
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
       // Every dealt card flies, and the remainder pile flies with them when the deck keeps some
    // back. How MANY animations each flight is built from is presentation the card stack owns.
    || battlefieldTransition.dealAnimations < awaitingDealState.stackCards
      + (awaitingDealState.totalCards > awaitingDealState.dealtCards ? 1 : 0)
    || battlefieldTransition.dealConstructedBeforeCommit
    || battlefieldTransition.dealPlayedBeforeCommit
    || !battlefieldTransition.dealAdvancedAfterCommit
    || JSON.stringify(battlefieldTransition.dealCountSamples) !== JSON.stringify(
      Array.from({ length: awaitingDealState.stackCards + 1 }, (_, index) => index),
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
  const transitionShot = 'tmp-shots/run-deployment-hand-dealt.png';
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
        // The centre deck is spent, and the band is taking the pointer.
        arranging: document.querySelectorAll('.run-deployment-cell.is-band').length > 0
          && !document.querySelector('[data-deployment-center-deck]'),
        handCard: Boolean(document.querySelector('[data-testid="arrangement-hand-card"]')),
        rotationControl: Boolean(document.querySelector('[data-testid="arrangement-rotation-control"]')),
        removeControl: Boolean(document.querySelector('[data-testid="arrangement-remove-formation"]')),
        begin: Boolean(document.querySelector('[data-testid="arrangement-begin-battle"]')),
      };
    });
    if (
      !deploymentState.arranging
      || !deploymentState.handCard
      || !deploymentState.rotationControl
      || !deploymentState.removeControl
      || !deploymentState.begin
    ) {
      await fail('deployment-fixture', JSON.stringify(deploymentState));
    }

    // Arranging is done with the POINTER: aim at a square, the seating resolves under it, and
    // the click commits what was previewed. Place the whole admitted hand that way — placing
    // finishes with a formation and hands the next unplaced one to the cursor, so this walks
    // the hand without touching the steppers. The panel's own count says how many there are,
    // because a dealt reserve cannot be placed this Battle.
    const handSize = arrangingState.handSize;
    let seatedShot = null;
    for (let seated = 0; seated < handSize; seated += 1) {
      const target = await page.$('button.run-deployment-cell.is-placeable');
      if (!target) {
        await fail('deployment-arrange-placement', JSON.stringify(await page.evaluate(() => ({
          cells: document.querySelectorAll('.run-deployment-cell').length,
          band: document.querySelectorAll('.run-deployment-cell.is-band').length,
          placeable: document.querySelectorAll('.run-deployment-cell.is-placeable').length,
          progress: document.querySelector('[data-testid="arrangement-progress"]')?.textContent?.trim() ?? null,
        }))));
      }
      const box = await target.boundingBox();
      if (!box) await fail('deployment-arrange-placement', 'a highlighted square has no pointer geometry');
      // Aim, then press: the seating is resolved from the square the pointer is already over,
      // so a click that never hovered would commit a formation nobody was shown.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      try {
        await page.waitForFunction((want) => {
          const progress = document.querySelector('[data-testid="arrangement-progress"]')?.textContent ?? '';
          return Number(/(\d+) of \d+ on the board/.exec(progress)?.[1] ?? NaN) >= want
            || /All \d+ on the board/.test(progress);
        }, { timeout: 10_000 }, seated + 1);
      } catch {
        await fail(
          'deployment-arrange-placement',
          `clicking a highlighted square seated nothing (${seated} of ${handSize} formations placed)`,
        );
      }
      if (!seatedShot) {
        seatedShot = 'tmp-shots/run-deployment-formation-seated.png';
        await page.screenshot({ path: seatedShot });
        console.log('Seated-formation screenshot:', seatedShot);
      }
    }

    const readyToBegin = await page.evaluate(() => ({
      beginDisabled: document.querySelector('[data-testid="arrangement-begin-battle"]')?.disabled ?? null,
      reading: document.querySelector('[data-testid="arrangement-progress"]')?.textContent?.trim() ?? null,
      seatedCells: document.querySelectorAll('.run-deployment-cell.is-seated-formation').length,
    }));
    if (
      readyToBegin.beginDisabled !== false
      || !readyToBegin.reading?.includes(`All ${handSize} on the board`)
      // A one-formation hand leaves nothing OTHER than the card in hand on the ground.
      || (handSize > 1 && readyToBegin.seatedCells === 0)
    ) {
      await fail('deployment-arrange-complete', JSON.stringify(readyToBegin));
    }
    console.log(`arranged by pointer: ${readyToBegin.reading}`);
    await page.click('[data-testid="arrangement-begin-battle"]');
    try {
      // The arranging panel is replaced by the battle controls, and the army the plan promised
      // arrives together rather than piece by piece.
      await page.waitForFunction(() => document.querySelector('[data-testid="skirmish"]')
        && !document.querySelector('[data-testid="arrangement-begin-battle"]'));
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
          placements: Object.keys(run?.deployment?.placements ?? {}).length,
          formationPlans: Object.keys(run?.deployment?.formationPlans ?? {}).length,
          settlingUnitIds: run?.deployment?.settlingUnitIds ?? null,
          directorPhase: director?.getAttribute('data-scene-phase') ?? null,
          committed: director?.getAttribute('data-scene-committed') ?? null,
          pending: director?.getAttribute('data-scene-pending') ?? null,
          arriving: board?.getAttribute('data-arriving') ?? null,
          controls: document.querySelector('.run-deployment-controls')?.textContent?.trim() ?? null,
        };
      });
      await fail('deployment-begin-battle-settle', JSON.stringify(stalled));
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
    console.log('Pointer-arranged hand → Begin Battle → Battle provider, DOM, canvas, camera, and Strategikon continuity: OK');
    console.log('Battle continuity screenshot:', deploymentShot);
    if (deploymentOnly) {
      console.log('PASS — Deployment partitions the centered deck, deals a hand the pointer arranges square by square, and promotes the same battlefield in place');
      await browser.close();
      rmSync(browserProfile, { recursive: true, force: true });
      process.exit(0);
    }
  }
  if (transitionOnly) {
    console.log('PASS — opening Bona Vacantia hands directly to director-owned Battle 1');
    await browser.close();
    rmSync(browserProfile, { recursive: true, force: true });
    process.exit(0);
  }

  // Begin Battle promotes the arranged plan into an army, and that army ARRIVES. The board
  // reaches the scene's `current` while the pieces are still in the air, so a click aimed here
  // before the entrance lands is aimed at a board that is not taking input yet — which reads
  // exactly like the shielded-board bug this proof exists to catch.
  try {
    await page.waitForFunction(() => {
      const board = document.querySelector('[data-testid="skirmish-board"]');
      return board?.getAttribute('data-interactive') === 'true'
        && board.getAttribute('data-arriving') === 'false'
        && !board.classList.contains('is-board-loading');
    }, { timeout: 30_000 });
  } catch {
    await fail('battle-interactive', JSON.stringify(await page.evaluate(() => {
      const board = document.querySelector('[data-testid="skirmish-board"]');
      return {
        board: Boolean(board),
        interactive: board?.getAttribute('data-interactive') ?? null,
        arriving: board?.getAttribute('data-arriving') ?? null,
        arrivalState: board?.getAttribute('data-arrival-state') ?? null,
        loading: board?.classList.contains('is-board-loading') ?? null,
      };
    })));
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

  // A battle opens holding NOTHING, and this proof depends on it: a cell's press selects the
  // piece under it, so a click on a piece the board is already holding is a deselect, and the
  // first click below would then prove the opposite of what it claims.
  const openingHold = await page.evaluate(() => import('/src/game/SkirmishStoreContext.tsx').then((m) => {
    const state = m.activeSkirmishStoreForDiagnostics()?.getState();
    return {
      selectedId: state?.selectedId ?? null,
      focusedId: state?.focusedId ?? null,
      ring: document.querySelectorAll('.skirmish-board-cell-hit.is-selected').length,
      moves: document.querySelectorAll('.skirmish-board-cell-hit.is-move').length,
    };
  }));
  if (openingHold.selectedId || openingHold.focusedId || openingHold.ring || openingHold.moves) {
    await fail('battle-opens-holding-nothing', JSON.stringify(openingHold));
  }
  console.log('battle opens holding nothing: OK');

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
    const shielded = await page.evaluate(async ({ x, y, cell }) => {
      const context = await import('/src/game/SkirmishStoreContext.tsx');
      const state = context.activeSkirmishStoreForDiagnostics()?.getState();
      const board = document.querySelector('[data-testid="skirmish-board"]');
      const tile = document.querySelector(`button.skirmish-board-cell-hit[data-cx="${cell.x}"][data-cy="${cell.y}"]`);
      return {
        // What actually answers the pointer at the aimed coordinate.
        hitStack: document.elementsFromPoint(x, y).slice(0, 5)
          .map((element) => `${element.tagName}.${String(element.className).slice(0, 48)}`),
        tileRect: tile?.getBoundingClientRect().toJSON() ?? null,
        interactive: board?.getAttribute('data-interactive') ?? null,
        arriving: board?.getAttribute('data-arriving') ?? null,
        selectedId: state?.selectedId ?? null,
        turn: state?.game.turn ?? null,
        started: state?.started ?? null,
      };
    }, { x: fromPoint.x, y: fromPoint.y, cell: plan.from });
    await fail('select', `clicking the unit tile did not select it — ${JSON.stringify(shielded)}`);
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
        // The reply is a real search, in a headless browser, on whatever else the machine is
        // doing. This is a wait budget, not a claim about how fast the AI ought to think.
        { timeout: 45_000 },
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
  // ten-gold presentation is enabled, click it through hit-testing, and verify that the player
  // decision + enemy reply rewind while the Run pays exactly ten gold.
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

  // The purse is read off the SCREEN. A re-imported Run store answers from the server and lags
  // the board by a save, so an exact ten-gold charge cannot be measured through it.
  const purse = () => page.evaluate(() => {
    // The purse is the title bar's Gold measure. Every .run-gold-amount on a battle screen is a
    // button's PRICE — Undo's own cost among them — so reading one of those measures nothing.
    const measure = [...document.querySelectorAll('.run-topbar-measures [aria-label]')]
      .map((node) => node.getAttribute('aria-label') ?? '')
      .find((text) => /^[\d.]+ gold$/.test(text)) ?? '';
    return Number(/^([\d.]+) gold$/.exec(measure)?.[1] ?? NaN);
  });
  const goldBeforeUndo = await purse();
  if (!Number.isFinite(goldBeforeUndo)) await fail('undo', 'the purse is not readable on screen');
  const undoButton = await page.$('[data-testid="undo-run-move"]');
  const undoBox = await undoButton?.boundingBox();
  if (!undoBox) await fail('undo', 'paid Undo button has no hit target');
  await page.mouse.click(undoBox.x + undoBox.width / 2, undoBox.y + undoBox.height / 2);
  try {
    await page.waitForFunction(
      ({ pieceId, from, spent }) => import('/src/game/SkirmishStoreContext.tsx').then((gameContext) => {
        const state = gameContext.activeSkirmishStoreForDiagnostics()?.getState();
        const piece = state?.game.pieces.find((candidate) => candidate.id === pieceId);
        const measure = [...document.querySelectorAll('.run-topbar-measures [aria-label]')]
          .map((node) => node.getAttribute('aria-label') ?? '')
          .find((text) => /^[\d.]+ gold$/.test(text)) ?? '';
        return state?.game.turn === 'player'
          && !state.game.winner
          && state.undoStack.length === 0
          && piece?.x === from.x
          && piece?.y === from.y
          && Number(/^([\d.]+) gold$/.exec(measure)?.[1] ?? NaN) === spent;
      }),
      { timeout: 5_000 },
      { pieceId: plan.pieceId, from: plan.from, spent: goldBeforeUndo - RUN_UNDO_COST_GOLD },
    );
  } catch {
    const undoState = await page.evaluate(async (planned) => {
      const gameContext = await import('/src/game/SkirmishStoreContext.tsx');
      const state = gameContext.activeSkirmishStoreForDiagnostics()?.getState();
      const measures = [...document.querySelectorAll('.run-topbar-measures [aria-label]')]
        .map((node) => node.getAttribute('aria-label') ?? '');
      return state ? {
        turn: state.game.turn,
        winner: state.game.winner,
        undo: state.undoStack.length,
        gold: Number(/^([\d.]+) gold$/.exec(measures.find((text) => /^[\d.]+ gold$/.test(text)) ?? '')?.[1] ?? NaN),
        measures,
        piece: state.game.pieces.find((candidate) => candidate.id === planned.pieceId),
      } : null;
    }, plan);
    await fail('undo', JSON.stringify({ ...undoState, goldBeforeUndo }));
  }
  console.log(`${undoOnly ? 'thinking reply cancelled and player decision' : 'player decision and enemy reply'} undone for exactly ${RUN_UNDO_COST_GOLD} gold: OK`);

  const shot = 'tmp-shots/run-battle-e2e.png';
  const board = await page.$('.skirmish-war-room');
  if (board) await board.screenshot({ path: shot });
  console.log('screenshot:', shot);
  if (undoOnly) {
    console.log(`PASS — paid Undo cancels a pending reply, restores the player decision, and costs exactly ${RUN_UNDO_COST_GOLD} gold`);
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
    // Mounted is not yet ARRIVED: the workspace opens through the scene director, and while the
    // battle screen is still the outgoing layer it is the thing under the pointer. Measuring
    // there reports a perfectly reachable rail as shielded.
    await page.waitForFunction(() => {
      const director = document.querySelector('.scene-director');
      return director?.getAttribute('data-scene-phase') === 'current'
        && !director.getAttribute('data-scene-pending')
        && (director.getAttribute('data-scene-committed') ?? '').includes('strategikon');
    }, { timeout: 15_000 });
  } catch {
    await fail('strategikon-open', `workspace did not arrive after a real toggle click; ${JSON.stringify(await sceneDiagnostics())}`);
  }
  const railHit = await page.evaluate(() => {
    // A rail tab NAVIGATES, so it is a link, not a button — asking for `button` here found
    // nothing and reported the workspace as unreachable whatever it was actually doing.
    const btn = document.querySelector('.strategikon-rail a, .strategikon-rail button, .strategikon-rail [role="tab"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      reachable: btn === top || btn.contains(top) || (top !== null && btn.closest('.strategikon-workspace') === top.closest('.strategikon-workspace') && top.closest('.strategikon-workspace') !== null),
      tab: `${btn.tagName}.${String(btn.className).slice(0, 48)}`,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      hitStack: document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).slice(0, 5)
        .map((element) => `${element.tagName}.${String(element.className).slice(0, 48)}`),
    };
  });
  if (!railHit?.reachable) {
    const rail = await page.evaluate(() => ({
      workspace: Boolean(document.querySelector('.strategikon-workspace')),
      rail: Boolean(document.querySelector('.strategikon-rail')),
      railChildren: [...(document.querySelector('.strategikon-rail')?.children ?? [])]
        .map((node) => `${node.tagName}.${String(node.className).slice(0, 48)}`),
    }));
    await fail('strategikon-open', `open workspace does not receive the pointer — ${JSON.stringify({ railHit, rail })}`);
  }
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
