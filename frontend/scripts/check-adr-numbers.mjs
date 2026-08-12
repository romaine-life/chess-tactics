#!/usr/bin/env node
// GUARD: an ADR number identifies exactly one decision, and a cited number resolves.
//
// Why this exists: comments cite decisions by NUMBER — `(ADR-0433)` — because that is what fits in
// a comment. When two ADRs share a number, every one of those citations becomes a question rather
// than an answer, and the reader cannot tell which decision the author meant. It is not
// theoretical: #936 resolved a collision by renaming its own ADR to 0588 and replacing "ADR-0587"
// with "ADR-0588" across the tree, which swept up all thirteen citations belonging to #942's
// guest-owned Runs and left that decision with no correct reference anywhere in code. The comments
// then pointed confidently at an unrelated record, which is worse than pointing at two.
//
// The cause is always the same and is written down in check-decision-log-index.mjs: a branch
// numbers its ADR off a stale `main`, a second branch numbers the same one, and both land. Nothing
// fails, because each file is individually well-formed and the decision log is keyed on filename.
//
// This guard is the missing half. `check-decision-log-index.mjs` proves every decision is INDEXED;
// this one proves every decision is IDENTIFIED. Together they make a citation followable.
//
// The baseline is EMPTY, and the mechanism is kept anyway. It held the 23 collisions that already
// existed and only ever shrank — a number made unique must be removed from it or this guard fails —
// which is what let them be drained in reviewable batches instead of one unreviewable sweep. It is
// the seam to reach for again if a collision ever has to be tolerated for a release; it is not
// permission, and topping it up instead of draining it is the thing it was built to prevent.
//
// Renumbering is not a rename. Every citation of a shared number must be attributed to the right
// side FIRST, or you recreate the #936 defect by hand. Two things that bit during the drain and
// will bit again: `evidence.decision` strings in `liveMediaPolicy.js` are PERSISTED values on
// accepted media rows, not references — 'ADR-0556' there means what is now ADR-0560 and must not be
// touched — and `git grep` line numbers go stale the moment `main` moves, so anchor a rewrite on
// distinctive text and require exactly one match.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Scaffolding for writing an ADR, not a decision, so it owns no number. */
const NOT_A_DECISION = new Set(['0000-adr-template.md']);

const ADR_FILE = /^(\d{4})-.+\.md$/;
/** A citation as it appears in prose and comments. The four digits are the whole identity. */
const CITATION = /\bADR-(\d{4})\b/g;
/** Where a citation may appear. ADRs themselves are excluded: they link by filename. */
const CITING_FILE = /\.(ts|tsx|js|mjs|cjs|css|md|ya?ml)$/;

/**
 * This guard's own files. Their `ADR-0100`/`ADR-0999` are FIXTURES — a number invented to prove the
 * dangling-citation branch fires — not references to a decision, so scanning them makes the guard
 * fail on itself. It did: the test passed locally while the file was still untracked and `git
 * ls-files` could not see it, then failed in CI one commit later.
 */
const SELF = new Set([
  'frontend/scripts/check-adr-numbers.mjs',
  'frontend/scripts/check-adr-numbers.node-test.mjs',
]);

export const BASELINE_PATH = 'scripts/adr-duplicate-baseline.json';

/** number -> [filename], for every ADR that owns a number. */
export function adrNumberOwners(entries) {
  const owners = new Map();
  for (const name of entries.sort()) {
    if (!ADR_FILE.test(name) || NOT_A_DECISION.has(name)) continue;
    const number = name.slice(0, 4);
    if (!owners.has(number)) owners.set(number, []);
    owners.get(number).push(name);
  }
  return owners;
}

/** Every number cited by `source`, once each. */
export function citedNumbers(source) {
  return new Set([...source.matchAll(CITATION)].map(([, number]) => number));
}

/**
 * The verdict, as a list of failures. Empty means the tree is consistent.
 *
 * `owners` is the live number -> files map; `citations` is number -> [where it is cited]; `baseline`
 * is the accepted-collision worklist.
 */
export function compareAdrNumbers(owners, citations, baseline) {
  const failures = [];
  const accepted = new Set(baseline.duplicates ?? []);
  const duplicated = new Set();

  for (const [number, files] of [...owners].sort()) {
    if (files.length < 2) continue;
    duplicated.add(number);
    if (accepted.has(number)) continue;
    const cited = citations.get(number) ?? [];
    failures.push(
      `ADR-${number} is owned by ${files.length} decisions, so every citation of it is ambiguous:\n`
      + files.map((f) => `    ${f}`).join('\n')
      + (cited.length
        ? `\n  cited from ${cited.length} file(s), starting with ${cited.slice(0, 3).join(', ')}`
        : '\n  not cited yet — renumber it now, while that is still free'),
    );
  }

  // The worklist only shrinks. A number made unique must leave the baseline in the same change.
  for (const number of [...accepted].sort()) {
    if (duplicated.has(number)) continue;
    failures.push(
      `ADR-${number} is unique again — remove it from ${BASELINE_PATH}. `
      + 'The baseline is a worklist, not a permanent allowance.',
    );
  }

  // A citation nothing owns is a decision the reader cannot open at all.
  for (const [number, where] of [...citations].sort()) {
    if (owners.has(number)) continue;
    failures.push(
      `ADR-${number} is cited by ${where.slice(0, 3).join(', ')} but no ADR file owns that number.`,
    );
  }

  return failures;
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function trackedCitingFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  return out.split('\0').filter((f) => (
    f && CITING_FILE.test(f) && !f.startsWith('docs/adr/') && !SELF.has(f)
  ));
}

function run() {
  const root = repoRoot();
  const owners = adrNumberOwners(readdirSync(path.join(root, 'docs', 'adr')));

  const citations = new Map();
  for (const file of trackedCitingFiles(root)) {
    let source;
    try {
      source = readFileSync(path.join(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const number of citedNumbers(source)) {
      if (!citations.has(number)) citations.set(number, []);
      citations.get(number).push(file);
    }
  }

  const baselineUrl = new URL(BASELINE_PATH, new URL('../', import.meta.url));
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselineUrl, 'utf8'));
  } catch (error) {
    return [`${BASELINE_PATH}: cannot read the required baseline (${error.message}).`];
  }

  const failures = compareAdrNumbers(owners, citations, baseline);
  if (!failures.length) {
    const dupes = (baseline.duplicates ?? []).length;
    const total = [...owners.values()].reduce((sum, files) => sum + files.length, 0);
    console.log(
      `✓ check-adr-numbers: ${total} ADRs, every cited number resolves`
      + (dupes ? `, ${dupes} known collision(s) still on the worklist.` : ', and no number is shared.'),
    );
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-adr-numbers.mjs')) {
  const failures = run();
  if (failures.length) {
    console.error('✗ ADR number identity gate FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
      '\nAn ADR number must name one decision. Give the newer ADR the next free number, move every'
      + '\ncitation that belongs to it, and drop the number from the baseline.',
    );
    process.exit(1);
  }
}
