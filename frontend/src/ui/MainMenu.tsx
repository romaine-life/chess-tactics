import { useEffect, useState, type ReactElement } from 'react';
import { fetchMe, signInHref, type AuthUser } from '../net/auth';
import { AmbienceBackground } from './AmbienceBackground';
import { BrandLockup } from './shared/BrandLockup';
import { AccountMenu } from './shared/AccountMenu';
import { MENU_MODES, type MenuMode } from './design/catalogData';

const ICONS = '/assets/ui/main-menu/icons-carved';
const BRAND_SHIELD = '/assets/ui/kit/icons/brand-shield.png';

const MODE_HREFS: Record<string, string> = {
  'solo-skirmish': '/play',
  'campaign-editor': '/campaigns-next',
  'level-editor': '/edit',
  lobbies: '/lobbies',
  settings: '/settings',
};

// Workshop harness (reversible, query-param gated — the default menu is unchanged):
//   ?account=a   trailing "settings + avatar" cluster, name lives in the menu only
//   ?account=b   same cluster, plus the first name inline beside the avatar
//   ?demo=1      force a signed-in stub so the cluster renders without a backend
//   ?menu=open   render the account menu open (for screenshots)
const DEMO_USER: AuthUser = {
  signed_in: true,
  name: 'Nelson',
  email: 'fullnelsongrip@gmail.com',
  // Retro (8-bit) Gravatar fallback — the default look for a user with no custom
  // avatar set; representative of what most players see (workshop demo only).
  avatar_url: 'https://www.gravatar.com/avatar/6b1b9282bc036370f9a6998fe9296233?d=retro&s=80&f=y',
};

// A mode entry rendered as a settings-style rail tab (shared baked-skin frame —
// line frame over the stone surface — carved icon + label). The same chrome the
// Settings sidebar uses, so the menu and the rest of the app read as one family
// (retires the bespoke stone slabs).
function ModeTab({ mode }: { mode: MenuMode }): ReactElement {
  const href = MODE_HREFS[mode.slug] || '/';
  return (
    <a className="settings-tab main-menu-mode-tab" href={href}>
      <span className="settings-tab-icon" aria-hidden="true">
        <img src={`${ICONS}/${mode.slug}.png`} alt="" />
      </span>
      <span><strong>{mode.label}</strong></span>
    </a>
  );
}

export function MainMenu(): ReactElement {
  const [me, setMe] = useState<AuthUser | null>(null);
  // Coordinated reveal: hold the menu until its sprites decode, then fade the whole
  // screen in at once instead of letting each frame/icon pop in on a cold first boot.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, []);

  useEffect(() => {
    let active = true;
    fetchMe().then((user) => { if (active) setMe(user); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const urls = new Set<string>([BRAND_SHIELD]);
    for (const mode of MENU_MODES) urls.add(`${ICONS}/${mode.slug}.png`);
    let done = false;
    const reveal = () => { if (!done) { done = true; setReady(true); } };
    Promise.allSettled([...urls].map((src) => { const img = new Image(); img.src = src; return img.decode(); })).then(reveal);
    const fallback = window.setTimeout(reveal, 1500); // never block the menu on one slow asset
    return () => window.clearTimeout(fallback);
  }, []);

  const signOut = async (): Promise<void> => {
    try { await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
    window.location.reload();
  };

  // Dev-only harness so the signed-in chrome can be previewed/screenshotted with no
  // backend: ?demo=1 stubs a signed-in user, ?menu=open renders the account menu open.
  const params = new URLSearchParams(window.location.search);
  const demo = import.meta.env.DEV && params.get('demo') === '1';
  const menuOpen = import.meta.env.DEV && params.get('menu') === 'open';
  const effectiveMe = demo ? DEMO_USER : me;

  const signedIn = Boolean(effectiveMe?.signed_in);
  const accountName = signedIn ? (effectiveMe!.name || effectiveMe!.email || 'Player') : 'Guest';
  const accountStatus = signedIn ? 'Signed in' : effectiveMe === null ? 'Checking account' : 'Not signed in';

  return (
    <div className={`menu-layer main-menu-layer ${ready ? 'is-ready' : 'is-loading'}`} data-testid="main-menu-next">
      <AmbienceBackground />
      {/* Settings-twin layout (ADR-0003 superseded): shared app title bar + a rail of
          mode tabs + a framed feature panel — the same baked-skin chrome as /settings. */}
      <div className="settings-screen main-menu-twin-screen">
        <header className="app-titlebar settings-header-frame main-menu-twin-header">
          <BrandLockup screenName="Main Menu" />
          {/* Trailing-edge account chrome: signed in → the avatar account menu (the
              Settings gear joins this cluster when it moves out of the rail); signed
              out → the name + Sign In. */}
          {signedIn ? (
            <div className="header-account-cluster" aria-label="Account">
              <AccountMenu
                name={accountName}
                email={effectiveMe!.email || ''}
                avatarUrl={effectiveMe!.avatar_url ?? null}
                onSignOut={signOut}
                defaultOpen={menuOpen}
              />
            </div>
          ) : (
            <div className="settings-account" aria-label="Account">
              <span>
                <strong>{accountName}</strong>
                <em>{accountStatus}</em>
              </span>
              <a className="app-header-button app-header-button-active" href={signInHref('/')}>Sign In</a>
            </div>
          )}
        </header>

        <div className="settings-shell">
          <aside className="settings-frame settings-rail-frame" aria-label="Game modes">
            {MENU_MODES.map((mode) => <ModeTab key={mode.slug} mode={mode} />)}
          </aside>
        </div>
      </div>
    </div>
  );
}
