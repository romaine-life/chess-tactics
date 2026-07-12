import { describe, expect, it } from 'vitest';
import { victoryRulesForObjective } from '../core/objectives';
import { objectiveBriefingForSide, victoryRuleDetailForSide } from './objectiveBriefing';

describe('objectiveBriefingForSide', () => {
  it('mirrors a one-King assault from the King holder and attacker seats', () => {
    const rules = victoryRulesForObjective('capture-king', { kingSide: 'enemy' });

    expect(objectiveBriefingForSide(rules, 'player')).toEqual({
      win: 'capture the opposing King',
      prevent: 'protect your force',
      summary: 'Capture the opposing King; protect your force',
    });
    expect(objectiveBriefingForSide(rules, 'enemy')).toEqual({
      win: 'eliminate the opposing force',
      prevent: 'protect your King',
      summary: 'Eliminate the opposing force; protect your King',
    });
  });

  it('gives the opposing seat the counter-objective for Survive', () => {
    const rules = victoryRulesForObjective('survive', { surviveTurns: 6 });

    expect(objectiveBriefingForSide(rules, 'player').summary)
      .toBe('Survive 6 rounds; protect your force');
    expect(objectiveBriefingForSide(rules, 'enemy').summary)
      .toBe('Eliminate the opposing force; win before round 6');
  });

  it('gives the opposing seat the counter-objective for Reach', () => {
    const rules = victoryRulesForObjective('reach');

    expect(objectiveBriefingForSide(rules, 'player').summary)
      .toBe('Reach the objective with a pawn; protect your force');
    expect(objectiveBriefingForSide(rules, 'enemy').summary)
      .toBe('Eliminate the opposing force; stop the opposing pawn reaching the objective');
  });

  it('uses authored rule structure instead of player-perspective rule names', () => {
    const briefing = objectiveBriefingForSide([
      {
        name: 'Your special victory',
        if: [{ kind: 'eliminate', side: 'player', filter: { type: 'king' } }],
        do: [{ kind: 'win', side: 'enemy' }],
      },
      {
        name: 'Your special defeat',
        if: [{ kind: 'reach', side: 'enemy' }],
        do: [{ kind: 'win', side: 'enemy' }],
      },
    ], 'enemy');

    expect(briefing.summary).toBe('Capture the opposing King or reach the objective with a pawn');
    expect(briefing.summary).not.toContain('Your special');
  });

  it('requires every compound win clause but only one broken clause to prevent it', () => {
    const rules = [{
      name: 'Break through after regicide',
      if: [
        { kind: 'eliminate' as const, side: 'player' as const, filter: { type: 'king' as const } },
        { kind: 'reach' as const, side: 'enemy' as const },
      ],
      do: [{ kind: 'win' as const, side: 'enemy' as const }],
    }];

    expect(objectiveBriefingForSide(rules, 'enemy').win)
      .toBe('capture the opposing King and reach the objective with a pawn');
    expect(objectiveBriefingForSide(rules, 'player').prevent)
      .toBe('protect your King or stop the opposing pawn reaching the objective');
  });

  it('requires preventing every alternative opponent win path', () => {
    const rules = [
      {
        name: 'Break through after regicide',
        if: [
          { kind: 'eliminate' as const, side: 'player' as const, filter: { type: 'king' as const } },
          { kind: 'reach' as const, side: 'enemy' as const },
        ],
        do: [{ kind: 'win' as const, side: 'enemy' as const }],
      },
      {
        name: 'Annihilation',
        if: [{ kind: 'eliminate' as const, side: 'player' as const }],
        do: [{ kind: 'win' as const, side: 'enemy' as const }],
      },
    ];

    expect(objectiveBriefingForSide(rules, 'enemy').win)
      .toBe('(capture the opposing King and reach the objective with a pawn) or eliminate the opposing force');
    expect(objectiveBriefingForSide(rules, 'player').prevent)
      .toBe('(protect your King or stop the opposing pawn reaching the objective) and protect your force');
  });

  it('describes the same fired preset rule relative to each seat', () => {
    const rule = victoryRulesForObjective('capture-king', { kingSide: 'enemy' })[1];
    expect(victoryRuleDetailForSide(rule, 'player')).toBe('The opposing King was captured');
    expect(victoryRuleDetailForSide(rule, 'enemy')).toBe('Your King was captured');
  });
});
