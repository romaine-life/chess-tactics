// Which squares on the deployment board belong to which formation card.
//
// The card face already answers "are these units one thing?": it prints its units on a single
// connected plot and wraps that plot in ONE outline, because a line between two occupied seats
// reads as a grid rather than as a body (see runCardFormationBoardCells). The board drops that
// answer the moment a formation is seated — seven pieces along the band read as seven pieces.
//
// Nothing here is persisted. The grouping is already in the document twice over — a card's
// `unitSeats` name its units for the life of the card, and `deployment.placements` names the
// square each unit stands on — so this is a projection, not a new field, and no save version
// moves for it.

import { arrangedDeploymentCards } from '../run/deployment';
import { runCardUnitIds, type RunDocument } from '../run/model';
import { runCardFormationBoardCells, type RunCardFormationEdge } from './RunCardFace';

/**
 * How a seated formation is told apart from the ground and from its neighbours.
 *
 * Review-only, chosen by `?group=` on the Run address, so each candidate is a link that lands on
 * the same crafted board with a different answer painted on it.
 */
export type RunFormationGroupTreatment =
  | 'off'
  | 'outline'
  | 'plot'
  | 'heraldry'
  | 'tether'
  | 'hover';

export const RUN_FORMATION_GROUP_TREATMENTS: readonly RunFormationGroupTreatment[] = Object.freeze([
  'off', 'outline', 'plot', 'heraldry', 'tether', 'hover',
]);

/** Human labels for the review switcher; the id is what the address carries. */
export const RUN_FORMATION_GROUP_TREATMENT_LABEL:
Readonly<Record<RunFormationGroupTreatment, string>> = Object.freeze({
  off: 'Off (today)',
  outline: 'Outline',
  plot: 'Plot',
  heraldry: 'Plot + colours',
  tether: 'Tether',
  hover: 'On hover',
});

export function runFormationGroupTreatment(search: string): RunFormationGroupTreatment {
  const value = new URLSearchParams(search).get('group');
  return RUN_FORMATION_GROUP_TREATMENTS.find((treatment) => treatment === value) ?? 'off';
}

export type SeatedFormationSquare = Readonly<{
  cardId: string;
  /** Where this card sits in the dealt hand — the only stable per-formation ordinal on screen. */
  groupIndex: number;
  /** The sides of this square that face off ITS OWN formation. The line is drawn on these only. */
  edges: readonly RunCardFormationEdge[];
  /** The squares of this same formation, for the tether and for a whole-group hover. */
  siblings: readonly string[];
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
 * Every square held by a formation ALREADY on the board, keyed by square.
 *
 * A formation counts once all of its units are seated, which is how `arrangedDeploymentCards`
 * already defines placed — a half-seated card is mid-gesture and has no shape to wrap yet.
 */
export function seatedFormationsBySquare(run: RunDocument): Map<string, SeatedFormationSquare> {
  const placements = run.deployment?.placements ?? {};
  const seated = new Map<string, SeatedFormationSquare>();
  arrangedDeploymentCards(run).forEach(({ card, placed }, groupIndex) => {
    if (!placed) return;
    const squares = runCardUnitIds(card)
      .map((unitId) => placements[unitId])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => {
        const [x, y] = value.split(',').map(Number);
        return { x, y };
      })
      .filter((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y));
    if (!squares.length) return;
    const siblings = squares.map(cellKey);
    // The card's own edge solver, fed the squares the formation actually took. A formation is
    // authored orthogonally connected and is placed by rigid translation and rotation, so the
    // shape on the ground is the shape on the card and this is one closed outline.
    for (const [key, edges] of formationBlockSquares(squares)) {
      seated.set(key, { cardId: card.id, groupIndex, edges, siblings });
    }
  });
  return seated;
}
