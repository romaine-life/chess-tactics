import { enchiridionSectionFromPath, enchiridionSectionPath } from '../enchiridionRoute';
import { normalizeRoutePath } from '../navigation';
import { isPlaySelectorPath, playHubSectionPath, playHubSelection } from '../playHubRoute';
import type { RunDocument, RunPhase } from '../../run/model';

export type SceneBackground = 'homepage' | 'battlefield' | 'tool';
export type SceneHost = 'menu-shell' | 'play-shell' | 'run-detail' | 'settings-shell' | 'editor-shell' | 'enchiridion-shell' | 'gameplay-shell' | 'standalone';
export type SceneSlotId = 'root' | 'menu-destination' | 'play-content' | 'run-detail-content' | 'settings-content' | 'editor-content' | 'enchiridion-content' | 'gameplay-content' | 'run-phase' | 'run-workspace';
export type SceneViewId =
  | 'main-menu'
  | 'play'
  | 'play-continue'
  | 'play-skirmish'
  | 'play-run'
  | 'play-run-current'
  | 'play-run-new'
  | 'play-levels'
  | 'play-campaign'
  | 'gameplay'
  | 'run'
  | 'run-phase'
  | 'run-workspace'
  | 'campaign-editor'
  | 'editor-campaign'
  | 'editor-wars'
  | 'editor-skirmish-profiles'
  | 'editor-unassigned'
  | 'level-editor'
  | 'settings'
  | 'settings-general'
  | 'settings-audio'
  | 'settings-tracks'
  | 'settings-gameplay'
  | 'settings-creator-tools'
  | 'settings-admin'
  | 'enchiridion'
  | 'enchiridion-units'
  | 'enchiridion-terrain'
  | 'enchiridion-cards'
  | 'enchiridion-card-types'
  | 'enchiridion-relics'
  | 'enchiridion-abilities'
  | 'strategikon'
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
export type SceneWaitPresentation = 'loading' | 'transition-only';

export interface SceneManifest {
  id: string;
  /** Stable visual host retained across destinations that occupy one shell. */
  host: SceneHost;
  background: SceneBackground;
  paintOwner: ScenePaintOwner;
  critical: readonly string[];
  opportunistic: readonly string[];
  /** Whether unresolved preparation needs explicit Loading copy or only transition choreography. */
  waitPresentation: SceneWaitPresentation;
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
  snapshot: SceneSnapshot;
}

export type RunScenePhase = 'hydrating' | 'no-active' | RunPhase;
export type RunSceneWorkspace = 'primary' | 'army' | 'relics' | 'sell' | 'strategikon';

export interface RunSceneSnapshot {
  kind: 'run';
  hydrated: boolean;
  run: RunDocument | null;
  phase: RunScenePhase;
  workspace: RunSceneWorkspace;
}

export type SceneSnapshot = RunSceneSnapshot | { kind: 'route' };

export interface SceneSources {
  run?: {
    hydrated: boolean;
    document: RunDocument | null;
  };
}

export const defineScene = (definition: SceneDefinition): SceneDefinition =>
  Object.freeze({ ...definition });

