import {
  SCENE_DEFINITIONS,
  sceneInstance,
  type SceneDefinition,
  type SceneHost,
  type SceneInstance,
  type SceneManifest,
  type SceneSlotId,
} from './sceneGraph';
import { normalizeRoutePath } from '../navigation';
import { enchiridionSectionFromPath, enchiridionSectionPath } from '../enchiridionRoute';
import { isPlaySelectorPath, playHubSectionPath, playHubSelection } from '../playHubRoute';
import { isStrategikonPath, strategikonAddress, strategikonSectionPath } from '../strategikonRoute';

/**
 * THE sectioned-shell registry.
 *
 * Every screen in this app that presents a rail of sections inside a retained shell
 * — the main menu and its destinations, Settings, the Enchiridion, the Campaign
 * Editor, the Play selector, and the Strategikon — is one entry here.
 *
 * Why this exists: whether a navigation fades is not something a rail control opts
 * into. It is a consequence of scene identity. A section that is absent from the
 * scene key produces an id-equal navigation, so `App` takes its same-scene branch
 * and the director never leaves `is-current` — no exit, no entrance, no fade. Every
 * family used to re-derive that identity by hand in `sceneManifest`, alongside its
 * own slot component and its own entries in two parallel region/slot maps. The
 * Strategikon simply never wrote the mapping: under `/run` all eight of its
 * addresses collapsed onto one workspace value, so its rail swapped instantly, and
 * under `/play` it keyed on the raw pathname with its rail inside the transition
 * target, so the whole panel faded instead of the pane. Two lookalike hand-written
 * mappings for one visual pattern, neither matching the rule (ADR-0207, ADR-0307).
 *
 * A registered entry derives all of it: the manifest id, the authored instance
 * chain, the region and slot maps, and the slot component. `sectionedShells.test.ts`
 * walks this registry and asserts the rule for every section pair, so a rail added
 * later cannot quietly opt out the way this one did.
 *
 * Address grammar stays per-family (it genuinely differs — path segments here,
 * query parameters in the Editor), but each family states it ONCE, in its route
 * module, and the registry is the only consumer that turns it into scene identity.
 */

export interface SectionedShellSectionManifest {
  id?: string;
  host?: SceneHost;
  paintOwner?: SceneManifest['paintOwner'];
  background?: SceneManifest['background'];
  critical?: readonly string[];
  opportunistic?: readonly string[];
  waitPresentation?: SceneManifest['waitPresentation'];
}

export interface SectionedShellSection {
  /** Stable section id, unique within its entry. */
  id: string;
  /** The authored scene this section mounts in the entry's content slot. */
  definition: SceneDefinition;
  /**
   * Manifest overrides for a LEAF section — one that is not itself a registered
   * shell. `id` here is the scene identity for the section (a leaf destination such
   * as Lobbies owns its identity; a section of a deeper shell does not).
   */
  manifest?: SectionedShellSectionManifest;
}

export interface SectionedShellResolution {
  sectionId: string;
  params?: Readonly<Record<string, string>>;
}

export interface SectionedShell {
  /** Registry key. */
  id: string;
  /** The retained shell instance. Its region survives a section change. */
  shell: SceneDefinition;
  /** The director-owned transition region for this shell's replaceable pane. */
  region: SceneHost;
  /** The slot every section of this shell mounts in. */
  contentSlot: SceneSlotId;
  sections: readonly SectionedShellSection[];
  /**
   * Manifest fields shared by every scene that resolves into this shell. A nested
   * entry that presents the same surface as its parent (the Play run-detail shell,
   * the Strategikon's reference rail) omits this and inherits.
   */
  manifest?: Omit<SceneManifest, 'id'>;
  /**
   * Identity prefix for scenes resolving into this shell. An entry without one
   * leaves identity to its enclosing family, whose canonical section address
   * already encodes the nested selection.
   */
  identityPrefix?: string;
  /** The canonical section address — the identity suffix. */
  sectionPath?: (path: string, search: string) => string;
  /** Which section this address selects, or null for the shell's own empty slot. */
  resolve: (path: string, search: string) => SectionedShellResolution | null;
}

const section = (
  id: string,
  definition: SceneDefinition,
  manifest?: SectionedShellSectionManifest,
): SectionedShellSection => Object.freeze({ id, definition, manifest });

// ---------------------------------------------------------------------------
// Main menu — the shell whose sections are the menu destinations.
// ---------------------------------------------------------------------------

