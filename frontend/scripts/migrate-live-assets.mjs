// TEMPORARY ADR-0085 CUTOVER TOOL.
//
// This is not a seed path and must not survive the cutover. The permanent
// no-committed-media guard fails while this file exists. It inventories the old
// Git bytes, uploads each byte-for-byte, verifies the immutable object by hash,
// and records either:
//   - an active, explicitly non-production-eligible legacy bridge for an old
//     frontend/public/assets semantic path; or
//   - a non-active private archive version for source/review media elsewhere.
//
// It never claims that legacy media is native 1x or owner-reviewed, and it has
// no review or acceptance capability. Production acceptance remains an
// owner-operated backend transaction after the storage cutover.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  isAllowedSyntheticTestMedia,
  isMediaPath,
  listTrackedFiles,
  normalizeRepoPath,
} from './check-no-committed-media.mjs';
import {
  LiveMediaAdminClient,
  mediaRecordFrom,
  mediaTypeFromBytes,
  mediaVersionFrom,
  sha256Bytes,
} from './live-media-admin-client.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepoRoot = path.resolve(frontendRoot, '..');
const INVENTORY_SCHEMA = 'adr-0085-media-migration-inventory-v1';
const PUBLIC_ASSET_PREFIX = 'frontend/public/assets/';
const DIVIDER_ORNAMENT_SOURCE = 'frontend/public/kit-portfolio/cand3-codex.png';
const PORTRAIT_CANONICAL_ACTIVATION_SOURCE = /^frontend\/public\/assets\/portrait-candidates\/codex-stone\/(bishop|king|knight|pawn|queen|rook)\/(black|crimson|emerald|golden|navy-blue|white)\.png$/;
const DISPLACED_CANONICAL_PORTRAIT_SOURCE = /^frontend\/public\/assets\/units\/(bishop|king|knight|pawn|queen|rook)\/portrait\/(black|crimson|emerald|golden|navy-blue|white)\.png$/;
const MAX_API_BYTES = 32 * 1024 * 1024;
const SLOT_SEGMENT_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._@+-]*$/;
const ADMIN_CATALOG_PATH = '/api/admin/media-assets';
const CREATE_PATH = '/api/admin/media-versions';
const CONTENT_PATH = '/api/admin/media-versions/{id}/content';
const BRIDGE_PATH = '/api/admin/media-versions/{id}/bridge';
const ARCHIVE_PATH = '/api/admin/media-versions/{id}/archive';
export const WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS = Object.freeze(
  Array.from({ length: 8 }, (_, index) => `tiles/surface/water-${index}-side.png`).sort(),
);
const FROZEN_FULL_INVENTORY = {
  count: 2217,
  bytes: 358412274,
  versionCount: 2253,
  activeCount: 1579,
  archiveCount: 674,
  canonicalActivationCount: 36,
  sha256: '972619d31295316214eb7da47fe66dd436db8c919659080f751e25775b71f8b5',
};

function sha256(bytes) {
  return sha256Bytes(bytes);
}

function sha256Text(value) {
  return sha256(Buffer.from(value, 'utf8'));
}

export function mediaTypeFor(relativePath, bytes) {
  return mediaTypeFromBytes(relativePath, bytes);
}

function uint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function imageDimensions(bytes, mediaType) {
  if (mediaType === 'image/png' && bytes.length >= 24
    && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mediaType === 'image/gif' && bytes.length >= 10) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (mediaType === 'image/jpeg' && bytes.length >= 4) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const segmentLength = bytes.readUInt16BE(offset + 2);
      if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + segmentLength;
    }
  }
  if (mediaType === 'image/webp' && bytes.length >= 30
    && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: uint24LE(bytes, 24) + 1, height: uint24LE(bytes, 27) + 1 };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const packed = bytes.readUInt32LE(21);
      return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
  }
  if (mediaType === 'image/avif') {
    const ispe = bytes.indexOf(Buffer.from('ispe', 'ascii'));
    if (ispe >= 0 && ispe + 16 <= bytes.length) {
      return { width: bytes.readUInt32BE(ispe + 8), height: bytes.readUInt32BE(ispe + 12) };
    }
  }
  return { width: null, height: null };
}

