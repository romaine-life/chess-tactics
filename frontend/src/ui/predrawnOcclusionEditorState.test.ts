import { describe, expect, it } from 'vitest';
import {
  PREDRAWN_OCCLUSION_HISTORY_BYTES_LIMIT,
  PREDRAWN_OCCLUSION_HISTORY_LIMIT,
  acceptPredrawnOcclusionCandidate,
  clampPredrawnOcclusionPan,
  commitPredrawnOcclusionGesture,
  createPredrawnOcclusionHistory,
  createPredrawnOcclusionSnapshot,
  mutatePredrawnOcclusionStroke,
  nativePredrawnOcclusionPoint,
  paintPredrawnOcclusionStroke,
  predrawnOcclusionHistoryRetainedBytes,
  recordPredrawnOcclusionHistory,
  selectPredrawnOcclusionCandidate,
  stepPredrawnOcclusionHistory,
  trimPredrawnOcclusionHistoryToBytes,
  zoomPredrawnOcclusionAtPoint,
  type PredrawnOcclusionSnapshot,
} from './predrawnOcclusionEditorState';

function candidateSnapshot(
  snapshot: PredrawnOcclusionSnapshot,
  selectedCandidateIndex = 1,
): PredrawnOcclusionSnapshot {
  return {
    ...snapshot,
    prompts: [{ x: 2.5, y: 1.25, label: 'positive' }],
    candidates: [
      { index: 0, score: 0.3, alpha: Uint8Array.from([255, 0, 0, 0, 0, 0]) },
      { index: 1, score: 0.9, alpha: Uint8Array.from([0, 255, 255, 0, 0, 0]) },
      { index: 2, score: 0.6, alpha: Uint8Array.from([0, 0, 0, 255, 0, 0]) },
    ],
    selectedCandidateIndex,
    activeModel: {
      modelId: 'test/slimsam',
      modelRevision: 'exact-revision',
      backend: 'webgpu',
    },
  };
}

describe('predrawn occlusion native geometry', () => {
  it('maps displayed pointer positions back to exact native-image coordinates', () => {
    expect(nativePredrawnOcclusionPoint(
      350,
      275,
      { left: 100, top: 150, width: 500, height: 250 },
      2000,
      1000,
    )).toEqual({ x: 1000, y: 500 });
    expect(nativePredrawnOcclusionPoint(
      900,
      -50,
      { left: 100, top: 150, width: 500, height: 250 },
      2000,
      1000,
    )).toBeUndefined();
    expect(nativePredrawnOcclusionPoint(
      600,
      400,
      { left: 100, top: 150, width: 500, height: 250 },
      2000,
      1000,
    )).toEqual({ x: 1999, y: 999 });
  });

  it('keeps the artwork pixel under the cursor fixed while zooming', () => {
    const viewport = { width: 1000, height: 700 };
    const artwork = { width: 2000, height: 1000 };
    const cursor = { x: 720, y: 210 };
    const opening = { zoom: 0.5, pan: { x: 0, y: 0 } };
    const imageX = artwork.width / 2
      + (cursor.x - viewport.width / 2 - opening.pan.x) / opening.zoom;
    const imageY = artwork.height / 2
      + (cursor.y - viewport.height / 2 - opening.pan.y) / opening.zoom;

    const changed = zoomPredrawnOcclusionAtPoint({
      zoom: opening.zoom,
      nextZoom: 1,
      pan: opening.pan,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      imageWidth: artwork.width,
      imageHeight: artwork.height,
      viewportX: cursor.x,
      viewportY: cursor.y,
    });

    expect(artwork.width / 2
      + (cursor.x - viewport.width / 2 - changed.pan.x) / changed.zoom).toBeCloseTo(imageX);
    expect(artwork.height / 2
      + (cursor.y - viewport.height / 2 - changed.pan.y) / changed.zoom).toBeCloseTo(imageY);
  });

  it('clamps panning at the real artwork edges', () => {
    expect(clampPredrawnOcclusionPan(
      { x: 1000, y: -1000 },
      1,
      800,
      600,
      1200,
      800,
    )).toEqual({ x: 200, y: -100 });
  });
});

