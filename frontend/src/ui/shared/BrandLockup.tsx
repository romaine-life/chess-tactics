import { type ReactElement, type ReactNode } from 'react';
import { NavButton } from './NavButton';
import { installedUiMedia } from '../installedUiMedia';

// The single brand lockup in the top-left of every screen. The game wordmark is the
// persistent header — it's the dominant line on every page — with the screen name as
// the small line beneath it. Same mark, same structure, same spot everywhere; only
// `screenName` changes. DOM order is mark-then-copy so it reads and renders top-down
// without any reordering. This is the one source; do not hand-roll a per-screen brand
// mark. The shield returns to the main menu (ADR-0300), as a BUTTON rather than a
// hyperlink (ADR-0052). When the screen-name line is a route, its base segment is
// also a NavButton; the rest of the title-bar track remains orientation copy.
export function BrandLockup({
  screenName,
  screenNameTo,
  routeContent,
  routeSlot,
  transitionStatus,
}: {
  screenName: string;
  /** Canonical base address when the screen-name line is a clickable route. */
  screenNameTo?: string;
  /** App-owned address-derived breadcrumb segments, rendered without scene activation. */
  routeContent?: ReactNode;
  // Render the route portal target after the screen name. A screen whose position
  // within itself is state rather than address (the Run's phase) fills it through
  // <TitleBarSlot region="route">, so the screen-name line reads as one route —
  // Run › Sectio — instead of that position taking up a status chip.
  routeSlot?: boolean;
  transitionStatus?: string | null;
}): ReactElement {
  return (
    <div className="brand-lockup-layout">
      <NavButton className="brand-lockup" to="/" aria-label="Chess Tactics main menu">
        <img className="brand-lockup-mark" src={installedUiMedia('ui-kit-icons-brand-shield-png')} alt="" aria-hidden="true" />
      </NavButton>
      <span className="brand-lockup-copy">
        <span className="brand-lockup-title-line">
          <em>Chess Tactics</em>
          {transitionStatus ? <span className="brand-lockup-transition-status" role="status">{transitionStatus}</span> : null}
        </span>
        <strong
          className="brand-lockup-screen-line"
          role={screenNameTo || routeContent || routeSlot ? 'navigation' : undefined}
          aria-label={screenNameTo || routeContent || routeSlot ? 'Title route' : undefined}
        >
          {screenNameTo ? (
            <NavButton className="brand-lockup-screen-name title-route-button" to={screenNameTo}>
              {screenName}
            </NavButton>
          ) : <span className="brand-lockup-screen-name">{screenName}</span>}
          {routeContent ? <span className="brand-lockup-route">{routeContent}</span> : null}
          {routeSlot ? <span className="brand-lockup-route" data-titlebar-portal="route" /> : null}
        </strong>
      </span>
    </div>
  );
}
