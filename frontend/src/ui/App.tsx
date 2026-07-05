import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactElement } from 'react';
import { MainMenu } from './MainMenu';
import { getSnapshot as getRevealSnapshot, subscribe as subscribeReveal } from './shell/coldReveal';
import { armBoardArtForNav, isBoardArtPending, subscribeBoardArt } from '../render/boardArtReady';
import { Campaign } from './Campaign';
import { Lobbies } from './Lobbies';
import { Party } from './Party';
import { Settings } from './Settings';
import { UpdateBanner } from './UpdateBanner';
import { AppTitleBar } from './shell/AppTitleBar';
import { TitleBarPortalContext } from './shell/TitleBarPortalContext';
import { markScreenNavigation } from './shell/useScreenEntrance';
import {
  APP_NAVIGATION_EVENT,
  getAppNavigationUrl,
  navigateApp,
  normalizeRoutePath,
  shouldInterceptAppLinkClick,
} from './navigation';
import { isBoardArtRoute, isHeavyRoute, isLightArtRoute, routeScreenKey } from './routeSurfaces';
import { SCREEN_EXIT_MS, setScreenExiting } from './shell/screenExit';
import {
  importCampaignEditor,
  importLevelEditor,
  importPortraitEditor,
  importSkirmish,
  importSkirmishMapPicker,
  importTilePreview,
  prefetchRoute,
} from './routePrefetch';

// The Pixi-heavy / larger surfaces are code-split so the menu, lobbies, etc.
// don't pull the renderer bundle (preserving app.js's lazy-mount behaviour).
// The raw import() thunks live in routePrefetch.ts (shared with NavButton's
// hover/focus warm-up) and are consumed by lazy() at click time — the module
// registry dedupes, so warming === the click-time download.
const Skirmish = lazy(() => importSkirmish().then((m) => ({ default: m.Skirmish })));
const SkirmishMapPickerRoute = lazy(() => importSkirmishMapPicker().then((m) => ({ default: m.SkirmishMapPickerRoute })));
const CampaignEditor = lazy(() => importCampaignEditor().then((m) => ({ default: m.CampaignEditor })));
const TilesetStudio = lazy(() => importTilePreview().then((m) => ({ default: m.TilesetStudio })));
const LevelEditor = lazy(() => importLevelEditor().then((m) => ({ default: m.LevelEditor })));
const PortraitEditor = lazy(() => importPortraitEditor().then((m) => ({ default: m.PortraitEditor })));

const fallback = <div style={{ padding: 40, color: 'var(--ds-ink-3)', fontFamily: 'var(--ds-font-sans)' }}>Loading…</div>;

// Route transition behavior is declared in routeSurfaces.ts (ADR-0049). Heavy routes get
// the veil; light-art routes keep the shared menu backdrop/rain continuous and fade their
// own chrome through ArtRouteChrome/LightArtRouteShell.

