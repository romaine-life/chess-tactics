import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertCatalog,
  compareAdminCatalogToInventory,
  compareCatalogToInventory,
  parseArgs,
  readExpectedInventory,
  stableSlotUrl,
  verifyMediaUrl,
  verifySlot,
} from './verify-live-media-cutover.mjs';

const bytes = Buffer.from('synthetic live-media proof');
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const slot = {
  slot: 'ui/synthetic-proof.bin',
  domain: 'ui',
  role: 'synthetic-proof',
  availabilityPolicy: 'critical',
  activeVersionId: '00000000-0000-4000-8000-000000000001',
  rowRevision: 1,
  metadata: {},
  versionStatus: 'legacy-bridge',
  productionEligible: false,
  versionMetadata: {},
  provenance: {},
  nativeEvidence: {},
  media: {
    url: '/assets/ui/synthetic-proof.bin',
    immutableUrl: `/api/media/${sha256}`,
    sha256,
    mediaType: 'application/octet-stream',
    width: null,
    height: null,
    byteLength: bytes.length,
  },
};

function catalog(overrides = {}) {
  return {
    schemaVersion: 1,
    revision: 7,
    updatedAt: '2026-07-11T00:00:00.000Z',
    slots: [slot],
    ...overrides,
  };
}

test('catalog validation enforces canonical semantic routes and legacy status', () => {
  assert.equal(stableSlotUrl('terrain/water/top.png'), '/assets/terrain/water/top.png');
  assert.equal(assertCatalog(catalog()).slots[0].slot, slot.slot);
  assert.throws(() => assertCatalog(catalog({ slots: [{ ...slot, productionEligible: true }] })), /production eligibility/);
  assert.throws(() => assertCatalog(catalog({ slots: [{ ...slot, media: { ...slot.media, url: '/wrong' } }] })), /stable URL/);
});

test('migration inventory comparison is exact for public legacy bridges', () => {
  const expected = new Map([[slot.slot, {
    slot: slot.slot,
    migrationDisposition: 'legacy-bridge',
    sha256,
    byteLength: bytes.length,
    mediaType: 'application/octet-stream',
    width: null,
    height: null,
    expectedStatus: 'legacy-bridge',
  }]]);
  assert.deepEqual(compareCatalogToInventory(catalog(), { expected }), []);
  const acceptedSlot = { ...slot, versionStatus: 'accepted', productionEligible: true };
  assert.match(compareCatalogToInventory(catalog({ slots: [acceptedSlot] }), { expected }).join('\n'), /expected legacy-bridge, got accepted/);
  const extra = { ...acceptedSlot, slot: 'ui/uninventoried.bin', activeVersionId: '00000000-0000-4000-8000-000000000002',
    media: { ...acceptedSlot.media, url: '/assets/ui/uninventoried.bin' } };
  assert.match(compareCatalogToInventory(catalog({ slots: [slot, extra] }), { expected }).join('\n'),
    /ui\/uninventoried\.bin: live public slot is absent from the migration inventory/);
  expected.get(slot.slot).sha256 = 'f'.repeat(64);
  assert.match(compareCatalogToInventory(catalog(), { expected }).join('\n'), /sha256 expected/);
});

test('admin inventory comparison covers bridges, candidates, and private archives', () => {
  const commit = 'a'.repeat(40);
  const entries = [
    { sourcePath: 'frontend/public/assets/ui/runtime.bin', namespace: 'runtime', slot: 'ui/runtime.bin',
      migrationDisposition: 'legacy-bridge', domain: 'ui-kit', role: 'media', availabilityPolicy: 'critical', sha256,
      byteLength: bytes.length, mediaType: 'application/octet-stream', width: null, height: null,
      acceptance: { mode: 'single' } },
    { sourcePath: 'frontend/public/assets/ui/chrome-candidates/candidate.png', slot: 'ui/chrome-candidates/candidate.png',
      namespace: 'runtime-candidate', migrationDisposition: 'candidate', domain: 'ui-kit', role: 'candidate',
      availabilityPolicy: 'decorative', sha256, byteLength: bytes.length, mediaType: 'image/png', width: 1, height: 1,
      candidateMetadata: { chromeCandidate: { id: 'candidate-1', role: 'outer', kind: 'atom' } },
      nativeEvidence: { native1x: true, sourceSha256: sha256 } },
    { sourcePath: 'docs/art/source.png', namespace: 'migration/git-media-cutover', slot: null,
      migrationDisposition: 'private-archive', domain: 'source-media', role: 'source', availabilityPolicy: null, sha256,
      byteLength: bytes.length, mediaType: 'image/png', width: 1, height: 1 },
  ];
  const versions = entries.map((entry, index) => ({
    id: `version-${index}`,
    slot: entry.slot,
    sourcePath: entry.sourcePath,
    domain: entry.domain,
    role: entry.role,
    status: entry.migrationDisposition === 'private-archive' ? 'archived' : entry.migrationDisposition,
    metadata: {
      ...(entry.candidateMetadata ?? {}),
      migrationDisposition: entry.migrationDisposition,
      originalRepositoryPath: entry.sourcePath,
      mediaType: entry.mediaType,
      byteLength: entry.byteLength,
      width: entry.width,
      height: entry.height,
    },
    provenance: { migration: { kind: 'git-media-cutover', repositoryCommit: commit,
      namespace: entry.namespace, originalRepositoryPath: entry.sourcePath, sha256: entry.sha256,
      byteExact: true, ...(entry.slot ? { targetSlot: entry.slot } : {}) } },
    nativeEvidence: entry.nativeEvidence ?? {},
    media: { sha256: entry.sha256, byteLength: entry.byteLength, mediaType: entry.mediaType,
      width: entry.width, height: entry.height },
  }));
  const slots = entries.filter((entry) => entry.slot).map((entry) => ({
    slot: entry.slot,
    domain: entry.domain,
    role: entry.role,
    availabilityPolicy: entry.availabilityPolicy,
    metadata: entry.acceptance ? { acceptance: entry.acceptance } : {},
  }));
  assert.deepEqual(compareAdminCatalogToInventory({ slots, versions }, { repositoryCommit: commit, entries }), []);
  versions[1].status = 'archived';
  assert.match(compareAdminCatalogToInventory({ slots, versions }, { repositoryCommit: commit, entries }).join('\n'),
    /expected candidate, got archived/);
  versions[1].status = 'candidate';
  slots[0].availabilityPolicy = 'decorative';
  delete versions[1].metadata.chromeCandidate;
  const semanticFailures = compareAdminCatalogToInventory({ slots, versions }, { repositoryCommit: commit, entries }).join('\n');
  assert.match(semanticFailures, /availabilityPolicy expected critical, got decorative/);
  assert.match(semanticFailures, /metadata\.chromeCandidate differs/);
});

