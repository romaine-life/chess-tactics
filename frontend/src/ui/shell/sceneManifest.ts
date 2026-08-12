import { normalizeRoutePath } from '../navigation';
import { isRunRoutePath, isRunStrategikonPath, presentedRunAddress } from '../runRoute';
import { isStrategikonPath, strategikonBase, strategikonSectionPath } from '../strategikonRoute';
import {
  SCENE_DEFINITIONS,
  sceneInstance as instance,
  sceneManifestFields as manifest,
  type RunSceneSnapshot,
  type RunSceneWorkspace,
  type SceneHost,
  type SceneInstance,
  type SceneManifest,
  type SceneSlotId,
  type SceneSources,
  type ScenePath,
} from './sceneGraph';
import {
  SECTIONED_SHELL_REGION_BY_DEFINITION,
  SECTIONED_SHELL_SLOT_BY_REGION,
  SECTIONED_SHELL_SLOTS,
  resolveSectionedShellScene,
} from './sectionedShells';

export * from './sceneGraph';

/**
 * Resolve browser intent into an authored scene path.
 *
 * Families that present a rail of sections inside a retained shell do NOT appear
 * here as hand-written branches: they are entries in `sectionedShells.ts`, which
 * derives their identity, instance chain, region, and slot from one declaration.
 * What remains below are the standalone screens and the two gameplay roots that
 * host the Strategikon.
 */

function runSceneSnapshot(
  pathname: string,
  search: string,
  source: SceneSources['run'],
): RunSceneSnapshot {
  const path = normalizeRoutePath(pathname);
  const phase = !source?.hydrated
    ? 'hydrating' as const
    : source.document?.phase ?? 'no-active' as const;
  const params = new URLSearchParams(search);
  const requestedView = params.get('view');
  const requestedUnitId = params.get('unit');
  const unitId = source?.document?.army.some((unit) => unit.id === requestedUnitId)
    ? requestedUnitId
    : null;
  const workspace: RunSceneWorkspace = isRunStrategikonPath(path)
    ? Object.freeze({ view: 'strategikon' as const })
    : requestedView === 'army'
        ? Object.freeze({ view: 'army' as const, unitId })
        : requestedView === 'lipsana'
          ? Object.freeze({ view: 'lipsana' as const })
          : requestedView === 'expunctio' && phase === 'sectio'
              ? Object.freeze({ view: 'expunctio' as const })
              : requestedView === 'battle-preview' && phase === 'sectio'
                ? Object.freeze({ view: 'battle-preview' as const })
                : requestedView === 'battle-review' && phase === 'aftermath'
                  ? Object.freeze({ view: 'battle-review' as const })
                : Object.freeze({ view: 'primary' as const });
  return Object.freeze({
    kind: 'run',
    hydrated: source?.hydrated ?? false,
    run: source?.document ?? null,
    phase,
    workspace,
  });
}

export function runSceneWorkspaceIdentity(workspace: RunSceneWorkspace): string {
  if (workspace.view === 'army') return workspace.unitId ? `army:${workspace.unitId}` : 'army';
  return workspace.view;
}

const STUDIO_PATHS: ReadonlySet<string> = new Set([
  '/tileset-studio', '/unit-studio', '/nine-slice-editor', '/prop-lab', '/tile-compare',
  '/surface-lab', '/scene-anim-lab', '/doodad-editor', '/artwork-compare',
]);

const isStudioPath = (path: string): boolean => path.startsWith('/studio') || STUDIO_PATHS.has(path);

const isLevelEditorPath = (path: string): boolean => (
  path === '/editor/level' || path === '/edit' || path === '/level-editor'
);

const runPhaseIdentity = (snapshot: RunSceneSnapshot): string => {
  return snapshot.phase === 'deployment' || snapshot.phase === 'battle' ? 'battlefield' : snapshot.phase;
};

/** The Run instances the director keys from persisted state rather than the address. */
function runStateInstances(snapshot: RunSceneSnapshot): readonly SceneInstance[] {
  const phase = runPhaseIdentity(snapshot);
  const phaseIdentity = snapshot.run
    ? `${snapshot.run.id}:${phase}:${snapshot.run.battleIndex}`
    : phase;
  return [
    instance(SCENE_DEFINITIONS.run),
    instance(SCENE_DEFINITIONS.runPhase, { phase: phaseIdentity }),
    instance(SCENE_DEFINITIONS.runWorkspace, {
      phase: phaseIdentity,
      workspace: runSceneWorkspaceIdentity(snapshot.workspace),
    }),
  ];
}

