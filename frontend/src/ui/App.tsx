import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { MainMenu } from './MainMenu';
import {
  SHELL_LADDER,
  StartupSceneContext,
  type StartupSceneController,
} from './shell/startupScene';
import { Party } from './Party';
import { UpdateBanner } from './UpdateBanner';
import { AppTitleBar } from './shell/AppTitleBar';
import { useInstalledChromeCss } from './useInstalledChromeCss';
import {
  getAppNavigationUrl,
  navigateApp,
  normalizeRoutePath,
  restoreBlockedAppLocation,
  runAppNavigationBlockers,
  shouldInterceptAppLinkClick,
  subscribeAppLocation,
} from './navigation';
import { RouteLoadBoundary } from './shell/RouteLoadBoundary';
import { isRunRoutePath } from './runRoute';
import { isStrategikonPath, strategikonBase } from './strategikonRoute';
import { levelEditorRouteIdentity } from './levelEditorRouteIdentity';
import {
  importLevelEditor,
  importPortraitEditor,
  importRunScreen,
  importSkirmish,
  importTilePreview,
  prefetchRoute,
} from './routePrefetch';
import { SceneBoundary } from './shell/SceneBoundary';
import { SceneContinuityHost } from './shell/SceneContinuity';
import { createSceneFailureRecovery, sceneFailureRemedy } from './shell/sceneFailure';
import { ChromeButton } from './shared/ChromeButton';
import { goSignIn } from '../net/auth';
import { authSessionIdentityKey, refreshAuthSession, useAuthSession } from '../net/authSession';
import { initialSceneState, reduceScene } from './shell/sceneDirector';
import {
  isEmptySlotDestination,
  isEmptySlotOrigin,
  runSceneWorkspaceIdentity,
  sceneLayerKey,
  sceneManifest,
  sceneTransitionRelationship,
} from './shell/sceneManifest';
import type { ScenePath } from './shell/sceneManifest';
import type { RunSceneSnapshot } from './shell/sceneManifest';
import { sceneSlots } from './shell/sceneSlots';
import { HomepageBackdrop } from './HomepageBackdrop';
import { loadingMark } from '../diagnostics/loadingTimeline';
import { homepageSceneMedia } from './homepageSceneMedia';
import { loadDecodedImage } from '../render/imageResources';
import { repaintHomepageScene } from './SceneBackdrop';
import { useActiveRun } from '../run/store';
import { sceneTransitionDurationMs, waitForSceneTransition } from './shell/sceneTransitionLifecycle';

const Skirmish = lazy(() => importSkirmish().then((module) => ({ default: module.Skirmish })));
const RunScreen = lazy(() => importRunScreen().then((module) => ({ default: module.RunScreen })));
const TilesetStudio = lazy(() => importTilePreview().then((module) => ({ default: module.TilesetStudio })));
const LevelEditor = lazy(() => importLevelEditor().then((module) => ({ default: module.LevelEditor })));
const PortraitEditor = lazy(() => importPortraitEditor().then((module) => ({ default: module.PortraitEditor })));
const PredrawnReference = lazy(() => import('./PredrawnReference').then((module) => ({ default: module.PredrawnReference })));
const DrawableCatalogLab = lazy(() => import('./DrawableCatalogLab').then((module) => ({ default: module.DrawableCatalogLab })));
const LipsanonReview = lazy(() => import('./LipsanonReview').then((module) => ({ default: module.LipsanonReview })));
const RunSectioArtReview = lazy(() => import('./RunSectioArtReview').then((module) => ({ default: module.RunSectioArtReview })));
const RunProgressIconReview = lazy(() => import('./RunProgressIconReview').then((module) => ({ default: module.RunProgressIconReview })));
const BrushIconReview = lazy(() => import('./BrushIconReview').then((module) => ({ default: module.BrushIconReview })));
const MenuIconReview = lazy(() => import('./MenuIconReview').then((module) => ({ default: module.MenuIconReview })));
const TerrainMarkReview = lazy(() => import('./TerrainMarkReview').then((module) => ({ default: module.TerrainMarkReview })));

const SCENE_LOADING_MIN_MS = 350;
const STARTUP_STAGE_BEAT_MS = 140;
// A failed scene is watched, not abandoned: while it is on screen the session owner is re-read on
// this beat (and on focus / visibility / regained connectivity) so a backend that comes back is
// noticed in seconds rather than whenever the owner happens to press something.
const SCENE_FAILURE_REPROBE_MS = 3_000;
const sceneFailureTitle = (needsSignIn: boolean): string => (
  needsSignIn ? 'Sign in to load this screen.' : 'This scene could not be loaded.'
);
const sceneFailureCopy = (error: Error | null, needsSignIn: boolean): string => (
  needsSignIn
    ? 'This address opens content owned by your account. Signing in returns you to this exact screen.'
    : error?.message.includes('Canonical thumbnail derivative')
      ? 'A required level preview could not be prepared. Retry to rebuild the preview.'
      : error?.message.includes('Canonical Play content')
        ? 'Play content could not be reached. Check your connection and try again.'
        : 'Required scene data or artwork could not be reached. Check your connection and try again.'
);

