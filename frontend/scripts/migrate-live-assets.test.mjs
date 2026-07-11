// TEMPORARY: delete with migrate-live-assets.mjs after the one-time cutover.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Bytes } from './live-media-admin-client.mjs';
import {
  WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS,
  acceptanceContractForSlot,
  existingMigrationIndex,
  mediaTypeFor,
  migrationIdentity,
  migrateEntry,
  parseArgs,
  portraitCanonicalActivation,
  verifyStableMigrationResults,
} from './migrate-live-assets.mjs';

const temporaryRoots = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(disposition = 'private-archive') {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'live-media-importer-test-'));
  temporaryRoots.push(repoRoot);
  const sourcePath = 'source.png';
  const bytes = Buffer.from('synthetic migration bytes');
  fs.writeFileSync(path.join(repoRoot, sourcePath), bytes);
  const slot = disposition === 'legacy-bridge' ? 'terrain/source.png' : null;
  const entry = {
    sourcePath,
    namespace: slot ? 'runtime' : 'migration/git-media-cutover',
    slot,
    migrationDisposition: disposition,
    domain: 'terrain',
    role: slot ? 'top' : 'source',
    availabilityPolicy: slot ? 'critical' : null,
    mediaType: 'image/png',
    byteLength: bytes.length,
    sha256: sha256Bytes(bytes),
    width: null,
    height: null,
  };
  const inventory = { repositoryCommit: 'commit-1' };
  const options = {
    repoRoot, availabilityPolicy: '', immutablePrefix: '/api/media', stablePrefix: '/assets',
  };
  return { bytes, entry, inventory, options };
}

function migrationVersion(entry, inventory, overrides = {}) {
  return {
    id: 'version-1',
    slot: entry.slot,
    sourcePath: entry.sourcePath,
    domain: entry.domain,
    role: entry.role,
    status: 'candidate',
    rowRevision: 1,
    provenance: { migration: {
      kind: 'git-media-cutover', repositoryCommit: inventory.repositoryCommit,
      originalRepositoryPath: entry.sourcePath, sha256: entry.sha256, byteExact: true,
    } },
    media: { url: '/api/admin/media/hash', sha256: entry.sha256, byteLength: entry.byteLength,
      mediaType: entry.mediaType, width: entry.width, height: entry.height },
    ...overrides,
  };
}

function fakeClient() {
  return {
    verifyMedia: vi.fn(async ({ url, sha256, byteLength, mediaType }) => ({ url, sha256, byteLength, mediaType })),
    createVersion: vi.fn(),
    uploadContent: vi.fn(),
    request: vi.fn(),
  };
}

