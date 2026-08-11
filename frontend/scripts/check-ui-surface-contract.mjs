import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const BASELINE_PATH = 'scripts/ui-surface-debt-baseline.json';
const TOOLTIP_OWNER = 'src/ui/shared/InfoTip.tsx';
const SURFACE_CSS_PROPERTY = /^(?:background(?:-[a-z-]+)?|border(?:-[a-z-]+)?|box-shadow)$/i;
const SURFACE_JS_PROPERTY = /^(?:background[A-Z_a-z0-9]*|border[A-Z_a-z0-9]*|boxShadow)$/;
const APPROVED_FRAMELESS_SURFACE_RESETS = new Map([
  // ADR-0250 keeps the book art itself as the control. These declarations remove
  // native/active button chrome; they do not paint a parallel surface.
  ['src/style.css|.skirmish-hud-title-action', new Set([
    'background:none',
    'border:0',
    'border-radius:0',
    'box-shadow:none',
  ])],
  ['src/style.css|.skirmish-hud-title-action.active', new Set([
    'background:none',
    'border-color:transparent',
    'box-shadow:none',
  ])],
  // ADR-0254 retains one shared inner frame around the grouped reliquary. These
  // resets keep its icon triggers visually unframed inside that owned surface.
  ['src/style.css|.enchiridion-lipsanon-grouped-trigger', new Set([
    'background:none',
    'border:0',
    'border-radius:0',
  ])],
  // Bona Vacantia makes the lipsanon art itself the take target (no card, no panel). These
  // remove the shell's default button chrome from that trigger; they paint nothing.
  ['src/style.css|.run-vacantia-take', new Set([
    'background:none',
    'border:0',
    'border-radius:0',
    'box-shadow:none',
  ])],
  // ADR-0409 makes the title route itself navigation. The shared TitleRoute and
  // BrandLockup owners remove native button chrome so those canonical NavButtons
  // remain typography on the App-owned title surface rather than paint another one.
  ['src/style.css|.title-route-button', new Set([
    'background:none',
    'border:0',
    'border-radius:0',
    'box-shadow:none',
  ])],
  // A score-sheet row that can be navigated to is the SAME row, made pressable — move review
  // turns the Event Log's move lines into the way back through the game. These declarations
  // remove the native button paint so a navigable row and a plain one are pixel-identical;
  // the log card's own frame remains the complete owned surface.
  ['src/style.css|.skirmish-log-card li > button.skirmish-log-move', new Set([
    'background:none',
    'border:0',
  ])],
  // The accepted InnerChromeBox wrapper owns the Gold field's complete surface. These
  // declarations remove the native input paint inside that frame; they add no surface.
  ['src/style.css|.admin-gold-input', new Set([
    'background:transparent',
    'border:0',
  ])],
  // ADR-0492 makes each formation piece itself the optional card-seat control. These declarations
  // only remove native button paint; the shared card frame remains the complete owned surface.
  ['src/style.css|.run-card-formation-cell, button.run-card-formation-cell', new Set([
    'background:transparent',
    'border:0',
  ])],
  // Each Deployment hand mark is the glyph itself — one dot per dealt formation, filled once it
  // is on the board and pressable to go to it. These declarations remove native button paint
  // from that glyph; the Controls panel's own frame remains the complete owned surface.
  ['src/style.css|.run-arrangement-hand-mark', new Set([
    'background:none',
    'border:0',
  ])],
  // A Run-preparation section makes the BOX the disclosure — its name row fills the accepted
  // InnerChromeBox so the box's frame is the button's edge and pressing the slab is what opens
  // it. These declarations remove the shell's native button chrome from that row; a second frame
  // there would draw a control sitting IN the box instead of the box being the control.
  // A section box's closing verb IS the section: the grid row itself is the button, so the box's
  // own frame is its edge. These declarations remove the shell's native button chrome from that
  // row; a control nested inside it would draw a second rail just inside the first.
  ['src/style.css|.section-box-member-verb', new Set([
    'background:none',
    'border:0',
    'border-radius:0',
    'box-shadow:none',
  ])],
  ['src/style.css|.section-box-head', new Set([
    'background:none',
    'border:0',
    'border-radius:0',
    'box-shadow:none',
  ])],
  // The invariant title-bar cluster is one divided box, and each member is a COMPARTMENT of it
  // (ADR-0242). The box's installed frame is the seat's outer edge and the box's rail is the
  // edge it shares with the seat beside it, so these declarations remove the shell's native
  // button chrome — including the `button.active` gradient a lit seat would otherwise wear —
  // and paint nothing in its place.
  ['src/style.css|.titlebar-control.titlebar-control--seat', new Set([
    'background:none',
    'border:0',
    'border-radius:0',
    'box-shadow:none',
  ])],
  // A pad of equal compartments is one divided box, and each key is a COMPARTMENT of it
  // (ADR-0570). The box's installed frame is the seat's outer edge and the box's rail is the edge
  // it shares with the seat beside it, so these declarations remove the shell's native button
  // chrome and paint nothing in its place. Same category as the two resets above.
  ['src/style.css|.chrome-seat', new Set([
    'background:none',
    'border:0',
    'border-radius:0',
    'box-shadow:none',
  ])],
]);

