#!/usr/bin/env node
// Live-input E2E for the Run battle loop: proves an anonymous player can actually
// PLAY with real hit-tested mouse clicks (the unit tests exercise stores and rules,
// not the pointer path — an invisible overlay shielding the board passes every unit
// test while making the game unplayable; see the strategikon-slot regression, #552).
//
// Drives a FRESH anonymous profile end-to-end: start run → leave the opening Shop without buying → begin battle
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
  await waitPhase('shop', 'start-run');

  if (deploymentOnly) {
    const prepared = await page.evaluate(async () => {
      const { useActiveRun } = await import('/src/run/store.ts');
      const run = useActiveRun.getState().run;
      if (!run || run.phase !== 'shop' || run.army.length < 2) return null;
      const army = run.army.map((unit, index) => ({
        ...unit,
        abilities: [
          ...unit.abilities.filter((ability) => ability !== 'discipline'),
          ...(index < 2 ? ['discipline'] : []),
        ],
      }));
      useActiveRun.getState().replace({ ...run, army, updatedAt: new Date().toISOString() });
      return army.filter((unit) => unit.abilities.includes('discipline')).map((unit) => unit.id);
    });
    if (prepared?.length !== 2) await fail('prepare-deployment-fixture', JSON.stringify(prepared));
  }

  await page.evaluate(() => {
    const outgoing = document.querySelector('.run-scene-slot');
    const probe = {
      outgoing,
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
    };
    window.__ctRunTransitionProbe = probe;
    const tick = () => {
      const director = document.querySelector('.scene-director');
      const phase = director?.getAttribute('data-scene-phase') ?? 'missing';
      const pending = director?.getAttribute('data-scene-pending') ?? '';
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
        const pendingBoard = incomingBoard;
        if (pendingBoard?.getAttribute('data-interactive') === 'true') probe.interactiveBeforeCommit = true;
        // Staged arrivals BEFORE commit are required, not forbidden: the destination is revealed
        // during this transition, and units that have not arrived must already be off the board
        // by then. What must not happen before commit is the entrance actually playing.
        if (pendingBoard?.getAttribute('data-arrival-state') === 'entering') probe.arrivalBeforeCommit = true;
      }
      probe.frame = requestAnimationFrame(tick);
    };
    probe.frame = requestAnimationFrame(tick);
  });

  if (!await clickButton('Continue to first Battle')) {
    await fail('opening-continue-without-purchase', JSON.stringify(await buttonDiagnostics('Continue to first Battle')));
  }
  await waitPhase(deploymentOnly ? 'deployment' : 'battle', 'opening-continue-without-purchase');
  await page.waitForFunction(() => {
      const director = document.querySelector('.scene-director');
      return director?.getAttribute('data-scene-phase') === 'current'
      && (director.getAttribute('data-scene-committed') ?? '').includes(':battlefield:')
      && !director.getAttribute('data-scene-pending');
  });

  // Board revealed and composed (no is-board-loading), tile hit buttons live.
  await page.waitForFunction(() => {
    const lab = document.querySelector('.skirmish-board-lab');
    return lab && !lab.classList.contains('is-board-loading')
      && document.querySelectorAll('button.skirmish-board-cell-hit').length > 0;
  });
  if (deploymentOnly) {
    await page.waitForFunction(() => document.querySelector('[data-testid="run-deployment"]')
      && !document.querySelector('[data-testid="run-deployment"]')?.closest('[inert]'));
  }

  const transition = await page.evaluate(() => {
    const probe = window.__ctRunTransitionProbe;
    cancelAnimationFrame(probe.frame);
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
      finalCamera,
      finalPhase: director?.getAttribute('data-scene-phase') ?? null,
      finalCommitted: director?.getAttribute('data-scene-committed') ?? null,
      finalPending: director?.getAttribute('data-scene-pending') ?? null,
    };
  });
  if (
    !transition.sawPending
    || !transition.sawOverlap
    || !transition.sawEntering
    || !transition.retainedOutgoing
    || !transition.inertOutgoing
    || transition.blankFrame
    || transition.interactiveBeforeCommit
    || transition.arrivalBeforeCommit
    || transition.visibleCameraFrames === 0
    || transition.visibleEnteringCameraFrames === 0
    || transition.cameraSamples.length !== 1
    || transition.cameraSamples[0]?.camera !== transition.finalCamera
    || transition.finalPhase !== 'current'
    || !transition.finalCommitted?.includes(':battlefield:')
    || transition.finalPending
  ) {
    await fail('begin-battle-transition', JSON.stringify(transition));
  }
  console.log(`director-owned opening Shop → ${deploymentOnly ? 'Deployment' : 'Battle'} transition: OK`);

  await page.waitForFunction(() => document.querySelector('[data-testid="skirmish-board"]')
    ?.getAttribute('data-arriving') === 'false');
  const transitionShot = 'tmp-shots/run-opening-shop-battle-transition.png';
  const transitionBoard = await page.$('.skirmish-war-room');
  if (!transitionBoard) await fail('transition-screenshot', 'Battle workspace unavailable after commit');
  await transitionBoard.screenshot({ path: transitionShot });
  console.log('transition screenshot:', transitionShot);
  if (deploymentOnly) {
    const deploymentState = await page.evaluate(async () => {
      const { useActiveRun } = await import('/src/run/store.ts');
      const { activeSkirmishStoreForDiagnostics } = await import('/src/game/SkirmishStoreContext.tsx');
      const { activeSkirmishViewStoreForDiagnostics } = await import('/src/game/SkirmishViewStoreContext.tsx');
      const run = useActiveRun.getState().run;
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
        phase: run?.phase,
        disciplineIds: run?.army.filter((unit) => unit.abilities.includes('discipline')).map((unit) => unit.id) ?? [],
        placements: run?.deployment?.manualPlacements ?? {},
      };
    });
    if (deploymentState.phase !== 'deployment' || deploymentState.disciplineIds.length !== 2) {
      await fail('deployment-fixture', JSON.stringify(deploymentState));
    }

    const clickFirstDeploymentCell = async () => {
      const cell = await page.$('[data-testid^="deployment-cell-"]');
      if (!cell) await fail('deployment-placement', 'no legal cell');
      await cell.click();
    };

    await clickFirstDeploymentCell();
    await page.waitForFunction(() => {
      const board = document.querySelector('[data-testid="skirmish-board"]');
      return board?.getAttribute('data-arriving') === 'true'
        && (board.getAttribute('data-arriving-unit-ids') ?? '').split(',').filter(Boolean).length === 1;
    });
    const firstArrival = await page.evaluate(async () => {
      const { useActiveRun } = await import('/src/run/store.ts');
      const run = useActiveRun.getState().run;
      return {
        phase: run?.phase,
        ids: document.querySelector('[data-testid="skirmish-board"]')?.getAttribute('data-arriving-unit-ids') ?? '',
        placedIds: Object.keys(run?.deployment?.manualPlacements ?? {}),
      };
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="skirmish-board"]')
      ?.getAttribute('data-arriving') === 'false');
    const secondDisciplineId = deploymentState.disciplineIds.find((unitId) => unitId !== firstArrival.placedIds[0]);
    if (firstArrival.phase !== 'deployment'
      || firstArrival.placedIds.length !== 1
      || firstArrival.ids !== firstArrival.placedIds[0]
      || !secondDisciplineId) {
      await fail('first-discipline-arrival', JSON.stringify({ firstArrival, secondDisciplineId }));
    }

    const finalPlacementStartedAt = Date.now();
    await clickFirstDeploymentCell();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const finalManualArrival = await page.evaluate(async () => {
      const { useActiveRun } = await import('/src/run/store.ts');
      return {
        phase: useActiveRun.getState().run?.phase,
        ids: document.querySelector('[data-testid="skirmish-board"]')?.getAttribute('data-arriving-unit-ids') ?? '',
      };
    });
    if (finalManualArrival.phase !== 'deployment' || finalManualArrival.ids !== secondDisciplineId) {
      await fail('final-discipline-arrival', JSON.stringify({ finalManualArrival, secondDisciplineId }));
    }
    await page.waitForFunction((disciplineIds) => {
      const ids = (document.querySelector('[data-testid="skirmish-board"]')
        ?.getAttribute('data-arriving-unit-ids') ?? '').split(',').filter(Boolean);
      return document.querySelector('[data-testid="skirmish"]')
        && ids.length > 0
        && ids.every((id) => !disciplineIds.includes(id));
    }, {}, deploymentState.disciplineIds);
    const automaticWaveStartedMs = Date.now() - finalPlacementStartedAt;
    const automaticWave = await page.evaluate(() => ({
      ids: (document.querySelector('[data-testid="skirmish-board"]')
        ?.getAttribute('data-arriving-unit-ids') ?? '').split(',').filter(Boolean),
    }));
    await page.waitForFunction(() => document.querySelector('[data-testid="skirmish-board"]')
      ?.getAttribute('data-arriving') === 'false');

    const deploymentResult = await page.evaluate(async (disciplineIds) => {
      const { useActiveRun } = await import('/src/run/store.ts');
      const { activeSkirmishStoreForDiagnostics } = await import('/src/game/SkirmishStoreContext.tsx');
      const { activeSkirmishViewStoreForDiagnostics } = await import('/src/game/SkirmishViewStoreContext.tsx');
      const probe = window.__ctDeploymentProbe;
      cancelAnimationFrame(probe.frame);
      const run = useActiveRun.getState().run;
      const board = document.querySelector('[data-testid="skirmish-board"]');
      const gameStore = activeSkirmishStoreForDiagnostics();
      const viewStore = activeSkirmishViewStoreForDiagnostics();
      const placements = run?.deployment?.manualPlacements ?? {};
      const livePlacementByUnit = Object.fromEntries(disciplineIds.map((unitId) => {
        const piece = gameStore?.getState().game.pieces.find((candidate) => candidate.id === unitId);
        return [unitId, piece ? `${piece.x},${piece.y}` : null];
      }));
      const currentCanvases = [...(board?.querySelectorAll('canvas') ?? [])];
      const finalLayer = board?.querySelector('.tileset-view-art-layer');
      const finalCamera = finalLayer ? [
        finalLayer.style.getPropertyValue('--view-zoom'),
        finalLayer.style.getPropertyValue('--view-pan-x'),
        finalLayer.style.getPropertyValue('--view-pan-y'),
      ].join('|') : null;
      return {
        phase: run?.phase,
        placements,
        livePlacementByUnit,
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
    }, deploymentState.disciplineIds);
    const deploymentShot = 'tmp-shots/run-deployment-battle-continuity.png';
    await transitionBoard.screenshot({ path: deploymentShot });
    const placementMismatch = deploymentState.disciplineIds.find(
      (unitId) => deploymentResult.livePlacementByUnit[unitId] !== deploymentResult.placements[unitId],
    );
    if (
      deploymentResult.phase !== 'battle'
      || automaticWaveStartedMs < 560
      || automaticWave.ids.length === 0
      || automaticWave.ids.some((id) => deploymentState.disciplineIds.includes(id))
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
      || placementMismatch
    ) {
      await fail('deployment-battle-continuity', JSON.stringify({
        firstArrival,
        finalManualArrival,
        automaticWave,
        automaticWaveStartedMs,
        placementMismatch,
        deploymentResult,
      }));
    }
    console.log('Deployment → Battle provider, DOM, canvas, camera, placement, and arrival continuity: OK');
    console.log('deployment screenshot:', deploymentShot);
    console.log('PASS — cold Deployment is camera-ready before reveal and promotes in place');
    await browser.close();
    rmSync(browserProfile, { recursive: true, force: true });
    process.exit(0);
  }
  if (transitionOnly) {
    console.log('PASS — opening Shop Continue is optional-commerce and director-owned through Battle');
    await browser.close();
    rmSync(browserProfile, { recursive: true, force: true });
    process.exit(0);
  }

  // Pick a real legal move from the live store.
  const plan = await page.evaluate(async () => {
    const g = await import('/src/game/SkirmishStoreContext.tsx');
    const r = await import('/src/core/rules.ts');
    const s = g.activeSkirmishStoreForDiagnostics()?.getState();
    if (!s) return null;
    for (const p of s.game.pieces.filter((q) => q.side === 'player' && q.alive)) {
      const moves = r.legalMoves(p, s.game.pieces, s.game.size, s.env);
      if (moves.length) return { pieceId: p.id, type: p.type, from: { x: p.x, y: p.y }, to: { x: moves[0].x, y: moves[0].y } };
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

  // The enemy answers and the turn returns — the full loop is alive.
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

  const shot = 'tmp-shots/run-battle-e2e.png';
  const board = await page.$('.skirmish-war-room');
  if (board) await board.screenshot({ path: shot });
  console.log('screenshot:', shot);

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

  console.log('PASS — anonymous Run battle is fully playable with real clicks');
  await browser.close();
  rmSync(browserProfile, { recursive: true, force: true });
} catch (error) {
  console.error('FAIL (unexpected):', error);
  try { await browser.close(); } catch { /* already gone */ }
  rmSync(browserProfile, { recursive: true, force: true });
  process.exit(1);
}
