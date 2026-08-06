// The main-menu Enchiridion's route language (ADR-0256), split from the component so
// MainMenu and the scene manifest resolve one address contract instead of lookalike
// parsers. `/enchiridion/<section>` selects a reference section; the lipsana section
// additionally addresses one lipsanon as `/enchiridion/lipsana/<lipsanon-id>`, the cards section
// addresses one gallery face by the name on its banner, hyphenated —
// `/enchiridion/cards/country-parish`, never the model's piece-initial id — and the
// Battle-hosted Strategikon keeps its own `/play|/run/strategikon/...` prefixes and
// ephemeral reference selection — these helpers speak only the main-menu addresses.

import { RUN_CARD_ID_BY_SLUG, runCardSlug } from '../run/cardNames';
import {
  RUN_LIPSANA,
  runCardDefinition,
  type LipsanonId,
} from '../run/model';

export const ENCHIRIDION_SECTIONS = ['units', 'terrain', 'cards', 'lipsana', 'ataraxia'] as const;
export type EnchiridionSection = typeof ENCHIRIDION_SECTIONS[number];

/** One label inventory for rails, title routes, and every other address presenter. */
export const ENCHIRIDION_SECTION_LABEL: Readonly<Record<EnchiridionSection, string>> = {
  units: 'Units',
  terrain: 'Terrain',
  cards: 'Cards',
  lipsana: 'Lipsana',
  ataraxia: 'Ataraxia',
};

export function enchiridionSectionHref(section: EnchiridionSection): string {
  return `/enchiridion/${section}`;
}

/** The address of one lipsanon's record in the main-menu Enchiridion. */
export function enchiridionLipsanonHref(lipsanonId: LipsanonId): string {
  return `/enchiridion/lipsana/${lipsanonId}`;
}

/**
 * Resolve a main-menu /enchiridion path to its explicitly addressed section.
 * Deeper address suffixes stay within their section. The bare root and unknown
 * paths select no section, leaving the retained Enchiridion shell open and empty.
 */
export function enchiridionSectionFromPath(path: string): EnchiridionSection | null {
  return ENCHIRIDION_SECTIONS.find(
    (section) => path === `/enchiridion/${section}` || path.startsWith(`/enchiridion/${section}/`),
  ) ?? null;
}

/**
 * The canonical section route a main-menu /enchiridion path belongs to. Address
 * suffixes collapse onto their section so the scene system can treat every lipsanon
 * address as the one retained lipsanon-reference scene.
 */
export function enchiridionSectionPath(path: string): string {
  const section = enchiridionSectionFromPath(path);
  return section ? enchiridionSectionHref(section) : '/enchiridion';
}

/** The lipsanon addressed by /enchiridion/lipsana/<lipsanon-id>; null when absent or unknown. */
export function enchiridionLipsanonFromPath(path: string): LipsanonId | null {
  const match = /^\/enchiridion\/lipsana\/([^/]+)$/.exec(path);
  const id = match?.[1];
  return id && RUN_LIPSANA.some((lipsanon) => lipsanon.id === id) ? (id as LipsanonId) : null;
}

/** The address of one card face in the main-menu Enchiridion gallery. */
export function enchiridionCardHref(cardId: string): string {
  return `/enchiridion/cards/${runCardSlug(cardId)}`;
}

/**
 * The gallery face addressed by /enchiridion/cards/<card-name>; null when absent or unknown.
 * Membership is an own-property test: `in` and a truthy index both walk Object.prototype,
 * so an address of `constructor` or `toString` would otherwise read as a known name.
 */
export function enchiridionCardFromPath(path: string): string | null {
  const match = /^\/enchiridion\/cards\/([^/]+)$/.exec(path);
  const slug = match?.[1];
  if (!slug || !Object.hasOwn(RUN_CARD_ID_BY_SLUG, slug)) return null;
  const id = RUN_CARD_ID_BY_SLUG[slug];
  return runCardDefinition(id) ? id : null;
}
