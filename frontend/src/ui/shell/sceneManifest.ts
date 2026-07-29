import { normalizeRoutePath } from '../navigation';
import { isPlaySelectorPath } from '../playHubRoute';

export type SceneBackground = 'homepage' | 'battlefield' | 'tool';
export type ScenePaintOwner =
  | 'dom'
  | 'play-selector'
  | 'gameplay-hud'
  | 'campaign-editor'
  | 'level-editor'
  | 'studio'
  | 'predrawn-reference'
  | 'portrait-editor'
  | 'lobbies';

export interface SceneManifest {
  id: string;
  /** Stable visual host retained across destinations that occupy one shell. */
  host: 'menu-shell' | 'standalone';
  background: SceneBackground;
  paintOwner: ScenePaintOwner;
  critical: readonly string[];
  opportunistic: readonly string[];
}

const manifest = (
  id: string,
  background: SceneBackground,
  paintOwner: ScenePaintOwner,
  critical: readonly string[],
  opportunistic: readonly string[] = [],
  host: SceneManifest['host'] = 'standalone',
): SceneManifest => ({ id, host, background, paintOwner, critical, opportunistic });

/**
 * Required scene declaration for every route family rendered by App.
 *
 * These names describe visual obligations, not media identities. Dynamic screens
 * expand them into concrete resources through SceneBoundary participants.
 */
export function sceneManifest(pathname: string): SceneManifest {
  const path = normalizeRoutePath(pathname);

  if (path === '/play') {
    return manifest('gameplay', 'battlefield', 'gameplay-hud', [
      'battlefield-background',
      'level-snapshot',
      'board-compositors',
      'visible-units-and-overlays',
      'gameplay-hud',
      'title-controls',
    ]);
  }
  if (isPlaySelectorPath(path)) {
    return manifest(`play-selector:${path}`, 'homepage', 'play-selector', [
      'homepage-background',
      'title-bar',
      'selector-chrome',
      'visible-level-thumbnails',
    ], ['below-fold-level-thumbnails'], 'menu-shell');
  }
  if (path === '/editor/level' || path === '/edit' || path === '/level-editor') {
    return manifest('level-editor', 'homepage', 'level-editor', [
      'homepage-background',
      'title-bar',
      'document',
      'board-compositors',
      'visible-editor-chrome',
      'visible-palette-slice',
    ], ['below-fold-palette']);
  }
  if (path === '/editor' || path === '/campaigns' || path === '/campaigns-next') {
    return manifest('campaign-editor', 'homepage', 'campaign-editor', [
      'homepage-background',
      'title-bar',
      'campaign-workspace',
      'visible-draft-cards',
    ], ['below-fold-draft-cards'], 'menu-shell');
  }
  if (
    path.startsWith('/studio') || path === '/tileset-studio' || path === '/unit-studio'
    || path === '/nine-slice-editor' || path === '/prop-lab' || path === '/tile-compare'
    || path === '/surface-lab' || path === '/scene-anim-lab' || path === '/doodad-editor'
    || path === '/artwork-compare'
  ) {
    return manifest(`studio:${path}`, 'tool', 'studio', [
      'studio-chrome',
      'selected-viewer',
      'visible-catalog-slice',
    ], ['below-fold-catalog']);
  }
  if (path === '/' || path === '/menu-next' || path === '/main-menu') {
    return manifest('main-menu', 'homepage', 'dom', [
      'homepage-background',
      'title-bar',
      'main-menu-controls',
    ], [], 'menu-shell');
  }
  if (
    path === '/settings' || path.startsWith('/settings/')
    || path === '/party'
  ) {
    return manifest(path.split('/').filter(Boolean)[0] || 'main-menu', 'homepage', 'dom', [
      'homepage-background',
      'title-bar',
      'visible-controls',
    ], [], 'menu-shell');
  }
  if (path === '/lobbies' || path.startsWith('/lobbies/')) {
    return manifest('lobbies', 'homepage', 'lobbies', [
      'homepage-background',
      'title-bar',
      'lobby-identity',
      'initial-lobby-list',
      'visible-controls',
    ], [], 'menu-shell');
  }
  if (path === '/predrawn-reference') {
    return manifest('predrawn-reference', 'tool', 'predrawn-reference', ['tool-chrome', 'selected-artwork']);
  }
  if (path === '/portrait-editor') {
    return manifest('portrait-editor', 'tool', 'portrait-editor', ['tool-chrome', 'selected-artwork']);
  }

  // App renders MainMenu for unmatched routes. This explicit declaration mirrors
  // that fallback so no navigable path escapes the scene system by omission.
  return manifest('main-menu', 'homepage', 'dom', [
    'homepage-background',
    'title-bar',
    'main-menu-controls',
  ], [], 'menu-shell');
}