// Veil timings — keep in lockstep with --route-veil-cover-ms / --route-veil-reveal-ms
// in style.css (JS drives the route swap; CSS drives the opacity fade).
const VEIL_COVER_MS = 260;
const VEIL_REVEAL_MS = 340;
// Cap on the ADR-0051 post-swap exit hold (outgoing chrome invisible while a lazy
// light destination's chunk downloads) — same never-strand posture as the entrance
// hold's READY_FAILSAFE_MS.
const EXIT_HOLD_FAILSAFE_MS = 4000;

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
  // The persistent bar's center/actions portal targets, owned here so the routed screen
  // (a sibling of AppTitleBar) can portal its dynamic bar content into them.
  const [centerNode, setCenterNode] = useState<HTMLElement | null>(null);
  const [actionsNode, setActionsNode] = useState<HTMLElement | null>(null);
  const [studNode, setStudNode] = useState<HTMLElement | null>(null);
  const titleBarPortals = useMemo(() => ({ centerNode, actionsNode, studNode }), [centerNode, actionsNode, studNode]);
  // Cold-load reveal: on a fresh main-menu load the title bar is the 2nd layer to appear
  // (after the background). It reads the shared director's stage so it can hold hidden
  // until its turn. On every other route / later navigation the store is fully revealed,
  // so revealTitle is permanently true and the persistent bar never blinks.
  const reveal = useSyncExternalStore(subscribeReveal, getRevealSnapshot);
  // Board-art readiness for the veil: true while a board route's tiles are still decoding,
  // so the dissolve reveals a complete board instead of an empty frame (render/boardArtReady).
  const boardArtPending = useSyncExternalStore(subscribeBoardArt, isBoardArtPending);
  const pendingTarget = useRef<string | null>(null);
  // Set true once the cover phase has actually swapped the route. The reveal gate keys
  // off THIS, not an exact path match — a destination that redirects to a sub-route on
  // mount (e.g. /settings -> /settings/general) would otherwise never satisfy a path
  // equality check and the veil would stay stuck covering.
  const coverCommitted = useRef(false);
  // Light-hop exit dissolve (ADR-0051): the timer holding the swap while the outgoing
  // chrome fades, and the post-swap flag that keeps the exit state up until the
  // incoming screen has committed (so a slow lazy chunk can't flash the faded-out
  // screen back). Mirrors the veil's pendingTarget/coverCommitted shape. The failsafe
  // caps that post-swap hold (a cold lazy chunk on a hover-less device could otherwise
  // strand the player on a bare backdrop indefinitely — the entrance side has the same
  // posture in READY_FAILSAFE_MS).
  const exitTimer = useRef(0);
  const exitSwapCommitted = useRef(false);
  const exitHoldFailsafe = useRef(0);
  // The nav handler below is mounted once ([] deps) and must read the CURRENT veil
  // phase — the exit dissolve may only arm while the veil is idle, and a nav landing
  // mid-cover must retarget the veil's held swap instead of racing it for
  // pendingTarget (the race left the veil covering forever).
  const veilRef = useRef(veil);
  useLayoutEffect(() => { veilRef.current = veil; }, [veil]);
  const pathRef = useRef(path);
  // Layout effect (not passive): a destination's on-mount redirect runs as a passive
  // effect and dispatches a nav BEFORE a passive pathRef update would run, which made
  // onNav read a stale (heavy) source and wrongly re-trigger the veil mid-transition.
  // A layout effect lands the current path before any child's passive effect fires.
  useLayoutEffect(() => { pathRef.current = path; }, [path]);

  // Navigation + prefetch wiring (delegated at the document, like the click router).
  useEffect(() => {
    const onNav = () => {
      const next = normalizeRoutePath(window.location.pathname);
      const current = pendingTarget.current ?? pathRef.current;
      if (next === current) return;
      // Mark that we've navigated, so the destination screen plays its entrance fade
      // (ADR-0046). The very first cold page load never sets this, so the cold-load reveal
      // owns the initial paint without a competing fade.
      markScreenNavigation();
      // A nav while the veil is COVERING: the field owns the transition — no dissolve
      // choreography applies, and racing the cover timer for pendingTarget must not
      // happen (an exit timer stealing the target left the veil covering forever).
      // Before the cover has swapped, just retarget the held swap; after, swap directly
      // under the (opaque) field — the reveal gate settles on whatever lands last.
      if (veilRef.current === 'cover') {
        if (isBoardArtRoute(next)) armBoardArtForNav();
        if (!coverCommitted.current) {
          pendingTarget.current = next;
        } else {
          pathRef.current = next;
          startRouteTransition(() => setPath(next));
        }
        return;
      }
      // A non-heavy nav landing mid-DISSOLVE just retargets the pending swap (queued as
      // the LAST target, ADR-0046 D — input never drops, and the armed timer can never
      // fire a stale target over a later navigation). A heavy newcomer instead falls
      // through: it cancels the dissolve and hands off to the veil.
      if (exitTimer.current && !isHeavyRoute(next)) {
        pendingTarget.current = next;
        return;
      }
      // Dissolve if EITHER end is heavy — entering one, or leaving one for a light screen.
      if (isHeavyRoute(next) || isHeavyRoute(current)) {
        // A heavy nav mid-exit-dissolve hands off to the veil: stop the pending light
        // swap so it can't fire under the cover. The exit CLASS stays on (the chrome is
        // mid-fade — snapping it back to 1 under a still-transparent veil is a visible
        // pop); the veil's reveal gate clears it once the field is opaque.
        if (exitTimer.current) {
          window.clearTimeout(exitTimer.current);
          exitTimer.current = 0;
        }
        if (exitHoldFailsafe.current) {
          window.clearTimeout(exitHoldFailsafe.current);
          exitHoldFailsafe.current = 0;
        }
        exitSwapCommitted.current = false;
        pendingTarget.current = next; // hold the swap until the field is fully opaque
        coverCommitted.current = false;
        // Entering the board: mark its art pending NOW (before the board mounts) so the
        // veil's reveal gate below waits for the real tiles, not just the JS commit.
        if (isBoardArtRoute(next)) armBoardArtForNav();
        setVeil('cover');
      } else if (isLightArtRoute(current) && routeScreenKey(next) !== routeScreenKey(current)) {
        // Leaving a light-art SCREEN (ADR-0051): dissolve the outgoing chrome, then swap.
        // Same-screen hops (settings tabs, campaign rail) skip this — the component
        // instance is preserved and handles its own sub-navigation, so a dissolve would
        // blink chrome that never remounts.
        pendingTarget.current = next;
        // A fresh episode owns the bookkeeping: a still-pending previous swap must not
        // let the reset effect below clear the exit state mid-dissolve.
        exitSwapCommitted.current = false;
        if (exitHoldFailsafe.current) {
          window.clearTimeout(exitHoldFailsafe.current);
          exitHoldFailsafe.current = 0;
        }
        setScreenExiting(true);
        exitTimer.current = window.setTimeout(() => {
          exitTimer.current = 0;
          const target = pendingTarget.current;
          pendingTarget.current = null;
          if (target != null) {
            exitSwapCommitted.current = true;
            pathRef.current = target;
            startRouteTransition(() => setPath(target));
            // Cap the invisible-and-inert post-swap hold: if the incoming chunk is
            // still downloading after this, bring the old screen back rather than
            // stranding the player on a bare backdrop (the swap still lands later).
            exitHoldFailsafe.current = window.setTimeout(() => {
              exitHoldFailsafe.current = 0;
              exitSwapCommitted.current = false;
              setScreenExiting(false);
            }, EXIT_HOLD_FAILSAFE_MS);
          }
        }, SCREEN_EXIT_MS);
      } else {
        // Light hop: keep the current screen painted (no fallback flash), swap when ready.
        pathRef.current = next;
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
      if (target != null) {
        coverCommitted.current = true;
        pathRef.current = target;
        startRouteTransition(() => setPath(target));
      }
    }, VEIL_COVER_MS);
    return () => window.clearTimeout(timer);
  }, [veil]);

  // Fade up only once the cover phase has swapped the route AND nothing's still pending
  // (the chunk's loaded / the screen settled, including any on-mount sub-route redirect)
  // — so the player never sees a half-composed surface, and the veil never sticks.
  useEffect(() => {
    if (veil === 'cover' && coverCommitted.current && !isPending && !boardArtPending) {
      pendingTarget.current = null;
      // A dissolve the veil took over mid-fade (heavy nav during a light exit) is
      // released here, under the fully opaque field — never in the transparent
      // cover ramp, where dropping the class would visibly snap the chrome back.
      setScreenExiting(false);
      setVeil('reveal');
    }
  }, [veil, path, isPending, boardArtPending]);

  // Reveal finished → idle.
  useEffect(() => {
    if (veil !== 'reveal') return undefined;
    const timer = window.setTimeout(() => setVeil('idle'), VEIL_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [veil]);

  // Exit dissolve: once the swap has committed AND nothing is still pending (the lazy
  // chunk loaded, any on-mount sub-route redirect settled), drop the exit state. Held
  // PAST the swap so a slow chunk can't flash the dissolved screen back to full
  // opacity while it loads; gated on the committed flag (not a path match) for the
  // same redirect reason as the veil's coverCommitted.
  useEffect(() => {
    if (exitSwapCommitted.current && !isPending) {
      exitSwapCommitted.current = false;
      if (exitHoldFailsafe.current) {
        window.clearTimeout(exitHoldFailsafe.current);
        exitHoldFailsafe.current = 0;
      }
      setScreenExiting(false);
    }
  }, [path, isPending]);

  return (
    <>
      <UpdateBanner />
      {/* The single persistent title bar, rendered OUTSIDE the routed screen so it
          survives navigation (only its contents change). It always draws the brand +
          account/settings cluster; screens only fill its optional center/actions
          slots (ADR-0042). revealTitle gates only the cold-load reveal. */}
      <AppTitleBar path={path} onCenterNode={setCenterNode} onActionsNode={setActionsNode} onStudNode={setStudNode} revealTitle={reveal.has('title')} />
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
      {/* Rotate-to-landscape gate. The app is played in landscape on phones; a true
          orientation lock is impossible in a mobile browser (screen.orientation.lock is
          unsupported on iOS Safari), so this overlay is shown — via a CSS media query,
          not JS — only on a touch device held in portrait, and covers everything (it sits
          above the fixed title bar). See the "MOBILE SUPPORT" block in style.css. */}
      <div className="rotate-gate" role="alertdialog" aria-label="Rotate your device to landscape">
        <div className="rotate-gate-inner">
          <svg className="rotate-gate-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="19" y="4" width="17" height="30" rx="3" />
            <line x1="27.5" y1="8.5" x2="27.5" y2="8.5" />
            <path d="M13 20 A16 16 0 0 0 23 42" />
            <polyline points="7.5 18.5 13 20 15 14.5" />
          </svg>
          <p className="rotate-gate-title">Rotate your device</p>
          <p className="rotate-gate-copy">Chess Tactics plays in landscape.</p>
        </div>
      </div>
    </>
  );
}

function renderRoute(path: string): ReactElement {
  if (path === '/play') return <Skirmish />;
  if (path === '/skirmish') return <SkirmishMapPickerRoute />;
  if (path === '/tileset-studio') return <TilesetStudio />;
  // /unit-studio is a deep-link into the one Studio with the Units shelf
  // preselected — not a separate surface. Keeps old links working while the
  // catalog/lab/brush flow stays a single mounted component (no route swaps).
  if (path === '/unit-studio') return <TilesetStudio initialCategory="units" />;
  if (path === '/portrait-editor') return <PortraitEditor />;
  // /doodad-editor: alias into the Studio's Doodads category, opening the composition
  // composer (Viewer 'doodadcomp' kind). Not its own route or 3-panel shell (ADR-0058).
  if (path === '/doodad-editor') return <TilesetStudio initialCategory="doodads" />;
  // /nine-slice-editor is a deep-link alias into the one Studio (like /unit-studio):
  // the 9-slice editor is an embedded Viewer surface, not its own route. The studio
  // reads ?asset=<frame> off this path and canonicalises the URL to /tileset-studio.
  if (path === '/nine-slice-editor') return <TilesetStudio />;
  // /prop-lab is the same shape: a deep-link alias that opens the Studio's embedded
  // prop-seat Viewer (Props category). Not its own route or toolbar (ADR-0058).
  if (path === '/prop-lab') return <TilesetStudio initialCategory="props" />;
  // /tile-compare: alias into the Studio's Tile Pipeline category (ADR-0058 debt migration).
  if (path === '/tile-compare') return <TilesetStudio initialCategory="tilecompare" />;
  // /surface-lab: alias into the Studio's Tileset Surfaces category (ADR-0058 debt migration).
  if (path === '/surface-lab') return <TilesetStudio initialCategory="surfacetiles" />;
  // /scene-anim-lab: alias into the Studio's Scene Animations category (ADR-0058 debt migration).
  if (path === '/scene-anim-lab') return <TilesetStudio initialCategory="sceneanim" />;
  // The level editor is now the studio's socket-legal board in the original
  // asset-backed chrome; the old Pixi LevelEditor/EditorBoard is retired.
  if (path === '/editor/level' || path === '/edit' || path === '/level-editor') return <LevelEditor />;
  // /campaign (singular) is the play surface — pick a campaign; /editor is the authoring
  // editor (the nested level editor is /editor/level). Distinct paths, so order here doesn't
  // matter. Legacy /campaigns-next · /campaigns · /edit · /level-editor remain as aliases.
  if (path === '/campaign' || path.startsWith('/campaign/')) return <Campaign />;
  if (path === '/editor' || path === '/campaigns-next' || path === '/campaigns') return <CampaignEditor />;
  if (path === '/lobbies' || path.startsWith('/lobbies/')) return <Lobbies />;
  if (path === '/party') return <Party />;
  if (path === '/settings' || path.startsWith('/settings/')) return <Settings />;
  // /artwork-compare: alias into the Studio's Art Compare viewer (ADR-0058 supersedes
  // ADR-0005's standalone-route choice). It reads its own ?opts/l/r/lcss/rcss on mount.
  if (path === '/artwork-compare') return <TilesetStudio initialCategory="pages" />;
  return <MainMenu />;
}
