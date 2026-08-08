import { describe, expect, it } from 'vitest';
import { RUN_CARD_BY_ID, RUN_CARD_DECK } from '../run/model';
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

  /**
   * The face draws the footprint alone and centres it, which it can only do because the rank a
   * formation is authored on is NOT card identity: the deck collapses cards by rotation and
   * translation, so a shape on the front rank and the same shape on the back rank are one card.
   * The straight run is the proof — it is authored entirely on the back rank and the deck holds
   * no front-rank twin of it. If that ever stopped being true, a centred diagram would start
   * printing two different cards identically, and this is the test that would say so.
   */
  it('deals one card per formation, whichever rank it is authored on', () => {
    const identity = new Map<string, string>();
    for (const card of RUN_CARD_DECK) {
      const cells = card.formation ?? [];
      const minX = Math.min(...cells.map((cell) => cell.x));
      const minY = Math.min(...cells.map((cell) => cell.y));
      const translated = cells
        .map((cell, index) => `${cell.x - minX}${cell.y - minY}${card.pieces[index]}`)
        .sort()
        .join('-');
      expect(identity.get(translated), `${card.id} repeats ${identity.get(translated)}`).toBeUndefined();
      identity.set(translated, card.id);
    }
    const straightRun = RUN_CARD_DECK.find((card) => card.id === 'f-01112131-kppp');
    expect(straightRun?.formation?.every((cell) => cell.y === 1)).toBe(true);
  });
});