function scene(
  path: string,
  fields: SceneManifest,
  instances: readonly SceneInstance[],
  snapshot: RunSceneSnapshot | null = null,
): ScenePath {
  return Object.freeze({
    ...fields,
    pathname: path,
    instances,
    leaf: instances[instances.length - 1],
    snapshot: snapshot ?? Object.freeze({ kind: 'route' as const }),
  });
}

export function sceneManifest(
  pathname: string,
  search: string = '',
  sources: SceneSources = {},
): ScenePath {
  const path = normalizeRoutePath(pathname);
  // A craft link keeps its own address so it stays pressable (ADR-0531) and PRESENTS the Run
  // address it names, so the scene is resolved from what the link lands on rather than from the
  // link. `scene()` still records the browser path, which is what the Run screen crafts from.
  const presented = presentedRunAddress(path, search);
  const strategikon = isStrategikonPath(presented.path);
  const base = strategikon ? strategikonBase(presented.path) : null;

  // --- Run: state-driven phase and workspace slots, optionally hosting the Strategikon.
  // `isRunRoutePath` also covers craft links, which craft and then present the Run.
  if (isRunRoutePath(path)) {
    const snapshot = runSceneSnapshot(presented.path, presented.search, sources.run);
    const instances = runStateInstances(snapshot);
    const runIdentity = `run:${snapshot.run?.id ?? 'none'}:${runPhaseIdentity(snapshot)}:${runSceneWorkspaceIdentity(snapshot.workspace)}`;
    const fields = manifest(runIdentity, 'battlefield', 'gameplay-hud', [
      'gameplay-hud',
    ], [], 'gameplay-shell', 'transition-only');
    if (!strategikon) return scene(path, fields, instances, snapshot);
    const reference = resolveSectionedShellScene('strategikon', presented.path, presented.search, instances)!;
    return scene(path, {
      ...fields,
      ...reference.manifest,
      // The Run shell stays painted beneath the reference workspace, so its own
      // critical resources remain required alongside the Strategikon's.
      critical: [...fields.critical, ...reference.manifest.critical],
      id: `${runIdentity}:${strategikonSectionPath(presented.path)}`,
    }, reference.instances, snapshot);
  }

  // --- Battle: the gameplay root, optionally hosting the Strategikon.
  if (path === '/play' || (strategikon && base === '/play')) {
    const instances = [instance(SCENE_DEFINITIONS.gameplay)];
    const fields = manifest('gameplay', 'battlefield', 'gameplay-hud', [
      'gameplay-hud',
    ], [], 'gameplay-shell', 'transition-only');
    if (!strategikon) return scene(path, fields, instances);
    const reference = resolveSectionedShellScene('strategikon', path, search, instances)!;
    return scene(path, {
      ...fields,
      ...reference.manifest,
      critical: [...fields.critical, ...reference.manifest.critical],
      id: `gameplay:${strategikonSectionPath(path)}`,
    }, reference.instances);
  }

  // --- Standalone screens: no retained shell, so no sections.
  if (isLevelEditorPath(path)) {
    // The editor keeps a real decomposition rather than one collapsed participant: these
    // are the authorities it already computes separately, so each can fail on its own and
    // the loading timeline names which one the wait belongs to (ADR-0369).
    return scene(path, manifest('level-editor', 'homepage', 'level-editor', [
      'chrome:skirmish-screen level-editor-screen',
      'document',
      'board-compositors',
      'visible-editor-chrome',
      'level-editor',
    ], ['below-fold-palette']), [instance(SCENE_DEFINITIONS.levelEditor)]);
  }
  if (isStudioPath(path)) {
    return scene(path, manifest(`studio:${path}`, 'tool', 'studio', [
      'studio',
    ], ['below-fold-catalog']), [instance(SCENE_DEFINITIONS.studio, { path })]);
  }
  if (path.startsWith('/run/watch/')) {
    return scene(path, manifest(`run-watch:${path}`, 'tool', 'run-watch', ['run-watch']), [
      instance(SCENE_DEFINITIONS.runWatch, { path }),
    ]);
  }
  if (path === '/predrawn-reference') {
    return scene(path, manifest('predrawn-reference', 'tool', 'predrawn-reference', ['predrawn-reference']), [
      instance(SCENE_DEFINITIONS.predrawnReference),
    ]);
  }
  if (path === '/portrait-editor') {
    return scene(path, manifest('portrait-editor', 'tool', 'portrait-editor', ['portrait-editor']), [
      instance(SCENE_DEFINITIONS.portraitEditor),
    ]);
  }

  // --- The main menu and every destination it retains. App renders MainMenu for
  // unmatched routes, and the registry's root entry resolves them the same way, so
  // no navigable path escapes the scene system by omission.
  const resolved = resolveSectionedShellScene('main-menu', path, search)!;
  return scene(path, resolved.manifest, resolved.instances);
}

