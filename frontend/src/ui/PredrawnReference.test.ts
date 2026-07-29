import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '@chess-tactics/board-render';
import type { RevisionedWorkspace } from '../net/campaignWorkspace';
import {
  decodePredrawnReferenceImage,
  predrawnReferenceHref,
  predrawnReferenceFilename,
  predrawnReferenceLevelFromWorkspaces,
  predrawnReferenceLevelId,
} from './PredrawnReference';
import { boardForPredrawnSourceArtwork } from '../render/StudioReadOnlyBoard';

const workspace = (...levels: ReturnType<typeof createBlankLevel>[]): RevisionedWorkspace => ({
  campaigns: [],
  wars: [],
  levels: Object.fromEntries(levels.map((level) => [level.id, level])),
  revision: 1,
  updated_at: null,
});

describe('pre-drawn generation reference route', () => {
  it('round-trips an arbitrary level id through the generic route', () => {
    const href = predrawnReferenceHref('usr-l-bridge & gate');
    expect(href).toBe('/predrawn-reference?levelId=usr-l-bridge+%26+gate');
    expect(predrawnReferenceLevelId(new URL(href, 'http://localhost').search)).toBe('usr-l-bridge & gate');
  });

  it('carries the exact launching editor document and view back through the route', () => {
    const returnTo = '/editor/level?document=doc-1&levelId=l29&layer=board';
    const href = predrawnReferenceHref('l29', returnTo);
    const params = new URL(href, 'http://localhost').searchParams;

    expect(params.get('levelId')).toBe('l29');
    expect(params.get('returnTo')).toBe(returnTo);
  });

  it('selects official ids only from canonical official content', () => {
    const official = createBlankLevel('off-l-hold-bridge', 'Canonical Hold the Bridge', 12, 8);
    const shadow = createBlankLevel('off-l-hold-bridge', 'Private shadow', 5, 11);
    expect(predrawnReferenceLevelFromWorkspaces(
      official.id,
      workspace(official),
      workspace(shadow),
    )).toBe(official);
  });

  it('selects private levels without assuming a particular grid size', () => {
    const level = createBlankLevel('usr-l-wide-crossing', 'Wide Crossing', 17, 6);
    const selected = predrawnReferenceLevelFromWorkspaces(level.id, workspace(), workspace(level));
    expect(selected?.board).toMatchObject({ cols: 17, rows: 6 });
  });

  it('builds a filesystem-safe level-derived PNG name', () => {
    expect(predrawnReferenceFilename(' usr-l/bridge & gate ')).toBe('usr-l-bridge-gate-generation-reference.png');
  });

  it('fails closed when any reference sprite cannot load', async () => {
    const image: {
      decoding: string;
      onload: (() => void) | null;
      onerror: (() => void) | null;
      decode: () => Promise<void>;
      src?: string;
    } = {
      decoding: 'async',
      onload: null,
      onerror: null,
      decode: () => Promise.reject(new Error('decode failed')),
    };
    Object.defineProperty(image, 'src', {
      set: () => queueMicrotask(() => image.onerror?.()),
    });

    await expect(decodePredrawnReferenceImage(
      '/api/media/missing',
      () => image as unknown as HTMLImageElement,
    )).rejects.toThrow('Reference source failed to load: /api/media/missing');
  });

  it('prepares the same unit-free and cover-free saved background used by Source Artwork', () => {
    const level = createBlankLevel('usr-l-source', 'Source', 5, 5);
    const board = {
      ...level.board,
    };
    const prepared = boardForPredrawnSourceArtwork({
      cols: board.cols,
      rows: board.rows,
      cells: {},
      backgroundMode: 'ai',
      surface: {
        kind: 'predrawn',
        schemaVersion: 2,
        backgroundVersionId: '11111111-1111-4111-8111-111111111111',
        frameWidth: 1600,
        frameHeight: 900,
        worldBounds: { minX: 0, minY: 0, width: 1600, height: 900 },
      },
      units: { '0,0': { unitId: 'rook', direction: 'north', faction: 'navy-blue' } },
      doodads: {},
      props: {},
      cover: { '0,0': 'filled' },
      coverTypes: { '0,0': 'grass' },
      features: {},
      featureCuts: {},
      featureExits: {},
    });

    expect(prepared.backgroundMode).toBe('ai');
    expect(prepared.surface).toBeDefined();
    expect(prepared.units).toEqual({});
    expect(prepared.cover).toEqual({});
    expect(prepared.coverTypes).toEqual({});
  });
});