const MENU_HOME_CRITICAL = ['homepage-background', 'title-bar', 'main-menu-controls'] as const;
const MENU_DESTINATION_CRITICAL = ['homepage-background', 'title-bar', 'visible-controls'] as const;

const mainMenuShell: SectionedShell = {
  id: 'main-menu',
  shell: SCENE_DEFINITIONS.mainMenu,
  region: 'menu-shell',
  contentSlot: 'menu-destination',
  identityPrefix: 'main-menu',
  manifest: {
    host: 'menu-shell',
    background: 'homepage',
    paintOwner: 'dom',
    critical: MENU_HOME_CRITICAL,
    opportunistic: [],
    waitPresentation: 'loading',
  },
  sections: [
    section('play', SCENE_DEFINITIONS.play),
    section('settings', SCENE_DEFINITIONS.settings),
    section('enchiridion', SCENE_DEFINITIONS.enchiridion),
    section('campaign-editor', SCENE_DEFINITIONS.campaignEditor),
    section('lobbies', SCENE_DEFINITIONS.lobbies, {
      id: 'lobbies',
      paintOwner: 'lobbies',
      critical: [
        'homepage-background',
        'title-bar',
        'lobby-identity',
        'initial-lobby-list',
        'visible-controls',
      ],
    }),
    section('party', SCENE_DEFINITIONS.party, {
      id: 'party',
      critical: MENU_DESTINATION_CRITICAL,
      waitPresentation: 'transition-only',
    }),
  ],
  // No `sectionPath`: the menu shell contributes no identity suffix of its own.
  // Every destination either recurses into its own entry or supplies a leaf identity.
  resolve: (path) => {
    if (isPlaySelectorPath(path)) return { sectionId: 'play' };
    if (path === '/settings' || path.startsWith('/settings/')) return { sectionId: 'settings' };
    if (path === '/enchiridion' || path.startsWith('/enchiridion/')) return { sectionId: 'enchiridion' };
    if (path === '/editor' || path === '/editor/wars' || path === '/campaigns' || path === '/campaigns-next') {
      return { sectionId: 'campaign-editor' };
    }
    if (path === '/lobbies' || path.startsWith('/lobbies/')) return { sectionId: 'lobbies' };
    if (path === '/party') return { sectionId: 'party' };
    return null;
  },
};

// ---------------------------------------------------------------------------
// Settings.
// ---------------------------------------------------------------------------

const SETTINGS_SECTION_BY_PATH: Readonly<Record<string, string>> = Object.freeze({
  '/settings/audio': 'audio',
  '/settings/audio/tracks': 'tracks',
  '/settings/gameplay': 'gameplay',
  '/settings/creator-tools': 'creator-tools',
  '/settings/admin': 'admin',
});
const SETTINGS_PATH_BY_SECTION: Readonly<Record<string, string>> = Object.freeze({
  general: '/settings/general',
  audio: '/settings/audio',
  tracks: '/settings/audio/tracks',
  gameplay: '/settings/gameplay',
  'creator-tools': '/settings/creator-tools',
  admin: '/settings/admin',
});

// The bare /settings root and unknown subpaths render the General section, so they
// resolve to its address: an address-only difference must never re-run the scene
// lifecycle for the same committed section.
const settingsSectionId = (path: string): string => SETTINGS_SECTION_BY_PATH[path] ?? 'general';

const settingsShell: SectionedShell = {
  id: 'settings',
  shell: SCENE_DEFINITIONS.settings,
  region: 'settings-shell',
  contentSlot: 'settings-content',
  identityPrefix: 'settings',
  manifest: {
    host: 'settings-shell',
    background: 'homepage',
    paintOwner: 'dom',
    critical: MENU_DESTINATION_CRITICAL,
    opportunistic: [],
    waitPresentation: 'transition-only',
  },
  sections: [
    section('general', SCENE_DEFINITIONS.settingsGeneral),
    section('audio', SCENE_DEFINITIONS.settingsAudio),
    // The track list loads a soundtrack index, so it is the one Settings section
    // that earns explicit Loading copy rather than transition choreography alone.
    section('tracks', SCENE_DEFINITIONS.settingsTracks, { waitPresentation: 'loading' }),
    section('gameplay', SCENE_DEFINITIONS.settingsGameplay),
    section('creator-tools', SCENE_DEFINITIONS.settingsCreatorTools),
    section('admin', SCENE_DEFINITIONS.settingsAdmin),
  ],
  sectionPath: (path) => SETTINGS_PATH_BY_SECTION[settingsSectionId(path)],
  resolve: (path) => ({ sectionId: settingsSectionId(path) }),
};

