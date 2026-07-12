import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { Settings } from './Settings';
import { PlayMenu } from './PlayMenu';
import { Lobbies } from './Lobbies';
import { NavButton } from './shared/NavButton';
import { FittedTabLabel } from './shared/FittedTabLabel';
import { isPlaySelectorPath, PLAY_SKIRMISH_SELECTOR_HREF } from './playHubRoute';

// The Editor is heavier / code-split out of the menu bundle — lazy-loaded only when its
// destination opens, inside a LOCAL Suspense so the fallback shows in the destination column
// (not the whole menu). Settings, Play, and Lobbies are light enough to import directly.
const CampaignEditor = lazy(() => import('./CampaignEditor').then((m) => ({ default: m.CampaignEditor })));
import { MENU_MODES } from './design/catalogData';
import { getSnapshot, markReady, subscribe } from './shell/coldReveal';

const ICONS = '/assets/ui/main-menu/icons-carved';
const BRAND_SHIELD = '/assets/ui/kit/icons/brand-shield.png';
// The heaviest button asset — the carved-stone surface behind every rail tab. The
// buttons layer only counts as "ready" once this (plus the icons) has decoded, so the
// rail never reveals as bare panels with the stone snapping in underneath later.
const STONE_SURFACE = '/assets/ui/surfaces/baseline-stone-blue.avif';
// The title bar's wooden surface — gate the title layer on it (plus the brand shield)
// so the bar reveals whole, not wordmark-first then wood.
const TITLE_SURFACE = '/assets/ui/surfaces/hybrid-wood-oak.png';

const MODE_HREFS: Record<string, string> = {
  'campaign-editor': '/editor',
  lobbies: '/lobbies',
  settings: '/settings',
};

interface MenuTab { slug: string; label: string; href: string; iconSlug: string }

// Product-menu relabels applied over MENU_MODES (which stays the untouched design-catalog
// source of truth — its widget assets keep their 'campaign-editor'/'level-editor' names).
// "Editor" remains the campaign/workspace organizer; its pinned actions include the
// no-decisions shortcut into a blank standalone board.
const MENU_TAB_LABELS: Record<string, string> = {
  'campaign-editor': 'Editor',
};

const MENU_HIDDEN_SLUGS = new Set(['solo-skirmish', 'level-editor']);

// The main-menu rail. Play is the one player-facing entry for Skirmish, standalone
// Levels, and Campaigns (ADR-0074). It is menu-only rather than a design-catalog
// widget, so MENU_MODES stays the untouched catalog source of truth. The existing
// sword carving is the semantic Play mark; the retired separate Campaign and Solo
// Skirmish entries do not remain as hidden navigation parallels.
const MENU_TABS: MenuTab[] = [
  { slug: 'play', label: 'Play', href: PLAY_SKIRMISH_SELECTOR_HREF, iconSlug: 'solo-skirmish' },
  ...MENU_MODES
    .filter((mode) => !MENU_HIDDEN_SLUGS.has(mode.slug))
    .map((mode) => ({
      slug: mode.slug,
      label: MENU_TAB_LABELS[mode.slug] ?? mode.label,
      href: MODE_HREFS[mode.slug] || '/',
      iconSlug: mode.slug,
    })),
];

// The trailing-edge Settings control (carved gear) — moved out of the rail into the
// account cluster (ADR-0036). Lives next to the avatar so the top-right reads as one
// "settings + user" unit.
const SETTINGS_ICON = `${ICONS}/settings.png`;

