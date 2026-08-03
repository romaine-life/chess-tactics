import { Children, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { RunBattleTransformSink } from '../game/store';
import { defaultFacingForSide, paletteForSide, pieceSpritePath } from '../core/pieces';
import type { GameState, Piece } from '../core/types';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { InnerChromeBox, ShellViewportSwap } from './shared/ChromeBox';
import { HouseSelect } from './shared/HouseSelect';
import { TitleBarStatus } from './shell/TitleBarControls';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { RunIdentityChip, RunTitleBarMeasures } from './RunTitleBarChips';
import { PLAY_RUN_SELECTOR_HREF } from './playHubRoute';
import {
  Skirmish,
  SkirmishShell,
  type RunBattlePresentation,
  type RunDeploymentPresentation,
} from './Skirmish';
import { navigateApp } from './navigation';
import { installedRunShopWrap, runShopWrapLiveMount } from './runShopWrapCandidates';
import type { RunSceneSnapshot } from './shell/sceneManifest';
import { GameplayWorkspaceSceneSlot, RunPresentationSceneSlot } from './shell/AuthoredSceneSlot';
import { useConfirm } from './shared/ConfirmDialog';
import { RunWorkspace } from './RunWorkspace';
import { workspaceBackgroundArtwork } from './workspaceBackgrounds';
import {
  ADLECTED_DISPLAY_NAME,
  ATARAXIA_BY_TIER,
  CACOCHYMIC_DISPLAY_NAME,
  GOLD_SCALE,
  RUN_RELIC_BY_ID,
  battleVictoryGoldTenths,
  buyCard,
  buyPaidRelic,
  canLeaveShop,
  cashOutPawn,
  hasRelic,
  leaveShop,
  markReservistDeployed,
  observeRunUnitDeath,
  openShop,
  prepareDeployment,
  resetShop,
  restartBattle,
  runBattleActivityId,
  sellArmyUnit,
  setDeploymentChoices,
  shopHasChanges,
  takeVacantiaRelic,
  type RunDocument,
  type RunRelicId,
} from '../run/model';
import {
  advanceAutomaticDeployment,
  advanceReadyDeployment,
  deploymentOptions,
  disciplinePlacementCells,
  gameForRunDeployment,
  levelWithRunDeployment,
  normalReservistCell,
  resolveForcedDeploymentChoices,
  selectedDeploymentLayout,
} from '../run/deployment';
import { useActiveRun } from '../run/store';
import { SkirmishViewStoreProvider } from '../game/SkirmishViewStoreContext';
import { runLinkTargetMismatch } from '../run/craft';
import { useRunCraft } from './useRunCraft';
import { RunRelicIcon, RunRelicsWorkspace } from './RunRelics';
import { RunBonaVacantia } from './RunBonaVacantia';
import { RunGoldAmount } from './RunResources';
import {
  runWorkspaceHref,
  type RunSelfInspectionView,
  type RunWorkspaceView,
} from './RunSelfInspection';
import {
  DEFAULT_RUN_ARMY_FILTERS,
  DEFAULT_RUN_SELL_FILTERS,
  RunArmyWorkspace,
  RunSellWorkspace,
  runUnitIdentifier,
  runUnitRosterLabel,
  type RunArmyFilters,
  type RunSellFilters,
} from './RunArmyWorkspace';
import { RunCard } from './RunCard';
import { Strategikon } from './Strategikon';
import { ChromeButton, ChromeNavButton } from './shared/ChromeButton';
import { PredrawnMoveHighlightPaint } from '../render/PredrawnMoveHighlightPaint';
import type { SkirmishBoardSurfaceState } from '../render/SkirmishBoard';
import { boardLabCellPosition } from '../render/boardProjection';
import { objectBaseZIndex } from '../render/sceneDepth';

type RunScreenView = RunWorkspaceView;

function visibleRunRelicCount(run: RunDocument): number {
  return run.relics.filter((relicId) => Boolean(RUN_RELIC_BY_ID[relicId])).length;
}

function runBattleProgress(run: RunDocument): {
  conflict: number;
  battle: number;
  battlesInConflict: number;
} {
  let conflictStart = 0;
  let conflict = 1;
  for (let index = 0; index < run.battleIndex; index += 1) {
    if (!run.war.battles[index]?.loot) continue;
    conflict += 1;
    conflictStart = index + 1;
  }
  let conflictEnd = run.war.battles.length - 1;
  for (let index = run.battleIndex; index < run.war.battles.length; index += 1) {
    if (!run.war.battles[index]?.loot) continue;
    conflictEnd = index;
    break;
  }
  return {
    conflict,
    battle: run.battleIndex - conflictStart + 1,
    battlesInConflict: conflictEnd - conflictStart + 1,
  };
}

function isGeneratedRunBattleName(name: string): boolean {
  return /^(?:conflict\s+(?:\d+|[ivxlcdm]+)\s*[—–-]\s*)?battle\s+\d+$/i.test(name.trim().replace(/\s+/g, ' '));
}

/** The Run phase as the trailing segment of the title bar's route line. */
function runPhaseRouteName(run: RunDocument): string {
  // 'bona-vacantia' is the only phase id that is not one capitalised word, so capitalising
  // the id would route to "Bona-vacantia".
  return run.phase === 'victory'
    ? 'Victory'
    : run.phase === 'bona-vacantia'
      ? 'Bona Vacantia'
      : `${run.phase.charAt(0).toUpperCase()}${run.phase.slice(1)}`;
}

function RunTitleBarStatus({ run }: { run: RunDocument }): ReactElement {
  const progress = runBattleProgress(run);
  const levelName = run.war.battles[run.battleIndex]?.level.name ?? 'Battle';
  return (
    <>
      {/* The phase is where you ARE in the Run, so it reads as route — Run › Shop —
          beneath the wordmark, rather than as a second line on a status chip. */}
      <TitleBarSlot region="route">{runPhaseRouteName(run)}</TitleBarSlot>
      <div className="skirmish-topbar-status run-topbar-status">
        <RunIdentityChip
          warName={run.war.name}
          levelName={isGeneratedRunBattleName(levelName) ? null : levelName}
        />
        <RunTitleBarMeasures
          tier={run.ataraxiaTier}
          goldTenths={run.goldTenths}
          conflict={progress.conflict}
          battle={progress.battle}
          battlesInConflict={progress.battlesInConflict}
        />
      </div>
    </>
  );
}

function useRunAbandon(run: RunDocument): {
  abandonDialog: ReactElement | null;
  abandoning: boolean;
  requestAbandon: () => Promise<void>;
} {
  const abandon = useActiveRun((state) => state.abandon);
  const [abandoning, setAbandoning] = useState(false);
  const { ask, dialog } = useConfirm();
  const requestAbandon = useCallback(async (): Promise<void> => {
    if (abandoning) return;
    const confirmed = await ask({
      title: 'Abandon this Run?',
      message: `${run.war.name} and all of its army, gold, lipsana, and Battle progress will be permanently removed.`,
      confirmLabel: 'Abandon Run',
      cancelLabel: 'Keep Run',
      tone: 'danger',
    });
    if (!confirmed) return;
    setAbandoning(true);
    await abandon();
    navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
  }, [abandon, abandoning, ask, run.war.name]);
  return { abandonDialog: dialog, abandoning, requestAbandon };
}

/** The installed full-screen Shop scene, or null when the Shop has no scene art. */
function useInstalledShopScene(): ReactElement | null {
  return useMemo(() => {
    const installed = installedRunShopWrap();
    return installed?.kind === 'screen'
      ? <img className="run-shop-scene-artwork" src={installed.src} alt="" draggable={false} />
      : null;
  }, []);
}

function RunMetaControls({
  run,
  view,
  onNavigate,
  showAbandon = true,
}: {
  run: RunDocument;
  view: RunScreenView;
  onNavigate: (view: RunScreenView) => void;
  showAbandon?: boolean;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const { abandonDialog, abandoning, requestAbandon } = useRunAbandon(run);
  const shop = run.phase === 'shop' ? run.shop : null;
  const canLeave = canLeaveShop(run);
  // Nothing inside the shop blocks Continue any more: the Conflict's relic is taken on
  // Bona Vacantia, before the shop is even built.
  const continueHint: string | null = null;
  const primaryLabel = run.phase === 'bona-vacantia'
    ? 'Bona Vacantia'
    : run.phase === 'deployment'
      ? 'Deployment'
      : run.phase === 'battle'
        ? 'Battle'
        : run.phase === 'victory'
          ? 'Victory'
          : 'Shop';
  return (
    <>
      {abandonDialog}
      <section className="run-meta-controls" aria-label="Run controls">
        <div className="skirmish-view-group">
          <span className="skirmish-eyebrow">{shop ? 'Shop views' : 'Run views'}</span>
          <div className="run-meta-navigation">
            <ChromeButton unit="inner-text-button"
              data-testid="run-view-primary"
              className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === 'primary' && 'active')}
              aria-pressed={view === 'primary'}
              onClick={() => onNavigate('primary')}
            >
              {primaryLabel}
            </ChromeButton>
            {shop ? (
              <ChromeButton unit="inner-text-button"
                data-testid="run-view-sell"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === 'sell' && 'active')}
                aria-pressed={view === 'sell'}
                onClick={() => onNavigate('sell')}
              >
                Sell Units
              </ChromeButton>
            ) : null}
          </div>
        </div>
        {shop ? (
          <div className="skirmish-view-group">
            <span className="skirmish-eyebrow">Shop</span>
            <div className="run-meta-navigation">
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
                disabled={!shopHasChanges(run)}
                data-testid="reset-run-shop"
                onClick={() => {
                  replace(resetShop(run));
                  onNavigate('primary');
                }}
              >
                Reset Shop
              </ChromeButton>
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                disabled={!canLeave}
                data-testid="continue-run-shop"
                title={!canLeave && continueHint ? continueHint : undefined}
                onClick={() => {
                  const deployment = prepareDeployment(leaveShop(run));
                  const level = deployment.war.battles[deployment.battleIndex]?.level;
                  replace(level ? advanceAutomaticDeployment(deployment, level) : deployment);
                  onNavigate('primary');
                }}
              >
                {shop.kind === 'opening' ? 'Continue to first Battle' : 'Continue to next Battle'}
              </ChromeButton>
            </div>
            {!canLeave && continueHint ? <p className="skirmish-grid-hint">{continueHint}</p> : null}
          </div>
        ) : null}
        {showAbandon ? (
          <div className="skirmish-view-group run-meta-abandon">
            <span className="skirmish-eyebrow">Run</span>
            <div className="skirmish-view-row">
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'danger')}
                data-testid="abandon-run"
                disabled={abandoning}
                onClick={() => { void requestAbandon(); }}
              >
                {abandoning ? 'Abandoning…' : 'Abandon Run'}
              </ChromeButton>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

