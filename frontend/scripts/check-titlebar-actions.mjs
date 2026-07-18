#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'src', 'ui');
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (/\.(tsx|ts)$/.test(entry)) files.push(path);
  }
}

walk(root);

const failures = [];
const allowedPrimitiveConsumers = new Set([
  'src/ui/shell/TitleBarControls.tsx',
  'src/ui/shared/HeaderAccountCluster.tsx',
  'src/ui/shared/AccountMenu.tsx',
]);

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(process.cwd(), file).replaceAll('\\', '/');

  if (/TitleBarSlot\s+region=["']actions["']/.test(source)) {
    failures.push(`${rel}: arbitrary title-bar action slots are retired; contribute typed TitleBarControlSpec values.`);
  }
  if (/\bTitleBarActions\b/.test(source)) {
    failures.push(`${rel}: TitleBarActions is retired; AppTitleBar owns the one control lane.`);
  }
  if (!allowedPrimitiveConsumers.has(rel)
    && /\bTitleBar(?:Icon)?ButtonPrimitive\b/.test(source)) {
    failures.push(`${rel}: routed code cannot import or render private title-bar button primitives.`);
  }

  const centerSlotBodies = [...source.matchAll(/<TitleBarSlot\s+region=["']center["'][^>]*>([\s\S]*?)<\/TitleBarSlot>/g)]
    .map((match) => match[1]);
  for (const body of centerSlotBodies) {
    if (/<(?:button|NavButton|TitleBarButtonPrimitive)\b/.test(body)) {
      failures.push(`${rel}: the center slot cannot host ordinary buttons; use a typed control contribution.`);
    }
  }

  const legacyButtonOpenings = source.match(/<(?:button|NavButton)\b[^>]*app-header-button[^>]*>/g) ?? [];
  for (const opening of legacyButtonOpenings) {
    if (!opening.includes('data-chrome-unit=') || !opening.includes('chromeUnitClassNames(')) {
      failures.push(`${rel}: app-header-button may provide layout only; every consumer must declare registered chrome ownership.`);
    }
  }
}

const controlsPath = join(root, 'shell', 'TitleBarControls.tsx');
const controls = readFileSync(controlsPath, 'utf8');
if (!/export type TitleBarControlSpec\b/.test(controls)
  || !/function TitleBarControlContribution\b/.test(controls)
  || !/beforeDividerNode/.test(controls)) {
  failures.push('src/ui/shell/TitleBarControls.tsx: typed before-divider contribution API is missing.');
}
if (/interface TitleBarControlBase[\s\S]*?\b(?:className|style|children)\??:/.test(controls)) {
  failures.push('src/ui/shell/TitleBarControls.tsx: contributed control descriptions may not expose markup or layout escape hatches.');
}
if (!/chromeUnitClassNames\(\s*'inner-box'/.test(controls)
  || !/data-chrome-unit="inner-box"/.test(controls)) {
  failures.push('src/ui/shell/TitleBarControls.tsx: private title-bar buttons must be registered inner-box chrome units.');
}
if (!/function\s+TitleBarStatus[\s\S]*?data-chrome-unit="inner-box"[\s\S]*?chromeUnitClassNames\('inner-box', 'titlebar-status'/.test(controls)) {
  failures.push('src/ui/shell/TitleBarControls.tsx: canonical title-bar status objects must be registered inner-box chrome units.');
}

const appTitleBar = readFileSync(join(root, 'shell', 'AppTitleBar.tsx'), 'utf8');
if (!/<div className="app-titlebar-control-lane">[\s\S]*?app-titlebar-contribution-target[\s\S]*?app-titlebar-persistent-divider[\s\S]*?<HeaderAccountCluster/.test(appTitleBar)) {
  failures.push('src/ui/shell/AppTitleBar.tsx: contributed controls, persistent divider, and invariant controls must share one ordered lane.');
}
if (/app-shell-titlebar-actions|app-titlebar-trailing-menu/.test(appTitleBar)) {
  failures.push('src/ui/shell/AppTitleBar.tsx: retired split action/trailing layout returned.');
}

const accountMenu = readFileSync(join(root, 'shared', 'AccountMenu.tsx'), 'utf8');
if (!/<TitleBarButtonPrimitive[\s\S]*?account-avatar-button/.test(accountMenu)
  || /<button[\s\S]{0,180}account-avatar-button/.test(accountMenu)) {
  failures.push('src/ui/shared/AccountMenu.tsx: account trigger must use the private registered title-bar primitive.');
}

const bgm = readFileSync(join(process.cwd(), 'src', 'bgm.js'), 'utf8');
if (!/dataset\.chromeUnit\s*=\s*'inner-box'/.test(bgm)
  || !/className\s*=\s*'inner-box titlebar-control titlebar-control--icon bgm-control'/.test(bgm)) {
  failures.push('src/bgm.js: dynamic music title-bar button must declare registered inner-box ownership.');
}

const styleCss = readFileSync(join(process.cwd(), 'src', 'style.css'), 'utf8');
const runtimeSources = [...files.map((file) => readFileSync(file, 'utf8')), bgm, styleCss].join('\n');
if (/\/assets\/ui\/kit\/mode-button(?:-active)?\.png/.test(runtimeSources)) {
  failures.push('runtime source must not reference the retired mode-button frame; registered inner chrome owns button art.');
}
const appHeaderButtonBlock = styleCss.match(/\.app-header-button\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
if (/border(?:-image)?\s*:|border-image-(?:source|slice|width|repeat)\s*:/.test(appHeaderButtonBlock)) {
  failures.push('.app-header-button is layout-only and must not own frame geometry.');
}
if (!/\.app-titlebar-control-lane\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?gap:\s*var\(--titlebar-control-gap\)/.test(styleCss)
  || !/\.app-titlebar-contributed-controls\s*\{[\s\S]*?gap:\s*var\(--titlebar-control-gap\)/.test(styleCss)
  || !/\.app-titlebar-persistent-divider\s*\{[\s\S]*?anchor-name:\s*--app-titlebar-persistent-divider/.test(styleCss)) {
  failures.push('src/style.css: the canonical control lane must own alignment, gaps, and the real divider track.');
}
if (/app-shell-titlebar-actions|app-titlebar-trailing-menu|\.titlebar-actions\b/.test(styleCss)) {
  failures.push('src/style.css: retired split title-bar layout selectors returned.');
}
if (/(?:\.le-topbar|\.ce-topbar|\.studio-topbar|\.settings-topbar|\.level-editor-screen|\.tileset-studio|\.settings-screen)[^{}]*(?:\.titlebar-control|\.app-titlebar-control-lane|\.app-titlebar-contributed-controls)[^{]*\{/s.test(styleCss)) {
  failures.push('src/style.css: routes may not position or resize title-bar controls locally.');
}

if (failures.length) {
  console.error('Title-bar control contract violations:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
