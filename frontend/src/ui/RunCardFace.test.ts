import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUN_CARD_BY_ID } from '../run/model';
import { runCardFaceContent } from './runCardFaceContent';
import {
  requiredRunCardImageKinds,
  runCardFormationBoardCells,
  runCardFormationIsoPoint,
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

  it('places every figure on its authored isometric board seat', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(styles).toMatch(/\.run-card-formation-cell,[\s\S]*?inset-block-start:\s*var\(--run-card-formation-top\)/);
    expect(styles).toMatch(/\.run-card-formation-cell,[\s\S]*?inset-inline-start:\s*var\(--run-card-formation-left\)/);
    expect(styles).toMatch(/\.run-card-formation-cell,[\s\S]*?transform:\s*translate\(var\(--run-card-unit-anchor-x\),\s*var\(--run-card-unit-anchor-y\)\)/);
    const source = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
    expect(source).toContain("`var(--unit-anchor-x-${piece.unit}, -50%)`");
    expect(source).toContain("`var(--unit-anchor-y-${piece.unit}, -78%)`");
  });

  it('prints the card footprint alone, with the cluster silhouette on its outward edges', () => {
    const cells = runCardFormationBoardCells([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect(cells).toEqual([
      { x: 0, y: 0, dark: false, edges: ['north', 'south', 'west'] },
      { x: 1, y: 0, dark: true, edges: ['north', 'east'] },
      { x: 1, y: 1, dark: false, edges: ['east', 'south', 'west'] },
    ]);
  });

  it('never prints a board square the card does not occupy', () => {
    for (const definition of Object.values(RUN_CARD_BY_ID)) {
      const seats = runCardFaceContent(definition).formation;
      const cells = runCardFormationBoardCells(seats);
      expect(cells).toHaveLength(new Set(seats.map((seat) => `${seat.x}:${seat.y}`)).size);
      for (const cell of cells) {
        expect(seats.some((seat) => seat.x === cell.x && seat.y === cell.y)).toBe(true);
      }
    }
  });

  it('draws the outward edges heavy and the shared seams faint', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const seam = /\.run-card-formation-square polygon\s*\{[\s\S]*?stroke-width:\s*([\d.]+)/.exec(styles);
    const silhouette = /\.run-card-formation-silhouette\s*\{[\s\S]*?stroke-width:\s*([\d.]+)/.exec(styles);
    expect(Number(seam?.[1])).toBeGreaterThan(0);
    expect(Number(silhouette?.[1])).toBeGreaterThan(Number(seam?.[1]));
    expect(styles).not.toMatch(/\.run-card-formation-square\.is-faded/);
  });

  it('uses the battlefield projection and the player army facing', () => {
    expect(runCardFormationIsoPoint(0, 0)).toEqual({ left: 0, top: 0, depth: 0 });
    expect(runCardFormationIsoPoint(1, 0)).toMatchObject({
      left: expect.closeTo(5.76),
      top: expect.closeTo(3.24),
      depth: 1,
    });
    expect(runCardFormationIsoPoint(0, 1)).toMatchObject({
      left: expect.closeTo(-5.76),
      top: expect.closeTo(3.24),
      depth: 1,
    });
    const source = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
    expect(source).toContain("defaultFacingForSide('player')");
  });
});
