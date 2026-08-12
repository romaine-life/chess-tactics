import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ENCHIRIDION_CARD_FILTERS_ALL,
  ENCHIRIDION_SECTIONS,
  enchiridionCardFiltersAreAll,
  enchiridionCardFiltersFromSearch,
  enchiridionCardFromPath,
  enchiridionCardHref,
  enchiridionCardHrefUnderFilters,
  enchiridionCardsHref,
  enchiridionLipsanaHref,
  enchiridionLipsanonFromPath,
  enchiridionLipsanonHref,
  enchiridionLipsanonHrefUnderBrowse,
  enchiridionSectionFromPath,
  enchiridionSectionPath,
  lipsanaBrowseModeFromSearch,
  withLipsanaBrowseMode,
} from './enchiridionRoute';

const mainMenu = readFileSync(new URL('./MainMenu.tsx', import.meta.url), 'utf8');
const enchiridion = readFileSync(new URL('./Enchiridion.tsx', import.meta.url), 'utf8');
const strategikon = readFileSync(new URL('./Strategikon.tsx', import.meta.url), 'utf8');

describe('main-menu Enchiridion addresses', () => {
  it('keeps the bare and unknown roots empty until a section is addressed', () => {
    expect(enchiridionSectionFromPath('/enchiridion')).toBeNull();
    expect(enchiridionSectionPath('/enchiridion')).toBe('/enchiridion');
    expect(enchiridionSectionFromPath('/enchiridion/unknown')).toBeNull();
    expect(enchiridionSectionPath('/enchiridion/unknown')).toBe('/enchiridion');
  });

  it('does not expose the retired card-type and ability sections', () => {
    expect(ENCHIRIDION_SECTIONS).toEqual(['units', 'terrain', 'manubiae', 'cards', 'lipsana', 'ataraxia']);
    for (const path of ['/enchiridion/card-types', '/enchiridion/card-types/hieratic', '/enchiridion/abilities']) {
      expect(enchiridionSectionFromPath(path)).toBeNull();
      expect(enchiridionSectionPath(path)).toBe('/enchiridion');
    }
  });

  it('reads inherited object keys as no card selection', () => {
    // Membership is an own-property test: `in` and a truthy index both walk
    // Object.prototype, so these would otherwise read as known ids.
    for (const inherited of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(enchiridionCardFromPath(`/enchiridion/cards/${inherited}`)).toBeNull();
    }
  });

  it('keeps every per-item address inside the section that owns it', () => {
    expect(enchiridionLipsanonFromPath(enchiridionLipsanonHref('royal-tent'))).toBe('royal-tent');
    expect(enchiridionLipsanonFromPath('/enchiridion/lipsana/royal-decree')).toBeNull();
    expect(enchiridionCardFromPath(enchiridionCardHref('ppb-protected'))).toBe('ppb-protected');
    expect(enchiridionCardHref('his-grace')).toBe('/enchiridion/cards/his-grace');
    expect(enchiridionCardFromPath('/enchiridion/cards/his-grace')).toBe('his-grace');
    expect(enchiridionCardFromPath('/enchiridion/cards/front-lines')).toBeNull();
    // Sections themselves stay resolvable, so adding an item address broke no rail entry.
    for (const section of ENCHIRIDION_SECTIONS) {
      expect(enchiridionSectionFromPath(`/enchiridion/${section}`)).toBe(section);
    }
  });
});

