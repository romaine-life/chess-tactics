import { normalizeRoutePath } from './navigation';

export type RouteSurface = 'heavy-board' | 'heavy-editor' | 'light-art' | 'light-plain';

// ADR-0049: route transition behavior is declared by surface, not by ad-hoc route lists.
// "light-art" means the main-menu scene/rain stay continuous and the screen chrome uses
// ArtRouteChrome/LightArtRouteShell; "heavy-*" means the route veil may cover a costly
// board/editor swap.
export function routeSurface(pathname: string): RouteSurface {
  const path = normalizeRoutePath(pathname);

  if (path === '/play') return 'heavy-board';
  if (path === '/edit' || path === '/level-editor') return 'heavy-editor';

  if (
    path === '/' ||
    // Legacy menu aliases render the same MainMenu over the ambience backdrop — they
    // must classify with '/' or leaving them skips the exit dissolve (ADR-0051).
    path === '/menu-next' ||
    path === '/main-menu' ||
    path === '/skirmish' ||
    path === '/campaign' ||
    path.startsWith('/campaign/') ||
    path === '/campaigns-next' ||
    path === '/campaigns' ||
    path === '/lobbies' ||
    path.startsWith('/lobbies/') ||
    path === '/party' ||
    path === '/settings' ||
    path.startsWith('/settings/')
  ) {
    return 'light-art';
  }

  return 'light-plain';
}

export function isHeavyRoute(pathname: string): boolean {
  const surface = routeSurface(pathname);
  return surface === 'heavy-board' || surface === 'heavy-editor';
}

export function isBoardArtRoute(pathname: string): boolean {
  return routeSurface(pathname) === 'heavy-board';
}

export function isLightArtRoute(pathname: string): boolean {
  return routeSurface(pathname) === 'light-art';
}

// Which SCREEN a path renders — the light-hop exit dissolve (ADR-0051) only plays when
// this changes. Paths sharing a key resolve to the same component in App's renderRoute
// (kept in sync by hand), so React preserves the instance across the swap and the
// screen handles its own sub-navigation (settings tabs, campaign rail); dissolving the
// chrome for those would blink a screen that never remounts.
export function routeScreenKey(pathname: string): string {
  const path = normalizeRoutePath(pathname);
  if (path === '/campaign' || path.startsWith('/campaign/')) return 'campaign';
  if (path === '/campaigns-next' || path === '/campaigns') return 'campaign-editor';
  if (path === '/lobbies' || path.startsWith('/lobbies/')) return 'lobbies';
  if (path === '/settings' || path.startsWith('/settings/')) return 'settings';
  if (path === '/edit' || path === '/level-editor') return 'level-editor';
  if (path === '/tileset-studio' || path === '/unit-studio' || path === '/nine-slice-editor' || path === '/prop-lab' || path === '/tile-compare' || path === '/surface-lab' || path === '/scene-anim-lab' || path === '/doodad-editor') return 'studio';
  // Each remaining explicit renderRoute entry is its own screen…
  if (
    path === '/play' ||
    path === '/skirmish' ||
    path === '/portrait-editor' ||
    path === '/party' ||
    path === '/artwork-compare'
  ) {
    return path;
  }
  // …and EVERYTHING else — '/', the legacy menu aliases, and any unmatched path — is
  // renderRoute's MainMenu default. Keying them all 'menu' mirrors that fallback, so a
  // hop between two menu-rendering paths can never dissolve a screen that then never
  // remounts (the pop-without-entrance the same-key guard exists to prevent).
  return 'menu';
}
