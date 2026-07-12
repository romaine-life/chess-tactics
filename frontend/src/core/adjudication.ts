// Canonical committed-position adjudication.
//
// `applyMove` owns move mechanics only. It must never decide that removing the
// final piece wins: authored victory rules are allowed to define a different
// outcome, and the rules engine cannot see those rules. Every live, netplay,
// training, and solver consumer resolves a settled position through this module.

import type { VictoryRule, VictoryRules } from './level';
import type { GameState, Side } from './types';
import { gameEnv, legalMoves, livingPieces, ruleDraw, sideInCheck, type MoveEnv, type RuleDrawKind } from './rules';
import { resolveVictory, type ObjectiveContext } from './objectives';

type CombatSide = Exclude<Side, 'neutral'>;

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
      kind: 'stalemate' | RuleDrawKind;
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
 * Resolve one COMMITTED, settled position using the single precedence required by
 * ADR-0064 and ADR-0072:
 *
 *  1. ordered authored/preset victory rules (first match wins),
 *  2. checkmate or stalemate for a side with no legal action,
 *  3. authored chess draws (50-move / threefold).
 *
 * Victory rules therefore outrank every draw, while checkmate still outranks the
 * 50-move rule. The function is pure and does not mutate/stamp the GameState.
 * Call it after `recordPosition` so threefold sees the committed occurrence.
 */
export function adjudicateCommittedPosition(state: GameState, input: AdjudicationInput): Adjudication | null {
  // A stamped result has already passed through adjudication. Do not invent a
  // second reason (which would lose the original fired-rule identity).
  if (state.winner || (state.turn !== 'player' && state.turn !== 'enemy')) return null;

  const resolved = resolveVictory(
    state,
    input.victoryRules,
    { ...(input.ctx ?? {}), turnsElapsed: input.turnsElapsed ?? 0 },
  );
  if (resolved.winner === 'player' || resolved.winner === 'enemy') {
    // resolveVictory returns a rule whenever it returns a winner.
    return { kind: 'victory-rule', winner: resolved.winner, rule: resolved.rule!, side: null };
  }

  const side = state.turn;
  const env = envFor(state, input.env);
  const hasMove = livingPieces(state.pieces, side)
    .some((piece) => legalMoves(piece, state.pieces, state.size, env).length > 0);
  if (!hasMove) {
    if (sideInCheck(state, side, env)) {
      return {
        kind: 'checkmate',
        winner: side === 'player' ? 'enemy' : 'player',
        rule: null,
        side,
      };
    }
    return { kind: 'stalemate', winner: 'draw', rule: null, side };
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
