#!/usr/bin/env node

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const MARKER_VERSION = 'v1';
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

function fail(message) {
  throw new Error(message);
}

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? '' : '';
}

function requirePattern(name, value, pattern) {
  if (!pattern.test(value)) fail(`Invalid --${name}: ${value || '(empty)'}`);
  return value;
}

export function approvalMarker({ head, fingerprint, digest }) {
  requirePattern('head', head, /^[0-9a-f]{40,64}$/);
  requirePattern('fingerprint', fingerprint, /^[0-9a-f]{64}$/);
  requirePattern('digest', digest, /^sha256:[0-9a-f]{64}$/);
  return `<!-- exact-image-approval:${MARKER_VERSION} head=${head} fingerprint=${fingerprint} digest=${digest} -->`;
}

export function trustedApprovals(comments, expected) {
  const marker = approvalMarker(expected);
  const flattened = Array.isArray(comments) ? comments.flat(Infinity) : [];
  return flattened.filter((comment) =>
    comment &&
    TRUSTED_ASSOCIATIONS.has(comment.author_association) &&
    typeof comment.body === 'string' &&
    comment.body.trim() === marker,
  );
}

function usage() {
  console.error(
    'usage:\n' +
    '  exact-image-approval.mjs marker --head SHA --fingerprint SHA256 --digest sha256:SHA256\n' +
    '  exact-image-approval.mjs verify --comments FILE|- --head SHA --fingerprint SHA256 --digest sha256:SHA256',
  );
  process.exit(2);
}

function main() {
  const command = process.argv[2];
  if (!command || !['marker', 'verify'].includes(command)) usage();

  const expected = {
    head: option('head'),
    fingerprint: option('fingerprint'),
    digest: option('digest'),
  };

  if (command === 'marker') {
    console.log(approvalMarker(expected));
    return;
  }

  const commentsPath = option('comments');
  if (!commentsPath) usage();
  const source = commentsPath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(commentsPath, 'utf8');
  let comments;
  try {
    comments = JSON.parse(source);
  } catch (error) {
    fail(`Unable to parse approval comments JSON: ${error.message}`);
  }

  const matches = trustedApprovals(comments, expected);
  if (matches.length === 0) {
    fail(`No trusted pull-request comment exactly approves ${approvalMarker(expected)}`);
  }

  const approvers = [...new Set(matches.map((comment) => comment.user?.login).filter(Boolean))];
  console.log(`Exact image approved by ${approvers.join(', ') || 'a trusted repository collaborator'}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
