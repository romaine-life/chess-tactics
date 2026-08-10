// Canonical committed-position adjudication.
//
// `applyMove` owns move mechanics only. It must never decide that removing the
// final piece wins: authored victory rules are allowed to define a different
// outcome, and the rules engine cannot see those rules. Every live, netplay,
// training, and solver consumer resolves a settled position through this module.

import type { VictoryCondition, VictoryRule, VictoryRules } from './level';
import type { GameState, Side } from './types';
import {
  boardIsAllSquares,
  gameEnv,
  materialCannotMate,
  ruleDraw,
  sideHasLegalMove,
  sideInCheck,
  type MoveEnv,
  type RuleDrawKind,
} from './rules';
import { resolveVictory, ruleOutcome, type ObjectiveContext } from './objectives';

type CombatSide = Exclude<Side, 'neutral'>;

/** Every reason a settled position is a draw. `stalemate` and `dead-position` are chess itself;
 * the rest are the level's authored chess draw rules (ADR-0072). */
export type DrawKind = 'stalemate' | 'dead-position' | RuleDrawKind;

export interface AdjudicationInput {
  /** The exact resolved rule list: the authored override, or the expanded preset. */
  victoryRules: VictoryRules;
  /** Static objective context (reach cells, survive target, King holder). */
  ctx?: ObjectiveContext;
  /** Completed player→enemy rounds, used by turn-limit rules. */
  turnsElapsed?: number;
  /** Optional cached movement environment. `lastMove` is always refreshed from `state`. */
  env?: MoveEnv;
}

export type Adjudication =
  | {
      kind: 'victory-rule';
      winner: CombatSide;
      /** The exact first authored/preset rule that fired, for result copy and audit. */
      rule: VictoryRule;
      side: null;
    }
  | {
      kind: 'checkmate';
      winner: CombatSide;
      rule: null;
      /** The side with no legal move. */
      side: CombatSide;
    }
  | {
      kind: DrawKind;
      winner: 'draw';
      rule: null;
      /** The side to move when the draw was adjudicated. */
      side: CombatSide;
    };

function envFor(state: GameState, cached?: MoveEnv): MoveEnv {
  return cached
    ? { ...cached, lastMove: state.lastMove }
    : { ...gameEnv(state), lastMove: state.lastMove };
}

/**
 * Whether a victory condition can never hold again once the material is dead on an all-squares
 * board. A King here IS capturable (a mate-in-1 by direct capture is a real solver terminal), but
 * not in a dead position: two Kings can never stand adjacent, because stepping beside one is
 * stepping into check, and the only other man on the board is a minor that by definition cannot
 * mate — so its check can always be walked out of and the capture never lands. Eliminating a
 * side's King, or its whole force (which includes the King), is therefore unreachable, and so is
 * a `reach` win, which is pawn-only where a dead position holds no Pawn. An `eliminate` aimed at
 * a Bishop or Knight stays reachable: a King can walk up and take an undefended minor.
 */
function unreachableOnceMaterialIsDead(condition: VictoryCondition): boolean {
  if (condition.kind === 'reach') return true;
  if (condition.kind === 'eliminate') return !condition.filter?.type || condition.filter.type === 'king';
  return false; // turnLimit keeps running
}

/**
 * Whether any rule in force could still decide this level from a dead position. This is the whole
 * reason the dead-position draw is not unconditional: a Survive level is WON by outlasting a
 * turn count, so ending its bare-Kings endgame as a draw would take that win away — the standing
 * objection in ADR-0072 to a draw rule that fires regardless of what the level is played for.
 */
function stillDecidable(rules: VictoryRules): boolean {
  return rules.some((rule) => ruleOutcome(rule) !== null && !rule.if.some(unreachableOnceMaterialIsDead));
}

/**
 * Resolve one COMMITTED, settled position using the single precedence required by
 * ADR-0064 and ADR-0072:
 *
 *  1. ordered authored/preset victory rules (first match wins),
 *  2. checkmate or stalemate for a side with no legal action,
 *  3. a dead position — material that can never mate, on a board of nothing but squares,
 *     in a level no surviving rule could still decide,
 *  4. authored chess draws (50-move / threefold).
 *
 * Victory rules therefore outrank every draw, while checkmate still outranks the
 * 50-move rule. The function is pure and does not mutate/stamp the GameState.
 * Call it after `recordPosition` so threefold sees the committed occurrence.
 */
export function adjudicateCommittedPosition(state: GameState, input: AdjudicationInput): Adjudication | null {
  // A stamped result has already passed through adjudication. Do not invent a
  // second reason (which would lose the original fired-rule identity).
  if (state.winner || (state.turn !== 'player' && state.turn !== 'enemy')) return null;

  const victoryRules = state.checkmateRequiresEnemyNonKingEliminated
    ? input.victoryRules.filter((rule) => !rule.do.some((action) => (
        (action.kind === 'win' && action.side === 'player')
        || (action.kind === 'lose' && action.side === 'enemy')
      )))
    : input.victoryRules;
  const resolved = resolveVictory(
    state,
    victoryRules,
    { ...(input.ctx ?? {}), turnsElapsed: input.turnsElapsed ?? 0 },
  );
  if (resolved.winner === 'player' || resolved.winner === 'enemy') {
    // resolveVictory returns a rule whenever it returns a winner.
    return { kind: 'victory-rule', winner: resolved.winner, rule: resolved.rule!, side: null };
  }

  const side = state.turn;
  const env = envFor(state, input.env);
  if (!sideHasLegalMove(state.pieces, side, state.size, env)) {
    if (sideInCheck(state, side, env)) {
      if (
        state.checkmateRequiresEnemyNonKingEliminated
        && side === 'enemy'
        && state.pieces.some((piece) => piece.alive && piece.side === 'enemy' && piece.type !== 'king')
      ) {
        return null;
      }
      return {
        kind: 'checkmate',
        winner: side === 'player' ? 'enemy' : 'player',
        rule: null,
        side,
      };
    }
    return { kind: 'stalemate', winner: 'draw', rule: null, side };
  }

  // FIDE 5.2.2 — a dead position ends the game the moment it arises, with no move counting and
  // nothing to author. Material first: it is O(pieces) and the first Pawn, Rook, or Queen ends
  // the question, so the board scan only ever runs on a bare endgame.
  if (materialCannotMate(state.pieces) && boardIsAllSquares(state) && !stillDecidable(victoryRules)) {
    return { kind: 'dead-position', winner: 'draw', rule: null, side };
  }

  const draw = ruleDraw(state, env);
  return draw ? { kind: draw, winner: 'draw', rule: null, side } : null;
}

/** Stamp a canonical adjudication onto the GameState while retaining its metadata. */
export function settleCommittedPosition(
  state: GameState,
  input: AdjudicationInput,
): { state: GameState; adjudication: Adjudication | null } {
  const adjudication = adjudicateCommittedPosition(state, input);
  return adjudication
    ? { state: { ...state, winner: adjudication.winner, turn: 'done' }, adjudication }
    : { state, adjudication: null };
}
