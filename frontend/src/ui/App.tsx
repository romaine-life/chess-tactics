import { lazy, Suspense, useEffect, useMemo, useRef, useState, useTransition, type ReactElement } from 'react';
import { MainMenu } from './MainMenu';
import { Campaign } from './Campaign';
import { Lobbies } from './Lobbies';
import { Party } from './Party';
import { Settings } from './Settings';
import { ArtworkCompare } from './ArtworkCompare';
import { TileCompare } from './TileCompare';
import { SurfaceLab } from './SurfaceLab';
import { UpdateBanner } from './UpdateBanner';
import { AppTitleBar } from './shell/AppTitleBar';
import { TitleBarPortalContext } from './shell/TitleBarPortalContext';
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

// Heavy destinations get the cross-route veil on entry — the screens weighty enough
// that a plain swap feels abrupt (skirmish, level editor, campaign editor). Light
// hops (menu, settings, lobbies, party) swap instantly; a fade there would just add
// friction. Tune membership here.
const HEAVY_ROUTES = new Set(['/play', '/skirmish', '/edit', '/level-editor', '/campaigns-next', '/campaigns']);
const isHeavyDestination = (path: string): boolean => HEAVY_ROUTES.has(path);

// Veil timings — keep in lockstep with --route-veil-cover-ms / --route-veil-reveal-ms
// in style.css (JS drives the route swap; CSS drives the opacity fade).
const VEIL_COVER_MS = 260;
const VEIL_REVEAL_MS = 340;

// React router replacing app.js's string-HTML router. Same-origin app links are
// intercepted below so route changes keep the document, React tree, and BGM
// audio element alive. Legacy paths (/skirmish, /level-editor, /campaigns,
// /menu-next, /main-menu) resolve to React surfaces.
export function App(): ReactElement {
  const [path, setPath] = useState<string>(() => normalizeRoutePath(window.location.pathname));
  // Cross-route veil: an atmospheric field that fades OVER the current screen, lets
  // a heavy destination load + compose underneath while opaque, then fades UP into
  // it — one calm dissolve, never a "Loading…" snap. The reveal is gated on
  // useTransition's isPending, so we never fade up into a half-loaded screen. Light
  // hops skip the veil and swap instantly. Timings mirror VEIL_*_MS / style.css.
  const [veil, setVeil] = useState<'idle' | 'cover' | 'reveal'>('idle');
  const [isPending, startRouteTransition] = useTransition();
  // The persistent bar's center/right portal targets, owned here so the routed screen
  // (a sibling of AppTitleBar) can portal its dynamic bar content into them.
  const [centerNode, setCenterNode] = useState<HTMLElement | null>(null);
  const [rightNode, setRightNode] = useState<HTMLElement | null>(null);
  const titleBarPortals = useMemo(() => ({ centerNode, rightNode }), [centerNode, rightNode]);
  const pendingTarget = useRef<string | null>(null);
  const pathRef = useRef(path);
  useEffect(() => { pathRef.current = path; }, [path]);

  // Navigation + prefetch wiring (delegated at the document, like the click router).
  useEffect(() => {
    const onNav = () => {
      const next = normalizeRoutePath(window.location.pathname);
      if (next === pathRef.current) return;
      if (isHeavyDestination(next)) {
        pendingTarget.current = next; // hold the swap until the field is fully opaque
        setVeil('cover');
      } else {
        // Light hop: keep the current screen painted (no fallback flash), swap when ready.
        startRouteTransition(() => setPath(next));
      }
    };
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
  }, []);

  // Once the field is fully opaque, swap the route underneath it.
  useEffect(() => {
    if (veil !== 'cover') return undefined;
    const timer = window.setTimeout(() => {
      const target = pendingTarget.current;
      if (target != null) startRouteTransition(() => setPath(target));
    }, VEIL_COVER_MS);
    return () => window.clearTimeout(timer);
  }, [veil]);

  // Fade up only once the destination has committed AND its chunk is ready (no
  // pending transition) — so the player never sees a half-composed screen surface.
  useEffect(() => {
    if (veil === 'cover' && pendingTarget.current === path && !isPending) {
      pendingTarget.current = null;
      setVeil('reveal');
    }
  }, [veil, path, isPending]);

  // Reveal finished → idle.
  useEffect(() => {
    if (veil !== 'reveal') return undefined;
    const timer = window.setTimeout(() => setVeil('idle'), VEIL_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [veil]);

  return (
    <>
      <UpdateBanner />
      {/* The single persistent title bar, rendered OUTSIDE the routed screen so it
          survives navigation (only its contents change). Renders nothing for routes
          that keep their own header (Studio/dev + not-yet-migrated screens). */}
      <AppTitleBar path={path} onCenterNode={setCenterNode} onRightNode={setRightNode} />
      {/* ONE stable Suspense boundary above the router. Because the boundary
          persists across every route swap (rather than each route mounting its
          own), a transition navigation keeps the already-revealed screen painted
          while the next route's lazy chunk loads — so moving between surfaces no
          longer blanks to "Loading…". The fallback only shows on a genuine cold
          load straight onto a lazy route, when this boundary has revealed nothing
          yet. Heavy entrances additionally ride the veil below. */}
      <TitleBarPortalContext.Provider value={titleBarPortals}>
        <Suspense fallback={fallback}>{renderRoute(path)}</Suspense>
      </TitleBarPortalContext.Provider>
      <div
        className={`route-veil${veil === 'cover' ? ' is-cover' : ''}${veil === 'reveal' ? ' is-reveal' : ''}`}
        aria-hidden="true"
      />
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
