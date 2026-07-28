import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorDocumentEditSessionError } from './editorDocuments';
import {
  archivePredrawnGenerationAttempt,
  createPredrawnBackgroundVersion,
  createPredrawnGenerationAttempt,
  discardPredrawnGenerationAttemptOcclusion,
  discardPredrawnGenerationAttemptWarp,
  listPredrawnBackgroundVersions,
  listPredrawnGenerationAttempts,
  predrawnBackgroundVersionErrorDetails,
  updatePredrawnGenerationAttemptMoveHighlightProfile,
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

  it('explains why an existing slot cannot be continued instead of exposing server codes', () => {
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'generation_attempt_conflict',
    })).toMatch(/slot changed.*Adjust grid again/i);
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'generation_attempt_in_use',
    })).toMatch(/actively used or published/i);
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'generation_attempt_document_quota_exceeded',
    })).toMatch(/retained background-history limit/i);
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'generation_attempt_warp_in_use',
      details: 'This warped board is selected by the working Level.',
    })).toBe('This warped board is selected by the working Level.');
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'generation_attempt_occlusion_exists',
    })).toMatch(/board with an occlusion mask.*cannot be discarded/i);
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'generation_attempt_occlusion_conflict',
    })).toMatch(/board with an occlusion mask changed.*Refresh/i);
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'generation_attempt_occlusion_parent_missing',
      details: 'This slot no longer has the warped board required by its mask.',
    })).toBe('This slot no longer has the warped board required by its mask.');
  });

  it('reports the one-upload fence and row revision race directly', () => {
    expect(predrawnBackgroundVersionErrorDetails({ error: 'background_version_upload_busy' }))
      .toMatch(/Another raw background upload.*still running/);
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'background_version_conflict',
      details: { current_revision: 7 },
    })).toMatch(/current revision 7.*Refresh/s);
  });

  it('identifies a server migration failure instead of calling it unavailable storage', () => {
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'background_version_schema_contract_violation',
      details: {
        constraint: 'level_working_copy_revisions_reason_fk',
        database_code: '23503',
      },
    })).toMatch(/schema is incompatible.*reason_fk.*rolled back.*server migration failure/s);
  });

  it('explains schema readiness failures without exposing raw migration codes', () => {
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'schema_migration_required',
      details: {
        missing_versions: [37, 38],
      },
    })).toMatch(/missing a required migration.*Nothing was changed.*Apply the server migration.*refresh/s);
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'schema_migration_history_invalid',
      details: {
        changed_versions: [36],
      },
    })).toMatch(/already-recorded database migration no longer matches.*Nothing was changed.*original migration.*new migration/s);
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'schema_migration_execution_failed',
      details: {
        failed_migration: {
          version: 38,
          name: 'require identified schema migration history',
          phase: 'repair schema migration identity contract',
        },
      },
    })).toMatch(
      /artwork action did not run.*Database migration 38 \("require identified schema migration history"\) failed during repair schema migration identity contract.*migration output.*refresh/s,
    );
  });

  it('shows the server-owned Pipeline Source rejection instead of a generic HTTP failure', () => {
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'generation_attempt_pipeline_source_invalid',
      details: 'This retained source is missing a verified viewing-pane binding.',
    })).toBe('This retained source is missing a verified viewing-pane binding.');
  });

  it('preserves saved-frame validation details instead of exposing the raw error code', () => {
    expect(predrawnBackgroundVersionErrorDetails({
      error: 'background_source_generation_frame_required',
      details: [
        'predrawnGenerationFrame left clearance must be at least 1px (received 0px)',
        'predrawnGenerationFrame top clearance must be at least 1px (received -4px)',
      ],
    })).toBe(
      'predrawnGenerationFrame left clearance must be at least 1px (received 0px) '
      + 'predrawnGenerationFrame top clearance must be at least 1px (received -4px)',
    );
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

describe('pre-drawn generation attempt API', () => {
  const fence = {
    edit_session_id: '11111111-1111-4111-8111-111111111111',
    edit_session_key: 'secret',
    edit_generation: 7,
  };

  it('lists the server-owned creation slots for one editor document', async () => {
    const attempts = [{ id: 'attempt-1' }];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ attempts }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listPredrawnGenerationAttempts('doc/one')).resolves.toEqual(attempts);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/editor-documents/doc%2Fone/generation-attempts',
      {
        credentials: 'include',
        cache: 'no-store',
      },
    );
  });

  it('creates an attempt bound to one immutable source artwork under the writer fence', async () => {
    const returned = { id: 'attempt-1', source_version_id: 'source-1' };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ attempt: returned }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPredrawnGenerationAttempt({
      documentId: 'doc-1',
      sourceVersionId: 'source-1',
      label: 'Bridge pass 1',
      idempotencyKey: 'attempt:create:one',
      fence,
    })).resolves.toEqual(returned);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-1/generation-attempts');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'Idempotency-Key': 'attempt:create:one',
      }),
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      source_version_id: 'source-1',
      label: 'Bridge pass 1',
      edit_session_id: fence.edit_session_id,
      edit_session_key: fence.edit_session_key,
      edit_generation: fence.edit_generation,
    });
  });

  it('creates a new attempt from an exact stored Raw Pipeline Source without uploading it', async () => {
    const returned = {
      id: 'attempt-2',
      origin: 'pipeline-source',
      source_version_id: 'raw-1',
      generated_version_id: 'raw-1',
      source_attempt_id: 'attempt-1',
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ attempt: returned }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPredrawnGenerationAttempt({
      documentId: 'doc-1',
      pipelineSourceVersionId: 'raw-1',
      label: 'Bridge refinement',
      idempotencyKey: 'attempt:pipeline-source:one',
      fence,
    })).resolves.toEqual(returned);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-1/generation-attempts');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      pipeline_source_version_id: 'raw-1',
      label: 'Bridge refinement',
      edit_session_id: fence.edit_session_id,
      edit_generation: fence.edit_generation,
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('source_version_id');
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('pipeline_source_attempt_id');
  });

  it('archives the whole creation attempt using its row revision', async () => {
    const returned = { id: 'attempt/1', status: 'archived', row_revision: 5 };
    const archiveResult = {
      attempt: returned,
      document: { document_id: 'doc-1', revision: 12 },
      forgotten_selection: {
        working_copy: true,
        canonical: true,
        version_ids: ['warp-1', 'mask-1'],
      },
      canonical_level: { id: 'level-1' },
      workspace_revision: 9,
      thumbnail_ready: true,
      idempotent_replay: false,
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(archiveResult), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(archivePredrawnGenerationAttempt({
      documentId: 'doc-1',
      attemptId: 'attempt/1',
      expectedRevision: 4,
      documentRevision: 11,
      fence,
    })).resolves.toEqual(archiveResult);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/editor-documents/doc-1/generation-attempts/attempt%2F1/archive');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      expected_revision: 4,
      document_revision: 11,
      ...fence,
    });
  });

  it('discards one exact warped stage under the slot revision and writer fence', async () => {
    const discardResult = {
      attempt: {
        id: 'attempt/1',
        warped_version_id: null,
        occlusion_version_id: null,
        processing_revision: 1,
        row_revision: 6,
      },
      discarded_version: {
        id: 'warp/1',
        kind: 'warped',
        status: 'archived',
        row_revision: 3,
      },
      idempotent_replay: false,
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(discardResult), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(discardPredrawnGenerationAttemptWarp({
      documentId: 'doc-1',
      attemptId: 'attempt/1',
      expectedRevision: 5,
      expectedWarpedVersionId: 'warp/1',
      fence,
    })).resolves.toEqual(discardResult);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      '/api/editor-documents/doc-1/generation-attempts/attempt%2F1/discard-warp',
    );
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      expected_revision: 5,
      expected_warped_version_id: 'warp/1',
      ...fence,
    });
  });

  it('discards one exact occlusion stage under attempt, document, and writer CAS', async () => {
    const discardResult = {
      attempt: {
        id: 'attempt/1',
        warped_version_id: 'warp/1',
        occlusion_version_id: null,
        processing_revision: 2,
        row_revision: 8,
      },
      detached_version: {
        id: 'mask/1',
        kind: 'occlusion',
        status: 'archived',
        row_revision: 3,
      },
      document: {
        document_id: 'doc-1',
        revision: 13,
      },
      forgotten_selection: {
        working_copy: true,
        canonical: false,
        version_ids: ['mask/1'],
      },
      canonical_level: { id: 'level-1' },
      workspace_revision: 9,
      thumbnail_ready: true,
      selection: {
        working_copy_fell_back: true,
        canonical_reference_retained: false,
      },
      detached_version_archived: true,
      retained_reason: null,
      idempotent_replay: false,
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(discardResult), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(discardPredrawnGenerationAttemptOcclusion({
      documentId: 'doc-1',
      attemptId: 'attempt/1',
      expectedRevision: 7,
      expectedOcclusionVersionId: 'mask/1',
      documentRevision: 12,
      fence,
    })).resolves.toEqual(discardResult);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      '/api/editor-documents/doc-1/generation-attempts/attempt%2F1/discard-occlusion',
    );
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      expected_revision: 7,
      expected_occlusion_version_id: 'mask/1',
      document_revision: 12,
      ...fence,
    });
  });

  it('saves one sparse cyan footprint draft under the exact warp revision and writer fence', async () => {
    const updateResult = {
      attempt: {
        id: 'attempt/1',
        warped_version_id: 'warp/1',
        move_highlight_profile_sha256: 'a'.repeat(64),
        row_revision: 6,
      },
      idempotent_replay: false,
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(updateResult), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updatePredrawnGenerationAttemptMoveHighlightProfile({
      documentId: 'doc-1',
      attemptId: 'attempt/1',
      expectedRevision: 5,
      expectedWarpedVersionId: 'warp/1',
      cells: {
        '3,2': [5000, 500, 9500, 5000, 5000, 9500, 500, 5000],
      },
      fence,
    })).resolves.toEqual(updateResult);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      '/api/editor-documents/doc-1/generation-attempts/attempt%2F1/move-highlight-profile',
    );
    expect(init).toMatchObject({
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      expected_revision: 5,
      expected_warped_version_id: 'warp/1',
      cells: {
        '3,2': [5000, 500, 9500, 5000, 5000, 9500, 500, 5000],
      },
      ...fence,
    });
  });

});
