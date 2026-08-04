import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chromeFamilyPortalHost } from '../chromeFamilyRuntime';
import { ChromeSurfaceFill, InnerChromeBox } from './ChromeBox';
import { readTooltipGlossary } from './tooltipGlossary';
import type { RunGlossaryEntry } from '../../run/glossary';

interface TooltipPosition {
  left: number;
  /** Where the stack starts when it hangs below the trigger, the normal case. */
  top: number;
  /** The trigger's own top edge, so an overflowing stack can hang above it instead. */
  anchorTop: number;
}

function useTooltipPosition<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [pos, setPos] = useState<TooltipPosition | null>(null);
  const focused = useRef(false);
  const hovered = useRef(false);

  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // Below the trigger, clamped so a wide tip never runs off the viewport. Every
    // trigger measures the same way, including one in the persistent title bar: a
    // tip sits the same distance from the thing it explains wherever that thing is.
    setPos({
      anchorTop: r.top,
      left: Math.max(8, Math.min(r.left, window.innerWidth - 300)),
      top: r.bottom + 6,
    });
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

/** One framed pop. The stack renders the tip itself and one of these per named term. */
function TooltipPane({
  children,
  className,
  id,
  title,
}: {
  children: ReactNode;
  className: string;
  id?: string;
  title?: ReactNode;
}): ReactElement {
  return (
    <InnerChromeBox
      as="span"
      role="tooltip"
      id={id}
      className={className}
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
  );
}

/**
 * The tip and the definitions of every mechanic it names, as one column under the
 * trigger (ADR-0370). Stacking beats nesting: the pops stay non-interactive, so a
 * definition reaches the reader on the same hover that raised the tip, with no
 * second target to find and nothing to keep hovered on the way there.
 */
function TooltipStack({
  children,
  className,
  glossary,
  id,
  maxInlineSize,
  pos,
  title,
}: {
  children: ReactNode;
  className: string;
  glossary: readonly RunGlossaryEntry[];
  id: string;
  maxInlineSize: number;
  pos: TooltipPosition;
  title?: ReactNode;
}): ReactElement {
  const stackRef = useRef<HTMLSpanElement | null>(null);
  const [top, setTop] = useState(pos.top);

  // A definition column is taller than the one pop this placement was written for, so
  // the stack is measured once it exists and hung above the trigger when hanging below
  // would run it off the bottom of the viewport.
  useLayoutEffect(() => {
    const height = stackRef.current?.getBoundingClientRect().height ?? 0;
    const lowest = window.innerHeight - 8 - height;
    if (height === 0 || pos.top <= lowest) {
      setTop(pos.top);
      return;
    }
    const above = pos.anchorTop - 6 - height;
    setTop(above >= 8 ? above : Math.max(8, lowest));
  }, [glossary, pos.anchorTop, pos.top]);

  return (
    <span
      className="tooltip-pop-positioner"
      ref={stackRef}
      style={{ left: pos.left, maxInlineSize, top }}
    >
      <TooltipPane className={`infotip-pop tooltip-pop ${className}`.trim()} id={id} title={title}>
        {children}
      </TooltipPane>
      {glossary.map((entry) => (
        <TooltipPane
          className="infotip-pop tooltip-pop tooltip-keyword-pop"
          id={`${id}-${entry.id}`}
          key={entry.id}
          title={entry.term}
        >
          <span>{entry.definition}</span>
        </TooltipPane>
      ))}
    </span>
  );
}

function TooltipPopup({
  children,
  className = '',
  glossary = [],
  id,
  maxInlineSize = 256,
  pos,
  portalHost,
  title,
}: {
  children: ReactNode;
  className?: string;
  glossary?: readonly RunGlossaryEntry[];
  id: string;
  maxInlineSize?: number;
  pos: TooltipPosition | null;
  portalHost: Element | null;
  title?: ReactNode;
}): ReactElement | null {
  if (!pos || typeof document === 'undefined') return null;
  return createPortal((
    <TooltipStack
      className={className}
      glossary={glossary}
      id={id}
      maxInlineSize={maxInlineSize}
      pos={pos}
      title={title}
    >
      {children}
    </TooltipStack>
  ), portalHost ?? document.body);
}

// Canonical tooltip for an existing visual trigger. It appears immediately on
// hover or keyboard focus and uses fixed positioning so scrolling containers do
// not clip it. Keep native title="" off consumers of this primitive.
//
// `title` is the named thing the tip is about — a lipsanon, an ability, a card
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
  explainMechanics = true,
  style,
  suppressed = false,
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
  /**
   * Resolve named Run mechanics into definition panes (ADR-0370). Ataraxia's
   * cumulative rule list is the one closed exception: its own rows need the
   * popup's vertical budget, and the Enchiridion remains the full reference.
   */
  explainMechanics?: boolean;
  /** Custom properties the trigger's own treatment reads. Not for surface paint. */
  style?: CSSProperties;
  /**
   * Hold the pop closed regardless of hover or focus. For a trigger that is leaving the
   * screen: `pointer-events: none` does not end a hover the pointer is already inside — the
   * browser only re-tests on the next move — so a tip can outlive the thing it describes.
   */
  suppressed?: boolean;
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
  const { content, entries } = useMemo(() => (
    explainMechanics
      ? readTooltipGlossary(children, title)
      : { content: children, entries: [] }
  ), [children, explainMechanics, title]);
  // Every pane in the stack describes the trigger, so a keyboard reader hears the
  // definitions the sighted reader was just handed.
  const describedBy = [id, ...entries.map((entry) => `${id}-${entry.id}`)].join(' ');

  return (
    <span
      className={`tooltip ${className}`.trim()}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        ref={ref}
        className={`tooltip-trigger ${triggerClassName}`.trim()}
        tabIndex={focusable ? 0 : undefined}
        aria-label={focusable ? label : undefined}
        aria-hidden={focusable ? undefined : 'true'}
        aria-describedby={focusable && pos && !suppressed ? describedBy : undefined}
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
        pos={suppressed ? null : pos}
        portalHost={portalHost}
        className={popupClassName}
        glossary={entries}
        maxInlineSize={popupMaxInlineSize}
        title={title}
      >
        {content}
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
  const { content, entries } = useMemo(() => readTooltipGlossary(children, null), [children]);
  const describedBy = [id, ...entries.map((entry) => `${id}-${entry.id}`)].join(' ');

  return (
    <span className="infotip" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <button
        ref={ref}
        type="button"
        className="infotip-dot"
        aria-label={label}
        aria-describedby={pos ? describedBy : undefined}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={(e) => e.preventDefault()}
      >
        i
      </button>
      <TooltipPopup glossary={entries} id={id} pos={pos} portalHost={portalHost}>{content}</TooltipPopup>
    </span>
  );
}
