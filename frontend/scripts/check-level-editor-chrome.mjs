import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const CONSUMERS = [
  'src/ui/LevelEditor.tsx',
  'src/ui/LevelEditorChromeConsumers.tsx',
  'src/ui/VictoryConditionsEditor.tsx',
  'src/ui/shared/BoardSizePanel.tsx',
];

function attr(opening, name) {
  const prop = opening.attributes.properties.find((candidate) =>
    ts.isJsxAttribute(candidate) && candidate.name.text === name);
  if (!prop || !ts.isJsxAttribute(prop) || !prop.initializer || !ts.isStringLiteral(prop.initializer)) return null;
  return prop.initializer.text;
}

export function checkTsx(relativePath, source) {
  const failures = [];
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      if (tag === 'select') {
        failures.push(`${relativePath}:${line}: native <select> is forbidden; use HouseSelect (inner-dropdown).`);
      }
      if (tag === 'button' && !attr(node, 'data-chrome-unit')) {
        failures.push(`${relativePath}:${line}: Level Editor button must inherit a registered chrome unit.`);
      }
      const unit = attr(node, 'data-chrome-unit');
      const namedBrushDebt = relativePath === 'src/ui/LevelEditor.tsx'
        && unit === 'inner-box' && attr(node, 'className') === null
        && node.getText(file).includes("chromeUnitClassNames('inner-box', 'le-brush-thumb')");
      if ((unit === 'inner-box' || unit === 'outer-panel') && tag !== 'InnerChromeBox' && tag !== 'OuterChromeBox' && !namedBrushDebt) {
        failures.push(`${relativePath}:${line}: ${unit} must be instantiated through its shared ChromeBox component.`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return failures;
}

export function checkCss(source) {
  const failures = [];
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const body = match[2];
    const inventedControl = /\.board-size[^,{]*(?:select|button)|\.le-[\w-]*(?:dropdown|select|button|box)(?![\w-])/.test(selector);
    if (inventedControl && /\b(?:background(?:-image)?|border(?:-image(?:-(?:source|slice|width|repeat))?)?)\s*:\s*(?!var\(--(?:le|skirmish)-chrome)/.test(body)) {
      failures.push(`src/style.css: bespoke Level Editor control chrome in selector ${selector}`);
    }
  }
  return failures;
}

export function run(root = new URL('../', import.meta.url)) {
  const failures = CONSUMERS.flatMap((path) => checkTsx(path, readFileSync(new URL(path, root), 'utf8')));
  failures.push(...checkCss(readFileSync(new URL('src/style.css', root), 'utf8')));
  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = run();
  if (failures.length) {
    console.error('\n✗ Level Editor chrome architecture gate FAILED (ADR-0059/0082/0095):');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('✓ Level Editor chrome architecture gate OK: controls use the canonical role hierarchy.');
}
