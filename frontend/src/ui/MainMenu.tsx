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

const DOCK_ITEMS = [
  { label: 'Achievements', href: '/design/catalog/widgets/main-menu', left: '0%' },
  { label: 'Campaigns', href: '/campaigns-next', left: '26%' },
  { label: 'Stats', href: '/design/widgets', left: '52%' },
  { label: 'Collection', href: '/design/catalog', left: '78%' },
];

function SvgIcon({ name }: { name: 'hourglass' | 'reticle' | 'gem' | 'shield' | 'crown' | 'book' }): ReactElement {
  const common = {
    className: 'ui-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  } as const;
  if (name === 'hourglass') {
    return (
      <svg {...common}>
        <path d="M6 3h12" />
        <path d="M6 21h12" />
        <path d="M8 3v4c0 2 2 3 4 5 2-2 4-3 4-5V3" />
        <path d="M8 21v-4c0-2 2-3 4-5 2 2 4 3 4 5v4" />
      </svg>
    );
  }
  if (name === 'reticle') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2v5" />
        <path d="M12 17v5" />
        <path d="M2 12h5" />
        <path d="M17 12h5" />
      </svg>
    );
  }
  if (name === 'gem') {
    return (
      <svg {...common}>
        <path d="M6 3h12l4 6-10 12L2 9l4-6Z" />
        <path d="M2 9h20" />
        <path d="m9 9 3 12 3-12" />
      </svg>
    );
  }
  if (name === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    );
  }
  if (name === 'crown') {
    return (
      <svg {...common}>
        <path d="m3 18 2-10 5 5 2-8 2 8 5-5 2 10H3Z" />
        <path d="M3 21h18" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4V4Z" />
      <path d="M5 4v12" />
      <path d="M9 8h6" />
      <path d="M9 12h5" />
    </svg>
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
        <span className="daily-timer"><SvgIcon name="hourglass" />12h 45m</span>
      </div>
      <div className="daily-body">
        <span className="daily-reticle" aria-hidden="true"><SvgIcon name="reticle" /></span>
        <p>Capture the enemy King</p>
      </div>
      <div className="daily-reward">
        <span className="daily-reward-label">Reward</span>
        <span className="daily-gem" aria-hidden="true"><SvgIcon name="gem" /></span>
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
          <span className="news-ico" aria-hidden="true"><SvgIcon name="shield" /></span>
          <span>v1.2.0 Balance Update</span>
        </li>
        <li className="news-line news-line-gold">
          <span className="news-ico" aria-hidden="true"><SvgIcon name="crown" /></span>
          <span>New official maps added</span>
        </li>
        <li className="news-line news-line-red">
          <span className="news-ico" aria-hidden="true"><SvgIcon name="book" /></span>
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
            className="dock-hit"
            href={item.href}
            aria-label={item.label}
            style={{ left: item.left }}
          />
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
