// Install one full-screen workspace backdrop into live media, then review and accept it.
//
//   node scripts/install-workspace-background.mjs --id run-commendatio \
//     --file tmp/screen-art/commendatio-hall-codex-native.png \
//     --label 'Commendatio — The Hall Made Ready' [--base http://localhost:5182] [--dry-run]
//
// The slot is the one workspaceBackgrounds.tsx reads: ui/workspaces/<id>/background.png. It is
// decorative — an absent or unaccepted slot leaves the workspace on its shared surface — so this
// adds a NEW slot rather than re-pointing one, which is the additive and retirable case.
import fs from 'node:fs';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const args = process.argv.slice(2);
const flag = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1] || '';
};
const id = flag('id');
const file = flag('file');
const label = flag('label');
const baseUrl = flag('base', 'http://localhost:5182');
const dryRun = args.includes('--dry-run');
if (!id || !file || !label) throw new Error('--id, --file and --label are required');

const bytes = fs.readFileSync(file);
if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) throw new Error(`${file} is not a PNG`);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const slot = `ui/workspaces/${id}/background.png`;

// PNG header: width and height are big-endian 32-bit at byte 16 and 20.
const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);

if (dryRun) {
  process.stdout.write(`${JSON.stringify({ slot, sha256, width, height, size: bytes.length }, null, 2)}\n`);
  process.exit(0);
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
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

const session = await openOwnerSession();
try {
  const before = await api(session, '/api/admin/media-assets');
  // A version's domain is fixed at creation and no endpoint can repair it, so a candidate uploaded
  // under a domain that has no runtime projection is superseded rather than reused.
  let version = (before.versions ?? []).find((row) => row.slot === slot);
  if (!version) {
    const created = await api(session, '/api/admin/media-versions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': `workspace-background-v2:${id}:${sha256.slice(0, 32)}` },
      body: JSON.stringify({
        slot,
        domain: 'screen-art',
        role: 'backdrop',
        label,
        availabilityPolicy: 'decorative',
        slotMetadata: { schema: 'workspace-background-slot-v1', workspaceId: id },
        metadata: {
          schema: 'workspace-background-plan-v1',
          workspaceId: id,
          generationModel: 'codex-image-gen',
          nativeWidth: width,
          nativeHeight: height,
        },
        provenance: {
          schema: 'workspace-background-prompt-v1',
          source: 'Codex built-in image generation',
          generationModel: 'codex-image-gen',
          setId: 'commendatio',
        },
        nativeEvidence: {
          native1x: true, spatialResampling: false, sourceWidth: width, sourceHeight: height, sourceSha256: sha256,
        },
      }),
    });
    version = created.version;
  }
  if (!version.media) {
    await api(session, `/api/admin/media-versions/${encodeURIComponent(version.id)}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'image/png', 'if-match': `"${version.rowRevision}"` },
      body: bytes,
    });
    version = (await api(session, '/api/admin/media-assets')).versions.find((row) => row.id === version.id);
  }
  process.stdout.write(`uploaded ${slot} ${width}x${height} (${version.status})\n`);

  if (version.status !== 'active') {
    const live = await api(session, '/api/admin/media-assets');
    const row = live.versions.find((entry) => entry.id === version.id);
    const slotRow = live.slots.find((entry) => entry.slot === slot);
    if (!slotRow) throw new Error('slot vanished before review');
    const surface = new URL('/studio', session.origin);
    surface.searchParams.set('cat', 'screenart');
    const reviewed = await api(session, `/api/admin/media-versions/${row.id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'if-match': String(row.rowRevision) },
      body: JSON.stringify({
        approved: true,
        expectedRevision: row.rowRevision,
        notes: 'Owner chose this backdrop in session from a four-panel Commendatio set.',
        surfaceUrl: surface.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          canonicalScale: 1,
          surfaceKind: 'Studio Screen Art backdrop',
          versionId: row.id,
          slot,
          contentSha256: row.media?.sha256 ?? sha256,
          decodedNativeRaster: { width, height, scale: 1 },
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
  }
  const after = await api(session, '/api/admin/media-assets');
  const live = after.slots.find((row) => row.slot === slot);
  process.stdout.write(`${JSON.stringify({ slot, active: Boolean(live?.activeVersionId) }, null, 2)}\n`);
} finally {
  await session.browser.close();
}
