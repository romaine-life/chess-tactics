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
    source.includes("from './SkirmishShell'")
    && normalized !== 'ui/RunForm.tsx'
    && normalized !== 'ui/Skirmish.tsx'
  ) {
    fail(file, 'only RunForm and standalone Skirmish may import the structural gameplay shell');
  }
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
  if (
    normalized !== 'ui/App.tsx'
    && normalized !== 'ui/shell/sceneManifest.ts'
    && (source.includes("'scene-replacement'") || source.includes("'selection-change'"))
  ) {
    fail(file, 'scene ownership derives transition relationship; features may not choose it');
  }
  if (
    source.includes('overlapsStateDrivenRunScene')
    || source.includes('sceneOverlapScope')
    || source.includes('data-scene-overlap-scope')
    || source.includes('data-scene-overlap-region')
  ) {
    fail(file, 'retired Run-specific overlap choreography must not return');
  }
  const webAnimationReceivers = [...source.matchAll(/\b([A-Za-z_$][\w$]*)\.animate\s*\(/g)]
    .map((match) => match[1]);
  if (
    normalized !== 'ui/shell/SceneActivity.tsx'
    && webAnimationReceivers.some((receiver) => receiver !== 'scene' && receiver !== 'sceneMotion')
  ) {
    fail(file, 'imperative Web Animations must go through the scene-owned motion authority');
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

const appPath = resolve(src, 'ui/App.tsx');
const app = readFileSync(appPath, 'utf8');
const sceneBoundaryPath = resolve(src, 'ui/shell/SceneBoundary.tsx');
const sceneBoundary = readFileSync(sceneBoundaryPath, 'utf8');
for (const required of [
  'directorPhase={scene.phase}',
  'visualRole={layer.visualRole}',
  'sceneTransitionRelationship(scene.current, scene.destination)',
  'data-scene-transition-relationship={transitionRelationship?.kind}',
  '<SceneContinuityHost phase={scene.phase} generation={scene.generation}>',
]) {
  if (!app.includes(required)) fail(appPath, `missing director-owned scene lifecycle input: ${required}`);
}

const sceneManifestPath = resolve(src, 'ui/shell/sceneManifest.ts');
const sceneManifestSource = readFileSync(sceneManifestPath, 'utf8');
for (const required of [
  'export function sceneTransitionRelationship(',
  "kind: 'scene-replacement'",
  "kind: 'selection-change'",
  "path.snapshot.workspace.view === 'battle-review'",
  "'run/phase': 'gameplay-workspace'",
]) {
  if (!sceneManifestSource.includes(required)) {
    fail(sceneManifestPath, `missing derived scene-ownership invariant: ${required}`);
  }
}
for (const forbidden of ['preparing={layer.preparing}', 'deactivating={', 'revealing={']) {
  if (app.includes(forbidden)) fail(appPath, `scene lifecycle permission must not be caller supplied: ${forbidden}`);
}
for (const required of [
  'sceneBoundaryLifecycle(directorPhase, visualRole)',
  "preparing: visualRole === 'incoming'",
  '[deactivating, generation, manifest.id, mountedKey]',
]) {
  if (!sceneBoundary.includes(required)) fail(sceneBoundaryPath, `missing closed scene activity invariant: ${required}`);
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
  "if (phase !== 'current')",
  'awaitingSettlement.current = generation',
  'onSceneSettled();',
]) {
  if (!continuity.includes(required)) fail(continuityPath, `missing closed scene-continuity invariant: ${required}`);
}

const runScreenPath = resolve(src, 'ui/RunScreen.tsx');
const runScreen = readFileSync(runScreenPath, 'utf8');
for (const required of [
  'sceneSnapshot: RunSceneSnapshot',
  'const run = sceneSnapshot.run;',
  '<RunPresentationSceneSlot',
  'const form = createRunForm({',
  'form.add(runActivity({',
  'form={form}',
  'navigateApp(nextHref, { replace: true, scroll: false })',
  '<RunDeploymentCardStack',
  '<RunDeploymentDeckDeal',
  'data-testid="deployment-transport-control"',
  'data-testid="deployment-play"',
  'data-testid="deployment-next"',
  'data-testid="deployment-full-deploy"',
  'disabled={departing || !nextReady}',
  'onClick={onNext}',
  'setDeploymentTransport(latest, transport)',
  'beginDeploymentDeal(latest)',
  'completeDeploymentDeal(latest, level)',
  'finishDeploymentCardReveal(latest)',
  'finishDeploymentCardDiscard(latest)',
  'onArrivingUnitIdsChange: reportArrivals',
  "reason: 'deployment-reroll'",
  'onUnitDepartureComplete={completeDeploymentRerollDeparture}',
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
  '<SkirmishShell',
  '<Strategikon',
  'KlerosisOverlay',
  'RunKlerosisWorkspace',
  "{mode || stage === 'pace' ? (",
  'chooseDeploymentMode',
  'switchDeploymentMode',
  'deployment-step-through',
  'Place {activeUnit.type',
]) {
  if (runScreen.includes(forbidden)) fail(runScreenPath, `forbidden local Run presentation authority: ${forbidden}`);
}

const deploymentCardStackPath = resolve(src, 'ui/RunDeploymentCardStack.tsx');
const deploymentCardStack = readFileSync(deploymentCardStackPath, 'utf8');
for (const required of [
  "document.querySelector<HTMLElement>('[data-run-card-flight-target]')",
  'data-deployment-card-stage={deployment?.stage',
  'data-deployment-stack-card={cardId}',
  '<RunCardBack mediaUrl={resolvedLiveMediaUrl(RUN_CARD_BACK_SLOT)} />',
  '<strong className="run-deployment-card-count"',
  'useSceneEnteredAction(`deployment-deal:',
  '<SceneContinuityPortal contribution={{ kind: \'shared-element\'',
  'data-deployment-center-deck=""',
  'useAppSettings()',
  'useSceneEnteredAction(`deployment-reveal:',
  'useSceneEnteredAction(`deployment-discard:',
]) {
  if (!deploymentCardStack.includes(required)) {
    fail(deploymentCardStackPath, `missing closed Deployment card-stack invariant: ${required}`);
  }
}
for (const forbidden of ['RunSceneViewport', 'Confirm', 'data-klerosis']) {
  if (deploymentCardStack.includes(forbidden)) {
    fail(deploymentCardStackPath, `forbidden Deployment card-stack authority: ${forbidden}`);
  }
}

const runFormPath = resolve(src, 'ui/RunForm.tsx');
const runForm = readFileSync(runFormPath, 'utf8');
for (const required of [
  "const RUN_ACTIVITY = Symbol('run-activity')",
  "const RUN_FORM = Symbol('run-form')",
  'add(activity: RunActivity): ReactElement',
  '<SkirmishShell',
  'titleBarContent={form.titleBarContent}',
  'lipsanonIds={form.lipsanonIds}',
  'surfaceSignature={activity.surfaceSignature ?? activity.id}',
  'strategikonPath,',
  'className="strategikon-slot"',
  '<Strategikon path={form.routePath} search={form.routeSearch} run={form.run} />',
  'RunForm accepts only runActivity contributions.',
]) {
  if (!runForm.includes(required)) fail(runFormPath, `missing closed Run form invariant: ${required}`);
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
  'launchLipsanon(lipsanonId, icon, destination)',
]) {
  if (!bona.includes(required)) fail(bonaPath, `missing authored Bona scene contribution: ${required}`);
}
if (bona.includes('useLipsanonFlight(')) {
  fail(bonaPath, 'Bona selection may receive the phase-owned launch capability but may not own the carried flight');
}
for (const required of [
  'useLipsanonFlight((lipsanonId)',
  "{ handoff: 'scene-settled' }",
  'launchLipsanon={launchBonaLipsanon}',
  '{bonaLipsanonFlightElement}',
]) {
  if (!runScreen.includes(required)) fail(runScreenPath, `missing Run phase-owned Bona continuity invariant: ${required}`);
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
  'if (!runDeployment && !unitDeparture && playableSurfaceReady && sceneActivated) activateClock()',
  'reveal={playableSurfaceReady && sceneRevealed}',
  'activate={!runDeployment && sceneActivated}',
  'interactive={!runDeployment && !unitDeparture && sceneActivated &&',
  'surfaceSignature={runBattle?.activityId}',
  'surfaceState={presentedDeploymentSurface}',
  'preserveBoardPresentation: true',
  // Activation releases an ordinary entrance; it does not decide whether there is one. A
  // terminal review deliberately keeps the already-arrived position settled instead.
  "unitArrivals={runBattleReviewTerminal ? 'settled' : sceneActivated ? 'active' : 'pending'}",
  // A navigated Battle delegates opacity to the authored scene so board readiness cannot start
  // a second serialized fade after the scene itself has entered.
  'revealTransition="scene"',
  // The shared arrival report still advances Deployment, and now also gates an exact crafted
  // terminal landing until the Battle's complete final position is seated.
  'runDeployment.onArrivingUnitIdsChange(unitIds)',
  'onArrivingUnitIdsChange={reportArrivingUnitIds}',
  'unitDeparture={unitDeparture}',
  'suspendForBoardDeparture()',
]) {
  if (!skirmish.includes(required)) fail(skirmishPath, `missing commit-gated Battle invariant: ${required}`);
}

const skirmishBoardPath = resolve(src, 'render/SkirmishBoard.tsx');
const skirmishBoard = readFileSync(skirmishBoardPath, 'utf8');
for (const required of [
  'newlyVisibleArrivalPieces(visibleUnitIdsRef.current, livePieces)',
  "if (unitArrivals === 'settled') arrivalPlansRef.current.clear()",
  "data-arriving-unit-ids={presentingArrivals ? arrivingUnitIds.join(',') : ''}",
  'data-unit-arrivals={unitArrivals}',
  'data-reveal-transition={revealTransition}',
  "export const UNIT_DEPARTURE_TRACKS = ['withdraw-home', 'withdraw-nearest-edge'] as const",
  "case 'deployment-reroll': return 'withdraw-home'",
  'data-departure-track={unitDeparture ? unitDepartureTrack(unitDeparture) : undefined}',
  'state.onUnitDepartureComplete(departureRequest.id)',
]) {
  if (!skirmishBoard.includes(required)) fail(skirmishBoardPath, `missing retained-board per-unit arrival invariant: ${required}`);
}

if (failures.length) {
  console.error('Presentation architecture check failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Presentation architecture check passed.');
