import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { fetchMe, signInHref, type AuthUser } from '../net/auth';
import { AmbienceBackground } from './AmbienceBackground';
import {
  MENU_MODES,
  assetById,
  bestImageUrl,
  frameStyleForAsset,
  insetStyle,
  type MenuMode,
} from './design/catalogData';

const MODE_HREFS: Record<string, string> = {
  'solo-skirmish': '/play',
  'campaign-editor': '/campaigns-next',
  'level-editor': '/edit',
  lobbies: '/lobbies',
  settings: '/settings',
};

function ModeMenuLink({ mode, active = false }: { mode: MenuMode; active?: boolean }): ReactElement {
  const rowAsset = assetById(mode.row);
  const href = MODE_HREFS[mode.slug] || '/';
  if (rowAsset?.states?.normal) {
    const normalState = rowAsset.states.normal;
    const pressedState = rowAsset.states.pressed || rowAsset.states.active || normalState;
    const normalStyle = frameStyleForAsset(rowAsset, normalState.rect);
    const pressedStyle = frameStyleForAsset(rowAsset, pressedState.rect);
    const labelStyle = insetStyle(rowAsset.rules?.textInset, normalState.rect);
    const linkStyle = { '--asset-aspect': `${normalState.rect.w} / ${normalState.rect.h}` } as CSSProperties;

    return (
      <a
        className={`mode-button uses-row-art ${active ? 'is-active' : ''}`.trim()}
        href={href}
        aria-current={active ? 'page' : undefined}
        style={linkStyle}
      >
        <span className="mode-button-art mode-button-art-normal" style={normalStyle} aria-hidden="true" />
        <span className="mode-button-art mode-button-art-pressed" style={pressedStyle} aria-hidden="true" />
        <span className="mode-button-label" style={labelStyle}>{mode.label}</span>
      </a>
    );
  }

  const nineSlice = assetById('button-9slice.main-menu');
  if (!nineSlice || !nineSlice.states) {
    return (
      <a className="main-menu-action" href={href}>
        <span>{mode.label}</span>
        <i aria-hidden="true">&gt;</i>
      </a>
    );
  }

  // The frame is now the atom-assembled kit 9-slice (kit/main-menu-button.png),
  // rendered as a border-image in CSS — the old cropped button-9slice.main-menu art
  // is retired. We still read its rules/rect as layout metadata (icon + label + arrow
  // slots are proportional to the 897×244 footprint) until the icons themselves move
  // off the aspirational crop. Hover/press state is a CSS filter on the frame.
  const rules = nineSlice.rules || {};
  const stateDef = nineSlice.states.normal;
  const icon = assetById(mode.icon);
  const iconStyle: CSSProperties = icon && icon.rect
    ? { ...insetStyle(rules.iconSlot, stateDef.rect), ...frameStyleForAsset(icon, icon.rect) }
    : {};
  const labelStyle = insetStyle(rules.textInset, stateDef.rect);
  const arrowStyle = insetStyle(rules.arrowSlot, stateDef.rect);
  const linkStyle = { '--asset-aspect': `${stateDef.rect.w} / ${stateDef.rect.h}` } as CSSProperties;

  return (
    <a
      className={`mode-button uses-atom-frame ${active ? 'is-active' : ''}`.trim()}
      href={href}
      aria-current={active ? 'page' : undefined}
      style={linkStyle}
    >
      <span className="mode-button-9slice" aria-hidden="true" />
      {icon ? <span className="mode-button-icon" style={iconStyle} aria-hidden="true" /> : null}
      <span className="mode-button-label" style={labelStyle}>{mode.label}</span>
      <span className="mode-button-arrow" style={arrowStyle} aria-hidden="true">›</span>
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
    want(assetById('button-9slice.main-menu')?.sheet?.image);
    for (const mode of MENU_MODES) {
      want(assetById(mode.row)?.sheet?.image);
      want(assetById(mode.icon)?.sheet?.image);
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
          <nav className="main-menu-actions main-menu-actions-assets" aria-label="Game modes">
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
