import { useEffect, useState, type ReactElement } from 'react';
import { fetchMe, signInHref, type AuthUser } from '../net/auth';
import { AmbienceBackground } from './AmbienceBackground';
import { MENU_MODES, bestImageUrl, type MenuMode } from './design/catalogData';

const ICONS = '/assets/ui/main-menu/icons-carved';

// Temporary comparison knob: `?indent=hover` (6px slide) or `?indent=hover10` (10px)
// to FEEL the deliberate hover slide on the REAL menu. Remove once the call is made.
function indentClass(): string {
  const v = new URLSearchParams(window.location.search).get('indent');
  return v === 'hover' ? ' indent-hover'
    : v === 'hover10' ? ' indent-hover indent-hover-10' : '';
}

const MODE_HREFS: Record<string, string> = {
  'solo-skirmish': '/play',
  'campaign-editor': '/campaigns-next',
  'level-editor': '/edit',
  lobbies: '/lobbies',
  settings: '/settings',
};

function ModeMenuLink({ mode, active = false }: { mode: MenuMode; active?: boolean }): ReactElement {
  const href = MODE_HREFS[mode.slug] || '/';
  // "Wet Stone & Cold Iron" mode button (ADR-0025 register): a matte stone slab with
  // a thin forged-iron lip carrying the forged carved-stone icon (canonical 64×64
  // canvas per ADR-0026, optical keylines per ADR-0027) at --menu-icon-size. Hover
  // lifts the lip; active = a contained cobalt
  // hairline. NOTE: the slab surface is still CSS — forging its 9-slice frame is the
  // remaining chrome step; the icons themselves are forged.
  return (
    <a
      className={`mode-button-stone ${active ? 'is-active' : ''}`.trim()}
      href={href}
      aria-current={active ? 'page' : undefined}
    >
      <img className="mode-button-stone-icon" src={`${ICONS}/${mode.slug}.png`} alt="" aria-hidden="true" />
      <span className="mode-button-stone-label">{mode.label}</span>
    </a>
  );
}

function ProfilePanel(): ReactElement {
  const [me, setMe] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    fetchMe().then((user) => { if (active) setMe(user); });
    return () => { active = false; };
  }, []);

  const signedIn = me?.signed_in;
  const displayName = signedIn ? (me.name || me.email || 'Player') : 'Guest';
  const status = signedIn ? 'Signed in' : me === null ? 'Checking account' : 'Not signed in';

  return (
    <section className="profile-panel" aria-label="Account">
      <div className="profile-bar">
        <span className="profile-crest" aria-hidden="true" />
        <span className="profile-name" title={displayName}>
          <strong>{displayName}</strong>
          <small>{status}</small>
        </span>
        <span className="profile-actions">
          {signedIn
            ? <span className="profile-status">Ready</span>
            : <a className="profile-auth" href={signInHref('/')}>Sign In</a>}
          <a className="profile-gear" href="/settings" aria-label="Settings">
            <img className="profile-icon-img" src="/assets/ui/main-menu/profile-cog.png" alt="" />
          </a>
        </span>
      </div>
    </section>
  );
}

export function MainMenu(): ReactElement {
  // Coordinated reveal: hold the menu content until its sprites are decoded, then
  // fade the whole screen in at once — instead of letting each button / icon /
  // brand mark pop in independently as it streams in on a cold first boot. The
  // rain (AmbienceBackground) is intentionally NOT gated; it fades in on its own
  // whenever the ambience runtime is ready.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, []);

  useEffect(() => {
    const urls = new Set<string>();
    const want = (image?: string) => { if (image) urls.add(bestImageUrl(image)); };
    for (const mode of MENU_MODES) {
      urls.add(`${ICONS}/${mode.slug}.png`);
    }
    want('/assets/ui/main-menu-brand-rook-mark-v1.png');
    want('/assets/ui/main-menu/profile-cog.png');

    let done = false;
    const reveal = () => { if (!done) { done = true; setReady(true); } };
    Promise.allSettled([...urls].map((src) => { const img = new Image(); img.src = src; return img.decode(); })).then(reveal);
    const fallback = window.setTimeout(reveal, 1500); // never block the menu on one slow asset
    return () => window.clearTimeout(fallback);
  }, []);

  return (
    <div className={`menu-layer main-menu-layer ${ready ? 'is-ready' : 'is-loading'}`} data-testid="main-menu-next">
      <AmbienceBackground />
      <section className="main-menu-screen main-menu-skeleton-screen" aria-label="Chess Tactics main menu">
        <div className="main-menu-left">
          <a className="main-menu-brand main-menu-brand-live" href="/" aria-label="Chess Tactics">
            <img className="main-menu-brand-mark" src="/assets/ui/main-menu-brand-rook-mark-v1.png" alt="" />
            <span className="main-menu-brand-type">
              <strong>Chess Tactics</strong>
            </span>
          </a>
          <nav className={`main-menu-actions main-menu-actions-assets${indentClass()}`} aria-label="Game modes">
            {MENU_MODES.map((mode) => (
              <ModeMenuLink key={mode.slug} mode={mode} />
            ))}
          </nav>
        </div>

        <aside className="main-menu-right" aria-label="Main menu status">
          <ProfilePanel />
        </aside>
      </section>
    </div>
  );
}