// A mode entry rendered as a settings-style rail tab (shared baked-skin frame —
// line frame over the stone surface — carved icon + label). The same chrome the
// Settings sidebar uses, so the menu and the rest of the app read as one family
// (retires the bespoke stone slabs). A NavButton, not an anchor (ADR-0052): game
// controls are buttons; the route is the address, not the affordance.
// `index` is the tab's position down the rail — it drives the shared stone-continuity
// slice (--tab-index) so this rail's stone reads as one sheet however many tabs it has
// (the menu carries five; the Settings screen four). See .settings-tab in style.css.
// `active` lights the tab whose destination is currently open in the shell (ADR-0062 family).
function ModeTab({ tab, index, active }: { tab: MenuTab; index: number; active?: boolean }): ReactElement {
  return (
    <NavButton
      className={`settings-tab main-menu-mode-tab ${active ? 'is-active' : ''}`.trim()}
      // Toggle: clicking a tab whose destination is already open closes it (back to the bare
      // menu at '/'); otherwise it opens that destination. Home is a menu path, so React keeps
      // this MainMenu instance mounted either way — the button column never blinks.
      to={active ? '/' : tab.href}
      aria-current={active ? 'page' : undefined}
      style={{ ['--tab-index' as string]: index }}
    >
      <span className="settings-tab-icon" aria-hidden="true">
        <img src={`${ICONS}/${tab.iconSlug}.png`} alt="" />
      </span>
      <FittedTabLabel>{tab.label}</FittedTabLabel>
    </NavButton>
  );
}

// Which menu destinations render INSIDE the persistent shell (their own columns beside the pinned
// button column) vs. navigate away to a full screen. Settings, Play, Editor, and Lobbies live in
// the shell; the selected live board and nested Level Editor take the whole screen.
type ShellDest = 'settings' | 'play' | 'editor' | 'lobbies';
const DEST_HREF: Record<ShellDest, string> = { settings: '/settings', play: PLAY_SKIRMISH_SELECTOR_HREF, editor: '/editor', lobbies: '/lobbies' };
const DEST_LABEL: Record<ShellDest, string> = { settings: 'Settings', play: 'Play', editor: 'Editor', lobbies: 'Lobbies' };
// How long the destination panel fades in/out. Matches --ds-duration-fade (the ONE shared fade
// speed, ADR-0046) — same as the Settings panel crossfade + the screen entrance.
const DEST_FADE_MS = 350;
function shellDest(path: string): ShellDest | null {
  if (path === '/settings' || path.startsWith('/settings/')) return 'settings';
  if (isPlaySelectorPath(path)) return 'play';
  // The Editor is a settings-twin now (ADR-0065): canonical /editor + legacy /campaigns-next·/campaigns.
  // The board editor (/editor/level) is a separate heavy full screen — NOT a shell dest.
  if (path === '/editor' || path === '/campaigns-next' || path === '/campaigns') return 'editor';
  // Lobbies is a single ACTION column (tab → action) — host/join + the lobby list.
  if (path === '/lobbies' || path.startsWith('/lobbies/')) return 'lobbies';
  return null;
}

