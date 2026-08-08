import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TILE_TEMPLATE } from '@chess-tactics/board-render';
import { RUN_CARD_BY_ID, RUN_CARD_DECK } from '../run/model';
import { runCardFaceContent } from './runCardFaceContent';
import {
  RUN_CARD_FORMATION_EDGE_LINE,
  RUN_CARD_FORMATION_FIGURE,
  RUN_CARD_FORMATION_ISO_TILE,
  RUN_CARD_FORMATION_TILE_POINTS,
  RUN_CARD_FORMATION_TILE_VIEW_BOX,
  requiredRunCardImageKinds,
  runCardFormationBoardCells,
  runCardFormationMetrics,
  runCardFormationOutlineRings,
  runCardFormationIsoPoint,
  runCardContentCanUpdateWithoutMediaLoad,
  runCardPresentationCanPromote,
  runCardPresentationSignature,
  type RunCardImageKind,
} from './RunCardFace';
import { RUN_CARD_FORMATION_MAX_SCALE_COMMITTED } from './runCardFormationFit';

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
    expect(styles).toMatch(/\.run-card-formation-cell,[\s\S]*?inset-block-start:\s*calc\(var\(--run-card-formation-unit\) \* var\(--run-card-formation-top\)\)/);
    expect(styles).toMatch(/\.run-card-formation-cell,[\s\S]*?inset-inline-start:\s*calc\(var\(--run-card-formation-unit\) \* var\(--run-card-formation-left\)\)/);
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

  /**
   * The boundary is ONE closed ring per footprint, traced in the diagram's own space.
   *
   * Drawn as separate segments inside separate per-seat SVGs, each rasterizes on its own sub-pixel
   * grid, so corners jog and edges antialias to different weights. One ring is what lets the
   * rasterizer mitre the corners instead of reproducing a coincidence.
   */
  it('traces every dealt footprint as a single closed outline', () => {
    const origin = { minLeft: 0, minTop: 0 };
    for (const definition of RUN_CARD_DECK) {
      const cells = runCardFormationBoardCells(runCardFaceContent(definition).formation);
      const rings = runCardFormationOutlineRings(cells, origin);
      // Every dealt formation is orthogonally connected, so its boundary is exactly one ring.
      expect(rings.map((ring) => ring.length), `${definition.id} is not one ring`).toHaveLength(1);
    }
  });

  /** Whatever the footprint, the rings consume every outward edge once and revisit no vertex. */
  it('spends each outward edge exactly once, even on a disconnected legacy footprint', () => {
    const origin = { minLeft: 0, minTop: 0 };
    for (const definition of Object.values(RUN_CARD_BY_ID)) {
      const cells = runCardFormationBoardCells(runCardFaceContent(definition).formation);
      const rings = runCardFormationOutlineRings(cells, origin);
      const drawn = rings.reduce((total, ring) => total + ring.length, 0);
      expect(drawn, `${definition.id} lost or repeated an edge`)
        .toBe(cells.reduce((total, cell) => total + cell.edges.length, 0));
      for (const ring of rings) {
        const visited = ring.map((point) => `${point.x.toFixed(4)}:${point.y.toFixed(4)}`);
        expect(new Set(visited).size, `${definition.id} doubled back`).toBe(visited.length);
      }
    }
    // The retired diagonals are the case that proves it: three seats touching at corners only.
    const scattered = runCardFormationBoardCells(runCardFaceContent(RUN_CARD_BY_ID['ppb-protected']).formation);
    expect(runCardFormationOutlineRings(scattered, origin)).toHaveLength(3);
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

  /**
   * A seat's diamond spans its whole cell, corner to corner.
   *
   * Neighbours step by exactly half a tile in each axis, so only a full-cell diamond tiles without
   * a gutter — and only a full-cell diamond has the board's own tile proportion. Inset points look
   * harmless while every seat strokes its own outline over the gap, then print a ragged edge and a
   * seam the moment the line moves to the footprint's boundary.
   */
  it('draws each seat as the whole tile, corner to corner', () => {
    const [width, height] = [TILE_TEMPLATE.topWidth, TILE_TEMPLATE.topHeight];
    expect(RUN_CARD_FORMATION_TILE_VIEW_BOX).toBe(`0 0 ${width} ${height}`);
    expect(RUN_CARD_FORMATION_TILE_POINTS)
      .toBe(`${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`);

    // Each named edge runs between two of those corners, and the four of them close the diamond.
    const corners = new Set([
      `${width / 2},0`, `${width},${height / 2}`, `${width / 2},${height}`, `0,${height / 2}`,
    ]);
    for (const [edge, [x1, y1, x2, y2]] of Object.entries(RUN_CARD_FORMATION_EDGE_LINE)) {
      expect(corners.has(`${x1},${y1}`), `${edge} starts off-corner`).toBe(true);
      expect(corners.has(`${x2},${y2}`), `${edge} ends off-corner`).toBe(true);
    }
    // A seat's half-tile step is what makes corner-to-corner tile seamlessly; if the projection
    // step and the tile size ever disagree, the outline gaps again.
    const step = runCardFormationIsoPoint(1, 0);
    expect(step.left).toBeCloseTo(RUN_CARD_FORMATION_ISO_TILE.width / 2);
    expect(step.top).toBeCloseTo(RUN_CARD_FORMATION_ISO_TILE.height / 2);
  });

  /**
   * The line moved off the polygon and onto the outward edges, but it is the SAME line. Its colour
   * and weight are the ones the card has always printed, so a player who knows these cards sees
   * the shape wrapped rather than the ink changed.
   */
  it('wraps the footprint in the line the square has always carried', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(styles).toMatch(/\.run-card-formation-square polygon\s*\{\s*fill:\s*rgba\(212, 196, 161, \.46\);\s*\}/);
    expect(styles).toMatch(/\.run-card-formation-square\.is-dark polygon\s*\{\s*fill:\s*rgba\(101, 115, 113, \.34\);/);
    const outline = /\.run-card-formation-outline path\s*\{([^}]*)\}/.exec(styles)?.[1] ?? '';
    expect(outline).toContain('stroke: rgba(55, 48, 39, .56);');
    expect(outline).toContain('stroke-width: 1.15;');
    // The seats must not carry a second line of their own, or the seam comes back.
    expect(styles).not.toMatch(/\.run-card-formation-square polygon\s*\{[^}]*stroke:/);
    expect(styles).not.toMatch(/\.run-card-formation-square\.is-faded/);
  });

  /**
   * The drawing is measured on the seats that are DRAWN, so it is centred on itself. Measuring the
   * enclosing columns-by-rows rectangle instead put every footprint that left a cell of it vacant
   * half a tile off centre — the lone seat to the right of the panel's middle, the four-seat run to
   * the left of it — because the vacant part is never painted.
   */
  it('measures the drawing it prints, so every footprint is centred on itself', () => {
    for (const definition of Object.values(RUN_CARD_BY_ID)) {
      const cells = runCardFormationBoardCells(runCardFaceContent(definition).formation);
      const metrics = runCardFormationMetrics(cells);
      const centres = cells.map((cell) => runCardFormationIsoPoint(cell.x, cell.y));
      const left = Math.min(...centres.map((point) => point.left));
      const right = Math.max(...centres.map((point) => point.left));
      const top = Math.min(...centres.map((point) => point.top));
      const bottom = Math.max(...centres.map((point) => point.top));
      // The seats' own middle sits at the middle of the board box, on both axes.
      expect((left + right) / 2 - metrics.minLeft, `${definition.id} is off centre across`)
        .toBeCloseTo((metrics.boardWidth - 1) * RUN_CARD_FORMATION_ISO_TILE.width / 2);
      expect((top + bottom) / 2 - metrics.minTop, `${definition.id} is off centre down`)
        .toBeCloseTo(
          (metrics.boardHeight - RUN_CARD_FORMATION_ISO_TILE.height / RUN_CARD_FORMATION_ISO_TILE.width)
          * RUN_CARD_FORMATION_ISO_TILE.width / 2,
        );
    }
  });

  /**
   * The extent the panel fits is the whole drawing, figures included. A figure stands well clear of
   * the seat it is anchored on, so measuring the seats alone would scale a diagram until its units
   * were clipped by the panel it was being fitted into.
   */
  it('measures the figures standing on the seats, not the seats alone', () => {
    const lone = runCardFormationMetrics([{ x: 0, y: 0 }]);
    // One seat, one figure: the drawing is exactly that figure.
    expect(lone.width).toBeCloseTo(RUN_CARD_FORMATION_FIGURE.width);
    expect(lone.height).toBeCloseTo(RUN_CARD_FORMATION_FIGURE.height);
    expect(lone.boardWidth).toBe(1);
    expect(lone.width).toBeGreaterThan(lone.boardWidth);
    expect(lone.height).toBeGreaterThan(lone.boardHeight);
    // The seats sit inside that extent, offset by the room the figures need around them.
    expect(lone.boardLeft).toBeCloseTo((RUN_CARD_FORMATION_FIGURE.width - 1) / 2);
    expect(lone.boardTop).toBeGreaterThan(0);
  });

  /**
   * A diagram that answered a piece's own scale would print a bigger board for a card granting a
   * pawn than for the same shape granting a queen. The tile is the board; it is measured at full
   * figure scale whatever stands on it.
   */
  it('sizes the board from the footprint alone, never from which piece stands on it', () => {
    const pawn = runCardFormationMetrics(
      runCardFormationBoardCells(runCardFaceContent(RUN_CARD_BY_ID.p).formation),
    );
    const queen = runCardFormationMetrics(
      runCardFormationBoardCells(runCardFaceContent(RUN_CARD_BY_ID.q).formation),
    );
    expect(pawn).toEqual(queen);
  });

  /**
   * The whole drawing scales by changing one length, so the fit is one division. A rule that still
   * carried a card-relative length inside the diagram would not scale with it.
   */
  it('draws every length as a multiple of the one tile the panel sizes', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const rules = [...styles.matchAll(/(\.run-card-formation(?:-(?:square|outline|cell|unit))?[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) {
      if (selector.includes('.run-card-formation-fit')) continue;
      // The one container measurement allowed inside the drawing is the one that DEFINES the
      // tile from the room it was given. Any other is a length that would not scale with it.
      const drawn = body.replace(/--run-card-formation-unit:[^;]*;/, '');
      expect(drawn, `${selector.trim()} carries a length the diagram cannot scale`)
        .not.toMatch(/\d(?:\.\d+)?cq[wh]/);
    }
    // The cap is stated on the fit box, where a committed tile still means a tile of the CARD.
    expect(styles).toMatch(/\.run-card-formation-fit\s*\{[^}]*container-type:\s*size/);
    expect(styles).toMatch(/max-inline-size:[\s\S]*?var\(--run-card-formation-max-scale, 1\.45\)/);
    expect(RUN_CARD_FORMATION_MAX_SCALE_COMMITTED).toBe(1.45);
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
