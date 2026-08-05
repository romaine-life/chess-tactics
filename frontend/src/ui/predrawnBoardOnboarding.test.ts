import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeBoard,
  encodeBoard,
  parsePredrawnBoardRegistration,
  withPredrawnBoardSurface,
  type EditorBoard,
} from '@chess-tactics/board-render';
import type { AdminLiveMediaSlot, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import type { Level } from '../core/level';
import {
  PREDRAWN_BOARD_PROOF_RENDERER,
  PREDRAWN_BOARD_PROOF_SCHEMA,
  installPredrawnBoardMedia,
  predrawnBoardGenerationProvenance,
  predrawnBoardReviewProof,
  predrawnBoardRuntimeMetadata,
  predrawnBoardSlotSlug,
  sha256Hex,
} from './predrawnBoardOnboarding';

const alignment = 'v4;1672,941,1034.223,96.015,1375.402,300.134,611.986,723.847,281.123,532.992;5,11;0,0.2,0.4,0.6,0.8,1;0,0.090909,0.181818,0.272727,0.363636,0.454545,0.545455,0.636364,0.727273,0.818182,0.909091,1;1020.229,112.223,1346.622,295.818,628.558,699.729,302.166,516.133';

describe('pre-drawn board onboarding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('binds the accepted Hold the Bridge refinement to its complete request lineage', () => {
    expect(predrawnBoardGenerationProvenance(
      'off-l-hold-bridge',
      '/tmp-shots/predrawn-preparation/hold-bridge-candidate-v3-restore-scenery-v1/candidate-restored-v1.png',
    )).toMatchObject({
      generationRunId: 'hold-bridge-candidate-v3-restore-scenery-v1',
      generationMode: 'comparative-refinement',
      isolatedPipelineEvidence: false,
      refinementOperation: 'restore-source-scenery',
      parentRunId: 'hold-bridge-working-r64',
      packetSha256: 'ba98714cad604c013315b14ce974161310d311ccb4e676ca4b4f6152029e4f89',
      promptSha256: 'de2ae2a1111d06c6ae2f0c763b064245a6cfb686f5491a2b3fbeb1dd102bf314',
      referencesSha256: 'f129757eb553d043700b67983f0942cd37de0a4977123a406d050a2283021c30',
    });
  });

  it('hashes exact text and bytes deterministically', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('derives typed runtime identity from the backend-assigned semantic slot', () => {
    const slot = 'boards/ecc0a3cc-a98b-45d4-a8a1-d7388cf36a40/plate.png';
    expect(predrawnBoardSlotSlug(slot)).toBe('ecc0a3cc-a98b-45d4-a8a1-d7388cf36a40');
    expect(predrawnBoardRuntimeMetadata(slot, 1672, 941)).toEqual({
      runtime: {
        component: 'predrawn-board-plate',
        variant: 'ecc0a3cc-a98b-45d4-a8a1-d7388cf36a40',
        frameWidth: 1672,
        frameHeight: 941,
        frameCount: 1,
        altText: '',
      },
    });
  });

  it('patches only the surface declaration and preserves every gameplay and level field', () => {
    const board: EditorBoard = {
      cols: 2,
      rows: 2,
      cells: { '0,0': 'grass-v0', '1,0': 'stone-v0', '0,1': 'sand-v0', '1,1': 'grass-v0' },
      units: { '0,0': { unitId: 'rook', direction: 'south', faction: 'white' } },
      doodads: {},
      props: { '1,1': { propId: 'cottage-small' } },
      cover: {},
      features: {},
      fences: { '0,0|1,0': 'wood' },
      featureCuts: {},
      featureExits: {},
    };
    const level: Level = {
      formatVersion: 2,
      id: 'off-l-fortress-gate',
      name: 'Fortress Gate',
      notes: 'keep me',
      board: { cols: 2, rows: 2, heightLevels: 1 },
      objective: 'capture-all',
      difficulty: 'normal',
      economy: { startingFunds: 3, incomePerTurn: 1 },
      theme: 'fortress',
      boardCode: encodeBoard(board),
      layers: {
        terrain: [],
        decals: [],
        zones: [],
        units: [{ type: 'rook', side: 'player', x: 0, y: 0, facing: 'south' }],
        props: [],
        fences: ['0,0|1,0'],
      },
    };
    const registration = parsePredrawnBoardRegistration(alignment)!;
    const patched = withPredrawnBoardSurface(level, {
      kind: 'predrawn',
      slot: 'boards/fortress-gate/plate.png',
      frameWidth: 1672,
      frameHeight: 941,
      registration,
    });

    expect({ ...patched, boardCode: level.boardCode }).toEqual(level);
    const decoded = decodeBoard(patched.boardCode!);
    expect(decoded?.surface).toEqual({
      kind: 'predrawn',
      slot: 'boards/fortress-gate/plate.png',
      frameWidth: 1672,
      frameHeight: 941,
      registration,
    });
    expect(decoded?.units).toEqual(board.units);
    expect(decoded?.props).toEqual(board.props);
    expect(decoded?.fences).toEqual(board.fences);
  });

  it('binds the Level Editor proof to the exact candidate, alignment, and slot snapshot', async () => {
    const slot: AdminLiveMediaSlot = {
      slot: 'boards/ecc0a3cc-a98b-45d4-a8a1-d7388cf36a40/plate.png',
      domain: 'background',
      role: 'media',
      availabilityPolicy: 'critical',
      lifecycleState: 'staging',
      activeVersionId: null,
      rowRevision: 4,
      metadata: {},
      versionStatus: null,
      productionEligible: false,
      media: null,
    };
    const version = {
      id: '10000000-0000-4000-8000-000000000001',
      slot: slot.slot,
      rowRevision: 7,
      media: { sha256: 'a'.repeat(64) },
    } as AdminLiveMediaVersion;
    const surfaceUrl = `http://localhost:5173/editor/level?levelId=off-l-fortress-gate&predrawnCorners=${encodeURIComponent(alignment)}`;
    const proof = predrawnBoardReviewProof({
      install: {
        levelId: 'off-l-fortress-gate',
        levelName: 'Fortress Gate',
        previewSrc: '/tmp-shots/fortress-gate.png',
        surfaceUrl,
        alignment,
        frameWidth: 1672,
        frameHeight: 941,
        provenance: {},
      },
      slot,
      version,
      sha256: 'a'.repeat(64),
      alignmentSha256: await sha256Hex(alignment),
    });

    expect(proof).toMatchObject({
      schema: PREDRAWN_BOARD_PROOF_SCHEMA,
      renderer: PREDRAWN_BOARD_PROOF_RENDERER,
      surfaceUrl,
      levelId: 'off-l-fortress-gate',
      boardSlug: 'ecc0a3cc-a98b-45d4-a8a1-d7388cf36a40',
      frameWidth: 1672,
      frameHeight: 941,
      alignmentApplied: true,
      alignment,
      previewSha256: 'a'.repeat(64),
      selectedCandidates: [{
        slot: slot.slot,
        versionId: version.id,
        sha256: 'a'.repeat(64),
        rowRevision: 7,
      }],
      slotSnapshots: [{ slot: slot.slot, rowRevision: 4, activeVersionId: null }],
    });
  });

  it('repairs an allocated candidate to its actual slot identity before owner review', async () => {
    const slotName = 'boards/ecc0a3cc-a98b-45d4-a8a1-d7388cf36a40/plate.png';
    const versionId = '10000000-0000-4000-8000-000000000001';
    const previewSrc = '/tmp-shots/hold-bridge.png';
    const bytes = new Blob(['accepted pixels'], { type: 'image/png' });
    const sha256 = await sha256Hex(bytes);
    const alignmentSha256 = await sha256Hex(alignment);
    let slotRevision = 0;
    let activeVersionId: string | null = null;
    let version: AdminLiveMediaVersion = {
      id: versionId,
      slot: slotName,
      sourcePath: null,
      domain: 'background',
      role: 'media',
      label: 'Hold the Bridge board background',
      status: 'candidate',
      productionEligible: false,
      metadata: {
        runtime: {
          component: 'predrawn-board-plate',
          variant: 'hold-bridge',
          frameWidth: 1672,
          frameHeight: 941,
          frameCount: 1,
          altText: '',
        },
      },
      provenance: { levelId: 'off-l-hold-bridge', alignmentSha256 },
      nativeEvidence: {},
      reviewEvidence: {},
      rowRevision: 1,
      createdAt: '',
      updatedAt: '',
      updatedBy: null,
      media: { url: '/api/admin/media/hash', sha256, mediaType: 'image/png', width: 1672, height: 941, byteLength: bytes.size },
    };
    const catalog = () => ({
      schemaVersion: 1 as const,
      revision: 1,
      updatedAt: null,
      slots: [{
        slot: slotName,
        domain: 'background',
        role: 'media',
        availabilityPolicy: 'critical' as const,
        lifecycleState: activeVersionId ? 'active' as const : 'staging' as const,
        activeVersionId,
        rowRevision: slotRevision,
        metadata: { acceptance: { mode: 'standalone' } },
        versionStatus: activeVersionId ? 'accepted' as const : null,
        productionEligible: Boolean(activeVersionId),
        media: activeVersionId ? version.media : null,
      }],
      versions: [version],
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (raw, init = {}) => {
      const url = String(raw);
      const method = init.method ?? 'GET';
      if (url === previewSrc) return new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } });
      if (url === '/api/admin/media-assets' && method === 'GET') {
        return Response.json(catalog());
      }
      if (url === `/api/admin/media-versions/${versionId}` && method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        expect(body.expectedRevision).toBe(1);
        expect(body.metadata.runtime.variant).toBe('ecc0a3cc-a98b-45d4-a8a1-d7388cf36a40');
        version = { ...version, metadata: body.metadata, rowRevision: 2 };
        return Response.json({ version });
      }
      if (url === `/api/admin/media-versions/${versionId}/review` && method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body.expectedRevision).toBe(2);
        expect(body.evidence.boardSlug).toBe('ecc0a3cc-a98b-45d4-a8a1-d7388cf36a40');
        version = { ...version, rowRevision: 3, reviewEvidence: { evidence: body.evidence } };
        return Response.json({ version });
      }
      if (url === '/api/admin/media-versions/accept-batch' && method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body.items[0]).toMatchObject({ id: versionId, expectedRevision: 3, expectedSlotRevision: 0, expectedActiveVersionId: null });
        activeVersionId = versionId;
        slotRevision = 1;
        version = { ...version, status: 'accepted', productionEligible: true, rowRevision: 4 };
        return Response.json({ versions: [version], catalogRevision: 2, batchId: 'batch' });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const installed = await installPredrawnBoardMedia({
      levelId: 'off-l-hold-bridge',
      levelName: 'Hold the Bridge',
      previewSrc,
      surfaceUrl: `http://127.0.0.1:5178/editor/level?levelId=off-l-hold-bridge`,
      alignment,
      frameWidth: 1672,
      frameHeight: 941,
      provenance: {},
    });

    expect(installed).toMatchObject({ slot: slotName, sha256, alreadyAccepted: false });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/media-versions/${versionId}`,
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
