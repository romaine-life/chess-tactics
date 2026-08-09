#!/usr/bin/env node
// GUARD: every ADR carries exactly one row in docs/adr/decision-log.md, and every row points at
// an ADR that exists.
//
// Why this exists: AGENTS.md makes the decision log the INDEX of every decision — "use the
// decision log as the index; reading every ADR is not required." A reader who follows that
// instruction sees only what the log lists, so an ADR with no row is invisible, and a row whose
// link is broken is a decision nobody can open. Neither failure shows up in any test or in
// review, because both files are individually well-formed.
//
// It had happened 14 times before this check existed. ADR-0518 and ADR-0539 were accepted with
// no row at all; the whole wall-mirror sequence (ADR-0077 through ADR-0087) plus ADR-0081's TD
// run library, ADR-0082's named level AI and ADR-0516's hand-placed playable grid were lost the
// same way, most of them numbered off a stale `main` so their numbers collide with unrelated
// ADRs. Separately, a terminology pass rewrote ten "relic" ADR links to "lipsanon" without
// renaming the files, so ten rows pointed at nothing while their ADRs sat there rowless.
//
// Keyed by FILENAME, not by number: two ADRs may legitimately share a number after a collision
// (0063, 0064, 0077-0087, 0516 all do), and the filename is the only unambiguous identity.
//
// Deliberately NOT checked: numeric ordering. The 0050-0064 stretch has been out of order since
// long before this guard, and reordering accepted rows is a separate decision.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The template is scaffolding for writing an ADR, not a decision, so it owns no row. */
const NOT_A_DECISION = new Set(['0000-adr-template.md']);

const ADR_FILE = /^(\d{4})-.+\.md$/;
/** A row's identity is its leading `| [NNNN](file.md)` cell; later cells may link elsewhere. */
const ROW = /^\| \[(\d{4})\]\(([^)]+)\)/gm;

export function adrFileNames(entries) {
  return entries.filter((name) => ADR_FILE.test(name) && !NOT_A_DECISION.has(name)).sort();
}

export function decisionLogRows(source) {
  return [...source.matchAll(ROW)].map(([, number, file]) => ({ number, file }));
}

export function checkIndex(files, rows) {
  const failures = [];
  const present = new Set(files);
  const counts = new Map();
  for (const row of rows) counts.set(row.file, (counts.get(row.file) ?? 0) + 1);

  for (const file of files) {
    if (!counts.has(file)) {
      failures.push(`${file} has no decision-log row — the log is the index, so this decision is invisible`);
    }
  }
  for (const [file, count] of counts) {
    if (!present.has(file)) {
      failures.push(`decision-log row links to docs/adr/${file}, which does not exist — repoint it at the real filename, or rename the ADR to match`);
    }
    if (count > 1) failures.push(`${file} has ${count} decision-log rows — exactly one`);
  }
  for (const { number, file } of rows) {
    if (present.has(file) && !file.startsWith(`${number}-`)) {
      failures.push(`decision-log row [${number}] links to ${file}, whose own number disagrees`);
    }
  }
  return failures.sort();
}

export function run(root = new URL('../../', import.meta.url)) {
  const adrDir = path.join(fileURLToPath(root), 'docs', 'adr');
  const files = adrFileNames(readdirSync(adrDir));
  const rows = decisionLogRows(readFileSync(path.join(adrDir, 'decision-log.md'), 'utf8'));
  return { failures: checkIndex(files, rows), files, rows };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { failures, files } = run();
  if (failures.length) {
    console.error('\n✗ check-decision-log-index: docs/adr/decision-log.md is not a complete index.\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error('\n  Every ADR gets one row: | [NNNN](filename.md) | what it decided | status clause | date |');
    console.error('  Write it from the ADR, in the voice of its neighbours, in numeric order.\n');
    process.exit(1);
  }
  console.log(`✓ check-decision-log-index: all ${files.length} ADRs are indexed, and every row resolves.`);
}
