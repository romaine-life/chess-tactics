import { describe, expect, it } from 'vitest';
import type { EditorBoard, VersionedPredrawnBoardSurface } from '@chess-tactics/board-render';
import type { PredrawnBackgroundVersion } from '../net/predrawnBackgroundVersions';
import {
  predrawnEnvironmentGeometryFromVersion,
  predrawnSelectionNeedsRevalidation,
  predrawnSelectionValidity,
} from './predrawnSelectionValidity';

const RAW_ID = '11111111-1111-4111-8111-111111111111';
const WARP_ID = '22222222-2222-4222-8222-222222222222';
const MASK_ID = '33333333-3333-4333-8333-333333333333';
const GEOMETRY = 'a'.repeat(64);

function version(
  kind: PredrawnBackgroundVersion['kind'],
  id: string,
  overrides: Partial<PredrawnBackgroundVersion> = {},
): PredrawnBackgroundVersion {
  return {
    id,
    document_id: 'doc-1',
    level_id: 'level-1',
    kind,
    label: kind,
    parent_version_id: null,
    source_background_version_id: null,
    status: 'ready',
    row_revision: 1,
    frame_width: 1600,
    frame_height: 900,
    world_bounds: { minX: -100, minY: -50, width: 1600, height: 900 },
    operation: {
      environmentGeometrySchema: 'predrawn-environment-geometry-v2',
      environmentGeometrySha256: GEOMETRY,
    },
    provenance: {},
    environment_geometry_sha256_v2: null,
    pipeline_source_eligible: kind === 'raw',
    pipeline_source_issue: kind === 'raw' ? null : 'Only raw artwork can seed a processing attempt.',
    content_sha256: id.replaceAll('-', '').padEnd(64, 'b').slice(0, 64),
    content_url: `/api/background-versions/${id}/content`,
    created_at: '2026-07-22T00:00:00.000Z',
    created_by: 'Owner',
    updated_at: '2026-07-22T00:00:00.000Z',
    ...overrides,
  };
}

const raw = (): PredrawnBackgroundVersion => version('raw', RAW_ID);
const warped = (): PredrawnBackgroundVersion => version('warped', WARP_ID, {
  parent_version_id: RAW_ID,
  source_background_version_id: RAW_ID,
});
const mask = (): PredrawnBackgroundVersion => version('occlusion', MASK_ID, {
  source_background_version_id: WARP_ID,
});
const surface = (occlusion = true): VersionedPredrawnBoardSurface => ({
  kind: 'predrawn',
  schemaVersion: 2,
  backgroundVersionId: occlusion ? WARP_ID : RAW_ID,
  ...(occlusion ? { occlusionVersionId: MASK_ID } : {}),
  frameWidth: 1600,
  frameHeight: 900,
  worldBounds: { minX: -100, minY: -50, width: 1600, height: 900 },
});
const fittedSurface = (): VersionedPredrawnBoardSurface => ({
  ...surface(false),
  schemaVersion: 3,
  backgroundVersionId: WARP_ID,
  moveHighlightProfile: {
    schema: 'predrawn-move-highlight-profile-v1',
    backgroundVersionId: WARP_ID,
    coordinateBasis: 'cell-diamond-10000-v1',
    environmentGeometrySha256: GEOMETRY,
    cells: {
      '1,1': [5000, 500, 9500, 5000, 5000, 9500, 500, 5000],
    },
    profileSha256: 'f'.repeat(64),
  },
});

function board(overrides: Partial<EditorBoard> = {}): EditorBoard {
  return {
    cols: 2,
    rows: 2,
    cells: {
      '0,0': 'grass',
      '1,0': 'grass',
      '0,1': 'grass',
      '1,1': 'grass',
    },
    backgroundMode: 'ai',
    surface: surface(),
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {},
    featureCuts: {},
    featureExits: {},
    zones: {},
    ...overrides,
  };
}

