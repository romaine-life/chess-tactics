import { type ReactElement } from 'react';
import { BrandLockup } from '../shared/BrandLockup';
import { HeaderAccountCluster } from '../shared/HeaderAccountCluster';
import { titleBarConfig } from './titleBarConfig';

// The ONE persistent title bar. Rendered once in App, OUTSIDE the routed screen, so
// it stays mounted across navigation — the brand never blinks, only its contents
// update. Fixed-position with a z-index above the route-veil so it stays lit while
// the body dissolves through a heavy-route transition. Returns null for routes with
// no config (Studio/dev surfaces keep their own header; screens not yet migrated to
// the shell still render theirs).
//
// Stateful screens (Skirmish status, the editors' save-state + actions) keep their
// dynamic content in their OWN component and portal it into the center/right target
// nodes below — App holds those nodes in state and feeds <TitleBarSlot> via context.
export function AppTitleBar({ path, onCenterNode, onRightNode, revealTitle }: {
  path: string;
  onCenterNode: (el: HTMLElement | null) => void;
  onRightNode: (el: HTMLElement | null) => void;
  // Cold-load reveal only: false while the bar is waiting its turn on a fresh menu load
  // (see ui/shell/coldReveal). Undefined/true everywhere else — the bar renders opaque,
  // so this can never blink the persistent bar on a normal route or a later navigation.
  revealTitle?: boolean;
}): ReactElement | null {
  const config = titleBarConfig(path);
  if (!config) return null;

  const barClass = config.barClass ? ` ${config.barClass}` : '';
  // Opt-IN hidden: only add the pending class when explicitly told to wait. Default
  // (revealTitle undefined/true) is fully visible.
  const pendingClass = revealTitle === false ? ' reveal-pending' : '';
  return (
    <header className={`app-titlebar settings-header-frame app-shell-titlebar${barClass}${pendingClass}`}>
      <BrandLockup screenName={config.screenName} />
      {config.centerSlot ? <div className="app-shell-titlebar-center" ref={onCenterNode} /> : null}
      {config.showAccountCluster ? (
        <HeaderAccountCluster signInReturnTo={config.signInReturnTo} showSettingsGear={config.showSettingsGear} />
      ) : config.rightSlot ? (
        <div className="app-shell-titlebar-right" ref={onRightNode} />
      ) : null}
    </header>
  );
}
