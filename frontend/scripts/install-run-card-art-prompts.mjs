#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? (argv[index + 1] ?? true) : fallback;
};
const has = (name) => argv.includes(`--${name}`);
const baseUrl = String(flag('base', 'http://card-design.chess-tactics.localhost')).replace(/\/+$/, '');
const dryRun = has('dry-run');
const seedUrl = new URL('../../docs/art/run-card-prompts-v1.json', import.meta.url);
const seed = JSON.parse(fs.readFileSync(seedUrl, 'utf8'));
const environmentUrl = new URL('../../.codex-session/environment.json', import.meta.url);
let defaultApiBaseUrl = baseUrl;
if (fs.existsSync(environmentUrl)) {
  try {
    const environment = JSON.parse(fs.readFileSync(environmentUrl, 'utf8'));
    if (Number.isSafeInteger(environment.frontend_port) && environment.frontend_port > 0) {
      defaultApiBaseUrl = `http://127.0.0.1:${environment.frontend_port}`;
    }
  } catch { /* explicit --api-base remains available for malformed local state */ }
}
const apiBaseUrl = String(flag('api-base', defaultApiBaseUrl)).replace(/\/+$/, '');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const PIECE_VALUE = Object.freeze({ pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 });
const PIECE_INITIAL = Object.freeze({ pawn: 'p', knight: 'k', bishop: 'b', rook: 'r', queen: 'q' });
const PIECE_ORDER = Object.freeze(Object.keys(PIECE_VALUE));
const UNIT_ROLE = Object.freeze({
  pawn: ['common foot laborer or levy', 'common foot laborers or levies'],
  knight: ['mounted retainer, courier, or scout', 'mounted retainers, couriers, or scouts'],
  bishop: ['cleric, teacher, or caretaker', 'clerics, teachers, or caretakers'],
  rook: ['fortified keeper or watchkeeper', 'fortified keepers or watchkeepers'],
  queen: ['queen-like administrator or ruler', 'queen-like administrators or rulers'],
});
const ANCHOR_LABEL = Object.freeze({
  'jerusalem-second-temple-70-ce': 'After the Sanctuary — destruction of Jerusalem and the Second Temple, 70 CE',
  'dissolution-of-the-monasteries': 'Stone After Prayer — Dissolution of the Monasteries',
  'year-without-a-summer-1816': 'The Summer That Failed — Year Without a Summer, 1816',
  'lijssenthoek-remy-farm-wwi': 'The Farm Behind the Line — Lijssenthoek / Remy Farm, World War I',
});

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

function baseCost(pieces) {
  return pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0);
}

function compositionDirection(pieces) {
  const counts = Object.fromEntries(PIECE_ORDER.map((piece) => [piece, 0]));
  pieces.forEach((piece) => { counts[piece] += 1; });
  return PIECE_ORDER
    .filter((piece) => counts[piece] > 0)
    .map((piece) => `${counts[piece]} ${UNIT_ROLE[piece][counts[piece] === 1 ? 0 : 1]}`)
    .join(', ')
    .replace(/, ([^,]*)$/, ', and $1');
}

function composePrompt(card) {
  if (card.generationDisposition === 'existing-art') {
    return [
      'REFERENCE ONLY — EXISTING ART. DO NOT REGENERATE THIS CARD.',
      `Card identity: ${card.title}. Type: Units. Human composition: ${compositionDirection(card.pieces)}.`,
      card.sceneDirection,
      `Recorded eye treatment: ${card.eyeConcealment}`,
      `Historical pressure source: ${ANCHOR_LABEL[card.historicalAnchor]}.`,
      'The exact original ImageGen prompt was not retained. This is a reconstructed provenance description linked to the existing artwork hash, not a claim about the original tool input.',
    ].join('\n\n');
  }
  return [
    requiredText(seed.sharedDirection.format, 'sharedDirection.format'),
    `Card identity: ${card.title}. Type: Units. Human composition: ${compositionDirection(card.pieces)}. Show exactly these corresponding prominent unit roles; incidental distant people may exist only as atmosphere and must not read as additional granted units.`,
    requiredText(card.sceneDirection, `${card.id}.sceneDirection`),
    `Historical pressure source: ${ANCHOR_LABEL[card.historicalAnchor]}.`,
    `Eye-concealment treatment for this card: ${requiredText(card.eyeConcealment, `${card.id}.eyeConcealment`)}`,
    requiredText(seed.sharedDirection.world, 'sharedDirection.world'),
    requiredText(seed.sharedDirection.faces, 'sharedDirection.faces'),
    requiredText(seed.sharedDirection.exclusions, 'sharedDirection.exclusions'),
  ].join('\n\n');
}

