// Which squares on the deployment board belong to which formation card.
//
// The card face already answers "are these units one thing?": it prints its units on a single
// connected plot and wraps that plot in ONE outline, because a line between two occupied seats
// reads as a grid rather than as a body (see runCardFormationBoardCells). The board used to drop
// that answer the moment a formation left the hand — seven pieces along the band read as seven
// pieces, and the one thing that said otherwise was the cursor turning to grab.
//
// Nothing here is persisted. The grouping is already in the document twice over — a card's
// `unitSeats` name its units for the life of the card, and `deployment.placements` names the
// square each unit stands on — so this is a projection, not a new field, and no save version
// moves for it.

import { arrangedDeploymentCards } from '../run/deployment';
import { runCardUnitIds, type RunDocument } from '../run/model';
import { runCardFormationBoardCells, type RunCardFormationEdge } from './RunCardFace';

/**
 * How many liveries the board cycles through.
 *
 * A Battle deals three cards, four while the Quartermaster's Ledger is held, so this is never
 * reached in play; it exists so a hand longer than the palette wraps rather than losing its
 * colour. Marking every block identically only says "these squares are spoken for" — it does not
 * say WHICH body holds them, which is the half-answer a shared banner gives.
 */
export const RUN_FORMATION_LIVERY_COUNT = 6;

export type SeatedFormationSquare = Readonly<{
  cardId: string;
  /** Where this card sits in the dealt hand — the only stable per-formation ordinal on screen. */
  groupIndex: number;
  /** The sides of this square that face off ITS OWN formation. The line is drawn on these only. */
  edges: readonly RunCardFormationEdge[];
}>;

const cellKey = (cell: Readonly<{ x: number; y: number }>): string => `${cell.x},${cell.y}`;

/**
 * The block a set of squares makes, keyed by square.
 *
 * One solver for the formation in hand and the formation on the ground, because they are the same
 * body at two moments. Since ADR-0533 a seated formation is a PLAN drawn at the same strength as
 * the one on the cursor, so anything that says "this is one block" has to say it in both places or
 * it says the block is created by letting go of it.
 */
export function formationBlockSquares(
  cells: readonly Readonly<{ x: number; y: number }>[],
): Map<string, readonly RunCardFormationEdge[]> {
  return new Map(runCardFormationBoardCells(cells).map((cell) => [cellKey(cell), cell.edges]));
}

/**
 * The board with the formation in the player's HAND taken off it.
 *
 * A picked-up formation is not on the battlefield in any sense the screen cares about: it holds no
 * square, wraps no plot, and frees the ground it stood on, exactly as it did before it was ever
 * placed. Drawing it at its old seats as well as on the cursor painted the same formation twice
 * over and left the player unable to tell which of the two they were deciding about.
 *
 * The Run document keeps the placement, so putting the formation down is an ordinary placement and
 * walking away without placing it restores the seat it came from. Nothing is persisted for the
 * hand, so no save version moves.
 */
export function deploymentLayoutInHand<T extends { placements: Readonly<Record<string, unknown>> }>(
  layout: T,
  unitIdsInHand: readonly string[],
): T {
  if (!unitIdsInHand.length) return layout;
  const inHand = new Set(unitIdsInHand);
  return {
    ...layout,
    placements: Object.fromEntries(
      Object.entries(layout.placements).filter(([unitId]) => !inHand.has(unitId)),
    ),
  };
}

/**
 * Every square held by a formation ALREADY on the board, keyed by square.
 *
 * A formation counts once all of its units are seated, which is how `arrangedDeploymentCards`
 * already defines placed — a half-seated card is mid-gesture and has no shape to wrap yet. The
 * card in the player's hand is not among them: it is not on the ground to be wrapped.
 */
export function seatedFormationsBySquare(
  run: RunDocument,
  cardInHandId: string | null = null,
): Map<string, SeatedFormationSquare> {
  const placements = run.deployment?.placements ?? {};
  const seated = new Map<string, SeatedFormationSquare>();
  arrangedDeploymentCards(run).forEach(({ card, placed }, groupIndex) => {
    if (!placed || card.id === cardInHandId) return;
    const squares = runCardUnitIds(card)
      .map((unitId) => placements[unitId])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => {
        const [x, y] = value.split(',').map(Number);
        return { x, y };
      })
      .filter((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y));
    if (!squares.length) return;
    // The card's own edge solver, fed the squares the formation actually took. A formation is
    // authored orthogonally connected and is placed by rigid translation and rotation, so the
    // shape on the ground is the shape on the card and this is one closed outline.
    for (const [key, edges] of formationBlockSquares(squares)) {
      seated.set(key, { cardId: card.id, groupIndex, edges });
    }
  });
  return seated;
}
