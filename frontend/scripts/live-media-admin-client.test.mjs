import { describe, expect, it, vi } from 'vitest';
import {
  archiveSourceBytes,
  LiveMediaAdminClient,
  latestArchivedSourceVersion,
  mediaTypeFromBytes,
  mediaTypeFromPath,
  sha256Bytes,
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
