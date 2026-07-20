import { describe, expect, it } from 'vitest';
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
  predrawnBoardReviewProof,
  sha256Hex,
} from './predrawnBoardOnboarding';

const alignment = 'v4;1672,941,1034.223,96.015,1375.402,300.134,611.986,723.847,281.123,532.992;5,11;0,0.2,0.4,0.6,0.8,1;0,0.090909,0.181818,0.272727,0.363636,0.454545,0.545455,0.636364,0.727273,0.818182,0.909091,1;1020.229,112.223,1346.622,295.818,628.558,699.729,302.166,516.133';

describe('pre-drawn board onboarding', () => {
  it('hashes exact text and bytes deterministically', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
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
      formatVersion: 1,
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
      slot: 'boards/fortress-gate/plate.png',
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
      boardSlug: 'fortress-gate',
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
});
