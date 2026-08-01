#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? true) : fallback;
};
const has = (name) => argv.includes(`--${name}`);
const baseUrl = String(flag('base', 'http://card-design.chess-tactics.localhost')).replace(/\/+$/, '');
const manifestPath = flag('manifest');
const dryRun = has('dry-run');
const installImages = has('install-images');
const apiBaseUrl = String(flag('api-base', baseUrl)).replace(/\/+$/, '');
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const PIECE_VALUE = Object.freeze({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 });
const PIECE_INITIAL = Object.freeze({ pawn: 'p', knight: 'k', bishop: 'b', rook: 'r', queen: 'q' });
const PIECE_ORDER = Object.freeze(Object.keys(PIECE_VALUE));
const GROUP_ID = 'run-card-art-core-v1';

function requiredText(value, label, max = 8_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${label} must be non-empty text of at most ${max} characters`);
  }
  return value.trim();
}

function canonicalCardId(pieces) {
  return [...pieces]
    .sort((left, right) => PIECE_ORDER.indexOf(left) - PIECE_ORDER.indexOf(right))
    .map((piece) => PIECE_INITIAL[piece])
    .join('');
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function loadManifest() {
  if (typeof manifestPath !== 'string' || !manifestPath.trim()) throw new Error('--manifest is required');
  const resolved = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (
    manifest.schema !== 'run-card-art-pixellab-manifest-v1'
    || manifest.nativeWidth !== 400 || manifest.nativeHeight !== 280
    || !Array.isArray(manifest.cards) || manifest.cards.length !== 49
  ) throw new Error('manifest must describe the complete native 400x280 PixelLab set');
  const ids = new Set();
  const jobs = new Set();
  const cards = manifest.cards.map((raw) => {
    const id = requiredText(raw.id, 'card.id', 32);
    const title = requiredText(raw.title, `${id}.title`, 160);
    if (ids.has(id)) throw new Error(`duplicate card id ${id}`);
    ids.add(id);
    if (!Array.isArray(raw.pieces) || raw.pieces.some((piece) => !PIECE_ORDER.includes(piece))) {
      throw new Error(`${id}.pieces are invalid`);
    }
    if (canonicalCardId(raw.pieces) !== id) throw new Error(`${id}.pieces do not match its canonical id`);
    const baseCost = raw.pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0);
    if (baseCost < 1 || baseCost > 9) throw new Error(`${id}.baseCost is outside the core deck`);
    const pixelLabJobId = requiredText(raw.pixelLabJobId, `${id}.pixelLabJobId`, 64);
    if (!/^[0-9a-f-]{36}$/.test(pixelLabJobId) || jobs.has(pixelLabJobId)) {
      throw new Error(`${id}.pixelLabJobId is invalid or duplicated`);
    }
    jobs.add(pixelLabJobId);
    const file = path.resolve(path.dirname(resolved), requiredText(raw.file, `${id}.file`, 260));
    const bytes = fs.readFileSync(file);
    if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      throw new Error(`${id}.file is not a PNG`);
    }
    const prompt = requiredText(raw.prompt, `${id}.prompt`);
    const promptExactness = raw.promptExactness === 'exact-tool-input'
      ? 'exact-tool-input' : raw.promptExactness === 'reconstructed-description'
        ? 'reconstructed-description' : null;
    if (!promptExactness) throw new Error(`${id}.promptExactness is invalid`);
    return {
      id,
      title,
      pieces: raw.pieces,
      baseCost,
      historicalAnchor: requiredText(raw.historicalAnchor, `${id}.historicalAnchor`, 160),
      sceneDirection: requiredText(raw.sceneDirection, `${id}.sceneDirection`, 4_000),
      unitIdentity: requiredText(raw.unitIdentity, `${id}.unitIdentity`, 2_000),
      prompt,
      promptSha256: sha256(prompt),
      promptExactness,
      pixelLabJobId,
      file,
      bytes,
      imageSha256: sha256(bytes),
    };
  });
  const requiredSlots = cards.map((card) => `ui/run/card-art/${card.id}/illustration.png`).sort();
  return { resolved, cards, requiredSlots };
}

function candidatePayload(card, requiredSlots) {
  const slot = `ui/run/card-art/${card.id}/illustration.png`;
  return {
    slot,
    domain: 'run-card-art',
    role: 'illustration',
    label: `${card.title} PixelLab card illustration`,
    availabilityPolicy: 'decorative',
    slotMetadata: {
      schema: 'run-card-art-slot-v2',
      cardId: card.id,
      cardType: 'Units',
      acceptance: { mode: 'group', groupId: GROUP_ID, requiredSlots },
    },
    metadata: {
      schema: 'run-card-art-plan-v2',
      cardId: card.id,
      cardTitle: card.title,
      cardType: 'Units',
      pieces: card.pieces,
      baseCost: card.baseCost,
      historicalAnchor: card.historicalAnchor,
      generationModel: 'pixellab-pixflux',
      nativeWidth: 400,
      nativeHeight: 280,
    },
    provenance: {
      schema: 'run-card-art-prompt-v2',
      source: 'PixelLab PixFlux generation job',
      generationModel: 'pixellab-pixflux',
      pixelLabJobId: card.pixelLabJobId,
      prompt: card.prompt,
      promptSha256: card.promptSha256,
      promptExactness: card.promptExactness,
      historicalAnchor: card.historicalAnchor,
      sceneDirection: card.sceneDirection,
      unitIdentity: card.unitIdentity,
    },
    nativeEvidence: {
      native1x: true,
      spatialResampling: false,
      sourceWidth: 400,
      sourceHeight: 280,
      sourceSha256: card.imageSha256,
    },
  };
}

async function jsonFetch(session, url, options = {}) {
  const response = await fetch(new URL(url, session.apiTarget).href, {
    ...options,
    headers: { cookie: session.cookieHeader, ...(options.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function openOwnerSession() {
  const executablePath = CHROMES.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error(`Chrome or Edge is required; checked ${CHROMES.join(', ')}`);
  const target = new URL(baseUrl);
  if (!(target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname.endsWith('.localhost'))) {
    throw new Error('automatic owner sign-in is restricted to a loopback development URL');
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-first-run'],
  });
  const page = await browser.newPage();
  const signIn = new URL('/api/auth/sign-in', target);
  signIn.searchParams.set('returnTo', '/api/auth/me');
  const response = await page.goto(signIn.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (!response?.ok()) throw new Error(`local owner sign-in failed (${response?.status() ?? 'no response'})`);
  const authState = await page.evaluate(() => {
    try { return JSON.parse(document.body.textContent || '{}'); } catch { return {}; }
  });
  if (!authState?.signed_in) throw new Error('local owner sign-in did not establish a session');
  const cookies = await page.cookies(target.origin);
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  if (!cookieHeader) throw new Error('local owner sign-in did not return a session cookie');
  return { browser, page, cookieHeader, apiTarget: new URL(apiBaseUrl) };
}

async function adminCatalog(session) {
  return jsonFetch(session, '/api/admin/media-assets');
}

function v2Versions(catalog, cards) {
  const bySlot = new Map();
  for (const version of catalog.versions) {
    if (version.domain !== 'run-card-art' || version.role !== 'illustration') continue;
    if (version.provenance?.schema !== 'run-card-art-prompt-v2') continue;
    bySlot.set(version.slot, version);
  }
  return cards.map((card) => {
    const slot = `ui/run/card-art/${card.id}/illustration.png`;
    const version = bySlot.get(slot);
    if (!version || version.provenance.pixelLabJobId !== card.pixelLabJobId) {
      throw new Error(`${card.id}: current PixelLab candidate is missing from the live catalog`);
    }
    return version;
  });
}

async function installAndUpload(session, manifest) {
  const catalog = await adminCatalog(session);
  const existingBySlot = new Map(catalog.versions
    .filter((version) => version.domain === 'run-card-art' && version.provenance?.schema === 'run-card-art-prompt-v2')
    .map((version) => [version.slot, version]));
  for (const card of manifest.cards) {
    const payload = candidatePayload(card, manifest.requiredSlots);
    const existing = existingBySlot.get(payload.slot);
    let version;
    if (existing) {
      if (existing.provenance.pixelLabJobId !== card.pixelLabJobId) {
        throw new Error(`${card.id}: another v2 candidate already owns the semantic slot`);
      }
      version = existing;
    } else {
      const created = await jsonFetch(session, '/api/admin/media-versions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `run-card-art-pixellab-v2:${card.id}:${card.pixelLabJobId}`,
        },
        body: JSON.stringify(payload),
      });
      version = created.version;
    }
    if (version.status === 'candidate' && version.nativeEvidence?.native1x !== true) {
      const repaired = await jsonFetch(session, `/api/admin/media-versions/${encodeURIComponent(version.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: version.rowRevision,
          nativeEvidence: payload.nativeEvidence,
        }),
      });
      version = repaired.version;
    }
    if (!version.media) {
      await jsonFetch(session, `/api/admin/media-versions/${encodeURIComponent(version.id)}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png', 'if-match': `"${version.rowRevision}"` },
        body: card.bytes,
      });
    }
  }
}

async function proveReviewAndPromote(session, manifest) {
  let catalog = await adminCatalog(session);
  const versions = v2Versions(catalog, manifest.cards);
  if (versions.every((version) => version.status === 'accepted')) {
    return { replayed: true, accepted: versions.length, catalogRevision: catalog.revision };
  }
  if (versions.some((version) => version.status !== 'candidate' || !version.media)) {
    throw new Error('the 49-card group must be entirely accepted or entirely media-backed candidates');
  }
  const surface = new URL('/studio', baseUrl);
  surface.searchParams.set('cat', 'cardprompts');
  await session.page.goto(surface.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await session.page.waitForFunction(() => {
    const images = [...document.querySelectorAll('img[data-run-card-art-candidate]')];
    return images.length === 49 && images.every((image) => image.complete && image.naturalWidth === 400 && image.naturalHeight === 280);
  }, { timeout: 60_000 });
  const cardIds = await session.page.$$eval('img[data-run-card-art-candidate]', (images) => (
    images.map((image) => image.getAttribute('data-run-card-art-candidate')).filter(Boolean).sort()
  ));
  const slotByName = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  const proof = {
    schema: 'live-media-owner-group-proof-v1',
    canonicalScale: 1,
    surfaceKind: 'Studio Card Prompts complete Units set',
    renderer: 'RunCardPromptCatalog/RunCardArtCandidateGrid',
    decodedNativeRaster: { width: 400, height: 280, scale: 1 },
    mountedCardIds: cardIds,
    selectedCandidates: versions.map((version) => ({
      slot: version.slot,
      role: version.role,
      versionId: version.id,
      sha256: version.media.sha256,
      rowRevision: version.rowRevision,
    })),
    slotSnapshots: versions.map((version) => {
      const slot = slotByName.get(version.slot);
      if (!slot) throw new Error(`${version.slot}: live slot is missing`);
      return { slot: slot.slot, rowRevision: slot.rowRevision, activeVersionId: slot.activeVersionId };
    }),
    acceptanceGroup: { groupId: GROUP_ID, requiredSlots: manifest.requiredSlots },
  };
  const review = await jsonFetch(session, '/api/admin/media-versions/review-batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: new URL(baseUrl).origin },
    body: JSON.stringify({
      approved: true,
      notes: 'Owner approved the PixelLab card-art direction and authorized direct wiring of the complete core set.',
      surfaceUrl: surface.href,
      evidence: proof,
      items: versions.map((version) => ({ id: version.id, expectedRevision: version.rowRevision })),
    }),
  });
  const reviewedById = new Map(review.versions.map((version) => [version.id, version]));
  const accepted = await jsonFetch(session, '/api/admin/media-versions/accept-batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      items: versions.map((version) => {
        const slot = slotByName.get(version.slot);
        const reviewed = reviewedById.get(version.id);
        return {
          id: version.id,
          expectedRevision: reviewed.rowRevision,
          expectedSlotRevision: slot.rowRevision,
          expectedActiveVersionId: slot.activeVersionId,
        };
      }),
    }),
  });
  catalog = await adminCatalog(session);
  return { replayed: false, accepted: accepted.versions.length, catalogRevision: catalog.revision };
}

async function main() {
  if (dryRun && !manifestPath) {
    const seedUrl = new URL('../../docs/art/run-card-prompts-v1.json', import.meta.url);
    const seed = JSON.parse(fs.readFileSync(seedUrl, 'utf8'));
    if (!Array.isArray(seed.cards) || seed.cards.length !== 49) throw new Error('core Units-card identity seed must contain 49 cards');
    const ids = seed.cards.map((card) => {
      if (!Array.isArray(card.pieces) || canonicalCardId(card.pieces) !== card.id) {
        throw new Error(`${card.id ?? 'unknown'}: core card identity is invalid`);
      }
      return card.id;
    });
    if (new Set(ids).size !== 49) throw new Error('core Units-card identity seed contains duplicate ids');
    process.stdout.write(`${JSON.stringify({ valid: true, cards: 49, installRequiresExternalPixelLabManifest: true }, null, 2)}\n`);
    return;
  }
  const manifest = loadManifest();
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ valid: true, cards: manifest.cards.length, exactPrompts: manifest.cards.filter((card) => card.promptExactness === 'exact-tool-input').length, reconstructedPrompts: manifest.cards.filter((card) => card.promptExactness === 'reconstructed-description').length }, null, 2)}\n`);
    return;
  }
  if (!installImages) throw new Error('choose --dry-run or --install-images');
  const session = await openOwnerSession();
  try {
    await installAndUpload(session, manifest);
    process.stdout.write(`${JSON.stringify(await proveReviewAndPromote(session, manifest), null, 2)}\n`);
  } finally {
    await session.browser.close();
  }
}

await main();
