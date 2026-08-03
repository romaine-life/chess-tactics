// React app entry — replaces the legacy app.js string-HTML router. index.html
// loads this module. Bundles the design tokens (style.css), starts background
// music, and mounts the React router. (Account/auth chrome lives in the React
// app-shell title bar now — src/ui/shared/HeaderAccountCluster.)
import './style.css';
import { createRoot } from 'react-dom/client';
import { Component, type ErrorInfo, type ReactNode } from 'react';
// @ts-ignore — bgm.js is untyped legacy JS, imported for its side-effecting init.
import { initBgm } from './bgm.js';
import { primeSfx } from './sfx';
import { initProgressSync } from './campaign/progressSync';
import { initRunProgressionSync } from './run/progressionSync';
import { loadLiveSeats } from './net/propSeats';
import { loadLiveUnitCatalog } from './net/unitAssets';
import { loadLiveMediaCatalog } from './net/liveMedia';
import { loadDrawableCatalog } from './net/drawableCatalog';
import { loadLiveSfxProfile } from './net/sfxProfile';
import { initUnitSizeTuning } from './ui/unitSizeTuning';
import { assertInstalledChromeSlots } from './ui/chromeCandidateSources';
import { installNineSliceCssVariables, installUiFonts, installUiMediaCssVariables, installedUiMedia } from './ui/installedUiMedia';
import { applyGroundCoverCatalog, applyWallArtCatalog, applyWallDecorCatalog, assertInstalledPresentationCatalog } from '@chess-tactics/board-render';
import { installLoadingResourceObserver, loadingError, loadingMark, loadingMeasure } from './diagnostics/loadingTimeline';
import { composeInstalledChromeCss } from './ui/useInstalledChromeCss';
import { decodeShellChromeArt } from './ui/shell/shellChromeArt';
import { startAuthSession } from './net/authSession';

installLoadingResourceObserver();
loadingMark('app', 'entry-module');
// Authentication is application state, not screen state. Start the sole client
// session owner once; every account-gated consumer observes or awaits this owner.
void startAuthSession();

class AppCrashBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    document.getElementById('app-bootstrap-status')?.remove();
    loadingError('app', 'react-tree-failed', error);
    console.error('application render failed:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-startup-status is-error" role="alert">
        <h1>This scene could not be loaded.</h1>
        <button type="button" onClick={() => window.location.reload()}>Retry</button>
      </main>
    );
  }
}

async function retryStartup<T>(label: string, task: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      loadingError('app', `${label}-attempt-${attempt}-failed`, error);
      if (attempt < attempts) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 200 * (2 ** (attempt - 1))));
      }
    }
  }
  throw lastError;
}

async function loadCriticalFonts(): Promise<void> {
  await document.fonts.load('19px "Advance Wars 2 GBA"', 'CHESS TACTICS Play Settings');
  if (!document.fonts.check('19px "Advance Wars 2 GBA"', 'CHESS TACTICS Play Settings')) {
    throw new Error('The layout-critical interface font did not become available.');
  }
}

