import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const src = resolve(root, 'src');
const failures = [];

function productionFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    if (!/\.(?:ts|tsx|css)$/.test(entry.name) || /\.test\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [path];
  });
}

function fail(file, message) {
  failures.push(`${relative(root, file)}: ${message}`);
}

const files = productionFiles(src);
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const normalized = relative(src, file).replaceAll('\\', '/');
  if (
    normalized !== 'ui/navigation.ts'
    && (/addEventListener\(['"]popstate/.test(source)
      || source.includes('APP_NAVIGATION_EVENT')
      || /history\.(?:pushState|replaceState)/.test(source))
  ) {
    fail(file, 'browser location intent must go through ui/navigation.ts');
  }
  if (
    normalized !== 'ui/shell/AuthoredSceneSlot.tsx'
    && normalized !== 'ui/shell/sceneTransitionTarget.ts'
    && source.includes('sceneTransitionTargetAttributes')
  ) {
    fail(file, 'screens must use a named closed AuthoredSceneSlot, not the low-level transition target');
  }
  if (source.includes('SCENE_FADE_MS') || source.includes('STAGE_FADE_MS')) {
    fail(file, 'presentation timing belongs to sceneTransitionLifecycle');
  }
  if (source.includes('RunWorkspaceStages')) {
    fail(file, 'Run phase/workspace replacement belongs to the PresentationDirector');
  }
  if (source.includes('useSkirmish.getState')) {
    fail(file, 'runtime Battle code must use the nearest instance-owned Skirmish store');
  }
  // The Run viewport is a capability, not a class-name convention. Feature code
  // contributes a typed scene object to RunSceneViewport; only that renderer may
  // emit the landmark/frame/layer which can replace the shell viewport.
  if (
    /\.(?:ts|tsx)$/.test(normalized)
    &&
    normalized !== 'ui/RunWorkspace.tsx'
    && (source.includes('run-shell-workspace')
      || /className=\{?[^\n]*\brun-workspace\b/.test(source))
  ) {
    fail(file, 'Run viewport DOM must be emitted by the closed RunSceneViewport API');
  }
  if (
    normalized !== 'ui/RunWorkspace.tsx'
    && source.includes("from './RunWorkspace'")
    && !source.includes('RunSceneViewport')
  ) {
    fail(file, 'Run workspace consumers may import only the closed RunSceneViewport capability');
  }
  if (source.includes('<RunSceneViewport') && !/<RunSceneViewport\s+scene=\{\{/.test(source)) {
    fail(file, 'every Run viewport contribution must declare a typed scene object');
  }
  if (
    /^ui\/(?:Run|run|Lipsana)/.test(normalized)
    && source.includes('createPortal')
  ) {
    fail(file, 'Run feature code may not portal around the scene viewport authority');
  }
  if (
    normalized !== 'ui/shell/SceneContinuity.tsx'
    && source.includes('data-scene-continuity-host')
  ) {
    fail(file, 'only the director-owned SceneContinuityHost may emit the continuity layer');
  }
}

const continuityPath = resolve(src, 'ui/shell/SceneContinuity.tsx');
const continuity = readFileSync(continuityPath, 'utf8');
for (const required of [
  'SceneContinuityHostContext',
  'data-scene-continuity-host=""',
  "kind: 'shared-element'",
  'contribution: SceneContinuityContribution',
  'export function SceneContinuityPortal',
  'data-scene-continuity-contribution={contribution.id}',
]) {
  if (!continuity.includes(required)) fail(continuityPath, `missing closed scene-continuity invariant: ${required}`);
}

const runScreenPath = resolve(src, 'ui/RunScreen.tsx');
const runScreen = readFileSync(runScreenPath, 'utf8');
for (const required of [
  'sceneSnapshot: RunSceneSnapshot',
  'const run = sceneSnapshot.run;',
  '<RunPresentationSceneSlot',
  'navigateApp(nextHref, { replace: true, scroll: false })',
  '<KlerosisOverlay',
  'onChooseMode={(mode) => replace(chooseDeploymentMode(prepared, level, mode))}',
  'onArrivingUnitIdsChange: () => undefined',
]) {
  if (!runScreen.includes(required)) fail(runScreenPath, `missing closed Run scene-source invariant: ${required}`);
}
for (const forbidden of [
  'window.history',
  'setTimeout(',
  'RunWorkspaceStages',
  'PaintedSurfaceBoundary',
  'const [selectedState',
  'pendingPlacementArrivalUnitIdRef',
  'handleArrivingUnitIdsChange',
]) {
  if (runScreen.includes(forbidden)) fail(runScreenPath, `forbidden local Run presentation authority: ${forbidden}`);
}

const bonaPath = resolve(src, 'ui/RunBonaVacantia.tsx');
const bona = readFileSync(bonaPath, 'utf8');
for (const forbidden of [
  'const [targeting',
  'const [selectedUnitId',
  'run-vacantia-pending-lipsanon',
  'createPortal',
]) {
  if (bona.includes(forbidden)) fail(bonaPath, `forbidden local Bona scene authority: ${forbidden}`);
}
for (const required of [
  '<RunSceneViewport',
  "view: 'bona-mat'",
  "view: 'bona-target'",
  'onTargetLipsanon(lipsanonId)',
  "{ handoff: 'scene-retirement' }",
]) {
  if (!bona.includes(required)) fail(bonaPath, `missing authored Bona scene contribution: ${required}`);
}

const retiredRunStages = resolve(src, 'ui/RunWorkspaceStages.tsx');
if (existsSync(retiredRunStages) && statSync(retiredRunStages).isFile()) {
  fail(retiredRunStages, 'retired competing Run transition system still exists');
}

const stylesPath = resolve(src, 'style.css');
const styles = readFileSync(stylesPath, 'utf8');
if (/\.run-stage(?:\.|\s|\{)/.test(styles)) {
  fail(stylesPath, 'retired local Run entering/departing choreography still exists');
}
if (styles.includes('.run-vacantia-pending-lipsanon')) {
  fail(stylesPath, 'Bona may not mount a fixed viewport layer outside the Run scene contribution');
}

const skirmishPath = resolve(src, 'ui/Skirmish.tsx');
const skirmish = readFileSync(skirmishPath, 'utf8');
for (const required of [
  '<SkirmishStoreProvider>',
  '<SceneSurfaceReadiness',
  'if (!runDeployment && playableSurfaceReady && sceneActivated) activateClock()',
  'reveal={playableSurfaceReady && sceneRevealed}',
  'activate={!runDeployment && sceneActivated}',
  'interactive={!runDeployment && sceneActivated &&',
  'surfaceSignature={runBattle?.activityId}',
  'surfaceState={presentedDeploymentSurface}',
  'preserveBoardPresentation: true',
  // Activation releases the entrance; it does not decide whether there is one. A battlefield
  // that has not been activated is still staging the units it is about to introduce, so its
  // reveal — which happens during the scene entrance — never shows them seated early.
  "unitArrivals={sceneActivated ? 'active' : 'pending'}",
  'onArrivingUnitIdsChange={runDeployment?.onArrivingUnitIdsChange}',
]) {
  if (!skirmish.includes(required)) fail(skirmishPath, `missing commit-gated Battle invariant: ${required}`);
}

const skirmishBoardPath = resolve(src, 'render/SkirmishBoard.tsx');
const skirmishBoard = readFileSync(skirmishBoardPath, 'utf8');
for (const required of [
  'newlyVisibleArrivalPieces(visibleUnitIdsRef.current, livePieces)',
  'data-arriving-unit-ids={arrivingUnitIds.join(\',\')}',
]) {
  if (!skirmishBoard.includes(required)) fail(skirmishBoardPath, `missing retained-board per-unit arrival invariant: ${required}`);
}

if (failures.length) {
  console.error('Presentation architecture check failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Presentation architecture check passed.');
