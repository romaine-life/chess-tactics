import { useEffect, type ReactElement } from 'react';
import { BrandLockup } from '../shared/BrandLockup';
import { HeaderAccountCluster } from '../shared/HeaderAccountCluster';
import { decodeShellChromeArt } from './shellChromeArt';
import { useStartupScene } from './startupScene';
import { titleBarConfig } from './titleBarConfig';

// The ONE persistent title bar. Rendered once in App outside the replaceable
// SceneBoundary, so the bar itself remains painted across every navigation while
// route-owned portals and configuration follow the director's committed path.
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
export function AppTitleBar({ path, search, revealTitle, transitionStatus }: {
  /** The COMMITTED scene's address, never the browser's pending intent (ADR-0368). */
  path: string;
  search?: string;
  transitionStatus?: string | null;
  // Cold-load choreography: false while the bar waits its rung on the ONE shell ladder
  // (ui/shell/startupScene), on every route. Undefined/true afterwards — the bar renders
  // opaque, so this can never blink the persistent bar on a later navigation.
  revealTitle?: boolean;
}): ReactElement | null {
  const startup = useStartupScene();
  const { reportReady, reportFailed, generation } = startup;
  // Rung 2 of the ladder. `main.tsx` has already decoded this art as a startup
  // precondition, so this resolves from the shared decoded-image record rather than the
  // network — the bar owns its own contract even so, rather than trusting a caller to
  // have honoured the ordering for it.
  useEffect(() => {
    let live = true;
    void decodeShellChromeArt()
      .then(() => { if (live) reportReady('chrome'); })
      .catch((error) => { if (live) reportFailed(error); });
    return () => { live = false; };
  }, [generation, reportFailed, reportReady]);

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
      <BrandLockup
        screenName={config.screenName}
        routeSlot={config.routeSlot}
        transitionStatus={transitionStatus}
      />
      {config.centerSlot ? <div className="app-shell-titlebar-center" data-titlebar-portal="center" /> : null}
      {/* Bottom-centre stud target: absolutely positioned over the ornament diamond (out of
          the grid), so it never shifts the brand/center/cluster tracks. Empty unless a
          single-player Skirmish portals its Retry control in. */}
      {config.studSlot ? <div className="app-shell-titlebar-stud" data-titlebar-portal="stud" /> : null}
      <span className="app-shell-rail-junction app-shell-rail-junction--persistent-divider" aria-hidden="true" />
      <div className="app-titlebar-control-lane">
        <span className="app-titlebar-contribution-target" data-titlebar-portal="before-divider" />
        <span className="app-titlebar-persistent-divider" aria-hidden="true" />
        <HeaderAccountCluster signInReturnTo={config.signInReturnTo} showSettingsGear={config.showSettingsGear} />
      </div>
    </header>
  );
}
