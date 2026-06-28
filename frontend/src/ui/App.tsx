import { lazy, startTransition, Suspense, useEffect, useState, type ReactElement } from 'react';
import { MainMenu } from './MainMenu';
import { Campaign } from './Campaign';
import { Lobbies } from './Lobbies';
import { Party } from './Party';
import { Settings } from './Settings';
import { ArtworkCompare } from './ArtworkCompare';
import { TileCompare } from './TileCompare';
import { SurfaceLab } from './SurfaceLab';
import { UpdateBanner } from './UpdateBanner';
import {
  APP_NAVIGATION_EVENT,
  getAppNavigationUrl,
  navigateApp,
  normalizeRoutePath,
  shouldInterceptAppLinkClick,
} from './navigation';

// The Pixi-heavy / larger surfaces are code-split so the menu, lobbies, etc.
// don't pull the renderer bundle (preserving app.js's lazy-mount behaviour).
// The raw import() thunks are named so the same chunk can be *prefetched* on
// hover/focus (see prefetchRoute) and consumed by lazy() at click time — the
// module registry dedupes, so warming === the click-time download.
const importSkirmish = () => import('./Skirmish');
const importCampaignEditor = () => import('./CampaignEditor');
const importTilePreview = () => import('./TilePreview');
const importLevelEditor = () => import('./LevelEditor');
const importPortraitEditor = () => import('./PortraitEditor');
const importDoodadEditor = () => import('./DoodadEditor');

const Skirmish = lazy(() => importSkirmish().then((m) => ({ default: m.Skirmish })));
const CampaignEditor = lazy(() => importCampaignEditor().then((m) => ({ default: m.CampaignEditor })));
const TilesetStudio = lazy(() => importTilePreview().then((m) => ({ default: m.TilesetStudio })));
const LevelEditor = lazy(() => importLevelEditor().then((m) => ({ default: m.LevelEditor })));
const PortraitEditor = lazy(() => importPortraitEditor().then((m) => ({ default: m.PortraitEditor })));
const DoodadEditor = lazy(() => importDoodadEditor().then((m) => ({ default: m.DoodadEditor })));

const fallback = <div style={{ padding: 40, color: 'var(--ds-ink-3)', fontFamily: 'var(--ds-font-sans)' }}>Loading…</div>;

// Mirror of renderRoute's lazy routes: which chunk a path needs, if any. Eager
// routes (Campaign, Lobbies, Settings…) return null — they're already in the main
// bundle, nothing to warm.
function chunkForPath(path: string): (() => Promise<unknown>) | null {
  if (path === '/play' || path === '/skirmish') return importSkirmish;
  if (path === '/tileset-studio' || path === '/unit-studio' || path === '/nine-slice-editor') return importTilePreview;
  if (path === '/edit' || path === '/level-editor') return importLevelEditor;
  if (path === '/portrait-editor') return importPortraitEditor;
  if (path === '/doodad-editor') return importDoodadEditor;
  if (path === '/campaigns-next' || path === '/campaigns') return importCampaignEditor;
  return null;
}

// Warm a route's JS chunk on intent (hover/focus) so the click doesn't wait on a
// cold download. The set keeps us from re-invoking the thunk on every pointer move
// (the import() itself is already idempotent, but this avoids the churn).
const prefetched = new Set<() => Promise<unknown>>();
function prefetchRoute(path: string): void {
  const thunk = chunkForPath(path);
  if (!thunk || prefetched.has(thunk)) return;
  prefetched.add(thunk);
  void thunk();
}

