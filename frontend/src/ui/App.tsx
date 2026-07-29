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
  StartupSceneContext,
  isMainMenuPath,
  type StartupLayer,
  type StartupSceneController,
} from './shell/startupScene';
import { Party } from './Party';
import { UpdateBanner } from './UpdateBanner';
import { AppTitleBar } from './shell/AppTitleBar';
import { useInstalledChromeCss } from './useInstalledChromeCss';
import {
  APP_NAVIGATION_EVENT,
  getAppNavigationUrl,
  navigateApp,
  normalizeRoutePath,
  runAppNavigationBlockers,
  shouldInterceptAppLinkClick,
} from './navigation';
import { RouteLoadBoundary } from './shell/RouteLoadBoundary';
import { levelEditorRouteIdentity } from './levelEditorRouteIdentity';
import {
  importLevelEditor,
  importPortraitEditor,
  importSkirmish,
  importTilePreview,
  prefetchRoute,
} from './routePrefetch';
import { SceneBoundary } from './shell/SceneBoundary';
import { initialSceneState, reduceScene } from './shell/sceneDirector';
import { sceneManifest } from './shell/sceneManifest';
import { HomepageBackdrop } from './HomepageBackdrop';
import { loadingMark } from '../diagnostics/loadingTimeline';
import { homepageSceneMedia } from './homepageSceneMedia';
import { loadDecodedImage } from '../render/imageResources';
import { repaintHomepageScene } from './SceneBackdrop';

const Skirmish = lazy(() => importSkirmish().then((module) => ({ default: module.Skirmish })));
const TilesetStudio = lazy(() => importTilePreview().then((module) => ({ default: module.TilesetStudio })));
const LevelEditor = lazy(() => importLevelEditor().then((module) => ({ default: module.LevelEditor })));
const PortraitEditor = lazy(() => importPortraitEditor().then((module) => ({ default: module.PortraitEditor })));
const WallCandidateReview = lazy(() => import('./WallCandidateReview').then((module) => ({ default: module.WallCandidateReview })));
const PredrawnReference = lazy(() => import('./PredrawnReference').then((module) => ({ default: module.PredrawnReference })));
const DrawableCatalogLab = lazy(() => import('./DrawableCatalogLab').then((module) => ({ default: module.DrawableCatalogLab })));

const SCENE_FADE_MS = 350;
const SCENE_LOADING_MIN_MS = 350;
const STARTUP_STAGE_BEAT_MS = 140;
const STARTUP_LADDER: readonly StartupLayer[] = ['background', 'title', 'controls'];
const sceneFailureCopy = (error: Error | null): string => (
  error?.message.includes('Canonical thumbnail derivative')
    ? 'A required level preview could not be prepared. Retry to rebuild the preview.'
    : error?.message.includes('Canonical Play content')
      ? 'Play content could not be reached. Check your connection and try again.'
      : 'Required scene data or artwork could not be reached. Check your connection and try again.'
);

/**
 * ADR-0193 application spine. History accepts navigation immediately while the
 * rendered route remains the outgoing scene until its controls have faded. The
 * destination then mounts inert and unrevealed, reports a painted frame through
 * SceneBoundary, and enters as one background-and-controls composition.
 */
