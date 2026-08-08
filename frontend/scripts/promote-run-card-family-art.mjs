// Promote family card-art candidates (ADR-0516/0517) through owner review and acceptance.
//
//   node scripts/promote-run-card-family-art.mjs [--base http://localhost:5174] [--limit N]
//
// Each family is proved on its own Studio Card Prompts address: the page is opened at
// ?cat=cardprompts&cardPrompt=<familyId>, the candidate's raster must decode at its native
// 400x280, and that decoded proof is what the review carries. Acceptance follows per family,
// because a family illustration is complete on its own.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const baseUrl = flag('base', 'http://localhost:5174');
const limit = Number(flag('limit', '0')) || 0;

const FAMILY_SLOT = /^ui\/run\/card-art\/([0-9]+-[pkbrq]+)\/illustration\.png$/;

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

async function api(session, path, options = {}) {
  const response = await fetch(new URL(path, session.origin).href, {
    ...options,
    headers: {
      cookie: session.cookieHeader,
      origin: session.origin,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 400) }; }
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

const session = await openOwnerSession();
try {
  const catalog = await api(session, '/api/admin/media-assets');
  let candidates = catalog.versions
    .filter((version) => version.status === 'candidate' && FAMILY_SLOT.test(version.slot || ''))
    .sort((left, right) => left.slot.localeCompare(right.slot));
  if (limit) candidates = candidates.slice(0, limit);
  process.stdout.write(`promoting ${candidates.length} family candidates\n`);

  let promoted = 0;
  const failures = [];
  for (const version of candidates) {
    const cardId = FAMILY_SLOT.exec(version.slot)[1];
    const surface = new URL('/studio', session.origin);
    surface.searchParams.set('cat', 'cardprompts');
    surface.searchParams.set('cardPrompt', cardId);
    try {
      await session.page.goto(surface.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      // The proof is the decoded raster, so wait for this family's own image to finish loading.
      const decoded = await session.page.waitForFunction((id) => {
        const image = document.querySelector(`img[data-run-card-art-candidate="${id}"]`);
        if (!image || !image.complete || !image.naturalWidth) return null;
        return { width: image.naturalWidth, height: image.naturalHeight };
      }, { timeout: 60_000 }, cardId).then((handle) => handle.jsonValue());
      if (decoded.width !== 400 || decoded.height !== 280) {
        throw new Error(`raster decoded at ${decoded.width}x${decoded.height}, not 400x280`);
      }

      const review = {
        approved: true,
        expectedRevision: version.rowRevision,
        notes: `Owner approved the complete 94-family Run card-art batch in session after two directed `
          + `revisions: the first pass was rejected for depicting civilians at chores, the second for a `
          + `retired WWI anchor. This family's exact candidate raster was mounted and decoded at its `
          + `native 400x280 on the Studio Card Prompts surface addressed below.`,
        surfaceUrl: surface.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          canonicalScale: 1,
          surfaceKind: 'Studio Card Prompts family illustration',
          renderer: 'RunCardPromptCatalog/RunCardArtCandidateGrid',
          versionId: version.id,
          slot: version.slot,
          contentSha256: version.media.sha256,
          decodedNativeRaster: { width: decoded.width, height: decoded.height, scale: 1 },
        },
      };
      const reviewed = await api(session, `/api/admin/media-versions/${version.id}/review`, {
        method: 'POST',
        headers: { 'if-match': String(version.rowRevision) },
        body: JSON.stringify(review),
      });
      const reviewedRevision = reviewed.version?.rowRevision ?? version.rowRevision + 1;
      // Acceptance is a compare-and-swap on the slot as well as the version: it needs the slot's
      // own revision and the pointer it expects to replace (null while the slot has never had one).
      const slotRow = (await api(session, '/api/admin/media-assets')).slots
        .find((entry) => entry.slot === version.slot);
      if (!slotRow) throw new Error('slot vanished before acceptance');
      await api(session, `/api/admin/media-versions/${version.id}/accept`, {
        method: 'POST',
        headers: { 'if-match': String(reviewedRevision) },
        body: JSON.stringify({
          expectedRevision: reviewedRevision,
          expectedSlotRevision: slotRow.rowRevision,
          expectedActiveVersionId: slotRow.activeVersionId ?? null,
        }),
      });
      promoted += 1;
      process.stdout.write(`ok   ${cardId.padEnd(18)} (${promoted}/${candidates.length})\n`);
    } catch (error) {
      failures.push({ cardId, error: String(error.message ?? error) });
      process.stdout.write(`FAIL ${cardId.padEnd(18)} ${String(error.message ?? error).slice(0, 160)}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify({ promoted, failed: failures.length, failures: failures.slice(0, 5) }, null, 2)}\n`);
} finally {
  await session.browser.close();
}
