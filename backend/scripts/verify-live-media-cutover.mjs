#!/usr/bin/env node

// Read-only cutover proof for ADR-0081. This deliberately verifies the public
// backend boundary instead of reading Postgres, Blob Storage, or repository
// files: the browser and headless renderer must be able to resolve the exact
// catalog revision and immutable bytes through the same-origin contract.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA256 = /^[0-9a-f]{64}$/;
const SLOT_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._@+-]*$/;
const INVENTORY_SCHEMA = 'adr-0081-media-migration-inventory-v1';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function stableSlotUrl(slot) {
  const segments = String(slot).split('/');
  invariant(segments.length > 0 && segments.every((segment) => SLOT_SEGMENT.test(segment)), `invalid slot: ${slot}`);
  return `/assets/${segments.map(encodeURIComponent).join('/')}`;
}

export function assertCatalog(raw) {
  invariant(isRecord(raw), 'catalog response is not an object');
  invariant(raw.schemaVersion === 1, `unsupported catalog schema: ${raw.schemaVersion}`);
  invariant(Number.isSafeInteger(raw.revision) && raw.revision >= 0, 'catalog revision is invalid');
  invariant(raw.updatedAt === null || typeof raw.updatedAt === 'string', 'catalog updatedAt is invalid');
  invariant(Array.isArray(raw.slots), 'catalog slots are missing');
  const seen = new Set();
  let critical = 0;
  for (const entry of raw.slots) {
    invariant(isRecord(entry), 'catalog slot entry is not an object');
    invariant(typeof entry.slot === 'string' && entry.slot, 'catalog slot name is missing');
    invariant(!seen.has(entry.slot), `duplicate catalog slot: ${entry.slot}`);
    seen.add(entry.slot);
    invariant(typeof entry.domain === 'string' && entry.domain, `${entry.slot}: domain is missing`);
    invariant(typeof entry.role === 'string' && entry.role, `${entry.slot}: role is missing`);
    invariant(entry.availabilityPolicy === 'critical' || entry.availabilityPolicy === 'decorative', `${entry.slot}: availability policy is invalid`);
    if (entry.availabilityPolicy === 'critical') critical += 1;
    invariant(typeof entry.activeVersionId === 'string' && entry.activeVersionId, `${entry.slot}: active version id is missing`);
    invariant(Number.isSafeInteger(entry.rowRevision) && entry.rowRevision >= 0, `${entry.slot}: row revision is invalid`);
    invariant(isRecord(entry.metadata), `${entry.slot}: slot metadata is invalid`);
    invariant(entry.versionStatus === 'accepted' || entry.versionStatus === 'legacy-bridge', `${entry.slot}: active status is invalid`);
    invariant(entry.versionStatus === 'accepted' ? entry.productionEligible === true : entry.productionEligible === false,
      `${entry.slot}: production eligibility contradicts active status`);
    invariant(isRecord(entry.versionMetadata), `${entry.slot}: version metadata is invalid`);
    invariant(isRecord(entry.provenance), `${entry.slot}: provenance is invalid`);
    invariant(isRecord(entry.nativeEvidence), `${entry.slot}: native evidence is invalid`);
    invariant(isRecord(entry.media), `${entry.slot}: media descriptor is missing`);
    invariant(entry.media.url === stableSlotUrl(entry.slot), `${entry.slot}: stable URL is not canonical`);
    invariant(typeof entry.media.sha256 === 'string' && SHA256.test(entry.media.sha256), `${entry.slot}: SHA-256 is invalid`);
    invariant(entry.media.immutableUrl === `/api/media/${entry.media.sha256}`, `${entry.slot}: immutable URL does not match SHA-256`);
    invariant(typeof entry.media.mediaType === 'string' && entry.media.mediaType.includes('/'), `${entry.slot}: media type is invalid`);
    invariant(Number.isSafeInteger(entry.media.byteLength) && entry.media.byteLength > 0, `${entry.slot}: byte length is invalid`);
    for (const dimension of ['width', 'height']) {
      invariant(entry.media[dimension] === null || (Number.isSafeInteger(entry.media[dimension]) && entry.media[dimension] > 0),
        `${entry.slot}: ${dimension} is invalid`);
    }
  }
  invariant(critical > 0, 'catalog contains no availability-critical slot');
  return raw;
}