describe('one-time live-media importer resume behavior', () => {
  it('activates canonical portrait slots from codex-stone bytes and archives displaced originals', () => {
    const sourcePath = 'frontend/public/assets/portrait-candidates/codex-stone/pawn/navy-blue.png';
    const base = {
      sourcePath,
      slot: 'portrait-candidates/codex-stone/pawn/navy-blue.png',
      sha256: 'a'.repeat(64),
      byteLength: 123,
      migrationDisposition: 'legacy-bridge',
      domain: 'portrait',
      role: 'review',
      availabilityPolicy: 'decorative',
    };
    expect(portraitCanonicalActivation(sourcePath, base)).toEqual(expect.objectContaining({
      sourcePath,
      slot: 'units/pawn/portrait/navy-blue.png',
      sha256: base.sha256,
      byteLength: base.byteLength,
      activationSourceSlot: base.slot,
      displacedSourcePath: 'frontend/public/assets/units/pawn/portrait/navy-blue.png',
      domain: 'portrait',
      role: 'portrait',
      availabilityPolicy: 'critical',
    }));
    expect(portraitCanonicalActivation('frontend/public/assets/portrait-candidates/filter2/pawn/navy-blue.png', base)).toBeNull();
    expect(migrationIdentity('frontend/public/assets/units/pawn/portrait/navy-blue.png')).toEqual({
      namespace: 'migration/git-media-cutover',
      slot: null,
      migrationDisposition: 'private-archive',
      domain: 'portrait',
      role: 'source',
    });
  });

  it('seeds one atomic acceptance contract on all eight canonical water side slots', () => {
    const expected = Array.from({ length: 8 }, (_, index) => `tiles/surface/water-${index}-side.png`);
    expect(WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS).toEqual(expected);
    for (const slot of expected) {
      expect(acceptanceContractForSlot(slot)).toEqual({
        mode: 'group',
        groupId: 'terrain/water/side-v1',
        requiredSlots: expected,
      });
    }
    expect(acceptanceContractForSlot('tiles/surface/water-0-top.png')).toBeNull();
  });

  it('has no CLI route for review, acceptance, or mutation-endpoint overrides', () => {
    for (const option of [
      '--review-manifest', '--review-path', '--accept-path',
      '--admin-catalog-path', '--create-path', '--content-path', '--bridge-path', '--archive-path',
    ]) {
      expect(() => parseArgs(['upload', option, 'anything'])).toThrow(new RegExp(`Unknown option: ${option}`));
    }
  });

  it('uses content magic instead of misleading legacy filename extensions', () => {
    expect(mediaTypeFor('proof.png', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(mediaTypeFor('tile.jpg', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png');
  });

  it('reuses an exact completed private archive without another mutation', async () => {
    const { entry, inventory, options } = fixture();
    const existing = migrationVersion(entry, inventory, { status: 'archived' });
    const client = fakeClient();

    const result = await migrateEntry(entry, inventory, options, client, { slots: [] }, existing);

    expect(result).toMatchObject({ id: existing.id, action: 'private-archive', reused: true });
    expect(client.createVersion).not.toHaveBeenCalled();
    expect(client.uploadContent).not.toHaveBeenCalled();
    expect(client.request).not.toHaveBeenCalled();
  });

  it('resumes an exact uploaded candidate at the final action', async () => {
    const { entry, inventory, options } = fixture();
    const existing = migrationVersion(entry, inventory);
    const client = fakeClient();
    client.request.mockResolvedValueOnce({
      body: { version: { ...existing, status: 'archived', rowRevision: existing.rowRevision + 1 } },
    });

    const result = await migrateEntry(entry, inventory, options, client, { slots: [] }, existing);

    expect(result).toMatchObject({ action: 'private-archive', reused: false });
    expect(client.uploadContent).not.toHaveBeenCalled();
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it('creates a fresh bridge with exact source-path evidence and defers its stable boundary', async () => {
    const { entry, inventory, options } = fixture('legacy-bridge');
    const candidate = migrationVersion(entry, inventory, { media: null, rowRevision: 0 });
    const uploaded = migrationVersion(entry, inventory, { rowRevision: 1 });
    const bridged = migrationVersion(entry, inventory, { status: 'legacy-bridge', rowRevision: 2,
      media: { ...uploaded.media, url: `/api/media/${entry.sha256}` } });
    const client = fakeClient();
    client.createVersion.mockResolvedValue({ id: candidate.id, revision: 0, row: candidate });
    client.uploadContent.mockResolvedValue({ revision: 1, row: uploaded });
    client.request.mockResolvedValue({ body: { version: bridged } });

    const result = await migrateEntry(entry, inventory, options, client, { slots: [] }, null);

    expect(result).toMatchObject({ action: 'legacy-bridge', reused: false });
    expect(client.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      slot: entry.slot,
      sourcePath: entry.sourcePath,
      availabilityPolicy: 'critical',
      provenance: { migration: expect.objectContaining({
        kind: 'git-media-cutover', byteExact: true, sha256: entry.sha256,
        repositoryCommit: inventory.repositoryCommit, originalRepositoryPath: entry.sourcePath,
      }) },
    }), expect.objectContaining({ idempotencyKey: expect.stringMatching(/^adr0081-/) }));
    expect(client.createVersion.mock.calls[0][0]).not.toHaveProperty('nativeEvidence');
    expect(client.uploadContent).toHaveBeenCalledTimes(1);
    expect(client.verifyMedia).toHaveBeenCalledTimes(2);
    expect(client.verifyMedia.mock.calls.some(([request]) => request.url.startsWith('/assets/'))).toBe(false);
    expect(result.stable).toBeNull();
    expect(client.request.mock.calls.every(([route]) => !/\/(?:review|accept)(?:\/|$)/.test(route))).toBe(true);
  });

  it('does not let a partial Water group block resume and verifies all stable sides after completion', async () => {
    const { bytes, inventory, options, entry: fixtureEntry } = fixture('legacy-bridge');
    const entries = WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS.map((slot, index) => {
      const sourcePath = `water-${index}-side.png`;
      fs.writeFileSync(path.join(options.repoRoot, sourcePath), bytes);
      return {
        ...fixtureEntry,
        sourcePath,
        slot,
        acceptance: acceptanceContractForSlot(slot),
      };
    });
    let groupComplete = false;
    const client = fakeClient();
    client.verifyMedia.mockImplementation(async (request) => {
      if (request.url.startsWith('/assets/') && !groupComplete) throw new Error('media_catalog_incomplete');
      return request;
    });
    const results = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const existing = migrationVersion(entry, inventory, {
        id: `version-${index}`,
        status: 'legacy-bridge',
        media: {
          url: `/api/media/${entry.sha256}`,
          sha256: entry.sha256,
          byteLength: entry.byteLength,
          mediaType: entry.mediaType,
          width: entry.width,
          height: entry.height,
        },
      });
      const catalog = { slots: [{
        slot: entry.slot,
        activeVersionId: existing.id,
        metadata: { acceptance: entry.acceptance },
      }] };
      results.push(await migrateEntry(entry, inventory, options, client, catalog, existing));
    }

    expect(client.verifyMedia).toHaveBeenCalledTimes(8);
    expect(client.verifyMedia.mock.calls.some(([request]) => request.url.startsWith('/assets/'))).toBe(false);

    groupComplete = true;
    const completed = await verifyStableMigrationResults(entries, results, options, client);
    expect(completed.every((result) => result.stable?.url.startsWith('/assets/tiles/surface/water-'))).toBe(true);
    expect(client.verifyMedia).toHaveBeenCalledTimes(16);
  });

  it('checks canonical remap stable routes only in the completed-inventory pass', async () => {
    const { entry, inventory, options } = fixture('legacy-bridge');
    const activation = {
      ...entry,
      slot: 'units/pawn/portrait/navy-blue.png',
      activationSourceSlot: entry.slot,
      displacedSourcePath: 'frontend/public/assets/units/pawn/portrait/navy-blue.png',
    };
    const existing = migrationVersion(activation, inventory, {
      status: 'legacy-bridge',
      media: {
        url: `/api/media/${activation.sha256}`,
        sha256: activation.sha256,
        byteLength: activation.byteLength,
        mediaType: activation.mediaType,
        width: activation.width,
        height: activation.height,
      },
      metadata: {
        activationSourceSlot: activation.activationSourceSlot,
        displacedSourcePath: activation.displacedSourcePath,
      },
      provenance: { migration: {
        kind: 'git-media-cutover',
        repositoryCommit: inventory.repositoryCommit,
        originalRepositoryPath: activation.sourcePath,
        sha256: activation.sha256,
        byteExact: true,
        activationSourceSlot: activation.activationSourceSlot,
        displacedSourcePath: activation.displacedSourcePath,
      } },
    });
    const client = fakeClient();
    const result = await migrateEntry(activation, inventory, options, client, {
      slots: [{ slot: activation.slot, activeVersionId: existing.id, metadata: {} }],
    }, existing);

    expect(client.verifyMedia).toHaveBeenCalledTimes(1);
    expect(client.verifyMedia).toHaveBeenLastCalledWith(expect.objectContaining({
      url: `/api/media/${activation.sha256}`,
    }));

    const [completed] = await verifyStableMigrationResults([activation], [result], options, client);
    expect(completed.stable).toMatchObject({ url: '/assets/units/pawn/portrait/navy-blue.png' });
    expect(client.verifyMedia).toHaveBeenCalledTimes(2);
  });

  it('refuses an accepted migration version instead of treating it as a completed import', async () => {
    const { entry, inventory, options } = fixture('legacy-bridge');
    const existing = migrationVersion(entry, inventory, { status: 'accepted' });
    const client = fakeClient();

    await expect(migrateEntry(entry, inventory, options, client, { slots: [] }, existing))
      .rejects.toThrow(/non-resumable status accepted/);
    expect(client.request).not.toHaveBeenCalled();
  });

  it('fails closed if candidate creation unexpectedly returns an accepted version', async () => {
    const { entry, inventory, options } = fixture('legacy-bridge');
    const accepted = migrationVersion(entry, inventory, { status: 'accepted', rowRevision: 0 });
    const client = fakeClient();
    client.createVersion.mockResolvedValue({ id: accepted.id, revision: 0, row: accepted });

    await expect(migrateEntry(entry, inventory, options, client, { slots: [] }, null))
      .rejects.toThrow(/only mutate a candidate, got accepted/);
    expect(client.uploadContent).not.toHaveBeenCalled();
    expect(client.request).not.toHaveBeenCalled();
  });

  it('fails closed on changed migration provenance or a different active slot', async () => {
    const { entry, inventory, options } = fixture('legacy-bridge');
    const mismatch = migrationVersion(entry, inventory, {
      provenance: { migration: { kind: 'git-media-cutover', repositoryCommit: 'commit-1',
        originalRepositoryPath: entry.sourcePath, sha256: '0'.repeat(64) } },
    });
    const client = fakeClient();
    await expect(migrateEntry(entry, inventory, options, client, { slots: [] }, mismatch))
      .rejects.toThrow(/sha256/);

    const existing = migrationVersion(entry, inventory);
    await expect(migrateEntry(entry, inventory, options, client, {
      slots: [{ slot: entry.slot, activeVersionId: 'different-version' }],
    }, existing)).rejects.toThrow(/already active/);
  });

  it('rejects duplicate preflight records for the same commit and source path', () => {
    const { entry, inventory } = fixture();
    const first = migrationVersion(entry, inventory);
    expect(() => existingMigrationIndex({ versions: [first, { ...first, id: 'version-2' }] })).toThrow(/Duplicate/);
  });

  it('allows one source hash to back distinct DB-owned semantic slots', () => {
    const { entry, inventory } = fixture('legacy-bridge');
    const first = migrationVersion(entry, inventory);
    const activation = { ...first, id: 'version-activation', slot: 'units/pawn/portrait/navy-blue.png' };
    expect(existingMigrationIndex({ versions: [first, activation] }).size).toBe(2);
  });
});
