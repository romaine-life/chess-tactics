// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_BY_ID,
  RUN_CARD_DECK,
  RUN_CARD_TYPE_REFERENCE,
  RUN_STARTER_CARD_BY_ID,
  createRunCardOffer,
} from '../run/model';
import {
  runCardFaceContent,
  runCardFrameSlot,
  runCardFrameSlotForType,
  runCardSpecimen,
} from './runCardFaceContent';

const projectionSource = readFileSync(new URL('./runCardFaceContent.ts', import.meta.url), 'utf8');
const faceSource = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('the Run card face has exactly one constructor', () => {
  it('is the only module that mints a face, and nothing else declares the brand', () => {
    expect(projectionSource).toContain('declare const RUN_CARD_FACE_PROJECTION: unique symbol');
    // The brand is never exported, so no other module can name it, and the single cast
    // below is the only place a face comes into existence.
    expect(projectionSource).not.toMatch(/export[^\n]*RUN_CARD_FACE_PROJECTION/);
    expect(projectionSource.match(/as RunCardFaceContent/g) ?? []).toHaveLength(1);

    const offenders = sourceFiles(srcRoot)
      .filter((path) => !/runCardFaceContent\.(ts|test\.ts)$/.test(path))
      .filter((path) => /RUN_CARD_FACE_PROJECTION|as RunCardFaceContent\b/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('offers no slot a synthesized ability sentence could occupy', () => {
    // The removed field, its renderer, its aria projection and its CSS all go together;
    // leaving any one of them behind is how the last copy grew back (ADR-0305).
    for (const source of [projectionSource, faceSource]) {
      expect(source).not.toMatch(/\bproperties\??:/);
      expect(source).not.toMatch(/\brules\??:/);
    }
    expect(faceSource).not.toContain('run-card-prototype-properties');
    expect(styleCss).not.toContain('run-card-prototype-properties');
    expect(styleCss).not.toContain('run-card-prototype-property ');

    const face = runCardFaceContent(runCardSpecimen({ pieces: ['pawn', 'knight'], cardType: 'hieratic' }));
    expect(Object.keys(face).sort()).toEqual(['cardProperty', 'cost', 'flavor', 'grants', 'name', 'typeLine']);
  });
});

describe('a projected face says only what its card actually shows', () => {
  it('hides every drawn acquisition target uniformly, and reveals it uniformly', () => {
    // Tactical was already correct; the point of the projection is that the other three
    // cannot answer this question differently from it.
    for (const cardType of ['legatine', 'hieratic', 'concinnous'] as const) {
      const multi = runCardSpecimen({ pieces: ['pawn', 'pawn', 'pawn', 'knight'], cardType, effectTargetIndex: 2 });
      const hidden = runCardFaceContent(multi);
      expect(hidden.grants.every((grant) => !grant.ability)).toBe(true);

      const revealed = runCardFaceContent(multi, { adlected: true });
      const marked = revealed.grants.filter((grant) => grant.ability);
      expect(marked).toHaveLength(1);
      expect(marked[0].ability.state).toBe(RUN_CARD_TYPE_REFERENCE[cardType].grants);
      expect(marked[0].ability.index).toBeLessThan(marked[0].count);
    }
  });

  it('shows a forced one-unit target before Adlectio, because it was never hidden', () => {
    for (const cardType of ['legatine', 'hieratic'] as const) {
      const forced = runCardFaceContent(runCardSpecimen({ pieces: ['queen'], cardType }));
      expect(forced.grants[0].ability).toEqual({
        state: RUN_CARD_TYPE_REFERENCE[cardType].grants,
        index: 0,
      });
    }
  });

  it('marks the Cacochymic unit whether or not the card has been adlected', () => {
    const spec = { pieces: ['pawn', 'pawn', 'bishop'] as const, cardType: 'pestiferous' as const, cacochymicPieceIndex: 2 };
    for (const adlected of [false, true]) {
      const face = runCardFaceContent(runCardSpecimen(spec), { adlected });
      expect(face.grants.find((grant) => grant.unit === 'bishop').cacochymicIndices).toEqual([0]);
      expect(face.grants.every((grant) => !grant.ability)).toBe(true);
    }
  });

  it('prices and frames a specimen exactly as the Sectio would price and frame the same card', () => {
    const offer = createRunCardOffer({ seed: 17, ataraxiaTier: 0 }, RUN_CARD_BY_ID.q, 0, 0, 8, 8, 1);
    expect(offer.cardType).toBe('legatine');
    const specimen = runCardSpecimen({ pieces: RUN_CARD_BY_ID.q.pieces, cardType: 'legatine' });
    expect(specimen.cost).toBe(offer.cost);
    expect(runCardFrameSlot(specimen)).toBe(runCardFrameSlot(offer));
    expect(runCardFrameSlotForType(null)).not.toBe(runCardFrameSlotForType('hieratic'));
  });

  it('reserves the royal frame for Praecipuus and gives unqualified Front Lines the Standard frame', () => {
    const hisGrace = RUN_STARTER_CARD_BY_ID['his-grace'];
    const frontLines = RUN_STARTER_CARD_BY_ID['front-lines'];
    expect(runCardFrameSlot(hisGrace)).toBe(runCardFrameSlotForType('praecipuus'));
    expect(runCardFrameSlot(hisGrace)).not.toBe(runCardFrameSlotForType('hieratic'));
    expect(runCardFrameSlot(frontLines)).toBe(runCardFrameSlotForType(null));
    expect(runCardFrameSlot(frontLines)).not.toBe(runCardFrameSlot(hisGrace));
    expect(runCardFaceContent(frontLines).cardProperty).toBeUndefined();
  });

  it('names and illustrates every deck card from its composition alone', () => {
    for (const card of RUN_CARD_DECK.slice(0, 40)) {
      const face = runCardFaceContent(card);
      expect(face.typeLine).toBe('Units');
      expect(face.cost).toBe(card.value);
      expect(face.name.length).toBeGreaterThan(0);
      expect(face.grants.reduce((total, grant) => total + grant.count, 0)).toBe(card.pieces.length);
    }
  });

  it('keeps a dealt card identity while its transient contents empty for discard', () => {
    const identity = RUN_CARD_BY_ID.k;
    const emptied = { ...identity, pieces: [] };
    const face = runCardFaceContent(emptied, { identity });

    expect(face.name).toBe(runCardFaceContent(identity).name);
    expect(face.flavor).toBe(runCardFaceContent(identity).flavor);
    expect(face.cost).toBe(identity.value);
    expect(face.grants).toEqual([]);
  });
});
