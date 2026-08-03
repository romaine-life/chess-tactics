import { describe, expect, it } from 'vitest';
import {
  RUN_GLOSSARY,
  runGlossaryEntry,
  splitRunGlossaryText,
} from './glossary';
import {
  AGMINATE_DISPLAY_NAME,
  CACOCHYMIC_DISPLAY_NAME,
  RUN_CARD_TYPE_REFERENCE,
  runAbilityDescription,
  runAbilityGeneralDescription,
} from './model';

describe('Run keyword glossary', () => {
  it('defines every card property and every unit state exactly once', () => {
    expect(RUN_GLOSSARY.map((entry) => entry.id).sort()).toEqual([
      'adlected',
      'agminate',
      'cacochymic',
      'concinnous',
      'eutactic',
      'hieratic',
      'legatine',
      'pestiferous',
    ]);
    expect(RUN_GLOSSARY.every((entry) => entry.definition.trim().length > 0)).toBe(true);
  });

  it('reads a card property definition from the authored effect rather than restating it', () => {
    expect(runGlossaryEntry('Legatine')?.definition).toBe(RUN_CARD_TYPE_REFERENCE.legatine.effect);
    expect(runGlossaryEntry('Pestiferous')?.definition).toBe(RUN_CARD_TYPE_REFERENCE.pestiferous.effect);
  });

  it('keeps a unit state definition tied to the rule the per-unit tip states', () => {
    // The general form IS the fallback branch of the per-unit description, so a glossary
    // entry cannot come to describe a rule the Army ledger no longer applies.
    expect(runGlossaryEntry('Adlected')?.definition)
      .toBe(runAbilityDescription('adlected', 'knight'));
    expect(runGlossaryEntry('Eutactic')?.definition)
      .toBe(runAbilityGeneralDescription('eutactic'));
    expect(runGlossaryEntry(AGMINATE_DISPLAY_NAME)?.definition)
      .toBe(runAbilityDescription('agminate', 'knight'));
  });

  it('finds the mechanic a card property effect names', () => {
    const marked = splitRunGlossaryText(RUN_CARD_TYPE_REFERENCE.legatine.effect)
      .filter((segment) => segment.entry);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.entry?.id).toBe('adlected');

    const pestiferous = splitRunGlossaryText(RUN_CARD_TYPE_REFERENCE.pestiferous.effect)
      .filter((segment) => segment.entry);
    expect(pestiferous.map((segment) => segment.entry?.id)).toEqual(['cacochymic']);
  });

  it('preserves the original text across the split', () => {
    for (const { effect } of Object.values(RUN_CARD_TYPE_REFERENCE)) {
      expect(splitRunGlossaryText(effect).map((segment) => segment.text).join('')).toBe(effect);
    }
  });

  it('matches an inflection whole, never as the base word plus a stray letter', () => {
    const segments = splitRunGlossaryText('An Adlected unit is placed by hand.');
    const term = segments.find((segment) => segment.entry);
    expect(term?.text).toBe('Adlected');
    expect(term?.entry?.id).toBe('adlected');
  });

  it('leaves ordinary prose alone', () => {
    // The mechanics are capitalized proper names; a lowercase word is not one of them,
    // and a longer word that merely contains one is not a mention.
    expect(splitRunGlossaryText('a tactical retreat').every((segment) => !segment.entry)).toBe(true);
    expect(splitRunGlossaryText('Repositioned pieces').every((segment) => !segment.entry)).toBe(true);
    expect(splitRunGlossaryText('').every((segment) => !segment.entry)).toBe(true);
  });

  it('reports every named mechanic in reading order', () => {
    const named = splitRunGlossaryText(
      `A ${CACOCHYMIC_DISPLAY_NAME} unit on a Pestiferous card may still gain Adlected.`,
    ).filter((segment) => segment.entry).map((segment) => segment.entry?.id);
    expect(named).toEqual(['cacochymic', 'pestiferous', 'adlected']);
  });
});
