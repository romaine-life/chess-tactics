import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { ensureCampaignsHydrated, isUserWorkspaceAvailable } from '../campaign/hydrate';
import {
  CAMPAIGN_PROGRESS_EVENT,
  isLevelUnlocked,
  orderedLevels,
  readProgress,
  type CampaignProgress,
} from '../campaign/progress';
import { useCampaigns } from '../campaign/store';
import type { Campaign as CampaignDoc, Level } from '../core/level';
import { spawnEventsForLevel } from '../core/levelEvents';
import { MODE_NAME } from '../core/objectives';
import { LevelThumbnail } from '../render/LevelThumbnail';
import { APP_NAVIGATION_EVENT, navigateApp, normalizeRoutePath } from './navigation';
import { FittedTabLabel } from './shared/FittedTabLabel';
import { KitScroll } from './KitScroll';
import { levelObjectiveLine } from './LevelInfoCompact';
import { LevelPreviewColumn } from './LevelPreviewColumn';
import {
  PLAY_LEVELS_SELECTOR_HREF,
  PLAY_SKIRMISH_SELECTOR_HREF,
  isPlaySelectorPath,
  playCampaignSelectorHref,
  playHubSelection,
  type PlayHubSelection,
} from './playHubRoute';
import { NavButton } from './shared/NavButton';
import { playSkirmishLevelHref, skirmishMapLevels } from './skirmishMaps';
import { skirmishProfileLevels } from './skirmishProfiles';
import { chromeUnitClassNames } from './chromeUnitRegistry';

const ICONS = '/assets/ui/main-menu/icons-carved';
const CAMPAIGN_ICON = `${ICONS}/campaign-editor.png`;

function PlayRailTab({
  label,
  href,
  icon,
  active,
  index,
}: {
  label: string;
  href: string;
  icon: string;
  active: boolean;
  index: number;
}): ReactElement {
  return (
    <NavButton
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'settings-tab main-menu-mode-tab', active && 'is-active')}
      to={href}
      style={{ ['--tab-index' as string]: index }}
      aria-current={active ? 'page' : undefined}
    >
      <span className="settings-tab-icon" aria-hidden="true">
        <img src={`${ICONS}/${icon}.png`} alt="" />
      </span>
      <FittedTabLabel>{label}</FittedTabLabel>
    </NavButton>
  );
}

function CampaignTab({ campaign, active, index }: { campaign: CampaignDoc; active: boolean; index: number }): ReactElement {
  return (
    <NavButton
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'settings-tab main-menu-mode-tab', active && 'is-active')}
      to={playCampaignSelectorHref(campaign.id)}
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

function levelForceSummary(level: Level): string {
  const count = (side: 'player' | 'enemy'): number => {
    const painted = level.layers.units.filter((unit) => unit.side === side).length;
    const spawned = spawnEventsForLevel(level)
      .filter((event) => event.side === side)
      .reduce((sum, event) => sum + Object.values(event.roster ?? {}).reduce((inner, n) => inner + (n ?? 0), 0), 0);
    return painted + spawned;
  };
  return `${count('player')}v${count('enemy')}`;
}

function ActionColumn({ children }: { children: ReactElement }): ReactElement {
  return (
    <main className="menu-dest-col menu-dest-action play-action-col">
      <KitScroll className="play-action-scroll">{children}</KitScroll>
    </main>
  );
}

