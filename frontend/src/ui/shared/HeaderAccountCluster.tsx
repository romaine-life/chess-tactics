import { useState, type ReactElement, type ReactNode } from 'react';
import { requiredDrawableRole } from '@chess-tactics/board-render';
import { goSignIn, updateDisplayName, type AuthUser } from '../../net/auth';
import { reportAuthSessionFailure, updateAuthSessionUser, useAuthSession } from '../../net/authSession';
import { normalizeRoutePath } from '../navigation';
import { TITLE_BAR_CLUSTER_LEAF_PHASE, TitleBarIconButtonPrimitive } from '../shell/TitleBarControls';
import { AccountMenu } from './AccountMenu';
import { ChromeDividedGridRow, DividedInnerChromeBox, chromeDividedSeatAxis } from './ChromeDividedGrid';
import { installedUiMedia } from '../installedUiMedia';

// The shared trailing-edge "settings + user" cluster for the standard app title
// bar (ADR-0023/0036): an icon-only Settings gear next to the account control —
// the avatar menu when signed in, an entry-door sign-in icon when not. One source so the
// cluster can't drift between screens; every menu/studio bar mounts THIS, never a
// hand-rolled copy. (Settings and Campaign keep their own bespoke account readout
// for now; this is the canonical cluster for everything else.)
//
// ONE box, with a rail instead of a gap. The cluster used to be three separately framed
// squares in a flex row, so between one glyph and the next the bar showed a frame rail, a
// strip of itself, and another frame rail — three edges to say one thing. It is a single
// divided box now (ADR-0242): the frame is the box's, every separation is the box's own rail,
// and each member is a COMPARTMENT of it rather than a control standing inside one. The
// divided grid is the primitive for exactly this and lays every rail and junction cap from
// its own grid lines, so nothing here draws a rule.
//
// This is the invariant cluster only. Route-contributed controls stay individually framed
// boxes before the persistent divider — that divider is what separates what a screen adds
// from what the app always carries (ADR-0104), and folding them into this box would erase it.

