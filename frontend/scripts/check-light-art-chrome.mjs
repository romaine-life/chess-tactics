#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const uiDir = join(root, 'src', 'ui');
const errors = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
    } else if (/\.(tsx|ts)$/.test(entry)) {
      checkFile(path);
    }
  }
}

function rel(path) {
  return relative(root, path).replaceAll('\\', '/');
}

// The sole owner of the homepage backdrop (menu scene + synced rain). Every other screen
// renders <HomepageBackdrop/>; only this file wires the scene node + rain canvases.
const BACKDROP_OWNER = 'src/ui/HomepageBackdrop.tsx';

function checkFile(path) {
  const file = rel(path);
  const source = readFileSync(path, 'utf8');

  if (
    file !== 'src/ui/shell/ArtRouteChrome.tsx' &&
    /import\s+\{[^}]*\buseScreenEntrance\b[^}]*\}\s+from\s+['"][^'"]*useScreenEntrance['"]/.test(source)
  ) {
    errors.push(`${file}: import ArtRouteChrome/LightArtRouteShell instead of useScreenEntrance directly.`);
  }

  // Single-owner rule (ADR-0064): the homepage backdrop is ONE continuous instance shared by
  // every homepage-family surface, so it can never re-mount/re-adjust on navigation. Screens
  // render <HomepageBackdrop/> — never a bespoke <AmbienceBackground/> rain (folded into it)
  // nor the standalone <SceneBackdrop/> component (a per-screen scene re-crops on every hop).
  // Importing SCENE_ANIMS/buildSceneBackdropNode as data is fine — only a rival RENDERER is banned.
  const importsAmbience =
    /from\s+['"][^'"]*AmbienceBackground['"]/.test(source) || /<AmbienceBackground[\s/>]/.test(source);
  if (importsAmbience && file !== BACKDROP_OWNER) {
    errors.push(`${file}: render <HomepageBackdrop/> — AmbienceBackground was folded into it (single-owner backdrop, ADR-0064).`);
  }

  // The standalone <SceneBackdrop> React component is a STUDIO INSPECTOR render only (SceneAnimLab
  // overlays region boxes on a calibration scene). Navigation screens must never render it — they
  // use HomepageBackdrop. Importing the component anywhere else is the re-mount/re-crop drift.
  const SCENE_COMPONENT_ALLOWED = new Set([BACKDROP_OWNER, 'src/ui/SceneAnimLab.tsx']);
  const importsSceneComponent =
    /import\s+\{[^}]*\bSceneBackdrop\b[^}]*\}\s+from\s+['"][^'"]*SceneBackdrop['"]/.test(source);
  if (importsSceneComponent && !SCENE_COMPONENT_ALLOWED.has(file)) {
    errors.push(`${file}: render <HomepageBackdrop/> — the SceneBackdrop component is for the studio inspector only (single-owner backdrop, ADR-0064).`);
  }

  // A homepage-backdrop route enrolls its chrome through ArtRouteChrome/LightArtRouteShell, so the
  // entrance fade touches the CHROME ROOT only and the continuous backdrop never re-fades
  // (ADR-0046 §B/G, ADR-0049).
  const importsBackdrop = /import\s+\{\s*HomepageBackdrop\s*\}\s+from\s+['"][^'"]*HomepageBackdrop['"]/.test(source);
  const importsArtChrome = /from\s+['"][^'"]*ArtRouteChrome['"]/.test(source);
  const importsLightArtShell = /from\s+['"][^'"]*LightArtRouteShell['"]/.test(source);
  if (
    importsBackdrop &&
    file !== BACKDROP_OWNER &&
    file !== 'src/ui/shell/LightArtRouteShell.tsx' &&
    !importsArtChrome &&
    !importsLightArtShell
  ) {
    errors.push(`${file}: HomepageBackdrop routes must render chrome through ArtRouteChrome or LightArtRouteShell.`);
  }
}

walk(uiDir);

const app = readFileSync(join(uiDir, 'App.tsx'), 'utf8');
// The live game board (<Skirmish/>) is reachable at exact /play ONLY. The unified selector lives
// under /play/select/* inside the persistent menu shell and must never render the board directly.
if (!/if \(path === '\/play'\) return <Skirmish \/>;/.test(app)) {
  errors.push('src/ui/App.tsx: /play must render the live Skirmish board (<Skirmish/>).');
}
if (/play\/select[^\n]*<Skirmish\b/.test(app)) {
  errors.push('src/ui/App.tsx: /play/select/* must NOT render the live Skirmish board — exact /play owns it.');
}

if (errors.length) {
  console.error('Light-art route chrome check failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('light-art route chrome check passed');