export function App(): ReactElement {
  const installedChromeCss = useInstalledChromeCss();
  const initialPath = normalizeRoutePath(window.location.pathname);
  const prepareInitialScene = !isMainMenuPath(initialPath);
  const prepareStartup = isMainMenuPath(initialPath);
  const [path, setPath] = useState(initialPath);
  const [search, setSearch] = useState(window.location.search);
  const [scene, dispatchScene] = useReducer(
    reduceScene,
    sceneManifest(initialPath),
    (manifest) => initialSceneState(
      manifest,
      prepareInitialScene,
      `${window.location.pathname}${window.location.search}`,
      prepareStartup,
    ),
  );
  const sceneRef = useRef(scene);
  const loadingStartedAt = useRef(prepareInitialScene ? performance.now() : 0);
  const timers = useRef<number[]>([]);
  const startupStageStartedAt = useRef(performance.now());
  const previousStartupStage = useRef(scene.startupStage);
  const [bootstrapPresentationPresent, setBootstrapPresentationPresent] = useState(
    () => Boolean(document.getElementById('app-bootstrap-status')),
  );

  useLayoutEffect(() => { sceneRef.current = scene; }, [scene]);
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
    const release = scene.phase === 'error'
      || (scene.phase === 'startup' && scene.startupStage >= 0)
      || (!scene.startupActive && scene.phase === 'entering');
    if (!release) return undefined;
    if (scene.phase === 'error') {
      status.remove();
      setBootstrapPresentationPresent(false);
      return undefined;
    }
    status.classList.add('is-exiting');
    const timer = window.setTimeout(() => {
      status.remove();
      setBootstrapPresentationPresent(false);
    }, SCENE_FADE_MS);
    timers.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [
    bootstrapPresentationPresent,
    scene.phase,
    scene.startupActive,
    scene.startupStage,
  ]);

  const startupController = useMemo<StartupSceneController>(() => ({
    active: scene.startupActive,
    generation: scene.generation,
    revealed: (layer) => !scene.startupActive || scene.startupStage >= STARTUP_LADDER.indexOf(layer),
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

  useEffect(() => {
    if (!scene.startupActive || scene.phase !== 'startup') return undefined;
    const generation = scene.generation;
    let cancelled = false;
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
  }, [scene.generation, scene.phase, scene.startupActive]);

  useEffect(() => {
    if (!scene.startupActive || scene.phase !== 'startup') return undefined;
    const generation = scene.generation;
    if (scene.startupStage >= STARTUP_LADDER.length - 1) {
      const timer = window.setTimeout(
        () => dispatchScene({ type: 'startup-finished', generation }),
        SCENE_FADE_MS,
      );
      timers.current.push(timer);
      return () => window.clearTimeout(timer);
    }
    const nextLayer = STARTUP_LADDER[scene.startupStage + 1];
    if (!scene.startupReady.includes(nextLayer)) return undefined;
    const minimumDelay = scene.startupStage < 0 ? 0 : SCENE_FADE_MS + STARTUP_STAGE_BEAT_MS;
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
      const currentHref = `${path}${search}`;
      if (event.type === 'popstate' && nextHref !== currentHref && runAppNavigationBlockers({
        href: nextHref,
        path: nextPath,
        replace: false,
        source: 'history',
        retry: () => { window.history.back(); return true; },
      })) {
        window.history.pushState({}, '', currentHref);
        return;
      }
      const destination = sceneManifest(nextPath);
      if (destination.id === sceneRef.current.current.id && sceneRef.current.phase === 'current') {
        setPath(nextPath);
        setSearch(nextSearch);
        return;
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
    window.addEventListener('popstate', onNav);
    window.addEventListener(APP_NAVIGATION_EVENT, onNav);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', onIntent);
    document.addEventListener('focusin', onIntent);
    return () => {
      window.removeEventListener('popstate', onNav);
      window.removeEventListener(APP_NAVIGATION_EVENT, onNav);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('focusin', onIntent);
    };
  }, [path, search]);

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
    const timer = window.setTimeout(() => {
      const latest = sceneRef.current;
      if (latest.generation !== generation || !latest.destinationHref) return;
      const url = new URL(latest.destinationHref, window.location.origin);
      setPath(normalizeRoutePath(url.pathname));
      setSearch(url.search);
      loadingStartedAt.current = performance.now();
      dispatchScene({ type: 'exit-finished', generation });
    }, SCENE_FADE_MS);
    timers.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [scene.generation, scene.phase]);

  const destinationPainted = useCallback((generation: number): void => {
    const elapsed = performance.now() - loadingStartedAt.current;
    const remaining = Math.max(0, SCENE_LOADING_MIN_MS - elapsed);
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
    const timer = window.setTimeout(
      () => dispatchScene({ type: 'entrance-finished', generation }),
      SCENE_FADE_MS,
    );
    timers.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [scene.generation, scene.phase]);

  const preparing = scene.phase === 'loading' || scene.phase === 'entering' || scene.phase === 'error';
  const manifest = scene.destination ?? scene.current;
  const transitioning = scene.phase !== 'current' && scene.phase !== 'startup';
  const retainedBackground = scene.current.background;
  const homepageIsDestination = transitioning
    && retainedBackground !== 'homepage'
    && manifest.background === 'homepage';
  const preservesSceneHost = Boolean(
    scene.destination
    && scene.current.host === scene.destination.host
    && scene.current.host === 'menu-shell',
  );

  return (
    <>
      {installedChromeCss ? <style data-app-chrome-family dangerouslySetInnerHTML={{ __html: installedChromeCss }} /> : null}
      <div
        className={`app-chrome-family-root chrome-family-surface scene-director is-${scene.phase}${preservesSceneHost ? ' is-host-preserving' : ''}`}
        data-scene-phase={scene.phase}
        data-scene-error={scene.error?.message}
      >
        <UpdateBanner />
        {transitioning && retainedBackground !== 'homepage' ? (
          <div
            className={`scene-retained-background is-${retainedBackground}`}
            aria-hidden="true"
          />
        ) : null}
        <div
          className={`scene-homepage-background${startupController.revealed('background') ? '' : ' is-startup-pending'}${homepageIsDestination ? ' is-destination' : ''}`}
          aria-hidden="true"
        >
          <HomepageBackdrop directorHostOnly />
        </div>
        <StartupSceneContext.Provider value={startupController}>
          <SceneBoundary
            key={manifest.host === 'menu-shell' ? manifest.host : scene.generation}
            manifest={manifest}
            generation={scene.generation}
            preparing={preparing}
            preserveHost={preservesSceneHost}
            onPainted={destinationPainted}
            onFailed={destinationFailed}
          >
            <AppTitleBar
              path={path}
              search={search}
              revealTitle={startupController.revealed('title')}
            />
            <RouteLoadBoundary resetKey={`${path}${search}`}>
              <Suspense fallback={null}>{renderRoute(path, search)}</Suspense>
            </RouteLoadBoundary>
          </SceneBoundary>
        </StartupSceneContext.Provider>
        {!bootstrapPresentationPresent && (transitioning || (scene.phase === 'startup' && scene.startupStage < 0)) ? (
          <div className="scene-loading-presentation" role={scene.phase === 'error' ? 'alert' : 'status'}>
            {scene.phase === 'error' ? (
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

function renderRoute(path: string, search: string): ReactElement {
  if (path === '/play') return <Skirmish />;
  if (path === '/predrawn-reference') return <PredrawnReference />;
  if (path === '/studio' || path === '/tileset-studio') return <TilesetStudio />;
  if (path === '/studio/wall-candidates') return <WallCandidateReview />;
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
  return <MainMenu path={path} />;
}