describe('pre-drawn Level selection validity', () => {
  it('preserves completed validation when takeover rehydrates the same artwork and geometry', () => {
    const current = board();
    const rehydrated = structuredClone(current);
    rehydrated.units['0,0'] = { unitId: 'pawn', direction: 's', faction: 'white' };
    rehydrated.cover['1,1'] = 'filled';
    rehydrated.zones = { '0,1': 'pawn-promotion' };

    expect(predrawnSelectionNeedsRevalidation(current, rehydrated)).toBe(false);
  });

  it('requires revalidation when the selected artwork or baked environment changes', () => {
    const current = board();
    expect(predrawnSelectionNeedsRevalidation(current, board({
      cells: { ...current.cells, '1,1': 'stone' },
    }))).toBe(true);
    expect(predrawnSelectionNeedsRevalidation(current, board({
      surface: { ...surface(), backgroundVersionId: RAW_ID },
    }))).toBe(true);
    expect(predrawnSelectionNeedsRevalidation(current, board({
      surface: undefined,
      backgroundMode: 'legacy',
    }))).toBe(true);
  });

  it('fails closed for a missing or unresolvable remembered selection', () => {
    expect(predrawnSelectionValidity(undefined, [raw()], { v1: GEOMETRY, v2: GEOMETRY })).toEqual({
      kind: 'missing',
    });
    expect(predrawnSelectionValidity(surface(), [raw()], { v1: GEOMETRY, v2: GEOMETRY })).toEqual({
      kind: 'unavailable',
    });
  });

  it('marks an exact usable artifact valid only for its current environment geometry', () => {
    const versions = [raw(), warped(), mask()];
    expect(predrawnSelectionValidity(surface(), versions, {
      v1: GEOMETRY,
      v2: GEOMETRY,
    }).kind).toBe('valid');
    expect(predrawnSelectionValidity(surface(), versions, {
      v1: 'b'.repeat(64),
      v2: 'b'.repeat(64),
    }).kind).toBe('stale');
  });

  it('validates the attached occlusion row as well as its raster', () => {
    const staleMask = mask();
    staleMask.operation.environmentGeometrySha256 = 'c'.repeat(64);
    expect(predrawnSelectionValidity(surface(), [raw(), warped(), staleMask], {
      v1: GEOMETRY,
      v2: GEOMETRY,
    }).kind).toBe('stale');
  });

  it('prefers a durable migrated v2 binding over legacy operation metadata', () => {
    const candidate = raw();
    candidate.operation.environmentGeometrySchema = 'predrawn-environment-geometry-v1';
    candidate.operation.environmentGeometrySha256 = 'd'.repeat(64);
    candidate.environment_geometry_sha256_v2 = GEOMETRY;
    expect(predrawnEnvironmentGeometryFromVersion(candidate)).toEqual({
      schema: 'predrawn-environment-geometry-v2',
      sha256: GEOMETRY,
    });
    expect(predrawnSelectionValidity(surface(false), [candidate], {
      v1: 'd'.repeat(64),
      v2: GEOMETRY,
    }).kind).toBe('valid');
  });

  it('validates an embedded fitted-highlight snapshot against its exact warp, geometry, and playable cells', () => {
    const board = { cells: { '0,0': 'grass', '1,1': 'stone' } };
    expect(predrawnSelectionValidity(fittedSurface(), [raw(), warped()], {
      v1: GEOMETRY,
      v2: GEOMETRY,
    }, board).kind).toBe('valid');
    expect(predrawnSelectionValidity(fittedSurface(), [raw(), warped()], {
      v1: GEOMETRY,
      v2: 'b'.repeat(64),
    }, board).kind).toBe('stale');
    expect(predrawnSelectionValidity(fittedSurface(), [raw(), warped()], {
      v1: GEOMETRY,
      v2: GEOMETRY,
    }, { cells: { '0,0': 'grass' } }).kind).toBe('unavailable');
  });

  it('keeps a hand-placed grid valid while still proving the artwork is the exact artifact', () => {
    const versions = [raw(), warped(), mask()];
    const moved = { v1: 'b'.repeat(64), v2: 'b'.repeat(64) };
    // Resizing or sliding the grid changes the environment geometry, and on a detached board that
    // is the owner's decision rather than a defect: the picture keeps rendering and stays savable.
    expect(predrawnSelectionValidity(surface(), versions, moved).kind).toBe('stale');
    expect(predrawnSelectionValidity(surface(), versions, moved, {
      cells: {},
      predrawnGridDetached: true,
    }).kind).toBe('valid');

    // Detaching answers the geometry question only. A selection that does not resolve to one exact
    // complete artifact is still unavailable, because that is about identity, not placement.
    expect(predrawnSelectionValidity(surface(), [raw()], moved, {
      cells: {},
      predrawnGridDetached: true,
    }).kind).toBe('unavailable');
  });

  it('lets a detached grid outgrow its move-highlight calibration without losing the artwork', () => {
    const shrunk = { cells: { '0,0': 'grass' }, predrawnGridDetached: true };
    // The profile calibrates cell 1,1. Once the grid has moved, a cell it no longer covers is
    // simply uncalibrated — it falls back to the full-cell highlight instead of killing the plate.
    expect(predrawnSelectionValidity(fittedSurface(), [raw(), warped()], {
      v1: GEOMETRY,
      v2: 'b'.repeat(64),
    }, shrunk).kind).toBe('valid');
    expect(predrawnSelectionValidity(fittedSurface(), [raw(), warped()], {
      v1: GEOMETRY,
      v2: GEOMETRY,
    }, { cells: { '0,0': 'grass' } }).kind).toBe('unavailable');
  });
});