// React router replacing app.js's string-HTML router. Same-origin app links are
// intercepted below so route changes keep the document, React tree, and BGM
// audio element alive. Legacy paths (/skirmish, /level-editor, /campaigns,
// /menu-next, /main-menu) resolve to React surfaces.
export function App(): ReactElement {
  const [path, setPath] = useState<string>(() => normalizeRoutePath(window.location.pathname));

  useEffect(() => {
    // startTransition keeps the current screen painted while the next route's
    // lazy chunk resolves — React holds back the Suspense fallback when it's
    // transitioning away from already-revealed content, so navigating between
    // surfaces no longer blanks to "Loading…". (Cold first-load straight onto a
    // lazy route still shows the fallback, which is correct — nothing to keep.)
    const syncPath = () => startTransition(() => setPath(normalizeRoutePath(window.location.pathname)));
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!shouldInterceptAppLinkClick(event, anchor)) return;

      event.preventDefault();
      navigateApp(anchor.href);
    };
    // Prefetch-on-intent: warm the destination chunk when the pointer hovers (or
    // keyboard focus lands on) any in-app link, so by click time the code is
    // already cached. Delegated at the document like onClick, so every app link
    // benefits — no per-button wiring. pointerover/focusin both bubble.
    const onIntent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = getAppNavigationUrl(anchor.href);
      if (url) prefetchRoute(normalizeRoutePath(url.pathname));
    };

    window.addEventListener('popstate', syncPath);
    window.addEventListener(APP_NAVIGATION_EVENT, syncPath);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', onIntent);
    document.addEventListener('focusin', onIntent);
    return () => {
      window.removeEventListener('popstate', syncPath);
      window.removeEventListener(APP_NAVIGATION_EVENT, syncPath);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerover', onIntent);
      document.removeEventListener('focusin', onIntent);
    };
  }, []);

  return (
    <>
      <UpdateBanner />
      {/* ONE stable Suspense boundary above the router. Because the boundary
          persists across every route swap (rather than each route mounting its
          own), a startTransition navigation keeps the already-revealed screen
          painted while the next route's lazy chunk loads — so moving between
          surfaces no longer blanks to "Loading…". The fallback only shows on a
          genuine cold load straight onto a lazy route, when this boundary has
          revealed nothing yet. */}
      <Suspense fallback={fallback}>{renderRoute(path)}</Suspense>
    </>
  );
}

function renderRoute(path: string): ReactElement {
  if (path === '/play' || path === '/skirmish') return <Skirmish />;
  if (path === '/tileset-studio') return <TilesetStudio />;
  // /unit-studio is a deep-link into the one Studio with the Units shelf
  // preselected — not a separate surface. Keeps old links working while the
  // catalog/lab/brush flow stays a single mounted component (no route swaps).
  if (path === '/unit-studio') return <TilesetStudio initialCategory="units" />;
  if (path === '/portrait-editor') return <PortraitEditor />;
  if (path === '/doodad-editor') return <DoodadEditor />;
  // /nine-slice-editor is a deep-link alias into the one Studio (like /unit-studio):
  // the 9-slice editor is an embedded Viewer surface, not its own route. The studio
  // reads ?asset=<frame> off this path and canonicalises the URL to /tileset-studio.
  if (path === '/nine-slice-editor') return <TilesetStudio />;
  // The level editor is now the studio's socket-legal board in the original
  // asset-backed chrome; the old Pixi LevelEditor/EditorBoard is retired.
  if (path === '/edit' || path === '/level-editor') return <LevelEditor />;
  // /campaign (singular) is the play surface — pick a campaign; /campaigns-next is
  // the authoring editor. Distinct paths, so order here doesn't matter.
  if (path === '/campaign' || path.startsWith('/campaign/')) return <Campaign />;
  if (path === '/campaigns-next' || path === '/campaigns') return <CampaignEditor />;
  if (path === '/lobbies' || path.startsWith('/lobbies/')) return <Lobbies />;
  if (path === '/party') return <Party />;
  if (path === '/settings' || path.startsWith('/settings/')) return <Settings />;
  if (path === '/artwork-compare') return <ArtworkCompare />;
  if (path === '/tile-compare') return <TileCompare />;
  if (path === '/surface-lab') return <SurfaceLab />;
  return <MainMenu />;
}
