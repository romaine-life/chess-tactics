// React app entry — replaces the legacy app.js string-HTML router. index.html
// loads this module. Bundles the design tokens (style.css), starts background
// music, and mounts the React router. (Account/auth chrome lives in the React
// app-shell title bar now — src/ui/shared/HeaderAccountCluster.)
import './style.css';
// Generated from code-owned nine-slice geometry — carries each frame's content
// and fill boxes as CSS variables without baking or promoting media.
import './generated/nine-slice.css';
import { createRoot } from 'react-dom/client';
import { armForColdHome, isMainMenuPath } from './ui/shell/coldReveal';
// @ts-ignore — bgm.js is untyped legacy JS, imported for its side-effecting init.
import { initBgm } from './bgm.js';
import { primeSfx } from './sfx';
import { initProgressSync } from './campaign/progressSync';
import { loadLiveSeats } from './net/propSeats';
import { loadLiveUnitCatalog } from './net/unitAssets';
import { loadLiveMediaCatalog } from './net/liveMedia';
import { loadDrawableCatalog } from './net/drawableCatalog';
import { loadLiveSfxProfile } from './net/sfxProfile';
import { initUnitSizeTuning } from './ui/unitSizeTuning';
import { assertInstalledChromeSlots } from './ui/chromeCandidateSources';
import { applyGroundCoverCatalog, applyWallArtCatalog, applyWallDecorCatalog } from '@chess-tactics/board-render';

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

// The shell ships hidden (avoids an unstyled flash); reveal it once JS runs.
const shell = document.querySelector('.shell');
if (shell instanceof HTMLElement) shell.style.visibility = 'visible';

// Cold-load reveal (see ui/shell/coldReveal). On a fresh main-menu load, sequence the
// menu's layers in a fixed order — background -> title -> buttons — then let rain drift
// in. Arm BEFORE React renders so the first paint is already in the hidden/pending
// state; it no-ops (everything stays revealed) on every other route and on later
// soft navigations. The route-scoped background preload moves the scene — first in the
// order — to the front of the network queue without taxing other routes (the global
// preload was deliberately removed; see index.html).
if (isMainMenuPath(window.location.pathname)) {
  const bgPreload = document.createElement('link');
  bgPreload.rel = 'preload';
  bgPreload.as = 'image';
  bgPreload.type = 'image/avif';
  bgPreload.href = '/assets/ui/main-menu/background-scene-v1.avif';
  bgPreload.setAttribute('fetchpriority', 'high');
  document.head.appendChild(bgPreload);
}
armForColdHome();

try { initBgm(); } catch { /* background music is decorative */ }
// Arm authored terrain SFX on the first user gesture (mirrors initBgm). Only
// attaches listeners — no AudioContext until a gesture, so it's cheap + autoplay-safe.
try { primeSfx(); } catch { /* sound effects are decorative */ }

const root = document.getElementById('root');
if (root) {
  const reactRoot = createRoot(root);
  reactRoot.render(<main className="app-startup-status" role="status">Loading live assets...</main>);

  void Promise.all([loadLiveMediaCatalog(), loadDrawableCatalog(), loadLiveUnitCatalog()])
    .then(async () => {
      applyGroundCoverCatalog();
      applyWallDecorCatalog();
      applyWallArtCatalog();
      // Prop/doodad definitions derive active raster dimensions from the media
      // snapshot, so media must be installed before the complete seat document.
      // App is intentionally imported only after both authorities are hydrated:
      // modules that derive prop shelves at import time can never observe [] or
      // a packaged fallback.
      await loadLiveSeats();
      // SFX are decorative: hydrate their DB-owned profile before importing the
      // Studio/runtime consumers, but keep honest silence when the row is missing
      // or temporarily unavailable. There is no committed profile fallback.
      await loadLiveSfxProfile().catch(() => false);
      assertInstalledChromeSlots();
      initUnitSizeTuning();
      const { App } = await import('./ui/App');
      reactRoot.render(<App />);
    })
    .catch((error) => {
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
