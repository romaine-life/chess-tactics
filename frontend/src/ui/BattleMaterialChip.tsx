import { type ReactElement } from 'react';
import { paletteForSide, type UnitPalette } from '../core/pieces';
import { clientSide, opponentSide, type PlayingSide } from '../game/clientPerspective';
import { useSkirmish } from '../game/SkirmishStoreContext';
import { PIECE_VALUE, standingForceValue } from '../run/model';
import { PieceTypeIcon } from './shared/PieceTypeIcon';
import { TitleBarStatusTip } from './shell/TitleBarControls';

// What each army on the board is still worth, in Pawns — for every play surface that mounts a
// battlefield, the standalone Skirmish title bar and the Run's alike (ADR-0059: one primitive,
// not a second parallel readout). Two boxes, one per side, and they HUG THE BATTLE CLOCK — the
// clock is the one chip that sits dead centre of the page over the title bar's nailhead
// diamond, and it stays there only while the row is symmetric about it (ADR-0575). A single
// combined box would have shifted it off the diamond; a matched pair on either side cannot.
//
// It reads the mounted session store itself rather than taking totals as props, exactly as the
// clock does: a caller that had to supply both sides' points would be re-deriving the board.
//
// The mark is a live Pawn sprite in that army's own palette, so the two boxes say WHOSE force
// they count without spending width on the words — and a Pawn is the right glyph twice over,
// because a Pawn is the 1 the whole scale is denominated in.

/** How a force relates to the person reading the bar. Both boxes render through one component. */
export type BattleMaterialRelation = 'self' | 'opponent';

/** A board unit as the readout reads it — what it is worth, and what colours it is wearing. */
interface MaterialUnit {
  readonly side: string;
  readonly alive: boolean;
  readonly type: string;
  readonly promotedFrom?: string;
  readonly palette?: string;
}

export interface BattleMaterialReadout {
  /** This force's worth, in Pawns. */
  points: number;
  /** The named thing the box is about. */
  name: string;
  /** What a screen reader hears in place of the mark and its number. */
  label: string;
  /** The explanation, including where the reader stands. */
  detail: string;
  /** The palette this force is rendering in, so the mark matches the pieces it counts. */
  palette: UnitPalette;
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

/** Where the reader stands, in one sentence — the same sentence from either box. */
function marginSentence(mine: number, theirs: number): string {
  const margin = mine - theirs;
  if (margin === 0) return 'The two forces are level on material.';
  return margin > 0
    ? `You are ${margin} ahead on material.`
    : `You are ${-margin} behind on material.`;
}

/**
 * One force's readout, from the board and the seat this client commands.
 *
 * `localSide` is the seat rather than an assumption that the reader is the `player` faction: in a
 * lobby the guest commands `enemy`, and "your material" has to mean the force that person is
 * actually playing. Both totals are computed either way, because the margin is what makes the
 * pair legible and either box can be the one hovered.
 */
export function battleMaterialReadout(
  pieces: readonly MaterialUnit[],
  localSide: PlayingSide,
  relation: BattleMaterialRelation,
): BattleMaterialReadout {
  const side: PlayingSide = relation === 'self' ? localSide : opponentSide(localSide);
  const mine = standingForceValue(pieces, localSide);
  const theirs = standingForceValue(pieces, opponentSide(localSide));
  const points = relation === 'self' ? mine : theirs;
  const name = relation === 'self' ? 'Your material' : 'Opponent material';
  return {
    points,
    name,
    label: `${name}. ${points} ${points === 1 ? 'Pawn' : 'Pawns'}. ${marginSentence(mine, theirs)}`,
    detail: `What this force is still worth, counted in Pawns. ${materialScaleSentence()} `
      + marginSentence(mine, theirs),
    // The palette this army is actually wearing on the board, not the side default: an authored
    // level stamps its own colours, and the mark has to match the pieces it is counting.
    palette: paletteForSide(side, pieces.find((piece) => piece.side === side && piece.alive)?.palette),
  };
}

export function BattleMaterialChip({
  relation,
  fillSurface,
}: {
  relation: BattleMaterialRelation;
  fillSurface?: string;
}): ReactElement {
  const pieces = useSkirmish((s) => s.game.pieces);
  const net = useSkirmish((s) => s.net);
  const readout = battleMaterialReadout(pieces, clientSide(net), relation);
  return (
    <TitleBarStatusTip
      className={`skirmish-status-chip skirmish-material skirmish-material--${relation}`}
      fillSurface={fillSurface}
      label={readout.label}
      name={readout.name}
      detail={readout.detail}
      // Material is a chess fact, not a Run mechanic; its own words would raise a definition
      // pane under a readout whose tooltip already spells the whole scale out.
      explainMechanics={false}
    >
      <span className="skirmish-material-mark" aria-hidden="true">
        <PieceTypeIcon type="pawn" palette={readout.palette} />
      </span>
      <strong className="skirmish-material-points" data-testid={`battle-material-${relation}`}>
        {readout.points}
      </strong>
    </TitleBarStatusTip>
  );
}