export function MainMenu({ path = '/' }: { path?: string } = {}): ReactElement {
  // The persistent menu shell. The button column (left) stays mounted across the home↔destination
  // hop (routeScreenKey keeps '/' and '/settings' one 'menu' screen, so React never remounts this).
  // A menu-config destination fills the shell's SECOND column with its own fixed-width columns; the
  // home route leaves it empty. The rail's zoom-safe placement (ADR-0062) is untouched — the
  // destination just occupies the previously-empty grid track to its right.
  const dest = shellDest(path);
  // Destination fade (ADR-0046 one-fade-speed): the button column stays put, but the destination
  // panel fades IN when opened and fades OUT before it unmounts — the hop no longer swaps whole
  // screens, so this keeps the dissolve. `renderedDest` lags `dest` through the exit fade; the
  // panel's key = renderedDest so opening/switching remounts it and replays the entrance.
  const [renderedDest, setRenderedDest] = useState<ShellDest | null>(dest);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (dest === renderedDest) { setLeaving(false); return; }
    if (dest) { setRenderedDest(dest); setLeaving(false); return; } // open / switch: show + fade in
    setLeaving(true); // close: hold the panel, fade out, then drop it
    const t = window.setTimeout(() => { setRenderedDest(null); setLeaving(false); }, DEST_FADE_MS);
    return () => window.clearTimeout(t);
  }, [dest, renderedDest]);
  // Cold-load reveal: the menu's layers fade in in a fixed order — background -> title
  // -> buttons (rain drifts in last on its own) — driven by the shared reveal director
  // (see shell/coldReveal). Here MainMenu just REPORTS readiness for the title's brand
  // mark and the buttons' art (icons + stone surface) and gates the background + button
  // layers off the director's stage; the director owns the ordering and the background
  // probe. On any non-cold load the store is already fully revealed, so this is inert.
  const reveal = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, []);

  // Soft-nav arrival fade: on a later navigation INTO the menu (e.g. campaign editor ->
  // menu) the reveal store is already fully revealed, so the buttons would otherwise snap
  // in. Withhold data-reveal-buttons for one frame after mount (then flip `entered`) so the
  // existing .main-menu-twin-screen opacity transition runs as an arrival fade — matching
  // the editor's entrance so the hop dissolves the chrome both ways over the steady
  // backdrop. On a COLD load this is harmless: the director hasn't opened `buttons` yet, so
  // the gate already holds them hidden and `entered` flips long before that stage opens. The
  // timeout backstops a throttled rAF (backgrounded tab) so the menu can never strand blank.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    const t = window.setTimeout(() => setEntered(true), 120);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, []);

  useEffect(() => {
    // Warm + decode each layer's art, then signal the director. decode() resolves once
    // the bitmap is ready; failures (404 / no-AVIF UA) resolve too so a watchdog backstops.
    const decode = (src: string): Promise<void> => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      return (img.decode?.() ?? Promise.reject(new Error('decode unsupported'))).then(
        () => {},
        () => {},
      );
    };
    // Title: the brand shield + the wooden bar surface, so the bar reveals whole.
    void Promise.allSettled([BRAND_SHIELD, TITLE_SURFACE].map(decode)).then(() => markReady('title'));
    // Buttons: the carved icons + the heaviest stone rail surface.
    const buttonArt = [SETTINGS_ICON, STONE_SURFACE, ...MENU_TABS.map((tab) => `${ICONS}/${tab.iconSlug}.png`)];
    void Promise.allSettled(buttonArt.map(decode)).then(() => markReady('buttons'));
  }, []);

  return (
    <div
      className="menu-layer main-menu-layer"
      data-testid="main-menu-next"
      data-reveal-bg={reveal.has('bg') ? '' : undefined}
      data-reveal-buttons={reveal.has('buttons') && entered ? '' : undefined}
    >
      <HomepageBackdrop />
      {/* Settings-twin layout (ADR-0003 superseded): shared app title bar + a rail of
          mode tabs + a framed feature panel — the same baked-skin chrome as /settings.
          The rail is placed by the shared .settings-shell rule alone (ADR-0062) — no
          home-only position class — so its buttons line up pixel-for-pixel with the
          Settings/Play rails at every width. */}
      <div className={`settings-screen main-menu-twin-screen app-shell-bar-pad ${renderedDest ? 'has-dest' : ''}`.trim()} data-dest={renderedDest ?? undefined}>
        <ArtRouteChrome className="settings-shell">
          <aside className="settings-frame settings-rail-frame" aria-label="Game modes">
            {MENU_TABS.map((tab, index) => <ModeTab key={tab.slug} tab={tab} index={index} active={dest !== null && tab.href === DEST_HREF[dest]} />)}
          </aside>
          {renderedDest ? (
            <div className={`menu-dest ${leaving ? 'is-leaving' : ''}`.trim()} key={renderedDest} aria-label={DEST_LABEL[renderedDest]}>
              {renderedDest === 'settings' ? <Settings embedded />
                : renderedDest === 'play' ? <PlayMenu />
                : renderedDest === 'lobbies' ? <Lobbies embedded />
                : <Suspense fallback={<div className="menu-dest-col menu-dest-action" aria-hidden="true" />}><CampaignEditor embedded /></Suspense>}
            </div>
          ) : null}
        </ArtRouteChrome>
      </div>
    </div>
  );
}
