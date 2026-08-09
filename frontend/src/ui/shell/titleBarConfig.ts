// Route -> persistent app-shell title-bar config, consumed by the single
// <AppTitleBar> rendered in App. The single bar renders from this table so it
// survives navigation, and it ALWAYS draws the invariant chrome — BrandLockup
// (leading) + HeaderAccountCluster (trailing) — on every route (ADR-0042). A config
// can only ADD an optional center region; routed controls use the typed contribution
// API and always land in the App-owned lane before the persistent divider. Every
// shipping surface (Studio + dev/inspector tools included) is on
// the shared bar; there is no opt-out set, and the function never returns null.
import { playRouteScreenName } from '@chess-tactics/board-render';
import {
  ENCHIRIDION_SECTION_LABEL,
  enchiridionSectionFromPath,
  enchiridionSectionHref,
} from '../enchiridionRoute';
import { isPlaySelectorPath } from '../playHubRoute';
import { isRunRoutePath, presentedRunAddress } from '../runRoute';
import { runWorkspaceHref } from '../RunSelfInspection';
import { isStrategikonPath, strategikonBase, strategikonRouteCrumbs } from '../strategikonRoute';
import type { TitleRouteSegment } from './TitleRoute';

export interface TitleBarConfig {
  screenName: string;
  /** Canonical address for a screen name that begins a clickable title route. */
  screenNameTo?: string;
  /** Address-derived segments owned by the persistent App shell. */
  routeSegments?: readonly TitleRouteSegment[];
  /** Hide the Settings gear in the cluster (default: shown). Available modulation, but
   *  no screen currently sets it — even Settings keeps its gear as a "back to settings
   *  root" link (#241). The account control always renders regardless (ADR-0036/0042). */
  showSettingsGear?: boolean;
  /** Where the cluster's signed-out Sign In control returns to from this screen. */
  signInReturnTo?: string;
  /** Extra class on the bar element to reuse a screen's column layout (e.g. the
   *  menu's 2-column main-menu-twin-header, or an editor's 4-section bar). */
  barClass?: string;
  /** Render a center portal slot the screen fills via <TitleBarSlot region="center">. */
  centerSlot?: boolean;
  /** Render the trailing route segment of the screen-name line, filled via
   *  <TitleBarSlot region="route">. For a screen whose position within itself is
   *  live state rather than address — the Run's phase reads as `Run › Sectio`.
   *  Each rendered segment is a canonical breadcrumb NavButton (ADR-0409). */
  routeSlot?: boolean;
  /** Render the bottom-centre "stud" portal slot — the decorative nailhead diamond
   *  becomes an interactive control the screen fills via <TitleBarSlot region="stud">.
   *  Absolutely positioned over the ornament, out of the grid, so it never shifts the
   *  brand/center/cluster layout. Only single-player Skirmish uses it (a Retry button). */
  studSlot?: boolean;
}

export function titleBarConfig(path: string, search = ''): TitleBarConfig | null {
  // The design/asset Studio + its deep-link aliases: brand left, then the workspace
  // switcher (Catalog/Lab/Viewer icons) contributed before the persistent divider.
  if (path === '/studio' || path === '/tileset-studio' || path === '/unit-studio' || path === '/nine-slice-editor' || path === '/prop-lab' || path === '/tile-compare' || path === '/surface-lab' || path === '/scene-anim-lab' || path === '/doodad-editor' || path === '/artwork-compare') {
    return { screenName: 'Studio', barClass: 'studio-topbar' };
  }
  // Dev / inspector tools — the shared bar with just brand + account cluster.
  if (path === '/portrait-editor') return { screenName: 'Portrait Editor' };
  if (path === '/predrawn-reference') {
    return {
      screenName: 'Pre-drawn Reference',
      barClass: 'predrawn-reference-topbar',
    };
  }

  if (path === '/play' || isStrategikonPath(path) || isRunRoutePath(path)) {
    // studSlot lets a single-player battle turn the ornament diamond into a Retry button
    // (the Skirmish screen portals it in, netplay omitted).
    const run = path.startsWith('/run');
    // A craft link keeps its own address and presents the Run address it names (ADR-0531), so
    // the brand's Run link is an ordinary Run address rather than the link itself.
    const runSearch = run ? presentedRunAddress(path, search).search : search;
    const playStrategikon = isStrategikonPath(path) && strategikonBase(path) === '/play';
    return {
      screenName: run ? 'Run' : playRouteScreenName({ path: '/play', search }),
      screenNameTo: run ? runWorkspaceHref(`/run${runSearch}`, 'primary') : playStrategikon ? `/play${search}` : undefined,
      routeSegments: playStrategikon
        ? strategikonRouteCrumbs(path).map((crumb) => ({ ...crumb, to: `${crumb.to}${search}` }))
        : undefined,
      barClass: 'skirmish-topbar',
      centerSlot: true,
      // A Run names its document-state phase through the route portal. A Play
      // Strategikon's address-only ancestry is rendered directly by the App config.
      routeSlot: run,
      studSlot: true,
    };
  }
  if (isPlaySelectorPath(path)) {
    return { screenName: 'Play', signInReturnTo: path, barClass: 'main-menu-twin-header' };
  }
  if (path === '/lobbies' || path.startsWith('/lobbies/')) {
    return { screenName: 'Lobbies', signInReturnTo: '/lobbies' };
  }
  if (path === '/party') {
    return { screenName: 'Party', signInReturnTo: '/party' };
  }
  if (path === '/editor/level' || path === '/edit' || path === '/level-editor') {
    return { screenName: 'Level Editor', barClass: 'le-topbar' };
  }
  if (path === '/editor' || path === '/editor/wars' || path === '/campaigns-next' || path === '/campaigns') {
    // The Editor is a settings-twin now: a typed ‹ Back contribution plus the live
    // save-state chip in the center slot.
    return { screenName: 'Editor', barClass: 'ce-topbar', centerSlot: true };
  }
  if (path === '/settings' || path.startsWith('/settings/')) {
    // screen, so only Settings scales.
    // Keep the gear visible on Settings too: every section is its own route
    // (/settings/<tab>, /settings/audio/tracks), so the gear is a muscle-memory
    // "back to settings root" from any sub-page. href="/settings" normalizes to
    // the first tab. (Default showSettingsGear=true, so it's simply not hidden.)
    // A valid returnTo contributes a typed Back control before the persistent divider.
    return { screenName: 'Settings', signInReturnTo: '/settings', barClass: 'app-titlebar--ui-scaled settings-topbar' };
  }
  if (path === '/enchiridion' || path.startsWith('/enchiridion/')) {
    const section = enchiridionSectionFromPath(path);
    return {
      screenName: 'Enchiridion',
      screenNameTo: '/enchiridion',
      routeSegments: section ? [{
        label: ENCHIRIDION_SECTION_LABEL[section],
        to: enchiridionSectionHref(section),
      }] : undefined,
      signInReturnTo: path,
      barClass: 'main-menu-twin-header',
    };
  }
  // Fallback: the Main Menu — renderRoute's default for any unmatched path.
  return { screenName: 'Main Menu', signInReturnTo: '/', barClass: 'main-menu-twin-header' };
}
