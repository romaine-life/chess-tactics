import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
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
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { KitScroll } from './KitScroll';
import { levelObjectiveLine } from './LevelInfoCompact';
import { LevelPreviewColumn } from './LevelPreviewColumn';
import {
  PLAY_LEVELS_SELECTOR_HREF,
  PLAY_CONTINUE_SELECTOR_HREF,
  PLAY_RUN_CURRENT_SELECTOR_HREF,
  PLAY_RUN_NEW_SELECTOR_HREF,
  PLAY_RUN_SELECTOR_HREF,
  PLAY_SELECTOR_ROOT,
  isPlaySelectorPath,
  playCampaignSelectorHref,
  playContinueSelectorHref,
  playHubSelection,
  type PlayContinueChoice,
  type PlayHubSelection,
} from './playHubRoute';
import { playSkirmishLevelHref, skirmishMapLevels } from './skirmishMaps';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { installedUiMedia } from './installedUiMedia';
import { PaintedSurfaceBoundary } from './shell/PaintedSurfaceBoundary';
import { PlayContentSceneSlot, RunDetailContentSceneSlot } from './shell/AuthoredSceneSlot';
import {
  GatedLevelThumbnail,
  ThumbnailSurface as AtomicThumbnailSurface,
  type ThumbnailSurfaceState,
} from './shell/ThumbnailSurface';
import { drawableAssets } from '@chess-tactics/board-render';
import { useWars, runEligibleOfficialWars } from '../war/store';
import { useActiveRun } from '../run/store';
import {
  ATARAXIA_BY_TIER, DEFAULT_RUN_RULES, createRun, formatGold, snapshotWar, type RunRules,
  type AtaraxiaTier,
} from '../run/model';
import {
  RUN_PROGRESSION_EVENT,
  highestUnlockedAtaraxiaTier,
  readRunProgression,
} from '../run/progression';
import { InnerChromeBox } from './shared/ChromeBox';
import { loadMatch, type PersistedMatch } from '../game/matchPersistence';
import { continueInventory, type ContinueInventory } from './playContinue';
import { AtaraxiaSelector } from './AtaraxiaSelector';
import { RunRulesSelector } from './RunRulesSelector';
import { ActionList } from './shared/ActionList';
import { SettingsRow, SettingsSection } from './shared/SettingsControls';
import { ChromeButton, ChromeNavButton } from './shared/ChromeButton';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import {
  CAMPAIGN_RAIL_START_INDEX,
  PLAY_MODE_ENTRY_ENABLED,
  PLAY_SOURCE_RAIL_ENABLED,
  enabledPlayModeNames,
  playModeRailIndex,
} from './playModeAvailability';

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

function ContinuePanel({ inventory }: { inventory: ContinueInventory }): ReactElement {
  // Retained direct Continue shows the one most recent enabled activity and nothing
  // else. It is no longer an ordinary Play entry while Run is the sole mode (ADR-0514).
  const selected = inventory.activities[0] ?? null;
  return (
    <ActionColumn>
      <div className="settings-panel-content continue-selector-panel">
        <section className="settings-section">
          <h3 className="settings-section-title">Continue</h3>
          {selected ? (
            <div className="continue-resume" data-testid="continue-detail" aria-label={selected.title}>
              <div className="ce-selected-head"><h2>{selected.title}</h2></div>
              <InnerChromeBox className="play-detail-facts">
                <dl>
                  {selected.facts.map((fact) => (
                    <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                  ))}
                </dl>
              </InnerChromeBox>
              <div className="ce-preview-actions is-single">
                <ChromeNavButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'ce-link-button')} data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE} to={selected.playHref}><span>Continue</span></ChromeNavButton>
              </div>
            </div>
          ) : (
            <div className="settings-section-rows">
              <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')} role="status" data-testid="continue-empty">
                <div className="settings-row-copy">
                  <h4>Nothing to continue</h4>
                  <p>
                    Choose {enabledPlayModeNames()} to start something.
                  </p>
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    </ActionColumn>
  );
}

/**
 * Where each Run destination sits on the one plank the list is cut from, so its installed oak
 * steps instead of restarting (`.play-choice-row` in style.css builds the offset from this).
 * The panel owns the seats rather than the DOM: Current always seats above New whatever
 * transient status row the list is carrying, and New keeps its slice when the adoption
 * conflict card speaks for Current instead — a :nth-child ladder would re-cut both. ADR-0063.
 */
