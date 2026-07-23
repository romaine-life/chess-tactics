import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorDocumentEditSessionError } from './editorDocuments';
import {
  createPredrawnBackgroundVersion,
  listPredrawnBackgroundVersions,
  predrawnBackgroundVersionErrorDetails,
} from './predrawnBackgroundVersions';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pre-drawn background version API errors', () => {
  it('turns retained-history and blob quotas into actionable owner copy', () => {
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'background_version_document_quota_exceeded',
      details: { limit: 256 },
    })).toMatch(/256-version background history limit.*Archiving versions does not reclaim/s);
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'background_version_owner_blob_quota_exceeded',
      details: {
        used_bytes: String(512 * 1024 ** 2),
        limit_bytes: String(1024 ** 3),
        attempted_additional_bytes: String(12 * 1024 ** 2),
      },
    })).toMatch(/512\.0 MiB of 1\.00 GiB retained; this upload adds 12\.0 MiB/);
  });

  it('reports the one-upload fence and row revision race directly', () => {
    expect(predrawnBackgroundVersionErrorDetails({ error: 'background_version_upload_busy' }))
      .toMatch(/Another raw background upload.*still running/);
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'background_version_conflict',
      details: { current_revision: 7 },
    })).toMatch(/current revision 7.*Refresh/s);
  });

  it('uses the structured domain message through the real client response path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'background_version_document_quota_exceeded',
      details: { limit: 256 },
    }), { status: 409, headers: { 'content-type': 'application/json' } })));

    await expect(listPredrawnBackgroundVersions('doc-1')).rejects.toMatchObject({
      status: 409,
      details: expect.stringMatching(/Archiving versions does not reclaim/),
    });
  });

  it('preserves writer-fence recovery errors instead of flattening them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'editor_document_session_displaced',
      session: null,
      presence: null,
      recovery: null,
    }), { status: 409, headers: { 'content-type': 'application/json' } })));

    const error = await createPredrawnBackgroundVersion('doc-1', {
      kind: 'raw',
      label: 'Raw',
      world_bounds: { minX: 0, minY: 0, width: 10, height: 10 },
      operation: {},
      provenance: {},
      idempotency_key: 'predrawn-raw:test',
    }, {
      edit_session_id: '11111111-1111-4111-8111-111111111111',
      edit_session_key: 'secret',
      edit_generation: 1,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EditorDocumentEditSessionError);
    expect(error).toMatchObject({ code: 'editor_document_session_displaced' });
  });
});
