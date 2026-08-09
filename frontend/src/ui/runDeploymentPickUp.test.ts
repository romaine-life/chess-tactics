// @ts-nocheck -- source-structure guard alongside the behavioural checks; node built-ins are
// outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deploymentLayoutInHand, seatedFormationsBySquare } from './runDeploymentGrouping';

const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');

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
    placements: { u1: '3,8', u2: '3,9', u3: '5,8', u4: '5,9' },
  },
};

describe('a formation in hand is off the board', () => {
  // ADR-0526 lets a seated formation be picked back up; ADR-0533 draws a seated formation at
  // exactly the strength the carried one is drawn at. Together they painted the SAME formation
  // twice over the moment one was repositioned, and neither copy said which was being decided.
  // Picking one up takes it off the board entirely, so moving a formation looks exactly like
  // placing it for the first time.
  it('takes the held formation out of the drawn position', () => {
    const layout = { placements: { u1: { x: 3, y: 8 }, u2: { x: 3, y: 9 }, u3: { x: 5, y: 8 } } };
    expect(Object.keys(deploymentLayoutInHand(layout, ['u1', 'u2']).placements)).toEqual(['u3']);
    // Every other field of the layout survives being handed back.
    const full = { placements: { u1: { x: 0, y: 0 } }, temporaryRocks: [{ x: 1, y: 1 }] };
    expect(deploymentLayoutInHand(full, ['u1'])).toEqual({ placements: {}, temporaryRocks: [{ x: 1, y: 1 }] });
  });

  it('hands an empty hand straight back', () => {
    const layout = { placements: { u1: { x: 3, y: 8 } } };
    expect(deploymentLayoutInHand(layout, [])).toBe(layout);
  });

  // The plot goes with the pieces. A block left behind would say the formation is still standing
  // there, which is the half-measure a faint outline makes.
  it('wraps no plot for the formation in hand', () => {
    expect([...seatedFormationsBySquare(run).values()].map(({ cardId }) => cardId))
      .toEqual(expect.arrayContaining(['card-a', 'card-b']));
    const held = seatedFormationsBySquare(run, 'card-a');
    expect(held.has('3,8')).toBe(false);
    expect(held.has('3,9')).toBe(false);
    // The formations still on the ground are untouched.
    expect(held.get('5,8')?.cardId).toBe('card-b');
  });
});

describe('what counts as being in hand', () => {
  // An unplaced card is in hand by definition; a placed one only once it has been picked up.
  it('is an unplaced card, or a placed one the player picked up', () => {
    expect(runScreen).toContain(
      'const cardInHandId = selectedArrangementCard && (!selectedArrangementCard.placed || heldFormationCardId)',
    );
    expect(runScreen).toContain('const heldFormationCardId = heldCardId === selectedCardId ? heldCardId : null;');
  });

  // Placing the last card of a hand leaves it SELECTED. It is standing on the board, so it must
  // not also be following the cursor — which is the same duplicate, arrived at from the other end.
  it('releases the formation when it is put down', () => {
    expect(runScreen).toContain('setHeldCardId(null);');
    expect(runScreen).toMatch(/const following = nextArrangedCardToPlace\(placed, cardInHandId\);\s*if \(following\) \{\s*setSelectedCardId\(following\);\s*setHeldCardId\(following\);/);
  });

  // Everything the carry gesture paints belongs to a card in hand (ADR-0526: the band is painted
  // whenever a formation is in hand), so a resting formation paints none of it.
  it('gates the band, the reachable squares, the turns and the carry on it', () => {
    expect(runScreen).toContain('cardInHandId ? openDeploymentBandCells(prepared, level, cardInHandId) : []');
    expect(runScreen).toContain('? arrangedCardPlaceableCells(prepared, level, cardInHandId, arrangementRotation)');
    expect(runScreen).toContain('cardInHandId ? placeableCardRotations(prepared, level, cardInHandId) : []');
    expect(runScreen).toContain('? turnedCardPlacement(prepared, level, cardInHandId, arrangementRotation, heldAnchor, pointedCell)');
    expect(runScreen).toContain('turn: arranging && selectedArrangementCard?.admitted && cardInHandId ? turnArrangement : null');
  });

  // The document still records where the held formation stood, so its own old squares must read
  // as ground to place on rather than as a formation to pick up again.
  it('lets the held formation be put back down on its own squares', () => {
    expect(runScreen).toContain('if (standing && standing !== heldFormationCardId) {');
    expect(runScreen).toContain('if (!placed || card.id === heldFormationCardId) continue;');
  });

  // A fallback selection is the hand losing a card, not the player reaching for one.
  it('does not pick a formation up merely because the selection fell back to it', () => {
    expect(runScreen).toMatch(/\?\? null\);\s*\/\/ Falling back to a card because the last one went away[\s\S]*?setHeldCardId\(null\);/);
  });
});
