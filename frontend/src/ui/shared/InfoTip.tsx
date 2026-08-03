import { useCallback, useId, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { InnerChromeBox } from './ChromeBox';

interface TooltipPosition {
  left: number;
  top: number;
}

function useTooltipPosition<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [pos, setPos] = useState<TooltipPosition | null>(null);
  const focused = useRef(false);
  const hovered = useRef(false);

  const show = useCallback(() => {
    const trigger = ref.current;
    const r = trigger?.getBoundingClientRect();
    if (!trigger || !r) return;
    // Below the trigger, clamped so a wide tip never runs off the viewport. A
    // trigger inside the persistent title bar clears the whole bar instead: the
    // bar is taller than the mark it frames and paints over anything under it,
    // so "below the trigger" would put the tip's first line behind the chrome.
    const bar = trigger.closest('.app-shell-titlebar');
    const below = (bar ?? trigger).getBoundingClientRect().bottom + 6;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 300)), top: below });
  }, []);
  const hide = useCallback(() => setPos(null), []);
  const onMouseEnter = useCallback(() => {
    hovered.current = true;
    show();
  }, [show]);
  const onMouseLeave = useCallback(() => {
    hovered.current = false;
    if (!focused.current) hide();
  }, [hide]);
  const onFocus = useCallback(() => {
    focused.current = true;
    show();
  }, [show]);
  const onBlur = useCallback(() => {
    focused.current = false;
    if (!hovered.current) hide();
  }, [hide]);

  return { ref, pos, hide, onBlur, onFocus, onMouseEnter, onMouseLeave };
}

function TooltipPopup({
  children,
  className = '',
  id,
  maxInlineSize = 256,
  pos,
  portalHost,
}: {
  children: ReactNode;
  className?: string;
  id: string;
  maxInlineSize?: number;
  pos: TooltipPosition | null;
  portalHost: Element | null;
}): ReactElement | null {
  if (!pos || typeof document === 'undefined') return null;
  return createPortal((
    <span
      // The popup is portalled out of its trigger's subtree, so it carries the
      // chrome family scope with it. Without this an inner-box that escapes to
      // <body> — a tooltip on the persistent title bar, which lives outside every
      // screen <main> — renders as unframed floating text.
      className="tooltip-pop-positioner chrome-family-surface"
      style={{ left: pos.left, maxInlineSize, top: pos.top }}
    >
      <InnerChromeBox
        as="span"
        role="tooltip"
        id={id}
        className={`infotip-pop tooltip-pop ${className}`.trim()}
      >
        {children}
      </InnerChromeBox>
    </span>
  ), portalHost ?? document.body);
}

// Canonical tooltip for an existing visual trigger. It appears immediately on
// hover or keyboard focus and uses fixed positioning so scrolling containers do
// not clip it. Keep native title="" off consumers of this primitive.
export function Tooltip({
  trigger,
  children,
  label,
  className = '',
  popupMaxInlineSize = 256,
  popupClassName = '',
  triggerClassName = '',
  focusable = true,
}: {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
  className?: string;
  popupMaxInlineSize?: number;
  popupClassName?: string;
  triggerClassName?: string;
  focusable?: boolean;
}): ReactElement {
  const id = useId();
  const {
    ref,
    pos,
    hide,
    onBlur,
    onFocus,
    onMouseEnter,
    onMouseLeave,
  } = useTooltipPosition<HTMLSpanElement>();
  const portalHost = typeof document === 'undefined' ? null : ref.current?.closest('main') ?? document.body;

  return (
    <span
      className={`tooltip ${className}`.trim()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        ref={ref}
        className={`tooltip-trigger ${triggerClassName}`.trim()}
        tabIndex={focusable ? 0 : undefined}
        aria-label={focusable ? label : undefined}
        aria-hidden={focusable ? undefined : 'true'}
        aria-describedby={focusable && pos ? id : undefined}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === 'Escape') hide();
        }}
      >
        {trigger}
      </span>
      <TooltipPopup
        id={id}
        pos={pos}
        portalHost={portalHost}
        className={popupClassName}
        maxInlineSize={popupMaxInlineSize}
      >
        {children}
      </TooltipPopup>
    </span>
  );
}

// A compact "i" that reveals a short explanation on hover AND keyboard focus — the
// canonical way to explain a control (ADR-0059): reuse this instead of a native
// title="" (which truncates / delays / vanishes) or a bespoke popover. The tip is
// position:fixed, placed from the icon's rect, so it never clips inside a scrolling
// panel (the Studio rails are overflow:auto). Styles live in style.css (.infotip*).
export function InfoTip({ children, label = 'More info' }: { children: ReactNode; label?: string }): ReactElement {
  const id = useId();
  const {
    ref,
    pos,
    onBlur,
    onFocus,
    onMouseEnter,
    onMouseLeave,
  } = useTooltipPosition<HTMLButtonElement>();
  const portalHost = typeof document === 'undefined' ? null : ref.current?.closest('main') ?? document.body;

  return (
    <span className="infotip" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <button
        ref={ref}
        type="button"
        className="infotip-dot"
        aria-label={label}
        aria-describedby={pos ? id : undefined}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={(e) => e.preventDefault()}
      >
        i
      </button>
      <TooltipPopup id={id} pos={pos} portalHost={portalHost}>{children}</TooltipPopup>
    </span>
  );
}