function validateAndBuildPlans() {
  if (seed.schemaVersion !== 1 || seed.cardType !== 'Units') throw new Error('prompt seed schema must be Units v1');
  if (!seed.sharedDirection || typeof seed.sharedDirection !== 'object') throw new Error('sharedDirection is required');
  if (!Array.isArray(seed.cards) || seed.cards.length !== 49) throw new Error('prompt seed must contain exactly 49 cards');
  const ids = new Set();
  const titles = new Set();
  const plans = seed.cards.map((card) => {
    if (!card || typeof card !== 'object') throw new Error('each card prompt must be an object');
    const id = requiredText(card.id, 'card.id', 32);
    const title = requiredText(card.title, `${id}.title`, 160);
    if (ids.has(id)) throw new Error(`duplicate card id ${id}`);
    if (titles.has(title)) throw new Error(`duplicate card title ${title}`);
    ids.add(id);
    titles.add(title);
    if (!Array.isArray(card.pieces) || card.pieces.length < 1 || card.pieces.some((piece) => !PIECE_ORDER.includes(piece))) {
      throw new Error(`${id}.pieces must contain purchasable piece ids`);
    }
    if (canonicalCardId(card.pieces) !== id) throw new Error(`${id}.pieces do not resolve to the canonical id`);
    const value = baseCost(card.pieces);
    if (value < 1 || value > 9) throw new Error(`${id} has invalid base value ${value}`);
    if (!Object.hasOwn(ANCHOR_LABEL, card.historicalAnchor)) throw new Error(`${id} uses an unknown historical anchor`);
    if (!['pending', 'existing-art'].includes(card.generationDisposition)) throw new Error(`${id} has invalid generationDisposition`);
    if (card.generationDisposition === 'existing-art') {
      if (!/^[0-9a-f]{64}$/.test(card.existingArtSha256 || '')) throw new Error(`${id} existing art hash is required`);
      if (card.promptExactness !== 'reconstructed-description') throw new Error(`${id} must disclose reconstructed prompt provenance`);
    }
    const prompt = composePrompt(card);
    const promptSha256 = crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
    const slot = `${seed.slotPrefix}/${id}/illustration-v1.png`;
    return {
      id,
      title,
      slot,
      prompt,
      promptSha256,
      payload: {
        slot,
        domain: 'run-card-art',
        role: 'illustration',
        label: `${title} art prompt v1`,
        availabilityPolicy: 'decorative',
        slotMetadata: {
          schema: 'run-card-art-slot-v1',
          cardId: id,
          cardType: 'Units',
          acceptance: { mode: 'standalone' },
        },
        metadata: {
          schema: 'run-card-art-plan-v1',
          cardId: id,
          cardTitle: title,
          cardType: 'Units',
          pieces: card.pieces,
          baseCost: value,
          historicalAnchor: card.historicalAnchor,
          generationDisposition: card.generationDisposition,
          artWindowAspectRatio: 1.434,
          ...(card.existingArtSha256 ? { existingArtSha256: card.existingArtSha256 } : {}),
        },
        provenance: {
          schema: 'run-card-art-prompt-v1',
          source: 'owner-authored prompt catalog',
          sourcePath: 'docs/art/run-card-prompts-v1.json',
          promptSchemaVersion: 1,
          prompt,
          promptSha256,
          historicalAnchor: card.historicalAnchor,
          sceneDirection: card.sceneDirection,
          eyeConcealment: card.eyeConcealment,
          generationDisposition: card.generationDisposition,
          promptExactness: card.promptExactness ?? 'exact-authored-plan',
          ...(card.existingArtSha256 ? { existingArtSha256: card.existingArtSha256 } : {}),
        },
        nativeEvidence: {},
      },
    };
  });
  if (plans.filter((plan) => plan.payload.metadata.generationDisposition === 'pending').length !== 48) {
    throw new Error('prompt seed must contain 48 pending plans and one existing-art record');
  }
  return plans;
}

async function install(plans) {
  const executablePath = CHROMES.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error(`Chrome or Edge is required; checked ${CHROMES.join(', ')}`);
  const target = new URL(baseUrl);
  const apiTarget = new URL(apiBaseUrl);
  if (!(target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname.endsWith('.localhost'))) {
    throw new Error('automatic owner sign-in is restricted to a loopback development URL');
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-first-run'],
  });
  let cookieHeader = '';
  try {
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
    cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  } finally {
    await browser.close();
  }
  if (!cookieHeader) throw new Error('local owner sign-in did not return a session cookie');
  const results = [];
  for (const item of plans) {
    const created = await fetch(`${apiTarget.origin}/api/admin/media-versions`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        'content-type': 'application/json',
        'idempotency-key': `run-card-art-prompts-v1:${item.id}`,
      },
      body: JSON.stringify(item.payload),
    });
    const body = await created.json().catch(() => ({}));
    if (!created.ok) throw new Error(`${item.id}: ${created.status} ${JSON.stringify(body)}`);
    results.push({
      id: item.id,
      slot: item.slot,
      versionId: body.version?.id ?? null,
      rowRevision: body.version?.rowRevision ?? null,
      replayed: Boolean(body.idempotentReplay),
    });
  }
  return results;
}

const plans = validateAndBuildPlans();
if (dryRun) {
  const anchors = Object.fromEntries(Object.keys(ANCHOR_LABEL).map((anchor) => [
    anchor,
    plans.filter((plan) => plan.payload.metadata.historicalAnchor === anchor).length,
  ]));
  process.stdout.write(`${JSON.stringify({ valid: true, plans: plans.length, pending: 48, existingArt: 1, anchors }, null, 2)}\n`);
} else {
  const installed = await install(plans);
  process.stdout.write(`${JSON.stringify({ installed: installed.length, replayed: installed.filter((item) => item.replayed).length, items: installed }, null, 2)}\n`);
}
