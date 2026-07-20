import { describe, expect, it } from 'vitest';
import type { PredrawnGenerationFrame } from '@chess-tactics/board-render';
import {
  predrawnGenerationFrameReadout,
  predrawnGenerationFrameStatus,
  samePredrawnGenerationFrame,
} from './predrawnGenerationFrameStatus';

const frame: PredrawnGenerationFrame = {
  version: 1,
  x: -528,
  y: -99,
  width: 1248,
  height: 702,
};

describe('pre-drawn generation frame status', () => {
  it('distinguishes preview absence, saving, durable working copy, and canonical authority', () => {
    expect(predrawnGenerationFrameStatus({
      cloudState: 'saved',
      promotionVerb: 'publish',
    }).kind).toBe('missing');

    expect(predrawnGenerationFrameStatus({
      frame,
      cloudState: 'pending',
      promotionVerb: 'publish',
    }).kind).toBe('saving');

    const working = predrawnGenerationFrameStatus({
      frame,
      cloudFrame: { ...frame },
      cloudState: 'saved',
      promotionVerb: 'publish',
    });
    expect(working.kind).toBe('working-copy');
    expect(working.detail).toContain('not the pipeline input until you publish');

    const canonical = predrawnGenerationFrameStatus({
      frame,
      cloudFrame: { ...frame },
      canonicalFrame: { ...frame },
      cloudState: 'saved',
      promotionVerb: 'publish',
    });
    expect(canonical.kind).toBe('canonical');
    expect(canonical.title).toContain('Canonical pipeline frame');
  });

  it('keeps autosave failures explicit even when the frame is still durable', () => {
    const status = predrawnGenerationFrameStatus({
      frame,
      cloudFrame: { ...frame },
      cloudState: 'conflict',
      promotionVerb: 'publish',
    });

    expect(status.kind).toBe('blocked');
    expect(status.title).toContain('Working-copy frame saved');
    expect(status.detail).toContain('autosave is paused');
  });

  it('uses exact native-pixel frame identity and a legible coordinate readout', () => {
    expect(samePredrawnGenerationFrame(frame, { ...frame })).toBe(true);
    expect(samePredrawnGenerationFrame(frame, { ...frame, x: frame.x + 1 })).toBe(false);
    expect(samePredrawnGenerationFrame(undefined, undefined)).toBe(true);
    expect(samePredrawnGenerationFrame(frame, undefined)).toBe(false);
    expect(predrawnGenerationFrameReadout(frame)).toBe('1248 × 702 · origin -528, -99');
  });
});
