import { describe, expect, it } from 'vitest';
import { RUN_CARD_BY_ID } from '../run/model';
import { runCardFaceContent, runCardFrameSlot } from './runCardFaceContent';
import { RUN_CARD_FRAME_SLOT } from './runCardFrameGeometry';

describe('shared Run card', () => {
  it('uses one frame and projects an authored formation', () => {
    const card = RUN_CARD_BY_ID['bb-diagonal'];
    expect(runCardFrameSlot(card)).toBe(RUN_CARD_FRAME_SLOT);
    expect(runCardFaceContent(card).formation.map(({ unit, x, y }) => ({ unit, x, y }))).toEqual([
      { unit: 'bishop', x: 0, y: 0 },
      { unit: 'bishop', x: 1, y: 1 },
    ]);
  });
});