// Stale-deploy self-heal. index.html is served no-cache and the chunks are
// content-hashed + immutable — correct — but that does NOT save a tab that
// loaded an older build and then client-side-navigates to a route whose chunk
// hash a newer deploy has replaced: the dynamic import 404s and the route goes
// blank. Vite fires `vite:preloadError` for exactly that. Reload once to fetch
// the fresh index.html + current chunks. The 10s window breaks any reload loop
// from a chunk that is genuinely broken (not merely stale).
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'ct:preload-reload-at';
  const last = Number(sessionStorage.getItem(KEY) || '0');
  if (Date.now() - last < 10_000) return; // just reloaded — real error, let it surface
  sessionStorage.setItem(KEY, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

// App's SceneDirector owns the ordered cold-home reveal. This bootstrap only gives
// the first background request priority before App imports; it does not own a second
// reveal clock or declare readiness.
// Arm authored terrain SFX on the first user gesture (mirrors initBgm). Only
// attaches listeners — no AudioContext until a gesture, so it's cheap + autoplay-safe.
try { primeSfx(); } catch { /* sound effects are decorative */ }

const root = document.getElementById('root');
if (root) {
  const startupAt = performance.now();
  const reactRoot = createRoot(root);

  // index.html starts this face before the module graph and owns the visible
  // bootstrap copy. Re-prove it here before App can replace that static surface.
  const criticalFonts = retryStartup('critical-fonts', loadCriticalFonts).then(() => {
    document.body.classList.remove('loading-bootstrap');
    const bootstrapStatus = document.getElementById('app-bootstrap-status');
    bootstrapStatus?.classList.remove('is-font-pending');
    bootstrapStatus?.classList.add('is-font-ready');
    loadingMeasure('app', 'critical-fonts-ready', startupAt);
    requestAnimationFrame(() => loadingMark('app', 'static-bootstrap-painted'));
  });

  const bootstrapPriority = (
    window as typeof window & { __ctBootstrapScene?: Promise<unknown> }
  ).__ctBootstrapScene ?? Promise.resolve(null);

  // The initial document creates the background request while resolving this
  // bounded projection. Do not let broad catalogs compete until that request
  // has actually entered the browser's scheduler.
  void bootstrapPriority
    .then(() => retryStartup('critical-catalogs', () => Promise.all([loadLiveMediaCatalog(), loadDrawableCatalog(), loadLiveUnitCatalog()])))
    .then(async () => {
      applyGroundCoverCatalog();
      applyWallDecorCatalog();
      applyWallArtCatalog();
      assertInstalledPresentationCatalog();
      installUiMediaCssVariables();
      installUiFonts();
      installNineSliceCssVariables();
      try { initBgm(installedUiMedia('ui-kit-icons-music-png')); } catch { /* background music is decorative */ }
      loadingMeasure('app', 'critical-catalogs-ready', startupAt);
      // Prop/doodad definitions derive active raster dimensions from the media
      // snapshot, so media must be installed before the complete seat document.
      // App is intentionally imported only after both authorities are hydrated:
      // modules that derive prop shelves at import time can never observe [] or
      // a packaged fallback.
      await retryStartup('prop-seats', loadLiveSeats);
      loadingMeasure('app', 'critical-seats-ready', startupAt);
      await criticalFonts;
      // The persistent shell's own art is a startup PRECONDITION (ADR-0367). Chrome
      // composition is complete — it decodes every image its generated CSS references,
      // including the title bar's fill surface — and the bar's marks are decoded beside
      // it. App cannot be imported, and so the bar cannot paint, before both are drawable.
      await retryStartup('installed-chrome', composeInstalledChromeCss);
      await retryStartup('shell-chrome-art', decodeShellChromeArt);
      loadingMeasure('app', 'critical-chrome-ready', startupAt);
      // SFX are decorative: hydrate their DB-owned profile before importing the
      // Studio/runtime consumers, but keep honest silence when the row is missing
      // or temporarily unavailable. There is no committed profile fallback.
      await loadLiveSfxProfile().catch(() => false);
      assertInstalledChromeSlots();
      initUnitSizeTuning();
      const { App } = await import('./ui/App');
      reactRoot.render(<AppCrashBoundary><App /></AppCrashBoundary>);
      requestAnimationFrame(() => loadingMeasure('app', 'first-app-frame', startupAt));
    })
    .catch((error) => {
      document.getElementById('app-bootstrap-status')?.remove();
      loadingError('app', 'critical-startup-failed', error);
      console.error('live asset catalog startup failed:', error);
      if (window.location.pathname === '/studio/drawables') {
        void import('./ui/DrawableCatalogLab').then(({ DrawableCatalogLab }) => reactRoot.render(<DrawableCatalogLab />));
        return;
      }
      reactRoot.render(
        <main className="app-startup-status is-error" role="alert">
          <h1>Live assets unavailable</h1>
          <button type="button" onClick={() => window.location.reload()}>Retry</button>
        </main>,
      );
    });
}

// Fold this browser's campaign progress together with the signed-in account's, so clears follow
// you across devices (and a guest's local progress merges up on first sign-in). Fail-soft:
// signed out / offline is a no-op, and it never blocks the render above.
void initProgressSync();
void initRunProgressionSync();
