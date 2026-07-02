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