function RunPhaseWorkspace({
  inspectionWorkspace,
  strategikonWorkspace = null,
  strategikonOpen = false,
  children,
}: {
  inspectionWorkspace: ReactElement | null;
  strategikonWorkspace?: ReactNode;
  strategikonOpen?: boolean;
  children: ReactElement;
}): ReactElement {
  return (
    <ShellViewportSwap
      className="run-phase-workspace"
      primaryClassName="run-phase-primary"
      primary={children}
      workspaceOpen={strategikonOpen || Boolean(inspectionWorkspace)}
      aria-label="Run workspace"
    >
      {inspectionWorkspace}
      {strategikonWorkspace}
    </ShellViewportSwap>
  );
}

function deploymentSquareLabel(cellKey: string | undefined, rows: number): string | null {
  const match = cellKey ? /^(\d+),(\d+)$/.exec(cellKey) : null;
  if (!match) return null;
  return `${String.fromCharCode(65 + Number(match[1]))}${rows - Number(match[2])}`;
}

function DeploymentControls({
  run,
  view,
  options,
  activeDisciplineUnitId,
  onNavigate,
  onSelectDisciplineUnit,
  onToggleBlocked,
  onSelectLayout,
}: {
  run: RunDocument;
  view: RunScreenView;
  options: ReturnType<typeof deploymentOptions>;
  activeDisciplineUnitId: string | null;
  onNavigate: (view: RunScreenView) => void;
  onSelectDisciplineUnit: (unitId: string) => void;
  onToggleBlocked: (unitId: string) => void;
  onSelectLayout: (layout: 0 | 1) => void;
}): ReactElement {
  const { abandonDialog, abandoning, requestAbandon } = useRunAbandon(run);
  const chosenBlocked = run.deployment?.chosenBlockedUnitIds ?? [];
  const placedDisciplineCount = options.adlectedUnitIds.filter(
    (unitId) => Boolean(run.deployment?.manualPlacements[unitId]),
  ).length;
  const disciplinePending = placedDisciplineCount < options.adlectedUnitIds.length;
  const layout = selectedDeploymentLayout(run, options);
  return (
    <>
      {abandonDialog}
      <section className="run-meta-controls run-deployment-controls" aria-label="Deployment controls">
        <div className="skirmish-score-panel run-deployment-summary" aria-label="Deployment summary">
          <div>
            <span className="skirmish-eyebrow">Deployment</span>
            <strong>{disciplinePending ? `${placedDisciplineCount} fixed` : `${Object.keys(layout.placements).length} ready`}</strong>
          </div>
          <div>
            <span className="skirmish-eyebrow">Reserve</span>
            <strong>{layout.blockedUnitIds.length}</strong>
          </div>
        </div>

        {options.hasBlockedChoice ? (
          <div className="skirmish-view-group run-deployment-control">
            <span className="skirmish-eyebrow">Muster Roll</span>
            <p>Choose {options.blockedChoiceCount} unit{options.blockedChoiceCount === 1 ? '' : 's'} to hold in reserve.</p>
            <div className="run-choice-list">
              {run.army.filter((unit) => unit.type !== 'king').map((unit) => {
                const selected = chosenBlocked.includes(unit.id);
                return (
                  <ChromeButton unit="inner-list-row"
                    className={chromeUnitClassNames('inner-list-row', 'run-choice-option', selected && 'active')}
                    aria-pressed={selected}
                    disabled={!selected && chosenBlocked.length >= options.blockedChoiceCount}
                    onClick={() => onToggleBlocked(unit.id)}
                    key={unit.id}
                  >
                    <span>{runUnitRosterLabel(unit)}</span>
                    <small>{selected ? 'In reserve' : 'Deploying'}</small>
                  </ChromeButton>
                );
              })}
            </div>
          </div>
        ) : options.overflowCount > 0 ? (
          <p className="skirmish-grid-hint">{options.overflowCount} excess unit{options.overflowCount === 1 ? '' : 's'} will remain in reserve.</p>
        ) : null}

        {options.adlectedUnitIds.length > 0 ? (
          <div className="skirmish-view-group run-deployment-control">
            <span className="skirmish-eyebrow">{ADLECTED_DISPLAY_NAME} · {placedDisciplineCount}/{options.adlectedUnitIds.length}</span>
            <p>Select an {ADLECTED_DISPLAY_NAME} unit, then choose one of its highlighted battlefield squares.</p>
            <div className="run-choice-list">
              {options.adlectedUnitIds.map((unitId) => {
                const unit = run.army.find((candidate) => candidate.id === unitId);
                const square = deploymentSquareLabel(run.deployment?.manualPlacements[unitId], run.war.battles[run.battleIndex].level.board.rows);
                return (
                  <ChromeButton unit="inner-list-row"
                    className={chromeUnitClassNames('inner-list-row', 'run-choice-option', activeDisciplineUnitId === unitId && 'active')}
                    aria-pressed={activeDisciplineUnitId === unitId}
                    onClick={() => onSelectDisciplineUnit(unitId)}
                    key={unitId}
                  >
                    <span>{unit ? runUnitRosterLabel(unit) : unitId}</span>
                    <small>{square ? `Placed · ${square}` : 'Choose on battlefield'}</small>
                  </ChromeButton>
                );
              })}
            </div>
          </div>
        ) : null}

        {hasRelic(run, 'surveyors-compass') ? (
          <div className="skirmish-view-group run-deployment-control">
            <span className="skirmish-eyebrow">Surveyor&apos;s Compass</span>
            <p>Preview and choose the remaining formation.</p>
            <div className="run-inline-actions">
              {[0, 1].map((index) => (
                <ChromeButton unit="inner-text-button"
                  key={index}
                  className={chromeUnitClassNames('inner-text-button', 'app-header-button', run.deployment?.layoutChoice === index && 'active')}
                  aria-pressed={run.deployment?.layoutChoice === index}
                  onClick={() => onSelectLayout(index as 0 | 1)}
                >
                  Formation {index + 1}
                </ChromeButton>
              ))}
            </div>
          </div>
        ) : null}

        <div className="skirmish-view-group">
          <span className="skirmish-eyebrow">Run view</span>
          <ChromeButton unit="inner-text-button"
            data-testid="run-view-primary"
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === 'primary' && 'active')}
            aria-pressed={view === 'primary'}
            onClick={() => onNavigate('primary')}
          >
            Deployment
          </ChromeButton>
        </div>
        <div className="skirmish-view-group run-meta-abandon">
          <span className="skirmish-eyebrow">Run</span>
          <ChromeButton unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'danger')}
            data-testid="abandon-run"
            disabled={abandoning}
            onClick={() => { void requestAbandon(); }}
          >
            {abandoning ? 'Abandoning…' : 'Abandon Run'}
          </ChromeButton>
        </div>
      </section>
    </>
  );
}