export function readExpectedInventory(filename) {
  const raw = JSON.parse(fs.readFileSync(filename, 'utf8'));
  invariant(raw.schema === INVENTORY_SCHEMA, `unsupported inventory schema: ${raw.schema}`);
  invariant(Array.isArray(raw.entries), 'inventory entries are missing');
  const expected = new Map();
  for (const entry of raw.entries) {
    if (entry.migrationDisposition !== 'legacy-bridge') continue;
    invariant(typeof entry.slot === 'string' && entry.slot, `legacy bridge has no slot: ${entry.sourcePath || '<unknown>'}`);
    invariant(!expected.has(entry.slot), `duplicate legacy slot in inventory: ${entry.slot}`);
    invariant(SHA256.test(entry.sha256), `${entry.slot}: inventory SHA-256 is invalid`);
    expected.set(entry.slot, { ...entry, expectedStatus: 'legacy-bridge' });
  }
  invariant(expected.size > 0, 'inventory contains no public legacy-bridge entries');
  return { raw, expected };
}

export function compareCatalogToInventory(catalog, inventory) {
  const actual = new Map(catalog.slots.map((entry) => [entry.slot, entry]));
  const failures = [];
  for (const [slot, expected] of inventory.expected) {
    const entry = actual.get(slot);
    if (!entry) {
      failures.push(`${slot}: missing from live catalog`);
      continue;
    }
    if (entry.versionStatus !== expected.expectedStatus) {
      failures.push(`${slot}: expected ${expected.expectedStatus}, got ${entry.versionStatus}`);
    }
    const pairs = [
      ['sha256', expected.sha256, entry.media.sha256],
      ['byteLength', expected.byteLength, entry.media.byteLength],
      ['mediaType', expected.mediaType, entry.media.mediaType],
      ['width', expected.width, entry.media.width],
      ['height', expected.height, entry.media.height],
    ];
    for (const [field, wanted, got] of pairs) {
      if (wanted !== got) failures.push(`${slot}: ${field} expected ${String(wanted)}, got ${String(got)}`);
    }
  }
  for (const entry of catalog.slots) {
    if (!inventory.expected.has(entry.slot)) {
      failures.push(`${entry.slot}: live public slot is absent from the migration inventory`);
    }
  }
  return failures;
}

function timeoutSignal(timeoutMs) {
  return AbortSignal.timeout(timeoutMs);
}

async function fetchChecked(url, options, timeoutMs) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: timeoutSignal(timeoutMs) });
  } catch (error) {
    throw new Error(`${url}: request failed (${error.message})`);
  }
  return response;
}

