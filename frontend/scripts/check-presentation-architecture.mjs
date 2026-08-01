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
}

const runScreenPath = resolve(src, 'ui/RunScreen.tsx');
const runScreen = readFileSync(runScreenPath, 'utf8');
for (const required of [
  'sceneSnapshot: RunSceneSnapshot',
  'const run = sceneSnapshot.run;',
  '<RunPresentationSceneSlot',
  'navigateApp(nextHref, { replace: true, scroll: false })',
]) {
  if (!runScreen.includes(required)) fail(runScreenPath, `missing closed Run scene-source invariant: ${required}`);
}
for (const forbidden of ['window.history', 'setTimeout(', 'RunWorkspaceStages', 'PaintedSurfaceBoundary']) {
  if (runScreen.includes(forbidden)) fail(runScreenPath, `forbidden local Run presentation authority: ${forbidden}`);
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

const skirmishPath = resolve(src, 'ui/Skirmish.tsx');
const skirmish = readFileSync(skirmishPath, 'utf8');
for (const required of [
  '<SkirmishStoreProvider>',
  '<SceneSurfaceReadiness',
  'if (playableSurfaceReady && sceneActivated) activateClock()',
  'reveal={playableSurfaceReady && sceneRevealed}',
  'activate={sceneActivated}',
  'interactive={sceneActivated &&',
]) {
  if (!skirmish.includes(required)) fail(skirmishPath, `missing commit-gated Battle invariant: ${required}`);
}

if (failures.length) {
  console.error('Presentation architecture check failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Presentation architecture check passed.');