function useRunDeploymentPresentation({
  run,
  view,
  onNavigate,
}: {
  run: RunDocument;
  view: RunScreenView;
  onNavigate: (view: RunScreenView) => void;
}): RunDeploymentPresentation | null {
  const replace = useActiveRun((state) => state.replace);
  const level = run.war.battles[run.battleIndex].level;
  const prepared = useMemo(
    () => resolveForcedDeploymentChoices(run.deployment ? run : prepareDeployment(run), level),
    [level, run],
  );
  const options = useMemo(() => deploymentOptions(prepared, level), [level, prepared]);
  const layout = selectedDeploymentLayout(prepared, options);
  const [selectedDisciplineUnitId, setSelectedDisciplineUnitId] = useState<string | null>(null);
  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null);
  const firstUnplacedDisciplineUnitId = options.adlectedUnitIds.find(
    (unitId) => !prepared.deployment?.manualPlacements[unitId],
  ) ?? null;
  const activeDisciplineUnitId = selectedDisciplineUnitId && options.adlectedUnitIds.includes(selectedDisciplineUnitId)
    ? selectedDisciplineUnitId
    : firstUnplacedDisciplineUnitId ?? options.adlectedUnitIds[0] ?? null;
  const activeDisciplineUnit = prepared.army.find((unit) => unit.id === activeDisciplineUnitId) ?? null;
  const legalCells = useMemo(
    () => activeDisciplineUnitId ? disciplinePlacementCells(prepared, options, activeDisciplineUnitId) : [],
    [activeDisciplineUnitId, options, prepared],
  );
  const legalCellKeys = useMemo(() => new Set(legalCells.map((cell) => `${cell.x},${cell.y}`)), [legalCells]);
  const activeCellKey = activeDisciplineUnitId
    ? prepared.deployment?.manualPlacements[activeDisciplineUnitId] ?? null
    : null;
  const hoveredPlacementCell = hoveredCellKey && hoveredCellKey !== activeCellKey
    ? legalCells.find((cell) => `${cell.x},${cell.y}` === hoveredCellKey) ?? null
    : null;
  const hoveredPlacementSeat = hoveredPlacementCell
    ? boardLabCellPosition(hoveredPlacementCell)
    : null;
  const deploymentGame = useMemo(
    () => gameForRunDeployment(prepared, level, layout),
    [layout, level, prepared],
  );
  const deploymentSeed = prepared.deployment?.seed ?? prepared.seed;
  const deploymentSurfaceState = useMemo<SkirmishBoardSurfaceState>(() => ({
    game: deploymentGame,
    seed: deploymentSeed,
    viewKey: runBattleActivityId(prepared.id, prepared.battleIndex),
  }), [deploymentGame, deploymentSeed, prepared.battleIndex, prepared.id]);
  const pendingPlacementArrivalUnitIdRef = useRef<string | null>(null);
  const pendingPlacementArrivalObservedRef = useRef(false);

  const advanceIfReady = useCallback(() => {
    const latest = useActiveRun.getState().run;
    if (!latest || latest.id !== run.id || latest.phase !== 'deployment') return;
    const latestLevel = latest.war.battles[latest.battleIndex]?.level;
    if (!latestLevel) return;
    const staged = latest.deployment ? latest : prepareDeployment(latest);
    const advanced = advanceReadyDeployment(staged, latestLevel);
    if (advanced !== latest) replace(advanced);
  }, [replace, run.id]);

  useEffect(() => {
    // Non-placement choices still commit as soon as they are ready. A placement click owns a
    // compositor-reported arrival cycle, so its pending id keeps this generic path from folding
    // the final manual drop into the automatic Battle wave.
    if (!pendingPlacementArrivalUnitIdRef.current) advanceIfReady();
  }, [advanceIfReady, run]);

  const handleArrivingUnitIdsChange = useCallback((unitIds: readonly string[]) => {
    const pendingUnitId = pendingPlacementArrivalUnitIdRef.current;
    if (!pendingUnitId) return;
    if (unitIds.includes(pendingUnitId)) {
      pendingPlacementArrivalObservedRef.current = true;
      return;
    }
    if (!pendingPlacementArrivalObservedRef.current || unitIds.length > 0) return;
    pendingPlacementArrivalUnitIdRef.current = null;
    pendingPlacementArrivalObservedRef.current = false;
    advanceIfReady();
  }, [advanceIfReady]);

  useEffect(() => {
    setHoveredCellKey(null);
  }, [activeDisciplineUnitId]);

  const toggleBlocked = (unitId: string): void => {
    const chosenBlocked = prepared.deployment?.chosenBlockedUnitIds ?? [];
    const next = chosenBlocked.includes(unitId)
      ? chosenBlocked.filter((id) => id !== unitId)
      : chosenBlocked.length < options.blockedChoiceCount ? [...chosenBlocked, unitId] : chosenBlocked;
    replace(setDeploymentChoices(prepared, { chosenBlockedUnitIds: next }));
  };

  const placeDisciplineUnit = (cellKey: string): void => {
    if (!activeDisciplineUnitId || !legalCellKeys.has(cellKey)) return;
    const manualPlacements = { ...(prepared.deployment?.manualPlacements ?? {}) };
    manualPlacements[activeDisciplineUnitId] = cellKey;
    // Persist and paint the exact placement while Deployment still owns the board. Promotion
    // waits for this unit's compositor-owned arrival to settle, then introduces the automatic
    // formation as its own subsequent wave on the same mounted battlefield.
    pendingPlacementArrivalUnitIdRef.current = activeDisciplineUnitId;
    pendingPlacementArrivalObservedRef.current = false;
    replace(setDeploymentChoices(prepared, { manualPlacements }));
    const nextUnplaced = options.adlectedUnitIds.find(
      (unitId) => unitId !== activeDisciplineUnitId && !manualPlacements[unitId],
    );
    if (nextUnplaced) setSelectedDisciplineUnitId(nextUnplaced);
  };

  if (run.phase !== 'deployment') return null;
  return {
    surfaceState: deploymentSurfaceState,
    titleBarContent: <RunTitleBarStatus run={prepared} />,
    relicIds: prepared.relics,
    screenClassName: `run-screen run-deployment-screen${visibleRunRelicCount(prepared) ? ' has-relics' : ''}`,
    boardClassName: 'run-deployment-board',
    boardAriaLabel: `${level.name} deployment battlefield`,
    onArrivingUnitIdsChange: handleArrivingUnitIdsChange,
    controlsContent: (
      <DeploymentControls
        run={prepared}
        view={view}
        options={options}
        activeDisciplineUnitId={activeDisciplineUnitId}
        onNavigate={onNavigate}
        onSelectDisciplineUnit={setSelectedDisciplineUnitId}
        onToggleBlocked={toggleBlocked}
        onSelectLayout={(layoutChoice) => replace(setDeploymentChoices(prepared, { layoutChoice }))}
      />
    ),
    renderCellOverlay: ({ cell, visualFootprintStyle }) => {
      const cellKey = `${cell.x},${cell.y}`;
      if (!activeDisciplineUnit) return null;
      const isLegalPlacement = legalCellKeys.has(cellKey);
      const squareLabel = deploymentSquareLabel(cellKey, level.board.rows);
      return (
        <button
          type="button"
          className={`skirmish-board-cell-hit run-deployment-cell ${isLegalPlacement ? 'is-move' : 'is-deployment-blocked'}${!isLegalPlacement && hoveredCellKey === cellKey ? ' is-threat' : ''}${activeCellKey === cellKey ? ' is-selected' : ''}`}
          aria-label={isLegalPlacement
            ? `Place ${runUnitRosterLabel(activeDisciplineUnit)} on ${squareLabel}`
            : `${squareLabel} is unavailable for ${runUnitRosterLabel(activeDisciplineUnit)}`}
          aria-pressed={isLegalPlacement ? activeCellKey === cellKey : undefined}
          aria-disabled={!isLegalPlacement}
          data-cx={cell.x}
          data-cy={cell.y}
          data-testid={`${isLegalPlacement ? 'deployment-cell' : 'deployment-blocked-cell'}-${cell.x}-${cell.y}`}
          style={visualFootprintStyle}
          onPointerDown={(event) => { if (event.button === 0) event.stopPropagation(); }}
          onPointerEnter={() => setHoveredCellKey(cellKey)}
          onPointerLeave={() => setHoveredCellKey((current) => current === cellKey ? null : current)}
          onFocus={() => setHoveredCellKey(cellKey)}
          onBlur={() => setHoveredCellKey((current) => current === cellKey ? null : current)}
          onClick={isLegalPlacement ? () => placeDisciplineUnit(cellKey) : undefined}
        >
          <PredrawnMoveHighlightPaint />
        </button>
      );
    },
    boardOverlay: activeDisciplineUnit && hoveredPlacementCell && hoveredPlacementSeat ? (
      <span
        className={`board-unit-seat is-${activeDisciplineUnit.type} run-deployment-placement-ghost`}
        style={{
          left: hoveredPlacementSeat.left,
          top: hoveredPlacementSeat.top,
          zIndex: objectBaseZIndex(hoveredPlacementCell),
        }}
        data-testid="deployment-placement-ghost"
        aria-hidden="true"
      >
        <img
          src={pieceSpritePath(activeDisciplineUnit.type, paletteForSide('player'), defaultFacingForSide('player'))}
          alt=""
          draggable={false}
        />
      </span>
    ) : null,
  };
}

