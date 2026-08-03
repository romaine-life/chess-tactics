import type { RunDocument, RunPhase } from '../../run/model';

/**
 * The authored scene vocabulary.
 *
 * Split out of `sceneManifest` so the sectioned-shell registry can declare scene
 * definitions without importing the resolver that consumes it. `sceneManifest`
 * re-exports everything here, so existing importers are unaffected.
 */

export type SceneBackground = 'homepage' | 'battlefield' | 'tool';
export type SceneHost =
  | 'menu-shell'
  | 'play-shell'
  | 'run-detail'
  | 'settings-shell'
  | 'editor-shell'
  | 'enchiridion-shell'
  | 'gameplay-shell'
  | 'strategikon-shell'
  | 'strategikon-reference-shell'
  | 'standalone';
export type SceneSlotId =
  | 'root'
  | 'menu-destination'
  | 'play-content'
  | 'run-detail-content'
  | 'settings-content'
  | 'editor-content'
  | 'enchiridion-content'
  | 'gameplay-content'
  | 'strategikon-content'
  | 'strategikon-reference-content'
  | 'run-phase'
  | 'run-workspace';
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
  | 'enchiridion-ataraxia'
  | 'strategikon'
  | 'strategikon-enchiridion'
  | 'strategikon-prosopography'
  | 'strategikon-lipsanotheca'
  | 'strategikon-reference'
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
  enchiridionAtaraxia: defineScene({ id: 'enchiridion/ataraxia', parent: 'enchiridion', slot: 'enchiridion-content', view: 'enchiridion-ataraxia' }),
  // The Strategikon is one authored shell mounted under two ancestries (Battle's
  // `gameplay` root and the Run's `run/workspace` slot). Its sections are authored
  // scenes in their own slot, so a section change is a director transition on both
  // hosts — the ADR-0307 rule the earlier per-host pathname keys bypassed.
  strategikon: defineScene({ id: 'strategikon', parent: null, slot: 'gameplay-content', view: 'strategikon' }),
  strategikonEnchiridion: defineScene({ id: 'strategikon/enchiridion', parent: 'strategikon', slot: 'strategikon-content', view: 'strategikon-enchiridion' }),
  strategikonProsopography: defineScene({ id: 'strategikon/prosopography', parent: 'strategikon', slot: 'strategikon-content', view: 'strategikon-prosopography' }),
  strategikonLipsanotheca: defineScene({ id: 'strategikon/lipsanotheca', parent: 'strategikon', slot: 'strategikon-content', view: 'strategikon-lipsanotheca' }),
  strategikonReferenceUnits: defineScene({ id: 'strategikon/enchiridion/units', parent: 'strategikon/enchiridion', slot: 'strategikon-reference-content', view: 'strategikon-reference' }),
  strategikonReferenceTerrain: defineScene({ id: 'strategikon/enchiridion/terrain', parent: 'strategikon/enchiridion', slot: 'strategikon-reference-content', view: 'strategikon-reference' }),
  strategikonReferenceCards: defineScene({ id: 'strategikon/enchiridion/cards', parent: 'strategikon/enchiridion', slot: 'strategikon-reference-content', view: 'strategikon-reference' }),
  strategikonReferenceCardTypes: defineScene({ id: 'strategikon/enchiridion/card-types', parent: 'strategikon/enchiridion', slot: 'strategikon-reference-content', view: 'strategikon-reference' }),
  strategikonReferenceRelics: defineScene({ id: 'strategikon/enchiridion/relics', parent: 'strategikon/enchiridion', slot: 'strategikon-reference-content', view: 'strategikon-reference' }),
  strategikonReferenceAbilities: defineScene({ id: 'strategikon/enchiridion/abilities', parent: 'strategikon/enchiridion', slot: 'strategikon-reference-content', view: 'strategikon-reference' }),
  strategikonReferenceAtaraxia: defineScene({ id: 'strategikon/enchiridion/ataraxia', parent: 'strategikon/enchiridion', slot: 'strategikon-reference-content', view: 'strategikon-reference' }),
  lobbies: defineScene({ id: 'lobbies', parent: 'main-menu', slot: 'menu-destination', view: 'lobbies' }),
  studio: defineScene({ id: 'studio', parent: null, slot: 'root', view: 'studio' }),
  predrawnReference: defineScene({ id: 'predrawn-reference', parent: null, slot: 'root', view: 'predrawn-reference' }),
  portraitEditor: defineScene({ id: 'portrait-editor', parent: null, slot: 'root', view: 'portrait-editor' }),
  party: defineScene({ id: 'party', parent: 'main-menu', slot: 'menu-destination', view: 'party' }),
});

export const sceneInstance = (
  definition: SceneDefinition,
  params: Readonly<Record<string, string>> = {},
): SceneInstance => Object.freeze({
  key: Object.keys(params).length
    ? `${definition.id}:${Object.entries(params).map(([key, value]) => `${key}=${value}`).join('&')}`
    : definition.id,
  definition,
  params: Object.freeze({ ...params }),
});

export const sceneManifestFields = (
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
