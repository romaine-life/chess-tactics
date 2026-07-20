#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvalInstructions, openBrowser } from './codex-auth-browser.mjs';

const AUTH_ORIGIN = 'https://auth.romaine.life';
const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const credentialPath = path.join(repoDir, '.codex-session', 'auth.json');
const nouns = ['compass', 'lantern', 'harbor', 'meadow', 'thimble', 'anvil', 'teapot', 'maple', 'rivet', 'quartz'];

const postJson = async (pathname, body) => {
  const response = await fetch(`${AUTH_ORIGIN}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} failed (${response.status}): ${payload.error || 'unknown error'}`);
  return payload;
};

const guidanceResponse = await fetch(`${AUTH_ORIGIN}/api/cli/requester-guidance`, {
  headers: { accept: 'application/json' },
  signal: AbortSignal.timeout(15_000),
});
if (!guidanceResponse.ok) throw new Error(`requester guidance failed (${guidanceResponse.status})`);
const guidance = await guidanceResponse.json();
const previous = new Set(Array.isArray(guidance.previous_misc_identifiers) ? guidance.previous_misc_identifiers : []);
const seed = createHash('sha256').update(`${repoDir}:${Date.now()}:${randomBytes(8).toString('hex')}`).digest().readUInt32BE(0);
const miscIdentifier = nouns.find((noun, index) => !previous.has(nouns[(seed + index) % nouns.length]))
  ?? `session-${randomBytes(4).toString('hex')}`;
const chosenNoun = nouns.includes(miscIdentifier) ? nouns[(nouns.indexOf(miscIdentifier) + seed) % nouns.length] : miscIdentifier;

const request = await postJson('/api/cli/device', {
  where_happening: `Codex desktop environment in ${repoDir}`,
  intended_use: 'Authenticate localhost Chess Tactics development and browser verification for this Codex session',
  misc_identifier: previous.has(chosenNoun) ? `session-${randomBytes(4).toString('hex')}` : chosenNoun,
});

approvalInstructions(request).forEach((line) => console.log(line));
openBrowser(request.verification_uri_complete);

const deadline = Date.now() + Number(request.expires_in || 600) * 1000;
const intervalMs = Math.max(1, Number(request.interval || 5)) * 1000;
let granted;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
  const response = await fetch(`${AUTH_ORIGIN}/api/cli/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: request.device_code,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.ok) { granted = payload; break; }
  if (response.status === 400 && ['authorization_pending', 'slow_down'].includes(payload.error)) continue;
  throw new Error(`token grant failed (${response.status}): ${payload.error || 'unknown error'}`);
}
if (!granted?.token) throw new Error('token grant expired before approval');

await mkdir(path.dirname(credentialPath), { recursive: true });
await writeFile(credentialPath, `${JSON.stringify({
  token: granted.token,
  expires_at: granted.expires_at,
  purpose: granted.purpose,
  auth_origin: AUTH_ORIGIN,
}, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(`Authentication grant stored for this environment (expires ${granted.expires_at}).`);
