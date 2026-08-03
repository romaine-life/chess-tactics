import { normalizeRoutePath } from '../navigation';
import { isRunRoutePath, isRunStrategikonPath } from '../runRoute';
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
  const requestedView = new URLSearchParams(search).get('view');
  const requestedWorkspace: RunSceneWorkspace = isRunStrategikonPath(path)
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

const STUDIO_PATHS: ReadonlySet<string> = new Set([
  '/tileset-studio', '/unit-studio', '/nine-slice-editor', '/prop-lab', '/tile-compare',
  '/surface-lab', '/scene-anim-lab', '/doodad-editor', '/artwork-compare',
]);

const isStudioPath = (path: string): boolean => path.startsWith('/studio') || STUDIO_PATHS.has(path);

const isLevelEditorPath = (path: string): boolean => (
  path === '/editor/level' || path === '/edit' || path === '/level-editor'
);

/**
 * Deployment and its Battle are one continuous battlefield phase (ADR-0354), so they
 * deliberately resolve to the same phase identity; every other phase change keeps its
 * own and takes a complete-scene transition.
 */
const runPhaseIdentity = (snapshot: RunSceneSnapshot): string => (
  snapshot.phase === 'deployment' || snapshot.phase === 'battle' ? 'battlefield' : snapshot.phase
);

/** The Run instances the director keys from persisted state rather than the address. */
function runStateInstances(snapshot: RunSceneSnapshot): readonly SceneInstance[] {
  const phase = runPhaseIdentity(snapshot);
  const phaseIdentity = snapshot.run
    ? `${snapshot.run.id}:${phase}:${snapshot.run.battleIndex}`
    : phase;
  return [
    instance(SCENE_DEFINITIONS.run),
    instance(SCENE_DEFINITIONS.runPhase, { phase: phaseIdentity }),
    instance(SCENE_DEFINITIONS.runWorkspace, { phase: phaseIdentity, workspace: snapshot.workspace }),
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
  const strategikon = isStrategikonPath(path);
  const base = strategikon ? strategikonBase(path) : null;

  // --- Run: state-driven phase and workspace slots, optionally hosting the Strategikon.
  // `isRunRoutePath` also covers craft links, which craft and then land on the Run.
  if (isRunRoutePath(path)) {
    const snapshot = runSceneSnapshot(path, search, sources.run);
    const instances = runStateInstances(snapshot);
    const runIdentity = `run:${snapshot.run?.id ?? 'none'}:${runPhaseIdentity(snapshot)}:${snapshot.workspace}`;
    const fields = manifest(runIdentity, 'battlefield', 'gameplay-hud', [
      'gameplay-hud',
    ], [], 'gameplay-shell', 'transition-only');
    if (!strategikon) return scene(path, fields, instances, snapshot);
    const reference = resolveSectionedShellScene('strategikon', path, search, instances)!;
    return scene(path, {
      ...fields,
      ...reference.manifest,
      // The Run shell stays painted beneath the reference workspace, so its own
      // critical resources remain required alongside the Strategikon's.
      critical: [...fields.critical, ...reference.manifest.critical],
      id: `${runIdentity}:${strategikonSectionPath(path)}`,
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
  gameplay: 'gameplay-shell',
  run: 'gameplay-shell',
});

const DESTINATION_SLOT_BY_REGION: Readonly<Partial<Record<SceneHost, SceneSlotId>>> = Object.freeze({
  ...SECTIONED_SHELL_SLOT_BY_REGION,
  'gameplay-shell': 'gameplay-content',
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

/** The Run instances the director keys from persisted state rather than the address. */
const RUN_STATE_SLOTS: ReadonlySet<SceneSlotId> = new Set(['root', 'run-phase', 'run-workspace']);

/**
 * True when two Run scenes differ in state the Run document owns — its phase, its
 * battle, or which workspace fills the shell.
 *
 * Those overlap as two complete layers so the outgoing snapshot stays frozen while
 * the destination prepares. A change BENEATH the workspace — moving between the
 * Strategikon's sections — is address-driven inside one committed workspace and
 * takes the ordinary region-preserving path instead, so its retained rails are not
 * dragged through a whole-screen crossfade.
 */
export function overlapsStateDrivenRunScene(current: ScenePath, destination: ScenePath): boolean {
  if (current.snapshot.kind !== 'run' || destination.snapshot.kind !== 'run') return false;
  const stateIdentity = (path: ScenePath): string => path.instances
    .filter((entry) => RUN_STATE_SLOTS.has(entry.definition.slot))
    .map((entry) => entry.key)
    .join(' > ');
  return stateIdentity(current) !== stateIdentity(destination);
}

export type SceneOverlapScope = 'scene' | 'shell-viewport';

/**
 * How much of an overlapping scene pair the director is allowed to fade.
 *
 * Overlapping layers still retain every instance before the first divergence, and
 * both paint it identically. When that divergence is the `run-workspace` slot — Shop
 * to Sell Units, Army, Relics, or opening the Strategikon — the Run shell around it
 * is retained, including the Controls panel and relic rail. Crossfading the whole
 * boundary blends that retained chrome toward the backdrop at the midpoint, which is
 * the Controls title plank dimming on every workspace switch. Report the narrower
 * scope so only the shell's replaceable viewport carries the transition. A phase
 * change (Shop to Battle) replaces the Controls contents too and keeps the
 * whole-scene crossfade.
 */
export function sceneOverlapScope(
  current: ScenePath,
  destination: ScenePath,
): SceneOverlapScope {
  const length = Math.min(current.instances.length, destination.instances.length);
  let index = 0;
  while (index < length && current.instances[index].key === destination.instances[index].key) index += 1;
  if (index === 0 || index >= length) return 'scene';
  const currentInstance = current.instances[index];
  const destinationInstance = destination.instances[index];
  if (currentInstance.definition.id !== destinationInstance.definition.id) return 'scene';
  return currentInstance.definition.slot === 'run-workspace' ? 'shell-viewport' : 'scene';
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
 * scenes overlap as two complete layers, which requires distinct keys. Deployment and
 * its Battle are one continuous battlefield phase and so deliberately share a leaf key
 * (ADR-0354); other Run phase changes still receive distinct keys.
 */
const IDENTITY_ONLY_SLOTS: ReadonlySet<SceneSlotId> = new Set([
  'run-detail-content',
  'gameplay-content',
  'strategikon-content',
  'strategikon-reference-content',
]);

export function sceneLayerKey(scene: ScenePath): string {
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
