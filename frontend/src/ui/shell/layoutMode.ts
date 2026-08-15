import { useSyncExternalStore } from 'react';

/**
 * The application's layout MODE — one signal, read the same way by CSS and by components.
 *
 * Why a mode and not a media query.
 *
 * This app's chrome is installed art with real contracts: which edge of a panel is interior,
 * what hides under a rail, which box owns the scroll. Every one of those was decided for a
 * full-height desktop dock. A phone does not want that composition made smaller — it wants a
 * different one. Expressing "different composition" as a pile of CSS overrides inside a media
 * query has failed here repeatedly and in exactly one way: media queries add NO specificity, so
 * an override loses to any later rule of equal weight. The Controls panel frame is the worked
 * example. A narrow-band rule zeroed its border with `!important` at line ~10262 of style.css,
 * and the offscreen-rails contract ~8000 lines further down set the same property with the same
 * specificity and the same `!important` — so it won on source order alone, and the panel kept a
 * left rail that four separate attempts could not remove. Nothing about the override was wrong;
 * subtracting a composition after the fact is what was wrong.
 *
 * A mode makes the question structural instead. `useAppLayoutMode()` lets a component render a
 * DIFFERENT TREE — the mobile Controls panel simply is not the framed outer-panel unit, so there
 * is no frame to subtract and source order stops mattering. `data-app-layout` on the root element
 * carries the same answer to CSS for the cases that genuinely are styling.
 *
 * There is ONE width in the app, stated here. The stylesheet's mobile band must use the same
 * number; `scripts/check-mobile-breakpoint.mjs` fails the build if the two drift apart.
 *
 * The width covers phones in both orientations (390x844 and 844x390), the tallest phone landscape
 * (932x430), and tablet portrait (768x1024). Tablet landscape gets the desktop composition, which
 * is what it has room for. Width is the signal, not pointer type: `/mobile-lab` mounts real routes
 * in same-origin iframes at exact device sizes, and an iframe reports a FINE pointer — keying off
 * the pointer would make the lab show desktop layouts of the very screens under review.
 */
export type AppLayoutMode = 'desktop' | 'mobile';

export const MOBILE_LAYOUT_MAX_WIDTH = 960;

export const MOBILE_LAYOUT_QUERY = `(max-width: ${MOBILE_LAYOUT_MAX_WIDTH}px)`;

const listeners = new Set<() => void>();
let current: AppLayoutMode = 'desktop';
let published = false;
let watching = false;

function measure(): AppLayoutMode {
  if (typeof window === 'undefined') return 'desktop';
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches ? 'mobile' : 'desktop';
}

function publish(next: AppLayoutMode): void {
  if (published && next === current) return;
  published = true;
  current = next;
  document.documentElement.setAttribute('data-app-layout', next);
  for (const listener of listeners) listener();
}

/**
 * Start answering, and keep answering. Idempotent: the hook calls it too, so a component can
 * read the mode without depending on the entry module having got there first.
 *
 * `index.html` sets the same attribute inline before first paint so the page does not flash a
 * desktop composition on a phone. That is a paint optimisation, nothing more — this module
 * re-derives the mode from the live media query and overwrites whatever the bootstrap guessed,
 * so the two can never disagree for longer than a frame.
 */
export function installAppLayoutMode(): void {
  if (typeof window === 'undefined') return;
  if (!watching) {
    watching = true;
    window.matchMedia(MOBILE_LAYOUT_QUERY).addEventListener('change', () => publish(measure()));
  }
  publish(measure());
}

function subscribe(listener: () => void): () => void {
  installAppLayoutMode();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function snapshot(): AppLayoutMode {
  installAppLayoutMode();
  return current;
}

/** The server snapshot is desktop: static rendering has no viewport to measure. */
function serverSnapshot(): AppLayoutMode {
  return 'desktop';
}

export function useAppLayoutMode(): AppLayoutMode {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function useIsMobileLayout(): boolean {
  return useAppLayoutMode() === 'mobile';
}