function normalize(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function hash(parts) {
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

function findOpenBrace(source, start, end) {
  let quote = '';
  for (let index = start; index < end; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (!quote && char === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      return close === -1 ? -1 : findOpenBrace(source, close + 2, end);
    }
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') return index;
  }
  return -1;
}

function findCloseBrace(source, open, end) {
  let depth = 1;
  let quote = '';
  for (let index = open + 1; index < end; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (!quote && char === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      if (close === -1) return -1;
      index = close + 1;
      continue;
    }
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function splitDeclarations(body) {
  const declarations = [];
  let start = 0;
  let quote = '';
  let parenDepth = 0;
  for (let index = 0; index <= body.length; index += 1) {
    const char = body[index] ?? ';';
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[') parenDepth += 1;
    if (char === ')' || char === ']') parenDepth = Math.max(0, parenDepth - 1);
    if (char !== ';' || parenDepth !== 0) continue;
    const raw = body.slice(start, index).trim();
    start = index + 1;
    const colon = raw.indexOf(':');
    if (colon <= 0) continue;
    declarations.push({
      property: normalize(raw.slice(0, colon)).toLowerCase(),
      value: normalize(raw.slice(colon + 1)),
    });
  }
  return declarations;
}

function isContainerAtRule(header, body) {
  if (!header.startsWith('@')) return false;
  if (/^@(font-face|page|property|counter-style)\b/i.test(header)) return false;
  return findOpenBrace(body, 0, body.length) !== -1;
}

function isApprovedFramelessSurfaceReset(file, selector, property, value) {
  return APPROVED_FRAMELESS_SURFACE_RESETS
    .get(`${file}|${selector}`)
    ?.has(`${property}:${value}`) ?? false;
}

function parseCssRange(source, file, start, end, context, entries) {
  let cursor = start;
  while (cursor < end) {
    const open = findOpenBrace(source, cursor, end);
    if (open === -1) break;
    const close = findCloseBrace(source, open, end);
    if (close === -1) throw new Error(`${file}: unbalanced CSS block`);
    const rawHeader = source.slice(cursor, open);
    const header = normalize(rawHeader.slice(rawHeader.lastIndexOf(';') + 1));
    const body = source.slice(open + 1, close);
    if (header) {
      if (isContainerAtRule(header, body)) {
        parseCssRange(source, file, open + 1, close, [...context, header], entries);
      } else {
        const declarations = splitDeclarations(body)
          .filter(({ property }) => SURFACE_CSS_PROPERTY.test(property))
          .filter(({ property, value }) =>
            !isApprovedFramelessSurfaceReset(file, header, property, value))
          .map(({ property, value }) => `${property}:${value}`)
          .sort();
        if (declarations.length) {
          entries.push({
            kind: 'css',
            file,
            context: context.join(' / '),
            selector: header,
            surfaceHash: hash(declarations),
          });
        }
      }
    }
    cursor = close + 1;
  }
}

function addOccurrences(entries) {
  const counts = new Map();
  return entries.map((entry) => {
    const base = `${entry.kind}\u0000${entry.file}\u0000${entry.context}\u0000${entry.selector}`;
    const occurrence = (counts.get(base) ?? 0) + 1;
    counts.set(base, occurrence);
    return { ...entry, occurrence };
  });
}

export function collectCssSurfaceRules(source, file = 'src/style.css') {
  const entries = [];
  parseCssRange(source, file, 0, source.length, [], entries);
  return addOccurrences(entries);
}

function propertyName(node, file) {
  if (!node.name) return '';
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name)) return node.name.text;
  return node.name.getText(file);
}

function jsxAttributeString(opening, name) {
  const attribute = opening.attributes.properties.find((candidate) =>
    ts.isJsxAttribute(candidate) && candidate.name.text === name);
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer)
    && attribute.initializer.expression
    && ts.isStringLiteral(attribute.initializer.expression)) {
    return attribute.initializer.expression.text;
  }
  return null;
}

export function collectInlineSurfaceStyles(source, relativePath = 'src/example.tsx') {
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const entries = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const style = node.attributes.properties.find((candidate) =>
        ts.isJsxAttribute(candidate) && candidate.name.text === 'style');
      const expression = style && ts.isJsxAttribute(style)
        && style.initializer && ts.isJsxExpression(style.initializer)
        ? style.initializer.expression
        : null;
      if (expression && ts.isObjectLiteralExpression(expression)) {
        const declarations = expression.properties
          .filter((property) => ts.isPropertyAssignment(property))
          .map((property) => ({
            property: propertyName(property, file),
            value: ts.isPropertyAssignment(property) ? normalize(property.initializer.getText(file)) : '',
          }))
          .filter(({ property }) => SURFACE_JS_PROPERTY.test(property))
          .map(({ property, value }) => `${property}:${value}`)
          .sort();
        if (declarations.length) {
          entries.push({
            kind: 'inline',
            file: relativePath,
            context: '',
            selector: `<${node.tagName.getText(file)} style>`,
            surfaceHash: hash(declarations),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return addOccurrences(entries);
}

export function checkTooltipSource(relativePath, source) {
  const failures = [];
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (jsxAttributeString(node, 'role') === 'tooltip') {
        const tag = node.tagName.getText(file);
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        if (relativePath !== TOOLTIP_OWNER || tag !== 'InnerChromeBox') {
          failures.push(`${relativePath}:${line}: role="tooltip" must be owned by ${TOOLTIP_OWNER} and rendered through InnerChromeBox.`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return failures;
}

function sourceFilesPortable(root) {
  const results = [];
  const visit = (directoryUrl, relative) => {
    for (const entry of readdirSync(directoryUrl, { withFileTypes: true })) {
      const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl);
      const entryRelative = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(entryUrl, entryRelative);
      else results.push(entryRelative);
    }
  };
  visit(new URL('src/', root), 'src');
  return results;
}

export function buildSurfaceSnapshot(root = new URL('../', import.meta.url)) {
  const entries = [];
  const failures = [];
  for (const relativePath of sourceFilesPortable(root)) {
    const source = readFileSync(new URL(relativePath, root), 'utf8');
    if (relativePath.endsWith('.css')) entries.push(...collectCssSurfaceRules(source, relativePath));
    if (/\.[jt]sx$/.test(relativePath)) {
      entries.push(...collectInlineSurfaceStyles(source, relativePath));
      failures.push(...checkTooltipSource(relativePath, source));
    }
  }
  entries.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    snapshot: {
      version: 1,
      rule: 'No new CSS or inline background/border/box-shadow surface paint outside registered chrome primitives.',
      entries,
    },
    failures,
  };
}

function entryIdentity(entry) {
  return `${entry.kind}|${entry.file}|${entry.context}|${entry.selector}|${entry.occurrence}`;
}

export function compareSurfaceSnapshots(baseline, current) {
  const failures = [];
  const baselineById = new Map(baseline.entries.map((entry) => [entryIdentity(entry), entry]));
  const currentById = new Map(current.entries.map((entry) => [entryIdentity(entry), entry]));
  for (const [id, entry] of currentById) {
    const previous = baselineById.get(id);
    if (!previous) failures.push(`new unregistered surface paint: ${id}`);
    else if (previous.surfaceHash !== entry.surfaceHash) failures.push(`changed unregistered surface paint: ${id}`);
  }
  for (const id of baselineById.keys()) {
    if (!currentById.has(id)) failures.push(`retired surface debt remains in the baseline: ${id}`);
  }
  return failures;
}

export function run(root = new URL('../', import.meta.url), { writeBaseline = false } = {}) {
  const { snapshot, failures } = buildSurfaceSnapshot(root);
  if (failures.length) return failures;
  const baselineUrl = new URL(BASELINE_PATH, root);
  if (writeBaseline) {
    writeFileSync(baselineUrl, `${JSON.stringify(snapshot, null, 2)}\n`);
    return [];
  }
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselineUrl, 'utf8'));
  } catch (error) {
    return [`${BASELINE_PATH}: cannot read the required surface-debt baseline (${error.message}).`];
  }
  return compareSurfaceSnapshots(baseline, snapshot);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const writeBaseline = process.argv.includes('--write-baseline');
  const failures = run(new URL('../', import.meta.url), { writeBaseline });
  if (failures.length) {
    console.error('\n✗ UI surface contract gate FAILED (ADR-0032/0059/0201):');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error('Use registered shared chrome. Update the explicit baseline only for owner-approved legacy debt.');
    process.exit(1);
  }
  if (writeBaseline) {
    console.log(`✓ Wrote ${BASELINE_PATH}. Review every baseline change as legacy UI debt.`);
  } else {
    console.log('✓ UI surface contract gate OK: no new raw surface paint or tooltip owner bypass.');
  }
}
