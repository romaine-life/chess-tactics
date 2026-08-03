import {
  ADLECTED_DISPLAY_NAME,
  AGMINATE_DISPLAY_NAME,
  CACOCHYMIC_DESCRIPTION,
  CACOCHYMIC_DISPLAY_NAME,
  EUTACTIC_DISPLAY_NAME,
  RUN_CARD_TYPE_REFERENCE,
  runAbilityGeneralDescription,
  type RunAbility,
  type RunCardType,
  type RunUnitModifier,
} from './model';

/**
 * A named Run mechanic that other prose is allowed to invoke by name. Card properties
 * cause; unit states result (ADR-0339), and both are read here so an explanation of one
 * can reach the other without either vocabulary being restated.
 */
export type RunGlossaryTermId = RunCardType | RunAbility | RunUnitModifier;

export type RunGlossaryKind = 'card-property' | 'unit-state';

export type RunGlossaryEntry = Readonly<{
  id: RunGlossaryTermId;
  kind: RunGlossaryKind;
  /** The name as authored prose writes it — the exact word a reader sees. */
  term: string;
  /** Every literal spelling that means this term, including inflections. */
  forms: readonly string[];
  /** One tip-length sentence. Long-form reference prose lives in the Enchiridion. */
  definition: string;
}>;

/**
 * The Run's keyword glossary (ADR-0370). Explanatory text may name a mechanic without
 * defining it, because every surface that shows that text resolves the name from here.
 *
 * Definitions are deliberately the SHORT form: a tip states what the word means, and the
 * Enchiridion holds the full record. Card-property definitions are the authored effect
 * itself, so a property cannot come to mean one thing on a card face and another in a tip.
 */
export const RUN_GLOSSARY: readonly RunGlossaryEntry[] = Object.freeze([
  Object.freeze({
    id: 'adlected' as const,
    kind: 'unit-state' as const,
    term: ADLECTED_DISPLAY_NAME,
    forms: Object.freeze([ADLECTED_DISPLAY_NAME]),
    definition: runAbilityGeneralDescription('adlected'),
  }),
  Object.freeze({
    id: 'eutactic' as const,
    kind: 'unit-state' as const,
    term: EUTACTIC_DISPLAY_NAME,
    forms: Object.freeze([EUTACTIC_DISPLAY_NAME]),
    definition: runAbilityGeneralDescription('eutactic'),
  }),
  Object.freeze({
    id: 'agminate' as const,
    kind: 'unit-state' as const,
    term: AGMINATE_DISPLAY_NAME,
    forms: Object.freeze([AGMINATE_DISPLAY_NAME]),
    definition: runAbilityGeneralDescription('agminate'),
  }),
  Object.freeze({
    id: 'cacochymic' as const,
    kind: 'unit-state' as const,
    term: CACOCHYMIC_DISPLAY_NAME,
    forms: Object.freeze([CACOCHYMIC_DISPLAY_NAME]),
    definition: CACOCHYMIC_DESCRIPTION,
  }),
  ...(Object.keys(RUN_CARD_TYPE_REFERENCE) as RunCardType[]).map((id) => Object.freeze({
    id,
    kind: 'card-property' as const,
    term: RUN_CARD_TYPE_REFERENCE[id].name,
    forms: Object.freeze([RUN_CARD_TYPE_REFERENCE[id].name]),
    definition: RUN_CARD_TYPE_REFERENCE[id].effect,
  })),
]);

const GLOSSARY_BY_TERM: ReadonlyMap<string, RunGlossaryEntry> = new Map(
  RUN_GLOSSARY.flatMap((entry) => entry.forms.map((form) => [form, entry] as const)),
);

export function runGlossaryEntry(term: string): RunGlossaryEntry | null {
  return GLOSSARY_BY_TERM.get(term) ?? null;
}

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Longest form first, so a term that is a prefix of another never swallows its longer form.
 * The pattern is rebuilt per call site through a fresh RegExp because a global regex
 * carries `lastIndex` between uses.
 */
const GLOSSARY_PATTERN_SOURCE = [...GLOSSARY_BY_TERM.keys()]
  .sort((left, right) => right.length - left.length)
  .map(escapeForPattern)
  .join('|');

export type RunGlossarySegment = Readonly<{
  text: string;
  entry: RunGlossaryEntry | null;
}>;

/**
 * Split authored prose into plain runs and glossary terms, in reading order. Matching is
 * case sensitive and whole-word: the mechanics are capitalized proper names, so `tactical`
 * in ordinary prose is not the Legatine card property.
 */
export function splitRunGlossaryText(text: string): readonly RunGlossarySegment[] {
  if (!text) return [Object.freeze({ text, entry: null })];
  const pattern = new RegExp(`\\b(?:${GLOSSARY_PATTERN_SOURCE})\\b`, 'g');
  const segments: RunGlossarySegment[] = [];
  let cursor = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > cursor) {
      segments.push(Object.freeze({ text: text.slice(cursor, match.index), entry: null }));
    }
    segments.push(Object.freeze({ text: match[0], entry: runGlossaryEntry(match[0]) }));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push(Object.freeze({ text: text.slice(cursor), entry: null }));
  return segments;
}
