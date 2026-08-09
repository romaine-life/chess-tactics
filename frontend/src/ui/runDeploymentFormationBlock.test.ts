// @ts-nocheck -- source-structure guard alongside the behavioural checks; node built-ins are
// outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RUN_FORMATION_LIVERY_COUNT,
  formationBlockSquares,
  seatedFormationsBySquare,
} from './runDeploymentGrouping';

const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
const paint = readFileSync(new URL('./RunFormationGroupPaint.tsx', import.meta.url), 'utf8');
const appStyles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

const edgesAt = (block: Map<string, readonly string[]>, key: string): string[] => (
  [...(block.get(key) ?? [])].sort()
);

describe('the formation block', () => {
  // The whole point: a line BETWEEN two occupied squares reads as a grid rather than as a body,
  // so the shared edge is the one edge that must NOT be drawn.
  it('wraps a two-square formation instead of dividing it', () => {
    const block = formationBlockSquares([{ x: 3, y: 8 }, { x: 3, y: 9 }]);
    expect([...block.keys()].sort()).toEqual(['3,8', '3,9']);
    // (3,8) faces its sibling to the SOUTH, so it draws every side but that one.
    expect(edgesAt(block, '3,8')).toEqual(['east', 'north', 'west']);
    // (3,9) faces its sibling to the NORTH.
    expect(edgesAt(block, '3,9')).toEqual(['east', 'south', 'west']);
    // Every edge of the union is drawn exactly once, and the two shared halves are both dropped.
    const drawn = [...block.values()].flat().length;
    expect(drawn).toBe(6);
  });

  // His Grace is an L, which is the shape a bounding box would get wrong.
  it('follows a concave footprint rather than its bounding box', () => {
    const block = formationBlockSquares([{ x: 0, y: 8 }, { x: 1, y: 8 }, { x: 0, y: 9 }]);
    expect(edgesAt(block, '0,8')).toEqual(['north', 'west']);
    expect(edgesAt(block, '1,8')).toEqual(['east', 'north', 'south']);
    expect(edgesAt(block, '0,9')).toEqual(['east', 'south', 'west']);
    // The vacant corner (1,9) is not part of the block and gets no square of its own.
    expect(block.has('1,9')).toBe(false);
  });

  it('draws a lone square as a closed diamond', () => {
    expect(edgesAt(formationBlockSquares([{ x: 2, y: 2 }]), '2,2'))
      .toEqual(['east', 'north', 'south', 'west']);
  });

  it('has nothing to wrap when nothing is placed', () => {
    expect(formationBlockSquares([]).size).toBe(0);
  });
});

describe('seated formations', () => {
  const run = {
    army: [
      { id: 'u1', type: 'rook' }, { id: 'u2', type: 'rook' },
      { id: 'u3', type: 'bishop' }, { id: 'u4', type: 'pawn' },
    ],
    cards: [
      { id: 'card-a', coreId: 'rr-vertical', unitSeats: ['u1', 'u2'] },
      { id: 'card-b', coreId: 'pb-front', unitSeats: ['u3', 'u4'] },
    ],
    deployment: {
      dealtCardIds: ['card-a', 'card-b'],
      deployingUnitIds: ['u1', 'u2', 'u3', 'u4'],
      placements: { u1: '3,8', u2: '3,9', u3: '5,8' },
    },
  };

  it('names each square for the card that seated it', () => {
    const seated = seatedFormationsBySquare(run);
    expect(seated.get('3,8')?.cardId).toBe('card-a');
    expect(seated.get('3,9')?.cardId).toBe('card-a');
    // Both squares of one card share a livery, and a different card does not.
    expect(seated.get('3,8')?.groupIndex).toBe(seated.get('3,9')?.groupIndex);
  });

  // A card mid-gesture has no shape yet: half of it is still in the player's hand.
  it('ignores a card that is only partly seated', () => {
    expect(seatedFormationsBySquare(run).has('5,8')).toBe(false);
  });

  it('reads placements without a deployment', () => {
    expect(seatedFormationsBySquare({ ...run, deployment: undefined }).size).toBe(0);
  });
});

