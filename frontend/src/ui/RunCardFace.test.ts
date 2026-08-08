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

  it('prints the card footprint alone, and lines only the edges that face off it', () => {
    const cells = runCardFormationBoardCells([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect(cells).toEqual([
      { x: 0, y: 0, dark: false, edges: ['north', 'south', 'west'] },
      { x: 1, y: 0, dark: true, edges: ['north', 'east'] },
      { x: 1, y: 1, dark: false, edges: ['east', 'south', 'west'] },
    ]);
  });

  /**
   * A seat shared with another occupied seat carries no line. Every shared edge is named by both
   * of its seats, so the check is that neither one draws it: one drawn side would print a seam
   * down the middle of the cluster, which is the grid reading the card is meant to be free of.
   */
  it('draws no line between two occupied seats', () => {
    const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' } as const;
    const step = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] } as const;
    for (const definition of Object.values(RUN_CARD_BY_ID)) {
      const cells = runCardFormationBoardCells(runCardFaceContent(definition).formation);
      const at = new Map(cells.map((cell) => [`${cell.x}:${cell.y}`, cell]));
      for (const cell of cells) {
        for (const edge of ['north', 'east', 'south', 'west'] as const) {
          const [dx, dy] = step[edge];
          const neighbour = at.get(`${cell.x + dx}:${cell.y + dy}`);
          if (!neighbour) continue;
          expect(cell.edges, `${definition.id} lines a shared edge`).not.toContain(edge);
          expect(neighbour.edges, `${definition.id} lines a shared edge`).not.toContain(opposite[edge]);
        }
      }
    }
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

  /**
   * The Settings board-grid style is a BATTLEFIELD choice. A card is printed matter — its diagram
   * is drawn at a fixed size in ink that belongs to the card, and it must look the same on every
   * account whatever grid the player runs. The style ships as three inherited custom properties on
   * :root, so a card rule that read one would silently join that setting; state the card's own
   * values literally and this cannot happen by accident.
   */
  it('draws its own squares, never the board-grid style setting', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const cardRules = [...styles.matchAll(/(\.run-card-formation[^{}]*)\{([^}]*)\}/g)];
    expect(cardRules.length).toBeGreaterThan(0);
    for (const [, selector, body] of cardRules) {
      expect(`${selector}${body}`).not.toMatch(/--board-grid-|data-board-grid-style/);
    }
  });

  // Hiding the vacant squares is the whole change. The square itself keeps the exact line and
  // fill it has always had, so a card the player already knows is not repainted underneath them.
  /**
   * The line moved off the polygon and onto the outward edges, but it is the SAME line. Its colour
   * and weight are the ones the card has always printed, so a player who knows these cards sees
   * the shape wrapped rather than the ink changed.
   */
  it('wraps the footprint in the line the square has always carried', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(styles).toMatch(/\.run-card-formation-square polygon\s*\{\s*fill:\s*rgba\(212, 196, 161, \.46\);\s*\}/);
    expect(styles).toMatch(/\.run-card-formation-square\.is-dark polygon\s*\{\s*fill:\s*rgba\(101, 115, 113, \.34\);/);
    const outline = /\.run-card-formation-outline\s*\{([^}]*)\}/.exec(styles)?.[1] ?? '';
    expect(outline).toContain('stroke: rgba(55, 48, 39, .56);');
    expect(outline).toContain('stroke-width: 1.15;');
    // The seats must not carry a second line of their own, or the seam comes back.
    expect(styles).not.toMatch(/\.run-card-formation-square polygon\s*\{[^}]*stroke:/);
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
