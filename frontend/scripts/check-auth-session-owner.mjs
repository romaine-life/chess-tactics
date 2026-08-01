#!/usr/bin/env node
// GUARD: browser authentication has one state owner (ADR-0306). Runtime screens
// consume net/authSession; only net/auth transports /api/auth/me, and no screen
// may create another probe/retry/cache around the user's identity.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

const allowed = {
  identityEndpoint: new Set(['src/net/auth.ts']),
  transportReader: new Set(['src/net/auth.ts', 'src/net/authSession.ts']),
  unauthorizedClassifier: new Set(['src/net/auth.ts', 'src/net/authSession.ts']),
  sessionStart: new Set(['src/main.tsx', 'src/net/authSession.ts', 'src/run/store.ts']),
  authUserType: new Set(['src/net/auth.ts', 'src/net/authSession.ts', 'src/ui/shared/HeaderAccountCluster.tsx']),
};

export function collectAuthOwnershipViolations(entries) {
  const violations = [];
  for (const { path, source } of entries) {
    source.split('\n').forEach((line, index) => {
      const text = line.trim();
      if (text.startsWith('//') || text.startsWith('*')) return;
      const add = (why) => violations.push({ path, line: index + 1, why, text });
      if (line.includes('/api/auth/me') && !allowed.identityEndpoint.has(path)) {
        add('direct identity endpoint access; consume net/authSession');
      }
      if (/\bfetchMeStatus\b/.test(line) && !allowed.transportReader.has(path)) {
        add('identity transport reader outside the session owner');
      }
      if (/\bisUnauthorized\b/.test(line) && !allowed.unauthorizedClassifier.has(path)) {
        add('screen-local 401 interpretation; report the failure to net/authSession');
      }
      if (/\bfetchReachableAuthStatus\b/.test(line)) {
        add('retired caller-owned auth retry path');
      }
      if (/\bstartAuthSession\b/.test(line) && !allowed.sessionStart.has(path)) {
        add('session startup outside the application owner or imperative Run hydration join');
      }
      if (/\bAuthUser\b/.test(line) && !allowed.authUserType.has(path)) {
        add('screen-local identity type/cache; consume the auth-session snapshot');
      }
      if (/\bconst\s*\[\s*(?:me|signedIn|adminAuth)\s*,\s*set[A-Z]/.test(line)) {
        add('screen-local identity state; derive it from the auth-session snapshot');
      }
    });
  }
  return violations;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const files = walk(join(root, 'src'));
  const entries = files.map((file) => ({
    path: relative(root, file).replaceAll('\\', '/'),
    source: readFileSync(file, 'utf8'),
  }));
  const violations = collectAuthOwnershipViolations(entries);
  if (violations.length) {
    console.error('\n✗ Authentication must have one client session owner (ADR-0306).\n');
    for (const violation of violations) {
      console.error(`  ${violation.path}:${violation.line} — ${violation.why}\n      ${violation.text}`);
    }
    process.exit(1);
  }
  console.log(`✓ auth-session owner guard OK (${files.length} runtime source files)`);
}
