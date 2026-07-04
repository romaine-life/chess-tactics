import { useCallback, useId, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

// A compact "i" that reveals a short explanation on hover AND keyboard focus — the
// canonical way to explain a control (ADR-0059): reuse this instead of a native
// title="" (which truncates / delays / vanishes) or a bespoke popover. The tip is
// position:fixed, placed from the icon's rect, so it never clips inside a scrolling
// panel (the Studio rails are overflow:auto). Styles live in style.css (.infotip*).
export function InfoTip({ children, label = 'More info' }: { children: ReactNode; label?: string }): ReactElement {
  const id = useId();
  const ref = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // Below the icon, clamped so a wide tip never runs off the right/left edge.
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 268)), top: r.bottom + 6 });
  }, []);
  const hide = useCallback(() => setPos(null), []);

  return (
    <span className="infotip" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={ref}
        type="button"
        className="infotip-dot"
        aria-label={label}
        aria-describedby={pos ? id : undefined}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => e.preventDefault()}
      >
        i
      </button>
      {pos ? (
        <span role="tooltip" id={id} className="infotip-pop" style={{ left: pos.left, top: pos.top }}>
          {children}
        </span>
      ) : null}
    </span>
  );
}
