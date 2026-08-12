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
  cardCostGold,
  runCardDefinition,
  type LipsanonId,
  type RunArmyPieceType,
  type RunCardRarity,
} from '../run/model';

export const ENCHIRIDION_SECTIONS = ['units', 'terrain', 'manubiae', 'cards', 'lipsana', 'ataraxia'] as const;
export type EnchiridionSection = typeof ENCHIRIDION_SECTIONS[number];

/** One label inventory for rails, title routes, and every other address presenter. */
export const ENCHIRIDION_SECTION_LABEL: Readonly<Record<EnchiridionSection, string>> = {
  units: 'Units',
  terrain: 'Terrain',
  manubiae: 'Manubiae',
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

// The lipsana section browses its records two ways, and WHICH way is part of the address for the
// same reason the cards gallery's filters are: a browse layout is a thing worth linking someone to.
// Held as component state it was reachable only by pressing a tab, so no link could put a reader on
// the grouped case — the unlinkable review surface that costs a navigation every time it comes up.

export const LIPSANA_BROWSE_MODES = ['rows', 'grouped'] as const;
export type LipsanaBrowseMode = typeof LIPSANA_BROWSE_MODES[number];

/** Rows is what a bare /enchiridion/lipsana means, and what every unknown value falls back to. */
export const LIPSANA_BROWSE_MODE_DEFAULT: LipsanaBrowseMode = 'rows';

export const LIPSANA_BROWSE_MODE_LABEL: Readonly<Record<LipsanaBrowseMode, string>> = {
  rows: 'Rows',
  grouped: 'Grouped',
};

const LIPSANA_BROWSE_PARAM = 'browse';

/**
 * The browse layout a query addresses. An absent, empty or unknown value reads as rows rather than
 * throwing or erasing the address — a hand-typed `?browse=tiles` shows the rows, which is the honest
 * answer to "no such layout".
 */
export function lipsanaBrowseModeFromSearch(search: string): LipsanaBrowseMode {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get(LIPSANA_BROWSE_PARAM);
  return LIPSANA_BROWSE_MODES.find((mode) => mode === raw) ?? LIPSANA_BROWSE_MODE_DEFAULT;
}

/**
 * `search` with the browse layout set — the default REMOVED rather than written, so the bare address
 * stays the bare address. Every other param the host was carrying survives, which is what lets the
 * Strategikon put this on an address it does not own the rest of.
 */
export function withLipsanaBrowseMode(search: string, mode: LipsanaBrowseMode): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (mode === LIPSANA_BROWSE_MODE_DEFAULT) params.delete(LIPSANA_BROWSE_PARAM);
  else params.set(LIPSANA_BROWSE_PARAM, mode);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** The address of the lipsana section under one browse layout. */
export function enchiridionLipsanaHref(mode: LipsanaBrowseMode): string {
  return `${enchiridionSectionHref('lipsana')}${withLipsanaBrowseMode('', mode)}`;
}

/** The address of one lipsanon's record, keeping the layout the reader was browsing under. */
export function enchiridionLipsanonHrefUnderBrowse(
  lipsanonId: LipsanonId,
  mode: LipsanaBrowseMode,
): string {
  return `${enchiridionLipsanonHref(lipsanonId)}${withLipsanaBrowseMode('', mode)}`;
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

// The cards gallery's filters are part of its address, not hidden component state: a filtered
// view is a thing worth linking someone to, the same way one card face is. The vocabulary lives
// here rather than in the gallery because the address is what validates it -- a query carries
// whatever a reader typed, so every value is checked against these lists before it is believed.

// One band per price the catalog can carry, written in GOLD -- the number on the coin the
// filter draws, so the address and the chip the reader clicked always say the same thing.
export const CARD_GOLD_FILTER_VALUES = Object.freeze(
  Array.from({ length: 10 }, (_, index) => String(cardCostGold(index))),
) as readonly string[];
export const CARD_UNIT_FILTER_VALUES = Object.freeze(
  ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'],
) as readonly RunArmyPieceType[];
export const CARD_RARITY_FILTER_VALUES = Object.freeze(
  ['common', 'uncommon', 'rare'],
) as readonly RunCardRarity[];

export type CardGoldFilter = 'all' | '0' | '10' | '20' | '30' | '40' | '50' | '60' | '70' | '80' | '90';
export type CardUnitFilter = 'all' | RunArmyPieceType;
export type CardRarityFilter = 'all' | RunCardRarity;

export interface EnchiridionCardFilters {
  gold: CardGoldFilter;
  unit: CardUnitFilter;
  rarity: CardRarityFilter;
}

/** No filter applied — what a bare /enchiridion/cards means, and what every parse falls back to. */
export const ENCHIRIDION_CARD_FILTERS_ALL: Readonly<EnchiridionCardFilters> = Object.freeze({
  gold: 'all',
  unit: 'all',
  rarity: 'all',
});

export function enchiridionCardFiltersAreAll(filters: EnchiridionCardFilters): boolean {
  return filters.gold === 'all' && filters.unit === 'all' && filters.rarity === 'all';
}

function readFilter<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly string[],
): T | 'all' {
  const raw = params.get(key);
  return raw !== null && allowed.includes(raw) ? (raw as T) : 'all';
}

/**
 * The filters addressed by a /enchiridion/cards query. An absent, empty, repeated or unknown
 * value reads as 'all' rather than throwing or erasing the address: a hand-typed
 * `?gold=99` shows the whole catalog, which is the honest answer to "no such band".
 */
export function enchiridionCardFiltersFromSearch(search: string): EnchiridionCardFilters {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return {
    gold: readFilter<CardGoldFilter>(params, 'gold', CARD_GOLD_FILTER_VALUES),
    unit: readFilter<CardUnitFilter>(params, 'unit', CARD_UNIT_FILTER_VALUES),
    rarity: readFilter<CardRarityFilter>(params, 'rarity', CARD_RARITY_FILTER_VALUES),
  };
}

/** The query for a set of filters; 'all' is omitted so no-filters is the bare address. */
function enchiridionCardFilterQuery(filters: EnchiridionCardFilters): string {
  const params = new URLSearchParams();
  if (filters.gold !== 'all') params.set('gold', filters.gold);
  if (filters.unit !== 'all') params.set('unit', filters.unit);
  if (filters.rarity !== 'all') params.set('rarity', filters.rarity);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * The address of the gallery under a set of filters. Changing a filter lands here rather than on
 * a card address: the path would otherwise keep naming a face the new filters have hidden.
 */
export function enchiridionCardsHref(filters: EnchiridionCardFilters): string {
  return `${enchiridionSectionHref('cards')}${enchiridionCardFilterQuery(filters)}`;
}

/** The address of one card face, keeping the filters the reader was browsing under. */
export function enchiridionCardHrefUnderFilters(
  cardId: string,
  filters: EnchiridionCardFilters,
): string {
  return `${enchiridionCardHref(cardId)}${enchiridionCardFilterQuery(filters)}`;
}
