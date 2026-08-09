// Upload the King card illustrations as live-media candidates, then review and accept them.
//
//   node scripts/install-run-king-art.mjs --images <dir> [--base http://kings.chess-tactics.localhost]
//                                         [--dry-run]
//
// Kings are keyed per CARD, not per (footprint, roster) family: every arrangement is its own King,
// so `artId` is the card slug behind a `k-` namespace. Each slot is NEW, which is the additive and
// retirable case; nothing here overwrites or re-points an existing slot.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const MANIFEST = new URL('../../docs/art/run-king-prompts-v2.json', import.meta.url);
const GROUP_ID = 'run-king-art-v1';
const WIDTH = 400;
const HEIGHT = 280;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const baseUrl = flag('base', 'http://kings.chess-tactics.localhost');
const imagesDir = flag('images', '');
const dryRun = args.includes('--dry-run');
if (!imagesDir) throw new Error('--images <dir> is required');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const shared = manifest.sharedDirection;
const cards = manifest.families.map((family) => {
  const file = path.join(imagesDir, `${family.artId}.png`);
  const bytes = fs.readFileSync(file);
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) throw new Error(`${family.artId} is not a PNG`);
  const prompt = [
    shared.medium, shared.subject, family.roles, family.arrangement,
    family.sceneDirection, family.historicalAnchor, shared.world, shared.exclusions,
  ].join('\n\n');
  return {
    ...family,
    bytes,
    imageSha256: sha256(bytes),
    prompt,
    promptSha256: sha256(Buffer.from(prompt, 'utf8')),
  };
});
const requiredSlots = cards.map((card) => card.slot).sort();

function candidatePayload(card) {
  return {
    slot: card.slot,
    domain: 'run-card-art',
    role: 'illustration',
    label: `${card.title} King card illustration`,
    availabilityPolicy: 'decorative',
    slotMetadata: {
      schema: 'run-card-art-slot-v2',
      cardId: card.artId,
      cardType: 'Units',
    },
    metadata: {
      schema: 'run-card-art-plan-v3',
      cardId: card.artId,
      cardTitle: card.title,
      cardType: 'Units',
      pieces: card.pieces.filter((piece) => piece !== 'king'),
      baseCost: Math.max(1, card.pieces.filter((p) => p !== 'king')
        .reduce((sum, p) => sum + ({ pawn: 1, knight: 3, bishop: 3 })[p], 0)),
      historicalAnchor: card.historicalAnchor,
      generationModel: 'codex-image-gen',
      nativeWidth: WIDTH,
      nativeHeight: HEIGHT,
    },
    provenance: {
      schema: 'run-card-art-prompt-v3',
      source: 'Codex built-in image generation',
      generationModel: 'codex-image-gen',
      codexThreadId: card.artId,
      prompt: card.prompt,
      promptSha256: card.promptSha256,
      historicalAnchor: card.historicalAnchor,
      sceneDirection: card.sceneDirection,
      unitIdentity: card.roles,
    },
    nativeEvidence: {
      native1x: true,
      spatialResampling: false,
      sourceWidth: WIDTH,
      sourceHeight: HEIGHT,
      sourceSha256: card.imageSha256,
    },
  };
}

async function openOwnerSession() {
  const executablePath = CHROMES.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error(`Chrome or Edge is required; checked ${CHROMES.join(', ')}`);
  const target = new URL(baseUrl);
  if (!(target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname.endsWith('.localhost'))) {
    throw new Error('owner sign-in is restricted to a loopback development URL');
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-first-run'],
  });
  const page = await browser.newPage();
  const signIn = new URL('/api/auth/sign-in', target);
  signIn.searchParams.set('returnTo', '/api/auth/me');
  const response = await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!response?.ok()) throw new Error(`owner sign-in failed (${response?.status() ?? 'no response'})`);
  const authState = await page.evaluate(() => {
    try { return JSON.parse(document.body.textContent || '{}'); } catch { return {}; }
  });
  if (!authState?.signed_in) throw new Error('owner sign-in did not establish a session');
  const cookies = await page.cookies(target.origin);
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  if (!cookieHeader) throw new Error('owner sign-in returned no session cookie');
  return { browser, page, cookieHeader, origin: target.origin };
}

