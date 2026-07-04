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

function checkFile(path) {
  const file = rel(path);
  const source = readFileSync(path, 'utf8');

  if (
    file !== 'src/ui/shell/ArtRouteChrome.tsx' &&
    /import\s+\{[^}]*\buseScreenEntrance\b[^}]*\}\s+from\s+['"][^'"]*useScreenEntrance['"]/.test(source)
  ) {
    errors.push(`${file}: import ArtRouteChrome/LightArtRouteShell instead of useScreenEntrance directly.`);
  }

  const importsAmbience = /import\s+\{\s*AmbienceBackground\s*\}\s+from\s+['"][^'"]*AmbienceBackground['"]/.test(source);
  const importsArtChrome = /from\s+['"][^'"]*ArtRouteChrome['"]/.test(source);
  const importsLightArtShell = /from\s+['"][^'"]*LightArtRouteShell['"]/.test(source);
  if (
    importsAmbience &&
    file !== 'src/ui/AmbienceBackground.tsx' &&
    file !== 'src/ui/shell/LightArtRouteShell.tsx' &&
    !importsArtChrome &&
    !importsLightArtShell
  ) {
    errors.push(`${file}: AmbienceBackground routes must render chrome through ArtRouteChrome or LightArtRouteShell.`);
  }
}

walk(uiDir);

const app = readFileSync(join(uiDir, 'App.tsx'), 'utf8');
if (!/if \(path === '\/skirmish'\) return <SkirmishMapPickerRoute \/>;/.test(app)) {
  errors.push('src/ui/App.tsx: /skirmish must render SkirmishMapPickerRoute, not the live Skirmish board.');
}

if (errors.length) {
  console.error('Light-art route chrome check failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('light-art route chrome check passed');