/**
 * The retained region owned by each shell scene. Sectioned shells contribute
 * theirs from the registry; the two gameplay roots are declared here because their
 * children are state-driven rather than a rail of sections.
 */
const HOST_REGION_BY_DEFINITION: Readonly<Partial<Record<string, SceneHost>>> = Object.freeze({
  ...SECTIONED_SHELL_REGION_BY_DEFINITION,
  gameplay: 'gameplay-workspace',
  run: 'gameplay-shell',
  'run/phase': 'gameplay-workspace',
});

const DESTINATION_SLOT_BY_REGION: Readonly<Partial<Record<SceneHost, SceneSlotId>>> = Object.freeze({
  ...SECTIONED_SHELL_SLOT_BY_REGION,
  'gameplay-shell': 'gameplay-content',
  'gameplay-workspace': 'gameplay-content',
});

/** Every slot the scene graph can mount, for the inspectable projection. */
export const SCENE_SLOT_IDS: readonly SceneSlotId[] = Object.freeze([
  'root',
  ...SECTIONED_SHELL_SLOTS,
  'gameplay-content',
  'run-phase',
  'run-workspace',
]);

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

export type SceneTransitionRelationship =
  | Readonly<{ kind: 'scene-replacement'; region: null }>
  | Readonly<{ kind: 'selection-change'; region: SceneHost }>;

const SCENE_REPLACEMENT: SceneTransitionRelationship = Object.freeze({
  kind: 'scene-replacement',
  region: null,
});

/**
 * Stable owner of a Run's complete scene composition.
 *
 * Ordinary workspaces are selections inside one Run phase, so they intentionally
 * share the phase owner. The aftermath's terminal board review is a complete Battle
 * scene reached from the report and therefore owns a separate composition even though
 * its durable Run phase remains `aftermath`.
 */
function runSceneOwnerKey(path: ScenePath): string | null {
  if (path.snapshot.kind !== 'run') return null;
  const phase = path.instances.find((entry) => entry.definition.slot === 'run-phase');
  if (!phase) return null;
  return path.snapshot.workspace.view === 'battle-review'
    ? `${phase.key}:battle-review`
    : phase.key;
}

/**
 * The semantic relationship between two authored destinations.
 *
 * This is not an animation option. The graph derives it from presentation ownership:
 * a new owner must crossfade directly from the prepared outgoing scene, while a new
 * selection under one retained owner may use the existing deselect/prepare/select
 * language in that owner's named region.
 */
export function sceneTransitionRelationship(
  current: ScenePath,
  destination: ScenePath,
): SceneTransitionRelationship {
  const currentRunOwner = runSceneOwnerKey(current);
  const destinationRunOwner = runSceneOwnerKey(destination);
  if (
    currentRunOwner !== null
    && destinationRunOwner !== null
    && currentRunOwner !== destinationRunOwner
  ) return SCENE_REPLACEMENT;

  const region = deepestSharedSceneRegion(current, destination);
  return region
    ? Object.freeze({ kind: 'selection-change', region })
    : SCENE_REPLACEMENT;
}

/**
 * React mount identity for a rendered scene layer.
 *
 * Some instances refine scene identity — driving which region transitions — without
 * replacing the tree around them. Keying the layer by the deepest instance OUTSIDE
 * those slots keeps one React tree across the change, so selecting a Play Run choice
 * never unmounts and re-reveals its sibling action column, and opening or paging
 * through the Strategikon never tears down the Battle board behind it. The
 * state-driven Run phase and workspace slots stay leaf-keyed on purpose: their
 * scenes overlap as two complete layers, which requires distinct keys. Deployment
 * and its Battle share one leaf key so the empty board becomes the played board.
 */
const IDENTITY_ONLY_SLOTS: ReadonlySet<SceneSlotId> = new Set([
  'run-detail-content',
  'gameplay-content',
  'strategikon-content',
  'strategikon-reference-content',
]);

export function sceneLayerKey(scene: ScenePath): string {
  const runOwner = runSceneOwnerKey(scene);
  if (runOwner) return runOwner;
  for (let index = scene.instances.length - 1; index >= 0; index -= 1) {
    const entry = scene.instances[index];
    if (!IDENTITY_ONLY_SLOTS.has(entry.definition.slot)) return entry.key;
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
