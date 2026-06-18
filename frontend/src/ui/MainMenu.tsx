import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { fetchMe, signInHref, type AuthUser } from '../net/auth';
import {
  MENU_MODES,
  assetById,
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

  const rules = nineSlice.rules || {};
  const stateDef = nineSlice.states[active ? 'pressed' : 'normal'] || nineSlice.states.normal;
  const icon = assetById(mode.icon);
  const frameStyle = frameStyleForAsset(nineSlice, stateDef.rect);
  const iconStyle: CSSProperties = icon && icon.rect
    ? { ...insetStyle(rules.iconSlot, stateDef.rect), ...frameStyleForAsset(icon, icon.rect) }
    : {};
  const labelStyle = insetStyle(rules.textInset, stateDef.rect);
  const linkStyle = { '--asset-aspect': `${stateDef.rect.w} / ${stateDef.rect.h}` } as CSSProperties;

  return (
    <a
      className={`mode-button ${active ? 'is-active' : ''}`.trim()}
      href={href}
      aria-current={active ? 'page' : undefined}
      style={linkStyle}
    >
      <span className="mode-button-9slice" style={frameStyle} aria-hidden="true" />
      {icon ? <span className="mode-button-icon" style={iconStyle} aria-hidden="true" /> : null}
      <span className="mode-button-label" style={labelStyle}>{mode.label}</span>
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
  const status = signedIn ? 'Signed in' : 'Not signed in';

  return (
    <section className="profile-panel" aria-label="Account">
      <div className="profile-bar">
        <span className="profile-crest" aria-hidden="true" />
        <span className="profile-name">
          <strong>{displayName}</strong>
          <small>{status}</small>
        </span>
        {signedIn ? <span className="profile-status">Ready</span> : <a className="profile-auth" href={signInHref('/')}>Sign In</a>}
        <a className="profile-gear" href="/settings" aria-label="Settings">
          <img className="profile-icon-img" src="/assets/ui/main-menu/profile-cog.png" alt="" />
        </a>
      </div>
    </section>
  );
}

function MainMenuOpenSlots(): ReactElement {
  return (
    <section className="menu-panel main-menu-slot-panel" aria-label="Unfinished main menu areas">
      <p className="slot-panel-kicker">Open Slots</p>
      <ul className="slot-panel-list">
        <li>Daily / News</li>
        <li>Bottom Dock</li>
        <li>Battlefield area absent</li>
      </ul>
    </section>
  );
}

function MainMenuDockSlot(): ReactElement {
  return (
    <section className="main-menu-dock-slot" aria-label="Bottom dock open slot">
      <span>Bottom Dock</span>
      <small>Open Slot</small>
    </section>
  );
}

export function MainMenu(): ReactElement {
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, []);

  return (
    <div className="menu-layer main-menu-layer" data-testid="main-menu-next">
      <section className="main-menu-screen main-menu-skeleton-screen" aria-label="Chess Tactics main menu">
        <div className="main-menu-left">
          <a className="main-menu-brand main-menu-brand-art accepted-brand-crop" href="/" aria-label="Chess Tactics">
            <img src="/assets/ui/main-menu-brand-title-only-v1.png" alt="" />
          </a>
          <nav className="main-menu-actions main-menu-actions-assets" aria-label="Game modes">
            {MENU_MODES.map((mode) => (
              <ModeMenuLink key={mode.slug} mode={mode} />
            ))}
          </nav>
        </div>

        <aside className="main-menu-right" aria-label="Main menu status">
          <ProfilePanel />
          <MainMenuOpenSlots />
        </aside>

        <MainMenuDockSlot />
      </section>
    </div>
  );
}
