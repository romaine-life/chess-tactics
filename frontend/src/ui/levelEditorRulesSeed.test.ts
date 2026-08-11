import { describe, expect, it } from 'vitest';
import { createBlankLevel, type Level, type VictoryRules } from '../core/level';
import { victoryRulesForObjective } from '../core/objectives';
import { appendRules } from './VictoryConditionsEditor';
import { LEVEL_BATTLE_CARDS_DEALT_DEFAULT } from '../core/level';
import { levelToEditorBoard } from '../core/levelBoard';
import {
  battleSettingsForSave,
  editorCandidateLevel,
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

describe('the Battle Deployment deal', () => {
  it('seeds the authoring default for a Battle that predates the requirement', () => {
    const seed = levelRulesSeed(kingAssaultLevel());
    expect(seed.battleDeal).toBe(LEVEL_BATTLE_CARDS_DEALT_DEFAULT);
    // The document itself is unchanged until a save writes one — the seed is what the panel shows.
    expect(seed.save.battle).toBeUndefined();
  });

  it('reads an authored count off the document', () => {
    const level: Level = { ...kingAssaultLevel(), battle: { loot: true, cardsDealt: 5 } };
    const seed = levelRulesSeed(level);
    expect(seed.battleDeal).toBe(5);
    expect(seed.save.battle).toEqual({ loot: true, cardsDealt: 5 });
  });

  it('folds the count into the Battle block without disturbing Loot', () => {
    expect(battleSettingsForSave({ loot: true }, 5)).toEqual({ loot: true, cardsDealt: 5 });
    expect(battleSettingsForSave(undefined, 5)).toEqual({ cardsDealt: 5 });
    // null is "this level is not a Battle": it must not pick the field up by passing through.
    expect(battleSettingsForSave({ loot: true }, null)).toEqual({ loot: true });
    expect(battleSettingsForSave(undefined, null)).toBeUndefined();
    // A level that already carries one keeps it rather than being stripped by a non-Battle route.
    expect(battleSettingsForSave({ cardsDealt: 5 }, null)).toEqual({ cardsDealt: 5 });
    // The panel can never write a count the level validator would reject.
    expect(battleSettingsForSave(undefined, 0)).toEqual({ cardsDealt: 1 });
    expect(battleSettingsForSave(undefined, 400)).toEqual({ cardsDealt: 12 });
  });

  it('withholds a late seed from a deal the user already authored, and keeps the baseline on the document', () => {
    const level: Level = { ...kingAssaultLevel(), battle: { cardsDealt: 5 } };
    const seed = levelRulesSeed(level);
    expect(guardRulesSeed(seed, authored('battleDeal')).apply.battleDeal).toBe(false);
    expect(guardRulesSeed(seed, authored('battleDeal')).skippedAuthored).toBe(true);
    expect(guardRulesSeed(seed, authored()).apply.battleDeal).toBe(true);

    // The user's own count is what reads dirty against the seeded document's.
    const candidate: Level = { ...level, battle: { cardsDealt: 2 } };
    expect(seededBaselineLevel(candidate, seed).battle).toEqual({ cardsDealt: 5 });
  });

  // REGRESSION: Publish carried `battle` straight off the metadata source, so a War Battle's
  // authored deal was gated on the edited count and then written back as the SAVED one. Pressing
  // "Publish to all players" republished the old number, autosave re-dirtied the working copy
  // against it, and the level could never be published at all — with no error anywhere.
  it('REGRESSION: what Save writes carries the authored deal, not the saved level’s', () => {
    const saved: Level = { ...kingAssaultLevel(), battle: { loot: false, cardsDealt: 3 } };
    const board = levelToEditorBoard(saved);
    const rules = { id: saved.id, name: saved.name, objective: saved.objective };

    // The author drops the deal to 1. The gate judges 1 …
    const candidate = editorCandidateLevel(board, rules, saved, 1);
    expect(candidate.battle).toEqual({ loot: false, cardsDealt: 1 });
    // … and the Save that promotes over the canonical level writes the same 1, not the stored 3.
    expect(editorCandidateLevel(board, rules, saved, 1).battle).toEqual(candidate.battle);
    // Loot stays the War editor's to own.
    expect(editorCandidateLevel(board, rules, { ...saved, battle: { loot: true, cardsDealt: 3 } }, 1).battle)
      .toEqual({ loot: true, cardsDealt: 1 });
    // A level that is not a Battle still never picks the field up by passing through.
    expect(editorCandidateLevel(board, rules, kingAssaultLevel(), null).battle).toBeUndefined();
  });

  it('carries the metadata source’s non-board fields through a save unchanged', () => {
    const saved: Level = {
      ...kingAssaultLevel(),
      notes: 'author notes',
      difficulty: 'hard',
      theme: 'winter',
      battle: { loot: true, cardsDealt: 4 },
    };
    const level = editorCandidateLevel(
      levelToEditorBoard(saved),
      { id: saved.id, name: 'Renamed', objective: saved.objective },
      saved,
      4,
    );
    expect(level.name).toBe('Renamed');
    expect(level.notes).toBe('author notes');
    expect(level.difficulty).toBe('hard');
    expect(level.theme).toBe('winter');
  });
});