const PLAY_CHOICE_ROW_SEATS = { current: 0, new: 1 } as const;

type RunChoice = 'current' | 'new' | null;

function RunPanel({
  levels,
  loading,
  officialAvailable,
  choice,
}: {
  levels: Record<string, Level>;
  loading: boolean;
  officialAvailable: boolean;
  choice: RunChoice;
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
  const [starting, setStarting] = useState(false);
  // Starting a Run replaces the shared store before the scene director can resolve and
  // prepare `/run`. Keep the already-painted Play scene on the exact state the player
  // confirmed so that store replacement cannot redraw its outgoing frame mid-fade.
  const startingPresentationRef = useRef<{
    run: typeof run;
    persistenceError: typeof persistenceError;
    adoptionConflict: typeof adoptionConflict;
    syncing: boolean;
  } | null>(null);
  const presentation = starting && startingPresentationRef.current
    ? startingPresentationRef.current
    : { run, persistenceError, adoptionConflict, syncing };
  const presentedRun = presentation.run;
  // Replacing an active Run is confirmed inline: the first Start Run click arms the
  // decision and the actions row swaps to an explicit Keep Run / Abandon and Start pair.
  const [armed, setArmed] = useState(false);
  const keepRunButtonRef = useRef<HTMLButtonElement>(null);
  const [progression, setProgression] = useState(readRunProgression);
  const [ataraxiaTier, setAtaraxiaTier] = useState<AtaraxiaTier>(0);
  const [runRules, setRunRules] = useState<RunRules>(DEFAULT_RUN_RULES);
  const eligible = useMemo(() => runEligibleOfficialWars(wars), [wars]);
  const highestUnlockedTier = highestUnlockedAtaraxiaTier(progression);
  // An adoption conflict does not gate a new Run: starting one discards both candidates, so it
  // is a third answer to "which Run does the account keep?" rather than something blocked by the
  // question. `start` abandons the current Run first, which settles the conflict before the save.
  const newRunUnavailable = loading
    || !hydrated
    || presentation.syncing
    || eligible.length === 0;

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    const sync = (): void => setProgression(readRunProgression());
    window.addEventListener(RUN_PROGRESSION_EVENT, sync);
    return () => window.removeEventListener(RUN_PROGRESSION_EVENT, sync);
  }, []);
  useEffect(() => {
    if (ataraxiaTier > highestUnlockedTier) setAtaraxiaTier(highestUnlockedTier);
  }, [ataraxiaTier, highestUnlockedTier]);
  useEffect(() => {
    if (!starting) setArmed(false);
  }, [choice, run, starting]);
  useEffect(() => {
    if (!armed) return;
    // Mirror the danger-dialog convention: focus lands on the safe choice, Escape keeps the Run.
    keepRunButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); setArmed(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed]);

  const start = async (): Promise<void> => {
    if (starting || syncing || !eligible.length) return;
    startingPresentationRef.current = { run, persistenceError, adoptionConflict, syncing };
    setStarting(true);
    let navigationAccepted = false;
    try {
      if (run) await abandon();
      const seedArray = new Uint32Array(1);
      globalThis.crypto?.getRandomValues?.(seedArray);
      const seed = seedArray[0] || (Date.now() >>> 0);
      const war = [...eligible].sort((a, b) => a.id.localeCompare(b.id))[seed % eligible.length];
      replace(createRun(snapshotWar(war, levels), seed, ataraxiaTier, { chooseKing: true, rules: runRules }));
      navigationAccepted = navigateApp('/run');
    } finally {
      // A successful scene replacement retains this component as the outgoing layer
      // until the director retires it. Clearing `starting` here would expose the newly
      // replaced store through that fading layer for its last visible frames.
      if (!navigationAccepted) {
        startingPresentationRef.current = null;
        setStarting(false);
      }
    }
  };

  return (
    <>
      <ActionColumn>
        <div className="settings-panel-content run-selector-panel">
          <section className="settings-section">
            <h3 className="settings-section-title">Run</h3>
            <div className="settings-section-rows">
              {!hydrated || loading ? (
                <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')} role="status">
                  <div className="settings-row-copy"><h4>Loading Runs…</h4></div>
                </section>
              ) : null}
              {presentation.adoptionConflict ? (
                <div className="run-adoption-conflict" role="alert" data-testid="run-adoption-conflict">
                  <div className="run-adoption-conflict-copy">
                    <h3>Two active Runs</h3>
                    <p>This browser has {presentation.adoptionConflict.browserRun.war.name}; your account has {presentation.adoptionConflict.accountRun.war.name}. Choose which one the account keeps.</p>
                  </div>
                  <div className="run-inline-actions">
                    <ChromeButton unit="inner-text-button"
                      className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
                      data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                      data-testid="run-keep-account"
                      onClick={keepAccountRun}
                    >
                      Keep account Run
                    </ChromeButton>
                    <ChromeButton unit="inner-text-button"
                      className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                      data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                      data-testid="run-adopt-browser"
                      disabled={presentation.syncing}
                      onClick={() => { void adoptBrowserRun(); }}
                    >
                      Adopt browser Run
                    </ChromeButton>
                  </div>
                </div>
              ) : null}
              {/* The row keeps its place when no Run exists — disabled like the Continue
                  rows ("Nothing to continue") and the locked Ataraxia tiers, so the
                  resume point stays learnable where it will appear (ADR-0289's
                  visible-but-disabled language). It only leaves the list while the
                  adoption conflict card speaks for the current Run instead. */}
              {!presentation.adoptionConflict && (presentedRun || (hydrated && !loading)) ? (
                <ChromeNavButton unit="inner-list-row"
                  to={PLAY_RUN_CURRENT_SELECTOR_HREF}
                  className={chromeUnitClassNames('inner-list-row', 'settings-row play-choice-row', !presentedRun && 'is-disabled', choice === 'current' && 'active is-selected')}
                  data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                  style={{ ['--play-choice-row-index' as string]: PLAY_CHOICE_ROW_SEATS.current } as CSSProperties}
                  disabled={!presentedRun}
                  aria-current={choice === 'current' ? 'page' : undefined}
                  data-testid="run-choice-current"
                >
                  <div className="settings-row-copy">
                    <h4>Current Run</h4>
                    <p>{presentedRun
                      ? `Battle ${presentedRun.battleIndex + 1} of ${presentedRun.war.battles.length} · ${ATARAXIA_BY_TIER[presentedRun.ataraxiaTier].label}`
                      : 'No active Run'}</p>
                  </div>
                </ChromeNavButton>
              ) : null}
              {!loading && officialAvailable && eligible.length === 0 ? (
                <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')} role="status">
                  <div className="settings-row-copy">
                    <h4>No Runs available</h4>
                    <p>No official Wars are currently marked Eligible for Run.</p>
                  </div>
                </section>
              ) : null}
              {!loading && !officialAvailable ? (
                <section data-chrome-unit="inner-box" className={chromeUnitClassNames('inner-box', 'settings-row')} role="status">
                  <div className="settings-row-copy">
                    <h4>Runs unavailable</h4>
                    <p>Official Wars could not be loaded. Reopen Play to retry.</p>
                  </div>
                </section>
              ) : null}
              <ChromeNavButton unit="inner-list-row"
                to={PLAY_RUN_NEW_SELECTOR_HREF}
                className={chromeUnitClassNames('inner-list-row', 'settings-row play-choice-row', newRunUnavailable && 'is-disabled', choice === 'new' && 'active is-selected')}
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                style={{ ['--play-choice-row-index' as string]: PLAY_CHOICE_ROW_SEATS.new } as CSSProperties}
                disabled={newRunUnavailable}
                aria-current={choice === 'new' ? 'page' : undefined}
                data-testid="run-choice-new"
              >
                <div className="settings-row-copy">
                  <h4>Start New Run</h4>
                  <p>Choose Ataraxia</p>
                </div>
              </ChromeNavButton>
            </div>
          </section>
          {presentation.persistenceError ? <p className="play-content-warning" role="status">{presentation.persistenceError}</p> : null}
        </div>
      </ActionColumn>

      <RunDetailContentSceneSlot
        className="play-run-detail-slot"
        sceneInstance={choice ? `play/run/${choice}` : 'play/run'}
      >
        {choice === 'current' && presentedRun ? (
          <aside className="menu-dest-col menu-dest-preview ce-preview-col play-detail-col" aria-label="Current Run" data-testid="run-detail-current">
            <div className="ce-selected-head"><h2>Current Run</h2></div>
            <div className="play-detail-body">
              <InnerChromeBox className="play-detail-facts">
                <dl>
                  <div><dt>Battle</dt><dd>{presentedRun.battleIndex + 1} of {presentedRun.war.battles.length}</dd></div>
                  <div><dt>Army</dt><dd>{presentedRun.army.length} units</dd></div>
                  <div><dt>Gold</dt><dd>{formatGold(presentedRun.goldTenths)}</dd></div>
                  <div><dt>Ataraxia</dt><dd>{ATARAXIA_BY_TIER[presentedRun.ataraxiaTier].label}</dd></div>
                  <div><dt>Deployment</dt><dd>Arrange formations</dd></div>
                </dl>
              </InnerChromeBox>
            </div>
            <div className="ce-preview-actions is-single">
              <ChromeNavButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'ce-link-button')} data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE} to="/run"><span>Play</span></ChromeNavButton>
            </div>
          </aside>
        ) : null}

        {choice === 'new' ? (
          <aside className="menu-dest-col menu-dest-preview ce-preview-col play-detail-col" aria-label="Start New Run" data-testid="run-detail-new">
            <div className="ce-selected-head"><h2>Start New Run</h2></div>
            <div className="play-detail-body">
              <AtaraxiaSelector
                value={ataraxiaTier}
                highestUnlockedTier={highestUnlockedTier}
                onChange={(tier) => { setArmed(false); setAtaraxiaTier(tier); }}
                fillSurface={CHROME_LEAF_FILL_SURFACE}
              />
              <RunRulesSelector
                value={runRules}
                onChange={(rules) => { setArmed(false); setRunRules(rules); }}
                fillSurface={CHROME_LEAF_FILL_SURFACE}
              />
            </div>
            {presentedRun ? (
              <InnerChromeBox
                className="run-replace-note"
                fillSurface={CHROME_LEAF_FILL_SURFACE}
                role="note"
                data-testid="run-replace-warning"
              >
                <h3>Replaces your current Run</h3>
                <p>Starting a new Run abandons {presentedRun.war.name} — Battle {presentedRun.battleIndex + 1} of {presentedRun.war.battles.length} · {formatGold(presentedRun.goldTenths)} gold. This cannot be undone.</p>
              </InnerChromeBox>
            ) : null}
            {presentedRun && armed ? (
              <div className="ce-preview-actions run-replace-decision">
                <ChromeButton unit="inner-text-button"
                  ref={keepRunButtonRef}
                  className={chromeUnitClassNames('inner-text-button', 'ce-link-button')}
                  data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                  data-testid="run-keep"
                  disabled={starting}
                  onClick={() => setArmed(false)}
                >
                  <span>Keep Run</span>
                </ChromeButton>
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'ce-asset-button', 'is-danger')}
                  data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                  data-testid="run-abandon-and-start"
                  disabled={starting}
                  onClick={() => { void start(); }}
                >
                  <span>{starting ? 'Starting…' : 'Abandon and Start'}</span>
                </ChromeButton>
              </div>
            ) : (
              <div className="ce-preview-actions is-single">
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'ce-link-button')}
                  data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                  data-testid="run-start"
                  disabled={newRunUnavailable || starting}
                  onClick={() => { if (presentedRun) { setArmed(true); return; } void start(); }}
                >
                  <span>{starting ? 'Starting…' : 'Start Run'}</span>
                </ChromeButton>
              </div>
            )}
          </aside>
        ) : null}
      </RunDetailContentSceneSlot>
    </>
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
        <SettingsSection title="Levels">
          {!loading && !officialAvailable ? <SettingsRow role="status" title="Official content unavailable" description="Public levels could not be loaded. Reopen Play to retry." /> : null}
          {!loading && !userWorkspaceAvailable ? <SettingsRow role="status" title="Your workspace is unavailable" description="Your standalone levels could not be loaded. Reopen Play to retry." /> : null}
          {loading ? <SettingsRow title="Loading levels…" /> : null}
          {!loading && officialAvailable && userWorkspaceAvailable && levels.length === 0 ? (
            <SettingsRow title="No standalone levels" description="Save a board in the Level Editor and it appears here.">
              <ChromeNavButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button')} to="/editor/level">Open Editor</ChromeNavButton>
            </SettingsRow>
          ) : null}
          <ActionList
            className="play-level-list"
            items={levels.map((level) => {
              const playerCount = level.layers.units.filter((unit) => unit.side === 'player').length;
              const enemyCount = level.layers.units.filter((unit) => unit.side === 'enemy').length;
              return {
                id: level.id,
                title: level.name,
                description: <p>{levelObjectiveLine(level)} · {playerCount}v{enemyCount} · {level.board.cols}x{level.board.rows}</p>,
                leading: <GatedLevelThumbnail level={level} width={72} alt="" />,
                actions: [{
                  id: 'play',
                  label: `Play ${level.name}`,
                  text: 'Play',
                  presentation: 'text' as const,
                  className: 'app-header-button',
                  tone: 'primary' as const,
                  href: playSkirmishLevelHref(level.id, PLAY_LEVELS_SELECTOR_HREF),
                }],
              };
            })}
          />
        </SettingsSection>
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
        <SettingsSection title={`${campaign.name} — Levels`}>
          {refs.length === 0 ? <SettingsRow title="No levels yet" description="This campaign has no levels. Add some in the Editor." /> : null}
          <ActionList
            className="campaign-level-list"
            items={refs.map((ref, index) => {
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
              const name = level?.name ?? `Level ${index + 1}`;
              return {
                id: ref.levelId,
                title: `${index + 1}. ${name}`,
                description: <div className="campaign-level-meta"><p className="campaign-level-goal">{goalLine}</p>{status}</div>,
                leading: level ? <GatedLevelThumbnail level={level} width={66} alt="" /> : <span className="settings-row-thumb-empty" />,
                selected: ref.levelId === selectedLevelId,
                className: `campaign-level-row ${!unlocked ? 'is-disabled' : ''}`.trim(),
                ariaLabel: `Preview ${name}`,
                onSelect: () => onSelectLevel(ref.levelId),
                actions: unlocked ? [{
                  id: 'play',
                  label: `Play ${name}`,
                  text: 'Play',
                  presentation: 'text' as const,
                  className: 'app-header-button',
                  tone: 'primary' as const,
                  href: playHref,
                }] : [{
                  id: 'locked',
                  label: `${name} is locked`,
                  text: 'Locked',
                  presentation: 'text' as const,
                  className: 'app-header-button',
                  disabled: true,
                }],
              };
            })}
          />
        </SettingsSection>
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
  const routeSelection = useMemo(
    () => playHubSelection(path),
    [path],
  );
  // The installed compatibility root paints the sole player-facing mode immediately;
  // its address canonicalizes after Run authority settles without flashing the retained
  // Continue implementation first (ADR-0514).
  const selection: PlayHubSelection = !routeSelection || routeSelection.mode === 'hub'
    ? { mode: 'run', choice: null }
    : routeSelection;
  const [progress, setProgress] = useState<CampaignProgress>(readProgress);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const resumeInventory = useMemo(
    () => continueInventory(activeRun, persistedMatch, campaigns, levels),
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
    const addressedSelection = playHubSelection(path);
    if (!addressedSelection) {
      navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
      return;
    }
    if (
      !loading
      && officialAvailable
      && userWorkspaceAvailable
      && selection.mode === 'campaign'
      && !campaigns.some((campaign) => campaign.id === selection.campaignId)
    ) {
      navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
      return;
    }
    if (
      selection.mode === 'run'
      && selection.choice === 'current'
      && runHydrated
      && !activeRun
    ) {
      navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
      return;
    }
    if (runHydrated && addressedSelection.mode === 'hub') {
      if (path !== PLAY_RUN_SELECTOR_HREF) navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
      return;
    }
    if (!loading && runHydrated && addressedSelection.mode === 'continue') {
      // Continue names exactly one activity — the most recent one — so any other Continue
      // address is stale by construction and canonicalizes onto it (ADR-0356).
      const canonicalHref = resumeInventory.defaultMode
        ? playContinueSelectorHref(resumeInventory.defaultMode)
        : PLAY_CONTINUE_SELECTOR_HREF;
      if (path !== canonicalHref) navigateApp(canonicalHref, { replace: true, scroll: false });
    }
  }, [activeRun, campaigns, loading, officialAvailable, path, resumeInventory, runHydrated, selection, userWorkspaceAvailable]);

  useEffect(() => {
    setSelectedLevelId(null);
  }, [selection]);

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
  const selectedRunChoice: RunChoice = selection.mode === 'run' ? selection.choice : null;
  const selectedContinueChoice: PlayContinueChoice | null = selection.mode === 'continue'
    ? selection.choice ?? resumeInventory.defaultMode
    : null;
  const hasRunDetail = selection.mode === 'run'
    && (selectedRunChoice === 'new' || (selectedRunChoice === 'current' && Boolean(activeRun)));
  // Continue mounts no preview column: its resume card IS the action column (ADR-0356),
  // so the surface must not narrow that column for a detail neighbour that never arrives.
  const hasDetailPreview = Boolean(selectedLevel || hasRunDetail);
  const surfaceSignature = [
    selection.mode,
    selection.mode === 'campaign' ? selection.campaignId : '',
    selectedContinueChoice ?? '',
    ...standaloneLevels.map((level) => level.id),
    ...activeRefs.map((ref) => ref.levelId),
  ].join(':');
  const loadError = !loading && (!officialAvailable || !userWorkspaceAvailable)
    ? new Error('Canonical Play content is unavailable.')
    : null;
  // Run and Continue mount no thumbnail surface, so a stale thumbnail
  // failure from a previously selected list must not condemn them.
  const surfaceError = loadError
    ?? (selection.mode === 'run' || selection.mode === 'continue' ? null : thumbnailSurface.error);
  // Compatibility landings resolve only after Run authority settles, so the first
  // painted frame is already the complete Run-preparation surface (ADR-0514).
  const primaryRunLandingSettled = routeSelection?.mode !== 'hub' || runHydrated;
  const continueLandingSettled = selection.mode !== 'continue' || runHydrated;

  return (
    <ThumbnailSurfaceReportContext.Provider value={reportThumbnailSurface}>
      <div
        className={`play-scene-authority${PLAY_SOURCE_RAIL_ENABLED ? '' : ' is-source-rail-collapsed'}${hasDetailPreview ? ' has-detail-preview' : ''}${selectedLevel ? ' has-level-preview' : ''}`}
        data-official-authority={loading ? 'loading' : officialAvailable ? 'ready' : 'error'}
        data-user-authority={loading ? 'loading' : userWorkspaceAvailable ? 'ready' : 'error'}
        data-thumbnail-authority={thumbnailSurface.error ? 'error' : thumbnailSurface.complete ? 'ready' : 'loading'}
      >
      {PLAY_SOURCE_RAIL_ENABLED ? <ApparatusRailColumn
        className="menu-dest-col menu-dest-tabs play-source-rail"
        aria-label="Play"
      >
        <div className="play-source-fixed">
          <ApparatusRailTab
            label="Continue"
            to={PLAY_CONTINUE_SELECTOR_HREF}
            iconSrc={carvedIcon('campaign-editor')}
            active={selection.mode === 'continue'}
            index={0}
            testId="play-continue"
          />
          {PLAY_MODE_ENTRY_ENABLED.run ? <PlayRailTab
            label="Run"
            href={PLAY_RUN_SELECTOR_HREF}
            icon="campaign-editor"
            active={selection.mode === 'run'}
            index={playModeRailIndex('run')}
          /> : null}
          {PLAY_MODE_ENTRY_ENABLED.levels ? <PlayRailTab
            label="Levels"
            href={PLAY_LEVELS_SELECTOR_HREF}
            icon="level-editor"
            active={selection.mode === 'levels'}
            index={playModeRailIndex('levels')}
          /> : null}
        </div>

        {PLAY_MODE_ENTRY_ENABLED.campaign ? <section className="play-campaign-region" aria-labelledby="play-campaign-heading">
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
                      index={index + CAMPAIGN_RAIL_START_INDEX}
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
                      index={officialCampaigns.length + index + CAMPAIGN_RAIL_START_INDEX}
                    />
                  ))}
                </>
              ) : null}
            </div>
          </KitScroll>
        </section> : null}
      </ApparatusRailColumn> : null}

      <PaintedSurfaceBoundary
        surface="play-selector"
        signature={surfaceSignature}
        readyToCompose={
          !loading
          && !surfaceError
          && primaryRunLandingSettled
          && continueLandingSettled
          && (selection.mode === 'run' || selection.mode === 'continue' || thumbnailSurface.complete)
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
      <PlayContentSceneSlot
        className="play-destination-content"
        sceneInstance={sceneInstanceKey}
      >
      {selection.mode === 'continue' ? (
        <ContinuePanel inventory={resumeInventory} />
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
          choice={selectedRunChoice}
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
                ? <ChromeNavButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'ce-link-button')} data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE} to={selectedPlayHref}><span>Play</span></ChromeNavButton>
                : <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'ce-link-button')} data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE} disabled><span>Locked</span></ChromeButton>}
            </div>
          }
        />
      ) : null}
      </PlayContentSceneSlot>
      </PaintedSurfaceBoundary>
      </div>
    </ThumbnailSurfaceReportContext.Provider>
  );
}