function SkirmishProfilesPanel({
  levels,
  loading,
  officialAvailable,
  userWorkspaceAvailable,
}: {
  levels: Level[];
  loading: boolean;
  officialAvailable: boolean;
  userWorkspaceAvailable: boolean;
}): ReactElement {
  return (
    <ActionColumn>
      <div className="settings-panel-content">
        <section className="settings-section">
          <h3 className="settings-section-title">Skirmish</h3>
          <div className="settings-section-rows">
            {!loading && !officialAvailable ? (
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')} role="status">
                <div className="settings-row-copy">
                  <h4>Official content unavailable</h4>
                  <p>Skirmishes could not be loaded. Reopen Play to retry.</p>
                </div>
              </section>
            ) : null}
            {!loading && !userWorkspaceAvailable ? (
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')} role="status">
                <div className="settings-row-copy">
                  <h4>Your workspace is unavailable</h4>
                  <p>Your skirmish profiles could not be loaded. Reopen Play to retry.</p>
                </div>
              </section>
            ) : null}
            {loading ? (
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')}>
                <div className="settings-row-copy"><h4>Loading skirmishes…</h4></div>
              </section>
            ) : null}
            {!loading && officialAvailable && userWorkspaceAvailable && levels.length === 0 ? (
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')}>
                <div className="settings-row-copy">
                  <h4>No skirmish profiles available</h4>
                  <p>Skirmishes appear here when they are authored in the shared content system.</p>
                </div>
              </section>
            ) : null}
            {levels.map((level) => (
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')} key={level.id}>
                <span data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row-thumb')} aria-hidden="true">
                  <LevelThumbnail level={level} width={72} height={48} alt="" />
                </span>
                <div className="settings-row-copy">
                  <h4>{level.name}</h4>
                  <p>{levelObjectiveLine(level)} · {levelForceSummary(level)} · {level.board.cols}x{level.board.rows}</p>
                </div>
                <div className="settings-row-control">
                  <NavButton
                    data-chrome-unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                    to={playSkirmishLevelHref(level.id)}
                    aria-label={`Play ${level.name}`}
                  >
                    Play
                  </NavButton>
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </ActionColumn>
  );
}

function StandaloneLevelsPanel({
  levels,
  loading,
  officialAvailable,
  userWorkspaceAvailable,
}: {
  levels: Level[];
  loading: boolean;
  officialAvailable: boolean;
  userWorkspaceAvailable: boolean;
}): ReactElement {
  return (
    <ActionColumn>
      <div className="settings-panel-content">
        <section className="settings-section">
          <h3 className="settings-section-title">Levels</h3>
          <div className="settings-section-rows">
            {!loading && !officialAvailable ? (
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')} role="status">
                <div className="settings-row-copy">
                  <h4>Official content unavailable</h4>
                  <p>Public levels could not be loaded. Reopen Play to retry.</p>
                </div>
              </section>
            ) : null}
            {!loading && !userWorkspaceAvailable ? (
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')} role="status">
                <div className="settings-row-copy">
                  <h4>Your workspace is unavailable</h4>
                  <p>Your standalone levels could not be loaded. Reopen Play to retry.</p>
                </div>
              </section>
            ) : null}
            {loading ? (
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')}>
                <div className="settings-row-copy"><h4>Loading levels…</h4></div>
              </section>
            ) : null}
            {!loading && officialAvailable && userWorkspaceAvailable && levels.length === 0 ? (
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')}>
                <div className="settings-row-copy">
                  <h4>No standalone levels</h4>
                  <p>Save a board in the Level Editor and it appears here.</p>
                </div>
                <div className="settings-row-control">
                  <NavButton data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button')} to="/editor/level">Open Editor</NavButton>
                </div>
              </section>
            ) : null}
            {levels.map((level) => {
              const playerCount = level.layers.units.filter((unit) => unit.side === 'player').length;
              const enemyCount = level.layers.units.filter((unit) => unit.side === 'enemy').length;
              return (
                <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')} key={level.id}>
                  <span data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row-thumb')} aria-hidden="true">
                    <LevelThumbnail level={level} width={72} height={48} alt="" />
                  </span>
                  <div className="settings-row-copy">
                    <h4>{level.name}</h4>
                    <p>{levelObjectiveLine(level)} · {playerCount}v{enemyCount} · {level.board.cols}x{level.board.rows}</p>
                  </div>
                  <div className="settings-row-control">
                    <NavButton
                      data-chrome-unit="inner-text-button"
                      className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                      to={playSkirmishLevelHref(level.id, PLAY_LEVELS_SELECTOR_HREF)}
                      aria-label={`Play ${level.name}`}
                    >
                      Play
                    </NavButton>
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </ActionColumn>
  );
}

function CampaignLevelsPanel({
  campaign,
  progress,
  selectedLevelId,
  onSelectLevel,
}: {
  campaign: CampaignDoc;
  progress: CampaignProgress;
  selectedLevelId: string | null;
  onSelectLevel: (levelId: string) => void;
}): ReactElement {
  const levelDocs = useCampaigns((state) => state.levels);
  const refs = orderedLevels(campaign);

  return (
    <ActionColumn>
      <div className="settings-panel-content">
        <section className="settings-section">
          <h3 className="settings-section-title">{campaign.name} — Levels</h3>
          <div className="settings-section-rows">
            {refs.length === 0 ? (
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')}>
                <div className="settings-row-copy">
                  <h4>No levels yet</h4>
                  <p>This campaign has no levels. Add some in the Editor.</p>
                </div>
              </section>
            ) : null}
            {refs.map((ref, index) => {
              const level = levelDocs[ref.levelId];
              const levelProgress = progress[ref.levelId];
              const completed = Boolean(levelProgress?.completed);
              const unlocked = isLevelUnlocked(refs, index, progress);
              const goalLine = level
                ? levelObjectiveLine(level)
                : ref.objective ? MODE_NAME[ref.objective] : 'Battle';
              const status = completed
                ? (
                  <span className="campaign-level-status is-cleared">
                    <span className="campaign-level-status-check" aria-hidden="true" />
                    Cleared
                  </span>
                )
                : unlocked ? null : <span className="campaign-level-status is-locked">Locked</span>;
              const playHref = `/play?campaignId=${encodeURIComponent(campaign.id)}&levelId=${encodeURIComponent(ref.levelId)}`;
              return (
                <section
                  data-chrome-unit="inner-box"
                  className={chromeUnitClassNames('inner-box', 'settings-row campaign-level-row', !unlocked && 'is-disabled', ref.levelId === selectedLevelId && 'active is-selected')}
                  key={ref.levelId}
                  role="button"
                  tabIndex={0}
                  aria-current={ref.levelId === selectedLevelId ? 'true' : undefined}
                  onClick={() => onSelectLevel(ref.levelId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectLevel(ref.levelId);
                    }
                  }}
                >
                  <span data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row-thumb')} aria-hidden="true">
                    {level
                      ? <LevelThumbnail level={level} width={68} height={44} alt="" />
                      : <span className="settings-row-thumb-empty" />}
                  </span>
                  <div className="settings-row-copy">
                    <h4>{index + 1}. {level?.name ?? `Level ${index + 1}`}</h4>
                    <div className="campaign-level-meta">
                      <p className="campaign-level-goal">{goalLine}</p>
                      {status}
                    </div>
                  </div>
                  <div className="settings-row-control" onClick={(event) => event.stopPropagation()}>
                    {unlocked
                      ? (
                        <NavButton data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')} to={playHref} aria-label={`Play ${level?.name ?? `level ${index + 1}`}`}>
                          Play
                        </NavButton>
                      )
                      : <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button')} disabled>Locked</button>}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </ActionColumn>
  );
}

export function PlayMenu(): ReactElement {
  const campaigns = useCampaigns((state) => state.campaigns);
  const levels = useCampaigns((state) => state.levels);
  const [selection, setSelection] = useState<PlayHubSelection>(
    () => playHubSelection(window.location.pathname) ?? { mode: 'skirmish' },
  );
  const [progress, setProgress] = useState<CampaignProgress>(readProgress);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [officialAvailable, setOfficialAvailable] = useState(false);
  const [userWorkspaceAvailable, setUserWorkspaceAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void ensureCampaignsHydrated()
      .then((result) => {
        if (!active) return;
        setOfficialAvailable(result.officialAvailable);
        // Signed-out is a complete anonymous result, while unavailable means the private
        // levels are unknown and must not be presented as an honestly empty workspace.
        setUserWorkspaceAvailable(isUserWorkspaceAvailable(result.userWorkspace));
      })
      .catch(() => {
        if (!active) return;
        setOfficialAvailable(false);
        setUserWorkspaceAvailable(false);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const sync = () => {
      const path = window.location.pathname;
      // APP_NAVIGATION_EVENT fires before React unmounts this selector. Ignore a valid
      // departure to the live board/editor/etc.; only canonicalize malformed addresses
      // that still belong to the Play selector namespace.
      if (!isPlaySelectorPath(path)) return;
      const nextSelection = playHubSelection(path);
      if (!nextSelection) {
        navigateApp(PLAY_SKIRMISH_SELECTOR_HREF, { replace: true, scroll: false });
        return;
      }
      setSelection(nextSelection);
    };
    window.addEventListener('popstate', sync);
    window.addEventListener(APP_NAVIGATION_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(APP_NAVIGATION_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    const sync = () => setProgress(readProgress());
    window.addEventListener('storage', sync);
    window.addEventListener(CAMPAIGN_PROGRESS_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CAMPAIGN_PROGRESS_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    const path = normalizeRoutePath(window.location.pathname);
    // The location changes before this component unmounts on a route departure. A late
    // hydration/store update must not reinterpret the live board or editor as a malformed
    // selector and pull the player back into Play.
    if (!isPlaySelectorPath(path)) return;
    if (!playHubSelection(path)) {
      navigateApp(PLAY_SKIRMISH_SELECTOR_HREF, { replace: true, scroll: false });
      return;
    }
    if (
      !loading
      && officialAvailable
      && userWorkspaceAvailable
      && selection.mode === 'campaign'
      && !campaigns.some((campaign) => campaign.id === selection.campaignId)
    ) {
      navigateApp(PLAY_SKIRMISH_SELECTOR_HREF, { replace: true, scroll: false });
    }
  }, [campaigns, loading, officialAvailable, selection, userWorkspaceAvailable]);

  useEffect(() => { setSelectedLevelId(null); }, [selection]);

  const profileLevels = useMemo(() => skirmishProfileLevels(levels), [levels]);
  const standaloneLevels = useMemo(() => skirmishMapLevels(campaigns, levels), [campaigns, levels]);
  const officialCampaigns = campaigns.filter((campaign) => campaign.origin === 'official');
  const myCampaigns = campaigns.filter((campaign) => campaign.origin !== 'official');
  const activeCampaign = selection.mode === 'campaign'
    ? campaigns.find((campaign) => campaign.id === selection.campaignId) ?? null
    : null;
  const activeRefs = activeCampaign ? orderedLevels(activeCampaign) : [];
  const selectedLevel = selectedLevelId ? levels[selectedLevelId] ?? null : null;
  const selectedIndex = activeRefs.findIndex((ref) => ref.levelId === selectedLevelId);
  const selectedTitle = selectedLevel
    ? selectedIndex >= 0 ? `Level ${selectedIndex + 1}: ${selectedLevel.name}` : selectedLevel.name
    : '';
  const selectedUnlocked = selectedIndex >= 0 && isLevelUnlocked(activeRefs, selectedIndex, progress);
  const selectedPlayHref = activeCampaign && selectedLevelId
    ? `/play?campaignId=${encodeURIComponent(activeCampaign.id)}&levelId=${encodeURIComponent(selectedLevelId)}`
    : '/play';

  return (
    <>
      <aside className="menu-dest-col menu-dest-tabs play-source-rail" aria-label="Play">
        <div className="play-source-fixed">
          <PlayRailTab
            label="Skirmish"
            href={PLAY_SKIRMISH_SELECTOR_HREF}
            icon="solo-skirmish"
            active={selection.mode === 'skirmish'}
            index={0}
          />
          <PlayRailTab
            label="Levels"
            href={PLAY_LEVELS_SELECTOR_HREF}
            icon="level-editor"
            active={selection.mode === 'levels'}
            index={1}
          />
        </div>

        <section className="play-campaign-region" aria-labelledby="play-campaign-heading">
          <p className="campaign-rail-group play-campaign-heading" id="play-campaign-heading">Campaign</p>
          <KitScroll className="play-campaign-scroll">
            <div className="play-campaign-list">
              {!loading && !officialAvailable ? <p className="play-content-warning" role="status">Official campaigns unavailable. Reopen Play to retry.</p> : null}
              {!loading && !userWorkspaceAvailable ? <p className="play-content-warning" role="status">Your campaigns are unavailable. Reopen Play to retry.</p> : null}
              {!loading && officialAvailable && userWorkspaceAvailable && campaigns.length === 0 ? <p className="play-empty">No campaigns available.</p> : null}
              {officialCampaigns.length > 0 ? (
                <>
                  {myCampaigns.length > 0 ? <p className="campaign-rail-group">Official</p> : null}
                  {officialCampaigns.map((campaign, index) => (
                    <CampaignTab
                      key={campaign.id}
                      campaign={campaign}
                      active={selection.mode === 'campaign' && selection.campaignId === campaign.id}
                      index={index + 2}
                    />
                  ))}
                </>
              ) : null}
              {myCampaigns.length > 0 ? (
                <>
                  <p className="campaign-rail-group">Your Campaigns</p>
                  {myCampaigns.map((campaign, index) => (
                    <CampaignTab
                      key={campaign.id}
                      campaign={campaign}
                      active={selection.mode === 'campaign' && selection.campaignId === campaign.id}
                      index={officialCampaigns.length + index + 2}
                    />
                  ))}
                </>
              ) : null}
            </div>
          </KitScroll>
        </section>
      </aside>

      {selection.mode === 'skirmish' ? (
        <SkirmishProfilesPanel
          levels={profileLevels}
          loading={loading}
          officialAvailable={officialAvailable}
          userWorkspaceAvailable={userWorkspaceAvailable}
        />
      ) : null}
      {selection.mode === 'levels' ? (
        <StandaloneLevelsPanel
          levels={standaloneLevels}
          loading={loading}
          officialAvailable={officialAvailable}
          userWorkspaceAvailable={userWorkspaceAvailable}
        />
      ) : null}
      {activeCampaign ? (
        <CampaignLevelsPanel
          campaign={activeCampaign}
          progress={progress}
          selectedLevelId={selectedLevelId}
          onSelectLevel={setSelectedLevelId}
        />
      ) : null}

      {activeCampaign && selectedLevel ? (
        <LevelPreviewColumn
          level={selectedLevel}
          title={selectedTitle}
          embedded
          actions={
            <div className="ce-preview-actions is-single">
              {selectedUnlocked
                ? <NavButton data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'ce-link-button')} to={selectedPlayHref}><span>Play</span></NavButton>
                : <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'ce-link-button')} disabled><span>Locked</span></button>}
            </div>
          }
        />
      ) : null}
    </>
  );
}
