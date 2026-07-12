// TEMPORARY: delete with migrate-live-assets.mjs after the one-time cutover.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Bytes } from './live-media-admin-client.mjs';
import {
  WATER_SIDE_ACCEPTANCE_REQUIRED_SLOTS,
  acceptanceContractForSlot,
  buildMigrationInventory,
  createChromeCutoverContext,
  existingMigrationIndex,
  isCutoverSourcePath,
  mediaTypeFor,
  migrationIdempotencyKey,
  migrationIdentity,
  migrateEntry,
  parseArgs,
  portraitCanonicalActivation,
  verifyStableMigrationResults,
} from './migrate-live-assets.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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
  const slot = disposition === 'private-archive'
    ? null
    : disposition === 'candidate' ? 'ui/chrome-candidates/source.png' : 'terrain/source.png';
  const entry = {
    sourcePath,
    namespace: disposition === 'candidate'
      ? 'runtime-candidate'
      : slot ? 'runtime' : 'migration/git-media-cutover',
    slot,
    migrationDisposition: disposition,
    domain: disposition === 'candidate' ? 'ui-kit' : 'terrain',
    role: disposition === 'candidate' ? 'candidate' : slot ? 'top' : 'source',
    availabilityPolicy: slot ? (disposition === 'candidate' ? 'decorative' : 'critical') : null,
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
  const migration = {
    kind: 'git-media-cutover', namespace: entry.namespace, repositoryCommit: inventory.repositoryCommit,
    originalRepositoryPath: entry.sourcePath, sha256: entry.sha256, byteExact: true,
    ...(entry.activationSourceSlot ? { activationSourceSlot: entry.activationSourceSlot } : {}),
    ...(entry.displacedSourcePath ? { displacedSourcePath: entry.displacedSourcePath } : {}),
    ...(entry.chromeDefaultActivation ? { chromeDefaultActivation: entry.chromeDefaultActivation } : {}),
  };
  return {
    id: 'version-1',
    slot: entry.slot,
    sourcePath: entry.sourcePath,
    domain: entry.domain,
    role: entry.role,
    status: 'candidate',
    rowRevision: 1,
    metadata: {
      ...(entry.candidateMetadata ?? {}),
      ...(entry.activationSourceSlot ? { activationSourceSlot: entry.activationSourceSlot } : {}),
      ...(entry.displacedSourcePath ? { displacedSourcePath: entry.displacedSourcePath } : {}),
      ...(entry.chromeDefaultActivation ? { chromeDefaultActivation: entry.chromeDefaultActivation } : {}),
    },
    provenance: { ...(entry.candidateProvenance ?? {}), migration },
    nativeEvidence: entry.nativeEvidence ?? {},
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

function crlfGitFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'live-media-importer-crlf-'));
  temporaryRoots.push(fixtureRoot);
  const reportPath = 'frontend/public/assets/ui/chrome-candidates/native-rails-v1/attempt/report.json';
  const canonicalBytes = Buffer.from('{\n  "row": 1\n}\n', 'utf8');
  const checkoutBytes = Buffer.from('{\r\n  "row": 1\r\n}\r\n', 'utf8');
  const write = (relativePath, value) => {
    const absolutePath = path.join(fixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, value);
  };
  const chromeSources = [
    ['outer-atoms-img2img-32-v1-08', '/assets/ui/chrome-candidates/exploded/outer-atoms-img2img-32-v1/candidate-08.png', 'outer', 'atom'],
    ['outer-rails-v3-01', '/assets/ui/chrome-candidates/exploded/outer-rails-v3/candidate-01.png', 'outer', 'rail-sheet'],
    ['inner-atoms-img2img-micro-v2-10', '/assets/ui/chrome-candidates/exploded/inner-atoms-img2img-micro-v2/candidate-10.png', 'inner', 'atom'],
    ['inner-rails-repeat-v4-02', '/assets/ui/chrome-candidates/exploded/inner-rails-repeat-v4/candidate-02.png', 'inner', 'rail-repeat'],
  ].map(([id, src, role, kind]) => ({ id, src, role, kind, label: id, width: 1, height: 1 }));
  write('frontend/src/ui/chromeCandidateManifest.json', `${JSON.stringify({ sources: chromeSources })}\n`);
  write('frontend/src/ui/nativeRailCandidateManifest.json', `${JSON.stringify({
    sources: [], families: [], unpairedSourceIds: [],
  })}\n`);
  write('frontend/config/native-rail-families.json', `${JSON.stringify({ families: [] })}\n`);
  write('frontend/config/chrome-lab-defaults.json', `${JSON.stringify({
    outer: { atomSourceId: 'ui/chrome/outer/atom.png', railSourceId: 'ui/chrome/outer/rail.png' },
    inner: { atomSourceId: 'ui/chrome/inner/atom.png', railSourceId: 'ui/chrome/inner/rail.png' },
    divider: { atomSourceId: 'ui/chrome/divider/joint.png' },
  })}\n`);
  write('.gitattributes', `${reportPath} text eol=crlf\n`);
  write(reportPath, canonicalBytes);
  const git = (args) => execFileSync('git', args, {
    cwd: fixtureRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'importer@example.test']);
  git(['config', 'user.name', 'Live media importer test']);
  git(['config', 'core.autocrlf', 'false']);
  git(['config', 'core.safecrlf', 'false']);
  git(['config', 'commit.gpgSign', 'false']);
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'fixture']);
  fs.rmSync(path.join(fixtureRoot, reportPath));
  git(['checkout', '--quiet', '--', reportPath]);
  expect(fs.readFileSync(path.join(fixtureRoot, reportPath)).equals(checkoutBytes)).toBe(true);
  expect(git(['status', '--porcelain'])).toBe('');
  return { fixtureRoot, reportPath, canonicalBytes, checkoutBytes };
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
      '--availability-policy',
      '--admin-catalog-path', '--create-path', '--content-path', '--bridge-path', '--archive-path',
    ]) {
      expect(() => parseArgs(['upload', option, 'anything'])).toThrow(new RegExp(`Unknown option: ${option}`));
    }
  });

  it('uses content magic instead of misleading legacy filename extensions', () => {
    expect(mediaTypeFor('proof.png', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(mediaTypeFor('tile.jpg', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png');
  });

  it('privately archives unclassified Chrome pixels and non-image data by default', () => {
    const sourcePath = 'frontend/public/assets/ui/chrome-candidates/native-rails-v1/attempt/report.json';
    expect(isCutoverSourcePath(sourcePath)).toBe(true);
    expect(isCutoverSourcePath('frontend/config/chrome-lab-defaults.json')).toBe(false);
    expect(isCutoverSourcePath('frontend/src/ui/chromeCandidateManifest.json')).toBe(true);
    expect(isCutoverSourcePath('frontend/src/ui/nativeRailCandidateManifest.json')).toBe(true);
    expect(isCutoverSourcePath('frontend/config/native-rail-families.json')).toBe(true);
    expect(isCutoverSourcePath('frontend/public/assets/arbitrary.json')).toBe(false);
    expect(mediaTypeFor(sourcePath, Buffer.from('{"nativeScale":1}'))).toBe('application/json');
    expect(migrationIdentity(sourcePath)).toEqual({
      namespace: 'migration/git-media-cutover',
      slot: null,
      migrationDisposition: 'private-archive',
      domain: 'ui-kit',
      role: 'manifest',
    });
    expect(migrationIdentity('frontend/public/assets/ui/chrome-candidates/exploded/outer/candidate-01.png')).toEqual({
      namespace: 'migration/git-media-cutover',
      slot: null,
      migrationDisposition: 'private-archive',
      domain: 'ui-kit',
      role: 'source',
    });
  });

  it('scopes terrain face roles and classifies Chrome art sources as UI kit material', () => {
    expect(migrationIdentity('frontend/public/assets/tiles/surface/grass-0-top.png')).toMatchObject({
      domain: 'terrain', role: 'top',
    });
    expect(migrationIdentity('frontend/public/assets/ui/frame-top.png')).toMatchObject({
      domain: 'ui-kit', role: 'media',
    });
    expect(migrationIdentity('frontend/public/assets/ui/frame-side.png')).toMatchObject({
      domain: 'ui-kit', role: 'media',
    });
    expect(migrationIdentity('docs/art/chrome-native-rails/v1/review.png')).toMatchObject({
      domain: 'ui-kit', role: 'review', migrationDisposition: 'private-archive',
    });
  });

  it('keeps only reconstructable Chrome pixels as candidates and activates only five defaults', () => {
    const inventory = buildMigrationInventory({
      repoRoot,
      prefixes: ['frontend/public/assets/ui/chrome-candidates'],
    });
    expect(inventory.totals).toMatchObject({
      count: 561,
      versionCount: 566,
      activeCount: 5,
      candidateCount: 273,
      archiveCount: 288,
      canonicalActivationCount: 5,
      byDisposition: { candidate: 273, 'legacy-bridge': 5, 'private-archive': 288 },
    });
    const candidates = inventory.entries.filter((entry) => entry.migrationDisposition === 'candidate');
    expect(candidates.every((entry) => entry.candidateMetadata?.chromeCandidate
      || entry.candidateMetadata?.nativeRail)).toBe(true);
    expect(candidates.filter((entry) => entry.candidateMetadata?.chromeCandidate)).toHaveLength(196);
    expect(candidates.filter((entry) => entry.candidateMetadata?.nativeRail)).toHaveLength(77);
    const reports = inventory.entries.filter((entry) => entry.sourcePath.endsWith('/report.json'));
    expect(reports).toHaveLength(26);
    expect(reports.every((entry) => entry.slot === null && entry.migrationDisposition === 'private-archive')).toBe(true);
    const unclassifiedSheet = inventory.entries.find((entry) => entry.sourcePath
      === 'frontend/public/assets/ui/chrome-candidates/codex-independent-v3/outer-atoms-alpha.png');
    expect(unclassifiedSheet).toMatchObject({
      slot: null, migrationDisposition: 'private-archive', domain: 'ui-kit', role: 'source',
    });

    const selectedOuterRailPath = 'frontend/public/assets/ui/chrome-candidates/exploded/outer-rails-v3/candidate-01.png';
    const selectedOuterRail = inventory.entries.find((entry) => entry.sourcePath === selectedOuterRailPath
      && entry.migrationDisposition === 'candidate');
    expect(selectedOuterRail).toMatchObject({
      slot: 'ui/chrome-candidates/exploded/outer-rails-v3/candidate-01.png',
      domain: 'ui-kit',
      role: 'candidate',
      candidateMetadata: {
        chromeCandidate: {
          id: 'outer-rails-v3-01',
          label: 'Outer rails v3 01',
          role: 'outer',
          kind: 'rail-sheet',
          width: 947,
          height: 95,
          sourceSheetId: 'outer-rails-v3',
          recommended: true,
          crop: { x: 147, y: 95, w: 947, h: 95 },
        },
      },
    });
    expect(inventory.entries.find((entry) => entry.sourcePath === selectedOuterRailPath
      && entry.chromeDefaultActivation)).toMatchObject({
      slot: 'ui/chrome/outer/rail.png',
      migrationDisposition: 'legacy-bridge',
      activationSourceSlot: selectedOuterRail.slot,
      chromeDefaultActivation: {
        configKey: 'outer.railSourceId',
        sourceId: 'outer-rails-v3-01',
      },
    });

    const dividerPath = 'frontend/public/assets/ui/chrome-candidates/exploded/divider-atoms-pixellab-cover-v1/candidate-21.png';
    const divider = inventory.entries.find((entry) => entry.sourcePath === dividerPath
      && entry.migrationDisposition === 'candidate');
    expect(divider).toMatchObject({
      candidateMetadata: { chromeCandidate: {
        id: 'divider-atoms-pixellab-cover-v1-21',
        label: 'Divider PixelLab cover 21',
        role: 'divider',
        kind: 'atom',
        width: 17,
        height: 17,
        sourceSheetId: 'divider-atoms-pixellab-cover-v1',
        sourceSheetPath: '/assets/ui/chrome-candidates/pixellab-v1/divider-cover-atoms-17',
        componentIndex: 20,
        componentCount: 52,
        crop: { x: 0, y: 0, w: 17, h: 17 },
        recommended: false,
      } },
    });
    expect(inventory.entries.find((entry) => entry.sourcePath === dividerPath
      && entry.chromeDefaultActivation)).toMatchObject({ slot: 'ui/chrome/divider/joint.png' });

    const nativePath = 'frontend/public/assets/ui/chrome-candidates/native-rails-v1/codex-outer-long-native-v2/long-top.png';
    const native = inventory.entries.find((entry) => entry.sourcePath === nativePath);
    expect(native).toMatchObject({
      migrationDisposition: 'candidate',
      candidateMetadata: { nativeRail: {
        id: 'codex-outer-long-native-v2-01',
        label: 'Outer native horizontal 01',
        familyId: 'outer-codex-long-native-v2',
        familyLabel: 'Outer Codex long family 02',
        role: 'outer',
        fit: 'long',
        orientation: 'horizontal',
        width: 1440,
        height: 15,
        nativeScale: 1,
        sourceFile: 'long-top.png',
      } },
      candidateProvenance: { nativeRailManifest: {
        unpaired: false,
        family: { id: 'outer-codex-long-native-v2' },
      } },
      nativeEvidence: {
        native1x: true,
        spatialResampling: false,
        sourceWidth: 1440,
        sourceHeight: 15,
        sourceSha256: native.sha256,
      },
    });
  });

  it('privately archives the three descriptor files needed to reconstruct Chrome and Rail labs', () => {
    const sources = [
      'frontend/src/ui/chromeCandidateManifest.json',
      'frontend/src/ui/nativeRailCandidateManifest.json',
      'frontend/config/native-rail-families.json',
    ];
    const inventory = buildMigrationInventory({ repoRoot, prefixes: sources });
    expect(inventory.totals).toMatchObject({
      count: 3, versionCount: 3, activeCount: 0, candidateCount: 0, archiveCount: 3,
    });
    expect(inventory.entries.map((entry) => entry.sourcePath).sort()).toEqual([...sources].sort());
    expect(inventory.entries.every((entry) => entry.slot === null && entry.domain === 'ui-kit'
      && entry.role === 'manifest' && entry.migrationDisposition === 'private-archive')).toBe(true);
  });

  it('fails if checked-in Chrome defaults stop naming the five canonical installed slots', () => {
    const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
    const input = {
      chromeManifest: readJson('frontend/src/ui/chromeCandidateManifest.json'),
      nativeRailManifest: readJson('frontend/src/ui/nativeRailCandidateManifest.json'),
      nativeRailFamilies: readJson('frontend/config/native-rail-families.json'),
      chromeLabDefaults: readJson('frontend/config/chrome-lab-defaults.json'),
    };
    input.chromeLabDefaults.outer.atomSourceId = 'outer-atoms-img2img-32-v1-08';
    expect(() => createChromeCutoverContext(input)).toThrow(/must select canonical slot ui\/chrome\/outer\/atom\.png/);
  });

  it('inventories and uploads canonical LF Git blobs from a clean CRLF checkout and rejects later edits', async () => {
    const { fixtureRoot, reportPath, canonicalBytes, checkoutBytes } = crlfGitFixture();
    const inventory = buildMigrationInventory({ repoRoot: fixtureRoot, prefixes: [reportPath] });
    expect(inventory.entries).toHaveLength(1);
    const [entry] = inventory.entries;
    expect(entry).toMatchObject({
      sourcePath: reportPath,
      byteLength: canonicalBytes.length,
      sha256: crypto.createHash('sha256').update(canonicalBytes).digest('hex'),
      mediaType: 'application/json',
      migrationDisposition: 'private-archive',
    });
    expect(entry.byteLength).not.toBe(checkoutBytes.length);

    const candidate = migrationVersion(entry, inventory, { media: null, rowRevision: 0 });
    const uploaded = migrationVersion(entry, inventory, { rowRevision: 1 });
    const archived = migrationVersion(entry, inventory, { status: 'archived', rowRevision: 2 });
    const client = fakeClient();
    client.createVersion.mockResolvedValue({ id: candidate.id, revision: 0, row: candidate });
    client.uploadContent.mockImplementation(async ({ bytes }) => {
      expect(bytes.equals(canonicalBytes)).toBe(true);
      expect(bytes.equals(checkoutBytes)).toBe(false);
      return { revision: 1, row: uploaded };
    });
    client.request.mockResolvedValue({ body: { version: archived } });
    const result = await migrateEntry(entry, inventory, {
      repoRoot: fixtureRoot, availabilityPolicy: '', immutablePrefix: '/api/media', stablePrefix: '/assets',
    }, client, { slots: [] }, null);
    expect(result).toMatchObject({ action: 'private-archive', reused: false });
    expect(client.uploadContent).toHaveBeenCalledTimes(1);

    fs.writeFileSync(path.join(fixtureRoot, reportPath), Buffer.concat([
      checkoutBytes,
      Buffer.from('{"changed":true}\r\n', 'utf8'),
    ]));
    const changedClient = fakeClient();
    await expect(migrateEntry(entry, inventory, {
      repoRoot: fixtureRoot, availabilityPolicy: '', immutablePrefix: '/api/media', stablePrefix: '/assets',
    }, changedClient, { slots: [] }, null)).rejects.toThrow(/changed after inventory/);
    expect(changedClient.createVersion).not.toHaveBeenCalled();
    expect(() => buildMigrationInventory({ repoRoot: fixtureRoot, prefixes: [reportPath] }))
      .toThrow(/Tracked migration source differs from/);
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

  it('resumes an uploaded private-archive candidate at the archive action', async () => {
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

  it('creates and uploads a non-active Chrome candidate without bridge, archive, or stable-route calls', async () => {
    const { entry, inventory, options } = fixture('candidate');
    entry.candidateMetadata = {
      chromeCandidate: {
        id: 'candidate-1', label: 'Candidate 1', role: 'outer', kind: 'atom', width: null, height: null,
      },
    };
    entry.candidateProvenance = {
      chromeCandidateManifest: { schema: 'chrome-candidate-manifest-v1', manifestPath: 'manifest.json' },
    };
    entry.nativeEvidence = {
      native1x: true, spatialResampling: false, sourceWidth: null, sourceHeight: null, sourceSha256: entry.sha256,
    };
    const candidate = migrationVersion(entry, inventory, { media: null, rowRevision: 0 });
    const uploaded = migrationVersion(entry, inventory, { rowRevision: 1 });
    const client = fakeClient();
    client.createVersion.mockResolvedValue({ id: candidate.id, revision: 0, row: candidate });
    client.uploadContent.mockResolvedValue({ revision: 1, row: uploaded });

    const result = await migrateEntry(entry, inventory, options, client, { slots: [] }, null);

    expect(result).toMatchObject({ action: 'candidate', reused: false, stable: null });
    expect(client.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      slot: entry.slot,
      domain: 'ui-kit',
      role: 'candidate',
      label: 'Candidate 1',
      availabilityPolicy: 'decorative',
      metadata: expect.objectContaining({
        migrationDisposition: 'candidate',
        chromeCandidate: entry.candidateMetadata.chromeCandidate,
      }),
      provenance: {
        chromeCandidateManifest: entry.candidateProvenance.chromeCandidateManifest,
        migration: expect.objectContaining({
          kind: 'git-media-cutover', namespace: 'runtime-candidate', targetSlot: entry.slot,
        }),
      },
      nativeEvidence: entry.nativeEvidence,
    }), expect.objectContaining({ idempotencyKey: expect.stringMatching(/^adr0085-/) }));
    expect(client.uploadContent).toHaveBeenCalledTimes(1);
    expect(client.verifyMedia).toHaveBeenCalledTimes(1);
    expect(client.request).not.toHaveBeenCalled();

    const [completed] = await verifyStableMigrationResults([entry], [result], options, client);
    expect(completed.stable).toBeNull();
    expect(client.verifyMedia).toHaveBeenCalledTimes(1);
  });

  it('reuses an exact uploaded Chrome candidate and resumes one whose content upload was interrupted', async () => {
    const ready = fixture('candidate');
    const existing = migrationVersion(ready.entry, ready.inventory);
    const readyClient = fakeClient();
    const reused = await migrateEntry(ready.entry, ready.inventory, ready.options, readyClient, { slots: [] }, existing);
    expect(reused).toMatchObject({ action: 'candidate', reused: true });
    expect(readyClient.createVersion).not.toHaveBeenCalled();
    expect(readyClient.uploadContent).not.toHaveBeenCalled();
    expect(readyClient.request).not.toHaveBeenCalled();
    expect(readyClient.verifyMedia).toHaveBeenCalledTimes(1);

    const interrupted = fixture('candidate');
    const withoutMedia = migrationVersion(interrupted.entry, interrupted.inventory, { media: null });
    const uploaded = migrationVersion(interrupted.entry, interrupted.inventory, { rowRevision: 2 });
    const resumeClient = fakeClient();
    resumeClient.uploadContent.mockResolvedValue({ revision: 2, row: uploaded });
    const resumed = await migrateEntry(
      interrupted.entry, interrupted.inventory, interrupted.options, resumeClient, { slots: [] }, withoutMedia,
    );
    expect(resumed).toMatchObject({ action: 'candidate', reused: false });
    expect(resumeClient.createVersion).not.toHaveBeenCalled();
    expect(resumeClient.uploadContent).toHaveBeenCalledTimes(1);
    expect(resumeClient.request).not.toHaveBeenCalled();
    expect(resumeClient.verifyMedia).toHaveBeenCalledTimes(1);
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
    }), expect.objectContaining({ idempotencyKey: expect.stringMatching(/^adr0085-/) }));
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
        namespace: activation.namespace,
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
        namespace: entry.namespace, originalRepositoryPath: entry.sourcePath, sha256: '0'.repeat(64) } },
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

  it('gives a Chrome candidate and its canonical activation distinct migration identities and idempotency keys', () => {
    const { entry, inventory } = fixture('candidate');
    const activationEntry = {
      ...entry,
      namespace: 'runtime-chrome-default-activation',
      slot: 'ui/chrome/outer/atom.png',
      migrationDisposition: 'legacy-bridge',
      role: 'atom',
      activationSourceSlot: entry.slot,
      chromeDefaultActivation: {
        schema: 'chrome-lab-default-activation-v1',
        configPath: 'frontend/config/chrome-lab-defaults.json',
        configKey: 'outer.atomSourceId',
        sourceId: 'candidate-1',
        sourceSlot: entry.slot,
        targetSlot: 'ui/chrome/outer/atom.png',
      },
    };
    expect(migrationIdempotencyKey(entry, inventory)).not.toBe(migrationIdempotencyKey(activationEntry, inventory));
    const candidateVersion = migrationVersion(entry, inventory);
    const activationVersion = migrationVersion(activationEntry, inventory, { id: 'version-activation' });
    expect(existingMigrationIndex({ versions: [candidateVersion, activationVersion] }).size).toBe(2);
  });
});
