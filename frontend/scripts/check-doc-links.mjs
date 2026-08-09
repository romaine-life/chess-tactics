#!/usr/bin/env node
// GUARD: every markdown-to-markdown link in the docs resolves to a file that exists.
//
// Why this exists: ADRs cross-reference each other constantly — `refines`, `supersedes`,
// `superseded_by`, and the More Information tail are all links — and that web is how a decision
// is read in context. A link that 404s silently turns "this refines ADR-0427" into a dead end,
// and nothing catches it, because renaming an ADR file is a perfectly ordinary edit that leaves
// every citing document untouched and still well-formed.
//
// It had rotted 78 links deep before this check existed. Two causes, both invisible in review:
//
//   - an ADR was RENAMED and its citers kept the old slug. ADR-0058 was linked under three
//     different filenames at once; 0026, 0057, 0076, 0120, 0193, 0205, 0209, 0211, 0230, 0231,
//     0338, 0346, 0354, 0364, 0369, 0371, 0421, 0427 and 0435 each had at least one.
//   - an ADR was RENUMBERED and its citers kept the old number. ADR-0117 pointed its own
//     `superseded_by` at "ADR-0116" for a decision that had moved to 0121; 0089 pointed at 0374
//     for one that had moved to 0375; game-concept.md cited 0119 for one now at 0124.
//
// Scope is markdown-to-markdown ONLY. Links to images and other media are deliberately excluded:
// runtime media was moved behind the live backend (#479) and is not committed, so a docs
// reference to a purged PNG is the media policy working, not a broken document.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DOCS = ['CLAUDE.md', 'AGENTS.md', 'README.md'];
/** `](target)` — captured before any `#anchor` or `?query`. */
const LINK = /\]\(([^)\s]+)\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;

/** Markdown links in `source` that name another markdown file, with 1-based line numbers. */
export function markdownLinks(source) {
  const found = [];
  source.split('\n').forEach((line, index) => {
    for (const [, raw] of line.matchAll(LINK)) {
      if (EXTERNAL.test(raw)) continue;
      const target = raw.split('#')[0].split('?')[0];
      if (!target.endsWith('.md')) continue;
      found.push({ target, line: index + 1 });
    }
  });
  return found;
}

/** `exists` takes a path relative to the repo root, so this stays testable without a filesystem. */
export function brokenLinksIn(file, source, exists) {
  return markdownLinks(source)
    .filter(({ target }) => !exists(path.posix.join(path.posix.dirname(file), target)))
    .map(({ target, line }) => `${file}:${line} → ${target}`);
}

function markdownFilesUnder(dir, root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFilesUnder(absolute, root);
    return entry.name.endsWith('.md') ? [path.relative(root, absolute).replaceAll('\\', '/')] : [];
  });
}

export function run(rootUrl = new URL('../../', import.meta.url)) {
  const root = fileURLToPath(rootUrl);
  const files = [
    ...markdownFilesUnder(path.join(root, 'docs'), root),
    ...ROOT_DOCS.filter((name) => existsSync(path.join(root, name))),
  ];
  const exists = (relative) => existsSync(path.join(root, relative));
  const failures = files.flatMap((file) => brokenLinksIn(file, readFileSync(path.join(root, file), 'utf8'), exists));
  return { failures, files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { failures, files } = run();
  if (failures.length) {
    console.error('\n✗ check-doc-links: these markdown links point at files that do not exist.\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error('\n  An ADR that was RENAMED keeps its number: repoint the path and leave the link text.');
    console.error('  An ADR that was RENUMBERED keeps its slug: fix the number in the text too.\n');
    process.exit(1);
  }
  console.log(`✓ check-doc-links: every markdown link across ${files.length} docs resolves.`);
}