const SETTINGS_ICON = requiredDrawableRole('menu-mode', 'settings').media.icon?.media.immutableUrl;
if (!SETTINGS_ICON) throw new Error('installed Settings menu mode has no icon');
const SIGN_IN_ICON = installedUiMedia('ui-kit-icons-sign-in-png');

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
// rename field, ?watchers=N stubs N observers on the run. In demo mode the rename is
// local-only (it never hits the backend).
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
  // Observers ride the ACCOUNT seat rather than a fourth compartment: the cluster's seats are
  // permanent by design (the music seat stays dimmed with no soundtrack rather than vanishing),
  // so a seat for "nobody is watching" would spend bar width on nothing almost always. Being
  // watched is a property of the account, and the account already has a seat.
  const demoWatchers = import.meta.env.DEV ? Number(params.get('watchers')) : Number.NaN;
  const watchers = Number.isFinite(demoWatchers) && demoWatchers > 0 ? Math.floor(demoWatchers) : 0;

  const sharedAuth = useAuthSession((session) => session.status);
  const [demoUser, setDemoUser] = useState<AuthUser>(DEMO_USER);
  const me = demo ? demoUser : sharedAuth?.user ?? null;
  const authResolved = demo || sharedAuth?.reachable === true;

  const signedIn = Boolean(me?.signed_in);
  const accountName = signedIn ? (me!.name || me!.email || 'Player') : 'Guest';
  const accountEmail = signedIn ? (me!.email || '') : '';

  const renameAccount = async (next: string): Promise<void> => {
    if (demo) {
      setDemoUser((prev) => ({ ...prev, name: next || prev.email || 'Player' }));
      return;
    }
    try {
      const updated = await updateDisplayName(next);
      updateAuthSessionUser(updated);
    } catch (error) {
      reportAuthSessionFailure(error);
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    try { await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
    window.location.reload();
  };

  // Ask the provider for credentials again without ending the session. The callback recognises
  // the session already in hand and re-arms it in place, so the 90-day session — and the absolute
  // deadline it is measured against — survives (ADR-0576).
  const reauthenticate = (): void => {
    const returnTo = signInReturnTo ?? `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/auth/sign-in?prompt=login&returnTo=${encodeURIComponent(returnTo)}`;
  };

  // The box's compartments, in bar order. Declared as a list because the box's COLUMNS are
  // its members: one track each, so the rail between the music seat and the gear is the box's
  // own column line. A bar without the gear declares two columns and has one rail, never an
  // empty compartment where the third used to be.
  const seats: ReactNode[] = [
    /* Persistent mute control — the vanilla BGM player (bgm.js) re-homes its own button into
       THIS compartment, so the one mute toggle rides the always-on trailing cluster on every
       route instead of floating bottom-right (ADR-0044). The seat is a real cell and exists
       whether or not the button has landed in it (a microtask after init), so the box's
       columns can never shift by one on the frame before it arrives; even with no soundtrack
       configured the button stays, dimmed and inert, rather than vanishing. */
    <span key="music" className="cluster-bgm-slot" aria-hidden="true" />,
    ...(showSettingsGear ? [
      // A NavButton with a THUNK target: settingsHref() runs at activation time, so the
      // returnTo it captures is always current — screens like the Studio and the level
      // editor rewrite their query via replaceState WITHOUT re-rendering this persistent
      // bar, which is why the anchor this replaced needed a pointerdown/keydown
      // just-in-time href rewrite hack (ADR-0052 retires it).
      <TitleBarIconButtonPrimitive key="settings" seated className="cluster-icon-button" surfacePhase={TITLE_BAR_CLUSTER_LEAF_PHASE.settings} to={() => settingsHref()} label="Settings" title="Settings" iconSrc={SETTINGS_ICON} />,
    ] : []),
    !authResolved ? (
      <span key="account" className="account-auth-pending" role="status" aria-label="Checking account" />
    ) : signedIn ? (
      <AccountMenu
        key="account"
        name={accountName}
        email={accountEmail}
        avatarUrl={me!.avatar_url ?? null}
        surfacePhase={TITLE_BAR_CLUSTER_LEAF_PHASE.account}
        watcherCount={watchers}
        onRename={renameAccount}
        onSignOut={signOut}
        // Only an admin can publish, so only an admin is ever asked to re-authenticate for it.
        needsReauthentication={Boolean(me!.is_admin) && me!.admin_fresh === false}
        onReauthenticate={reauthenticate}
        defaultOpen={menuOpen}
        defaultEditing={editOpen}
      />
    ) : (
      // A button, not an anchor (ADR-0052): the sign-in is still a full-page trip to
      // the auth backend — goSignIn sets window.location — it just shows no URL.
      <TitleBarIconButtonPrimitive
        key="account"
        active
        seated
        className="cluster-icon-button account-sign-in-button"
        surfacePhase={TITLE_BAR_CLUSTER_LEAF_PHASE.account}
        label="Sign in"
        iconSrc={SIGN_IN_ICON}
        onClick={() => goSignIn(signInReturnTo)}
      />
    ),
  ];

  // A track is the visible OPENING plus what the rails take back. A rail is drawn ON the grid
  // line, straddling it, so it covers half its width from the cell on each side — the middle
  // seat pays that twice and the outer two once each, where the box's own frame is the other
  // edge and takes nothing. Equal tracks therefore do NOT produce equal compartments: they came
  // out 34.5 / 31 / 34.5 against a 38 height, none of them square and the gear the odd one out.
  // The grid owns that derivation, so this box states only its members and its opening; each
  // seat gives the matching half-rail back as padding (`.header-account-cluster-seats`) so its
  // glyph centres in the opening rather than in the cell.
  const columns = chromeDividedSeatAxis(
    seats.length,
    'var(--titlebar-control-seat)',
    'var(--titlebar-seat-rail-half)',
  ).tracks;

  return (
    <DividedInnerChromeBox
      className="header-account-cluster"
      columns={columns}
      role="group"
      aria-label="Settings and account"
    >
      <ChromeDividedGridRow className="header-account-cluster-seats">{seats}</ChromeDividedGridRow>
    </DividedInnerChromeBox>
  );
}