function contentType(response) {
  return String(response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
}

export async function verifySlot(origin, entry, timeoutMs) {
  const stable = new URL(entry.media.url, origin);
  const expectedImmutable = new URL(entry.media.immutableUrl, origin);
  const redirect = await fetchChecked(stable, { redirect: 'manual', cache: 'no-store' }, timeoutMs);
  invariant([302, 307].includes(redirect.status), `${entry.slot}: stable route returned ${redirect.status}, expected 302 or 307`);
  const location = redirect.headers.get('location');
  invariant(location, `${entry.slot}: stable route omitted Location`);
  const redirected = new URL(location, stable);
  invariant(redirected.href === expectedImmutable.href, `${entry.slot}: stable route points at ${redirected.href}`);
  invariant(redirected.origin === new URL(origin).origin, `${entry.slot}: stable route redirects cross-origin`);
  invariant(/(?:no-cache|no-store|max-age=0)/i.test(redirect.headers.get('cache-control') || ''),
    `${entry.slot}: stable route is missing a pointer-safe Cache-Control header`);

  const immutable = await fetchChecked(expectedImmutable, { redirect: 'error', cache: 'no-store' }, timeoutMs);
  invariant(immutable.status === 200, `${entry.slot}: immutable route returned ${immutable.status}`);
  invariant(contentType(immutable) === entry.media.mediaType.toLowerCase(),
    `${entry.slot}: immutable Content-Type is ${contentType(immutable)}, expected ${entry.media.mediaType}`);
  invariant(/immutable/i.test(immutable.headers.get('cache-control') || ''), `${entry.slot}: immutable route is not cacheable as immutable`);

  const hash = crypto.createHash('sha256');
  let bytes = 0;
  invariant(immutable.body, `${entry.slot}: immutable response has no body`);
  for await (const chunk of immutable.body) {
    bytes += chunk.byteLength;
    hash.update(chunk);
  }
  const sha256 = hash.digest('hex');
  invariant(bytes === entry.media.byteLength, `${entry.slot}: received ${bytes} bytes, expected ${entry.media.byteLength}`);
  invariant(sha256 === entry.media.sha256, `${entry.slot}: received SHA-256 ${sha256}, expected ${entry.media.sha256}`);
  return { slot: entry.slot, bytes, sha256 };
}

export function parseArgs(argv) {
  const options = {
    origin: null,
    inventory: null,
    concurrency: 6,
    timeoutMs: 30_000,
    expectRevision: null,
    expectMinSlots: 1,
    criticalOnly: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new Error(`${arg} requires a value`);
      return next;
    };
    if (arg === '--origin') options.origin = value();
    else if (arg === '--inventory') options.inventory = path.resolve(value());
    else if (arg === '--concurrency') options.concurrency = Number(value());
    else if (arg === '--timeout-ms') options.timeoutMs = Number(value());
    else if (arg === '--expect-revision') options.expectRevision = Number(value());
    else if (arg === '--expect-min-slots') options.expectMinSlots = Number(value());
    else if (arg === '--critical-only') options.criticalOnly = true;
    else if (arg === '--json') options.json = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  invariant(options.origin, '--origin is required');
  const origin = new URL(options.origin);
  invariant(origin.protocol === 'https:' || ['localhost', '127.0.0.1', '127.0.0.2'].includes(origin.hostname),
    '--origin must use HTTPS except on loopback');
  origin.pathname = '/';
  origin.search = '';
  origin.hash = '';
  options.origin = origin.href;
  invariant(Number.isInteger(options.concurrency) && options.concurrency >= 1 && options.concurrency <= 32, '--concurrency must be 1..32');
  invariant(Number.isInteger(options.timeoutMs) && options.timeoutMs >= 1_000, '--timeout-ms must be at least 1000');
  invariant(Number.isInteger(options.expectMinSlots) && options.expectMinSlots >= 1, '--expect-min-slots must be positive');
  invariant(options.expectRevision === null || (Number.isSafeInteger(options.expectRevision) && options.expectRevision >= 0),
    '--expect-revision must be a non-negative integer');
  return options;
}

async function verify(options) {
  const catalogUrl = new URL('/api/asset-catalog', options.origin);
  const response = await fetchChecked(catalogUrl, { cache: 'no-store' }, options.timeoutMs);
  invariant(response.status === 200, `catalog returned ${response.status}`);
  invariant(/(?:no-cache|no-store|max-age=0)/i.test(response.headers.get('cache-control') || ''),
    'catalog is missing a pointer-safe Cache-Control header');
  const catalog = assertCatalog(await response.json());
  invariant(catalog.slots.length >= options.expectMinSlots,
    `catalog has ${catalog.slots.length} slots, expected at least ${options.expectMinSlots}`);
  if (options.expectRevision !== null) {
    invariant(catalog.revision === options.expectRevision,
      `catalog revision is ${catalog.revision}, expected ${options.expectRevision}`);
  }

  let inventory = null;
  if (options.inventory) {
    inventory = readExpectedInventory(options.inventory);
    const failures = compareCatalogToInventory(catalog, inventory);
    invariant(failures.length === 0, `catalog does not match migration inventory:\n- ${failures.join('\n- ')}`);
  }

  const selected = options.criticalOnly
    ? catalog.slots.filter((entry) => entry.availabilityPolicy === 'critical')
    : catalog.slots;
  let cursor = 0;
  const verified = [];
  const workers = Array.from({ length: Math.min(options.concurrency, selected.length) }, async () => {
    while (cursor < selected.length) {
      const entry = selected[cursor++];
      verified.push(await verifySlot(options.origin, entry, options.timeoutMs));
    }
  });
  await Promise.all(workers);
  return {
    origin: options.origin,
    catalogRevision: catalog.revision,
    catalogSlots: catalog.slots.length,
    verifiedSlots: verified.length,
    verifiedBytes: verified.reduce((sum, entry) => sum + entry.bytes, 0),
    inventoryPublicSlots: inventory ? inventory.expected.size : null,
  };
}

async function runCli() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await verify(options);
    if (options.json) console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    else {
      console.log(`Live-media cutover verified at ${result.origin}`);
      console.log(`Catalog revision ${result.catalogRevision}: ${result.verifiedSlots}/${result.catalogSlots} slots, ${result.verifiedBytes} bytes hash-verified`);
      if (result.inventoryPublicSlots !== null) console.log(`Migration inventory matched ${result.inventoryPublicSlots} public legacy slots`);
    }
  } catch (error) {
    console.error(`Live-media cutover verification FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await runCli();