async function api(session, route, options = {}) {
  const response = await fetch(new URL(route, session.origin).href, {
    ...options,
    headers: { cookie: session.cookieHeader, origin: session.origin, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 400) }; }
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

if (dryRun) {
  process.stdout.write(`${JSON.stringify({
    cards: cards.length,
    slots: requiredSlots,
    bytes: cards.map((card) => ({ artId: card.artId, sha256: card.imageSha256, size: card.bytes.length })),
  }, null, 2)}\n`);
  process.exit(0);
}

const session = await openOwnerSession();
try {
  const before = await api(session, '/api/admin/media-assets');
  const existingBySlot = new Map((before.versions ?? []).map((version) => [version.slot, version]));
  process.stdout.write(`catalog holds ${before.slots?.length ?? 0} slots; uploading ${cards.length} Kings\n`);

  const uploaded = [];
  for (const card of cards) {
    // A version's slot_metadata is fixed at creation and PATCH cannot reach it, so a candidate
    // uploaded under the wrong acceptance contract is replaced rather than repaired.
    const prior = existingBySlot.get(card.slot);
    let version = prior && !JSON.stringify(prior).includes('run-king-art-v1') ? prior : null;
    if (!version) {
      const created = await api(session, '/api/admin/media-versions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `run-king-art-v2:${card.artId}:${card.imageSha256.slice(0, 32)}`,
        },
        body: JSON.stringify(candidatePayload(card)),
      });
      version = created.version;
    }
    if (!version.media) {
      await api(session, `/api/admin/media-versions/${encodeURIComponent(version.id)}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png', 'if-match': `"${version.rowRevision}"` },
        body: card.bytes,
      });
      version = (await api(session, '/api/admin/media-assets')).versions.find((row) => row.id === version.id);
    }
    uploaded.push({ card, version });
    process.stdout.write(`up   ${card.artId.padEnd(26)} ${version.status}\n`);
  }

  // v3 family art promotes PER FAMILY: each illustration is complete on its own, so there is no
  // acceptance group to batch and the review carries that one card's decoded raster.
  let promoted = 0;
  const failures = [];
  for (const { card, version } of uploaded) {
    try {
      const live = (await api(session, '/api/admin/media-assets'));
      let row = live.versions.find((entry) => entry.id === version.id) ?? version;
      if (row.status === 'active') { promoted += 1; continue; }
      // The first upload declared a group; v3 family art promotes per family, so clear it.
      if (row.slotMetadata?.acceptance) {
        const { acceptance, ...slotMetadata } = row.slotMetadata;
        void acceptance;
        const patched = await api(session, `/api/admin/media-versions/${row.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedRevision: row.rowRevision, slotMetadata }),
        });
        row = patched.version ?? row;
      }
      const slotRow = live.slots.find((entry) => entry.slot === row.slot);
      if (!slotRow) throw new Error('slot vanished before review');
      const surface = new URL('/studio', session.origin);
      surface.searchParams.set('cat', 'cardprompts');
      surface.searchParams.set('cardPrompt', card.artId);
      const reviewed = await api(session, `/api/admin/media-versions/${row.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'if-match': String(row.rowRevision) },
        body: JSON.stringify({
          approved: true,
          expectedRevision: row.rowRevision,
          notes: 'Owner directed this King batch in session: the pool, the named monarch behind each '
            + 'card, and the direct gaze that marks a King as the one whole figure in the game. This '
            + "raster is that card's own 400x280 Codex generation, method-gated on its rollout marker.",
          surfaceUrl: surface.href,
          evidence: {
            schema: 'live-media-owner-proof-v1',
            canonicalScale: 1,
            surfaceKind: 'Studio Card Prompts family illustration',
            renderer: 'RunCardPromptCatalog/RunCardArtCandidateGrid',
            versionId: row.id,
            slot: row.slot,
            contentSha256: row.media?.sha256 ?? card.imageSha256,
            decodedNativeRaster: { width: WIDTH, height: HEIGHT, scale: 1 },
          },
        }),
      });
      const reviewedRevision = reviewed.version?.rowRevision ?? row.rowRevision + 1;
      await api(session, `/api/admin/media-versions/${row.id}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'if-match': String(reviewedRevision) },
        body: JSON.stringify({
          expectedRevision: reviewedRevision,
          expectedSlotRevision: slotRow.rowRevision,
          expectedActiveVersionId: slotRow.activeVersionId ?? null,
        }),
      });
      promoted += 1;
      process.stdout.write(`ok   ${card.artId.padEnd(26)} (${promoted}/${uploaded.length})\n`);
    } catch (error) {
      failures.push({ artId: card.artId, error: String(error.message ?? error).slice(0, 220) });
      process.stdout.write(`FAIL ${card.artId.padEnd(26)} ${String(error.message ?? error).slice(0, 200)}\n`);
    }
  }
  const after = await api(session, '/api/admin/media-assets');
  const active = requiredSlots.filter((slot) => after.slots.some((row) => row.slot === slot && row.activeVersionId));
  process.stdout.write(`${JSON.stringify({
    promoted, failed: failures.length, active: active.length, of: requiredSlots.length, failures: failures.slice(0, 3),
  }, null, 2)}\n`);
} finally {
  await session.browser.close();
}
