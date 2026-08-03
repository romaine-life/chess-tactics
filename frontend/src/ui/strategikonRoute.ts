// The Battle-hosted Strategikon's route language, split from the component for the
// same reason ADR-0256 split the main-menu Enchiridion's: the screen and the scene
// manifest must resolve ONE address contract instead of lookalike parsers. The
// Strategikon previously carried two private parsers whose `endsWith` semantics
// disagreed with `enchiridionRoute`, and neither was visible to the scene graph —
// which is how its rail navigated without a director transition.

import { ENCHIRIDION_SECTIONS, type EnchiridionSection } from './enchiridionRoute';
import { normalizeRoutePath } from './navigation';

/** The two ancestries the one Strategikon shell mounts under. */
export type StrategikonBase = '/play' | '/run';
export const STRATEGIKON_BASES: readonly StrategikonBase[] = ['/play', '/run'];

export type StrategikonSection = 'enchiridion' | 'prosopography' | 'chartulary' | 'lipsanotheca';
export const STRATEGIKON_SECTIONS: readonly StrategikonSection[] = [
  'enchiridion',
  'prosopography',
  'chartulary',
  'lipsanotheca',
];

export interface StrategikonAddress {
  base: StrategikonBase;
  section: StrategikonSection;
  /** The reference sub-section; meaningful only for the Enchiridion section. */
  reference: EnchiridionSection;
}

export function isStrategikonPath(pathname: string): boolean {
  const path = normalizeRoutePath(pathname);
  return STRATEGIKON_BASES.some((base) => path.startsWith(`${base}/strategikon/`));
}

export function strategikonBase(pathname: string): StrategikonBase {
  return normalizeRoutePath(pathname).startsWith('/run') ? '/run' : '/play';
}

export function strategikonHref(
  base: StrategikonBase,
  section: StrategikonSection,
  reference: EnchiridionSection = 'units',
): string {
  return section === 'enchiridion'
    ? `${base}/strategikon/enchiridion/${reference}`
    : `${base}/strategikon/${section}`;
}

/**
 * Resolve any Strategikon address to its canonical section address. Unknown
 * suffixes read as the Enchiridion's units reference, matching what the screen
 * already renders for them, so an address-only difference never re-runs the
 * scene lifecycle for the same committed section.
 */
export function strategikonAddress(pathname: string): StrategikonAddress {
  const path = normalizeRoutePath(pathname);
  const base = strategikonBase(path);
  const rest = path.slice(`${base}/strategikon`.length);
  if (rest === '/prosopography') return { base, section: 'prosopography', reference: 'units' };
  if (rest === '/chartulary') return { base, section: 'chartulary', reference: 'units' };
  if (rest === '/lipsanotheca') return { base, section: 'lipsanotheca', reference: 'units' };
  const reference = ENCHIRIDION_SECTIONS.find((section) => rest === `/enchiridion/${section}`) ?? 'units';
  return { base, section: 'enchiridion', reference };
}

/** The canonical section address — the manifest identity suffix for this family. */
export function strategikonSectionPath(pathname: string): string {
  const address = strategikonAddress(pathname);
  return strategikonHref(address.base, address.section, address.reference);
}
