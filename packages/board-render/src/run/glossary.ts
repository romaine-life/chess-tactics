/**
 * The Run glossary is intentionally empty while unit abilities are retired.
 * Keeping the projection API lets the shared tooltip renderer stay generic
 * without retaining retired rules or vocabulary in live presentation code.
 */
export type RunGlossaryTermId = never;

export type RunGlossaryEntry = Readonly<{
  id: RunGlossaryTermId;
  term: string;
  forms: readonly string[];
  definition: string;
}>;

export type RunGlossaryTextSegment = Readonly<{
  text: string;
  entry: RunGlossaryEntry | null;
}>;

export const RUN_GLOSSARY: readonly RunGlossaryEntry[] = Object.freeze([]);

export function runGlossaryEntry(_id: RunGlossaryTermId): RunGlossaryEntry | null {
  return null;
}

export function splitRunGlossaryText(text: string): readonly RunGlossaryTextSegment[] {
  return text ? Object.freeze([{ text, entry: null }]) : Object.freeze([]);
}
