import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { NavButton } from './shared/NavButton';
import { APP_NAVIGATION_EVENT, navigateApp, normalizeRoutePath } from './navigation';
import { useCampaigns } from '../campaign/store';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import {
  CAMPAIGN_PROGRESS_EVENT,
  isLevelUnlocked,
  orderedLevels,
  readProgress,
  type CampaignProgress,
} from '../campaign/progress';
import { MODE_NAME } from '../core/objectives';
import { levelObjectiveLine } from './LevelInfoCompact';
import { LevelThumbnail } from '../render/LevelThumbnail';
import type { Campaign as CampaignDoc } from '../core/level';
import { FittedTabLabel } from './shared/FittedTabLabel';

const ICONS = '/assets/ui/main-menu/icons-carved';
const STAR_ICON = '/assets/ui/kit/icons/star.png';
// Temp carved icon for campaign tiles until a dedicated 'campaign' carving is forged.
const CAMPAIGN_ICON = `${ICONS}/campaign-editor.png`;

// The picked campaign is encoded in the URL (/campaign/<id>) so it is linkable,
// reloadable, and back/forward-navigable — the same pattern /settings uses for its
// active section.
function campaignIdFromPath(pathname: string): string {
  return normalizeRoutePath(pathname).match(/^\/campaign\/(.+)$/)?.[1] ?? '';
}

const starsRowStyle: CSSProperties = { display: 'inline-flex', gap: 4, alignItems: 'center' };

function Stars({ count }: { count: number }): ReactElement {
  return (
    <span style={starsRowStyle} aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <img key={i} src={STAR_ICON} alt="" aria-hidden="true" style={{ width: 18, height: 18, opacity: i < count ? 1 : 0.22 }} />
      ))}
    </span>
  );
}

// A campaign rendered as a settings-style rail tab — the same baked-skin chrome the
// main menu's mode tabs use, so the Campaign screen reads as a twin of the menu.
// `index` is the tab's position down the rail — counted CONTINUOUSLY across both tiers
// (Official then Your Campaigns), skipping the group-divider rows, so the shared stone
// slice (--tab-index, see .settings-tab in style.css) flows as one sheet through the whole
// rail. A :nth-child ladder can't do this — the dividers are siblings and would shift it.
function CampaignTab({ campaign, active, index }: { campaign: CampaignDoc; active: boolean; index: number }): ReactElement {
  return (
    <NavButton
      className={`settings-tab main-menu-mode-tab ${active ? 'is-active' : ''}`.trim()}
      to={`/campaign/${campaign.id}`}
      style={{ ['--tab-index' as string]: index }}
      aria-current={active ? 'page' : undefined}
    >
      <span className="settings-tab-icon" aria-hidden="true">
        <img src={CAMPAIGN_ICON} alt="" />
      </span>
      <FittedTabLabel>{campaign.name}</FittedTabLabel>
    </NavButton>
  );
}

