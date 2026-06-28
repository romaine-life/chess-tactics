import { useEffect, useState, type ReactElement } from 'react';
import { fetchMe, signInHref, type AuthUser } from '../net/auth';
import { AmbienceBackground } from './AmbienceBackground';
import { BrandLockup } from './shared/BrandLockup';
import { AccountMenu } from './shared/AccountMenu';
import { MENU_MODES } from './design/catalogData';

const ICONS = '/assets/ui/main-menu/icons-carved';
const BRAND_SHIELD = '/assets/ui/kit/icons/brand-shield.png';

const MODE_HREFS: Record<string, string> = {
  'solo-skirmish': '/play',
  'campaign-editor': '/campaigns-next',
  'level-editor': '/edit',
  lobbies: '/lobbies',
  settings: '/settings',
};

interface MenuTab { slug: string; label: string; href: string; iconSlug: string }

// The main-menu rail. The Campaign (play) mode is menu-only — not a design-catalog
// widget — so it lives here rather than in MENU_MODES (the catalog's source of
// truth). It leads the rail as the headline mode and sits apart from the Campaign
// Editor so the shared placeholder icon doesn't read as a duplicate of an adjacent
// tab. Temp icon: reuses the campaign-editor carving until a dedicated 'campaign'
// carving is forged.
const MENU_TABS: MenuTab[] = [
  { slug: 'campaign', label: 'Campaign', href: '/campaign', iconSlug: 'campaign-editor' },
  // Settings is excluded from the rail — it now lives in the trailing "settings +
  // user" chrome cluster (the gear beside the account control), not as a mode tab.
  ...MENU_MODES
    .filter((mode) => mode.slug !== 'settings')
    .map((mode) => ({
      slug: mode.slug,
      label: mode.label,
      href: MODE_HREFS[mode.slug] || '/',
      iconSlug: mode.slug,
    })),
];

// The trailing-edge Settings control (carved gear) — moved out of the rail into the
// account cluster (ADR-0036). Lives next to the avatar so the top-right reads as one
// "settings + user" unit.
const SETTINGS_ICON = `${ICONS}/settings.png`;

// Dev-only signed-in stub (import.meta.env.DEV, stripped from prod) so the account
// chrome can be previewed/screenshotted without a backend: ?demo=1 stubs this user,
// ?menu=open renders the account menu open.
const DEMO_USER: AuthUser = {
  signed_in: true,
  name: 'Nelson',
  email: 'nelson@romaine.life',
  // Retro (8-bit) Gravatar fallback — the default look for a user with no custom
  // avatar set; representative of what most players see (demo only).
  avatar_url: 'https://www.gravatar.com/avatar/6b1b9282bc036370f9a6998fe9296233?d=retro&s=80&f=y',
};

// A mode entry rendered as a settings-style rail tab (shared baked-skin frame —
// line frame over the stone surface — carved icon + label). The same chrome the
// Settings sidebar uses, so the menu and the rest of the app read as one family
// (retires the bespoke stone slabs).
function ModeTab({ tab }: { tab: MenuTab }): ReactElement {
  return (
    <a className="settings-tab main-menu-mode-tab" href={tab.href}>
      <span className="settings-tab-icon" aria-hidden="true">
        <img src={`${ICONS}/${tab.iconSlug}.png`} alt="" />
      </span>
      <span><strong>{tab.label}</strong></span>
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
    const urls = new Set<string>([BRAND_SHIELD, SETTINGS_ICON]);
    for (const tab of MENU_TABS) urls.add(`${ICONS}/${tab.iconSlug}.png`);
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

  return (
    <div className={`menu-layer main-menu-layer ${ready ? 'is-ready' : 'is-loading'}`} data-testid="main-menu-next">
      <AmbienceBackground />
      {/* Settings-twin layout (ADR-0003 superseded): shared app title bar + a rail of
          mode tabs + a framed feature panel — the same baked-skin chrome as /settings. */}
      <div className="settings-screen main-menu-twin-screen">
        <header className="app-titlebar settings-header-frame main-menu-twin-header">
          <BrandLockup screenName="Main Menu" variant="brand-hero" />
          {/* Trailing "settings + user" cluster (ADR-0036): the Settings gear, then
              the account control — the avatar menu when signed in, Sign In when not. */}
          <div className="header-account-cluster" aria-label="Settings and account">
            <a className="cluster-icon-button" href="/settings" aria-label="Settings" title="Settings">
              <img src={SETTINGS_ICON} alt="" />
            </a>
            {signedIn ? (
              <AccountMenu
                name={accountName}
                avatarUrl={effectiveMe!.avatar_url ?? null}
                onSignOut={signOut}
                defaultOpen={menuOpen}
              />
            ) : (
              <a className="app-header-button app-header-button-active" href={signInHref('/')}>Sign In</a>
            )}
          </div>
        </header>

        <div className="settings-shell">
          <aside className="settings-frame settings-rail-frame" aria-label="Game modes">
            {MENU_TABS.map((tab) => <ModeTab key={tab.slug} tab={tab} />)}
          </aside>
        </div>
      </div>
    </div>
  );
}
