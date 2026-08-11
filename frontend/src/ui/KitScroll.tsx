import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';

const KIT_SCROLL_MIN_THUMB = 24;
const KIT_SCROLL_MAX_GUTTER_FLIPS = 2;

export interface KitScrollMetrics {
  scrollable: boolean;
  h: number;
  top: number;
}

export interface KitScrollGutter {
  reserved: boolean;
  flips: number;
  clientHeight: number;
}

export const KIT_SCROLL_INITIAL_GUTTER: KitScrollGutter = {
  reserved: true,
  flips: 0,
  clientHeight: -1,
};

/**
 * Whether the rail is drawn and its inline gutter reserved (ADR-0536): a pane
 * with nothing to scroll gives the space back to its rows instead of standing a
 * bare groove beside them.
 *
 * Collapsing the gutter WIDENS the content, and content whose height grows with
 * its width — an image grid, an aspect-ratio card lane — can overflow again at
 * that wider measure, then fit again once the gutter returns. Left alone that
 * ping-pongs forever. A horizontal gutter cannot change the viewport's height,
 * so an unchanged `clientHeight` identifies one settling episode; after two
 * flips inside it we latch to the reserved rail, ADR-0030's always-drawn state,
 * which is stable under both widths.
 */
export function resolveKitScrollGutter({ overflows, clientHeight, previous }: {
  overflows: boolean;
  clientHeight: number;
  previous: KitScrollGutter;
}): KitScrollGutter {
  const settling = previous.clientHeight === clientHeight;
  const flips = settling ? previous.flips : 0;
  const latched = flips >= KIT_SCROLL_MAX_GUTTER_FLIPS;
  const reserved = overflows === previous.reserved ? previous.reserved : latched || overflows;
  const nextFlips = reserved === previous.reserved ? flips : flips + 1;
  if (settling && reserved === previous.reserved && nextFlips === previous.flips) return previous;
  return { reserved, flips: nextFlips, clientHeight };
}

/**
 * The thumb belongs to the drawn rail, not to the content viewport. Consumers
 * may inset that rail to preserve chrome paint aprons, so its actual rendered
 * height is the only valid track for thumb size and position.
 */
export function computeKitScrollMetrics({
  clientHeight,
  scrollHeight,
  scrollTop,
  trackHeight,
}: {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  trackHeight: number;
}): KitScrollMetrics {
  const scrollable = scrollHeight > clientHeight + 1;
  const track = Math.max(0, trackHeight);
  if (!scrollable || track === 0) return { scrollable, h: 0, top: 0 };

  const h = Math.min(
    track,
    Math.max(KIT_SCROLL_MIN_THUMB, Math.round(track * (clientHeight / scrollHeight))),
  );
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const maxThumb = Math.max(0, track - h);
  const progress = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
  return { scrollable, h, top: Math.round(progress * maxThumb) };
}

// A DRAWN scrollbar (ADR-0030). The native scrollbar is hidden; we render the rail as a real DOM
// element plus a grip thumb that appears only when there's scrollable content and tracks the scroll
// position. Because it's DOM we own when it shows AND it screenshots like any other element (native
// ::-webkit skins don't render in headless captures). Content still scrolls natively (wheel/keys);
// we only draw + drive the bar.
//
// The rail is mounted unconditionally so its rendered height stays measurable, but a pane with
// nothing to scroll marks itself `data-kit-scroll-rail="collapsed"` (ADR-0536): the CSS then stops
// painting the groove and zeroes `--kit-scroll-gutter`, handing the reserved inline strip back to
// the rows. Consumers reserve their gutter FROM that token so the whole family collapses together.
export function KitScroll({ children, className, style, contentRef }: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  contentRef?: RefObject<HTMLDivElement | null>;
}): ReactElement {
  const localContent = useRef<HTMLDivElement>(null);
  const content = contentRef ?? localContent;
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; top: number; h: number } | null>(null);
  const [m, setM] = useState<{ scrollable: boolean; h: number; top: number }>({ scrollable: false, h: 0, top: 0 });
  const [gutter, setGutter] = useState<KitScrollGutter>(KIT_SCROLL_INITIAL_GUTTER);

  const recompute = (): void => {
    const el = content.current;
    const track = rail.current;
    if (!el || !track) return;
    // Read the box ONCE, here, where we are already measuring. `clientHeight` used to be read
    // inside the setGutter updater below — and React runs an updater during the RENDER phase,
    // re-running it whenever it re-renders before the state settles. That put a forced synchronous
    // layout inside every render of every scrolling pane in the app, paid against whatever the
    // pane happens to contain: on the Enchiridion's 284-card gallery it was hundreds of
    // milliseconds, inside a commit the browser cannot paint through.
    const clientHeight = el.clientHeight;
    const metrics = computeKitScrollMetrics({
      clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      trackHeight: track.clientHeight,
    });
    setM(metrics);
    setGutter((previous) => resolveKitScrollGutter({
      overflows: metrics.scrollable,
      clientHeight,
      previous,
    }));
  };

  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    if (rail.current) ro.observe(rail.current);
    const mo = new MutationObserver(recompute);
    mo.observe(el, { childList: true, subtree: true, attributes: true });
    return () => { ro.disconnect(); mo.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onThumbDown = (e: ReactMouseEvent): void => {
    e.preventDefault();
    const el = content.current;
    if (!el) return;
    drag.current = { y: e.clientY, top: el.scrollTop, h: m.h };
    const move = (ev: MouseEvent): void => {
      const d = drag.current;
      const c = content.current;
      const track = rail.current;
      if (!d || !c || !track) return;
      const maxThumb = track.clientHeight - d.h;
      const maxScroll = c.scrollHeight - c.clientHeight;
      if (maxThumb <= 0) return;
      c.scrollTop = d.top + (ev.clientY - d.y) * (maxScroll / maxThumb);
    };
    const up = (): void => {
      drag.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div
      className={`kit-scroll-wrap ${className ?? ''}`.trim()}
      style={style}
      data-kit-scroll-rail={gutter.reserved ? 'reserved' : 'collapsed'}
    >
      <div className="kit-scroll-content" ref={content} onScroll={recompute}>
        {children}
      </div>
      <div className="kit-scroll-rail" ref={rail} aria-hidden="true">
        {m.scrollable && m.h > 0 ? (
          <div
            className="kit-scroll-thumb"
            style={{ height: `${m.h}px`, transform: `translateY(${m.top}px)` }}
            onMouseDown={onThumbDown}
          />
        ) : null}
      </div>
    </div>
  );
}
