import { describe, expect, it } from 'vitest';
import {
  centeredPlayableBoardFramingBounds,
  clampPredrawnGenerationFrame,
  defaultBoardCameraBounds,
  initialPredrawnGenerationFrame,
  predrawnGenerationBoundsFromCentered,
  predrawnGenerationFrameContaining,
  predrawnGenerationRequiredBounds,
  resolvedBoardCameraBounds,
  validatePredrawnGenerationFrame,
  type EditorBoard,
} from '@chess-tactics/board-render';
import { expandBounds } from './PredrawnGenerationFramePicker';

const board = (cols: number, rows: number, extra: Partial<EditorBoard> = {}): EditorBoard => {
  const cells: Record<string, string> = {};
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) cells[`${x},${y}`] = 'grass-surf-0';
  return {
    cols, rows, cells, units: {}, doodads: {}, props: {}, cover: {},
    features: {}, featureCuts: {}, featureExits: {}, ...extra,
  };
};

function contains(
  frame: { x: number; y: number; width: number; height: number },
  bounds: { minX: number; minY: number; width: number; height: number },
): boolean {
  return frame.x <= bounds.minX
    && frame.y <= bounds.minY
    && frame.x + frame.width >= bounds.minX + bounds.width
    && frame.y + frame.height >= bounds.minY + bounds.height;
}

describe('generation-frame presets', () => {
  it('maps a board-centred rectangle into generation space without resizing it', () => {
    const subject = board(9, 5);
    const opening = centeredPlayableBoardFramingBounds(subject);
    const converted = predrawnGenerationBoundsFromCentered(subject, opening);

    expect(converted.width).toBe(opening.width);
    expect(converted.height).toBe(opening.height);
    // The playable envelope the frame speaks in is centred on the same world content, so the
    // converted opening view sits symmetrically around it rather than drifting by the origin.
    const required = predrawnGenerationRequiredBounds(subject);
    const openingCenterX = converted.minX + converted.width / 2;
    const requiredCenterX = required.minX + required.width / 2;
    expect(Math.abs(openingCenterX - requiredCenterX)).toBeLessThan(1);
  });

  // Why the picker offers no separate opening-view preset: the camera crop already shows that view
  // whole, and cropping to the opening view alone would always leave reachable world outside.
  it('shows the level opening view whole inside the camera-boundary crop', () => {
    const subject = board(9, 5);
    const opening = predrawnGenerationBoundsFromCentered(
      subject,
      centeredPlayableBoardFramingBounds(subject),
    );
    const camera = predrawnGenerationBoundsFromCentered(subject, resolvedBoardCameraBounds(subject));
    const frame = predrawnGenerationFrameContaining(subject, camera);

    expect(validatePredrawnGenerationFrame(subject, frame).ok).toBe(true);
    expect(contains(frame, opening)).toBe(true);
    expect(frame.width * 9).toBe(frame.height * 16);
  });

  it('shows the whole camera boundary, including an author-widened one', () => {
    const wide = defaultBoardCameraBounds({ cols: 6, rows: 6 });
    const subject = board(6, 6, {
      cameraBounds: {
        minX: wide.minX - 900,
        minY: wide.minY - 400,
        width: wide.width + 1800,
        height: wide.height + 800,
      },
    });
    const camera = predrawnGenerationBoundsFromCentered(subject, resolvedBoardCameraBounds(subject));
    const frame = predrawnGenerationFrameContaining(subject, camera);

    expect(validatePredrawnGenerationFrame(subject, frame).ok).toBe(true);
    expect(contains(frame, camera)).toBe(true);
    // A camera boundary the author widened must produce a wider crop than the tightest legal one.
    expect(frame.width).toBeGreaterThan(initialPredrawnGenerationFrame(subject).width);
  });

  it('still contains protected gameplay art when a preset rectangle is smaller than it', () => {
    const subject = board(8, 8);
    const tiny = { minX: 0, minY: 0, width: 32, height: 18 };
    const frame = predrawnGenerationFrameContaining(subject, tiny);

    expect(validatePredrawnGenerationFrame(subject, frame).ok).toBe(true);
    expect(contains(frame, predrawnGenerationRequiredBounds(subject))).toBe(true);
  });

  it('leaves the tightest legal fit unchanged', () => {
    const subject = board(7, 4);
    expect(predrawnGenerationFrameContaining(subject, predrawnGenerationRequiredBounds(subject)))
      .toEqual(initialPredrawnGenerationFrame(subject));
  });
});

describe('room presets', () => {
  const subject = board(8, 8);
  const camera = predrawnGenerationBoundsFromCentered(subject, resolvedBoardCameraBounds(subject));
  const roomFrame = (room: number) => predrawnGenerationFrameContaining(subject, expandBounds(camera, room));

  it('grows the scene around the player view without moving its centre', () => {
    const wide = expandBounds(camera, 2);
    expect(wide.width).toBe(camera.width * 2);
    expect(wide.minX + wide.width / 2).toBeCloseTo(camera.minX + camera.width / 2, 6);
    expect(wide.minY + wide.height / 2).toBeCloseTo(camera.minY + camera.height / 2, 6);
  });

  it('offers strictly more scene at each step, and every step is applicable', () => {
    const snug = roomFrame(1);
    const roomy = roomFrame(1.5);
    const wide = roomFrame(2.25);

    expect(roomy.width).toBeGreaterThan(snug.width);
    expect(wide.width).toBeGreaterThan(roomy.width);
    for (const frame of [snug, roomy, wide]) {
      expect(validatePredrawnGenerationFrame(subject, frame).ok).toBe(true);
    }
  });

  it('shows the whole player view at the default, unlike the tightest legal crop', () => {
    const roomy = roomFrame(1.5);
    expect(contains(roomy, camera)).toBe(true);
    expect(contains(initialPredrawnGenerationFrame(subject), camera)).toBe(false);
  });
});

describe('framing controls cannot reach an unappliable frame', () => {
  const subject = board(8, 8);
  const smallest = initialPredrawnGenerationFrame(subject);

  it('grows a crop zoomed past the smallest legal width, keeping 16:9', () => {
    const tooSmall = { ...smallest, width: 320, height: 180 };
    const clamped = clampPredrawnGenerationFrame(subject, tooSmall);

    expect(clamped.width).toBe(smallest.width);
    expect(clamped.width * 9).toBe(clamped.height * 16);
    expect(validatePredrawnGenerationFrame(subject, clamped).ok).toBe(true);
  });

  it('stops a runaway pan at the boundary instead of walking required art out', () => {
    const wide = predrawnGenerationFrameContaining(subject, predrawnGenerationBoundsFromCentered(
      subject,
      resolvedBoardCameraBounds(subject),
    ));
    const dragged = clampPredrawnGenerationFrame(subject, { ...wide, y: wide.y - 5000 });

    expect(validatePredrawnGenerationFrame(subject, dragged).ok).toBe(true);
    expect(dragged.width).toBe(wide.width);
    expect(dragged.y).toBeGreaterThan(wide.y - 5000);
  });

  it('leaves a frame that is already applicable exactly as authored', () => {
    expect(clampPredrawnGenerationFrame(subject, smallest)).toEqual(smallest);
  });

  it('falls back to the smallest legal frame for unusable input', () => {
    expect(clampPredrawnGenerationFrame(subject, { version: 1, x: 0, y: 0, width: 100, height: 100 }))
      .toEqual(smallest);
  });
});
