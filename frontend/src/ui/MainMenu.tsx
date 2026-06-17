import { useEffect, type CSSProperties, type ReactElement } from 'react';
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

const SECONDARY_ASSET_ROOT = '/assets/ui/main-menu/secondary';

const DOCK_ITEMS = [
  { label: 'Achievements', href: '/design/catalog/widgets/main-menu', key: 'achievements' },
  { label: 'Campaigns', href: '/campaigns-next', key: 'campaigns' },
  { label: 'Stats', href: '/design/widgets', key: 'stats' },
  { label: 'Collection', href: '/design/catalog', key: 'collection' },
];

function SecondaryIcon({ name, className = '' }: { name: string; className?: string }): ReactElement {
  return (
    <img
      className={`secondary-menu-icon ${className}`.trim()}
      src={`${SECONDARY_ASSET_ROOT}/icon-${name}.png`}
      alt=""
      aria-hidden="true"
    />
  );
}

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
  return (
    <section className="profile-panel" aria-label="Player profile">
      <div className="profile-bar">
        <span className="profile-crest" aria-hidden="true" />
        <span className="profile-name">
          <strong>Commander</strong>
          <small>Rank 12</small>
        </span>
        <a className="profile-auth" href="/api/auth/sign-in?returnTo=%2F">Sign In</a>
        <a className="profile-gear" href="/settings" aria-label="Settings">
          <img className="profile-icon-img" src="/assets/ui/main-menu/profile-cog.png" alt="" />
        </a>
      </div>
      <dl className="profile-bar profile-forces">
        <div className="force force-allies">
          <span className="force-icon" aria-hidden="true">
            <img className="profile-icon-img" src="/assets/ui/main-menu/profile-rook-blue.png" alt="" />
          </span>
          <dt>Allies</dt>
          <dd>3</dd>
        </div>
        <div className="force force-enemies">
          <span className="force-icon" aria-hidden="true">
            <img className="profile-icon-img" src="/assets/ui/main-menu/profile-rook-red.png" alt="" />
          </span>
          <dt>Enemies</dt>
          <dd>3</dd>
        </div>
      </dl>
    </section>
  );
}

function DailyPanel(): ReactElement {
  return (
    <section className="menu-panel daily-panel" aria-label="Daily challenge">
      <div className="daily-head">
        <strong>Daily Challenge</strong>
        <span className="daily-timer"><SecondaryIcon name="hourglass" />12h 45m</span>
      </div>
      <div className="daily-body">
        <span className="daily-reticle" aria-hidden="true"><SecondaryIcon name="reticle" /></span>
        <p>Capture the enemy King</p>
      </div>
      <div className="daily-reward">
        <span className="daily-reward-label">Reward</span>
        <span className="daily-gem" aria-hidden="true"><SecondaryIcon name="gem" /></span>
        <strong>50</strong>
      </div>
    </section>
  );
}

function NewsPanel(): ReactElement {
  return (
    <section className="menu-panel news-panel" aria-label="News">
      <div className="news-head">
        <strong>News</strong>
      </div>
      <ul className="news-list">
        <li className="news-line news-line-cobalt">
          <span className="news-ico" aria-hidden="true"><SecondaryIcon name="shield" /></span>
          <span>v1.2.0 Balance Update</span>
        </li>
        <li className="news-line news-line-gold">
          <span className="news-ico" aria-hidden="true"><SecondaryIcon name="crown" /></span>
          <span>New official maps added</span>
        </li>
        <li className="news-line news-line-red">
          <span className="news-ico" aria-hidden="true"><SecondaryIcon name="book" /></span>
          <span>Community Spotlight: Top Tactics</span>
        </li>
      </ul>
    </section>
  );
}

function BattlefieldPlate(): ReactElement {
  return (
    <section className="main-menu-battlefield-plate" aria-label="Featured battlefield">
      <div className="main-menu-battlefield-art" aria-hidden="true" />
      <div className="main-menu-battlefield-meta">
        <span>Moonlit Reach</span>
        <span>Skirmish Ready</span>
      </div>
      <div className="main-menu-battlefield-status" aria-hidden="true">
        <span>8 x 8</span>
        <span>Live Board In Match</span>
        <span>3 Objectives</span>
      </div>
    </section>
  );
}

function MenuDock(): ReactElement {
  return (
    <nav className="menu-dock" aria-label="Secondary menu">
      <div className="menu-dock-art">
        {DOCK_ITEMS.map((item) => (
          <a
            key={item.label}
            className={`dock-hit dock-hit-${item.key}`}
            href={item.href}
            aria-label={item.label}
          >
            <span className="dock-hit-art dock-hit-art-normal" aria-hidden="true" />
            <span className="dock-hit-art dock-hit-art-hover" aria-hidden="true" />
            <span className="dock-hit-art dock-hit-art-pressed" aria-hidden="true" />
          </a>
        ))}
      </div>
    </nav>
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
          <DailyPanel />
        </div>

        <BattlefieldPlate />

        <aside className="main-menu-right" aria-label="Commander information">
          <ProfilePanel />
          <NewsPanel />
        </aside>

        <MenuDock />
      </section>
    </div>
  );
}
