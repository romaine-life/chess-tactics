import { useEffect, useState, type ReactElement } from 'react';
import { fetchMe, signInHref, type AuthUser } from '../net/auth';
import { AmbienceBackground } from './AmbienceBackground';
import { BrandLockup } from './shared/BrandLockup';
import { APP_NAVIGATION_EVENT, navigateApp, normalizeRoutePath } from './navigation';
import { loadCampaigns } from '../campaign/defaultCampaigns';
import type { Campaign as CampaignDoc } from '../core/level';

const ICONS = '/assets/ui/main-menu/icons-carved';
// Temp carved icon for campaign tiles until a dedicated 'campaign' carving is forged.
const CAMPAIGN_ICON = `${ICONS}/campaign-editor.png`;

// The picked campaign is encoded in the URL (/campaign/<id>) so it is linkable,
// reloadable, and back/forward-navigable — the same pattern /settings uses for its
// active section.
function campaignIdFromPath(pathname: string): string {
  return normalizeRoutePath(pathname).match(/^\/campaign\/(.+)$/)?.[1] ?? '';
}

// A campaign rendered as a settings-style rail tab — the same baked-skin chrome the
// main menu's mode tabs use, so the Campaign screen reads as a twin of the menu.
function CampaignTab({ campaign, active }: { campaign: CampaignDoc; active: boolean }): ReactElement {
  return (
    <a
      className={`settings-tab main-menu-mode-tab ${active ? 'is-active' : ''}`.trim()}
      href={`/campaign/${campaign.id}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="settings-tab-icon" aria-hidden="true">
        <img src={CAMPAIGN_ICON} alt="" />
      </span>
      <span><strong>{campaign.name}</strong></span>
    </a>
  );
}

// The Campaign (play) screen: a settings-twin of the main menu whose rail lists the
// campaigns to pick from (the editor at /campaigns-next authors them; this plays
// them). Click the brand lockup (top-left) to return home.
export function Campaign(): ReactElement {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [selectedId, setSelectedId] = useState<string>(() => campaignIdFromPath(window.location.pathname));
  const campaigns = loadCampaigns();

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, []);

  useEffect(() => {
    // Bare /campaign normalizes to the first campaign so the URL always names one.
    const first = campaigns[0];
    if (first && normalizeRoutePath(window.location.pathname) === '/campaign') {
      navigateApp(`/campaign/${first.id}`, { replace: true, scroll: false });
    }
    const sync = () => setSelectedId(campaignIdFromPath(window.location.pathname));
    window.addEventListener('popstate', sync);
    window.addEventListener(APP_NAVIGATION_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(APP_NAVIGATION_EVENT, sync);
    };
  }, [campaigns]);

  useEffect(() => {
    let active = true;
    fetchMe().then((user) => { if (active) setMe(user); });
    return () => { active = false; };
  }, []);

  const signOut = async (): Promise<void> => {
    try { await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
    window.location.reload();
  };

  const signedIn = Boolean(me?.signed_in);
  const accountName = signedIn ? (me!.name || me!.email || 'Player') : 'Guest';
  const accountStatus = signedIn ? 'Signed in' : me === null ? 'Checking account' : 'Not signed in';
  const activeId = selectedId || campaigns[0]?.id || '';

  return (
    <div className="menu-layer main-menu-layer is-ready" data-testid="campaign-menu">
      <AmbienceBackground />
      {/* Settings-twin layout, mirroring the main menu: shared app title bar + a rail
          of campaign tabs over the ambience. */}
      <div className="settings-screen main-menu-twin-screen">
        <header className="app-titlebar settings-header-frame main-menu-twin-header">
          <BrandLockup screenName="Campaign" />
          <div className="settings-account" aria-label="Account">
            <span>
              <strong>{accountName}</strong>
              <em>{accountStatus}</em>
            </span>
            {signedIn
              ? <button type="button" className="app-header-button app-header-button-active" onClick={signOut}>Sign Out</button>
              : <a className="app-header-button app-header-button-active" href={signInHref('/campaign')}>Sign In</a>}
          </div>
        </header>

        <div className="settings-shell">
          <aside className="settings-frame settings-rail-frame" aria-label="Campaigns">
            {campaigns.map((campaign) => (
              <CampaignTab key={campaign.id} campaign={campaign} active={campaign.id === activeId} />
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}
