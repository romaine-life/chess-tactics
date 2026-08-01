// The main-menu Enchiridion's route language (ADR-0256), split from the component so
// MainMenu and the scene manifest resolve one address contract instead of lookalike
// parsers. `/enchiridion/<section>` selects a reference section; the relics section
// additionally addresses one relic as `/enchiridion/relics/<relic-id>`, and the cards
// section addresses one card as `/enchiridion/cards/<card-id>`. The
// Battle-hosted Strategikon keeps its own `/play|/run/strategikon/...` prefixes and
// ephemeral reference selection — these helpers speak only the main-menu addresses.

import { RUN_CARD_BY_ID, RUN_RELICS, type RunRelicId } from '../run/model';

export const ENCHIRIDION_SECTIONS = ['units', 'terrain', 'cards', 'relics', 'abilities'] as const;
export type EnchiridionSection = typeof ENCHIRIDION_SECTIONS[number];

export function enchiridionSectionHref(section: EnchiridionSection): string {
  return `/enchiridion/${section}`;
}

/** The address of one relic's record in the main-menu Enchiridion. */
export function enchiridionRelicHref(relicId: RunRelicId): string {
  return `/enchiridion/relics/${relicId}`;
}

/**
 * Resolve a main-menu /enchiridion path to its section. Deeper address suffixes
 * (a relic id today) stay within their section; unknown paths read as 'units',
 * matching the route family's long-standing fallback.
 */
export function enchiridionSectionFromPath(path: string): EnchiridionSection {
  return ENCHIRIDION_SECTIONS.find(
    (section) => path === `/enchiridion/${section}` || path.startsWith(`/enchiridion/${section}/`),
  ) ?? 'units';
}

/**
 * The canonical section route a main-menu /enchiridion path belongs to. Address
 * suffixes collapse onto their section so the scene system can treat every relic
 * address as the one retained relic-reference scene.
 */
export function enchiridionSectionPath(path: string): string {
  return enchiridionSectionHref(enchiridionSectionFromPath(path));
}

/** The relic addressed by /enchiridion/relics/<relic-id>; null when absent or unknown. */
export function enchiridionRelicFromPath(path: string): RunRelicId | null {
  const match = /^\/enchiridion\/relics\/([^/]+)$/.exec(path);
  const id = match?.[1];
  return id && RUN_RELICS.some((relic) => relic.id === id) ? (id as RunRelicId) : null;
}

/** The address of one card's record in the main-menu Enchiridion. */
export function enchiridionCardHref(cardId: string): string {
  return `/enchiridion/cards/${cardId}`;
}

/** The deck card addressed by /enchiridion/cards/<card-id>; null when absent or unknown. */
export function enchiridionCardFromPath(path: string): string | null {
  const match = /^\/enchiridion\/cards\/([^/]+)$/.exec(path);
  const id = match?.[1];
  return id && RUN_CARD_BY_ID[id] ? id : null;
}