test('reads the ADR-0085 importer inventory schema end to end', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'live-media-inventory-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'inventory.json');
  const inventory = {
    schema: 'adr-0085-media-migration-inventory-v1',
    repositoryCommit: 'a'.repeat(40),
    totals: { files: 2, versions: 2, bytes: bytes.length * 2 },
    entries: [
      {
        sourcePath: 'frontend/public/assets/ui/synthetic-proof.bin',
        slot: slot.slot,
        migrationDisposition: 'legacy-bridge',
        sha256,
        byteLength: bytes.length,
        mediaType: slot.media.mediaType,
        width: null,
        height: null,
      },
      {
        sourcePath: 'docs/art/source/private-proof.bin',
        slot: null,
        migrationDisposition: 'private-archive',
        sha256: 'f'.repeat(64),
        byteLength: bytes.length,
        mediaType: 'application/octet-stream',
        width: null,
        height: null,
      },
    ],
  };
  fs.writeFileSync(filename, `${JSON.stringify(inventory)}\n`, 'utf8');

  const parsed = readExpectedInventory(filename);
  assert.equal(parsed.raw.schema, inventory.schema);
  assert.deepEqual([...parsed.expected.keys()], [slot.slot]);
  assert.equal(parsed.expected.get(slot.slot).expectedStatus, 'legacy-bridge');
});

test('cutover verifier has no review-manifest promotion input', () => {
  assert.throws(() => parseArgs(['--origin', 'http://127.0.0.1:3000', '--review-manifest', 'review.json']),
    /unknown option: --review-manifest/);
});

test('inventory verification requires an authenticated admin catalog', () => {
  assert.throws(() => parseArgs([
    '--origin', 'http://127.0.0.1:3000', '--inventory', 'inventory.json',
  ]), /inventory requires admin authentication/);
});

test('public verification follows the stable pointer and hashes immutable bytes', async (t) => {
  const server = http.createServer((request, response) => {
    if (request.url === slot.media.url) {
      response.statusCode = 307;
      response.setHeader('Location', slot.media.immutableUrl);
      response.setHeader('Cache-Control', 'no-cache');
      response.end();
      return;
    }
    if (request.url === slot.media.immutableUrl) {
      response.statusCode = 200;
      response.setHeader('Content-Type', slot.media.mediaType);
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      response.end(bytes);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const result = await verifySlot(`http://127.0.0.1:${address.port}/`, slot, 5_000);
  assert.deepEqual(result, { slot: slot.slot, bytes: bytes.length, sha256 });
});

test('authenticated private verification streams and hashes same-origin bytes', async (t) => {
  const expectedCookie = 'better-auth.session=mock-dev-session';
  const server = http.createServer((request, response) => {
    if (request.url === `/api/admin/media/${sha256}` && request.headers.cookie === expectedCookie) {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Cache-Control', 'private, no-store');
      response.end(bytes);
      return;
    }
    response.statusCode = 401;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}/`;
  const result = await verifyMediaUrl(origin, `/api/admin/media/${sha256}`, {
    sha256, byteLength: bytes.length, mediaType: 'application/octet-stream',
  }, 5_000, { headers: { Cookie: expectedCookie }, label: 'private proof' });
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.sha256, sha256);
  await assert.rejects(() => verifyMediaUrl(origin, 'http://example.com/private', {
    sha256, byteLength: bytes.length, mediaType: 'application/octet-stream',
  }, 5_000, { headers: { Cookie: expectedCookie } }), /cross-origin/);
});
