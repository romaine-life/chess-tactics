// Which menu-language rail tab wears the OPEN mark — the `›` at a tab's trailing edge that
// says "this is the one that is expanded".
//
// The mark answers a question the cyan active ring cannot, because the two are bound to
// DIFFERENT clocks and that is deliberate:
//
//   * `active` (the ring) wears the COMMITTED scene's identity. App's `path` advances only
//     when the director accepts exit-finished, so on every rail whose destination fades —
//     the main menu's, the Strategikon's, the Enchiridion's — the ring lights a beat after
//     the press, once the crossfade has run. ADR-0369 wants it that way: the ring is a claim
//     about what is ON SCREEN.
//   * The open mark wears the player's INTENT. It appears on the press, before anything has
//     faded, because it answers "which button did I just take?" — a question about the RAIL,
//     not about the screen. Nothing here touches the transition; the destination still
//     commits, fades, and paints on exactly the schedule it always did.
//
// The address is the intent. `subscribeAppLocation` is the one subscription path for it
// (navigation.ts), and it is already ahead of the committed scene: navigateApp pushes the
// new address synchronously on the click, so a live read of window.location IS the pressed
// tab, with no click-tracking state to go stale. It also comes with the three behaviours a
// remembered click would each have to reimplement: a browser Back moves the mark, a
// navigation a blocker refuses never moves it (blockers run BEFORE pushState), and a deep
// link arrives with the right tab already marked.

import { useSyncExternalStore } from 'react';
import { normalizeRoutePath, subscribeAppLocation } from '../navigation';

/**
 * The path the player has ASKED for — ahead of the committed scene while one is fading.
 *
 * Guarded for a missing window because this is also `useSyncExternalStore`'s SERVER snapshot, so
 * it runs wherever a rail tab is rendered to a string — which every node-environment component
 * test does.
 */
export function readLocationIntentPath(): string {
  if (typeof window === 'undefined') return '/';
  return normalizeRoutePath(window.location.pathname);
}

/** `readLocationIntentPath` as reactive state. Re-renders on app navigation and on Back/Forward. */
export function useLocationIntentPath(): string {
  return useSyncExternalStore(
    subscribeAppLocation,
    readLocationIntentPath,
    readLocationIntentPath,
  );
}

/**
 * The addresses one rail speaks for, and which of its tabs each one opens.
 *
 * `governs` must admit the rail's own "nothing open" root as well as its tabs — that root is
 * what a main-menu tab navigates to when it is pressed a second time to COLLAPSE, and the
 * mark has to go out on that press just as promptly as it came on.
 */
export interface RailAddressFamily<Tab> {
  governs: (path: string) => boolean;
  select: (path: string) => Tab | null;
}

/**
 * The tab wearing the open mark: the intended one while the intent stays inside this rail's
 * own addresses, and otherwise the committed one.
 *
 * The fallback is what keeps a rail honest as it LEAVES. Taking a Run choice from the Play
 * destination addresses `/run`, which the main menu's rail does not speak for at all; without
 * the fallback every mark in the rail would blink out for the length of the fade the player is
 * watching it leave through. An address the rail does govern is always obeyed, including one
 * that opens no tab.
 */
export function openRailTab<Tab>(
  family: RailAddressFamily<Tab>,
  intentPath: string,
  committed: Tab | null,
): Tab | null {
  return family.governs(intentPath) ? family.select(intentPath) : committed;
}

/** `openRailTab` against the live address. */
export function useOpenRailTab<Tab>(family: RailAddressFamily<Tab>, committed: Tab | null): Tab | null {
  return openRailTab(family, useLocationIntentPath(), committed);
}

/** The route path a tab's `to` address points at, with any query or hash dropped. */
export function railTabRoutePath(href: string): string {
  return normalizeRoutePath(href.split(/[?#]/, 1)[0] ?? href);
}

/** Whether `path` is a rail tab's own address or something addressed underneath it. */
export function isRailTabAddress(path: string, tabPath: string): boolean {
  return path === tabPath || path.startsWith(`${tabPath}/`);
}

/** The live address including its query — see `railTabAddressMatches` for why the query matters. */
export function useLocationIntentAddress(): { path: string; search: string } {
  const path = useLocationIntentPath();
  const search = useSyncExternalStore(
    subscribeAppLocation,
    () => window.location.search,
    () => '',
  );
  return { path, search };
}

/**
 * Whether the live address is the one a rail tab opens.
 *
 * Path alone is not enough, because not every shell addresses its sections by path. The Campaign
 * Editor's grammar is path PLUS query — `/editor/wars` is a path, `?collection=unassigned` and
 * `?campaign=<id>` are queries — so comparing paths marked its Levels tab and every campaign tab
 * identically (all of them normalize to `/editor`) and left the mark stuck.
 *
 * A tab whose address carries query parameters is open only when the live address carries all of
 * them; extra parameters the tab does not name are ignored, so an unrelated `?returnTo=` cannot
 * unmark it. A tab with no query of its own keeps the plain path rule, including addresses nested
 * underneath it.
 */
export function railTabAddressMatches(
  intent: { path: string; search: string },
  address: string,
): boolean {
  if (!isRailTabAddress(intent.path, railTabRoutePath(address))) return false;
  const query = address.split('?', 2)[1]?.split('#', 1)[0] ?? '';
  if (!query) return true;
  const wanted = new URLSearchParams(query);
  const live = new URLSearchParams(intent.search);
  for (const [key, value] of wanted) if (live.get(key) !== value) return false;
  return true;
}

/**
 * The family of a rail whose tabs are SIBLINGS under one root — `/enchiridion/units`,
 * `/enchiridion/cards`, and so on. Their shared parent is the root, which is also the rail's
 * own "nothing open" address, so the rail derives what it speaks for from the addresses its
 * HOST hands it rather than naming a prefix it may not own: the Enchiridion's section rail
 * mounts under `/enchiridion/…` on the main menu and `/run|/play/strategikon/enchiridion/…`
 * inside the Strategikon, and one rule has to serve both.
 *
 * A record addressed inside a tab — one lipsanon, one card face — belongs to that tab.
 */
export function siblingRailAddresses<Tab extends string>(
  tabs: readonly Tab[],
  hrefOf: (tab: Tab) => string,
): RailAddressFamily<Tab> {
  const pathOf = (tab: Tab): string => railTabRoutePath(hrefOf(tab));
  const root = pathOf(tabs[0]).replace(/\/[^/]+$/, '') || '/';
  return {
    governs: (path) => isRailTabAddress(path, root),
    select: (path) => tabs.find((tab) => isRailTabAddress(path, pathOf(tab))) ?? null,
  };
}