/**
 * Application presentation spine. History accepts navigation immediately while the
 * graph determines whether the request replaces a complete scene owner or changes a
 * selection inside one retained owner. A replacement prepares beside its exact outgoing
 * scene and crossfades directly; a selection may deselect its named region before the
 * prepared successor enters that same stable scene.
 */
export function App(): ReactElement {
  const installedChromeCss = useInstalledChromeCss();
  const activeRun = useActiveRun((state) => state.run);
  const activeRunHydrated = useActiveRun((state) => state.hydrated);
  const hydrateActiveRun = useActiveRun((state) => state.hydrate);
  const initialPath = normalizeRoutePath(window.location.pathname);
  const [path, setPath] = useState(initialPath);
  const [search, setSearch] = useState(window.location.search);
  // The query the COMMITTED scene was resolved with. The bar reads this, not `search`.
  const [committedSearch, setCommittedSearch] = useState(window.location.search);
  // Every route cold-loads through the one shell ladder (ADR-0369) — there is no
  // main-menu branch and no separate "prepare the initial scene" path.
  const [scene, dispatchScene] = useReducer(
    reduceScene,
    sceneManifest(initialPath, window.location.search, {
      run: { hydrated: activeRunHydrated, document: activeRun },
    }),
    (manifest) => initialSceneState(
      manifest,
      `${window.location.pathname}${window.location.search}`,
    ),
  );
  const sceneRef = useRef(scene);
  // Read, never re-probed: the shared owner is the only thing that reads identity (ADR-0306), and
  // the failure screen only needs to compare the one it failed under with the one it is told next.
  const authStatus = useAuthSession((session) => session.status);
  const authPhase = useAuthSession((session) => session.phase);
  const authStatusRef = useRef(authStatus);
  const loadingStartedAt = useRef(performance.now());
  const timers = useRef<number[]>([]);
  const startupStageStartedAt = useRef(performance.now());
  const previousStartupStage = useRef(scene.startupStage);
  const [bootstrapPresentationPresent, setBootstrapPresentationPresent] = useState(
    () => Boolean(document.getElementById('app-bootstrap-status')),
  );

  useLayoutEffect(() => { sceneRef.current = scene; }, [scene]);
  useLayoutEffect(() => { authStatusRef.current = authStatus; }, [authStatus]);
  const resolveScene = useCallback((nextPath: string, nextSearch: string): ScenePath => (
    sceneManifest(nextPath, nextSearch, {
      run: { hydrated: activeRunHydrated, document: activeRun },
    })
  ), [activeRun, activeRunHydrated]);
  // Navigation events may fire from any React flush — a screen canonicalizing its
  // address in a mount or hydration effect dispatches while sibling effects are
  // still settling. The location subscription therefore stays attached for the
  // component's lifetime and reads current values through refs: tearing it down
  // per dependency change opens a flush-wide window (cleanup runs before child
  // setups) where a dispatched navigation is silently lost.
  const committedLocationRef = useRef({ path: initialPath, search: window.location.search });
  useLayoutEffect(() => { committedLocationRef.current = { path, search }; }, [path, search]);
  // A same-scene address rewrite (the editor canonicalizing its document, Settings
  // threading returnTo) commits immediately; a navigation commits when the destination
  // has entered. Both land here, and nowhere else does the persistent bar learn an address.
  useLayoutEffect(() => {
    if (scene.phase !== 'current') return;
    setCommittedSearch(search);
  }, [scene.current, scene.phase, search]);
  const resolveSceneRef = useRef(resolveScene);
  useLayoutEffect(() => { resolveSceneRef.current = resolveScene; }, [resolveScene]);
  useEffect(() => {
    const locationPath = normalizeRoutePath(window.location.pathname);
    if (isRunRoutePath(locationPath)) {
      void hydrateActiveRun();
    }
  }, [hydrateActiveRun]);
  useEffect(() => {
    const locationPath = normalizeRoutePath(window.location.pathname);
    if (!isRunRoutePath(locationPath)) return;
    const destination = resolveScene(locationPath, window.location.search);
    const latest = sceneRef.current;
    if (
      destination.id === latest.current.id
      || destination.id === latest.destination?.id
    ) {
      dispatchScene({ type: 'refresh-source', scene: destination });
      return;
    }
    loadingMark(destination.id, 'scene-source-accepted', {
      source: 'active-run',
      phase: destination.snapshot.kind === 'run' ? destination.snapshot.phase : null,
      workspace: destination.snapshot.kind === 'run'
        ? runSceneWorkspaceIdentity(destination.snapshot.workspace)
        : null,
    });
    dispatchScene({
      type: 'navigate',
      destination,
      href: `${locationPath}${window.location.search}`,
    });
  }, [activeRun, activeRunHydrated, resolveScene]);
  useLayoutEffect(() => {
    if (previousStartupStage.current === scene.startupStage) return;
    previousStartupStage.current = scene.startupStage;
    startupStageStartedAt.current = performance.now();
  }, [scene.startupStage]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  useEffect(() => {
    if (!bootstrapPresentationPresent) return undefined;
    const status = document.getElementById('app-bootstrap-status');
    if (!status) {
      setBootstrapPresentationPresent(false);
      return undefined;
    }
    // The curtain hands over to the app's own background field the moment the ladder's
    // first rung opens — on every route, which is what makes the reveal an ordered build
    // rather than a black rectangle followed by a finished screen (ADR-0369).
    const release = scene.phase === 'error'
      || scene.startupStage >= 0
      || !scene.startupActive;
    if (!release) return undefined;
    if (scene.phase === 'error') {
      status.remove();
      setBootstrapPresentationPresent(false);
      return undefined;
    }
    status.classList.add('is-exiting');
    const cancel = waitForSceneTransition(status, () => {
      status.remove();
      setBootstrapPresentationPresent(false);
    });
    return cancel;
  }, [
    bootstrapPresentationPresent,
    scene.phase,
    scene.startupActive,
    scene.startupStage,
  ]);

  const startupController = useMemo<StartupSceneController>(() => ({
    active: scene.startupActive,
    generation: scene.generation,
    revealed: (layer) => !scene.startupActive || scene.startupStage >= SHELL_LADDER.indexOf(layer),
    reportReady: (layer) => dispatchScene({
      type: 'startup-ready',
      generation: scene.generation,
      layer,
    }),
    reportFailed: (error) => dispatchScene({
      type: 'startup-failed',
      generation: scene.generation,
      error: error instanceof Error ? error : new Error(String(error)),
    }),
  }), [
    scene.generation,
    scene.startupActive,
    scene.startupStage,
  ]);

  // Ladder rung 1. A scene that declares a different background has no shared vista
  // beneath it, so the rung resolves immediately rather than decoding art it never shows.
  const coldLoadBackground = (scene.destination ?? scene.current).background;
  useEffect(() => {
    if (!scene.startupActive || scene.phase !== 'startup') return undefined;
    const generation = scene.generation;
    let cancelled = false;
    if (coldLoadBackground !== 'homepage') {
      dispatchScene({ type: 'startup-ready', generation, layer: 'background' });
      return undefined;
    }
    const backgroundUrl = homepageSceneMedia().immutableUrl;
    const bootstrap = window as Window & {
      __ctBootstrapScene?: Promise<{ scene?: { background?: { immutableUrl?: string } } } | null>;
      __ctBootstrapBackground?: Promise<unknown>;
    };
    const prioritizedBackground = bootstrap.__ctBootstrapScene
      ?.then((projection) => (
        projection?.scene?.background?.immutableUrl === backgroundUrl
          ? bootstrap.__ctBootstrapBackground?.catch(() => null)
          : null
      ))
      .catch(() => null);
    void Promise.resolve(prioritizedBackground)
      .then(() => loadDecodedImage(backgroundUrl))
      .then(() => repaintHomepageScene(backgroundUrl))
      .then(() => {
        if (!cancelled) dispatchScene({ type: 'startup-ready', generation, layer: 'background' });
      })
      .catch((error) => {
        if (!cancelled) dispatchScene({
          type: 'startup-failed',
          generation,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
    return () => { cancelled = true; };
  }, [coldLoadBackground, scene.generation, scene.phase, scene.startupActive]);

  // The ladder's clock. Each rung opens once its own readiness has been reported and the
  // rung before it has had its beat, so the screen is built in a legible order rather than
  // assembled all at once. The final rung hands off to the ordinary entrance in the reducer.
  useEffect(() => {
    if (!scene.startupActive || scene.phase !== 'startup') return undefined;
    const generation = scene.generation;
    const nextLayer = SHELL_LADDER[scene.startupStage + 1];
    if (!nextLayer) return undefined;
    if (!scene.startupReady.includes(nextLayer)) return undefined;
    const minimumDelay = scene.startupStage < 0 ? 0 : sceneTransitionDurationMs() + STARTUP_STAGE_BEAT_MS;
    const elapsed = performance.now() - startupStageStartedAt.current;
    const timer = window.setTimeout(
      () => dispatchScene({ type: 'startup-reveal', generation, layer: nextLayer }),
      Math.max(0, minimumDelay - elapsed),
    );
    timers.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [
    scene.generation,
    scene.phase,
    scene.startupActive,
    scene.startupReady,
    scene.startupStage,
  ]);

  useEffect(() => {
    const onNav = (event: Event): void => {
      const nextPath = normalizeRoutePath(window.location.pathname);
      const nextSearch = window.location.search;
      const nextHref = `${window.location.pathname}${nextSearch}${window.location.hash}`;
      const committed = committedLocationRef.current;
      const currentHref = `${committed.path}${committed.search}`;
      if (event.type === 'popstate' && nextHref !== currentHref && runAppNavigationBlockers({
        href: nextHref,
        path: nextPath,
        replace: false,
        source: 'history',
        retry: () => { window.history.back(); return true; },
      })) {
        restoreBlockedAppLocation(currentHref);
        return;
      }
      const destination = resolveSceneRef.current(nextPath, nextSearch);
      if (destination.id === sceneRef.current.current.id && sceneRef.current.phase === 'current') {
        setPath(nextPath);
        setSearch(nextSearch);
        loadingMark(destination.id, 'scene-address-refreshed', { href: `${nextPath}${nextSearch}` });
        dispatchScene({ type: 'refresh-source', scene: destination });
        return;
      }
      const pending = sceneRef.current.destination;
      if (pending && destination.id === pending.id && sceneRef.current.phase !== 'exiting') {
        // In-place retarget of a preparing destination (address canonicalization).
        // The outgoing scene is already unmounted, and exit-finished — which
        // normally carries the destination address into `path` — has already run,
        // so adopt the canonical address here.
        setPath(nextPath);
        setSearch(nextSearch);
      }
      const superseded = sceneRef.current.destination;
      if (superseded && sceneRef.current.phase !== 'current') {
        loadingMark(superseded.id, 'scene-cancelled', {
          generation: sceneRef.current.generation,
          replacement: destination.id,
        });
      }
      loadingMark(destination.id, 'scene-navigation-accepted', {
        background: destination.background,
        criticalCount: destination.critical.length,
        opportunisticCount: destination.opportunistic.length,
      });
      dispatchScene({ type: 'navigate', destination, href: `${nextPath}${nextSearch}` });
    };
    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || !shouldInterceptAppLinkClick(event, anchor)) return;
      event.preventDefault();
      navigateApp(anchor.href);
    };
    const onIntent = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = getAppNavigationUrl(anchor.href);
      if (url) prefetchRoute(normalizeRoutePath(url.pathname));
    };
    const unsubscribeLocation = subscribeAppLocation(onNav);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', onIntent);
    document.addEventListener('focusin', onIntent);
    return () => {
      unsubscribeLocation();
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('focusin', onIntent);
    };
  }, []);

  useEffect(() => {
    const active = scene.destination ?? scene.current;
    loadingMark(active.id, `scene-${scene.phase}`, {
      generation: scene.generation,
      background: active.background,
      paintOwner: active.paintOwner,
    });
  }, [scene.current, scene.destination, scene.generation, scene.phase]);
  useEffect(() => {
    const active = scene.destination ?? scene.current;
    for (const resource of active.critical) {
      loadingMark(active.id, 'manifest-critical', { resource, generation: scene.generation });
    }
    for (const resource of active.opportunistic) {
      loadingMark(active.id, 'manifest-opportunistic', { resource, generation: scene.generation });
    }
  }, [scene.current, scene.destination, scene.generation]);

  useEffect(() => {
    if (scene.phase !== 'exiting') return undefined;
    const generation = scene.generation;
    const destination = scene.destination;
    /**
     * Committing the destination is the heaviest thing the app does, and it used to run at
     * SYNCHRONOUS priority — so React built the entire incoming screen, ran its layout effects
     * and let the browser lay it all out inside ONE task, with no paint anywhere in it. On the
     * Enchiridion's card gallery that task measured 1194ms: the rain (a rAF canvas draw) and
     * the waterfalls (`background-position` under `steps()`, a main-thread property) both stood
     * still for its whole length, and the rail's own open mark — whose DOM change had already
     * happened at the START of the task — did not appear until the end of it.
     *
     * At transition priority React can yield between slices, so the browser paints what is
     * ALREADY true (the pressed tab's mark, the exit fade) instead of waiting for a screen the
     * player has not asked to see yet. Nothing about the director changes: the same actions
     * dispatch in the same order with the same generation guard, and the phases still run
     * exiting -> loading -> entering. Only the scheduling of the mount moves.
     *
     * `setPath`/`setSearch` ride INSIDE the transition on purpose. They are the address the
     * mounted scene renders from, so splitting them across priorities would commit a tree whose
     * scene and address disagree.
     */
    const mountDestination = (commit: () => void): void => { startTransition(commit); };
    const relationship = destination
      ? sceneTransitionRelationship(scene.current, destination)
      : null;
    const sharedRegion = relationship?.kind === 'selection-change'
      ? relationship.region
      : null;
    if (!sharedRegion) {
      loadingStartedAt.current = performance.now();
      mountDestination(() => dispatchScene({ type: 'exit-finished', generation }));
      return undefined;
    }
    if (destination && scene.destinationHref && isEmptySlotOrigin(scene.current, destination)) {
      const url = new URL(scene.destinationHref, window.location.origin);
      loadingStartedAt.current = performance.now();
      loadingMark(destination.id, 'scene-empty-slot-origin-committed', { generation });
      mountDestination(() => {
        setPath(normalizeRoutePath(url.pathname));
        setSearch(url.search);
        dispatchScene({ type: 'exit-finished', generation });
      });
      return undefined;
    }
    let cancelTransition = (): void => {};
    // Start the director's duration after the browser has painted the exiting
    // target once. Counting from the React effect can beat the CSS transition's
    // first composed frame and remove the child while a sliver is still visible.
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        '.scene-director [data-scene-transition-target][data-scene-transition-active]',
      );
      cancelTransition = waitForSceneTransition(target, () => {
        const latest = sceneRef.current;
        if (latest.generation !== generation || !latest.destinationHref) return;
        const url = new URL(latest.destinationHref, window.location.origin);
        const emptySlot = Boolean(latest.destination && isEmptySlotDestination(latest.current, latest.destination));
        if (emptySlot) loadingMark(latest.destination!.id, 'scene-empty-slot-committed', { generation });
        else loadingStartedAt.current = performance.now();
        mountDestination(() => {
          setPath(normalizeRoutePath(url.pathname));
          setSearch(url.search);
          dispatchScene(emptySlot
            ? { type: 'empty-slot-committed', generation }
            : { type: 'exit-finished', generation });
        });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      cancelTransition();
    };
  }, [scene.generation, scene.phase]);

  const destinationPainted = useCallback((generation: number): void => {
    const elapsed = performance.now() - loadingStartedAt.current;
    const destination = sceneRef.current.destination ?? sceneRef.current.current;
    const minimum = destination.waitPresentation === 'loading' ? SCENE_LOADING_MIN_MS : 0;
    const remaining = Math.max(0, minimum - elapsed);
    const timer = window.setTimeout(
      () => dispatchScene({ type: 'destination-painted', generation }),
      remaining,
    );
    timers.current.push(timer);
  }, []);
  const destinationFailed = useCallback((generation: number, error: Error): void => {
    dispatchScene({ type: 'failed', generation, error });
  }, []);
  const retryScene = useCallback((reason: 'owner' | 'session-recovered' = 'owner'): void => {
    const failed = sceneRef.current;
    const destination = failed.destination ?? failed.current;
    loadingMark(destination.id, 'scene-retry', {
      failedGeneration: failed.generation,
      retryGeneration: failed.generation + 1,
      reason,
    });
    dispatchScene({ type: 'retry' });
  }, []);
  // A failed scene is a dead end unless something notices the world change underneath it, and the
  // world only changes in two ways worth acting on: the backend comes back, or the account session
  // moves (expired here, restored in another tab). ADR-0306's owner is the one thing entitled to
  // know either, so the failure asks it to re-read and retries itself when the answer is MATERIALLY
  // better than the one it failed under — a backend that had stopped answering doing so again, or
  // a changed identity. A same-answer probe changes nothing and leaves the manual action in place,
  // so a scene broken for its own reasons can never retry-loop on the beat.
  useEffect(() => {
    if (scene.phase !== 'error') return undefined;
    const recovery = createSceneFailureRecovery(authSessionIdentityKey(authStatusRef.current));
    let recovering = false;
    const probe = (): void => {
      if (recovering) return;
      void refreshAuthSession().then((status) => {
        if (recovering || sceneRef.current.phase !== 'error') return;
        if (!recovery.observe({
          reachable: status.reachable,
          identityKey: authSessionIdentityKey(status),
        })) return;
        recovering = true;
        retryScene('session-recovered');
      });
    };
    const probeWhenVisible = (): void => { if (!document.hidden) probe(); };
    const timer = window.setInterval(probeWhenVisible, SCENE_FAILURE_REPROBE_MS);
    window.addEventListener('focus', probe);
    window.addEventListener('online', probe);
    document.addEventListener('visibilitychange', probeWhenVisible);
    probe();
    return () => {
      recovering = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', probe);
      window.removeEventListener('online', probe);
      document.removeEventListener('visibilitychange', probeWhenVisible);
    };
  }, [retryScene, scene.generation, scene.phase]);
  useEffect(() => {
    if (scene.phase !== 'entering') return undefined;
    const generation = scene.generation;
    let cancelTransition = (): void => {};
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        '.scene-director [data-scene-transition-target][data-scene-transition-active]',
      );
      cancelTransition = waitForSceneTransition(target, () => {
        const latest = sceneRef.current;
        if (
          latest.generation === generation
          && latest.destinationHref
          && latest.destination
          && sceneTransitionRelationship(latest.current, latest.destination).kind === 'scene-replacement'
        ) {
          const url = new URL(latest.destinationHref, window.location.origin);
          setPath(normalizeRoutePath(url.pathname));
          setSearch(url.search);
        }
        dispatchScene({ type: 'entrance-finished', generation });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      cancelTransition();
    };
  }, [scene.generation, scene.phase]);

  // `startup` prepares its destination through the same boundary contract as any other
  // navigation — the ladder puts the shell rungs in front of it, it does not replace it.
  const manifest = scene.destination ?? scene.current;
  // `path` advances only when the director accepts exit-finished. Keep the
  // renderer bound to that mounted path; `manifest` may describe a pending
  // destination during exit and is preparation metadata, not visibility.
  const mountedScene = scene.phase === 'exiting'
    ? scene.current
    : scene.destination ?? scene.current;
  const showSceneFailure = scene.phase === 'error';
  // Who decides that signing in is the fix, in order of authority. A screen that failed on a
  // private address KNOWS, and says so on the error itself; nothing else may overrule it. Otherwise
  // the session owner is asked, and "authoritatively signed out" is the one answer that makes
  // signing in worth offering — as an addition beside Retry, never as a replacement for it,
  // because a signed-out browser is a perfectly ordinary way to be here (ADR-0060).
  const failureRemedy = sceneFailureRemedy(scene.error);
  const sceneFailureNeedsSignIn = failureRemedy === 'sign-in';
  const sceneFailureOffersSignIn = sceneFailureNeedsSignIn
    || (failureRemedy === null && authPhase === 'anonymous');
  const titleBarLoading = manifest.waitPresentation === 'loading' && (
    scene.phase === 'loading' || scene.phase === 'entering'
  );
  const showLoadingPresentation = scene.phase === 'error'
    || (scene.phase === 'startup' && scene.startupStage < 0);
  const transitionRelationship = scene.destination
    ? sceneTransitionRelationship(scene.current, scene.destination)
    : null;
  // A cold load has no outgoing scene: its destination IS its current, so there is no
  // painted host to retain and nothing to overlap. Preserving a host here would leave the
  // shell's own chrome on screen while only the inner region waited — which is exactly the
  // half-built frame the ladder exists to prevent, now that the curtain lifts at rung 1.
  const initialPreparation = scene.startupActive;
  const preservedSceneHost = transitionRelationship?.kind === 'selection-change' && !initialPreparation
    ? transitionRelationship.region
    : null;
  const preservesSceneHost = preservedSceneHost !== null;
  // The persistent bar wears the COMMITTED scene's identity, never the browser's intent
  // (ADR-0369). `path`/`search` advance when the director accepts exit-finished, which is
  // before the destination has painted — binding the bar to them made it announce the
  // destination over a screen that was still the previous one for the whole preparation.
  const committedPath = scene.current.pathname;
  const overlapsCompleteScenes = Boolean(
    scene.destination
    && transitionRelationship?.kind === 'scene-replacement'
    && !initialPreparation,
  );
  const destinationLocation = scene.destinationHref
    ? new URL(scene.destinationHref, window.location.origin)
    : null;
  const destinationSearch = destinationLocation?.search ?? search;
  const sceneLayers = overlapsCompleteScenes
    ? [
        {
          // The SAME key the single layer carried while this scene was committed, so
          // beginning a replacement does not change the mount identity of the screen the
          // player is looking at. Dropping the epoch here made every scene replacement
          // destroy and rebuild its own outgoing scene: Rewards tore down the settled
          // Victory board and re-ran its entrance before the crossfade began, which is the
          // flicker ADR-0558 is about. `committedEpoch` — not `retryEpoch` — because a
          // retry belongs to the failed destination and must not rebuild the painted scene
          // standing behind it.
          key: `${sceneLayerKey(scene.current)}#${scene.committedEpoch}`,
          scene: scene.current,
          manifest: scene.current,
          search,
          href: `${path}${search}`,
          preserveHost: false,
          transitionRegion: null,
          visualRole: 'outgoing' as const,
        },
        {
          // The incoming layer carries the retry epoch for the same reason the single
          // layer does: a retried destination that failed while overlapping its outgoing
          // scene must be rebuilt, not re-driven around the instance holding the failure.
          key: `${sceneLayerKey(scene.destination!)}#${scene.retryEpoch}`,
          scene: scene.destination!,
          manifest: scene.destination!,
          search: destinationSearch,
          href: scene.destinationHref!,
          preserveHost: false,
          transitionRegion: null,
          visualRole: 'incoming' as const,
        },
      ]
    : [
        {
          // The layer key is the prepared scene's mount identity. Preserve that exact
          // identity when entering becomes current; changing back to a root-region key
          // here would destroy and recreate the just-committed screen and its store.
          // A nested detail leaf shares its host's key (sceneLayerKey) so selecting a
          // Run choice re-renders the retained action column instead of remounting it.
          // The retry epoch is the one thing that DOES change it, because a screen that
          // failed is holding the failure and must be rebuilt to try again — see
          // SceneState.retryEpoch. It advances only on retry, never on navigation.
          // Which epoch depends on WHICH scene this layer is mounting: a destination is
          // keyed by the retry that built it, while the committed scene keeps the epoch it
          // was committed with. Keying an outgoing scene by a retry it had no part in
          // rebuilt it mid-exit — the same defect as the overlap key above (ADR-0558).
          key: `${sceneLayerKey(mountedScene)}#${mountedScene === scene.destination ? scene.retryEpoch : scene.committedEpoch}`,
          scene: mountedScene,
          manifest,
          search,
          href: `${path}${search}`,
          preserveHost: preservesSceneHost,
          transitionRegion: preservedSceneHost,
          visualRole: 'single' as const,
        },
      ];
  const slots = sceneSlots(scene.current, scene.destination);
  // The animated menu artwork is a real scene resource, not a universal floor. Keep its
  // singleton mounted while either side of a transition belongs to the homepage family so
  // those routes retain continuity; park it everywhere else. A Run-to-Run crossfade must have
  // only its actual outgoing and incoming scenes behind one another.
  const homepageBackdropActive = scene.current.background === 'homepage'
    || scene.destination?.background === 'homepage';

  return (
    <>
      {installedChromeCss ? <style data-app-chrome-family dangerouslySetInnerHTML={{ __html: installedChromeCss }} /> : null}
      <div
        className={`app-chrome-family-root chrome-family-surface scene-director is-${scene.phase}${preservesSceneHost ? ' is-host-preserving' : ''}`}
        data-scene-phase={scene.phase}
        data-scene-error={scene.error?.message}
        data-scene-committed={scene.current.leaf.key}
        data-scene-pending={scene.destination?.leaf.key}
        data-scene-transition-relationship={transitionRelationship?.kind}
        data-scene-wait-presentation={manifest.waitPresentation}
        data-scene-slots={JSON.stringify(slots.map((slot) => ({
          id: slot.id,
          committed: slot.committed?.key ?? null,
          pending: slot.pending?.key ?? null,
        })))}
      >
        <UpdateBanner />
        {homepageBackdropActive ? (
          <div
            className={`scene-homepage-background${startupController.revealed('background') ? '' : ' is-startup-pending'}`}
            aria-hidden="true"
          >
            <HomepageBackdrop directorHostOnly />
          </div>
        ) : null}
        <StartupSceneContext.Provider value={startupController}>
          <AppTitleBar
            path={committedPath}
            search={committedSearch}
            revealTitle={startupController.revealed('chrome')}
            transitionStatus={titleBarLoading ? 'Loading…' : null}
          />
          <SceneContinuityHost phase={scene.phase} generation={scene.generation}>
            {sceneLayers.map((layer) => (
              <SceneBoundary
                key={layer.key}
                manifest={layer.manifest}
                generation={scene.generation}
                directorPhase={scene.phase}
                preserveHost={layer.preserveHost}
                transitionRegion={layer.transitionRegion}
                mountedKey={layer.scene.leaf.key}
                visualRole={layer.visualRole}
                onPainted={destinationPainted}
                onFailed={destinationFailed}
              >
                <RouteLoadBoundary resetKey={layer.href}>
                  <Suspense fallback={null}>{renderScene(layer.scene, layer.search)}</Suspense>
                </RouteLoadBoundary>
              </SceneBoundary>
            ))}
          </SceneContinuityHost>
        </StartupSceneContext.Provider>
        {!bootstrapPresentationPresent && showLoadingPresentation ? (
          <div className="scene-loading-presentation" role={scene.phase === 'error' ? 'alert' : 'status'}>
            {showSceneFailure ? (
              <>
                <strong>{sceneFailureTitle(sceneFailureNeedsSignIn)}</strong>
                <small>{sceneFailureCopy(scene.error, sceneFailureNeedsSignIn)}</small>
                <div className="scene-failure-actions">
                  {sceneFailureOffersSignIn ? (
                    // The address that failed is still the address in the bar, so goSignIn's default
                    // returnTo IS this screen: the round trip through the identity provider lands
                    // back on the exact thing that could not load, already signed in.
                    <ChromeButton
                      unit="inner-text-button"
                      tone="primary"
                      className="le-seg-btn"
                      data-scene-failure-action="sign-in"
                      onClick={() => goSignIn()}
                    >
                      Sign in
                    </ChromeButton>
                  ) : null}
                  {/* Kept beside Sign in rather than replaced by it: being signed out does not prove
                      the sign-out is what broke this screen, and playing never requires an account
                      (ADR-0060). Only a screen that declared `sign-in` retires it. */}
                  {sceneFailureNeedsSignIn ? null : (
                    <ChromeButton
                      unit="inner-text-button"
                      className="le-seg-btn"
                      data-scene-failure-action="retry"
                      onClick={() => retryScene()}
                    >
                      Retry
                    </ChromeButton>
                  )}
                </div>
              </>
            ) : <span>Loading…</span>}
          </div>
        ) : null}
        <div className="rotate-gate" role="alertdialog" aria-label="Rotate your device to landscape">
          <div className="rotate-gate-inner">
            <p className="rotate-gate-title">Rotate your device</p>
            <p className="rotate-gate-copy">Chess Tactics plays in landscape.</p>
          </div>
        </div>
      </div>
    </>
  );
}

function renderScene(scene: ScenePath, search: string): ReactElement {
  const path = scene.pathname;
  if (path === '/play') return <Skirmish routePath={path} routeSearch={search} />;
  if (isStrategikonPath(path) && strategikonBase(path) === '/play') {
    return <Skirmish routePath={path} routeSearch={search} />;
  }
  if (isRunRoutePath(path)) {
    return <RunScreen routePath={path} routeSearch={search} sceneSnapshot={scene.snapshot as RunSceneSnapshot} />;
  }
  if (path === '/predrawn-reference') return <PredrawnReference />;
  if (path === '/studio' && new URLSearchParams(search).get('runSectioReview') === '1') return <RunSectioArtReview />;
  if (path === '/studio' && new URLSearchParams(search).get('lipsanonReview') === '1') return <LipsanonReview />;
  if (path === '/studio' && new URLSearchParams(search).get('brushIconReview') === '1') return <BrushIconReview />;
  if (path === '/studio' && new URLSearchParams(search).get('runProgressIconReview') === '1') return <RunProgressIconReview />;
  if (path === '/studio' && new URLSearchParams(search).get('menuIconReview') === '1') return <MenuIconReview />;
  if (path === '/studio' && new URLSearchParams(search).get('terrainMarkReview') === '1') return <TerrainMarkReview />;
  if (path === '/studio' || path === '/tileset-studio') return <TilesetStudio />;
  // Wall review lives in the Studio proper: an owner proof only counts from a game-owned
  // surface, and this bespoke path is not one. The studio's route writer canonicalises this
  // alias to /studio?cat=walls&mode=viewer&vk=wallcandidates, so old links keep working.
  if (path === '/studio/wall-candidates') return <TilesetStudio initialCategory="walls" />;
  if (path === '/studio/drawables') return <DrawableCatalogLab />;
  if (path === '/unit-studio') return <TilesetStudio initialCategory="units" />;
  if (path === '/portrait-editor') return <PortraitEditor />;
  if (path === '/doodad-editor') return <TilesetStudio initialCategory="doodads" />;
  if (path === '/nine-slice-editor') return <TilesetStudio />;
  if (path === '/prop-lab') return <TilesetStudio initialCategory="props" />;
  if (path === '/tile-compare') return <TilesetStudio initialCategory="tilecompare" />;
  if (path === '/surface-lab') return <TilesetStudio initialCategory="surfacetiles" />;
  if (path === '/scene-anim-lab') return <TilesetStudio initialCategory="sceneanim" />;
  if (path === '/editor/level' || path === '/edit' || path === '/level-editor') {
    return <LevelEditor key={levelEditorRouteIdentity(search)} />;
  }
  if (path === '/party') return <Party />;
  if (path === '/artwork-compare') return <TilesetStudio initialCategory="pages" />;
  return <MainMenu path={scene.pathname} search={search} sceneInstanceKey={scene.leaf.key} />;
}