describe('card gallery filter addresses', () => {
  it('reads no filters from a bare address, and writes none back', () => {
    for (const search of ['', '?', '?other=1']) {
      expect(enchiridionCardFiltersFromSearch(search)).toEqual(ENCHIRIDION_CARD_FILTERS_ALL);
    }
    expect(enchiridionCardFiltersAreAll(ENCHIRIDION_CARD_FILTERS_ALL)).toBe(true);
    // No-filters is the bare address, so every link that predates filters still means what it did.
    expect(enchiridionCardsHref(ENCHIRIDION_CARD_FILTERS_ALL)).toBe('/enchiridion/cards');
    expect(enchiridionCardHrefUnderFilters('ppb-protected', ENCHIRIDION_CARD_FILTERS_ALL))
      .toBe(enchiridionCardHref('ppb-protected'));
  });

  it('round-trips every filter it writes', () => {
    const filters = { gold: '60', unit: 'rook', rarity: 'rare' } as const;
    const href = enchiridionCardsHref(filters);
    expect(href).toBe('/enchiridion/cards?gold=60&unit=rook&rarity=rare');
    expect(enchiridionCardFiltersFromSearch(href.slice(href.indexOf('?')))).toEqual(filters);
    // A leading '?' is optional, so a caller may pass location.search either way.
    expect(enchiridionCardFiltersFromSearch('gold=60&unit=rook&rarity=rare')).toEqual(filters);
  });

  it('omits only the filters that are off', () => {
    expect(enchiridionCardsHref({ gold: 'all', unit: 'queen', rarity: 'all' }))
      .toBe('/enchiridion/cards?unit=queen');
    expect(enchiridionCardsHref({ gold: '0', unit: 'all', rarity: 'common' }))
      .toBe('/enchiridion/cards?gold=0&rarity=common');
  });

  it('distrusts every value in a hand-typed query', () => {
    // A query carries whatever a reader typed. An unknown band is not a crash and not an empty
    // gallery -- it is no filter, which is the honest answer to "no such band".
    const junk = '?gold=99&unit=dragon&rarity=mythic';
    expect(enchiridionCardFiltersFromSearch(junk)).toEqual(ENCHIRIDION_CARD_FILTERS_ALL);
    expect(enchiridionCardFiltersFromSearch('?gold=&unit=&rarity=')).toEqual(ENCHIRIDION_CARD_FILTERS_ALL);
    expect(enchiridionCardFiltersFromSearch('?gold=60&unit=dragon'))
      .toEqual({ gold: '60', unit: 'all', rarity: 'all' });
    // Inherited keys are values here, not lookups, but a filter named for one must still miss.
    expect(enchiridionCardFiltersFromSearch('?unit=constructor&rarity=toString'))
      .toEqual(ENCHIRIDION_CARD_FILTERS_ALL);
    // Gold is a band, not a number: '060' and '60.0' name no band even though Number() likes them.
    expect(enchiridionCardFiltersFromSearch('?gold=060')).toEqual(ENCHIRIDION_CARD_FILTERS_ALL);
    expect(enchiridionCardFiltersFromSearch('?gold=60.0')).toEqual(ENCHIRIDION_CARD_FILTERS_ALL);
    // And a band that WAS one before gold was redenominated names none now.
    expect(enchiridionCardFiltersFromSearch('?gold=6')).toEqual(ENCHIRIDION_CARD_FILTERS_ALL);
  });

  it('carries the browsed filters onto a card address, and drops the card when they change', () => {
    const filters = { gold: '90', unit: 'all', rarity: 'rare' } as const;
    const cardHref = enchiridionCardHrefUnderFilters('q', filters);
    expect(cardHref).toBe('/enchiridion/cards/regal-serenity?gold=90&rarity=rare');
    // The card stays addressable through its filters, and the filters survive the click.
    expect(enchiridionCardFromPath(cardHref.split('?')[0])).toBe('q');
    expect(enchiridionCardFiltersFromSearch(cardHref.slice(cardHref.indexOf('?')))).toEqual(filters);
    // Changing a filter returns to the gallery: the path must not keep naming a hidden face.
    expect(enchiridionCardsHref({ ...filters, gold: '10' })).toBe('/enchiridion/cards?gold=10&rarity=rare');
  });

  it('is wired to the live address rather than to component state', () => {
    // The seam these helpers exist for: the menu shell must read the filters out of the address
    // and hand back both hrefs, or the gallery silently falls back to unaddressable local state.
    expect(mainMenu).toContain('enchiridionCardFiltersFromSearch(search)');
    expect(mainMenu).toContain('cardFilters={enchiridionCardFilters}');
    expect(mainMenu).toContain('cardFiltersHref={enchiridionCardsHref}');
    expect(mainMenu).toContain('enchiridionCardHrefUnderFilters(cardId, enchiridionCardFilters)');
    // And the gallery must navigate on change rather than keep a second copy of the filters.
    expect(enchiridion).toContain('if (filtersHref) navigateApp(filtersHref(next));');
    expect(enchiridion).toContain('else setLocalFilters(next);');
  });

  /**
   * ADR-0587. The lipsana browse layout is part of the address for the reason the card filters are:
   * a layout is a thing worth linking someone to, and held as component state the grouped case could
   * only be reached by pressing a tab — so no handoff link could put a reader on it.
   */
  it('addresses the lipsana browse layout, with rows as the bare address', () => {
    expect(lipsanaBrowseModeFromSearch('')).toBe('rows');
    expect(lipsanaBrowseModeFromSearch('?browse=grouped')).toBe('grouped');
    expect(lipsanaBrowseModeFromSearch('browse=grouped')).toBe('grouped');
    // Unknown, empty and prototype-shaped values read as rows rather than throwing.
    for (const search of ['?browse=tiles', '?browse=', '?browse=constructor', '?browse=ROWS']) {
      expect(lipsanaBrowseModeFromSearch(search)).toBe('rows');
    }
    // The default is REMOVED rather than written, so the bare address stays bare.
    expect(enchiridionLipsanaHref('rows')).toBe('/enchiridion/lipsana');
    expect(enchiridionLipsanaHref('grouped')).toBe('/enchiridion/lipsana?browse=grouped');
    expect(withLipsanaBrowseMode('?browse=grouped', 'rows')).toBe('');
  });

  it('keeps every other param the host was carrying when the layout changes', () => {
    // This is what lets the Strategikon put the layout on an address it does not own the rest of.
    expect(withLipsanaBrowseMode('?returnTo=%2Frun&run=abc', 'grouped'))
      .toBe('?returnTo=%2Frun&run=abc&browse=grouped');
    expect(withLipsanaBrowseMode('?run=abc&browse=grouped', 'rows')).toBe('?run=abc');
    // Switching layout twice is idempotent, not additive.
    expect(withLipsanaBrowseMode('?browse=grouped', 'grouped')).toBe('?browse=grouped');
  });

  it('carries the browsed layout onto a lipsanon address', () => {
    const href = enchiridionLipsanonHrefUnderBrowse('royal-tent', 'grouped');
    expect(href).toBe('/enchiridion/lipsana/royal-tent?browse=grouped');
    // The record stays addressable through its layout, and the layout survives the click.
    expect(enchiridionLipsanonFromPath(href.split('?')[0])).toBe('royal-tent');
    expect(lipsanaBrowseModeFromSearch(href.slice(href.indexOf('?')))).toBe('grouped');
    expect(enchiridionLipsanonHrefUnderBrowse('royal-tent', 'rows')).toBe(enchiridionLipsanonHref('royal-tent'));
  });

  it('wires the layout to the live address in BOTH reference hosts', () => {
    // The menu reads it out of the search and hands back the href.
    expect(mainMenu).toContain('lipsanaBrowseModeFromSearch(search)');
    expect(mainMenu).toContain('lipsanaBrowseMode={lipsanaBrowseMode}');
    expect(mainMenu).toContain('lipsanaBrowseModeHref={enchiridionLipsanaHref}');
    expect(mainMenu).toContain('enchiridionLipsanonHrefUnderBrowse(lipsanonId, lipsanaBrowseMode)');
    // The Strategikon does the same on its own query, for both places a Lipsanotheca is shown: the
    // Run's held case and the Enchiridion's full reference.
    expect(strategikon).toContain('lipsanaBrowseModeFromSearch(search)');
    expect(strategikon).toContain('withLipsanaBrowseMode(search, mode)');
    expect(strategikon).toContain("lipsanaBrowseModeHref(mode, 'lipsanotheca')");
    expect(strategikon).toContain("lipsanaBrowseModeHref(mode, 'enchiridion')");
    // A tab is the same two-transport trigger the records are, so it navigates where it is given an
    // address and sets local state where it is not.
    expect(enchiridion).toContain('LIPSANA_BROWSE_MODES.map((mode) => (');
    expect(enchiridion).toMatch(/<ReferenceTrigger\s*\r?\n\s*key=\{mode\}\s*\r?\n\s*to=\{browseModeHref\?\.\(mode\)\}/);
    expect(enchiridion).toContain('onSelect={() => setLocalBrowseMode(mode)}');
    // The scene identity is the PATH, so changing layout must not re-run a section transition.
    expect(enchiridionSectionPath('/enchiridion/lipsana')).toBe('/enchiridion/lipsana');
  });
});
