import { type ReactElement } from 'react';
import { paletteForSide, type UnitPalette } from '../core/pieces';
import { clientSide, clientSideOrder, type PlayingSide } from '../game/clientPerspective';
import { useSkirmish } from '../game/SkirmishStoreContext';
import { PIECE_VALUE, standingForceValue } from '../run/model';
import { PieceTypeIcon } from './shared/PieceTypeIcon';
import { TitleBarStatusTip } from './shell/TitleBarControls';

// What each army on the board is still worth, in Pawns — for every play surface that mounts a
// battlefield, the standalone Skirmish title bar and the Run's alike (ADR-0059: one primitive,
// not a second parallel readout).
//
// ONE box holding both forces, because material is one FACT — who is ahead, and by how much —
// and a comparison has to be read in a single glance (ADR-0580). The two numbers first sat in
// separate boxes flanking the battle clock, which kept the row symmetric about the clock and put
// the clock's whole width between the two things the reader is comparing. Proximity wins. The row
// gives up the clock being its midpoint rather than buying that back with an empty-widened
// objective chip: on a Battle route the stud the clock was aligned to draws nothing at all
// (measured), so the alignment was to an ornament the player cannot see. See style.css.
//
// It reads the mounted session store itself rather than taking totals as props, exactly as the
// clock does: a caller that had to supply both sides' points would be re-deriving the board.
//
// Each force's mark is a live Pawn sprite in that army's own palette, so the box says WHOSE
// number is whose without spending width on the words — and a Pawn is the right glyph twice
// over, because a Pawn is the 1 the whole scale is denominated in.

/** A board unit as the readout reads it — what it is worth, and what colours it is wearing. */
interface MaterialUnit {
  readonly side: string;
  readonly alive: boolean;
  readonly type: string;
  readonly promotedFrom?: string;
  readonly palette?: string;
}

export interface BattleMaterialForce {
  /** How this force relates to the person reading the bar. */
  relation: 'self' | 'opponent';
  /** This force's worth, in Pawns. */
  points: number;
  /** The palette this force is rendering in, so the mark matches the pieces it counts. */
  palette: UnitPalette;
}

export interface BattleMaterialReadout {
  /** Both forces, the reader's own first — `clientSideOrder`, never the board's own order. */
  forces: readonly [BattleMaterialForce, BattleMaterialForce];
  /** What a screen reader hears in place of the marks and their numbers. */
  label: string;
  /** The explanation, including where the reader stands. */
  detail: string;
}

/**
 * The scale, in the tooltip's words. Stated from `PIECE_VALUE` rather than typed out, so the
 * explanation cannot drift from the arithmetic it is explaining.
 */
function materialScaleSentence(): string {
  return `Pawn ${PIECE_VALUE.pawn}, Knight ${PIECE_VALUE.knight}, Bishop ${PIECE_VALUE.bishop}, `
    + `Rook ${PIECE_VALUE.rook}, Queen ${PIECE_VALUE.queen}. Kings and obstacles count nothing, `
    + 'and a promoted Pawn still counts as a Pawn.';
}

/** Where the reader stands, in one sentence — the whole reason the two numbers share a box. */
function marginSentence(mine: number, theirs: number): string {
  const margin = mine - theirs;
  if (margin === 0) return 'The two forces are level on material.';
  return margin > 0
    ? `You are ${margin} ahead on material.`
    : `You are ${-margin} behind on material.`;
}

/**
 * Both forces' readout, from the board and the seat this client commands.
 *
 * `localSide` is the seat rather than an assumption that the reader is the `player` faction: in a
 * lobby the guest commands `enemy`, and the reader's own force has to be the one they are actually
 * playing — in the ORDER as much as in the words, which is why `clientSideOrder` decides which
 * mark comes first instead of the board's own player-then-enemy order.
 */
export function battleMaterialReadout(
  pieces: readonly MaterialUnit[],
  localSide: PlayingSide,
): BattleMaterialReadout {
  const [mineSide, theirSide] = clientSideOrder(localSide);
  const force = (side: PlayingSide, relation: 'self' | 'opponent'): BattleMaterialForce => ({
    relation,
    points: standingForceValue(pieces, side),
    // The palette this army is actually wearing on the board, not the side default: an authored
    // level stamps its own colours, and the mark has to match the pieces it is counting.
    palette: paletteForSide(side, pieces.find((piece) => piece.side === side && piece.alive)?.palette),
  });
  const mine = force(mineSide, 'self');
  const theirs = force(theirSide, 'opponent');
  const margin = marginSentence(mine.points, theirs.points);
  return {
    forces: [mine, theirs],
    label: `Material. Yours ${mine.points} ${mine.points === 1 ? 'Pawn' : 'Pawns'}, `
      + `opponent ${theirs.points}. ${margin}`,
    detail: `What each force on the board is still worth, counted in Pawns — yours first. `
      + `${materialScaleSentence()} ${margin}`,
  };
}

export function BattleMaterialChip({ fillSurface }: { fillSurface?: string } = {}): ReactElement {
  const pieces = useSkirmish((s) => s.game.pieces);
  const net = useSkirmish((s) => s.net);
  const readout = battleMaterialReadout(pieces, clientSide(net));
  return (
    <TitleBarStatusTip
      className="skirmish-status-chip skirmish-material"
      fillSurface={fillSurface}
      label={readout.label}
      name="Material"
      detail={readout.detail}
      // Material is a chess fact, not a Run mechanic; its own words would raise a definition
      // pane under a readout whose tooltip already spells the whole scale out.
      explainMechanics={false}
    >
      {readout.forces.map((force) => (
        <span className={`skirmish-material-force skirmish-material-force--${force.relation}`} key={force.relation}>
          <span className="skirmish-material-mark" aria-hidden="true">
            <PieceTypeIcon type="pawn" palette={force.palette} />
          </span>
          <strong className="skirmish-material-points" data-testid={`battle-material-${force.relation}`}>
            {force.points}
          </strong>
        </span>
      ))}
    </TitleBarStatusTip>
  );
}
