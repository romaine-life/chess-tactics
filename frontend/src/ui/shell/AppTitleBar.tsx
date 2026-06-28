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
export function AppTitleBar({ path }: { path: string }): ReactElement | null {
  const config = titleBarConfig(path);
  if (!config) return null;

  const columnClass = config.columns ? ` app-titlebar--${config.columns}` : '';
  return (
    <header className={`app-titlebar settings-header-frame app-shell-titlebar${columnClass}`}>
      <BrandLockup screenName={config.screenName} variant={config.lockupVariant} />
      {config.showAccountCluster ? <HeaderAccountCluster signInReturnTo={config.signInReturnTo} /> : null}
    </header>
  );
}