// The selected campaign's levels, in play order, with progress and a Play link.
function LevelSelect({ campaign, progress, embedded }: { campaign: CampaignDoc; progress: CampaignProgress; embedded?: boolean }): ReactElement {
  const levelDocs = useCampaigns((s) => s.levels);
  const refs = orderedLevels(campaign);

  return (
    <main className={embedded ? 'menu-dest-col menu-dest-action' : 'settings-frame settings-main-frame'}>
      <div className="settings-panel-content">
        <section className="settings-section">
          <h3 className="settings-section-title">{campaign.name} — Levels</h3>
          <div className="settings-section-rows">
            {refs.length === 0 && (
              <section className="settings-row">
                <div className="settings-row-copy">
                  <h4>No levels yet</h4>
                  <p>This campaign has no levels. Add some in the Editor.</p>
                </div>
              </section>
            )}
            {refs.map((ref, index) => {
              const level = levelDocs[ref.levelId];
              const prog = progress[ref.levelId];
              const completed = Boolean(prog?.completed);
              const unlocked = isLevelUnlocked(refs, index, progress);
              // Prefer the loaded level doc so the goal line is direction-aware (King Assault
              // reads "Protect your King" when the player holds the King). Fall back to the
              // campaign ref's objective — mode name only — when the doc hasn't hydrated.
              const goalLine = level
                ? levelObjectiveLine(level)
                : ref.objective ? MODE_NAME[ref.objective] : 'Battle';
              const status = completed ? ' · Cleared' : unlocked ? '' : ' · Locked';
              const playHref = `/play?campaignId=${encodeURIComponent(campaign.id)}&levelId=${encodeURIComponent(ref.levelId)}`;
              return (
                <section className={`settings-row ${unlocked ? '' : 'is-disabled'}`.trim()} key={ref.levelId}>
                  {/* Leading board preview — the same baked thumbnail the Campaign Editor's
                      level list uses, so a level looks identical wherever it's shown. Locked
                      levels still show their board (dimmed) as a peek at what's ahead. */}
                  <span className="settings-row-thumb" aria-hidden="true">
                    {level
                      ? <LevelThumbnail level={level} width={72} height={48} alt="" />
                      : <span className="settings-row-thumb-empty" />}
                  </span>
                  <div className="settings-row-copy">
                    <h4>{index + 1}. {level?.name ?? `Level ${index + 1}`}</h4>
                    <p>{goalLine}{status}</p>
                  </div>
                  <div className="settings-row-value">
                    <Stars count={prog?.stars ?? 0} />
                  </div>
                  <div className="settings-row-control">
                    {unlocked
                      ? (
                        <NavButton className="app-header-button app-header-button-active" to={playHref} aria-label={`Play ${level?.name ?? `level ${index + 1}`}`}>
                          {completed ? 'Replay' : 'Play'}
                        </NavButton>
                      )
                      : <button type="button" className="app-header-button" disabled>Locked</button>}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

// The Campaign (play) screen: a settings-twin of the main menu. The rail lists the
// campaigns (the editor at /editor authors them; this plays them) and the
// panel is the selected campaign's level select. Click the brand lockup to go home.
export function Campaign({ embedded = false }: { embedded?: boolean } = {}): ReactElement {
  const [selectedId, setSelectedId] = useState<string>(() => campaignIdFromPath(window.location.pathname));
  const [progress, setProgress] = useState<CampaignProgress>(readProgress);
  const campaigns = useCampaigns((s) => s.campaigns);

  useEffect(() => {
    if (embedded) return; // the persistent menu shell (MainMenu) owns .main-menu-active + the backdrop
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, [embedded]);

  // Load the shared workspace the same way the editor does, so the lists match. The
  // entrance fade HOLDS until this settles (ADR-0046 C.1 / ADR-0051): on a first visit
  // the store starts empty and the rail/panel would otherwise fade in as a bare frame
  // with the content popping in whenever the fetch lands. Already-hydrated visits are
  // ready at mount, so nothing holds. The promise always resolves (officials fall back
  // to the static file; user-workspace failures are swallowed), and the entrance
  // primitive's own failsafe backstops anything pathological.
  const [contentReady, setContentReady] = useState(() => useCampaigns.getState().campaigns.length > 0);
  useEffect(() => {
    let active = true;
    // .catch first: even a failed hydration must flip readiness (show whatever state
    // exists) rather than hold the chrome invisible until the entrance failsafe.
    void ensureCampaignsHydrated().catch(() => {}).then(() => { if (active) setContentReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const sync = () => setSelectedId(campaignIdFromPath(window.location.pathname));
    window.addEventListener('popstate', sync);
    window.addEventListener(APP_NAVIGATION_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(APP_NAVIGATION_EVENT, sync);
    };
  }, []);

  // Keep the level select's progress fresh when a battle is won (live event) or a
  // background tab updates localStorage.
  useEffect(() => {
    const sync = () => setProgress(readProgress());
    window.addEventListener('storage', sync);
    window.addEventListener(CAMPAIGN_PROGRESS_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CAMPAIGN_PROGRESS_EVENT, sync);
    };
  }, []);

  // Once campaigns load, a bare /campaign (or an unknown id) normalizes to the first
  // campaign so the URL always names a real one. Guarded to run only while the app is
  // still ON a campaign path: the URL-sync listener above also fires when the user
  // navigates AWAY (selectedId resets to ''), and this screen stays mounted for a beat
  // (route transition / veil cover) — without the guard, the replace here yanked every
  // exit (home via the brand, the settings gear, Play) straight back to /campaign/<id>.
  useEffect(() => {
    if (!campaigns.length) return;
    const path = normalizeRoutePath(window.location.pathname);
    if (path !== '/campaign' && !path.startsWith('/campaign/')) return;
    if (!campaigns.some((c) => c.id === selectedId)) {
      navigateApp(`/campaign/${campaigns[0].id}`, { replace: true, scroll: false });
    }
  }, [campaigns, selectedId]);

  const activeId = campaigns.some((c) => c.id === selectedId) ? selectedId : campaigns[0]?.id ?? '';
  const activeCampaign = campaigns.find((c) => c.id === activeId) ?? null;
  // Tier split (ADR-0038): official campaigns show for everyone; the user's own only
  // when signed in. The store already orders officials first.
  const officialCampaigns = campaigns.filter((c) => c.origin === 'official');
  const myCampaigns = campaigns.filter((c) => c.origin !== 'official');

  // The two campaign columns — the campaign list (a tab column) + the selected campaign's level
  // select (an action column). Shared by the standalone route AND the embedded-in-shell render.
  const inner = (
    <>
      <aside className={embedded ? 'menu-dest-col menu-dest-tabs' : 'settings-frame settings-rail-frame'} aria-label="Campaigns">
        {officialCampaigns.length > 0 && (
          <>
            {/* Only label the tiers when the user actually has their own (myCampaigns
                is non-empty only when signed in — it comes from the authed merge). */}
            {myCampaigns.length > 0 ? <p className="campaign-rail-group">Official</p> : null}
            {officialCampaigns.map((campaign, i) => (
              <CampaignTab key={campaign.id} campaign={campaign} active={campaign.id === activeId} index={i} />
            ))}
          </>
        )}
        {myCampaigns.length > 0 && (
          <>
            <p className="campaign-rail-group">Your Campaigns</p>
            {myCampaigns.map((campaign, i) => (
              // Continue the index past the official tier so the stone stays one sheet.
              <CampaignTab key={campaign.id} campaign={campaign} active={campaign.id === activeId} index={officialCampaigns.length + i} />
            ))}
          </>
        )}
      </aside>

      {activeCampaign && <LevelSelect campaign={activeCampaign} progress={progress} embedded={embedded} />}
    </>
  );

  // Embedded in the persistent menu shell (MainMenu's second column): render just the two columns.
  // The shell owns the backdrop, screen wrapper, cold-reveal gates, and zoom-safe placement.
  if (embedded) return inner;

  return (
    // The cold-load reveal director (shell/coldReveal) arms ONLY on the home menu path,
    // so it never sequences this screen. But its opt-OUT gates hide any .main-menu-layer's
    // background (HomepageBackdrop's scene) and buttons (.main-menu-twin-screen) UNTIL data-reveal-*
    // is present (#238). The Campaign reuses those twin classes without running the director,
    // so declare both up front to render fully revealed — otherwise the scene + level buttons
    // stay stuck at opacity 0.
    <div
      className="menu-layer main-menu-layer is-ready"
      data-testid="campaign-menu"
      data-reveal-bg=""
      data-reveal-buttons=""
    >
      {/* Same shared backdrop (animated menu scene + synced rain) as the main menu. */}
      <HomepageBackdrop />
      {/* Settings-twin layout, mirroring the main menu: shared app title bar + a rail
          of campaign tabs and a level-select panel over the ambience. */}
      <div className="settings-screen main-menu-twin-screen app-shell-bar-pad">
        <ArtRouteChrome className="settings-shell" ready={contentReady}>
          {inner}
        </ArtRouteChrome>
      </div>
    </div>
  );
}
