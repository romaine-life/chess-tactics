import { useEffect, useState, type ReactElement } from 'react';
import { fetchMe, signInHref, type AuthUser } from '../net/auth';
import { AmbienceBackground } from './AmbienceBackground';
import { BrandLockup } from './shared/BrandLockup';
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

  const signedIn = Boolean(me?.signed_in);
  const accountName = signedIn ? (me!.name || me!.email || 'Player') : 'Guest';
  const accountStatus = signedIn ? 'Signed in' : me === null ? 'Checking account' : 'Not signed in';

  return (
    <div className={`menu-layer main-menu-layer ${ready ? 'is-ready' : 'is-loading'}`} data-testid="main-menu-next">
      <AmbienceBackground />
      {/* Settings-twin layout (ADR-0003 superseded): shared app title bar + a rail of
          mode tabs + a framed feature panel — the same baked-skin chrome as /settings. */}
      <div className="settings-screen main-menu-twin-screen">
        <header className="app-titlebar settings-header-frame main-menu-twin-header">
          <BrandLockup screenName="Main Menu" />
          <div className="settings-account" aria-label="Account">
            <span>
              <strong>{accountName}</strong>
              <em>{accountStatus}</em>
            </span>
            {signedIn
              ? <button type="button" className="app-header-button app-header-button-active" onClick={signOut}>Sign Out</button>
              : <a className="app-header-button app-header-button-active" href={signInHref('/')}>Sign In</a>}
          </div>
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
