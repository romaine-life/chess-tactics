import {
  lazy,
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
import { initialSceneState, reduceScene } from './shell/sceneDirector';
import {
  deepestSharedSceneRegion,
  isEmptySlotDestination,
  isEmptySlotOrigin,
  overlapsStateDrivenRunScene,
  runSceneWorkspaceIdentity,
  sceneLayerKey,
  sceneManifest,
  sceneOverlapScope,
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
const PlaguedIconReview = lazy(() => import('./PlaguedIconReview').then((module) => ({ default: module.PlaguedIconReview })));
const RunProgressIconReview = lazy(() => import('./RunProgressIconReview').then((module) => ({ default: module.RunProgressIconReview })));
const BrushIconReview = lazy(() => import('./BrushIconReview').then((module) => ({ default: module.BrushIconReview })));

const SCENE_LOADING_MIN_MS = 350;
const STARTUP_STAGE_BEAT_MS = 140;
const sceneFailureCopy = (error: Error | null): string => (
  error?.message.includes('Canonical thumbnail derivative')
    ? 'A required level preview could not be prepared. Retry to rebuild the preview.'
    : error?.message.includes('Canonical Play content')
      ? 'Play content could not be reached. Check your connection and try again.'
      : 'Required scene data or artwork could not be reached. Check your connection and try again.'
);

/**
 * ADR-0205 application spine. History accepts navigation immediately while the
 * rendered route remains the outgoing scene until its controls have faded. The
 * destination then mounts inert and unrevealed, reports a painted frame through
 * SceneBoundary, and enters as one background-and-controls composition.
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
  const loadingStartedAt = useRef(performance.now());
  const timers = useRef<number[]>([]);
  const startupStageStartedAt = useRef(performance.now());
  const previousStartupStage = useRef(scene.startupStage);
  const [bootstrapPresentationPresent, setBootstrapPresentationPresent] = useState(
    () => Boolean(document.getElementById('app-bootstrap-status')),
  );

  useLayoutEffect(() => { sceneRef.current = scene; }, [scene]);
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
    const sharedRegion = destination && !overlapsStateDrivenRunScene(scene.current, destination)
      ? deepestSharedSceneRegion(scene.current, destination)
      : null;
    if (!sharedRegion) {
      loadingStartedAt.current = performance.now();
      dispatchScene({ type: 'exit-finished', generation });
      return undefined;
    }
    if (destination && scene.destinationHref && isEmptySlotOrigin(scene.current, destination)) {
      const url = new URL(scene.destinationHref, window.location.origin);
      setPath(normalizeRoutePath(url.pathname));
      setSearch(url.search);
      loadingStartedAt.current = performance.now();
      loadingMark(destination.id, 'scene-empty-slot-origin-committed', { generation });
      dispatchScene({ type: 'exit-finished', generation });
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
        setPath(normalizeRoutePath(url.pathname));
        setSearch(url.search);
        if (latest.destination && isEmptySlotDestination(latest.current, latest.destination)) {
          loadingMark(latest.destination.id, 'scene-empty-slot-committed', { generation });
          dispatchScene({ type: 'empty-slot-committed', generation });
          return;
        }
        loadingStartedAt.current = performance.now();
        dispatchScene({ type: 'exit-finished', generation });
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
  const retryScene = useCallback((): void => {
    const failed = sceneRef.current;
    const destination = failed.destination ?? failed.current;
    loadingMark(destination.id, 'scene-retry', {
      failedGeneration: failed.generation,
      retryGeneration: failed.generation + 1,
    });
    dispatchScene({ type: 'retry' });
  }, []);
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
          && (
            !deepestSharedSceneRegion(latest.current, latest.destination)
            || overlapsStateDrivenRunScene(latest.current, latest.destination)
          )
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
  const preparing = scene.phase === 'loading'
    || scene.phase === 'entering'
    || scene.phase === 'error'
    || scene.phase === 'startup';
  const manifest = scene.destination ?? scene.current;
  // `path` advances only when the director accepts exit-finished. Keep the
  // renderer bound to that mounted path; `manifest` may describe a pending
  // destination during exit and is preparation metadata, not visibility.
  const mountedScene = scene.phase === 'exiting'
    ? scene.current
    : scene.destination ?? scene.current;
  const transitioning = scene.phase !== 'current' && scene.phase !== 'startup';
  const showSceneFailure = scene.phase === 'error';
  const titleBarLoading = manifest.waitPresentation === 'loading' && (
    scene.phase === 'loading' || scene.phase === 'entering'
  );
  const showLoadingPresentation = scene.phase === 'error'
    || (scene.phase === 'startup' && scene.startupStage < 0);
  const overlapsRunScene = Boolean(
    scene.destination && overlapsStateDrivenRunScene(scene.current, scene.destination),
  );
  // A cold load has no outgoing scene: its destination IS its current, so there is no
  // painted host to retain and nothing to overlap. Preserving a host here would leave the
  // shell's own chrome on screen while only the inner region waited — which is exactly the
  // half-built frame the ladder exists to prevent, now that the curtain lifts at rung 1.
  const initialPreparation = scene.startupActive;
  const preservedSceneHost = scene.destination && !overlapsRunScene && !initialPreparation
    ? deepestSharedSceneRegion(scene.current, scene.destination)
    : null;
  const preservesSceneHost = preservedSceneHost !== null;
  // The persistent bar wears the COMMITTED scene's identity, never the browser's intent
  // (ADR-0369). `path`/`search` advance when the director accepts exit-finished, which is
  // before the destination has painted — binding the bar to them made it announce the
  // destination over a screen that was still the previous one for the whole preparation.
  const committedPath = scene.current.pathname;
  const overlapsCompleteScenes = Boolean(
    scene.destination
    && (!preservesSceneHost || overlapsRunScene)
    && !initialPreparation,
  );
  const destinationLocation = scene.destinationHref
    ? new URL(scene.destinationHref, window.location.origin)
    : null;
  const destinationSearch = destinationLocation?.search ?? search;
  // Overlapping layers still retain everything outside the replaced slot. Naming the
  // scope keeps that retained chrome out of the crossfade instead of blending it
  // toward the backdrop at the midpoint.
  const overlapScope = overlapsCompleteScenes
    ? sceneOverlapScope(scene.current, scene.destination!)
    : 'scene';
  const sceneLayers = overlapsCompleteScenes
    ? [
        {
          key: sceneLayerKey(scene.current),
          scene: scene.current,
          manifest: scene.current,
          search,
          href: `${path}${search}`,
          preparing: false,
          preserveHost: false,
          transitionRegion: null,
          overlapScope,
          visualRole: 'outgoing' as const,
        },
        {
          key: sceneLayerKey(scene.destination!),
          scene: scene.destination!,
          manifest: scene.destination!,
          search: destinationSearch,
          href: scene.destinationHref!,
          preparing,
          preserveHost: false,
          transitionRegion: null,
          overlapScope,
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
          key: sceneLayerKey(mountedScene),
          scene: mountedScene,
          manifest,
          search,
          href: `${path}${search}`,
          preparing,
          preserveHost: preservesSceneHost,
          transitionRegion: preservedSceneHost,
          overlapScope: 'scene' as const,
          visualRole: 'single' as const,
        },
      ];
  const slots = sceneSlots(scene.current, scene.destination);

  return (
    <>
      {installedChromeCss ? <style data-app-chrome-family dangerouslySetInnerHTML={{ __html: installedChromeCss }} /> : null}
      <div
        className={`app-chrome-family-root chrome-family-surface scene-director is-${scene.phase}${preservesSceneHost ? ' is-host-preserving' : ''}`}
        data-scene-phase={scene.phase}
        data-scene-error={scene.error?.message}
        data-scene-committed={scene.current.leaf.key}
        data-scene-pending={scene.destination?.leaf.key}
        data-scene-wait-presentation={manifest.waitPresentation}
        data-scene-slots={JSON.stringify(slots.map((slot) => ({
          id: slot.id,
          committed: slot.committed?.key ?? null,
          pending: slot.pending?.key ?? null,
        })))}
      >
        <UpdateBanner />
        <div
          className={`scene-homepage-background${startupController.revealed('background') ? '' : ' is-startup-pending'}`}
          aria-hidden="true"
        >
          <HomepageBackdrop directorHostOnly />
        </div>
        <StartupSceneContext.Provider value={startupController}>
          <AppTitleBar
            path={committedPath}
            search={committedSearch}
            revealTitle={startupController.revealed('chrome')}
            transitionStatus={titleBarLoading ? 'Loading…' : null}
          />
          <SceneContinuityHost>
            {sceneLayers.map((layer) => (
              <SceneBoundary
                key={layer.key}
                manifest={layer.manifest}
                generation={scene.generation}
                preparing={layer.preparing}
                preserveHost={layer.preserveHost}
                transitionRegion={layer.transitionRegion}
                mountedKey={layer.scene.leaf.key}
                revealing={scene.phase === 'entering' && layer.visualRole !== 'outgoing'}
                deactivating={transitioning && (
                  layer.visualRole === 'outgoing'
                  || (layer.visualRole === 'single' && scene.phase === 'exiting')
                )}
                visualRole={layer.visualRole}
                overlapScope={layer.overlapScope}
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
                <strong>This scene could not be loaded.</strong>
                <small>{sceneFailureCopy(scene.error)}</small>
                <button type="button" onClick={retryScene}>Retry</button>
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
  if (path === '/studio' && new URLSearchParams(search).get('plaguedIconReview') === '1') return <PlaguedIconReview />;
  if (path === '/studio' && new URLSearchParams(search).get('brushIconReview') === '1') return <BrushIconReview />;
  if (path === '/studio' && new URLSearchParams(search).get('runProgressIconReview') === '1') return <RunProgressIconReview />;
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
