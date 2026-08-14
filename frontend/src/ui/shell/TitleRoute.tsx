import { Fragment, useLayoutEffect, useRef, type ReactElement, type RefObject } from 'react';
import { NavButton } from '../shared/NavButton';

/** One canonical destination in the persistent title breadcrumb. */
export interface TitleRouteSegment {
  label: string;
  to: string;
}

/**
 * Read ONCE, at import time, for the same reason FittedTabLabel does: touching
 * `document.fonts.ready` settles the font set and forces a document-wide style recalc, and the
 * title bar is mounted for the whole app — it would pay that on every route change.
 */
const FONTS_READY: Promise<unknown> = typeof document !== 'undefined' && document.fonts
  ? document.fonts.ready
  : Promise.resolve();

/**
 * The order a crumb is given up in when the trail does not fit, ascending. The place you
 * actually ARE is never given up; the middle goes first and shallowest-first, so the ancestor
 * nearest your position is the last name to survive; and the screen the route names goes last
 * of all, because until then it is the one thing that still says which trail this is.
 */
function shedOrder(index: number, last: number): number | undefined {
  if (index === last) return undefined;
  return index === 0 ? last : index;
}

/**
 * Fit the trail to the width the brand column was given by shedding WHOLE crumbs, marking the
 * gap with a single ellipsis.
 *
 * The alternative — letting crumbs narrow — is what shipped, and it does not degrade, it
 * collides: every crumb and every separator gave up a share of itself at once, so at 1440 on
 * `Run › Battle › Strategikon › Chartulary` the line read `RUN › BATTLESTRATEGIKONCHARTUL`,
 * words painted over the separators between them. Narrowing is now refused outright in CSS
 * (`.title-route-button { flex: none }`); this chooses what to drop instead.
 *
 * Truncating crumbs into ellipses was the other candidate and it cannot reach far enough: at
 * 1280 the column offers the trail 115px, and the last crumb plus the two separators bracketing
 * an elided middle already want 126px. Only removing whole elements — separator and all — gets
 * `Run › … › Chartulary` onto that screen.
 *
 * Every pass starts by putting the WHOLE trail back. The brand column is `justify-self: start`,
 * so it shrink-wraps to what is rendered: measured while crumbs are already shed it reports the
 * shed width back as the space available, and the trail could never learn that a wider window
 * had given it room again.
 */
function useTitleRouteFit(shellRef: RefObject<HTMLSpanElement | null>, trail: string): void {
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;

    let frame = 0;
    let cancelled = false;

    const fit = (): void => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (cancelled) return;

        const shed = new Map<number, HTMLElement[]>();
        for (const element of shell.querySelectorAll<HTMLElement>('[data-title-route-shed]')) {
          const order = Number(element.dataset.titleRouteShed);
          shed.set(order, [...(shed.get(order) ?? []), element]);
        }
        const elision = [...shell.querySelectorAll<HTMLElement>('[data-title-route-elision]')];

        for (const group of shed.values()) for (const element of group) element.hidden = false;
        for (const element of elision) element.hidden = true;

        // The rounded box against the rounded content, so a sub-pixel column does not read as
        // an overflow and cost the trail a name it had room for.
        const overflowing = (): boolean => shell.scrollWidth > shell.clientWidth + 1;
        if (!elision.length || !overflowing()) return;

        for (const element of elision) element.hidden = false;
        for (const order of [...shed.keys()].sort((left, right) => left - right)) {
          for (const element of shed.get(order) ?? []) element.hidden = true;
          if (!overflowing()) return;
        }
      });
    };

    fit();
    window.addEventListener('resize', fit);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(shell);
    void FONTS_READY.then(() => {
      if (!cancelled) fit();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', fit);
      observer?.disconnect();
    };
  }, [shellRef, trail]);
}

/**
 * Clickable route segments contributed after the App-owned screen-name segment.
 * These are frameless NavButtons because the breadcrumb is itself navigation, not
 * an arbitrary title-bar action competing for the typed trailing control lane.
 *
 * A crumb is shed together with the separator that FOLLOWS it, so a shed name never leaves a
 * stranded `›` behind. The ellipsis carries its own trailing separator for the same reason: it
 * takes the place of a name, so it needs the mark that a name would have had after it.
 */
export function TitleRoute({ segments }: { segments: readonly TitleRouteSegment[] }): ReactElement {
  const shellRef = useRef<HTMLSpanElement | null>(null);
  const last = segments.length - 1;
  useTitleRouteFit(shellRef, segments.map((segment) => segment.label).join('›'));

  return (
    <span className="title-route-segments" ref={shellRef}>
      {segments.map((segment, index) => (
        <Fragment key={`${index}:${segment.to}`}>
          {index > 0 ? (
            <span
              className="title-route-separator"
              aria-hidden="true"
              data-title-route-shed={shedOrder(index - 1, last)}
            >
              ›
            </span>
          ) : null}
          {index === 1 ? (
            <>
              <span className="title-route-elision" aria-hidden="true" data-title-route-elision="" hidden>…</span>
              <span className="title-route-separator" aria-hidden="true" data-title-route-elision="" hidden>›</span>
            </>
          ) : null}
          <NavButton
            className="title-route-button"
            data-title-route-shed={shedOrder(index, last)}
            to={segment.to}
            aria-current={index === segments.length - 1 ? 'location' : undefined}
          >
            {segment.label}
          </NavButton>
        </Fragment>
      ))}
    </span>
  );
}
