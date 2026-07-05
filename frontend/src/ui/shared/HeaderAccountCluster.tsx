import { useEffect, useState, type ReactElement } from 'react';
import { fetchMe, goSignIn, updateDisplayName, type AuthUser } from '../../net/auth';
import { normalizeRoutePath } from '../navigation';
import { AccountMenu } from './AccountMenu';
import { NavButton } from './NavButton';

// The shared trailing-edge "settings + user" cluster for the standard app title
// bar (ADR-0023/0036): an icon-only Settings gear next to the account control —
// the avatar menu when signed in, a Sign In button when not. One source so the
// cluster can't drift between screens; every menu/studio bar mounts THIS, never a
// hand-rolled copy. (Settings and Campaign keep their own bespoke account readout
// for now; this is the canonical cluster for everything else.)

const SETTINGS_ICON = '/assets/ui/main-menu/icons-carved/settings.png';

// The gear's target: send the CURRENT location along as ?returnTo so Settings can
// offer a real "‹ Back" to the screen the user left (validated via readValidatedReturnTo
// in ui/navigation.ts). On Settings itself the gear stays the documented
// "back to settings root" hop (#241) and must NOT capture a settings path — it only
// re-threads whatever returnTo the URL already carries, so the Back survives the hop.
function settingsHref(): string {
  const { pathname, search } = window.location;
  const path = normalizeRoutePath(pathname);
  if (path === '/settings' || path.startsWith('/settings/')) {
    const returnTo = new URLSearchParams(search).get('returnTo');
    return returnTo ? `/settings?returnTo=${encodeURIComponent(returnTo)}` : '/settings';
  }
  return `/settings?returnTo=${encodeURIComponent(pathname + search)}`;
}

// Dev-only signed-in stub (import.meta.env.DEV, stripped from prod) so the account
// chrome can be previewed/screenshotted on any screen without a backend: ?demo=1
// stubs this user, ?menu=open renders the account menu open, ?edit=open opens the
// rename field. In demo mode the rename is local-only (it never hits the backend).
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
  const params = new URLSearchParams(window.location.search);
  const demo = import.meta.env.DEV && params.get('demo') === '1';
  const menuOpen = import.meta.env.DEV && params.get('menu') === 'open';
  const editOpen = import.meta.env.DEV && params.get('edit') === 'open';

  const [me, setMe] = useState<AuthUser | null>(demo ? DEMO_USER : null);

  useEffect(() => {
    if (demo) return; // demo stub: never hit the backend
    let active = true;
    fetchMe().then((user) => { if (active) setMe(user); });
    return () => { active = false; };
  }, [demo]);

  const signedIn = Boolean(me?.signed_in);
  const accountName = signedIn ? (me!.name || me!.email || 'Player') : 'Guest';
  const accountEmail = signedIn ? (me!.email || '') : '';

  const renameAccount = async (next: string): Promise<void> => {
    if (demo) {
      setMe((prev) => (prev ? { ...prev, name: next || prev.email || 'Player' } : prev));
      return;
    }
    const updated = await updateDisplayName(next);
    setMe(updated);
  };

  const signOut = async (): Promise<void> => {
    try { await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
    window.location.reload();
  };

  return (
    <div className="header-account-cluster" aria-label="Settings and account">
      {/* The wall: a vertical forged-iron rule that locks this invariant cluster off from
          the contextual actionsSlot to its left (the ADR-0037 bottom rule stood on end,
          same nailhead art). It lands on the bottom rule at a diamond stud (the rule's own
          cap ornament) so wall and floor meet AT a shared rivet, not a seam. Decorative
          only — aria-hidden. Lives INSIDE the cluster, so per ADR-0042 it renders wherever
          the invariant cluster does (every screen) and claims no grid column of its own. */}
      <span className="cluster-wall" aria-hidden="true" />
      {/* Persistent mute control — the vanilla BGM player (bgm.js) re-homes its own
          kit-framed button into THIS boxless slot, so the one mute toggle rides the
          always-on trailing cluster on every route instead of floating bottom-right
          (ADR-0044). Empty only until bgm mounts its button (a microtask after init); the
          button then stays put — even with no soundtrack configured it shows dimmed/inert
          rather than vanishing. .cluster-bgm-slot is display:contents so it adds no gap. */}
      <span className="cluster-bgm-slot" aria-hidden="true" />
      {showSettingsGear ? (
        // A NavButton with a THUNK target: settingsHref() runs at activation time, so the
        // returnTo it captures is always current — screens like the Studio and the level
        // editor rewrite their query via replaceState WITHOUT re-rendering this persistent
        // bar, which is why the anchor this replaced needed a pointerdown/keydown
        // just-in-time href rewrite hack (ADR-0052 retires it).
        <NavButton className="cluster-icon-button" to={() => settingsHref()} aria-label="Settings" title="Settings">
          <img src={SETTINGS_ICON} alt="" />
        </NavButton>
      ) : null}
      {signedIn ? (
        <AccountMenu
          name={accountName}
          email={accountEmail}
          avatarUrl={me!.avatar_url ?? null}
          onRename={renameAccount}
          onSignOut={signOut}
          defaultOpen={menuOpen}
          defaultEditing={editOpen}
        />
      ) : (
        // A button, not an anchor (ADR-0052): the sign-in is still a full-page trip to
        // the auth backend — goSignIn sets window.location — it just shows no URL.
        <button type="button" className="app-header-button app-header-button-active" onClick={() => goSignIn(signInReturnTo)}>Sign In</button>
      )}
    </div>
  );
}
