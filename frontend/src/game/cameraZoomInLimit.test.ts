import { describe, expect, it } from 'vitest';
import { decodeBoard, encodeBoard, normalizeCameraZoomIn, type EditorBoard } from '@chess-tactics/board-render';
import { playerMaximumZoom } from './boardCameraPolicy';
import { createSkirmishViewStore } from './skirmishView';

const board = (extra: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 5, rows: 6, cells: {}, units: {}, doodads: {}, props: {}, cover: {},
  features: {}, featureCuts: {}, featureExits: {}, ...extra,
});

describe('authored camera zoom-in limit', () => {
  it('survives a board-code round trip', () => {
    expect(decodeBoard(encodeBoard(board({ cameraZoomIn: 6 })))?.cameraZoomIn).toBe(6);
    expect(decodeBoard(encodeBoard(board()))?.cameraZoomIn).toBeUndefined();
  });

  it('treats unusable values as no limit at all', () => {
    for (const value of [undefined, null, 0, -3, Number.NaN, 'wide']) {
      expect(normalizeCameraZoomIn(value)).toBeUndefined();
    }
    expect(normalizeCameraZoomIn(999)).toBe(16);
  });

  it('lets the level overrule the automatic ceiling in both directions', () => {
    // Automatic would allow 1.45 here; the author says this art holds far more detail.
    expect(playerMaximumZoom(0.9, 8)).toBe(8);
    // And the author may pull it in tighter than automatic when the art cannot take it.
    expect(playerMaximumZoom(0.9, 1.1)).toBe(1.1);
  });

  it('never lets an authored limit fall under the level own floor', () => {
    expect(playerMaximumZoom(3.004, 1.2)).toBe(3.004);
  });

  it('states no ceiling of its own when the level states nothing', () => {
    // An unstated limit is not a limit. The ladder's closest tier is the real ceiling and it is
    // measured against the viewport, so anything returned here could only narrow it silently.
    expect(playerMaximumZoom(0.9, null)).toBe(Number.POSITIVE_INFINITY);
    expect(playerMaximumZoom(3.004, undefined)).toBe(Number.POSITIVE_INFINITY);
  });

  it('applies the level limit through the live view store', () => {
    const store = createSkirmishViewStore();
    store.getState().setMinZoom(3.004);
    expect(store.getState().maxZoom).toBe(Number.POSITIVE_INFINITY);

    // An authored limit is the level speaking for itself and is the one thing that narrows the
    // ceiling; it binds the camera immediately.
    store.getState().setAuthoredZoomIn(9);
    expect(store.getState().maxZoom).toBe(9);
    store.getState().setZoom(9);
    expect(store.getState().zoom).toBe(9);
    store.getState().setZoom(12);
    expect(store.getState().zoom).toBe(9);

    // Withdrawing it hands the ceiling back to the ladder rather than to another number here.
    store.getState().setAuthoredZoomIn(null);
    expect(store.getState().maxZoom).toBe(Number.POSITIVE_INFINITY);
  });
});
