#!/usr/bin/env node
// Write human-facing build provenance into k8s/values.yaml's `build:` block.
// Run by .github/workflows/build-and-deploy.yaml at deploy time, alongside the
// image-tag bump.
//
// Deliberately a TARGETED, block-scoped, per-line replacement — NOT a YAML
// round-trip — so the file's comments and formatting stay byte-for-byte identical
// outside the four value lines (matching the existing `sed` tag-bump philosophy;
// values.yaml is heavily commented Helm config we must not reflow). Values arrive
// via env and are never shell-interpolated, so a PR title containing quotes, `&`,
// or `:` is safe. Fails loudly if any of the four keys is missing, so a renamed
// block never silently no-ops.
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'k8s/values.yaml';
const fields = {
  prTitle: process.env.PR_TITLE ?? '',
  prNumber: process.env.PR_NUMBER ?? '',
  prUrl: process.env.PR_URL ?? '',
  commit: process.env.COMMIT ?? '',
};

// Minimal YAML double-quoted scalar: escape backslash and quote. Sufficient for
// the whole Unicode range in the double-quoted style (control chars aside, which
// PR titles / short SHAs never contain).
const dq = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const lines = readFileSync(path, 'utf8').split('\n');
const seen = new Set();
let inBuild = false;
for (let i = 0; i < lines.length; i++) {
  if (/^build:\s*$/.test(lines[i])) { inBuild = true; continue; }
  // The `build:` block ends at the next top-level key (a non-indented, non-blank,
  // non-comment line).
  if (inBuild && /^[^\s#]/.test(lines[i])) inBuild = false;
  if (!inBuild) continue;
  const match = /^(  )(prTitle|prNumber|prUrl|commit):/.exec(lines[i]);
  if (match) {
    const key = match[2];
    lines[i] = `  ${key}: ${dq(fields[key])}`;
    seen.add(key);
  }
}

const missing = Object.keys(fields).filter((key) => !seen.has(key));
if (missing.length) {
  console.error(`write-build-info: could not find build keys in ${path}: ${missing.join(', ')}`);
  process.exit(1);
}

writeFileSync(path, lines.join('\n'));
console.log(`write-build-info: stamped ${Object.keys(fields).length} build fields into ${path}`);
