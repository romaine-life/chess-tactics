import { type ReactElement } from 'react';
import { BrandLockup } from '../shared/BrandLockup';
import { HeaderAccountCluster } from '../shared/HeaderAccountCluster';
import { titleBarConfig } from './titleBarConfig';

// The ONE persistent title bar. Rendered once in App, OUTSIDE the routed screen, so
// it stays mounted across navigation — the brand never blinks, only its contents
// update. Fixed-position with a z-index above the route-veil so it stays lit while
// the body dissolves through a heavy-route transition.
//
// The bar is an INVARIANT (ADR-0042): it ALWAYS renders the BrandLockup (leading) and
// the HeaderAccountCluster (trailing). No config can suppress either — a screen may
// only ADD typed content. Stateful screens keep dynamic state in their OWN component;
// center/stud content uses bounded portals, while ordinary controls contribute closed
// descriptions. AppTitleBar alone renders those descriptions before the divider in the
// same lane as the invariant cluster (ADR-0104).
//
// Return-to-origin ("‹ Back") is a typed before-divider contribution in the trailing
// control lane with the account/settings cluster (the app's navigation home
// per ADR-0036), NOT before the brand. The brand lockup is a fixed leading anchor and
// never moves. Settings and the Level Editor declare intent; this component owns their
// identical placement.
export function AppTitleBar({ path, search, onCenterNode, onBeforeDividerNode, onStudNode, revealTitle }: {
  path: string;
  search?: string;
  onCenterNode: (el: HTMLElement | null) => void;
  onBeforeDividerNode: (el: HTMLElement | null) => void;
  onStudNode: (el: HTMLElement | null) => void;
  // Cold-load reveal only: false while the bar is waiting its turn on a fresh menu load
  // (see ui/shell/coldReveal). Undefined/true everywhere else — the bar renders opaque,
  // so this can never blink the persistent bar on a normal route or a later navigation.
  revealTitle?: boolean;
}): ReactElement | null {
  const config = titleBarConfig(path, search);
  if (!config) return null;

  const barClass = config.barClass ? ` ${config.barClass}` : '';
  // Opt-IN hidden: only add the pending class when explicitly told to wait. Default
  // (revealTitle undefined/true) is fully visible.
  const pendingClass = revealTitle === false ? ' reveal-pending' : '';
  return (
    <header
      data-chrome-unit="outer-panel"
      data-chrome-consumer="app-titlebar"
      className={`app-titlebar settings-header-frame app-shell-titlebar chrome-family-surface chrome-rails-offscreen${barClass}${pendingClass}`}
    >
      <span className="app-titlebar-fill" aria-hidden="true" />
      <span className="app-shell-outer-divider" aria-hidden="true" />
      <span className="app-shell-rail-junction app-shell-rail-junction--control-branch" aria-hidden="true" />
      <span className="app-shell-rail-junction app-shell-rail-junction--right-continuation" aria-hidden="true" />
      <BrandLockup screenName={config.screenName} />
      {config.centerSlot ? <div className="app-shell-titlebar-center" ref={onCenterNode} /> : null}
      {/* Bottom-centre stud target: absolutely positioned over the ornament diamond (out of
          the grid), so it never shifts the brand/center/cluster tracks. Empty unless a
          single-player Skirmish portals its Retry control in. */}
      {config.studSlot ? <div className="app-shell-titlebar-stud" ref={onStudNode} /> : null}
      <span className="app-shell-rail-junction app-shell-rail-junction--persistent-divider" aria-hidden="true" />
      <div className="app-titlebar-control-lane">
        <span className="app-titlebar-contribution-target" ref={onBeforeDividerNode} />
        <span className="app-titlebar-persistent-divider" aria-hidden="true" />
        <HeaderAccountCluster signInReturnTo={config.signInReturnTo} showSettingsGear={config.showSettingsGear} />
      </div>
    </header>
  );
}
