// Upload the ADR-0579 card illustrations as CANDIDATES. Nothing is accepted, nothing is activated,
// and no existing slot is re-pointed — this only makes the pixels reachable so they can be mounted
// on a game surface and judged there.
//
//   node scripts/install-run-card-art-v3.mjs --base http://<host> [--only <id,id>] [--dry-run]
//
// Adding a new slot is additive and recoverable by retiring it; promoting one is not, and is not
// something this script can do.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const ART = fileURLToPath(new URL('../tmp-card-art-v3', import.meta.url));
const REPORT = join(ART, 'forge-report.json');
const WORLDS = fileURLToPath(new URL('../../docs/art/run-card-worlds-v3.json', import.meta.url));
const SLATE = fileURLToPath(new URL('../../docs/art/run-king-slate-v3.json', import.meta.url));

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const BASE = flag('base', 'http://card-art.chess-tactics.localhost');
const ONLY = (flag('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const DRY = args.includes('--dry-run');

const CHROMES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const PIECE_VALUE = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };
const PIECE_OF = { p: 'pawn', k: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

const worlds = JSON.parse(readFileSync(WORLDS, 'utf8'));
const slate = JSON.parse(readFileSync(SLATE, 'utf8'));
const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const forged = new Map(report.results.filter((r) => r.ok).map((r) => [r.cardId, r]));

/** Every candidate, formation and King alike, in one shape. */
function candidates() {
  const rows = [];
  for (const card of worlds.cards) {
    const pieces = [...String(card.seats)].filter((ch) => ch !== '.').map((ch) => PIECE_OF[ch]);
    rows.push({
      artId: card.cardId,
      title: card.voice[0],
      pieces,
      anchor: `${card.king.name} — ${card.king.world}`,
      sceneDirection: card.act.moment,
      unitIdentity: `${card.act.line}. ${card.act.detail}`,
    });
  }
  for (const slot of slate.slots) {
    const pieces = slot.castShape.cells.filter((c) => c !== '.')
      .map((ch) => (ch === 'K' ? 'king' : PIECE_OF[ch]))
      // The King himself is not an adlectable piece and carries no art-side value; his companions
      // are what the cost band is computed from, exactly as in v2.
      .filter((piece) => piece !== 'king');
    rows.push({
      artId: `k-${slot.cardId}`,
      title: slot.name,
      pieces,
      anchor: `${slot.monarch} — ${slot.where}`,
      sceneDirection: slot.moment,
      unitIdentity: slot.act,
    });
  }
  return ONLY.length ? rows.filter((r) => ONLY.includes(r.artId)) : rows;
}

function payloadFor(row) {
  const forge = forged.get(row.artId);
  if (!forge) throw new Error(`${row.artId}: not in the forge report`);
  const baseCost = row.pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0);
  return {
    slot: `ui/run/card-art/${row.artId}/illustration.png`,
    domain: 'run-card-art',
    role: 'illustration',
    label: `${row.title} card illustration`,
    availabilityPolicy: 'decorative',
    slotMetadata: { schema: 'run-card-art-slot-v3', cardId: row.artId, cardType: 'Units' },
    metadata: {
      schema: 'run-card-art-plan-v3',
      cardId: row.artId,
      cardTitle: row.title,
      cardType: 'Units',
      pieces: row.pieces,
      baseCost,
      historicalAnchor: row.anchor,
      generationModel: 'codex-image-gen',
      nativeWidth: 400,
      nativeHeight: 280,
    },
    provenance: {
      schema: 'run-card-art-prompt-v3',
      source: 'Codex image_gen rollout',
      generationModel: 'codex-image-gen',
      codexThreadId: forge.threadId,
      prompt: forge.prompt,
      promptSha256: forge.promptSha256,
      unitIdentity: row.unitIdentity,
      sceneDirection: row.sceneDirection,
    },
    nativeEvidence: forge.nativeEvidence,
  };
}

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
  return { browser, cookieHeader };
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

const rows = candidates();
if (DRY) {
  const sample = payloadFor(rows[0]);
  process.stdout.write(`${JSON.stringify({ candidates: rows.length, sample }, null, 2)}\n`);
  process.exit(0);
}

const session = await signIn();
try {
  if (args.includes('--status')) {
    const catalog = await api(session, '/api/admin/media-assets');
    const v3 = catalog.versions.filter((v) => v.provenance?.schema === 'run-card-art-prompt-v3');
    // Only the rows THIS batch authored — matched on the exact prompt hash, because the ADR-0520
    // family art is stored under the same v3 schema name and would otherwise be counted as ours.
    const mineByHash = new Set(rows.map((row) => payloadFor(row).provenance.promptSha256));
    const mine = v3.filter((v) => mineByHash.has(v.provenance?.promptSha256));
    const wanted = new Set(rows.map((row) => `ui/run/card-art/${row.artId}/illustration.png`));
    process.stdout.write(`${JSON.stringify({
      expected: rows.length,
      thisBatch: mine.length,
      thisBatchWithMedia: mine.filter((v) => Boolean(v.media)).length,
      thisBatchByStatus: mine.reduce((tally, v) => ({ ...tally, [v.status]: (tally[v.status] ?? 0) + 1 }), {}),
      missing: [...wanted].filter((slot) => !mine.some((v) => v.slot === slot && v.media)),
      preExistingV3: v3.length - mine.length,
    }, null, 2)}\n`);
    process.exit(0);
  }
  const catalog = await api(session, '/api/admin/media-assets');
  const bySlot = new Map(catalog.versions
    .filter((version) => version.provenance?.schema === 'run-card-art-prompt-v3')
    .map((version) => [version.slot, version]));
  // Per-card ids for the singles and pairs (`b`, `pp`, `q`) are the SAME strings the v1 roster set
  // used, so those slots already exist and already carry slot metadata. Sending it again is a
  // conflicting write; a new candidate version on an existing slot is the additive thing we want.
  const existingSlots = new Set((catalog.slots ?? []).map((entry) => entry.slot ?? entry));

  let created = 0; let uploaded = 0; let skipped = 0;
  const failures = [];
  for (const row of rows) {
    try {
      const payload = payloadFor(row);
      if (existingSlots.has(payload.slot)) delete payload.slotMetadata;
      let version = bySlot.get(payload.slot);
      // A version is only OURS to reuse when it carries this batch's exact prompt. The King slots
      // already hold v3 versions from an earlier attempt, and treating those as ours meant the
      // upload silently did nothing and still reported ok. Different provenance means this batch
      // needs a version of its own.
      if (version && version.provenance?.promptSha256 !== payload.provenance.promptSha256) version = null;
      if (version && version.media) {
        skipped += 1;
        process.stdout.write(`skip ${row.artId.padEnd(26)} already uploaded\n`);
        continue;
      }
      if (!version) {
        const result = await api(session, '/api/admin/media-versions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': `run-card-art-v3:${row.artId}:${payload.provenance.promptSha256.slice(0, 24)}`,
          },
          body: JSON.stringify(payload),
        });
        version = result.version;
        created += 1;
      }
      if (!version.media) {
        await api(session, `/api/admin/media-versions/${encodeURIComponent(version.id)}/content`, {
          method: 'PUT',
          headers: { 'content-type': 'image/png', 'if-match': `"${version.rowRevision}"` },
          body: readFileSync(join(ART, `${row.artId}.png`)),
        });
        uploaded += 1;
      }
      process.stdout.write(`ok   ${row.artId.padEnd(26)} (${created + skipped}/${rows.length})\n`);
    } catch (error) {
      const message = String(error.message ?? error);
      failures.push({ artId: row.artId, error: message });
      process.stdout.write(`FAIL ${row.artId.padEnd(26)} ${message.slice(0, 160)}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify({ candidates: rows.length, created, uploaded, skipped, failed: failures.length, failures: failures.slice(0, 5) }, null, 2)}\n`);
} finally {
  await session.browser.close();
}
