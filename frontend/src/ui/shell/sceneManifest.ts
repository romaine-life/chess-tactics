import { normalizeRoutePath } from '../navigation';
import { isPlaySelectorPath, playHubSelection } from '../playHubRoute';

export type SceneBackground = 'homepage' | 'battlefield' | 'tool';
export type SceneHost = 'menu-shell' | 'play-shell' | 'standalone';
export type SceneSlotId = 'root' | 'menu-destination' | 'play-content';
export type SceneViewId =
  | 'main-menu'
  | 'play'
  | 'play-skirmish'
  | 'play-levels'
  | 'play-campaign'
  | 'gameplay'
  | 'campaign-editor'
  | 'level-editor'
  | 'settings'
  | 'lobbies'
  | 'studio'
  | 'predrawn-reference'
  | 'portrait-editor'
  | 'party';
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
  host: SceneHost;
  background: SceneBackground;
  paintOwner: ScenePaintOwner;
  critical: readonly string[];
  opportunistic: readonly string[];
}

export interface SceneDefinition {
  id: string;
  parent: string | null;
  slot: SceneSlotId;
  view: SceneViewId;
}

export interface SceneInstance {
  key: string;
  definition: SceneDefinition;
  params: Readonly<Record<string, string>>;
}

export interface ScenePath extends SceneManifest {
  pathname: string;
  instances: readonly SceneInstance[];
  leaf: SceneInstance;
}

export const defineScene = (definition: SceneDefinition): SceneDefinition =>
  Object.freeze({ ...definition });

export const SCENE_DEFINITIONS = Object.freeze({
  mainMenu: defineScene({ id: 'main-menu', parent: null, slot: 'root', view: 'main-menu' }),
  play: defineScene({ id: 'play', parent: 'main-menu', slot: 'menu-destination', view: 'play' }),
  playSkirmish: defineScene({ id: 'play/skirmish', parent: 'play', slot: 'play-content', view: 'play-skirmish' }),
  playLevels: defineScene({ id: 'play/levels', parent: 'play', slot: 'play-content', view: 'play-levels' }),
  playCampaign: defineScene({ id: 'play/campaign', parent: 'play', slot: 'play-content', view: 'play-campaign' }),
  gameplay: defineScene({ id: 'gameplay', parent: null, slot: 'root', view: 'gameplay' }),
  campaignEditor: defineScene({ id: 'campaign-editor', parent: 'main-menu', slot: 'menu-destination', view: 'campaign-editor' }),
  levelEditor: defineScene({ id: 'level-editor', parent: null, slot: 'root', view: 'level-editor' }),
  settings: defineScene({ id: 'settings', parent: 'main-menu', slot: 'menu-destination', view: 'settings' }),
  lobbies: defineScene({ id: 'lobbies', parent: 'main-menu', slot: 'menu-destination', view: 'lobbies' }),
  studio: defineScene({ id: 'studio', parent: null, slot: 'root', view: 'studio' }),
  predrawnReference: defineScene({ id: 'predrawn-reference', parent: null, slot: 'root', view: 'predrawn-reference' }),
  portraitEditor: defineScene({ id: 'portrait-editor', parent: null, slot: 'root', view: 'portrait-editor' }),
  party: defineScene({ id: 'party', parent: 'main-menu', slot: 'menu-destination', view: 'party' }),
});

const manifest = (
  id: string,
  background: SceneBackground,
  paintOwner: ScenePaintOwner,
  critical: readonly string[],
  opportunistic: readonly string[] = [],
  host: SceneHost = 'standalone',
): SceneManifest => ({ id, host, background, paintOwner, critical, opportunistic });

/**
 * Required scene declaration for every route family rendered by App.
 *
 * These names describe visual obligations, not media identities. Dynamic screens
 * expand them into concrete resources through SceneBoundary participants.
 */
function leafSceneManifest(pathname: string): SceneManifest {
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
    ], ['below-fold-level-thumbnails'], 'play-shell');
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

const instance = (
  definition: SceneDefinition,
  params: Readonly<Record<string, string>> = {},
): SceneInstance => Object.freeze({
  key: Object.keys(params).length
    ? `${definition.id}:${Object.entries(params).map(([key, value]) => `${key}=${value}`).join('&')}`
    : definition.id,
  definition,
  params: Object.freeze({ ...params }),
});

/**
 * Resolve browser intent into an authored scene path. The director commits and
 * prepares these objects; route strings are inputs, never visible-scene authority.
 */
export function sceneManifest(pathname: string): ScenePath {
  const path = normalizeRoutePath(pathname);
  const manifest = leafSceneManifest(path);
  const root = instance(SCENE_DEFINITIONS.mainMenu);
  let instances: readonly SceneInstance[];

  if (path === '/play') {
    instances = [instance(SCENE_DEFINITIONS.gameplay)];
  } else if (isPlaySelectorPath(path)) {
    const selection = playHubSelection(path);
    const selectedInstance = selection?.mode === 'levels'
      ? instance(SCENE_DEFINITIONS.playLevels)
      : selection?.mode === 'campaign'
        ? instance(SCENE_DEFINITIONS.playCampaign, { campaignId: selection.campaignId })
        : instance(SCENE_DEFINITIONS.playSkirmish);
    instances = [root, instance(SCENE_DEFINITIONS.play), selectedInstance];
  } else if (path === '/editor' || path === '/campaigns' || path === '/campaigns-next') {
    instances = [root, instance(SCENE_DEFINITIONS.campaignEditor)];
  } else if (path === '/editor/level' || path === '/edit' || path === '/level-editor') {
    instances = [instance(SCENE_DEFINITIONS.levelEditor)];
  } else if (path === '/settings' || path.startsWith('/settings/')) {
    instances = [root, instance(SCENE_DEFINITIONS.settings)];
  } else if (path === '/lobbies' || path.startsWith('/lobbies/')) {
    instances = [root, instance(SCENE_DEFINITIONS.lobbies)];
  } else if (path === '/party') {
    instances = [root, instance(SCENE_DEFINITIONS.party)];
  } else if (path === '/predrawn-reference') {
    instances = [instance(SCENE_DEFINITIONS.predrawnReference)];
  } else if (path === '/portrait-editor') {
    instances = [instance(SCENE_DEFINITIONS.portraitEditor)];
  } else if (manifest.paintOwner === 'studio') {
    instances = [instance(SCENE_DEFINITIONS.studio, { path })];
  } else {
    instances = [root];
  }
  return Object.freeze({
    ...manifest,
    pathname: path,
    instances,
    leaf: instances[instances.length - 1],
  });
}

const HOST_REGION_BY_DEFINITION: Readonly<Partial<Record<string, SceneHost>>> = Object.freeze({
  'main-menu': 'menu-shell',
  play: 'play-shell',
});

/** Find the deepest retained destination region from authored instance ancestry. */
export function deepestSharedSceneRegion(
  current: ScenePath,
  destination: ScenePath,
): SceneHost | null {
  let shared: SceneHost | null = null;
  const length = Math.min(current.instances.length, destination.instances.length);
  for (let index = 0; index < length; index += 1) {
    const currentInstance = current.instances[index];
    const destinationInstance = destination.instances[index];
    if (currentInstance.key !== destinationInstance.key) break;
    shared = HOST_REGION_BY_DEFINITION[currentInstance.definition.id] ?? shared;
  }
  return shared;
}