// ---------------------------------------------------------------------------
// Enchiridion (main menu).
// ---------------------------------------------------------------------------

const ENCHIRIDION_SECTION_DEFINITIONS: Readonly<Record<string, SceneDefinition>> = Object.freeze({
  units: SCENE_DEFINITIONS.enchiridionUnits,
  terrain: SCENE_DEFINITIONS.enchiridionTerrain,
  cards: SCENE_DEFINITIONS.enchiridionCards,
  'card-types': SCENE_DEFINITIONS.enchiridionCardTypes,
  relics: SCENE_DEFINITIONS.enchiridionRelics,
  abilities: SCENE_DEFINITIONS.enchiridionAbilities,
  ataraxia: SCENE_DEFINITIONS.enchiridionAtaraxia,
});

const enchiridionShell: SectionedShell = {
  id: 'enchiridion',
  shell: SCENE_DEFINITIONS.enchiridion,
  region: 'enchiridion-shell',
  contentSlot: 'enchiridion-content',
  identityPrefix: 'enchiridion',
  manifest: {
    host: 'enchiridion-shell',
    background: 'homepage',
    paintOwner: 'dom',
    critical: [...MENU_DESTINATION_CRITICAL, 'visible-reference-art'],
    opportunistic: [],
    waitPresentation: 'transition-only',
  },
  // Sections carry no relic or card param on purpose: a deeper address is the same
  // retained reference scene (ADR-0256), so selection never re-keys the slot.
  sections: Object.entries(ENCHIRIDION_SECTION_DEFINITIONS).map(([id, definition]) => section(id, definition)),
  sectionPath: (path) => enchiridionSectionPath(path),
  resolve: (path) => ({ sectionId: enchiridionSectionFromPath(path) }),
};

// ---------------------------------------------------------------------------
// Campaign Editor. Its sections address through query parameters, not path
// segments — the grammar differs, the identity derivation does not.
// ---------------------------------------------------------------------------

function campaignEditorSection(path: string, search: string): SectionedShellResolution {
  if (normalizeRoutePath(path) === '/editor/wars') return { sectionId: 'wars' };
  const params = new URLSearchParams(search);
  const collection = params.get('collection');
  if (collection === 'skirmish-profiles' || collection === 'unassigned') return { sectionId: collection };
  const campaignId = params.get('campaign')?.trim();
  return campaignId ? { sectionId: 'campaign', params: { campaignId } } : { sectionId: 'campaign' };
}

const campaignEditorShell: SectionedShell = {
  id: 'campaign-editor',
  shell: SCENE_DEFINITIONS.campaignEditor,
  region: 'editor-shell',
  contentSlot: 'editor-content',
  identityPrefix: 'campaign-editor',
  manifest: {
    host: 'editor-shell',
    background: 'homepage',
    paintOwner: 'campaign-editor',
    critical: ['homepage-background', 'title-bar', 'campaign-workspace', 'visible-draft-cards'],
    opportunistic: ['below-fold-draft-cards'],
    waitPresentation: 'transition-only',
  },
  sections: [
    section('campaign', SCENE_DEFINITIONS.editorCampaign),
    section('wars', SCENE_DEFINITIONS.editorWars),
    section('skirmish-profiles', SCENE_DEFINITIONS.editorSkirmishProfiles),
    section('unassigned', SCENE_DEFINITIONS.editorUnassigned),
  ],
  sectionPath: (path, search) => {
    const resolution = campaignEditorSection(path, search);
    const campaignId = resolution.params?.campaignId;
    return `${resolution.sectionId}${campaignId ? `:${campaignId}` : ''}`;
  },
  resolve: campaignEditorSection,
};

// ---------------------------------------------------------------------------
// Play selector, and its nested run-detail shell.
// ---------------------------------------------------------------------------

const playRunDetailShell: SectionedShell = {
  id: 'play-run',
  shell: SCENE_DEFINITIONS.playRun,
  region: 'run-detail',
  contentSlot: 'run-detail-content',
  // Inherits the Play selector's manifest: choosing a Run detail replaces a pane of
  // the same painted surface, not a different kind of screen.
  sections: [
    section('current', SCENE_DEFINITIONS.playRunCurrent),
    section('new', SCENE_DEFINITIONS.playRunNew),
  ],
  resolve: (path) => {
    const selection = playHubSelection(path);
    if (selection?.mode !== 'run' || !selection.choice) return null;
    return { sectionId: selection.choice };
  },
};

