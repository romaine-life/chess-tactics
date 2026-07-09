import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Level, type VictoryRules } from '../core/level';
import { victoryRulesForObjective } from '../core/objectives';
import { appendRules } from './VictoryConditionsEditor';
import {
  guardRulesSeed,
  levelRulesSeed,
  seededBaselineLevel,
  type AuthoredRulesField,
} from './levelEditorRulesSeed';

// The reproduced bug (see levelEditorRulesSeed.ts): a ?levelId= deep link's campaign
// hydrate resolves AFTER the 4s entrance failsafe has made the editor interactive. The
// owner applied the Rival Kings victory template in that window; the late seed then ran
// `setVictory(level.victory ?? preset)` and silently replaced the authored rules with the
// capture-king preset pair, which is what the workspace persisted.

/** A preset-clean King Assault level like the l4 in the incident: objective capture-king,
 * `victory` intentionally absent (the preset defines win/lose). */
const kingAssaultLevel = (): Level => ({ ...createBlankLevel('l4', 'Kings Crossing'), objective: 'capture-king' });

const names = (rules: VictoryRules): string[] => rules.map((r) => r.name ?? '');
const authored = (...fields: AuthoredRulesField[]): Set<AuthoredRulesField> => new Set(fields);

describe('levelRulesSeed', () => {
  it('materializes the objective preset for a preset-clean level, and collapses it back for save', () => {
    const seed = levelRulesSeed(kingAssaultLevel());
    expect(seed.objective).toBe('capture-king');
    expect(names(seed.victory)).toEqual(['Your force is wiped out', 'Enemy King is captured']);
    // An untouched save of this document must keep storing NO victory body (victoryForSave).
    expect(seed.save.victory).toBeUndefined();
    expect(seed.save.events).toBeUndefined();
  });

  it('carries an authored victory body through to the save form', () => {
    const level: Level = { ...kingAssaultLevel(), victory: victoryRulesForObjective('rival-kings') };
    const seed = levelRulesSeed(level);
    expect(seed.victory).toEqual(level.victory);
    expect(seed.save.victory).toEqual(level.victory);
  });

  it('collapses a redundantly-stored preset body back to undefined for save', () => {
    const level: Level = { ...kingAssaultLevel(), victory: victoryRulesForObjective('capture-king') };
    expect(levelRulesSeed(level).save.victory).toBeUndefined();
  });
});

describe('guardRulesSeed — the seeding race', () => {
  it('REGRESSION: a template applied while the seed is in flight survives the late seed', () => {
    // Mount state: blank editor defaults (capture-all preset), hydrate still pending.
    let victory = victoryRulesForObjective('capture-all');
    const authoredFields = new Set<AuthoredRulesField>();

    // User applies the Rival Kings template (the authoring wrapper marks the field).
    victory = appendRules(victory, victoryRulesForObjective('rival-kings'));
    authoredFields.add('victory');

    // The delayed hydrate lands and seeds the preset-clean capture-king level.
    const guarded = guardRulesSeed(levelRulesSeed(kingAssaultLevel()), authoredFields);

    // The seed must NOT touch the authored victory list…
    expect(guarded.apply.victory).toBe(false);
    if (guarded.apply.victory) victory = guarded.seed.victory;
    expect(names(victory)).toContain('Your King is captured');
    expect(names(victory)).toContain('Enemy King is captured');
    // …and must not have collapsed it to the capture-king preset pair (the observed bug).
    expect(names(victory)).not.toEqual(['Your force is wiped out', 'Enemy King is captured']);
    // Fields the user never authored still seed from the document.
    expect(guarded.apply.events).toBe(true);
    expect(guarded.apply.name).toBe(true);
    expect(guarded.seed.objective).toBe('capture-king');
  });

  it('the opposite ordering keeps the applied template too (seed first, then author)', () => {
    let victory = victoryRulesForObjective('capture-all');
    const guarded = guardRulesSeed(levelRulesSeed(kingAssaultLevel()), authored());
    expect(guarded.apply.victory).toBe(true);
    victory = guarded.seed.victory;
    victory = appendRules(victory, victoryRulesForObjective('rival-kings'));
    expect(names(victory)).toContain('Your King is captured');
    expect(names(victory)).toContain('Enemy King is captured');
  });

  it('an explicit document load applies every field (authorship reset ⇒ empty set)', () => {
    const guarded = guardRulesSeed(levelRulesSeed(kingAssaultLevel()), authored());
    expect(Object.values(guarded.apply).every(Boolean)).toBe(true);
    expect(guarded.skippedAuthored).toBe(false);
  });

  it('flags a skew only for fields that skew the persisted document', () => {
    const seed = levelRulesSeed(kingAssaultLevel());
    expect(guardRulesSeed(seed, authored('victory')).skippedAuthored).toBe(true);
    expect(guardRulesSeed(seed, authored('events')).skippedAuthored).toBe(true);
    expect(guardRulesSeed(seed, authored('name')).skippedAuthored).toBe(true);
    expect(guardRulesSeed(seed, authored('clock')).skippedAuthored).toBe(true);
    // The template dropdown choice is not part of the document — no baseline skew.
    expect(guardRulesSeed(seed, authored('templateChoice')).skippedAuthored).toBe(false);
  });
});

describe('seededBaselineLevel', () => {
  it('anchors the clean baseline on the seeded document so the authored delta reads dirty', () => {
    const seed = levelRulesSeed(kingAssaultLevel());
    // The settled candidate carries the user's authored rules (victory survived the seed).
    const candidate: Level = {
      ...kingAssaultLevel(),
      boardCode: 'settled-board-code',
      victory: appendRules(victoryRulesForObjective('capture-all'), victoryRulesForObjective('rival-kings')),
    };
    const baseline = seededBaselineLevel(candidate, seed);
    // Rules fields come from the DOCUMENT: preset-clean ⇒ no victory body, doc name.
    expect(baseline.victory).toBeUndefined();
    expect(baseline.events).toBeUndefined();
    expect(baseline.timeControl).toBeUndefined();
    expect(baseline.name).toBe('Kings Crossing');
    expect(baseline.objective).toBe('capture-king');
    // Board-derived fields keep the SETTLED candidate's normalization (the reason the
    // baseline is captured post-hydrate at all).
    expect(baseline.boardCode).toBe('settled-board-code');
    // And the live candidate (with the authored rules) differs from it ⇒ dirty.
    expect(JSON.stringify(candidate.victory)).not.toBe(JSON.stringify(baseline.victory));
  });
});