function relicTargetRequired(relic: RunRelicId | null): boolean {
  return relic === 'conscription-notice';
}

function RelicOffer({
  run,
  relicId,
  action,
  actionLabel,
  disabled = false,
}: {
  run: RunDocument;
  relicId: RunRelicId;
  action: (targetUnitId?: string) => void;
  actionLabel: ReactNode;
  disabled?: boolean;
}): ReactElement {
  const relic = RUN_RELIC_BY_ID[relicId];
  const [target, setTarget] = useState('');
  const needsTarget = relicTargetRequired(relicId);
  return (
    <InnerChromeBox className="run-card run-relic-card">
      <header className="run-relic-card-heading">
        <RunRelicIcon relicId={relicId} />
        <h3>{relic.name}</h3>
      </header>
      <p>{relic.description}</p>
      {needsTarget ? (
        <HouseSelect
          value={target}
          options={[
            { value: '', label: 'Choose a unit…' },
            ...run.army.map((unit) => ({ value: unit.id, label: runUnitRosterLabel(unit) })),
          ]}
          onChange={setTarget}
          ariaLabel="Discipline target"
        />
      ) : null}
      <ChromeButton unit="inner-text-button"
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
        disabled={disabled || (needsTarget && !target)}
        onClick={() => action(target || undefined)}
      >
        {actionLabel}
      </ChromeButton>
    </InnerChromeBox>
  );
}

