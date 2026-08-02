import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const RAW_CHROME_BUTTON_EXCEPTIONS = new Set([
  'src/ui/ChromeUnitAudit.tsx',
  'src/ui/shared/ChromeButton.tsx',
]);
const STUDIO_CARD_EXCEPTION = 'src/ui/studio/StudioCatalogCard.tsx';
const CHOICE_GROUP_EXCEPTION = 'src/ui/shared/ChoiceGroup.tsx';
const APPARATUS_RAIL_COLUMN_EXCEPTION = 'src/ui/shared/ApparatusRailTab.tsx';
const APPARATUS_RAIL_COLUMN_CLASSES = /\b(?:settings-rail-frame|menu-dest-tabs|strategikon-rail|enchiridion-section-rail)\b/;

function attr(opening, name) {
  return opening.attributes.properties.find((candidate) =>
    ts.isJsxAttribute(candidate) && candidate.name.text === name) ?? null;
}

export function checkTsx(relativePath, source) {
  const failures = [];
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      const text = node.getText(file);
      const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      if ((tag === 'button' || tag === 'NavButton')
        && attr(node, 'data-chrome-unit')
        && !RAW_CHROME_BUTTON_EXCEPTIONS.has(relativePath)) {
        failures.push(`${relativePath}:${line}: registered chrome buttons must use ChromeButton or ChromeNavButton.`);
      }
      if (tag === 'button' && text.includes('tileset-studio-card') && relativePath !== STUDIO_CARD_EXCEPTION) {
        failures.push(`${relativePath}:${line}: Studio catalog cards must use StudioCatalogCard.`);
      }
      if (text.includes('tileset-tier-seg') && relativePath !== CHOICE_GROUP_EXCEPTION) {
        failures.push(`${relativePath}:${line}: segmented choices must use ChoiceGroup.`);
      }
      if (tag === 'aside'
        && APPARATUS_RAIL_COLUMN_CLASSES.test(text)
        && relativePath !== APPARATUS_RAIL_COLUMN_EXCEPTION) {
        failures.push(`${relativePath}:${line}: menu-language rail columns must use ApparatusRailColumn.`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return failures;
}

export function checkCss(source) {
  const failures = [];
  for (const selector of [
    '.settings-row + .settings-row',
    '.ce-editor-level-row + .ce-editor-level-row',
    '.campaign-level-row + .campaign-level-row',
  ]) {
    if (source.includes(selector)) failures.push(`src/style.css: positional row geometry is forbidden: ${selector}`);
  }
  return failures;
}

export function checkNet(relativePath, source) {
  return /async\s+function\s+request\s*<T>/.test(source)
    ? [`${relativePath}: duplicated generic request helper; use requestJson from net/http.ts.`]
    : [];
}

function filesUnder(directory, extension) {
  return readdirSync(directory).flatMap((name) => {
    const absolute = path.join(directory, name);
    return statSync(absolute).isDirectory()
      ? filesUnder(absolute, extension)
      : absolute.endsWith(extension) ? [absolute] : [];
  });
}

export function run(root = new URL('../', import.meta.url)) {
  const rootPath = fileURLToPath(root);
  const failures = [];
  for (const absolute of filesUnder(path.join(rootPath, 'src', 'ui'), '.tsx')) {
    const relative = path.relative(rootPath, absolute).replaceAll('\\', '/');
    failures.push(...checkTsx(relative, readFileSync(absolute, 'utf8')));
  }
  for (const absolute of filesUnder(path.join(rootPath, 'src', 'net'), '.ts')) {
    const relative = path.relative(rootPath, absolute).replaceAll('\\', '/');
    failures.push(...checkNet(relative, readFileSync(absolute, 'utf8')));
  }
  failures.push(...checkCss(readFileSync(path.join(rootPath, 'src', 'style.css'), 'utf8')));
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = run();
  if (failures.length) {
    console.error('\n✗ Shared primitive architecture gate FAILED (ADR-0059):');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('✓ Shared primitive architecture gate OK: repeated controls use canonical renderers.');
}