function runtimeDomain(slot) {
  const first = slot.split('/')[0];
  return ({
    backgrounds: 'background', doodads: 'prop', fonts: 'font', groundcover: 'terrain', og: 'social-card',
    'portrait-candidates': 'portrait', 'portrait-editor': 'portrait', props: 'prop', sfx: 'sfx',
    sprites: 'sprite-atlas', tiles: 'terrain', ui: 'ui-kit', units: 'unit-art', 'wall-decor': 'wall-decor',
    art: 'review-media', artwork: 'review-media',
  })[first] ?? 'runtime-media';
}

function sourceDomain(sourcePath) {
  if (/unit|portrait/i.test(sourcePath)) return /portrait/i.test(sourcePath) ? 'portrait' : 'unit-art';
  if (/tile|terrain|surface|groundcover|wall|fence|shore|water|road/i.test(sourcePath)) return 'terrain';
  if (/ui|kit|menu|button|toggle|frame|titlebar|scrollbar/i.test(sourcePath)) return 'ui-kit';
  if (/sfx|audio|sound|music/i.test(sourcePath)) return 'sfx';
  if (/prop|doodad/i.test(sourcePath)) return 'prop';
  return 'source-media';
}

function roleFor(sourcePath, isRuntime) {
  const value = sourcePath.toLowerCase();
  if (!isRuntime) {
    if (/candidate/.test(value)) return 'candidate';
    return /contact.sheet|proof|review|comparison|preview|screenshot/.test(value) ? 'review' : 'source';
  }
  if (/-top-anim\.|\/animation/.test(value)) return 'animation';
  if (/-top\./.test(value)) return 'top';
  if (/-side\./.test(value)) return 'side';
  if (/thumb|preview|contact.sheet|candidate|review|proof|concept|explore|generated-source|inspiration|aspirational/.test(value)) return 'review';
  if (/(?:^|\/)(?:readme|ofl|license)(?:\.|$)/.test(value)) return 'metadata';
  if (/\.json$/.test(value)) return 'manifest';
  if (/font/.test(value)) return 'font';
  if (/sfx|\.wav$|\.ogg$|\.m4a$|\.aac$/.test(value)) return 'audio';
  return 'media';
}

function availabilityPolicyFor(domain, role) {
  if (role === 'review' || role === 'metadata') return 'decorative';
  if (['sfx', 'portrait', 'prop', 'wall-decor', 'social-card', 'review-media'].includes(domain)) return 'decorative';
  return 'critical';
}

export function migrationIdentity(sourcePath) {
  const normalized = normalizeRepoPath(sourcePath);
  if (DISPLACED_CANONICAL_PORTRAIT_SOURCE.test(normalized)) {
    return {
      namespace: 'migration/git-media-cutover',
      slot: null,
      migrationDisposition: 'private-archive',
      domain: 'portrait',
      role: 'source',
    };
  }
  if (normalized === DIVIDER_ORNAMENT_SOURCE) {
    return {
      namespace: 'runtime',
      slot: 'ui/kit/dividers/codex-ornament.png',
      migrationDisposition: 'legacy-bridge',
      domain: 'ui-kit',
      role: 'media',
    };
  }
  if (normalized.startsWith(PUBLIC_ASSET_PREFIX)) {
    const slot = normalized.slice(PUBLIC_ASSET_PREFIX.length);
    if (!slot || slot.length > 512 || !slot.split('/').every((segment) => SLOT_SEGMENT_PATTERN.test(segment))) {
      throw new Error(`Public asset path cannot be preserved as a semantic slot: ${normalized}`);
    }
    return {
      namespace: 'runtime',
      slot,
      migrationDisposition: 'legacy-bridge',
      domain: runtimeDomain(slot),
      role: roleFor(slot, true),
    };
  }
  return {
    namespace: 'migration/git-media-cutover',
    slot: null,
    migrationDisposition: 'private-archive',
    domain: sourceDomain(normalized),
    role: roleFor(normalized, false),
  };
}

