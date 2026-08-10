import { describe, expect, it } from 'vitest';
import {
  isRailTabAddress,
  openRailTab,
  railTabRoutePath,
  siblingRailAddresses,
  type RailAddressFamily,
} from './railOpenIntent';
import { ENCHIRIDION_SECTIONS, enchiridionSectionHref } from '../enchiridionRoute';
import { isStrategikonPath, strategikonAddress, strategikonHref } from '../strategikonRoute';

// The three rails the open mark ships on, written the way their hosts build them.
const menuRail: RailAddressFamily<string> = {
  governs: (path) => path === '/' || Boolean(menuRail.select(path)),
  select: (path) => {
    if (path === '/settings' || path.startsWith('/settings/')) return 'settings';
    if (path === '/play/select' || path.startsWith('/play/select/')) return 'play';
    if (path === '/enchiridion' || path.startsWith('/enchiridion/')) return 'enchiridion';
    return null;
  },
};
const strategikonRail: RailAddressFamily<string> = {
  governs: isStrategikonPath,
  select: (path) => strategikonAddress(path).section,
};
const menuEnchiridionRail = siblingRailAddresses(ENCHIRIDION_SECTIONS, enchiridionSectionHref);
const battleEnchiridionRail = siblingRailAddresses(
  ENCHIRIDION_SECTIONS,
  // The Strategikon's host builder carries the live query, exactly as Strategikon.tsx does.
  (section) => `${strategikonHref('/run', 'enchiridion', section)}?run=abc`,
);

describe('rail open intent', () => {
  it('marks the tab the address asks for, ahead of whatever is committed', () => {
    // The press has moved the address; the committed section is still the outgoing one.
    expect(openRailTab(menuEnchiridionRail, '/enchiridion/cards', 'units')).toBe('cards');
    expect(openRailTab(strategikonRail, '/run/strategikon/chartulary', 'prosopography')).toBe('chartulary');
    expect(openRailTab(menuRail, '/settings', 'play')).toBe('settings');
  });

  it('drops the mark on the press that collapses an open panel', () => {
    // The main menu's open tab navigates home; the ring stays lit through the fade, and the
    // mark must not — the whole point is that the button answers the click it just took.
    expect(openRailTab(menuRail, '/', 'enchiridion')).toBeNull();
    // A rail root selects no tab either: the panel is open with nothing chosen inside it.
    expect(openRailTab(strategikonRail, '/run/strategikon', 'chartulary')).toBeNull();
    expect(openRailTab(menuEnchiridionRail, '/enchiridion', 'cards')).toBeNull();
  });

  it('keeps the committed mark while the rail is being LEFT', () => {
    // Taking a Run from the Play destination, or a Battle from the Strategikon: the address
    // is not this rail's to speak for, so the mark stays put for the fade out rather than
    // blinking off the screen the player is watching leave.
    expect(openRailTab(menuRail, '/run', 'play')).toBe('play');
    expect(openRailTab(menuRail, '/editor/level', 'editor')).toBe('editor');
    expect(openRailTab(strategikonRail, '/run', 'chartulary')).toBe('chartulary');
    expect(openRailTab(menuEnchiridionRail, '/play/select', 'lipsana')).toBe('lipsana');
  });

  it('keeps a record addressed inside a section on that section', () => {
    expect(openRailTab(menuEnchiridionRail, '/enchiridion/lipsana/royal-tent', null)).toBe('lipsana');
    expect(openRailTab(menuEnchiridionRail, '/enchiridion/cards/country-parish', null)).toBe('cards');
    expect(openRailTab(menuRail, '/play/select/skirmish', null)).toBe('play');
  });

  it('derives one sibling family per host, from the hrefs that host hands the rail', () => {
    // The same rail component, two ancestries. Each speaks only for its own.
    expect(openRailTab(menuEnchiridionRail, '/enchiridion/terrain', null)).toBe('terrain');
    expect(openRailTab(battleEnchiridionRail, '/run/strategikon/enchiridion/terrain', null)).toBe('terrain');
    expect(battleEnchiridionRail.governs('/enchiridion/terrain')).toBe(false);
    expect(menuEnchiridionRail.governs('/run/strategikon/enchiridion/terrain')).toBe(false);
    // A host builder that carries a query still yields path-only addresses.
    expect(railTabRoutePath('/run/strategikon/enchiridion/cards?run=abc#face')).toBe('/run/strategikon/enchiridion/cards');
  });

  it('does not let one tab address swallow a longer-named sibling', () => {
    expect(isRailTabAddress('/enchiridion/cards', '/enchiridion/card')).toBe(false);
    expect(isRailTabAddress('/enchiridion/cards/country-parish', '/enchiridion/cards')).toBe(true);
    expect(isRailTabAddress('/enchiridion/cards', '/enchiridion/cards')).toBe(true);
  });
});
