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

// A DRAWN scrollbar (ADR-0030). The native scrollbar is hidden; we render an always-present rail
// (a real DOM element — the browser can't hide it) plus a grip thumb that appears only when there's
// scrollable content and tracks the scroll position. Because it's DOM, the rail never vanishes on an
// empty pane AND it screenshots like any other element (native ::-webkit skins don't render in
// headless captures). Content still scrolls natively (wheel/keys); we only draw + drive the bar.
export function kitScrollMetrics({
  viewportHeight,
  scrollHeight,
  scrollTop,
  trackHeight,
}: {
  viewportHeight: number;
  scrollHeight: number;
  scrollTop: number;
  trackHeight: number;
}): { scrollable: boolean; h: number; top: number } {
  const scrollable = scrollHeight > viewportHeight + 1;
  if (!scrollable || trackHeight <= 0) return { scrollable: false, h: 0, top: 0 };

  const h = Math.min(
    trackHeight,
    Math.max(24, Math.round(trackHeight * (viewportHeight / scrollHeight))),
  );
  const maxScroll = scrollHeight - viewportHeight;
  const top = maxScroll > 0
    ? Math.round((scrollTop / maxScroll) * (trackHeight - h))
    : 0;
  return { scrollable, h, top };
}

export function kitScrollDragTarget({
  startScrollTop,
  deltaY,
  viewportHeight,
  scrollHeight,
  trackHeight,
  thumbHeight,
}: {
  startScrollTop: number;
  deltaY: number;
  viewportHeight: number;
  scrollHeight: number;
  trackHeight: number;
  thumbHeight: number;
}): number {
  const maxThumb = trackHeight - thumbHeight;
  const maxScroll = scrollHeight - viewportHeight;
  if (maxThumb <= 0 || maxScroll <= 0) return startScrollTop;
  return startScrollTop + deltaY * (maxScroll / maxThumb);
}

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
    setM(kitScrollMetrics({
      viewportHeight: el.clientHeight,
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
      if (!d || !c) return;
      c.scrollTop = kitScrollDragTarget({
        startScrollTop: d.top,
        deltaY: ev.clientY - d.y,
        viewportHeight: c.clientHeight,
        scrollHeight: c.scrollHeight,
        trackHeight: rail.current?.clientHeight ?? c.clientHeight,
        thumbHeight: d.h,
      });
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
      <div className="kit-scroll-rail" aria-hidden="true" ref={rail}>
        {m.scrollable ? (
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
