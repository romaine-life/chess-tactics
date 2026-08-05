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

export interface KitScrollMetrics {
  scrollable: boolean;
  h: number;
  top: number;
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

// A DRAWN scrollbar (ADR-0030). The native scrollbar is hidden; we render an always-present rail
// (a real DOM element — the browser can't hide it) plus a grip thumb that appears only when there's
// scrollable content and tracks the scroll position. Because it's DOM, the rail never vanishes on an
// empty pane AND it screenshots like any other element (native ::-webkit skins don't render in
// headless captures). Content still scrolls natively (wheel/keys); we only draw + drive the bar.
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

  const recompute = (): void => {
    const el = content.current;
    const track = rail.current;
    if (!el || !track) return;
    setM(computeKitScrollMetrics({
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      trackHeight: track.clientHeight,
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
    <div className={`kit-scroll-wrap ${className ?? ''}`.trim()} style={style}>
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