export function portraitCanonicalActivation(sourcePath, baseEntry) {
  const match = normalizeRepoPath(sourcePath).match(PORTRAIT_CANONICAL_ACTIVATION_SOURCE);
  if (!match) return null;
  if (!baseEntry?.slot) throw new Error(`Portrait canonical activation requires its candidate slot: ${sourcePath}`);
  const canonicalSlot = `units/${match[1]}/portrait/${match[2]}.png`;
  return {
    ...baseEntry,
    namespace: 'runtime-canonical-activation',
    slot: canonicalSlot,
    domain: 'portrait',
    role: 'portrait',
    availabilityPolicy: 'critical',
    activationSourceSlot: baseEntry.slot,
    displacedSourcePath: `${PUBLIC_ASSET_PREFIX}${canonicalSlot}`,
  };
}

export function acceptanceContractForSlot(slot) {
  if (!WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS.includes(slot)) return null;
  return {
    mode: 'group',
    groupId: 'terrain/water/side-v1',
    requiredSlots: [...WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS],
  };
}

function repositoryCommit(repoRoot) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function filesChangedFromHead(repoRoot) {
  const output = execFileSync('git', ['diff', '--name-only', '-z', 'HEAD', '--'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Set(output.split('\0').filter(Boolean).map(normalizeRepoPath));
}

function includePath(relativePath, prefixes) {
  return !prefixes.length || prefixes.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`));
}

function inventorySha256(entries) {
  return sha256(Buffer.from(entries.map((entry) => [
    entry.sourcePath,
    entry.sha256,
    entry.byteLength,
    entry.mediaType,
    entry.width ?? '',
    entry.height ?? '',
    entry.slot ?? '',
    entry.domain,
    entry.role,
    entry.availabilityPolicy ?? '',
    entry.activationSourceSlot ?? '',
    entry.displacedSourcePath ?? '',
    JSON.stringify(entry.acceptance ?? null),
    entry.migrationDisposition,
  ].join('\t')).join('\n'), 'utf8'));
}

export function buildMigrationInventory({ repoRoot = defaultRepoRoot, prefixes = [], startAfter = '', limit = Infinity } = {}) {
  const commit = repositoryCommit(repoRoot);
  const changedFromHead = filesChangedFromHead(repoRoot);
  const normalizedPrefixes = prefixes.map(normalizeRepoPath);
  const entries = [];
  let processedSources = 0;
  let started = !startAfter;
  for (const sourcePath of listTrackedFiles(repoRoot).sort()) {
    if (!started) {
      if (sourcePath === normalizeRepoPath(startAfter)) started = true;
      continue;
    }
    if (!isMediaPath(sourcePath) || !includePath(sourcePath, normalizedPrefixes)) continue;
    if (changedFromHead.has(sourcePath)) {
      throw new Error(`Tracked migration source differs from ${commit}: ${sourcePath}`);
    }
    const absolutePath = path.join(repoRoot, sourcePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;
    const bytes = fs.readFileSync(absolutePath);
    if (isMediaPath(sourcePath) && isAllowedSyntheticTestMedia(sourcePath, bytes.length)) continue;
    if (!bytes.length) throw new Error(`Refusing to migrate empty media: ${sourcePath}`);
    if (bytes.length > MAX_API_BYTES) throw new Error(`Media exceeds the 32 MiB API limit: ${sourcePath}`);
    const mediaType = mediaTypeFor(sourcePath, bytes);
    const dimensions = imageDimensions(bytes, mediaType);
    const identity = migrationIdentity(sourcePath);
    const acceptance = identity.slot ? acceptanceContractForSlot(identity.slot) : null;
    const baseEntry = {
      sourcePath,
      ...identity,
      availabilityPolicy: identity.slot === null ? null : availabilityPolicyFor(identity.domain, identity.role),
      mediaType,
      byteLength: bytes.length,
      sha256: sha256(bytes),
      width: dimensions.width,
      height: dimensions.height,
      ...(acceptance ? { acceptance } : {}),
    };
    entries.push(baseEntry);
    const activationEntry = portraitCanonicalActivation(sourcePath, baseEntry);
    if (activationEntry) entries.push(activationEntry);
    processedSources += 1;
    if (processedSources >= limit) break;
  }
  const fullInventory = !prefixes.length && !startAfter && limit === Infinity;
  if (fullInventory) {
    const waterSideEntries = entries.filter((entry) => WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS.includes(entry.slot));
    const waterSideSlots = waterSideEntries.map((entry) => entry.slot).sort();
    if (JSON.stringify(waterSideSlots) !== JSON.stringify(WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS)
      || waterSideEntries.some((entry) => JSON.stringify(entry.acceptance) !== JSON.stringify(acceptanceContractForSlot(entry.slot)))) {
      throw new Error('Full cutover inventory must seed the exact eight-slot terrain/water/side-v1 acceptance group');
    }
  }
  const dispositionCounts = Object.fromEntries([...new Set(entries.map((entry) => entry.migrationDisposition))]
    .sort().map((value) => [value, entries.filter((entry) => entry.migrationDisposition === value).length]));
  const sources = new Map();
  const blobs = new Map();
  for (const entry of entries) {
    if (!sources.has(entry.sourcePath)) sources.set(entry.sourcePath, entry);
    if (!blobs.has(entry.sha256)) blobs.set(entry.sha256, entry);
  }
  const sourceEntries = [...sources.values()];
  const blobEntries = [...blobs.values()];
  const inventory = {
    schema: INVENTORY_SCHEMA,
    generatedAt: new Date().toISOString(),
    repositoryCommit: commit,
    sourceRoot: normalizeRepoPath(path.relative(repoRoot, repoRoot)) || '.',
    totals: {
      count: sourceEntries.length,
      bytes: sourceEntries.reduce((total, entry) => total + entry.byteLength, 0),
      versionCount: entries.length,
      transferBytes: entries.reduce((total, entry) => total + entry.byteLength, 0),
      activeCount: entries.filter((entry) => entry.migrationDisposition === 'legacy-bridge').length,
      archiveCount: entries.filter((entry) => entry.migrationDisposition === 'private-archive').length,
      canonicalActivationCount: entries.filter((entry) => entry.activationSourceSlot).length,
      uniqueBlobCount: blobEntries.length,
      uniqueBlobBytes: blobEntries.reduce((total, entry) => total + entry.byteLength, 0),
      byDisposition: dispositionCounts,
    },
    inventorySha256: inventorySha256(entries),
    entries,
  };
  if (fullInventory
    && (inventory.totals.count !== FROZEN_FULL_INVENTORY.count
      || inventory.totals.bytes !== FROZEN_FULL_INVENTORY.bytes
      || inventory.totals.versionCount !== FROZEN_FULL_INVENTORY.versionCount
      || inventory.totals.activeCount !== FROZEN_FULL_INVENTORY.activeCount
      || inventory.totals.archiveCount !== FROZEN_FULL_INVENTORY.archiveCount
      || inventory.totals.canonicalActivationCount !== FROZEN_FULL_INVENTORY.canonicalActivationCount
      || inventory.inventorySha256 !== FROZEN_FULL_INVENTORY.sha256)) {
    throw new Error(`Full cutover inventory no longer matches its frozen baseline: ${JSON.stringify({
      expected: FROZEN_FULL_INVENTORY,
      actual: {
        count: inventory.totals.count,
        bytes: inventory.totals.bytes,
        versionCount: inventory.totals.versionCount,
        activeCount: inventory.totals.activeCount,
        archiveCount: inventory.totals.archiveCount,
        canonicalActivationCount: inventory.totals.canonicalActivationCount,
        sha256: inventory.inventorySha256,
      },
    })}`);
  }
  return inventory;
}

function parseHeader(value) {
  const index = value.indexOf(':');
  if (index <= 0) throw new Error(`--header must be "Name: value", got: ${value}`);
  return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
}

export function parseArgs(argv) {
  const options = {
    command: 'inventory', repoRoot: defaultRepoRoot, prefixes: [], startAfter: '', limit: Infinity,
    json: false, execute: false, apiBase: '',
    headers: process.env.LIVE_MEDIA_COOKIE ? { Cookie: process.env.LIVE_MEDIA_COOKIE } : {},
    immutablePrefix: '/api/media', stablePrefix: '/assets', availabilityPolicy: '',
  };
  let index = 0;
  if (argv[0] && !argv[0].startsWith('-')) options.command = argv[index++];
  for (; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      const result = argv[++index];
      if (result === undefined) throw new Error(`${value} requires a value`);
      return result;
    };
    if (value === '--repo-root') options.repoRoot = path.resolve(next());
    else if (value === '--include') options.prefixes.push(normalizeRepoPath(next()).replace(/\/$/, ''));
    else if (value === '--start-after') options.startAfter = normalizeRepoPath(next());
    else if (value === '--limit') options.limit = Number.parseInt(next(), 10);
    else if (value === '--json') options.json = true;
    else if (value === '--execute') options.execute = true;
    else if (value === '--api-base') options.apiBase = next().replace(/\/$/, '');
    else if (value === '--cookie') options.headers.Cookie = next();
    else if (value === '--header') { const [name, headerValue] = parseHeader(next()); options.headers[name] = headerValue; }
    else if (value === '--immutable-prefix') options.immutablePrefix = next();
    else if (value === '--stable-prefix') options.stablePrefix = next();
    else if (value === '--availability-policy') options.availabilityPolicy = next();
    else throw new Error(`Unknown option: ${value}`);
  }
  if (!['inventory', 'upload'].includes(options.command)) throw new Error(`Unknown command: ${options.command}`);
  if (options.limit !== Infinity && (!Number.isSafeInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  if (options.availabilityPolicy && !['critical', 'decorative'].includes(options.availabilityPolicy)) {
    throw new Error('--availability-policy must be critical or decorative');
  }
  if (options.execute && options.command !== 'upload') throw new Error('--execute is valid only with upload');
  if (options.execute && !options.apiBase) throw new Error('--execute requires --api-base');
  return options;
}

function createPayload(entry, inventory, options) {
  const payload = {
    slot: entry.slot,
    domain: entry.domain,
    role: entry.role,
    label: `ADR-0085 Git cutover: ${entry.sourcePath}`,
    metadata: {
      migrationDisposition: entry.migrationDisposition,
      originalRepositoryPath: entry.sourcePath,
      mediaType: entry.mediaType,
      byteLength: entry.byteLength,
      width: entry.width,
      height: entry.height,
    },
    provenance: {
      migration: {
        kind: 'git-media-cutover',
        repositoryCommit: inventory.repositoryCommit,
        originalRepositoryPath: entry.sourcePath,
        sha256: entry.sha256,
        byteExact: true,
      },
    },
  };
  if (entry.activationSourceSlot) {
    payload.metadata.activationSourceSlot = entry.activationSourceSlot;
    payload.metadata.displacedSourcePath = entry.displacedSourcePath;
    payload.provenance.migration.activationSourceSlot = entry.activationSourceSlot;
    payload.provenance.migration.displacedSourcePath = entry.displacedSourcePath;
  }
  if (entry.acceptance) payload.slotMetadata = { acceptance: entry.acceptance };
  if (entry.slot) payload.provenance.migration.targetSlot = entry.slot;
  payload.sourcePath = entry.sourcePath;
  if (entry.slot !== null) payload.availabilityPolicy = options.availabilityPolicy || entry.availabilityPolicy;
  return payload;
}

function migrationKey(repositoryCommit, sourcePath, slot) {
  return `${repositoryCommit}\0${sourcePath}\0${slot ?? '<private>'}`;
}

export function existingMigrationIndex(catalog) {
  const result = new Map();
  for (const version of catalog.versions) {
    const migration = version?.provenance?.migration;
    if (migration?.kind !== 'git-media-cutover' || !migration.repositoryCommit || !migration.originalRepositoryPath) continue;
    const key = migrationKey(migration.repositoryCommit, migration.originalRepositoryPath, version.slot ?? null);
    if (result.has(key)) {
      throw new Error(`Duplicate Git cutover versions already exist for ${migration.originalRepositoryPath} -> ${version.slot ?? '<private>'} at ${migration.repositoryCommit}`);
    }
    result.set(key, version);
  }
  return result;
}

export function assertExistingMatches(entry, inventory, version, slotRecord = null) {
  const migration = version?.provenance?.migration;
  const expectedSourcePath = entry.sourcePath;
  const mismatches = [];
  if (migration?.kind !== 'git-media-cutover') mismatches.push('migration.kind');
  if (migration?.repositoryCommit !== inventory.repositoryCommit) mismatches.push('repositoryCommit');
  if (migration?.originalRepositoryPath !== entry.sourcePath) mismatches.push('originalRepositoryPath');
  if (migration?.sha256 !== entry.sha256) mismatches.push('sha256');
  if ((version.slot ?? null) !== entry.slot) mismatches.push('slot');
  if ((version.sourcePath ?? null) !== expectedSourcePath) mismatches.push('sourcePath');
  if (version.domain !== entry.domain) mismatches.push('domain');
  if (version.role !== entry.role) mismatches.push('role');
  if ((version.metadata?.activationSourceSlot ?? null) !== (entry.activationSourceSlot ?? null)) mismatches.push('metadata.activationSourceSlot');
  if ((version.metadata?.displacedSourcePath ?? null) !== (entry.displacedSourcePath ?? null)) mismatches.push('metadata.displacedSourcePath');
  if ((migration?.activationSourceSlot ?? null) !== (entry.activationSourceSlot ?? null)) mismatches.push('migration.activationSourceSlot');
  if ((migration?.displacedSourcePath ?? null) !== (entry.displacedSourcePath ?? null)) mismatches.push('migration.displacedSourcePath');
  if (JSON.stringify(slotRecord?.metadata?.acceptance ?? null) !== JSON.stringify(entry.acceptance ?? null)) {
    mismatches.push('slotMetadata.acceptance');
  }
  if (version.media) {
    if (version.media.sha256 !== entry.sha256) mismatches.push('media.sha256');
    if (Number(version.media.byteLength) !== entry.byteLength) mismatches.push('media.byteLength');
    if (version.media.mediaType !== entry.mediaType) mismatches.push('media.mediaType');
    if ((version.media.width ?? null) !== entry.width) mismatches.push('media.width');
    if ((version.media.height ?? null) !== entry.height) mismatches.push('media.height');
  }
  if (mismatches.length) throw new Error(`Existing migration version mismatches ${entry.sourcePath}: ${mismatches.join(', ')}`);
}

function activeSlotConflict(entry, catalog, existing) {
  if (entry.slot === null) return null;
  const slot = catalog.slots.find((candidate) => candidate.slot === entry.slot);
  if (!slot?.activeVersionId) return null;
  if (existing && String(slot.activeVersionId) === String(existing.id)) return null;
  return slot;
}

async function verifyEntryUrl(client, url, entry) {
  return client.verifyMedia({ url, sha256: entry.sha256, byteLength: entry.byteLength, mediaType: entry.mediaType });
}

async function postMigrationAction(client, routeTemplate, id, body, operation) {
  const route = routeTemplate.replaceAll('{id}', encodeURIComponent(id));
  const result = await client.request(route, {
    method: 'POST',
    headers: { ...client.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
  }, operation);
  const row = mediaVersionFrom(result.body);
  const revision = Number(row?.rowRevision);
  if (!row?.id || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error(`${operation} did not return a media version revision`);
  }
  return { ...result, row, revision };
}

async function verifyFinalEntry(client, entry, version, options, reused, uploadedVerification = null) {
  const expectedStatus = entry.migrationDisposition === 'legacy-bridge' ? 'legacy-bridge' : 'archived';
  if (version.status !== expectedStatus) {
    throw new Error(`Migration may only finish as ${expectedStatus}, got ${version.status}: ${entry.sourcePath}`);
  }
  if (!version.media?.url) throw new Error(`Final media URL is missing for ${entry.sourcePath}`);
  if (version.status === 'legacy-bridge' && version.media.url !== `${options.immutablePrefix}/${entry.sha256}`) {
    throw new Error(`Active version did not resolve to its immutable content route: ${entry.sourcePath}`);
  }
  const finalMediaVerification = await verifyEntryUrl(client, version.media.url, entry);
  return {
    sourcePath: entry.sourcePath,
    slot: entry.slot,
    id: String(version.id),
    action: version.status === 'archived' ? 'private-archive' : version.status,
    revision: Number(version.rowRevision),
    reused,
    uploadedVerification: uploadedVerification || finalMediaVerification,
    immutable: finalMediaVerification,
    // Stable routes are deliberately verified only after the entire inventory
    // has converged. Checking one here would make the first member of a required
    // group render the public catalog intentionally incomplete, and remapped
    // slots cannot be proven against the packaged pre-cutover namespace.
    stable: null,
  };
}

export async function verifyStableMigrationResults(entries, results, options, client) {
  if (!Array.isArray(entries) || !Array.isArray(results) || entries.length !== results.length) {
    throw new Error('Stable migration verification requires one result for every inventory entry');
  }
  const completed = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const result = results[index];
    if (result.sourcePath !== entry.sourcePath || (result.slot ?? null) !== (entry.slot ?? null)) {
      throw new Error(`Migration result order differs from inventory at index ${index}`);
    }
    if (entry.migrationDisposition !== 'legacy-bridge') {
      completed.push(result);
      continue;
    }
    const encodedSlot = entry.slot.split('/').map(encodeURIComponent).join('/');
    const stable = await verifyEntryUrl(client, `${options.stablePrefix}/${encodedSlot}`, entry);
    completed.push({ ...result, stable });
  }
  return completed;
}

export async function migrateEntry(entry, inventory, options, client, catalog, existing) {
  if (!['legacy-bridge', 'private-archive'].includes(entry.migrationDisposition)) {
    throw new Error(`Unsupported migration disposition ${entry.migrationDisposition}: ${entry.sourcePath}`);
  }
  const absolutePath = path.join(options.repoRoot, entry.sourcePath);
  const bytes = fs.readFileSync(absolutePath);
  if (bytes.length !== entry.byteLength || sha256(bytes) !== entry.sha256) {
    throw new Error(`Local bytes changed after inventory: ${entry.sourcePath}`);
  }
  if (existing) {
    const slotRecord = entry.slot === null ? null : catalog.slots.find((candidate) => candidate.slot === entry.slot) ?? null;
    assertExistingMatches(entry, inventory, existing, slotRecord);
  }
  const conflict = activeSlotConflict(entry, catalog, existing);
  if (conflict) {
    throw new Error(`Stable slot ${entry.slot} is already active at version ${conflict.activeVersionId}; refusing to overwrite it`);
  }

  const finalStatus = entry.migrationDisposition === 'legacy-bridge' ? 'legacy-bridge' : 'archived';
  if (existing && existing.status === finalStatus) {
    return verifyFinalEntry(client, entry, existing, options, true);
  }
  if (existing && existing.status !== 'candidate') {
    throw new Error(`Existing migration version ${existing.id} has non-resumable status ${existing.status} for ${entry.sourcePath}`);
  }

  let id;
  let revision;
  let current = existing;
  if (existing) {
    id = String(existing.id);
    revision = Number(existing.rowRevision);
  } else {
    const created = await client.createVersion(createPayload(entry, inventory, options), {
      idempotencyKey: `adr0085-${sha256Text(`${inventory.repositoryCommit}\0${entry.sourcePath}\0${entry.slot ?? '<private>'}`).slice(0, 48)}`,
    });
    id = created.id;
    revision = created.revision;
    current = created.row;
  }

  if (current.status !== 'candidate') {
    throw new Error(`Importer may only mutate a candidate, got ${current.status}: ${entry.sourcePath}`);
  }
  if (!current.media) {
    const uploaded = await client.uploadContent({ id, revision, bytes, mediaType: entry.mediaType });
    revision = uploaded.revision;
    current = uploaded.row;
  }
  if (current.status !== 'candidate') {
    throw new Error(`Upload changed migration version to forbidden status ${current.status}: ${entry.sourcePath}`);
  }
  const currentMedia = current.media ?? mediaRecordFrom(current);
  if (!currentMedia?.url || currentMedia.sha256 !== entry.sha256) {
    throw new Error(`Uploaded media response is incomplete or hash-mismatched for ${entry.sourcePath}`);
  }
  const uploadedVerification = await verifyEntryUrl(client, currentMedia.url, entry);
  let actionResult;
  if (entry.migrationDisposition === 'legacy-bridge') {
    actionResult = await postMigrationAction(
      client,
      BRIDGE_PATH, id, { expectedRevision: revision }, `bridge ${entry.sourcePath}`,
    );
  } else {
    actionResult = await postMigrationAction(
      client,
      ARCHIVE_PATH, id, {
        expectedRevision: revision,
        reason: 'ADR-0085 private source/review archive; not a runtime semantic slot',
        evidence: {
          schema: 'adr-0085-private-archive-v1',
          repositoryCommit: inventory.repositoryCommit,
          sourcePath: entry.sourcePath,
          sha256: entry.sha256,
        },
      }, `archive ${entry.sourcePath}`,
    );
  }
  return verifyFinalEntry(client, entry, actionResult.row, options, false, uploadedVerification);
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const inventory = buildMigrationInventory(options);
  if (options.command === 'inventory') {
    if (options.json) console.log(JSON.stringify(inventory, null, 2));
    else console.log(JSON.stringify({ schema: inventory.schema, repositoryCommit: inventory.repositoryCommit, totals: inventory.totals }, null, 2));
    return;
  }

  const plan = inventory.entries.map((entry) => ({
    sourcePath: entry.sourcePath,
    slot: entry.slot,
    sha256: entry.sha256,
    action: entry.migrationDisposition,
  }));
  if (!options.execute) {
    const output = { dryRun: true, schema: inventory.schema, repositoryCommit: inventory.repositoryCommit, totals: inventory.totals, plan };
    console.log(JSON.stringify(options.json ? output : { ...output, plan: plan.slice(0, 25), omittedPlanEntries: Math.max(0, plan.length - 25) }, null, 2));
    return;
  }

  const client = new LiveMediaAdminClient({
    apiBase: options.apiBase,
    headers: options.headers,
    paths: {
      adminCatalog: ADMIN_CATALOG_PATH,
      create: CREATE_PATH,
      content: CONTENT_PATH,
    },
  });
  const catalog = await client.adminCatalog();
  const existingByMigration = existingMigrationIndex(catalog);
  let results = [];
  for (let index = 0; index < inventory.entries.length; index += 1) {
    const entry = inventory.entries[index];
    console.error(`[${index + 1}/${inventory.entries.length}] ${entry.sourcePath}`);
    const existing = existingByMigration.get(migrationKey(inventory.repositoryCommit, entry.sourcePath, entry.slot)) ?? null;
    const result = await migrateEntry(entry, inventory, options, client, catalog, existing);
    results.push(result);
    console.error(JSON.stringify({ migrationProgress: index + 1, total: inventory.entries.length, result }));
  }
  // Required groups and canonical remaps are now complete, so the public
  // catalog can resolve every semantic route without a partial-state failure.
  results = await verifyStableMigrationResults(inventory.entries, results, options, client);
  console.log(JSON.stringify({
    schema: 'adr-0085-media-migration-result-v1',
    repositoryCommit: inventory.repositoryCommit,
    migratedAt: new Date().toISOString(),
    totals: inventory.totals,
    results,
  }, null, 2));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
