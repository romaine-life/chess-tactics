import { useEffect, useState, type ReactElement } from 'react';
import { fetchMe, signInHref, type AuthUser } from '../../net/auth';
import { AccountMenu } from './AccountMenu';

// The shared trailing-edge "settings + user" cluster for the standard app title
// bar (ADR-0023/0036): an icon-only Settings gear next to the account control —
// the avatar menu when signed in, a Sign In button when not. One source so the
// cluster can't drift between screens; every menu/studio bar mounts THIS, never a
// hand-rolled copy. (Settings and Campaign keep their own bespoke account readout
// for now; this is the canonical cluster for everything else.)

const SETTINGS_ICON = '/assets/ui/main-menu/icons-carved/settings.png';

// Dev-only signed-in stub (import.meta.env.DEV, stripped from prod) so the account
// chrome can be previewed/screenshotted on any screen without a backend: ?demo=1
// stubs this user, ?menu=open renders the account menu open.
const DEMO_USER: AuthUser = {
  signed_in: true,
  name: 'Nelson',
  email: 'nelson@romaine.life',
  avatar_url: 'https://www.gravatar.com/avatar/6b1b9282bc036370f9a6998fe9296233?d=retro&s=80&f=y',
};

interface HeaderAccountClusterProps {
  /** Where to return after sign-in (defaults to the current path+query). */
  signInReturnTo?: string;
  /** Show the Settings gear. Default true — kept on every screen, including
   *  Settings itself (it links to the settings root from any sub-page). */
  showSettingsGear?: boolean;
}

export function HeaderAccountCluster({
  signInReturnTo,
  showSettingsGear = true,
}: HeaderAccountClusterProps): ReactElement {
  const [me, setMe] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    fetchMe().then((user) => { if (active) setMe(user); });
    return () => { active = false; };
  }, []);

  const params = new URLSearchParams(window.location.search);
  const demo = import.meta.env.DEV && params.get('demo') === '1';
  const menuOpen = import.meta.env.DEV && params.get('menu') === 'open';
  const effectiveMe = demo ? DEMO_USER : me;

  const signedIn = Boolean(effectiveMe?.signed_in);
  const accountName = signedIn ? (effectiveMe!.name || effectiveMe!.email || 'Player') : 'Guest';

  const signOut = async (): Promise<void> => {
    try { await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
    window.location.reload();
  };

  return (
    <div className="header-account-cluster" aria-label="Settings and account">
      {showSettingsGear ? (
        <a className="cluster-icon-button" href="/settings" aria-label="Settings" title="Settings">
          <img src={SETTINGS_ICON} alt="" />
        </a>
      ) : null}
      {signedIn ? (
        <AccountMenu
          name={accountName}
          avatarUrl={effectiveMe!.avatar_url ?? null}
          onSignOut={signOut}
          defaultOpen={menuOpen}
        />
      ) : (
        <a className="app-header-button app-header-button-active" href={signInHref(signInReturnTo)}>Sign In</a>
      )}
    </div>
  );
}
