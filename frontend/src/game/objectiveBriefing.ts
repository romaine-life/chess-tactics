import type { VictoryCondition, VictoryRule, VictoryRules } from '../core/level';
import { ruleOutcome } from '../core/objectives';
import type { PlayingSide } from './clientPerspective';

export interface ObjectiveBriefing {
  /** What this seat can make happen to win, in authored rule order. */
  win: string;
  /** What this seat must prevent, in authored rule order. Empty only for an invalid ruleset. */
  prevent: string;
  /** Compact HUD-ready combination of win and prevent. */
  summary: string;
}

const PIECE_PLURAL: Record<string, string> = {
  pawn: 'pawns',
  knight: 'knights',
  bishop: 'bishops',
  rook: 'rooks',
  queen: 'queens',
  king: 'Kings',
};

function relativeSide(side: 'player' | 'enemy', localSide: PlayingSide): 'self' | 'opponent' {
  return side === localSide ? 'self' : 'opponent';
}

function eliminatedThing(cond: Extract<VictoryCondition, { kind: 'eliminate' }>, localSide: PlayingSide): string {
  const owner = relativeSide(cond.side, localSide) === 'self' ? 'your' : 'the opposing';
  const type = cond.filter?.type;
  if (type === 'king') return `${owner} King`;
  if (type) return `${owner} ${PIECE_PLURAL[type] ?? `${type}s`}`;
  return `${owner} force`;
}

function achievementCondition(cond: VictoryCondition, localSide: PlayingSide): string {
  switch (cond.kind) {
    case 'eliminate': {
      const selfTarget = relativeSide(cond.side, localSide) === 'self';
      const thing = eliminatedThing(cond, localSide);
      if (selfTarget) return `have ${thing} eliminated`;
      return cond.filter?.type === 'king' ? `capture ${thing}` : `eliminate ${thing}`;
    }
    case 'reach':
      return relativeSide(cond.side, localSide) === 'self'
        ? 'reach the objective with a pawn'
        : 'let an opposing pawn reach the objective';
    case 'turnLimit':
      return `survive ${cond.turns} ${cond.turns === 1 ? 'round' : 'rounds'}`;
  }
}

function preventionCondition(cond: VictoryCondition, localSide: PlayingSide): string {
  switch (cond.kind) {
    case 'eliminate': {
      const selfTarget = relativeSide(cond.side, localSide) === 'self';
      const thing = eliminatedThing(cond, localSide);
      if (selfTarget) return `protect ${thing}`;
      return `keep ${thing} alive`;
    }
    case 'reach':
      return relativeSide(cond.side, localSide) === 'opponent'
        ? 'stop the opposing pawn reaching the objective'
        : 'keep your pawn from reaching the objective';
    case 'turnLimit':
      return `win before round ${cond.turns}`;
  }
}

function describeRule(rule: VictoryRule, localSide: PlayingSide, valence: 'win' | 'prevent'): string {
  if (rule.if.length === 0) return valence === 'win' ? 'win immediately' : 'prevent an immediate loss';
  const describe = valence === 'win' ? achievementCondition : preventionCondition;
  // Rule conditions are conjunctive. Achieving a rule therefore requires every
  // clause, while preventing it requires breaking any one clause (De Morgan).
  return rule.if.map((condition) => describe(condition, localSide)).join(valence === 'win' ? ' and ' : ' or ');
}

function joinRuleGroups(parts: readonly string[], outer: 'and' | 'or'): string {
  const filtered = parts.filter(Boolean);
  if (filtered.length <= 1) return filtered[0] ?? '';
  const inner = outer === 'or' ? ' and ' : ' or ';
  return filtered
    .map((part) => part.includes(inner) ? `(${part})` : part)
    .join(` ${outer} `);
}

function sentenceCase(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function occurredCondition(cond: VictoryCondition, localSide: PlayingSide): string {
  switch (cond.kind) {
    case 'eliminate': {
      const selfTarget = relativeSide(cond.side, localSide) === 'self';
      const owner = selfTarget ? 'Your' : 'The opposing';
      if (cond.filter?.type === 'king') return `${owner} King was captured`;
      if (cond.filter?.type) return `${owner} ${PIECE_PLURAL[cond.filter.type] ?? `${cond.filter.type}s`} were eliminated`;
      return `${owner} force was eliminated`;
    }
    case 'reach':
      return relativeSide(cond.side, localSide) === 'self'
        ? 'Your pawn reached the objective'
        : 'The opposing pawn reached the objective';
    case 'turnLimit':
      return `${cond.turns} ${cond.turns === 1 ? 'round elapsed' : 'rounds elapsed'}`;
  }
}

/** Seat-relative factual detail for a fired preset rule. Authored rules keep their exact owner-given
 * name; presets use this structural copy so a guest never receives a literal-player "Your". */
export function victoryRuleDetailForSide(rule: VictoryRule, localSide: PlayingSide): string {
  if (rule.if.length === 0) return 'The rule fired immediately';
  return rule.if.map((condition, index) => {
    const detail = occurredCondition(condition, localSide);
    return index === 0 ? detail : `${detail[0].toLowerCase()}${detail.slice(1)}`;
  }).join(' and ');
}

/**
 * Project one canonical ordered victory-rule list into the mission briefing for a seat.
 * This intentionally describes the structured conditions rather than reusing author-facing
 * rule names: names are preserved as exact result detail, while the live briefing must never
 * inherit a literal-player "your" from authored/template copy on the enemy-seat client.
 */
export function objectiveBriefingForSide(rules: VictoryRules, localSide: PlayingSide): ObjectiveBriefing {
  const wins: string[] = [];
  const prevents: string[] = [];
  for (const rule of rules) {
    const winner = ruleOutcome(rule);
    if (winner === localSide) wins.push(describeRule(rule, localSide, 'win'));
    else if (winner && winner !== 'draw') prevents.push(describeRule(rule, localSide, 'prevent'));
  }

  // Winning paths are alternatives. Avoiding defeat requires breaking every
  // opponent path; each path itself is broken by negating any one condition.
  const win = joinRuleGroups(wins, 'or');
  const prevent = joinRuleGroups(prevents, 'and');
  const summary = [sentenceCase(win), prevent].filter(Boolean).join('; ');
  return { win, prevent, summary };
}
