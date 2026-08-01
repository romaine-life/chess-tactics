import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
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
import { navigateApp } from './navigation';
import { ApparatusRailTab } from './shared/ApparatusRailTab';
import { KitScroll } from './KitScroll';
import { levelObjectiveLine } from './LevelInfoCompact';
import { LevelPreviewColumn } from './LevelPreviewColumn';
import {
  PLAY_LEVELS_SELECTOR_HREF,
  PLAY_RUN_SELECTOR_HREF,
  PLAY_SELECTOR_ROOT,
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
import { installedUiMedia } from './installedUiMedia';
import { PaintedSurfaceBoundary } from './shell/PaintedSurfaceBoundary';
import { sceneTransitionTargetAttributes } from './shell/sceneTransitionTarget';
import {
  GatedLevelThumbnail,
  ThumbnailSurface as AtomicThumbnailSurface,
  type ThumbnailSurfaceState,
} from './shell/ThumbnailSurface';
import { drawableAssets } from '@chess-tactics/board-render';
import { useWars, runEligibleOfficialWars } from '../war/store';
import { useActiveRun } from '../run/store';
import { ATARAXIA_BY_TIER, createRun, formatGold, snapshotWar, type AtaraxiaTier } from '../run/model';
import {
  RUN_PROGRESSION_EVENT,
  highestUnlockedAtaraxiaTier,
  readRunProgression,
} from '../run/progression';
import { useConfirm } from './shared/ConfirmDialog';
import { InnerChromeBox } from './shared/ChromeBox';
import { loadMatch, type PersistedMatch } from '../game/matchPersistence';
import { continueActivity } from './playContinue';
import { AtaraxiaSelector } from './AtaraxiaSelector';

type PlayIcon = 'solo-skirmish' | 'campaign-editor' | 'level-editor' | 'lobbies';

/** Installed menu-mode records own their icons. Play must not independently ask
 * app-ui for duplicate legacy path roles that are not members of that projection. */
function menuModeIcon(value: 'play' | 'campaign-editor' | 'lobbies'): string {
  const asset = drawableAssets('menu-mode').find((candidate) => candidate.behavior.value === value);
  const icon = asset?.media.icon?.media.immutableUrl;
  if (!icon) throw new Error(`menu mode ${value} has no installed icon`);
  return icon;
}

function carvedIcon(name: PlayIcon): string {
  if (name === 'solo-skirmish') return menuModeIcon('play');
  if (name === 'campaign-editor') return menuModeIcon('campaign-editor');
  if (name === 'lobbies') return menuModeIcon('lobbies');
  return installedUiMedia('ui-kit-icons-design-index-png');
}

const CAMPAIGN_ICON = carvedIcon('campaign-editor');

function PlayRailTab({
  label,
  href,
  icon,
  active,
  index,
}: {
  label: string;
  href: string;
  icon: PlayIcon;
  active: boolean;
  index: number;
}): ReactElement {
  return <ApparatusRailTab label={label} to={href} iconSrc={carvedIcon(icon)} active={active} index={index} />;
}

function CampaignTab({ campaign, active, index }: { campaign: CampaignDoc; active: boolean; index: number }): ReactElement {
  return (
    <ApparatusRailTab
      label={campaign.name}
      to={playCampaignSelectorHref(campaign.id)}
      iconSrc={CAMPAIGN_ICON}
      active={active}
      index={index}
    />
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

function RunPanel({
  levels,
  loading,
  officialAvailable,
}: {
  levels: Record<string, Level>;
  loading: boolean;
  officialAvailable: boolean;
}): ReactElement {
  const wars = useWars((state) => state.wars);
  const run = useActiveRun((state) => state.run);
  const hydrated = useActiveRun((state) => state.hydrated);
  const persistenceError = useActiveRun((state) => state.persistenceError);
  const adoptionConflict = useActiveRun((state) => state.adoptionConflict);
  const syncing = useActiveRun((state) => state.syncing);
  const hydrate = useActiveRun((state) => state.hydrate);
  const replace = useActiveRun((state) => state.replace);
  const abandon = useActiveRun((state) => state.abandon);
  const keepAccountRun = useActiveRun((state) => state.keepAccountRun);
  const adoptBrowserRun = useActiveRun((state) => state.adoptBrowserRun);
  const { ask, dialog } = useConfirm();
  const [starting, setStarting] = useState(false);
  const [progression, setProgression] = useState(readRunProgression);
  const [ataraxiaTier, setAtaraxiaTier] = useState<AtaraxiaTier>(0);
  const eligible = useMemo(() => runEligibleOfficialWars(wars), [wars]);
  const highestUnlockedTier = highestUnlockedAtaraxiaTier(progression);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    const sync = (): void => setProgression(readRunProgression());
    window.addEventListener(RUN_PROGRESSION_EVENT, sync);
    return () => window.removeEventListener(RUN_PROGRESSION_EVENT, sync);
  }, []);
  useEffect(() => {
    if (ataraxiaTier > highestUnlockedTier) setAtaraxiaTier(highestUnlockedTier);
  }, [ataraxiaTier, highestUnlockedTier]);

  const start = async (): Promise<void> => {
    if (starting || syncing || !eligible.length) return;
    setStarting(true);
    try {
      if (run) {
        const confirmed = await ask({
          title: 'Abandon the active Run?',
          message: `${run.war.name} will be replaced. This cannot be undone.`,
          confirmLabel: 'Abandon and start',
          cancelLabel: 'Keep Run',
          tone: 'danger',
        });
        if (!confirmed) return;
        await abandon();
      }
      const seedArray = new Uint32Array(1);
      globalThis.crypto?.getRandomValues?.(seedArray);
      const seed = seedArray[0] || (Date.now() >>> 0);
      const war = [...eligible].sort((a, b) => a.id.localeCompare(b.id))[seed % eligible.length];
      replace(createRun(snapshotWar(war, levels), seed, ataraxiaTier));
      navigateApp('/run');
    } finally {
      setStarting(false);
    }
  };

  return (
    <ActionColumn>
      <div className="play-action-stack run-selector-panel">
        {dialog}
        <div className="play-action-heading">
          <span className="play-action-kicker">Roguelike chess</span>
          <h2>Run</h2>
          <p>Carry one persistent army through a randomly selected eligible War. Battles remain chess; shops, deployment, and relics shape the Run around them.</p>
        </div>
        {!hydrated || loading ? <p className="play-empty" role="status">Loading Runs…</p> : null}
        {adoptionConflict ? (
          <InnerChromeBox className="play-level-card" role="alert">
            <h3>Two active Runs</h3>
            <p>This browser has {adoptionConflict.browserRun.war.name}; your account has {adoptionConflict.accountRun.war.name}. Choose which one the account keeps.</p>
            <div className="run-inline-actions">
              <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button')} onClick={keepAccountRun}>Keep account Run</button>
              <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')} disabled={syncing} onClick={() => { void adoptBrowserRun(); }}>Adopt browser Run</button>
            </div>
          </InnerChromeBox>
        ) : run ? (
          <InnerChromeBox className="play-level-card">
            <h3>{run.war.name}</h3>
            <p>{run.war.description || 'Active War'}</p>
            <p>Battle {run.battleIndex + 1} of {run.war.battles.length} · {run.army.length} units · {formatGold(run.goldTenths)} gold · {ATARAXIA_BY_TIER[run.ataraxiaTier].label}</p>
            <NavButton data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')} to="/run">Play</NavButton>
          </InnerChromeBox>
        ) : null}
        {!loading && officialAvailable && eligible.length === 0 ? (
          <p className="play-empty">No official Wars are currently marked Eligible for Run. You can author and direct-play a private War in the War Editor.</p>
        ) : null}
        {!loading && !officialAvailable ? <p className="play-content-warning">Official Wars are unavailable. Reopen Play to retry.</p> : null}
        <AtaraxiaSelector
          value={ataraxiaTier}
          highestUnlockedTier={highestUnlockedTier}
          onChange={setAtaraxiaTier}
        />
        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
          disabled={loading || !hydrated || starting || syncing || eligible.length === 0 || Boolean(adoptionConflict)}
          onClick={() => { void start(); }}
        >
          {starting ? 'Starting…' : run ? 'Start a new Run' : 'Start Run'}
        </button>
        {persistenceError ? <p className="play-content-warning" role="status">{persistenceError}</p> : null}
      </div>
    </ActionColumn>
  );
}

const ThumbnailSurfaceReportContext = createContext<((state: ThumbnailSurfaceState) => void) | null>(null);

function ThumbnailSurface({ levels, children }: { levels: readonly Level[]; children: ReactNode }): ReactElement {
  const reportSurface = useContext(ThumbnailSurfaceReportContext);
  return (
    <AtomicThumbnailSurface
      levels={levels}
      participantId="play-list-thumbnails"
      viewportSelector=".play-action-scroll"
      loadingLabel="Preparing levels…"
      onStateChange={reportSurface ?? undefined}
    >
      {children}
    </AtomicThumbnailSurface>
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
      <ThumbnailSurface levels={levels}><div className="settings-panel-content">
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
                  <GatedLevelThumbnail level={level} width={72} alt="" />
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
      </div></ThumbnailSurface>
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
      <ThumbnailSurface levels={levels}><div className="settings-panel-content">
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
                    <GatedLevelThumbnail level={level} width={72} alt="" />
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
      </div></ThumbnailSurface>
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
  const thumbnailLevels = refs.flatMap((ref) => levelDocs[ref.levelId] ? [levelDocs[ref.levelId]] : []);

  return (
    <ActionColumn>
      <ThumbnailSurface levels={thumbnailLevels}><div className="settings-panel-content">
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
                      ? <GatedLevelThumbnail level={level} width={66} alt="" />
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
      </div></ThumbnailSurface>
    </ActionColumn>
  );
}

export function PlayMenu({
  path,
  sceneInstanceKey,
}: {
  path: string;
  sceneInstanceKey: string;
}): ReactElement {
  const campaigns = useCampaigns((state) => state.campaigns);
  const levels = useCampaigns((state) => state.levels);
  const activeRun = useActiveRun((state) => state.run);
  const runHydrated = useActiveRun((state) => state.hydrated);
  const hydrateRun = useActiveRun((state) => state.hydrate);
  const [persistedMatch, setPersistedMatch] = useState<PersistedMatch | null>(() => loadMatch());
  // `path` is the scene director's mounted scene path. Browser navigation only
  // requests a destination; it must never reveal Play content ahead of the
  // director's exit, preparation, paint acknowledgement, and entrance lifecycle.
  // Route selection is scene state, not an object to recreate on every render. A fresh
  // object here used to retrigger the reset effect after setSelectedLevelId(), clearing
  // the level immediately and briefly invalidating the complete Play surface.
  const selection: PlayHubSelection = useMemo(
    () => playHubSelection(path) ?? { mode: 'hub' },
    [path],
  );
  const [progress, setProgress] = useState<CampaignProgress>(readProgress);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const resumable = useMemo(
    () => continueActivity(activeRun, persistedMatch, campaigns, levels),
    [activeRun, campaigns, levels, persistedMatch],
  );
  const [officialAvailable, setOfficialAvailable] = useState(false);
  const [userWorkspaceAvailable, setUserWorkspaceAvailable] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [thumbnailSurface, setThumbnailSurface] = useState<ThumbnailSurfaceState>({
    complete: false,
    error: null,
  });
  const reportThumbnailSurface = useCallback((next: ThumbnailSurfaceState) => {
    setThumbnailSurface((current) => (
      current.complete === next.complete && current.error === next.error ? current : next
    ));
  }, []);

  useEffect(() => {
    void hydrateRun();
    const refresh = () => setPersistedMatch(loadMatch());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [hydrateRun]);

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
  }, [loadAttempt]);

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
    if (!isPlaySelectorPath(path)) return;
    if (!playHubSelection(path)) {
      navigateApp(PLAY_SELECTOR_ROOT, { replace: true, scroll: false });
      return;
    }
    if (
      !loading
      && officialAvailable
      && userWorkspaceAvailable
      && selection.mode === 'campaign'
      && !campaigns.some((campaign) => campaign.id === selection.campaignId)
    ) {
      navigateApp(PLAY_SELECTOR_ROOT, { replace: true, scroll: false });
    }
  }, [campaigns, loading, officialAvailable, path, selection, userWorkspaceAvailable]);

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
  const surfaceSignature = [
    selection.mode,
    selection.mode === 'campaign' ? selection.campaignId : '',
    ...profileLevels.map((level) => level.id),
    ...standaloneLevels.map((level) => level.id),
    ...activeRefs.map((ref) => ref.levelId),
  ].join(':');
  const loadError = !loading && (!officialAvailable || !userWorkspaceAvailable)
    ? new Error('Canonical Play content is unavailable.')
    : null;
  // Run and the neutral hub mount no thumbnail surface, so a stale thumbnail
  // failure from a previously selected list must not condemn them.
  const surfaceError = loadError
    ?? (selection.mode === 'run' || selection.mode === 'hub' ? null : thumbnailSurface.error);
  // The bare Play root always reveals the picker (ADR-0260): a resumable
  // activity is an offered Continue card, never an automatic redirect. Hold
  // composition only until the Run document settles so the Continue offer and
  // rail order don't pop in after reveal.
  const hubLandingSettled = selection.mode !== 'hub' || runHydrated;

  return (
    <ThumbnailSurfaceReportContext.Provider value={reportThumbnailSurface}>
      <div
        className={`play-scene-authority${selectedLevel ? ' has-level-preview' : ''}`}
        data-official-authority={loading ? 'loading' : officialAvailable ? 'ready' : 'error'}
        data-user-authority={loading ? 'loading' : userWorkspaceAvailable ? 'ready' : 'error'}
        data-thumbnail-authority={thumbnailSurface.error ? 'error' : thumbnailSurface.complete ? 'ready' : 'loading'}
      >
      <aside className="menu-dest-col menu-dest-tabs play-source-rail" aria-label="Play">
        <div className="play-source-fixed">
          {resumable ? (
            <ApparatusRailTab
              label={resumable.label}
              detail={resumable.detail}
              to={resumable.href}
              iconSrc={carvedIcon(resumable.icon)}
              active={false}
              index={0}
              testId="play-continue"
            />
          ) : null}
          <PlayRailTab
            label="Skirmish"
            href={PLAY_SKIRMISH_SELECTOR_HREF}
            icon="solo-skirmish"
            active={selection.mode === 'skirmish'}
            index={resumable ? 1 : 0}
          />
          <PlayRailTab
            label="Run"
            href={PLAY_RUN_SELECTOR_HREF}
            icon="campaign-editor"
            active={selection.mode === 'run'}
            index={resumable ? 2 : 1}
          />
          <PlayRailTab
            label="Levels"
            href={PLAY_LEVELS_SELECTOR_HREF}
            icon="level-editor"
            active={selection.mode === 'levels'}
            index={resumable ? 3 : 2}
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
                      index={index + 3 + (resumable ? 1 : 0)}
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
                      index={officialCampaigns.length + index + 3 + (resumable ? 1 : 0)}
                    />
                  ))}
                </>
              ) : null}
            </div>
          </KitScroll>
        </section>
      </aside>

      <PaintedSurfaceBoundary
        surface="play-selector"
        signature={surfaceSignature}
        readyToCompose={
          !loading
          && !surfaceError
          && hubLandingSettled
          && (selection.mode === 'run' || selection.mode === 'hub' || thumbnailSurface.complete)
        }
        error={surfaceError}
        loadingLabel="Preparing Play…"
        onRetry={() => {
          setThumbnailSurface({ complete: false, error: null });
          setLoadAttempt((value) => value + 1);
        }}
        className="play-surface"
        showStatus={false}
      >
      <div
        className="play-destination-content"
        {...sceneTransitionTargetAttributes('play-shell', 'contents')}
        data-scene-instance={sceneInstanceKey}
      >
      {selection.mode === 'hub' ? (
        <ActionColumn>
          <div className="play-action-stack play-hub-neutral">
            <div className="play-action-heading">
              <span className="play-action-kicker">Play</span>
              <h2>Choose a mode</h2>
              <p>Pick Skirmish, Run, or Levels on the left, or open a Campaign beneath them.</p>
            </div>
            {resumable ? (
              <InnerChromeBox className="play-level-card play-hub-continue-card" data-testid="play-hub-continue">
                <h3>{resumable.label}</h3>
                <p>{resumable.detail}</p>
                <NavButton
                  data-chrome-unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                  to={resumable.href}
                >
                  Continue
                </NavButton>
              </InnerChromeBox>
            ) : null}
          </div>
        </ActionColumn>
      ) : null}
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
      {selection.mode === 'run' ? (
        <RunPanel
          levels={levels}
          loading={loading}
          officialAvailable={officialAvailable}
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
      </div>
      </PaintedSurfaceBoundary>
      </div>
    </ThumbnailSurfaceReportContext.Provider>
  );
}
