#!/usr/bin/env node
// GUARD: the stylesheet must PARSE, and it must still contain the rules it is supposed to.
//
// Why this exists: a single stray backslash in front of a comment opener — `\/*` instead of `/*`
// — silently killed everything after line 6885 of `style.css`. CSS never opened the comment, so
// the rest of the file became one unterminated garbage declaration and Chrome dropped it: 908
// rules parsed instead of 4156. On screen the whole app collapsed — rail tabs lost their grid,
// every column stretched to the viewport, closed disclosures painted themselves open.
//
// Every gate stayed green. `tsc` does not read CSS; vitest reads style.css as TEXT and matches
// substrings, which the broken file still satisfied; and check-ui-surface-contract.mjs walks
// braces, which stayed balanced. The one thing nothing checked was whether a CSS PARSER agrees
// the file is CSS.
//
// Two assertions, because a parser alone is not enough: PostCSS is lenient about a lot, and a
// file that parses to a handful of rules is as broken as one that throws.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const SHEET = 'src/style.css';

/**
 * The floor for how many rules the sheet must yield. Not a target — a tripwire, set well under
 * the real count so ordinary edits never touch it and a truncation cannot hide under it. The
 * escaped-comment break produced 908.
 */
const MINIMUM_RULES = 3000;

/**
 * Rules that must exist AFTER the middle of the file, so a truncation anywhere cannot pass by
 * parsing cleanly up to the break. Each is load-bearing chrome from a different region.
 */
const REQUIRED_SELECTORS = [
  '.settings-tab',
  '.house-select-option',
  '.play-detail-card',
  '.chrome-divided-grid__row',
  '.skirmish-board-lab',
];

export function checkStylesheet(css) {
  const failures = [];
  let root;
  try {
    root = postcss.parse(css, { from: SHEET });
  } catch (error) {
    return [`${SHEET} does not parse as CSS: ${error.message}`];
  }

  // A comment opener the parser did not take is the exact shape of the bug this guard exists for,
  // and PostCSS is happy to read `\/* … */` as a declaration rather than complain.
  css.split('\n').forEach((line, index) => {
    if (/^\s*\\/.test(line)) {
      failures.push(`${SHEET}:${index + 1} begins with a backslash — a comment opened as \`\\/*\` is not a comment, and everything after it is discarded.`);
    }
  });

  let ruleCount = 0;
  const selectors = new Set();
  root.walkRules((rule) => {
    ruleCount += 1;
    for (const selector of rule.selectors) selectors.add(selector);
  });

  if (ruleCount < MINIMUM_RULES) {
    failures.push(`${SHEET} parsed to ${ruleCount} rules, under the ${MINIMUM_RULES} floor — the sheet is truncated.`);
  }
  for (const needle of REQUIRED_SELECTORS) {
    if (![...selectors].some((selector) => selector.includes(needle))) {
      failures.push(`${SHEET} parsed without any rule for \`${needle}\` — the sheet is truncated before it.`);
    }
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-stylesheet-parses.mjs')) {
  const path = fileURLToPath(new URL(`../${SHEET}`, import.meta.url));
  const failures = checkStylesheet(readFileSync(path, 'utf8'));
  if (failures.length) {
    console.error('✗ stylesheet parse gate FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('✓ check-stylesheet-parses: style.css parses, and every load-bearing region survives it.');
}
