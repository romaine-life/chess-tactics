import { describe, expect, it } from 'vitest';
import { RUN_CARD_BY_ID } from '../run/model';
import { runCardFormationRows } from './RunCardFace';
import { runCardFaceContent, runCardFrameSlot } from './runCardFaceContent';
import { RUN_CARD_FRAME_SLOT } from './runCardFrameGeometry';

describe('shared Run card', () => {
  it('uses one frame and projects an authored formation', () => {
    expect(runCardFrameSlot(RUN_CARD_BY_ID.ppp)).toBe(RUN_CARD_FRAME_SLOT);
    // Crooked Diocese is Uncommon on its material, so it proves the projection rather than
    // the base frame -- its two seats are the diagonal the face has to draw honestly.
    const card = RUN_CARD_BY_ID['bb-diagonal'];
    expect(runCardFaceContent(card).formation.map(({ unit, x, y }) => ({ unit, x, y }))).toEqual([
      { unit: 'bishop', x: 0, y: 0 },
      { unit: 'bishop', x: 1, y: 1 },
    ]);
  });

  it('keeps an empty deployment row visible so singleton front and back cards differ', () => {
    expect(runCardFormationRows([{ y: 0 }])).toBe(2);
    expect(runCardFormationRows([{ y: 1 }])).toBe(2);
  });
});
