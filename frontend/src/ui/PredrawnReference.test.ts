import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '@chess-tactics/board-render';
import type { RevisionedWorkspace } from '../net/campaignWorkspace';
import {
  decodePredrawnReferenceImage,
  predrawnReferenceHref,
  predrawnReferenceFilename,
  predrawnReferenceLevelFromWorkspaces,
  predrawnReferenceLevelId,
  tightenTopSurfaceArtExportFrame,
} from './PredrawnReference';

const workspace = (...levels: ReturnType<typeof createBlankLevel>[]): RevisionedWorkspace => ({
  campaigns: [],
  levels: Object.fromEntries(levels.map((level) => [level.id, level])),
  revision: 1,
  updated_at: null,
});

describe('pre-drawn top-only reference route', () => {
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
    expect(predrawnReferenceFilename(' usr-l/bridge & gate ')).toBe('usr-l-bridge-gate-top-only.png');
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

  it('tightens conservative sprite bounds to exact alpha-pixel clearance', () => {
    const frame = {
      width: 1152,
      height: 858,
      padding: 96,
      paintBounds: { minX: -48, minY: -69, width: 960, height: 666 },
      boardPan: { x: 0, y: 0 },
    };
    const paint = { minX: 96, minY: 137, maxX: 1056, maxY: 678, width: 960, height: 541 };
    const tight = tightenTopSurfaceArtExportFrame(frame, paint);
    const shiftX = (tight.width - frame.width) / 2 + tight.boardPan.x - frame.boardPan.x;
    const shiftY = (tight.height - frame.height) / 2 + tight.boardPan.y - frame.boardPan.y;

    expect(tight).toMatchObject({ width: 1152, height: 733, padding: 96 });
    expect(paint.minX + shiftX).toBe(96);
    expect(paint.minY + shiftY).toBe(96);
    expect(paint.maxX + shiftX).toBe(tight.width - 96);
    expect(paint.maxY + shiftY).toBe(tight.height - 96);
  });
});
