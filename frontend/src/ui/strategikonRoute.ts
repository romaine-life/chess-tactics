// The Battle-hosted Strategikon's route language, split from the component for the
// same reason ADR-0256 split the main-menu Enchiridion's: the screen and the scene
// manifest must resolve ONE address contract instead of lookalike parsers. The
// Strategikon previously carried two private parsers whose `endsWith` semantics
// disagreed with `enchiridionRoute`, and neither was visible to the scene graph —
// which is how its rail navigated without a director transition.

import {
  ENCHIRIDION_SECTIONS,
  ENCHIRIDION_SECTION_LABEL,
  type EnchiridionSection,
} from './enchiridionRoute';
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

export const STRATEGIKON_SECTION_LABEL: Readonly<Record<StrategikonSection, string>> = {
  enchiridion: 'Enchiridion',
  prosopography: 'Prosopography',
  chartulary: 'Chartulary',
  lipsanotheca: 'Lipsanotheca',
};

export interface StrategikonAddress {
  base: StrategikonBase;
  section: StrategikonSection | null;
  /** The reference sub-section; meaningful only for the Enchiridion section. */
  reference: EnchiridionSection | null;
}

export interface StrategikonRouteCrumb {
  label: string;
  to: string;
}

export function isStrategikonPath(pathname: string): boolean {
  const path = normalizeRoutePath(pathname);
  return STRATEGIKON_BASES.some(
    (base) => path === `${base}/strategikon` || path.startsWith(`${base}/strategikon/`),
  );
}

export function strategikonBase(pathname: string): StrategikonBase {
  return normalizeRoutePath(pathname).startsWith('/run') ? '/run' : '/play';
}

export function strategikonHref(
  base: StrategikonBase,
  section: StrategikonSection | null = null,
  reference: EnchiridionSection | null = null,
): string {
  if (!section) return `${base}/strategikon`;
  return section === 'enchiridion'
    ? `${base}/strategikon/enchiridion${reference ? `/${reference}` : ''}`
    : `${base}/strategikon/${section}`;
}

/**
 * Resolve only explicitly addressed Strategikon descendants. The Strategikon
 * root selects no primary section; its Enchiridion root selects no reference.
 * Unknown descendants collapse to the nearest real ancestor rather than exposing
 * Units as an implicit fallback.
 */
export function strategikonAddress(pathname: string): StrategikonAddress {
  const path = normalizeRoutePath(pathname);
  const base = strategikonBase(path);
  const rest = path.slice(`${base}/strategikon`.length);
  if (!rest) return { base, section: null, reference: null };
  if (rest === '/prosopography') return { base, section: 'prosopography', reference: null };
  if (rest === '/chartulary') return { base, section: 'chartulary', reference: null };
  if (rest === '/lipsanotheca') return { base, section: 'lipsanotheca', reference: null };
  if (rest === '/enchiridion' || rest.startsWith('/enchiridion/')) {
    const reference = ENCHIRIDION_SECTIONS.find((candidate) => rest === `/enchiridion/${candidate}`) ?? null;
    return { base, section: 'enchiridion', reference };
  }
  return { base, section: null, reference: null };
}

/** The canonical section address — the manifest identity suffix for this family. */
export function strategikonSectionPath(pathname: string): string {
  const address = strategikonAddress(pathname);
  return strategikonHref(address.base, address.section, address.reference);
}

/** Clickable route segments for the exact visible Strategikon workspace address. */
export function strategikonRouteCrumbs(pathname: string): readonly StrategikonRouteCrumb[] {
  const address = strategikonAddress(pathname);
  const root = strategikonHref(address.base);
  if (!address.section) return [{ label: 'Strategikon', to: root }];
  return address.section === 'enchiridion'
    ? [
        { label: 'Strategikon', to: root },
        {
          label: STRATEGIKON_SECTION_LABEL.enchiridion,
          to: strategikonHref(address.base, 'enchiridion'),
        },
        ...(address.reference ? [{
          label: ENCHIRIDION_SECTION_LABEL[address.reference],
          to: strategikonHref(address.base, address.section, address.reference),
        }] : []),
      ]
    : [
        { label: 'Strategikon', to: root },
        { label: STRATEGIKON_SECTION_LABEL[address.section], to: strategikonHref(address.base, address.section) },
      ];
}

/** Human labels retained for non-interactive consumers and compact tests. */
export function strategikonRouteLabels(pathname: string): readonly string[] {
  return strategikonRouteCrumbs(pathname).map((crumb) => crumb.label);
}
