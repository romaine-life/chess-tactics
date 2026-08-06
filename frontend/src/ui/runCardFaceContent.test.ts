import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUN_CARD_BY_ID, RUN_STARTER_CARD_BY_ID, createRunCardOffer } from '../run/model';
import { runCardFaceContent, runCardFrameSlot, runCardSpecimen } from './runCardFaceContent';
import {
  RUN_CARD_CONCINNOUS_FRAME_SLOT,
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_HIERATIC_FRAME_SLOT,
} from './runCardFrameGeometry';

describe('the canonical formation card projection', () => {
  it('exposes only printed card facts', () => {
    const face = runCardFaceContent(runCardSpecimen({ pieces: ['pawn', 'pawn'] }));
    expect(Object.keys(face).sort()).toEqual(['cost', 'flavor', 'formation', 'grants', 'name', 'rarity', 'showsCost', 'typeLine']);
  });

  it('projects exact authored coordinates and empty seats', () => {
    const full = runCardFaceContent(RUN_CARD_BY_ID['ppk-protected']);
    expect(full.formation.map(({ unit, x, y, empty }) => ({ unit, x, y, empty }))).toEqual([
      { unit: 'knight', x: 1, y: 1, empty: false },
      { unit: 'pawn', x: 0, y: 0, empty: false },
      { unit: 'pawn', x: 2, y: 0, empty: false },
    ]);
    expect(runCardFaceContent(RUN_CARD_BY_ID['ppk-protected'], { emptyPieceIndices: [1] }).formation[1].empty).toBe(true);
  });

  it('prices offers plainly and projects rarity through the existing frames', () => {
    const offer = createRunCardOffer({ seed: 17 }, RUN_CARD_BY_ID.q, 0, 0);
    expect(offer.cost).toBe(RUN_CARD_BY_ID.q.value);
    expect(runCardFrameSlot(offer)).toBe(RUN_CARD_HIERATIC_FRAME_SLOT);
    expect(runCardFrameSlot(RUN_STARTER_CARD_BY_ID['his-grace'])).toBe(RUN_CARD_FRAME_SLOT);
    expect(runCardFrameSlot(runCardSpecimen({ pieces: ['rook'] }))).toBe(RUN_CARD_CONCINNOUS_FRAME_SLOT);
  });

  it('contains no ability projection branch', () => {
    const source = readFileSync(new URL('./runCardFaceContent.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/cardType|cardProperty|ability|cacochymic|adlected/i);
  });
});
