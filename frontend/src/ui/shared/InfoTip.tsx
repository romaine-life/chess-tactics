import { useCallback, useId, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chromeFamilyPortalHost } from '../chromeFamilyRuntime';
import { ChromeSurfaceFill, InnerChromeBox } from './ChromeBox';

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

  // The pop is portalled out of the trigger's scrolling panel, so it must be
  // re-homed inside the chrome family surface. Portalling to <main> or <body>
  // (both sit outside it) leaves the pop with no frame and no fill.
  const portalHost = chromeFamilyPortalHost(ref.current);

  return { ref, pos, hide, onBlur, onFocus, onMouseEnter, onMouseLeave, portalHost };
}

function TooltipPopup({
  children,
  className = '',
  id,
  maxInlineSize = 256,
  pos,
  portalHost,
  title,
}: {
  children: ReactNode;
  className?: string;
  id: string;
  maxInlineSize?: number;
  pos: TooltipPosition | null;
  portalHost: Element | null;
  title?: ReactNode;
}): ReactElement | null {
  if (!pos || typeof document === 'undefined') return null;
  return createPortal((
    <span
      className="tooltip-pop-positioner"
      style={{ left: pos.left, maxInlineSize, top: pos.top }}
    >
      <InnerChromeBox
        as="span"
        role="tooltip"
        id={id}
        className={`infotip-pop tooltip-pop ${className}`.trim()}
      >
        {/* A tip floats over live artwork with nothing behind it, so it beds on an
            installed OPAQUE surface first and takes the inner role's tint over that.
            The role's fill alone is a translucent tint — correct on a panel that
            already has a surface, wrong here: the art underneath tinted the type and
            made the same tooltip read differently in the title bar than on a screen. */}
        <ChromeSurfaceFill surface="baseline-stone-blue" className="tooltip-pop-fill" />
        <ChromeSurfaceFill role="inner" className="tooltip-pop-fill" />
        {title ? <strong className="tooltip-title">{title}</strong> : null}
        {/* An ELEMENT, always: a bare text child cannot be lifted above the fills
            and would be painted over by the tip's own bed. */}
        <span className="tooltip-body">{children}</span>
      </InnerChromeBox>
    </span>
  ), portalHost ?? document.body);
}

// Canonical tooltip for an existing visual trigger. It appears immediately on
// hover or keyboard focus and uses fixed positioning so scrolling containers do
// not clip it. Keep native title="" off consumers of this primitive.
//
// `title` is the named thing the tip is about — a relic, an ability, a card
// property — and children are its explanation. The pop owns the whole treatment
// (grid, gaps, display face for the title, body face for the rest), so a caller
// never restates it: a popupClassName is for sizing, not for typography.
export function Tooltip({
  trigger,
  children,
  label,
  title,
  className = '',
  popupMaxInlineSize = 256,
  popupClassName = '',
  triggerClassName = '',
  focusable = true,
}: {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
  title?: ReactNode;
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
    portalHost,
  } = useTooltipPosition<HTMLSpanElement>();

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
        title={title}
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
    portalHost,
  } = useTooltipPosition<HTMLButtonElement>();

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
