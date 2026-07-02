import { type ButtonHTMLAttributes, type ReactElement } from 'react';
import { navigateApp, normalizeRoutePath } from '../navigation';
import { prefetchRoute } from '../routePrefetch';

// The shared in-app navigation control (ADR-0052): a real <button> that navigates
// programmatically. Game controls are BUTTONS, not hyperlinks — no status-bar URL
// preview on hover, no link context menu, no drag ghost, no middle-click new-tab; the
// route is an address the app keeps updated (deep links, reload, back/forward all
// still work through navigateApp's pushState), not an affordance on the control.
//
// Parity with the anchors it replaces: destination warm-up (JS chunk + route data)
// runs on pointerenter/focus via the same prefetchRoute the anchor delegate uses, and
// activation flows through navigateApp — the identical gate the click interceptor
// applied. `to` accepts a thunk for targets that must be computed at ACTIVATION time
// (the title-bar gear's returnTo — this retires the stale-href rewrite hack).
//
// What stays a real <a>: the brand lockup ("links home, like a logo should"),
// /api/auth sign-in round-trips, external links, and synthetic download anchors.

interface NavButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Same-origin app target (path + optional query/hash), or a thunk resolved at hover/click time. */
  to: string | (() => string);
  replace?: boolean;
  scroll?: boolean;
}

export function NavButton({
  to,
  replace,
  scroll,
  onClick,
  onPointerEnter,
  onFocus,
  children,
  ...props
}: NavButtonProps): ReactElement {
  const resolve = (): string => (typeof to === 'function' ? to() : to);
  const warm = (): void => {
    try {
      prefetchRoute(normalizeRoutePath(new URL(resolve(), window.location.href).pathname));
    } catch {
      /* unparsable target: skip the warm; navigateApp still gates the click */
    }
  };

  return (
    <button
      type="button"
      data-nav={typeof to === 'string' ? to : undefined}
      {...props}
      onPointerEnter={(event) => { warm(); onPointerEnter?.(event); }}
      onFocus={(event) => { warm(); onFocus?.(event); }}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) navigateApp(resolve(), { replace, scroll });
      }}
    >
      {children}
    </button>
  );
}
