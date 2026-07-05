#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'src', 'ui');
const slotRe = /<TitleBarSlot\s+region=["']actions["'][^>]*>([\s\S]*?)<\/TitleBarSlot>/g;
const forbiddenClassRe = /app-header-button|studio-mode-icon|studio-mode-nav|studio-topbar-actions|le-topbar-actions|titlebar-return-button/;
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
  for (const match of source.matchAll(slotRe)) {
    const body = match[1];
    if (!body.includes('<TitleBarActions')) {
      failures.push(`${relative(process.cwd(), file)}: actions TitleBarSlot must wrap content in <TitleBarActions>.`);
    }
    if (forbiddenClassRe.test(body)) {
      failures.push(`${relative(process.cwd(), file)}: actions TitleBarSlot contains legacy title-bar button/layout classes.`);
    }
  }
}

if (failures.length) {
  console.error('Title-bar actions contract violations:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
