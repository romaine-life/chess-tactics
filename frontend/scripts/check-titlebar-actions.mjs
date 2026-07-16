#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'src', 'ui');
const slotRe = /<TitleBarSlot\s+region=["']actions["'][^>]*>([\s\S]*?)<\/TitleBarSlot>/g;
const centerSlotRe = /<TitleBarSlot\s+region=["']center["'][^>]*>([\s\S]*?)<\/TitleBarSlot>/g;
const forbiddenClassRe = /app-header-button|studio-mode-icon|studio-mode-nav|studio-topbar-actions|le-topbar-actions|titlebar-return-button/;
const directButtonRe = /<(?:button|NavButton)\b/;
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
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const legacyButtonOpenings = source.match(/<(?:button|NavButton)\b[^>]*app-header-button[^>]*>/g) ?? [];
  for (const opening of legacyButtonOpenings) {
    if (!opening.includes('data-chrome-unit=') || !opening.includes('chromeUnitClassNames(')) {
      failures.push(`${relative(process.cwd(), file)}: app-header-button may provide layout only; every consumer must declare registered chrome ownership.`);
    }
  }
  for (const match of source.matchAll(slotRe)) {
    const body = match[1];
    if (!body.includes('<TitleBarActions')) {
      failures.push(`${relative(process.cwd(), file)}: actions TitleBarSlot must wrap content in <TitleBarActions>.`);
    }
    if (forbiddenClassRe.test(body)) {
      failures.push(`${relative(process.cwd(), file)}: actions TitleBarSlot contains legacy title-bar button/layout classes.`);
    }
    if (directButtonRe.test(body)) {
      failures.push(`${relative(process.cwd(), file)}: actions TitleBarSlot buttons must use the class-owned <TitleBarButton> primitive.`);
    }
  }
  for (const match of source.matchAll(centerSlotRe)) {
    const body = match[1];
    if (directButtonRe.test(body)) {
      failures.push(`${relative(process.cwd(), file)}: center TitleBarSlot buttons must use the class-owned <TitleBarButton> primitive.`);
    }
    const rawStatusOpenings = body.match(/<div\b[^>]*skirmish-status-chip[^>]*>/g) ?? [];
    if (rawStatusOpenings.length) {
      failures.push(`${relative(process.cwd(), file)}: framed title-bar status objects must use the class-owned <TitleBarStatus> primitive.`);
    }
  }
}

const titleControlsPath = join(root, 'shell', 'TitleBarControls.tsx');
const titleControls = readFileSync(titleControlsPath, 'utf8');
if (!/chromeUnitClassNames\(\s*'inner-box'/.test(titleControls)
  || !/data-chrome-unit="inner-box"/.test(titleControls)) {
  failures.push('src/ui/shell/TitleBarControls.tsx: canonical title-bar buttons must be registered inner-box chrome units.');
}
if (!/function\s+TitleBarStatus[\s\S]*?data-chrome-unit="inner-box"[\s\S]*?chromeUnitClassNames\('inner-box', 'titlebar-status'/.test(titleControls)) {
  failures.push('src/ui/shell/TitleBarControls.tsx: canonical title-bar status objects must be registered inner-box chrome units.');
}

const accountMenu = readFileSync(join(root, 'shared', 'AccountMenu.tsx'), 'utf8');
if (!/<TitleBarButton[\s\S]*?account-avatar-button/.test(accountMenu)
  || /<button[\s\S]{0,180}account-avatar-button/.test(accountMenu)) {
  failures.push('src/ui/shared/AccountMenu.tsx: account trigger must use the class-owned <TitleBarButton> primitive.');
}

const bgm = readFileSync(join(process.cwd(), 'src', 'bgm.js'), 'utf8');
if (!/dataset\.chromeUnit\s*=\s*'inner-box'/.test(bgm)
  || !/className\s*=\s*'inner-box titlebar-control titlebar-control--icon bgm-control'/.test(bgm)) {
  failures.push('src/bgm.js: dynamic music title-bar button must declare the registered inner-box class and unit ownership.');
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

if (failures.length) {
  console.error('Title-bar actions contract violations:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