export const SCENE_DEFINITIONS = Object.freeze({
  mainMenu: defineScene({ id: 'main-menu', parent: null, slot: 'root', view: 'main-menu' }),
  play: defineScene({ id: 'play', parent: 'main-menu', slot: 'menu-destination', view: 'play' }),
  playContinue: defineScene({ id: 'play/continue', parent: 'play', slot: 'play-content', view: 'play-continue' }),
  playSkirmish: defineScene({ id: 'play/skirmish', parent: 'play', slot: 'play-content', view: 'play-skirmish' }),
  playRun: defineScene({ id: 'play/run', parent: 'play', slot: 'play-content', view: 'play-run' }),
  playRunCurrent: defineScene({ id: 'play/run/current', parent: 'play/run', slot: 'run-detail-content', view: 'play-run-current' }),
  playRunNew: defineScene({ id: 'play/run/new', parent: 'play/run', slot: 'run-detail-content', view: 'play-run-new' }),
  playLevels: defineScene({ id: 'play/levels', parent: 'play', slot: 'play-content', view: 'play-levels' }),
  playCampaign: defineScene({ id: 'play/campaign', parent: 'play', slot: 'play-content', view: 'play-campaign' }),
  gameplay: defineScene({ id: 'gameplay', parent: null, slot: 'root', view: 'gameplay' }),
  run: defineScene({ id: 'run', parent: null, slot: 'root', view: 'run' }),
  runPhase: defineScene({ id: 'run/phase', parent: 'run', slot: 'run-phase', view: 'run-phase' }),
  runWorkspace: defineScene({ id: 'run/workspace', parent: 'run/phase', slot: 'run-workspace', view: 'run-workspace' }),
  campaignEditor: defineScene({ id: 'campaign-editor', parent: 'main-menu', slot: 'menu-destination', view: 'campaign-editor' }),
  editorCampaign: defineScene({ id: 'campaign-editor/campaign', parent: 'campaign-editor', slot: 'editor-content', view: 'editor-campaign' }),
  editorWars: defineScene({ id: 'campaign-editor/wars', parent: 'campaign-editor', slot: 'editor-content', view: 'editor-wars' }),
  editorSkirmishProfiles: defineScene({ id: 'campaign-editor/skirmish-profiles', parent: 'campaign-editor', slot: 'editor-content', view: 'editor-skirmish-profiles' }),
  editorUnassigned: defineScene({ id: 'campaign-editor/unassigned', parent: 'campaign-editor', slot: 'editor-content', view: 'editor-unassigned' }),
  levelEditor: defineScene({ id: 'level-editor', parent: null, slot: 'root', view: 'level-editor' }),
  settings: defineScene({ id: 'settings', parent: 'main-menu', slot: 'menu-destination', view: 'settings' }),
  settingsGeneral: defineScene({ id: 'settings/general', parent: 'settings', slot: 'settings-content', view: 'settings-general' }),
  settingsAudio: defineScene({ id: 'settings/audio', parent: 'settings', slot: 'settings-content', view: 'settings-audio' }),
  settingsTracks: defineScene({ id: 'settings/audio/tracks', parent: 'settings', slot: 'settings-content', view: 'settings-tracks' }),
  settingsGameplay: defineScene({ id: 'settings/gameplay', parent: 'settings', slot: 'settings-content', view: 'settings-gameplay' }),
  settingsCreatorTools: defineScene({ id: 'settings/creator-tools', parent: 'settings', slot: 'settings-content', view: 'settings-creator-tools' }),
  settingsAdmin: defineScene({ id: 'settings/admin', parent: 'settings', slot: 'settings-content', view: 'settings-admin' }),
  enchiridion: defineScene({ id: 'enchiridion', parent: 'main-menu', slot: 'menu-destination', view: 'enchiridion' }),
  enchiridionUnits: defineScene({ id: 'enchiridion/units', parent: 'enchiridion', slot: 'enchiridion-content', view: 'enchiridion-units' }),
  enchiridionTerrain: defineScene({ id: 'enchiridion/terrain', parent: 'enchiridion', slot: 'enchiridion-content', view: 'enchiridion-terrain' }),
  enchiridionCards: defineScene({ id: 'enchiridion/cards', parent: 'enchiridion', slot: 'enchiridion-content', view: 'enchiridion-cards' }),
  enchiridionCardTypes: defineScene({ id: 'enchiridion/card-types', parent: 'enchiridion', slot: 'enchiridion-content', view: 'enchiridion-card-types' }),
  enchiridionRelics: defineScene({ id: 'enchiridion/relics', parent: 'enchiridion', slot: 'enchiridion-content', view: 'enchiridion-relics' }),
  enchiridionAbilities: defineScene({ id: 'enchiridion/abilities', parent: 'enchiridion', slot: 'enchiridion-content', view: 'enchiridion-abilities' }),
  gameplayStrategikon: defineScene({ id: 'gameplay/strategikon', parent: 'gameplay', slot: 'gameplay-content', view: 'strategikon' }),
  runStrategikon: defineScene({ id: 'run/strategikon', parent: 'run', slot: 'gameplay-content', view: 'strategikon' }),
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
  waitPresentation: SceneWaitPresentation = 'loading',
): SceneManifest => ({
  id,
  host,
  background,
  paintOwner,
  critical,
  opportunistic,
  waitPresentation,
});

/**
 * Required scene declaration for every route family rendered by App.
 *
 * These names describe visual obligations, not media identities. Dynamic screens
 * expand them into concrete resources through SceneBoundary participants.
 */
type EditorSceneRoute = {
  kind: 'campaign' | 'wars' | 'skirmish-profiles' | 'unassigned';
  campaignId?: string;
};

function editorSceneRoute(pathname: string, search: string): EditorSceneRoute {
  if (normalizeRoutePath(pathname) === '/editor/wars') return { kind: 'wars' };
  const params = new URLSearchParams(search);
  const collection = params.get('collection');
  if (collection === 'skirmish-profiles' || collection === 'unassigned') return { kind: collection };
  const campaignId = params.get('campaign')?.trim();
  return campaignId ? { kind: 'campaign', campaignId } : { kind: 'campaign' };
}

function leafSceneManifest(
  pathname: string,
  search: string = '',
  runSnapshot: RunSceneSnapshot | null = null,
): SceneManifest {
  const path = normalizeRoutePath(pathname);

  if (path === '/play' || path.startsWith('/play/strategikon/')) {
    return manifest(path === '/play' ? 'gameplay' : `gameplay:${path}`, 'battlefield', 'gameplay-hud', [
      'battlefield-background',
      'level-snapshot',
      'board-compositors',
      'visible-units-and-overlays',
      'gameplay-hud',
      'title-controls',
    ], [], 'gameplay-shell', 'transition-only');
  }
  if (path === '/run' || path.startsWith('/run/strategikon/')) {
    const runPhaseIdentity = runSnapshot?.phase === 'deployment' || runSnapshot?.phase === 'battle'
      ? `battlefield-${runSnapshot.run?.battleIndex ?? 0}`
      : runSnapshot?.phase ?? 'hydrating';
    const runIdentity = runSnapshot
      ? `${runSnapshot.run?.id ?? 'none'}:${runPhaseIdentity}:${runSnapshot.workspace}`
      : 'hydrating:primary';
    return manifest(`run:${runIdentity}`, 'battlefield', 'gameplay-hud', [
      'battlefield-background',
      'active-run',
      'run-chrome',
      'visible-relics',
    ], [], 'gameplay-shell', 'transition-only');
  }
  // The manifest id is the RESOLVED SECTION address, not the raw path (the
  // enchiridion precedent below): the hub root, the agnostic Continue address, its
  // choices, and malformed selector paths all present one committed Continue scene,
  // so PlayMenu's ADR-0260 address canonicalization retargets the in-flight
  // preparation in place — never a second exit of the scene the player just left.
  if (isPlaySelectorPath(path)) {
    return manifest(`play-selector:${playHubSectionPath(path)}`, 'homepage', 'play-selector', [
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
  if (path === '/editor' || path === '/editor/wars' || path === '/campaigns' || path === '/campaigns-next') {
    const editorRoute = editorSceneRoute(path, search);
    return manifest(`campaign-editor:${editorRoute.kind}${editorRoute.campaignId ? `:${editorRoute.campaignId}` : ''}`, 'homepage', 'campaign-editor', [
      'homepage-background',
      'title-bar',
      'campaign-workspace',
      'visible-draft-cards',
    ], ['below-fold-draft-cards'], 'editor-shell', 'transition-only');
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
    // The manifest id is the RESOLVED SECTION address (enchiridion precedent): the
    // bare /settings root and unknown subpaths render the General section, so they
    // share its identity — an address-only difference must never re-run the scene
    // lifecycle for the same committed section. Keep this mapping aligned with the
    // instance selection below; the identity invariant test enforces the pairing.
    const settingsSectionPath = path === '/party'
      ? '/party'
      : path === '/settings/audio'
        ? '/settings/audio'
        : path === '/settings/audio/tracks'
          ? '/settings/audio/tracks'
          : path === '/settings/gameplay'
            ? '/settings/gameplay'
            : path === '/settings/creator-tools'
              ? '/settings/creator-tools'
              : path === '/settings/admin'
                ? '/settings/admin'
                : '/settings/general';
    return manifest(`settings:${settingsSectionPath}`, 'homepage', 'dom', [
      'homepage-background',
      'title-bar',
      'visible-controls',
    ], [], 'settings-shell', path === '/settings/audio/tracks' ? 'loading' : 'transition-only');
  }
  // The manifest id is the RESOLVED SECTION route, not the raw path: deeper addresses
  // (one relic today, ADR-0256) and the bare/unknown fallbacks that already render the
  // units view all share their section's id, so navigating between them is an
  // address-only update inside one committed scene — never a veil per relic selection.
  if (path === '/enchiridion' || path.startsWith('/enchiridion/')) {
    return manifest(`enchiridion:${enchiridionSectionPath(path)}`, 'homepage', 'dom', [
      'homepage-background',
      'title-bar',
      'visible-controls',
      'visible-reference-art',
    ], [], 'enchiridion-shell', 'transition-only');
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

function runSceneSnapshot(
  pathname: string,
  search: string,
  source: SceneSources['run'],
): RunSceneSnapshot {
  const path = normalizeRoutePath(pathname);
  const phase: RunScenePhase = !source?.hydrated
    ? 'hydrating'
    : source.document?.phase ?? 'no-active';
  const requestedView = new URLSearchParams(search).get('view');
  const requestedWorkspace: RunSceneWorkspace = path.startsWith('/run/strategikon/')
    ? 'strategikon'
    : requestedView === 'army' || requestedView === 'relics' || requestedView === 'sell'
      ? requestedView
      : 'primary';
  const workspace = requestedWorkspace === 'sell' && phase !== 'shop'
    ? 'primary'
    : requestedWorkspace;
  return Object.freeze({
    kind: 'run',
    hydrated: source?.hydrated ?? false,
    run: source?.document ?? null,
    phase,
    workspace,
  });
}

/**
 * Resolve browser intent into an authored scene path. The director commits and
 * prepares these objects; route strings are inputs, never visible-scene authority.
 */
export function sceneManifest(
  pathname: string,
  search: string = '',
  sources: SceneSources = {},
): ScenePath {
  const path = normalizeRoutePath(pathname);
  const runSnapshot = path === '/run' || path.startsWith('/run/strategikon/')
    ? runSceneSnapshot(path, search, sources.run)
    : null;
  const manifest = leafSceneManifest(path, search, runSnapshot);
  const root = instance(SCENE_DEFINITIONS.mainMenu);
  let instances: readonly SceneInstance[];

  if (path === '/play' || path.startsWith('/play/strategikon/')) {
    instances = path === '/play'
      ? [instance(SCENE_DEFINITIONS.gameplay)]
      : [instance(SCENE_DEFINITIONS.gameplay), instance(SCENE_DEFINITIONS.gameplayStrategikon, { path })];
  } else if (path === '/run' || path.startsWith('/run/strategikon/')) {
    const snapshot = runSnapshot!;
    const phase = snapshot.phase === 'deployment' || snapshot.phase === 'battle'
      ? 'battlefield'
      : snapshot.phase;
    const phaseIdentity = snapshot.run
      ? `${snapshot.run.id}:${phase}:${snapshot.run.battleIndex}`
      : phase;
    instances = [
      instance(SCENE_DEFINITIONS.run),
      instance(SCENE_DEFINITIONS.runPhase, { phase: phaseIdentity }),
      instance(SCENE_DEFINITIONS.runWorkspace, { phase: phaseIdentity, workspace: snapshot.workspace }),
    ];
  } else if (isPlaySelectorPath(path)) {
    const selection = playHubSelection(path);
    // The installed root and malformed selector paths both resolve through the
    // complete Continue scene while PlayMenu canonicalizes their addresses.
    const selectedInstance = selection?.mode === 'levels'
      ? instance(SCENE_DEFINITIONS.playLevels)
      : selection?.mode === 'run'
        ? instance(SCENE_DEFINITIONS.playRun)
      : selection?.mode === 'campaign'
        ? instance(SCENE_DEFINITIONS.playCampaign, { campaignId: selection.campaignId })
      : selection?.mode === 'skirmish'
        ? instance(SCENE_DEFINITIONS.playSkirmish)
        : instance(SCENE_DEFINITIONS.playContinue);
    const runDetailInstance = selection?.mode === 'run'
      ? selection.choice === 'current'
        ? instance(SCENE_DEFINITIONS.playRunCurrent)
        : selection.choice === 'new'
          ? instance(SCENE_DEFINITIONS.playRunNew)
          : null
      : null;
    instances = runDetailInstance
      ? [root, instance(SCENE_DEFINITIONS.play), selectedInstance, runDetailInstance]
      : [root, instance(SCENE_DEFINITIONS.play), selectedInstance];
  } else if (path === '/editor' || path === '/editor/wars' || path === '/campaigns' || path === '/campaigns-next') {
    const editorRoute = editorSceneRoute(path, search);
    const child = editorRoute.kind === 'wars'
      ? instance(SCENE_DEFINITIONS.editorWars)
      : editorRoute.kind === 'skirmish-profiles'
        ? instance(SCENE_DEFINITIONS.editorSkirmishProfiles)
        : editorRoute.kind === 'unassigned'
          ? instance(SCENE_DEFINITIONS.editorUnassigned)
          : instance(SCENE_DEFINITIONS.editorCampaign, editorRoute.campaignId ? { campaignId: editorRoute.campaignId } : {});
    instances = [root, instance(SCENE_DEFINITIONS.campaignEditor), child];
  } else if (path === '/editor/level' || path === '/edit' || path === '/level-editor') {
    instances = [instance(SCENE_DEFINITIONS.levelEditor)];
  } else if (path === '/settings' || path.startsWith('/settings/')) {
    const settingsSection = path === '/settings/audio'
      ? SCENE_DEFINITIONS.settingsAudio
      : path === '/settings/audio/tracks'
        ? SCENE_DEFINITIONS.settingsTracks
        : path === '/settings/gameplay'
          ? SCENE_DEFINITIONS.settingsGameplay
        : path === '/settings/creator-tools'
          ? SCENE_DEFINITIONS.settingsCreatorTools
          : path === '/settings/admin'
            ? SCENE_DEFINITIONS.settingsAdmin
          : SCENE_DEFINITIONS.settingsGeneral;
    instances = [root, instance(SCENE_DEFINITIONS.settings), instance(settingsSection)];
  } else if (path === '/enchiridion' || path.startsWith('/enchiridion/')) {
    // Instances carry no relic param on purpose: a relic address is the same retained
    // relic-reference scene (stable leaf key), so relic selection never re-keys the slot.
    const sectionId = enchiridionSectionFromPath(path);
    const section = sectionId === 'terrain'
      ? SCENE_DEFINITIONS.enchiridionTerrain
      : sectionId === 'cards'
        ? SCENE_DEFINITIONS.enchiridionCards
        : sectionId === 'card-types'
          ? SCENE_DEFINITIONS.enchiridionCardTypes
          : sectionId === 'relics'
            ? SCENE_DEFINITIONS.enchiridionRelics
            : sectionId === 'abilities'
              ? SCENE_DEFINITIONS.enchiridionAbilities
              : SCENE_DEFINITIONS.enchiridionUnits;
    instances = [root, instance(SCENE_DEFINITIONS.enchiridion), instance(section)];
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
    snapshot: runSnapshot ?? Object.freeze({ kind: 'route' as const }),
  });
}

const HOST_REGION_BY_DEFINITION: Readonly<Partial<Record<string, SceneHost>>> = Object.freeze({
  'main-menu': 'menu-shell',
  play: 'play-shell',
  'play/run': 'run-detail',
  settings: 'settings-shell',
  'campaign-editor': 'editor-shell',
  enchiridion: 'enchiridion-shell',
  gameplay: 'gameplay-shell',
  run: 'gameplay-shell',
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

const DESTINATION_SLOT_BY_REGION: Readonly<Partial<Record<SceneHost, SceneSlotId>>> = Object.freeze({
  'menu-shell': 'menu-destination',
  'play-shell': 'play-content',
  'run-detail': 'run-detail-content',
  'settings-shell': 'settings-content',
  'editor-shell': 'editor-content',
  'enchiridion-shell': 'enchiridion-content',
  'gameplay-shell': 'gameplay-content',
});

/**
 * React mount identity for a rendered scene layer.
 *
 * A leaf in a nested detail slot (the Play Run choice detail) refines scene identity
 * and drives its region's transition choreography, but the retained shell around that
 * slot — the Run action column and its painted-surface state — must stay mounted
 * while only the detail changes. Keying the layer by the deepest non-detail instance
 * keeps one React tree across `run ↔ run/current ↔ run/new`, so selecting a choice
 * never unmounts, blanks, and re-reveals the stable sibling column. The state-driven
 * Run phase/workspace slots stay leaf-keyed on purpose. Deployment and its Battle are
 * one continuous battlefield phase and therefore deliberately resolve to the same leaf key;
 * other Run phase changes still receive distinct keys and complete-scene transitions.
 */
const NESTED_DETAIL_SLOTS: ReadonlySet<SceneSlotId> = new Set(['run-detail-content']);

export function sceneLayerKey(scene: ScenePath): string {
  for (let index = scene.instances.length - 1; index >= 0; index -= 1) {
    const entry = scene.instances[index];
    if (!NESTED_DETAIL_SLOTS.has(entry.definition.slot)) return entry.key;
  }
  return scene.leaf.key;
}

/** True when a retained host is transitioning from its empty child slot into content. */
export function isEmptySlotOrigin(
  current: ScenePath,
  destination: ScenePath,
): boolean {
  const region = deepestSharedSceneRegion(current, destination);
  if (!region) return false;
  const slot = DESTINATION_SLOT_BY_REGION[region];
  return Boolean(slot)
    && !current.instances.some((entry) => entry.definition.slot === slot)
    && destination.instances.some((entry) => entry.definition.slot === slot);
}

/** True when a retained host is transitioning by removing its current child slot. */
export function isEmptySlotDestination(
  current: ScenePath,
  destination: ScenePath,
): boolean {
  const region = deepestSharedSceneRegion(current, destination);
  if (!region) return false;
  const slot = DESTINATION_SLOT_BY_REGION[region];
  return Boolean(slot)
    && current.instances.some((entry) => entry.definition.slot === slot)
    && !destination.instances.some((entry) => entry.definition.slot === slot);
}
