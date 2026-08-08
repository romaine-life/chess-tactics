import { describe, expect, it } from 'vitest';
import type { EditorBoard, VersionedPredrawnBoardSurface } from '@chess-tactics/board-render';
import type { PredrawnBackgroundVersion } from '../net/predrawnBackgroundVersions';
import { HttpError } from '../net/http';
import {
  predrawnEnvironmentGeometryFromVersion,
  predrawnSelectionIsDrawable,
  predrawnSelectionNeedsRevalidation,
  predrawnSelectionReadFailure,
  predrawnSelectionReadShouldRetry,
  predrawnSelectionSeed,
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

describe('predrawn selection read failures', () => {
  it('separates an expired sign-in from any other unread list', () => {
    // ADR-0306 owns identity, so the caller reports the 401 there and passes the verdict in. This
    // only has to keep the two apart, because they earn different words and different actions.
    const expired = predrawnSelectionReadFailure(
      new HttpError('list-predrawn-background-versions', 401, 'unauthorized'),
      true,
    );
    expect(expired.kind).toBe('unreachable');
    expect(expired.signedOut).toBe(true);

    const restarted = predrawnSelectionReadFailure(new TypeError('Failed to fetch'), false);
    expect(restarted.kind).toBe('unreachable');
    expect(restarted.signedOut).toBe(false);
    expect(restarted.message).toContain('Failed to fetch');

    // A thrown non-Error still has to produce a usable sentence rather than "[object Object]".
    expect(predrawnSelectionReadFailure({ nope: true }, false).message)
      .toBe('The immutable artwork selection could not be checked.');
  });

  it('retries only the answer that was never received', () => {
    // The bug this exists for: one unread list hid a level's artwork for the life of the page.
    expect(predrawnSelectionReadShouldRetry(predrawnSelectionReadFailure(new Error('down'), false))).toBe(true);
    expect(predrawnSelectionReadShouldRetry(predrawnSelectionReadFailure(new Error('401'), true))).toBe(true);

    // Settled answers about the artwork itself must NOT spin: the server would keep saying the
    // same thing, and the owner has real work to do about it.
    const artifact = { kind: 'valid' as const, artifact: {} as never };
    expect(predrawnSelectionReadShouldRetry(artifact)).toBe(false);
    expect(predrawnSelectionReadShouldRetry({ kind: 'stale', artifact: {} as never })).toBe(false);
    expect(predrawnSelectionReadShouldRetry({ kind: 'unavailable' })).toBe(false);
    expect(predrawnSelectionReadShouldRetry({ kind: 'missing' })).toBe(false);
    expect(predrawnSelectionReadShouldRetry({ kind: 'checking' })).toBe(false);
    // The check could not be ATTEMPTED. Its missing input arriving re-runs it; asking the server
    // again would not.
    expect(predrawnSelectionReadShouldRetry({ kind: 'error', message: 'no document' })).toBe(false);
    // A plate has no list to ask about at all.
    expect(predrawnSelectionReadShouldRetry({ kind: 'plate' })).toBe(false);
  });
});

describe('installed board plates', () => {
  // The bug this exists for: Fortress Gate holds `boards/fortress-gate/plate.png` — a live-media
  // slot with its own frame size and hand registration, painted before the version pipeline. The
  // seed treated "not versioned" as "nothing selected", so the plate gate never opened and the
  // level rendered an empty board with the page backdrop showing through, while the panel said
  // no artwork was selected at all.
  const plate = {
    kind: 'predrawn',
    slot: 'boards/fortress-gate/plate.png',
    frameWidth: 1672,
    frameHeight: 941,
  } as const;

  it('settles a plate as its own drawable answer instead of a missing selection', () => {
    expect(predrawnSelectionSeed(plate)).toEqual({ kind: 'plate' });
    expect(predrawnSelectionIsDrawable(predrawnSelectionSeed(plate))).toBe(true);
  });

  it('still sends a versioned selection to the server and still reports an absent one', () => {
    expect(predrawnSelectionSeed(surface())).toEqual({ kind: 'checking' });
    expect(predrawnSelectionSeed(undefined)).toEqual({ kind: 'missing' });
  });

  it('paints nothing a versioned selection has not proven', () => {
    // Fail-closed is untouched for artwork that HAS a lineage: only `valid` draws.
    expect(predrawnSelectionIsDrawable({ kind: 'checking' })).toBe(false);
    expect(predrawnSelectionIsDrawable({ kind: 'missing' })).toBe(false);
    expect(predrawnSelectionIsDrawable({ kind: 'unavailable' })).toBe(false);
    expect(predrawnSelectionIsDrawable({ kind: 'stale', artifact: {} as never })).toBe(false);
    expect(predrawnSelectionIsDrawable({ kind: 'error', message: 'no document' })).toBe(false);
    expect(predrawnSelectionIsDrawable(predrawnSelectionReadFailure(new Error('down'), false))).toBe(false);
    expect(predrawnSelectionIsDrawable({ kind: 'valid', artifact: {} as never })).toBe(true);
  });
});
