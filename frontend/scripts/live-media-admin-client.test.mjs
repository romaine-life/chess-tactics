import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  archiveSourceBytes,
  LiveMediaAdminClient,
  latestArchivedSourceVersion,
  mediaTypeFromBytes,
  mediaTypeFromPath,
  parseCli,
  readCandidateBatchManifest,
  sha256Bytes,
  uploadCandidateBatch,
  uploadCandidateBytes,
} from './live-media-admin-client.mjs';

function jsonResponse(value, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('live media admin tooling client', () => {
  it('creates, revision-uploads, and stream-verifies candidate bytes without promoting', async () => {
    const bytes = Buffer.from('synthetic candidate bytes');
    const hash = sha256Bytes(bytes);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ version: { id: 'version-1', rowRevision: 0, media: null } }))
      .mockResolvedValueOnce(jsonResponse({ version: {
        id: 'version-1', rowRevision: 1,
        media: { url: '/api/admin/media/hash', sha256: hash, byteLength: bytes.length, mediaType: 'image/png' },
      } }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } }));
    const client = new LiveMediaAdminClient({ apiBase: 'http://127.0.0.1:9999', fetchImpl });

    const result = await uploadCandidateBytes({
      client,
      payload: { slot: 'terrain/example.png', domain: 'terrain', role: 'top', label: 'Example' },
      bytes,
      mediaType: 'image/png',
      idempotencyKey: 'example-key',
    });

    expect(result).toMatchObject({ id: 'version-1', revision: 1, verification: { sha256: hash, byteLength: bytes.length } });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key']).toBe('example-key');
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
    expect(fetchImpl.mock.calls[1][1].headers['If-Match']).toBe('"0"');
    expect(fetchImpl.mock.calls.map((call) => call[0])).not.toContain(expect.stringMatching(/review|accept|bridge/));
  });

  it('rejects a backend byte stream whose hash differs from the upload response', async () => {
    const bytes = Buffer.from('expected');
    const hash = sha256Bytes(bytes);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'version-2', rowRevision: 0 }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'version-2', rowRevision: 1,
        media: { url: '/api/admin/media/hash', sha256: hash, byteLength: bytes.length, mediaType: 'image/png' },
      }))
      .mockResolvedValueOnce(new Response('different', { status: 200, headers: { 'Content-Type': 'image/png' } }));
    const client = new LiveMediaAdminClient({ apiBase: 'http://localhost:9999', fetchImpl });

    await expect(uploadCandidateBytes({
      client,
      payload: { slot: 'terrain/example.png', domain: 'terrain', role: 'top', label: 'Example' },
      bytes,
      mediaType: 'image/png',
    })).rejects.toThrow(/verification mismatch/i);
  });

  it('resumes an idempotent candidate with exact bytes without uploading again', async () => {
    const bytes = Buffer.from('already uploaded candidate');
    const hash = sha256Bytes(bytes);
    const client = new LiveMediaAdminClient({ apiBase: 'http://localhost:9999', fetchImpl: vi.fn() });
    client.createVersion = vi.fn(async () => ({
      id: 'version-existing',
      revision: 4,
      body: { idempotentReplay: true },
      row: {
        id: 'version-existing',
        status: 'candidate',
        rowRevision: 4,
        media: {
          url: '/api/admin/media/existing', sha256: hash, byteLength: bytes.length, mediaType: 'image/png',
        },
      },
    }));
    client.uploadContent = vi.fn();
    client.verifyMedia = vi.fn(async (request) => request);

    const result = await uploadCandidateBytes({
      client,
      payload: { slot: 'terrain/example.png', domain: 'terrain', role: 'top', label: 'Example' },
      bytes,
      mediaType: 'image/png',
      idempotencyKey: 'same-candidate',
    });

    expect(result).toMatchObject({ id: 'version-existing', revision: 4, reused: true });
    expect(client.uploadContent).not.toHaveBeenCalled();
    expect(client.verifyMedia).toHaveBeenCalledWith(expect.objectContaining({ sha256: hash }));
  });

  it('uploads source bytes and immediately archives them as private backend provenance', async () => {
    const bytes = Buffer.from('synthetic source mesh');
    const hash = sha256Bytes(bytes);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ version: { id: 'source-1', rowRevision: 0, media: null } }))
      .mockResolvedValueOnce(jsonResponse({ version: {
        id: 'source-1', rowRevision: 1,
        media: { url: '/api/admin/media/hash', sha256: hash, byteLength: bytes.length, mediaType: 'application/octet-stream' },
      } }))
      .mockResolvedValueOnce(new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }))
      .mockResolvedValueOnce(jsonResponse({ version: { id: 'source-1', rowRevision: 2, status: 'archived' } }));
    const client = new LiveMediaAdminClient({ apiBase: 'http://localhost:9999', fetchImpl });

    const result = await archiveSourceBytes({
      client,
      payload: {
        sourcePath: 'providers/polyhaven/boulder/model.glb',
        domain: 'prop',
        role: 'source',
        label: 'Poly Haven boulder source',
        provenance: { provider: 'Poly Haven', license: 'CC0' },
      },
      bytes,
      mediaType: 'application/octet-stream',
      idempotencyKey: `polyhaven-${hash}`,
      reason: 'Preserve the exact external source bytes used by the generator.',
      evidence: { schema: 'external-source-archive-v1', provider: 'Poly Haven' },
    });

    expect(result.archived.status).toBe('archived');
    expect(fetchImpl.mock.calls[3][0]).toMatch(/\/api\/admin\/media-versions\/source-1\/archive$/);
    expect(JSON.parse(fetchImpl.mock.calls[3][1].body)).toMatchObject({
      expectedRevision: 1,
      evidence: { schema: 'external-source-archive-v1', contentSha256: hash },
    });
    expect(fetchImpl.mock.calls.map((call) => call[0])).not.toContain(expect.stringMatching(/review|accept|bridge/));
  });

  it('treats an exact already-archived source as a completed replay', async () => {
    const bytes = Buffer.from('already archived source');
    const hash = sha256Bytes(bytes);
    const client = new LiveMediaAdminClient({ apiBase: 'http://localhost:9999', fetchImpl: vi.fn() });
    client.createVersion = vi.fn(async () => ({
      id: 'source-existing',
      revision: 3,
      body: { idempotentReplay: true },
      row: {
        id: 'source-existing',
        status: 'archived',
        rowRevision: 3,
        media: {
          url: '/api/admin/media/source-existing',
          sha256: hash,
          byteLength: bytes.length,
          mediaType: 'application/octet-stream',
        },
      },
    }));
    client.uploadContent = vi.fn();
    client.archiveVersion = vi.fn();
    client.verifyMedia = vi.fn(async (request) => request);

    const result = await archiveSourceBytes({
      client,
      payload: { sourcePath: 'sources/example.blend', domain: 'terrain', role: 'source', label: 'Example source' },
      bytes,
      mediaType: 'application/octet-stream',
      idempotencyKey: 'same-source',
      reason: 'Exact source archive.',
      evidence: { schema: 'source-proof-v1' },
    });

    expect(result).toMatchObject({ revision: 3, reused: true, archived: { status: 'archived' } });
    expect(client.uploadContent).not.toHaveBeenCalled();
    expect(client.archiveVersion).not.toHaveBeenCalled();
  });

  it('archives manifest sources before idempotent candidate uploads and reports exact revisions and hashes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live-media-batch-test-'));
    try {
      const sourceBytes = Buffer.from('exact generator source');
      const candidateBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      fs.writeFileSync(path.join(root, 'source.bin'), sourceBytes);
      fs.writeFileSync(path.join(root, 'candidate.png'), candidateBytes);
      const manifestPath = path.join(root, 'batch.json');
      fs.writeFileSync(manifestPath, JSON.stringify({
        schema: 'live-media-candidate-batch-v1',
        batchId: 'example-batch-v1',
        sources: [{
          id: 'generator-source',
          file: 'source.bin',
          sourcePath: 'generators/example/source.bin',
          domain: 'terrain',
          label: 'Exact generator source',
          reason: 'Preserve exact source bytes before candidate upload.',
          evidence: { schema: 'example-source-proof-v1' },
        }],
        candidates: [{
          id: 'candidate-a',
          file: 'candidate.png',
          slot: 'terrain/example-side.png',
          domain: 'terrain',
          role: 'side',
          label: 'Example side candidate',
          availabilityPolicy: 'critical',
          sourceIds: ['generator-source'],
          metadata: { canonicalScale: 1 },
        }],
      }));
      const manifest = readCandidateBatchManifest(manifestPath);
      const operations = [];
      const client = new LiveMediaAdminClient({ apiBase: 'http://localhost:9999', fetchImpl: vi.fn() });
      client.createVersion = vi.fn(async (payload, { idempotencyKey }) => {
        operations.push(`create:${payload.role}`);
        const id = payload.role === 'source' ? 'source-version' : 'candidate-version';
        return { id, revision: 0, row: { id, status: 'candidate', rowRevision: 0, media: null }, body: {}, idempotencyKey };
      });
      client.uploadContent = vi.fn(async ({ id, bytes, mediaType }) => {
        operations.push(`upload:${id}`);
        return {
          revision: 1,
          row: {
            id,
            status: 'candidate',
            rowRevision: 1,
            media: {
              url: `/api/admin/media/${id}`,
              sha256: sha256Bytes(bytes),
              byteLength: bytes.length,
              mediaType,
            },
          },
        };
      });
      client.verifyMedia = vi.fn(async (request) => {
        operations.push(`verify:${request.url.split('/').at(-1)}`);
        return request;
      });
      client.archiveVersion = vi.fn(async ({ id }) => {
        operations.push(`archive:${id}`);
        return { revision: 2, row: { id, status: 'archived', rowRevision: 2 } };
      });

      const report = await uploadCandidateBatch({ client, manifest });

      expect(operations).toEqual([
        'create:source', 'upload:source-version', 'verify:source-version', 'archive:source-version',
        'create:side', 'upload:candidate-version', 'verify:candidate-version',
      ]);
      expect(report).toMatchObject({
        schema: 'live-media-candidate-batch-result-v1',
        batchId: 'example-batch-v1',
        sources: [{
          id: 'generator-source', versionId: 'source-version', revision: 2,
          sha256: sha256Bytes(sourceBytes), status: 'archived',
        }],
        candidates: [{
          id: 'candidate-a', slot: 'terrain/example-side.png', versionId: 'candidate-version', revision: 1,
          sha256: sha256Bytes(candidateBytes), status: 'candidate',
          sourceVersions: [{ entryId: 'generator-source', versionId: 'source-version', sha256: sha256Bytes(sourceBytes) }],
        }],
      });
      const candidateCreate = client.createVersion.mock.calls.find(([payload]) => payload.role === 'side');
      expect(candidateCreate[0].provenance.liveMediaBatch).toMatchObject({
        batchId: 'example-batch-v1', entryId: 'candidate-a', kind: 'candidate',
        sources: [{ entryId: 'generator-source', versionId: 'source-version' }],
      });
      expect(client.createVersion.mock.calls.map(([, request]) => request.idempotencyKey))
        .toEqual([expect.stringMatching(/^livebatch-source-/), expect.stringMatching(/^livebatch-candidate-/)]);
      expect(operations.some((operation) => /review|accept|bridge/.test(operation))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('exposes source archive and batch upload commands without a review or acceptance command', () => {
    expect(parseCli([
      'archive-source', '--api-base', 'http://localhost:9999', '--file', 'source.bin',
      '--source-path', 'sources/source.bin', '--domain', 'terrain', '--label', 'Source',
      '--reason', 'Exact archive', '--evidence-json', 'evidence.json',
    ]).command).toBe('archive-source');
    expect(parseCli([
      'upload-candidate-batch', '--api-base', 'http://localhost:9999', '--manifest', 'batch.json',
    ]).command).toBe('upload-candidate-batch');
    expect(() => parseCli(['review-candidate'])).toThrow(/Usage/);
    expect(() => readCandidateBatchManifest(fileURLToPath(import.meta.url)))
      .toThrow(/outside the Git repository/);
  });

  it('does not allow image bytes to bypass validation as an opaque upload', async () => {
    const client = new LiveMediaAdminClient({ apiBase: 'http://localhost:9999', fetchImpl: vi.fn() });
    await expect(uploadCandidateBytes({
      client,
      payload: { slot: 'terrain/example.png', domain: 'terrain', role: 'top', label: 'Example' },
      bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      mediaType: 'application/octet-stream',
    })).rejects.toThrow(/content magic/);
  });

  it('uses safe MIME inference and preserves unknown source binaries as opaque bytes', () => {
    expect(mediaTypeFromPath('tile.PNG')).toBe('image/png');
    expect(mediaTypeFromPath('source.blend')).toBe('application/octet-stream');
    expect(mediaTypeFromBytes('mislabeled.png', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(mediaTypeFromBytes('mislabeled.jpg', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png');
  });

  it('requires HTTPS for non-loopback admin endpoints', () => {
    expect(() => new LiveMediaAdminClient({ apiBase: 'http://assets.example.com' })).toThrow(/HTTPS/);
    expect(() => new LiveMediaAdminClient({ apiBase: 'https://assets.example.com' })).not.toThrow();
    expect(() => new LiveMediaAdminClient({ apiBase: 'http://127.0.0.1:9999' })).not.toThrow();
  });

  it('selects only the unambiguous latest archived source for an exact path', () => {
    const older = {
      id: 'old', sourcePath: 'docs/art/source.blend', domain: 'unit-art', role: 'source', status: 'archived',
      updatedAt: '2026-07-10T00:00:00.000Z', media: { url: '/api/admin/media/old' },
    };
    const latest = { ...older, id: 'new', updatedAt: '2026-07-11T00:00:00.000Z', media: { url: '/api/admin/media/new' } };
    expect(latestArchivedSourceVersion({ versions: [older, latest] }, older.sourcePath, 'unit-art')).toBe(latest);
    expect(() => latestArchivedSourceVersion({
      versions: [latest, { ...latest, id: 'same-time' }],
    }, older.sourcePath)).toThrow(/ambiguous/i);
    expect(() => latestArchivedSourceVersion({ versions: [older] }, 'docs/art/other.blend')).toThrow(/No archived source/i);
  });
});
