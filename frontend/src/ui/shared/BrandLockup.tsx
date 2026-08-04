import { type ReactElement } from 'react';
import { NavButton } from './NavButton';
import { installedUiMedia } from '../installedUiMedia';

// The single brand lockup in the top-left of every screen. The game wordmark is the
// persistent header — it's the dominant line on every page — with the screen name as
// the small line beneath it. Same mark, same structure, same spot everywhere; only
// `screenName` changes. DOM order is mark-then-copy so it reads and renders top-down
// without any reordering. This is the one source; do not hand-roll a per-screen brand
// mark. Only the shield returns to the main menu (ADR-0300), as a BUTTON rather than a
// hyperlink (ADR-0052). The title, screen name, transition status, and remaining title-
// bar space are orientation copy, not an oversized navigation surface.
export function BrandLockup({
  screenName,
  routeSlot,
  transitionStatus,
}: {
  screenName: string;
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
        <strong className="brand-lockup-screen-line">
          <span className="brand-lockup-screen-name">{screenName}</span>
          {routeSlot ? <span className="brand-lockup-route" data-titlebar-portal="route" /> : null}
        </strong>
      </span>
    </div>
  );
}