const playShell: SectionedShell = {
  id: 'play',
  shell: SCENE_DEFINITIONS.play,
  region: 'play-shell',
  contentSlot: 'play-content',
  identityPrefix: 'play-selector',
  manifest: {
    host: 'play-shell',
    background: 'homepage',
    paintOwner: 'play-selector',
    critical: ['homepage-background', 'title-bar', 'selector-chrome', 'visible-level-thumbnails'],
    opportunistic: ['below-fold-level-thumbnails'],
    waitPresentation: 'loading',
  },
  sections: [
    section('continue', SCENE_DEFINITIONS.playContinue),
    section('skirmish', SCENE_DEFINITIONS.playSkirmish),
    section('run', SCENE_DEFINITIONS.playRun),
    section('levels', SCENE_DEFINITIONS.playLevels),
    section('campaign', SCENE_DEFINITIONS.playCampaign),
  ],
  // The identity is the RESOLVED section address: the hub root, the agnostic
  // Continue address, its choices, and malformed selector paths all present one
  // committed Continue scene, so PlayMenu's ADR-0260 canonicalization retargets the
  // in-flight preparation in place instead of exiting the scene again.
  sectionPath: (path) => playHubSectionPath(path),
  resolve: (path) => {
    const selection = playHubSelection(path);
    if (selection?.mode === 'levels') return { sectionId: 'levels' };
    if (selection?.mode === 'run') return { sectionId: 'run' };
    if (selection?.mode === 'campaign') {
      return { sectionId: 'campaign', params: { campaignId: selection.campaignId } };
    }
    if (selection?.mode === 'skirmish') return { sectionId: 'skirmish' };
    return { sectionId: 'continue' };
  },
};

// ---------------------------------------------------------------------------
// Strategikon — one shell, two ancestries.
// ---------------------------------------------------------------------------

const STRATEGIKON_REFERENCE_DEFINITIONS: Readonly<Record<string, SceneDefinition>> = Object.freeze({
  units: SCENE_DEFINITIONS.strategikonReferenceUnits,
  terrain: SCENE_DEFINITIONS.strategikonReferenceTerrain,
  cards: SCENE_DEFINITIONS.strategikonReferenceCards,
  'card-types': SCENE_DEFINITIONS.strategikonReferenceCardTypes,
  relics: SCENE_DEFINITIONS.strategikonReferenceRelics,
  abilities: SCENE_DEFINITIONS.strategikonReferenceAbilities,
  ataraxia: SCENE_DEFINITIONS.strategikonReferenceAtaraxia,
});

const STRATEGIKON_MANIFEST: Omit<SceneManifest, 'id'> = {
  host: 'gameplay-shell',
  background: 'battlefield',
  paintOwner: 'gameplay-hud',
  critical: ['battlefield-background', 'strategikon-reference'],
  opportunistic: [],
  waitPresentation: 'transition-only',
};

/** The Enchiridion reference rail INSIDE the Strategikon — its second retained rail. */
const strategikonReferenceShell: SectionedShell = {
  id: 'strategikon-enchiridion',
  shell: SCENE_DEFINITIONS.strategikonEnchiridion,
  region: 'strategikon-reference-shell',
  contentSlot: 'strategikon-reference-content',
  sections: Object.entries(STRATEGIKON_REFERENCE_DEFINITIONS)
    .map(([id, definition]) => section(id, definition)),
  resolve: (path) => ({ sectionId: strategikonAddress(path).reference }),
};

const strategikonShell: SectionedShell = {
  id: 'strategikon',
  shell: SCENE_DEFINITIONS.strategikon,
  region: 'strategikon-shell',
  contentSlot: 'strategikon-content',
  manifest: STRATEGIKON_MANIFEST,
  // No `identityPrefix`: the two ancestries carry different identity prefixes
  // ('gameplay', or the Run's state identity), so `sceneManifest` composes the id
  // from the ancestor and this family's canonical section address.
  sections: [
    section('enchiridion', SCENE_DEFINITIONS.strategikonEnchiridion),
    section('prosopography', SCENE_DEFINITIONS.strategikonProsopography),
    section('lipsanotheca', SCENE_DEFINITIONS.strategikonLipsanotheca),
  ],
  // The canonical address carries the base, so the two ancestries never share an id.
  sectionPath: (path) => strategikonSectionPath(path),
  resolve: (path) => ({ sectionId: strategikonAddress(path).section }),
};