describe('predrawn occlusion masks', () => {
  it('rejects a mask whose pixels do not match the native artwork dimensions', () => {
    expect(() => createPredrawnOcclusionSnapshot(3, 2, new Uint8Array(5)))
      .toThrow(/expected 6/);
  });

  it('paints a continuous native-resolution stroke without mutating its source', () => {
    const source = new Uint8Array(12 * 5);
    const painted = paintPredrawnOcclusionStroke(
      source,
      12,
      5,
      { x: 1, y: 2.5 },
      { x: 10, y: 2.5 },
      1,
      255,
    );
    expect(source.every((value) => value === 0)).toBe(true);
    for (let x = 1; x < 10; x += 1) {
      expect(painted[2 * 12 + x]).toBe(255);
    }

    const erased = paintPredrawnOcclusionStroke(
      painted,
      12,
      5,
      { x: 5.5, y: 2.5 },
      { x: 5.5, y: 2.5 },
      1,
      0,
    );
    expect(erased[2 * 12 + 5]).toBe(0);
    expect(painted[2 * 12 + 5]).toBe(255);
  });

  it('cycles scored candidates and adds only the selected candidate to the accepted mask', () => {
    const opening = createPredrawnOcclusionSnapshot(3, 2);
    const proposed = candidateSnapshot(opening, 0);
    const selected = selectPredrawnOcclusionCandidate(proposed, 1);
    const accepted = acceptPredrawnOcclusionCandidate(selected);

    expect(accepted.acceptedAlpha).toEqual(Uint8Array.from([0, 255, 255, 0, 0, 0]));
    expect(accepted.prompts).toEqual([]);
    expect(accepted.candidates).toEqual([]);
    expect(accepted.positivePromptCount).toBe(1);
    expect(accepted.negativePromptCount).toBe(0);
    expect(accepted.acceptedModel).toEqual({
      modelId: 'test/slimsam',
      modelRevision: 'exact-revision',
      backend: 'webgpu',
    });
    expect(proposed.acceptedAlpha).toEqual(new Uint8Array(6));
  });
});

describe('predrawn occlusion edit history', () => {
  it('undoes and redoes a model proposal and an accepted candidate exactly', () => {
    let history = createPredrawnOcclusionHistory(3, 2);
    const proposed = candidateSnapshot(history.present);
    history = recordPredrawnOcclusionHistory(history, proposed);
    const accepted = acceptPredrawnOcclusionCandidate(history.present);
    history = recordPredrawnOcclusionHistory(history, accepted);

    history = stepPredrawnOcclusionHistory(history, 'undo')!;
    expect(history.present).toBe(proposed);
    history = stepPredrawnOcclusionHistory(history, 'undo')!;
    expect(history.present.candidates).toEqual([]);
    history = stepPredrawnOcclusionHistory(history, 'redo')!;
    expect(history.present).toBe(proposed);
    history = stepPredrawnOcclusionHistory(history, 'redo')!;
    expect(history.present).toBe(accepted);
  });

  it('records a many-event brush gesture as exactly one history step', () => {
    const opening = createPredrawnOcclusionHistory(8, 8);
    const workingAlpha = new Uint8Array(opening.present.acceptedAlpha);
    const first = mutatePredrawnOcclusionStroke(
      workingAlpha,
      8,
      8,
      { x: 1, y: 1 },
      { x: 3, y: 3 },
      1,
      255,
    );
    const second = mutatePredrawnOcclusionStroke(
      workingAlpha,
      8,
      8,
      { x: 3, y: 3 },
      { x: 6, y: 6 },
      1,
      255,
    );
    expect(first.alpha).toBe(workingAlpha);
    expect(second.alpha).toBe(workingAlpha);
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(true);
    const committed = commitPredrawnOcclusionGesture(opening, {
      ...opening.present,
      acceptedAlpha: workingAlpha,
    });

    expect(committed.past).toHaveLength(1);
    expect(committed.present.acceptedAlpha).toBe(workingAlpha);
    expect(committed.present.manualEditCount).toBe(1);
    expect(stepPredrawnOcclusionHistory(committed, 'undo')?.present.acceptedAlpha)
      .toEqual(new Uint8Array(64));
  });

  it('bounds history and clears redo after a new edit', () => {
    let history = createPredrawnOcclusionHistory(1, 1);
    for (let index = 0; index < PREDRAWN_OCCLUSION_HISTORY_LIMIT + 5; index += 1) {
      history = recordPredrawnOcclusionHistory(history, {
        ...history.present,
        prompts: [{ x: 0, y: 0, label: index % 2 ? 'positive' : 'negative' }],
      });
    }
    expect(history.past).toHaveLength(PREDRAWN_OCCLUSION_HISTORY_LIMIT);

    const undone = stepPredrawnOcclusionHistory(history, 'undo')!;
    expect(undone.future).toHaveLength(1);
    const changed = recordPredrawnOcclusionHistory(undone, {
      ...undone.present,
      prompts: [],
    });
    expect(changed.future).toHaveLength(0);
  });

  it('retains nearest snapshots under the 64 MiB mask-byte budget', () => {
    expect(PREDRAWN_OCCLUSION_HISTORY_BYTES_LIMIT).toBe(64 * 1024 * 1024);
    const snapshot = (value: number): PredrawnOcclusionSnapshot => ({
      ...createPredrawnOcclusionSnapshot(4, 1),
      acceptedAlpha: new Uint8Array(4).fill(value),
    });
    const history = {
      past: [snapshot(1), snapshot(2), snapshot(3)],
      present: snapshot(4),
      // Future is farthest-to-nearest, matching the history stack contract.
      future: [snapshot(6), snapshot(5)],
    };
    const trimmed = trimPredrawnOcclusionHistoryToBytes(history, 12);

    expect(predrawnOcclusionHistoryRetainedBytes(trimmed)).toBeLessThanOrEqual(12);
    expect(trimmed.past.map((entry) => entry.acceptedAlpha[0])).toEqual([3]);
    expect(trimmed.present.acceptedAlpha[0]).toBe(4);
    expect(trimmed.future.map((entry) => entry.acceptedAlpha[0])).toEqual([5]);
  });
});
