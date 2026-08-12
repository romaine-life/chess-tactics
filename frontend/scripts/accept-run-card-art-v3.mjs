// Promote the ADR-0579 card illustrations from candidate to accepted, one card at a time.
//
//   node scripts/accept-run-card-art-v3.mjs --base http://127.0.0.1:<port> [--only <id,id>] [--limit N]
//
// Per-card promotion is the whole point of the keying: a card draws its family art until its own
// illustration is accepted, so this can run in slices and stop anywhere without leaving the game
// half-dressed. Each acceptance carries its own owner proof, and the proof is EARNED — the script
// opens that card's Card Prompts address in a real browser and reads the decoded raster off the
// mounted image before it will claim 400x280 at canonical 1x.
//
// Acceptance is a production content change. The owner approved this batch; nothing here decides
// that for him.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const WORLDS = fileURLToPath(new URL('../../docs/art/run-card-worlds-v3.json', import.meta.url));
const SLATE = fileURLToPath(new URL('../../docs/art/run-king-slate-v3.json', import.meta.url));

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const BASE = flag('base', 'http://127.0.0.1:5173');
const ONLY = (flag('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(flag('limit', '0'));

const CHROMES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const PROMPT_SCHEMA = 'run-card-art-prompt-v3';
const PROOF = {
  schema: 'live-media-owner-proof-v1',
  canonicalScale: 1,
  surfaceKind: 'Studio Card Prompts family illustration',
  renderer: 'RunCardPromptCatalog/RunCardArtCandidateGrid',
};

const worlds = JSON.parse(readFileSync(WORLDS, 'utf8'));
const slate = JSON.parse(readFileSync(SLATE, 'utf8'));
const wanted = new Set([
  ...worlds.cards.map((card) => card.cardId),
  ...slate.slots.map((slot) => `k-${slot.cardId}`),
]);

async function signIn() {
  const executablePath = CHROMES.find((candidate) => existsSync(candidate));
  if (!executablePath) throw new Error(`Chrome or Edge is required; checked ${CHROMES.join(', ')}`);
  const target = new URL(BASE);
  if (!(target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname.endsWith('.localhost'))) {
    throw new Error('automatic owner sign-in is restricted to a loopback development URL');
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-first-run'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const signInUrl = new URL('/api/auth/sign-in', target);
  signInUrl.searchParams.set('returnTo', '/api/auth/me');
  const response = await page.goto(signInUrl.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (!response?.ok()) throw new Error(`local owner sign-in failed (${response?.status() ?? 'no response'})`);
  const state = await page.evaluate(() => {
    try { return JSON.parse(document.body.textContent || '{}'); } catch { return {}; }
  });
  if (!state?.signed_in) throw new Error('local owner sign-in did not establish a session');
  const cookies = await page.cookies(target.origin);
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  if (!cookieHeader) throw new Error('local owner sign-in did not return a session cookie');
  return { browser, page, cookieHeader };
}

async function api(session, path, options = {}) {
  const response = await fetch(new URL(path, BASE).href, {
    ...options,
    headers: { cookie: session.cookieHeader, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** Open the card's own Card Prompts address and read the decoded raster off the mounted image. */
async function decodedRaster(session, cardId) {
  const surface = new URL('/studio', BASE);
  surface.searchParams.set('cat', 'cardprompts');
  surface.searchParams.set('cardPrompt', cardId);
  await session.page.goto(surface.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const measured = await session.page.waitForFunction((id) => {
    const image = document.querySelector(`img[data-run-card-art-candidate="${id}"]`);
    if (!image || !image.complete || !image.naturalWidth) return false;
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, { timeout: 60_000 }, cardId).then((handle) => handle.jsonValue());
  if (measured.width !== 400 || measured.height !== 280) {
    throw new Error(`decoded raster is ${measured.width}x${measured.height}, not 400x280`);
  }
  return { surfaceUrl: surface.href, raster: { width: measured.width, height: measured.height, scale: 1 } };
}

const session = await signIn();
try {
  let catalog = await api(session, '/api/admin/media-assets');
  let pending = catalog.versions.filter((version) => (
    version.provenance?.schema === PROMPT_SCHEMA
    && version.status === 'candidate'
    && Boolean(version.media)
    && wanted.has(String(version.slot ?? '').replace(/^ui\/run\/card-art\//, '').replace(/\/illustration\.png$/, ''))
  ));
  if (ONLY.length) {
    pending = pending.filter((version) => ONLY.some((id) => version.slot === `ui/run/card-art/${id}/illustration.png`));
  }
  if (LIMIT > 0) pending = pending.slice(0, LIMIT);

  process.stdout.write(`accepting ${pending.length} candidates -> ${BASE}\n`);
  let accepted = 0;
  const failures = [];
  for (const version of pending) {
    const cardId = String(version.slot).replace(/^ui\/run\/card-art\//, '').replace(/\/illustration\.png$/, '');
    try {
      const { surfaceUrl, raster } = await decodedRaster(session, cardId);
      const contentSha256 = version.media.sha256 ?? version.media.contentSha256 ?? version.blobSha256;
      if (!contentSha256) throw new Error('candidate has no content hash in the admin catalog');
      const evidence = {
        ...PROOF,
        slot: version.slot,
        versionId: version.id,
        contentSha256,
        decodedNativeRaster: raster,
      };
      const review = await api(session, '/api/admin/media-versions/review-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: new URL(BASE).origin },
        body: JSON.stringify({
          approved: true,
          notes: 'Owner approved the ADR-0579 king-rooted card art batch.',
          surfaceUrl,
          evidence,
          items: [{ id: version.id, expectedRevision: version.rowRevision }],
        }),
      });
      const reviewed = review.versions[0];
      const slotRow = catalog.slots.find((entry) => entry.slot === version.slot);
      await api(session, '/api/admin/media-versions/accept-batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [{
            id: version.id,
            expectedRevision: reviewed.rowRevision,
            expectedSlotRevision: slotRow?.rowRevision,
            expectedActiveVersionId: slotRow?.activeVersionId ?? null,
          }],
        }),
      });
      accepted += 1;
      process.stdout.write(`ok   ${cardId.padEnd(26)} (${accepted}/${pending.length})\n`);
      catalog = await api(session, '/api/admin/media-assets');
    } catch (error) {
      const message = String(error.message ?? error);
      failures.push({ cardId, error: message });
      process.stdout.write(`FAIL ${cardId.padEnd(26)} ${message.slice(0, 180)}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify({
    considered: pending.length, accepted, failed: failures.length, failures: failures.slice(0, 5),
  }, null, 2)}\n`);
} finally {
  await session.browser.close();
}
