import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUN_CARD_BY_ID } from '../run/model';
import { runCardFaceContent } from './runCardFaceContent';
import {
  requiredRunCardImageKinds,
  runCardFormationDisplayRow,
  runCardFormationGridCells,
  runCardContentCanUpdateWithoutMediaLoad,
  runCardPresentationCanPromote,
  runCardPresentationSignature,
  type RunCardImageKind,
} from './RunCardFace';

const card = runCardFaceContent(RUN_CARD_BY_ID['ppk-protected']);

describe('formation-only Run card face', () => {
  it('keys presentation identity by exact formation coordinates', () => {
    const signature = runCardPresentationSignature(card, '/frame.png', '/art.png');
    const shifted = { ...card, formation: card.formation.map((piece, index) => index === 0 ? { ...piece, y: piece.y + 1 } : piece) };
    expect(runCardPresentationSignature(shifted, '/frame.png', '/art.png')).not.toBe(signature);
  });

  it('waits for frame, coin, art, and every occupied formation figure', () => {
    expect(requiredRunCardImageKinds(card)).toEqual([
      'frame', 'coin', 'art', 'unit:0:knight:0', 'unit:1:pawn:0', 'unit:2:pawn:1',
    ]);
    const signature = runCardPresentationSignature(card, '/frame.png', '/art.png');
    const settled = new Set<RunCardImageKind>(requiredRunCardImageKinds(card));
    expect(runCardPresentationCanPromote(signature, signature, card, settled)).toBe(true);
    settled.delete('unit:2:pawn:1');
    expect(runCardPresentationCanPromote(signature, signature, card, settled)).toBe(false);
  });

  it('does not wait for an emptied seat', () => {
    const emptied = runCardFaceContent(RUN_CARD_BY_ID['ppk-protected'], { emptyPieceIndices: [1] });
    expect(requiredRunCardImageKinds(emptied)).not.toContain('unit:1:pawn:0');
    expect(runCardContentCanUpdateWithoutMediaLoad(card, emptied)).toBe(true);
  });

  it('has no card-property or unit-state presentation seam', () => {
    const source = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/RunAbility|cardProperty|unit-state|pestiferous|concinnous|legatine|hieratic/i);
    expect(source).toContain('<FormationDiagram');
  });

  it('places every figure in its authored formation grid cell', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(styles).toMatch(/\.run-card-formation-cell,[\s\S]*?grid-column:\s*calc\(var\(--run-card-formation-x\) \+ 1\)/);
    expect(styles).toMatch(/\.run-card-formation-cell,[\s\S]*?grid-row:\s*calc\(var\(--run-card-formation-y\) \+ 1\)/);
  });

  it('prints a complete square grid around the formation', () => {
    expect(runCardFormationGridCells(3, 2)).toEqual([
      { x: 0, y: 0, dark: false },
      { x: 1, y: 0, dark: true },
      { x: 2, y: 0, dark: false },
      { x: 0, y: 1, dark: true },
      { x: 1, y: 1, dark: false },
      { x: 2, y: 1, dark: true },
    ]);
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(styles).toMatch(/grid-template-columns:\s*repeat\(var\(--run-card-formation-columns\),\s*10\.8cqw\)/);
    expect(styles).toMatch(/grid-template-rows:\s*repeat\(var\(--run-card-formation-rows\),\s*10\.8cqw\)/);
    expect(styles).toMatch(/\.run-card-formation-extension path[\s\S]*?stroke:\s*currentColor/);
  });

  it('prints the front formation row above the back row', () => {
    expect(runCardFormationDisplayRow(0)).toBe(0);
    expect(runCardFormationDisplayRow(1)).toBe(1);
  });
});
