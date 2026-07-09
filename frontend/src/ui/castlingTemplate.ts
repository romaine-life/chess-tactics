// The Castling template's board scan (ADR-0072): from the painted pieces, every
// king-rook pair that supports chess-standard castling geometry. Pure — the Level
// Editor feeds it the painted units and appends one castle event per pair.

import type { CastleEventAction, ConditionSide } from '../core/level';
import type { PlayablePieceType } from '../core/pieces';

export interface CastleTemplateUnit {
  x: number;
  y: number;
  type: PlayablePieceType;
  side: ConditionSide;
}

export interface CastleTemplatePair {
  action: CastleEventAction;
  /** Author-facing event name, e.g. "Player castles kingside". */
  name: string;
}

const SIDE_LABEL: Record<ConditionSide, string> = { player: 'Player', enemy: 'Enemy' };

/**
 * Every castleable king-rook pair on the board, per side: king and rook share a rank
 * or file at least 3 squares apart (chess kingside distance is 3, queenside 4 — those
 * name the event; other distances read "toward (x, y)"). The king slides two squares
 * toward the rook and the rook lands on the square the king crossed, so both landing
 * squares always sit between the pair and never leave the board. Occupancy, movement
 * history, and check are PLAY-TIME legality (core/rules.ts) — the template only bakes
 * the squares. Deterministic order: side, then king square, then rook square.
 */
export function computeCastleTemplatePairs(units: readonly CastleTemplateUnit[]): CastleTemplatePair[] {
  const pairs: CastleTemplatePair[] = [];
  for (const side of ['player', 'enemy'] as const) {
    const kings = units.filter((u) => u.side === side && u.type === 'king');
    const rooks = units.filter((u) => u.side === side && u.type === 'rook');
    for (const king of kings) {
      for (const rook of rooks) {
        const dx = rook.x - king.x;
        const dy = rook.y - king.y;
        if ((dx !== 0) === (dy !== 0)) continue; // one shared rank or file
        const dist = Math.abs(dx + dy);
        if (dist < 3) continue; // no room for the two-square king slide
        const sx = Math.sign(dx);
        const sy = Math.sign(dy);
        const wing = dist === 3 ? 'kingside' : dist === 4 ? 'queenside' : `toward (${rook.x}, ${rook.y})`;
        pairs.push({
          action: {
            kind: 'castle',
            side,
            king: { x: king.x, y: king.y },
            rook: { x: rook.x, y: rook.y },
            kingTo: { x: king.x + 2 * sx, y: king.y + 2 * sy },
            rookTo: { x: king.x + sx, y: king.y + sy },
          },
          name: `${SIDE_LABEL[side]} castles ${wing}`,
        });
      }
    }
  }
  return pairs.sort((a, b) =>
    (a.action.side === b.action.side ? 0 : a.action.side === 'player' ? -1 : 1)
    || a.action.king.y - b.action.king.y || a.action.king.x - b.action.king.x
    || a.action.rook.y - b.action.rook.y || a.action.rook.x - b.action.rook.x);
}