describe('the block is drawn in hand as well as on the ground', () => {
  // ADR-0533: a seated formation is a PLAN drawn at the same strength as the one on the cursor.
  // A block that appeared only on release would say the block is made by letting go of it.
  it('solves the carried footprint with the same solver as the seated one', () => {
    expect(runScreen).toContain('const carriedFormationBlock = useMemo(() => formationBlockSquares(');
    expect(runScreen).toContain('Object.values(pointedArrangementOption?.placements ?? {}),');
    expect(runScreen).toContain('const carriedEdges = carriedFormationBlock.get(cellKey) ?? null;');
    // One paint for both, chosen by whichever block owns the square.
    expect(runScreen).toContain('{block ? <RunFormationGroupPaint edges={block.edges} /> : null}');
    expect(runScreen).toContain("carriedEdges ? 'is-formation-carried' : ''");
  });

  // The carried block keeps the livery it will hold once seated, so the colour does not change
  // under the player's hand at the moment they commit it.
  it('gives the carried block the livery of its place in the hand', () => {
    expect(runScreen).toContain(
      'const carriedGroupIndex = arrangementCards.findIndex(({ card }) => card.id === selectedCardId);',
    );
    expect(runScreen).toContain('block.groupIndex % RUN_FORMATION_LIVERY_COUNT');
    expect(appStyles).toContain('.run-deployment-cell.is-formation-carried .run-formation-group-plot {');
    // Carried lifts the GROUND only; the line stays the formation's own colour.
    const carried = appStyles.match(
      /\.run-deployment-cell\.is-formation-carried \.run-formation-group-plot \{[^}]*\}/,
    )?.[0];
    expect(carried).toContain('--run-formation-livery-carried');
    expect(carried).not.toContain('stroke:');
  });

  it('has a livery for every slot the cycle can produce', () => {
    for (let index = 0; index < RUN_FORMATION_LIVERY_COUNT; index += 1) {
      expect(appStyles).toContain(`.run-deployment-cell[data-formation-index='${index}']`);
    }
    // A Battle deals three, four while the Quartermaster's Ledger is held.
    expect(RUN_FORMATION_LIVERY_COUNT).toBeGreaterThanOrEqual(4);
  });
});

describe('the block boundary survives the square it is drawn in', () => {
  // The line sits ON the tile edge and the square is clipped to exactly that edge, so a centred
  // stroke loses its outer half. Both strokes are drawn at twice weight and halved by the clip;
  // insetting instead would break the outline into per-square arcs at every corner.
  it('draws the boundary at twice its visible weight, under a dark carrier', () => {
    expect(appStyles).toContain('.skirmish-board-cell-hit {');
    expect(appStyles).toContain('clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);');
    const under = appStyles.match(/\.run-formation-group-edge-under \{[^}]*\}/)?.[0];
    const line = appStyles.match(/\n\.run-formation-group-edge \{[^}]*\}/)?.[0];
    expect(under).toContain('stroke-width: 12;');
    expect(line).toContain('stroke-width: 6;');
    // Screen-pixel widths, so the visible weight does not change with board zoom.
    expect(paint).toContain('vectorEffect="non-scaling-stroke"');
  });

  // The board already draws a dark line on every tile edge, so the livery must ride the LIGHT
  // stroke or the block is camouflaged by the grid it is meant to be read against.
  it('puts the livery on the light stroke and keeps a dark carrier under it', () => {
    const line = appStyles.match(/\n\.run-formation-group-edge \{[^}]*\}/)?.[0];
    expect(line).toContain('stroke: var(--run-formation-livery-line');
    expect(appStyles.match(/\.run-formation-group-edge-under \{[^}]*\}/)?.[0])
      .toMatch(/stroke: rgba\(2[0-9], /);
  });

  // Under the band paint's own layer and under the pieces the canvas draws.
  it('paints over the band and beneath the figures', () => {
    expect(appStyles).toMatch(/\.run-formation-group-paint \{[^}]*z-index: 2;/);
  });
});

describe('nothing is persisted for the block', () => {
  // The grouping is already in the document twice over: unitSeats for the life of the card, and
  // placements for the Battle. A new field would move the Run save version and the server's
  // closed-set validator with it.
  it('is a projection of the card seats and the committed placements', () => {
    const source = readFileSync(new URL('./runDeploymentGrouping.ts', import.meta.url), 'utf8');
    expect(source).toContain('run.deployment?.placements');
    expect(source).toContain('runCardUnitIds(card)');
    expect(source).not.toContain('setDeploymentChoices');
    expect(source).not.toContain('formationPlans');
    // The card face's own edge solver, not a second one that could disagree with it.
    expect(source).toContain("import { runCardFormationBoardCells");
  });
});