/**
 * The shop's card row. When the owner has installed a wrap, the same row is
 * mounted inside its painted stall; otherwise it is the plain grid. The wrap is
 * decoration around the real cards — it never changes what is purchasable.
 */
function ShopCardRow({ children }: { children: ReactNode }): ReactElement {
  const wrap = useMemo(() => installedRunShopWrap(), []);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cardCount = Children.count(children);
  // Only a band wrap measures anything: it is a frame around the row, so the
  // row has to fit inside it. A screen scene is a background and never
  // participates — the cards lay out normally and the art sits behind them.
  useEffect(() => {
    const host = hostRef.current;
    if (wrap?.kind !== 'band' || !host || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setBox({
        width: Math.max(0, Math.floor(entry.contentRect.width)),
        height: Math.max(0, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [wrap]);

  if (!wrap || wrap.kind !== 'band' || cardCount < 1) {
    return <div className="run-card-grid">{children}</div>;
  }
  const mount = box.width > 0 && box.height > 0
    ? runShopWrapLiveMount(wrap, cardCount, box.width, box.height)
    : null;
  return (
    <div className="run-shop-wrap-host" ref={hostRef} data-testid="run-shop-wrap">
      {mount ? (
        <div
          className="run-shop-wrap-frame"
          style={{
            insetInlineStart: `${mount.frame.left}px`,
            insetBlockStart: `${mount.frame.top}px`,
            inlineSize: `${mount.frame.width}px`,
            blockSize: `${mount.frame.height}px`,
          }}
        >
          <img className="run-shop-wrap-art" src={wrap.src} alt="" draggable={false} />
          <div
            className="run-shop-wrap-cards"
            style={{
              insetInlineStart: `${mount.cards.left}px`,
              insetBlockStart: `${mount.cards.top}px`,
              inlineSize: `${mount.cards.width}px`,
              gridTemplateColumns: `repeat(${cardCount}, ${mount.cardWidth}px)`,
              gap: `${mount.cards.gap}px`,
            }}
          >
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ShopPanel({
  run,
  view,
  sellWorkspace,
}: {
  run: RunDocument;
  view: RunScreenView;
  sellWorkspace: ReactElement;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const shop = run.shop!;
  const opening = shop.kind === 'opening';
  const victoryGoldTenths = Number.isSafeInteger(shop.victoryGoldTenths) && shop.victoryGoldTenths >= 0
    ? shop.victoryGoldTenths
    : battleVictoryGoldTenths(run.war.battles[shop.afterBattleIndex].level);
  const pestiferousLosses = run.pestiferousLosses.filter((loss) => loss.battleIndex === shop.afterBattleIndex);
  // Painted on the workspace element so it reaches the shell padding; an inner
  // layer stops at the scroller and leaves the old backdrop showing.
  const shopScene = useInstalledShopScene();
  return (
    <>
      {view === 'sell' ? sellWorkspace : (
        // The title bar already says Run › Shop, so a heading painted into the
        // scene's corner only repeats it. The name stays for assistive tech.
        <RunWorkspace
          className={`run-shop-workspace${shopScene ? ' has-scene' : ''}`}
          contentClassName="run-shop-workspace-content"
          data-testid="run-shop-workspace"
          aria-label="Shop"
          backgroundArtwork={shopScene}
        >
        {opening ? null : (
          <div className="run-shop-rules">
            <span>Victory</span>
            <span aria-hidden="true">+</span>
            <RunGoldAmount valueTenths={victoryGoldTenths} />
          </div>
        )}
        {pestiferousLosses.length ? (
          <InnerChromeBox className="run-pestiferous-losses" role="status">
            <h3>Pestiferous attrition</h3>
            <p>These {CACOCHYMIC_DISPLAY_NAME} units were lost after the Battle:</p>
            <ul>
              {pestiferousLosses.map((loss) => (
                <li key={`${loss.cardId}:${loss.unit.id}`}>
                  {loss.unit.name} · {loss.unit.type}
                  {(() => {
                    const card = run.cards.find((candidate) => candidate.id === loss.cardId);
                    const next = run.army.find((unit) => unit.id === card?.cacochymicUnitId);
                    return next ? ` — ${next.name} · ${next.type} is now ${CACOCHYMIC_DISPLAY_NAME}` : '';
                  })()}
                </li>
              ))}
            </ul>
          </InnerChromeBox>
        ) : null}
        <section className="run-shop-cards-section" aria-label="Cards">
          <ShopCardRow>
            {shop.cardOffers.map((offer) => {
              const purchased = shop.purchasedCardOfferIds.includes(offer.offerId);
              return (
                <RunCard
                  card={offer}
                  mode="shop"
                  purchased={purchased}
                  key={offer.offerId}
                  disabled={purchased || run.goldTenths < offer.cost * GOLD_SCALE}
                  onSelect={() => replace(buyCard(run, offer.offerId))}
                />
              );
            })}
          </ShopCardRow>
        </section>


        {shop.paidRelicOffer ? (
          <section>
            <h3>Merchant&apos;s Shopkey</h3>
            <RelicOffer
              run={run}
              relicId={shop.paidRelicOffer}
              actionLabel={shop.paidRelicBought ? 'Sold out this Conflict' : (
                <span className="run-paid-relic-price">
                  <span>Buy</span>
                  <RunGoldAmount valueTenths={10 * GOLD_SCALE} className="run-gold-amount--button" />
                </span>
              )}
              disabled={shop.paidRelicBought || run.goldTenths < 10 * GOLD_SCALE}
              action={(target) => replace(buyPaidRelic(run, target))}
            />
          </section>
        ) : null}

        </RunWorkspace>
      )}
    </>
  );
}

function VictoryPanel({ run }: { run: RunDocument }): ReactElement {
  const abandon = useActiveRun((state) => state.abandon);
  return (
    <RunWorkspace
      className="run-victory-workspace"
      contentClassName="run-victory-workspace-content"
      data-testid="run-victory-workspace"
      aria-labelledby="run-victory-workspace-title"
      backgroundArtwork={workspaceBackgroundArtwork('run-victory')}
    >
      <h2 id="run-victory-workspace-title">War won</h2>
      <h2>{run.war.name}</h2>
      <p>{ATARAXIA_BY_TIER[run.ataraxiaTier].label} — {ATARAXIA_BY_TIER[run.ataraxiaTier].title}</p>
      <p>{run.war.description}</p>
      <p className="run-victory-summary">
        <span>{run.army.length} persistent units</span>
        <span>{visibleRunRelicCount(run)} lipsana</span>
        <RunGoldAmount valueTenths={run.goldTenths} />
      </p>
      <ChromeButton unit="inner-text-button"
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
        onClick={() => {
          void abandon().then(() => {
            navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
          });
        }}
      >
        Finish Run
      </ChromeButton>
    </RunWorkspace>
  );
}

function RunBattlefieldPanel({
  run,
  routePath,
  routeSearch,
  view,
  onNavigate,
  inspectionWorkspace,
}: {
  run: RunDocument;
  view: RunScreenView;
  onNavigate: (view: RunScreenView) => void;
  inspectionWorkspace: ReactElement | null;
  routePath: string;
  routeSearch: string;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const currentRun = useActiveRun((state) => state.run);
  const { abandonDialog, requestAbandon } = useRunAbandon(run);
  const deploymentPresentation = useRunDeploymentPresentation({ run, view, onNavigate });
  const baseLevel = run.war.battles[run.battleIndex].level;
  // Battle-runtime writes (including Restart) do not change deployment. Keep the
  // projected board document referentially stable across those persistence updates,
  // so Skirmish does not re-run its board-entry effect for an unchanged battle.
  const options = useMemo(
    () => deploymentOptions(run, baseLevel),
    [baseLevel, run.army, run.deployment, run.relics, run.seed],
  );
  const layout = useMemo(
    () => selectedDeploymentLayout(run, options),
    [options, run.deployment, run.relics],
  );
  const battleLevel = useMemo(
    () => levelWithRunDeployment(run, baseLevel, layout),
    [baseLevel, layout, run.army, run.relics],
  );
  const runId = run.id;
  const battleSeed = run.deployment?.seed ?? run.seed;
  const relicIds = run.relics;
  const canCashOutPawn = hasRelic(run, 'mercenary-boat');

  const transformCommittedBoard = useCallback<RunBattleTransformSink>((game, _events) => {
      let active = useActiveRun.getState().run;
      if (!active || active.phase !== 'battle' || active.id !== run.id || !active.battleRuntime) return game;
      const observedDeadUnitIds = active.battleRuntime.observedDeadUnitIds;
      let transformed: GameState = game;
      let changed = false;
      for (const unit of active.army) {
        const piece = transformed.pieces.find((candidate) => candidate.id === unit.id);
        if (!piece || piece.alive || observedDeadUnitIds.includes(unit.id)) continue;
        const observed = observeRunUnitDeath(active, unit.id);
        active = observed.run;
        changed = active !== useActiveRun.getState().run || changed;
        if (!observed.reservistUnitId) continue;
        const reservist = active.army.find((candidate) => candidate.id === observed.reservistUnitId);
        if (!reservist) continue;
        const occupied = new Set(transformed.pieces.filter((candidate) => candidate.alive).map((candidate) => `${candidate.x},${candidate.y}`));
        const cell = normalReservistCell(
          active,
          baseLevel,
          occupied,
          active.battleRuntime?.reinforcementSequence ?? 0,
          reservist.type,
        );
        if (!cell) continue;
        const facing = defaultFacingForSide('player');
        const spawned: Piece = {
          id: reservist.id,
          name: reservist.name,
          type: reservist.type,
          side: 'player',
          ...cell,
          alive: true,
          facing,
          startX: cell.x,
          startY: cell.y,
          ...(reservist.type === 'pawn' ? { pawnForward: facing } : {}),
        };
        transformed = { ...transformed, pieces: [...transformed.pieces, spawned] };
        active = markReservistDeployed(active, reservist.id);
        changed = true;
      }
      if (changed) useActiveRun.getState().replace(active);
      return transformed;
  }, [baseLevel, run.id]);

  const presentation = useMemo<RunBattlePresentation>(() => ({
    level: battleLevel,
    seed: battleSeed,
    activityId: runBattleActivityId(runId, run.battleIndex),
    relicIds,
    transformCommittedBoard,
    onVictory: (survivors) => {
      const latest = useActiveRun.getState().run;
      if (latest?.id === runId) replace(openShop(latest, survivors));
    },
    onRestart: () => {
      const latest = useActiveRun.getState().run;
      if (latest?.id === runId) replace(restartBattle(latest));
    },
    onAbandonRun: () => { void requestAbandon(); },
    onPawnCashOut: canCashOutPawn
      ? (unitId) => {
          const latest = useActiveRun.getState().run;
          if (latest?.id === runId) replace(cashOutPawn(latest, unitId));
        }
      : undefined,
  }), [battleLevel, battleSeed, canCashOutPawn, relicIds, replace, requestAbandon, run.battleIndex, runId, transformCommittedBoard]);

  // Subscribe to the current document so a Paid Crossing cash-out or Reservist event
  // refreshes the hook inputs without restarting the already-live matching board.
  void currentRun;
  return (
    <>
      {run.phase === 'battle' ? abandonDialog : null}
      <Skirmish
        runBattle={presentation}
        runDeployment={deploymentPresentation}
        routePath={routePath}
        routeSearch={routeSearch}
        runWorkspace={inspectionWorkspace}
      />
    </>
  );
}

export function RunScreen({
  sceneSnapshot,
  routePath = window.location.pathname,
  routeSearch = window.location.search,
}: {
  sceneSnapshot: RunSceneSnapshot;
  routePath?: string;
  routeSearch?: string;
}): ReactElement {
  const run = sceneSnapshot.run;
  const hydrated = sceneSnapshot.hydrated;
  const replace = useActiveRun((state) => state.replace);
  // A craft address sets the account's Run to the state it names before the screen reads one,
  // every time it is opened, then lands here without its craft parameters (ADR-0354).
  const craft = useRunCraft(routePath, routeSearch);
  const viewScope = run
    ? `${run.id}:${run.phase}:${run.phase === 'shop' ? run.shop?.afterBattleIndex ?? run.battleIndex : run.battleIndex}`
    : 'no-run';
  const filterScope = run?.phase === 'shop'
    ? `${run.id}:shop:${run.shop?.afterBattleIndex ?? run.battleIndex}`
    : run
      ? `${run.id}:outside-shop`
      : 'no-run';
  const [selectedState, setSelectedState] = useState<{ scope: string; unitId: string | null }>({
    scope: 'no-run',
    unitId: null,
  });
  const [armyFilterState, setArmyFilterState] = useState<{ scope: string; filters: RunArmyFilters }>({
    scope: 'no-run',
    filters: { ...DEFAULT_RUN_ARMY_FILTERS },
  });
  const [sellFilterState, setSellFilterState] = useState<{ scope: string; filters: RunSellFilters }>({
    scope: 'no-run',
    filters: { ...DEFAULT_RUN_SELL_FILTERS },
  });
  // The Strategikon is the Run's reference workspace in EVERY phase, not just Battle —
  // deployment, shop, and victory all open it from the same Controls title mark. Only an
  // absent Run has nothing to reference, so that is the sole address the screen repairs.
  useEffect(() => {
    if (hydrated && routePath.startsWith('/run/strategikon/') && !run) {
      navigateApp(`/run${routeSearch}`, { replace: true, scroll: false });
    }
  }, [hydrated, routePath, routeSearch, run]);

  // The pre-hydration document may exist from browser storage, but the screen treats
  // the Run as absent until hydrate() has arbitrated browser and account copies.
  const shellRun = hydrated ? run : null;
  const rawView: RunScreenView = sceneSnapshot.workspace === 'strategikon'
    ? 'primary'
    : sceneSnapshot.workspace;
  const view = shellRun?.phase !== 'shop' && rawView === 'sell' ? 'primary' : rawView;
  const strategikonOpen = sceneSnapshot.workspace === 'strategikon';
  const strategikonHref = strategikonOpen
    ? `/run${routeSearch}`
    : `/run/strategikon/enchiridion/units${routeSearch}`;
  const selectedUnitId = selectedState.scope === viewScope ? selectedState.unitId : null;
  const armyFilters = armyFilterState.scope === filterScope
    ? armyFilterState.filters
    : { ...DEFAULT_RUN_ARMY_FILTERS };
  const sellFilters = sellFilterState.scope === filterScope
    ? sellFilterState.filters
    : { ...DEFAULT_RUN_SELL_FILTERS };
  // Army, Relics, and Sell are workspaces of the Run screen itself, so they always
  // address the Run root. Dropping any open Strategikon address keeps these Controls
  // live instead of navigating to a path the reference workspace still covers.
  const navigateRunView = (nextView: RunScreenView): void => {
    const current = new URL(window.location.href);
    current.pathname = '/run';
    const nextHref = runWorkspaceHref(current.toString(), nextView);
    navigateApp(nextHref, { replace: true, scroll: false });
    if (nextView !== 'army') setSelectedState({ scope: viewScope, unitId: null });
  };
  const sellUnit = (unitId: string): void => {
    if (!shellRun) return;
    const latest = useActiveRun.getState().run;
    if (!latest || latest.id !== shellRun.id) return;
    const sold = sellArmyUnit(latest, unitId);
    if (sold !== latest) replace(sold);
    setSelectedState({ scope: viewScope, unitId: null });
  };
  const armyWorkspace = shellRun ? (
    <RunArmyWorkspace
      run={shellRun}
      filters={armyFilters}
      selectedUnitId={selectedUnitId}
      onFiltersChange={(filters) => setArmyFilterState({ scope: filterScope, filters })}
      onSelectUnit={(unitId) => setSelectedState({ scope: viewScope, unitId })}
      onBack={() => setSelectedState({ scope: viewScope, unitId: null })}
      onSell={sellUnit}
    />
  ) : null;
  const relicsWorkspace = shellRun ? <RunRelicsWorkspace relicIds={shellRun.relics} /> : null;
  const inspectionWorkspace = view === 'army'
    ? armyWorkspace
    : view === 'relics'
      ? relicsWorkspace
      : null;
  const shopScene = useInstalledShopScene();
  const sellWorkspace = shellRun ? (
    <RunSellWorkspace
      run={shellRun}
      filters={sellFilters}
      onFiltersChange={(filters) => setSellFilterState({ scope: filterScope, filters })}
      onSell={sellUnit}
      backgroundArtwork={shopScene}
    />
  ) : null;
  // A craft request speaks for the whole screen while it runs: the Run it is about to replace must
  // not flash its own phase first, and a refused spec has to say why instead of silently doing
  // nothing.
  // A link made for a specific Run says so. Rendering someone else's Run — or this browser's
  // signed-out copy — under that link is the failure worth catching: it looks like it worked.
  const linkMismatch = hydrated && runLinkTargetMismatch(routeSearch, run?.id ?? null);
  const craftWorkspace = craft.crafting
    ? (
      <RunWorkspace
        className="run-loading-workspace"
        contentClassName="run-status-workspace-content"
        data-testid="run-craft-workspace"
        role="status"
      >
        <p>Crafting Run…</p>
      </RunWorkspace>
    )
    : craft.error
      ? (
        <RunWorkspace
          className="run-empty-workspace"
          contentClassName="run-status-workspace-content"
          data-testid="run-craft-error-workspace"
          role="alert"
          aria-labelledby="run-craft-error-title"
        >
          <h2 id="run-craft-error-title">This Run could not be crafted</h2>
          <p>{craft.error}</p>
        </RunWorkspace>
      )
      : linkMismatch
        ? (
          <RunWorkspace
            className="run-empty-workspace"
            contentClassName="run-status-workspace-content"
            data-testid="run-link-mismatch-workspace"
            role="status"
            aria-labelledby="run-link-mismatch-title"
          >
            <h2 id="run-link-mismatch-title">This link is for a different Run</h2>
            <p>
              {run
                ? 'It was made for a Run this account is not on any more. The Run below is the one you have now.'
                : 'Sign in to the account it was made for, or open the Run this browser has.'}
            </p>
            <ChromeNavButton unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
              to="/run"
            >
              Open my Run
            </ChromeNavButton>
          </RunWorkspace>
        )
        : null;
  if (!craftWorkspace && (shellRun?.phase === 'deployment' || shellRun?.phase === 'battle')) {
    return (
      <RunPresentationSceneSlot
        className="run-scene-slot"
        sceneInstance={`${shellRun.id}:battlefield:${shellRun.battleIndex}:${sceneSnapshot.workspace}`}
      >
        <RunBattlefieldPanel
          run={shellRun}
          routePath={routePath}
          routeSearch={routeSearch}
          view={view}
          onNavigate={navigateRunView}
          inspectionWorkspace={inspectionWorkspace}
        />
      </RunPresentationSceneSlot>
    );
  }
  const workspace = craftWorkspace ?? (!hydrated
    ? (
      <RunWorkspace
        className="run-loading-workspace"
        contentClassName="run-status-workspace-content"
        data-testid="run-loading-workspace"
        role="status"
      >
        <p>Loading Run…</p>
      </RunWorkspace>
    )
    : !shellRun
      ? (
        <RunWorkspace
          className="run-empty-workspace"
          contentClassName="run-status-workspace-content"
          data-testid="run-empty-workspace"
          aria-labelledby="run-empty-workspace-title"
        >
          <h2 id="run-empty-workspace-title">No active Run</h2>
          <p>Start a Run from Play, or direct-play one of your Wars from the War Editor.</p>
          <ChromeNavButton unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
            to={PLAY_RUN_SELECTOR_HREF}
          >
            Back to Run
          </ChromeNavButton>
        </RunWorkspace>
      )
      : shellRun.phase === 'shop' && shellRun.shop
            ? <ShopPanel run={shellRun} view={view} sellWorkspace={sellWorkspace!} />
            // Explicit, because the branch below is an else-fallthrough: any phase without
            // its own case silently renders Victory.
            : shellRun.phase === 'bona-vacantia' && shellRun.vacantia
              ? <RunBonaVacantia run={shellRun} replace={replace} />
              : <VictoryPanel run={shellRun} />);
  return (
    <RunPresentationSceneSlot
      className="run-scene-slot"
      sceneInstance={`${shellRun?.id ?? 'none'}:${sceneSnapshot.phase}:${sceneSnapshot.workspace}`}
    >
      {/* Shop/victory use the shared HUD without mounting a battlefield. Their replaceable
          presentation scene still owns its HUD view state explicitly; it must not borrow an
          outgoing or incoming battlefield's camera/overlay store during director overlap. */}
      <SkirmishViewStoreProvider>
        <SkirmishShell
          className={`run-screen${shellRun && visibleRunRelicCount(shellRun) ? ' has-relics' : ''}`}
          testId="run-screen"
          titleBarContent={shellRun ? <RunTitleBarStatus run={shellRun} /> : null}
          relicIds={shellRun ? shellRun.relics : []}
          shellWorkspaceCoversRelics={strategikonOpen || Boolean(inspectionWorkspace)}
          controlsContent={shellRun
            ? <RunMetaControls run={shellRun} view={view} onNavigate={navigateRunView} showAbandon={shellRun.phase !== 'victory'} />
            : null}
          readyToCompose={hydrated}
          hudProps={{
            enableGlobalShortcuts: false,
            strategikonHref: shellRun ? strategikonHref : null,
            strategikonOpen,
          }}
        >
          <RunPhaseWorkspace
            inspectionWorkspace={inspectionWorkspace}
            strategikonOpen={strategikonOpen}
            strategikonWorkspace={(
              <GameplayWorkspaceSceneSlot
                className="strategikon-slot"
                sceneInstance={strategikonOpen ? routePath : '/run/strategikon'}
              >
                {strategikonOpen ? <Strategikon path={routePath} search={routeSearch} run={shellRun} /> : null}
              </GameplayWorkspaceSceneSlot>
            )}
          >
            {workspace}
          </RunPhaseWorkspace>
        </SkirmishShell>
      </SkirmishViewStoreProvider>
    </RunPresentationSceneSlot>
  );
}