// ---------------------------------------------------------------------------
// Registry.
// ---------------------------------------------------------------------------

export const SECTIONED_SHELLS: readonly SectionedShell[] = Object.freeze([
  mainMenuShell,
  settingsShell,
  enchiridionShell,
  campaignEditorShell,
  playShell,
  playRunDetailShell,
  strategikonShell,
  strategikonReferenceShell,
]);

export const SECTIONED_SHELL_BY_ID: Readonly<Record<string, SectionedShell>> = Object.freeze(
  Object.fromEntries(SECTIONED_SHELLS.map((entry) => [entry.id, entry])),
);

/** Entry keyed by the scene definition id of its retained shell, for the walk. */
const SECTIONED_SHELL_BY_SHELL_DEFINITION: Readonly<Record<string, SectionedShell>> = Object.freeze(
  Object.fromEntries(SECTIONED_SHELLS.map((entry) => [entry.shell.id, entry])),
);

/**
 * The region retained across a change of a shell's section. Derived, so it cannot
 * drift from the entry that declares the shell.
 */
export const SECTIONED_SHELL_REGION_BY_DEFINITION: Readonly<Record<string, SceneHost>> = Object.freeze(
  Object.fromEntries(SECTIONED_SHELLS.map((entry) => [entry.shell.id, entry.region])),
);

/** The slot a region's replaceable child occupies. Derived from the same entries. */
export const SECTIONED_SHELL_SLOT_BY_REGION: Readonly<Partial<Record<SceneHost, SceneSlotId>>> = Object.freeze(
  Object.fromEntries(SECTIONED_SHELLS.map((entry) => [entry.region, entry.contentSlot])),
);

/** Every slot the registry can mount, for the inspectable scene-graph projection. */
export const SECTIONED_SHELL_SLOTS: readonly SceneSlotId[] = Object.freeze([
  ...new Set(SECTIONED_SHELLS.map((entry) => entry.contentSlot)),
]);

export interface SectionedShellScene {
  /** Shell instance, then section instance, repeated for each nested entry. */
  instances: readonly SceneInstance[];
  manifest: SceneManifest;
}

/**
 * Walk the registry from `entryId`, appending each shell instance and the section
 * instance it resolves in that shell's content slot. A section that is itself a
 * registered shell continues the walk, which is how the main menu reaches Settings'
 * sections and how the Strategikon reaches its Enchiridion reference sections.
 */
export function resolveSectionedShellScene(
  entryId: string,
  path: string,
  search: string,
  ancestors: readonly SceneInstance[] = [],
): SectionedShellScene | null {
  const root = SECTIONED_SHELL_BY_ID[entryId];
  if (!root?.manifest) return null;
  const instances: SceneInstance[] = [...ancestors];
  let entry: SectionedShell | undefined = root;
  let manifest: Omit<SceneManifest, 'id'> = root.manifest;
  let id = root.identityPrefix ?? entryId;

  while (entry) {
    instances.push(sceneInstance(entry.shell));
    if (entry.manifest) manifest = { ...manifest, ...entry.manifest };
    const resolution = entry.resolve(path, search);
    if (!resolution) break;
    const selected: SectionedShellSection | undefined = entry.sections
      .find((candidate) => candidate.id === resolution.sectionId);
    if (!selected) break;
    if (entry.identityPrefix && entry.sectionPath) {
      id = `${entry.identityPrefix}:${entry.sectionPath(path, search)}`;
    }
    // A section that is itself a registered shell continues the walk — its own
    // shell instance is pushed by the next iteration, never here.
    const child: SectionedShell | undefined = SECTIONED_SHELL_BY_SHELL_DEFINITION[selected.definition.id];
    if (child && child !== entry) {
      entry = child;
      continue;
    }
    instances.push(sceneInstance(selected.definition, resolution.params ?? {}));
    if (selected.manifest) {
      const { id: leafId, ...fields } = selected.manifest;
      manifest = { ...manifest, ...fields };
      if (leafId) id = leafId;
    }
    entry = undefined;
  }

  return { instances, manifest: { ...manifest, id } };
}
