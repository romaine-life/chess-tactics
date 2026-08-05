import { Children, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { RunBattleTransformSink, RunBattleUndoAdapter } from '../game/store';
import { defaultFacingForSide, paletteForSide, pieceSpritePath } from '../core/pieces';
import type { GameState, Piece } from '../core/types';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { InnerChromeBox } from './shared/ChromeBox';
import { HouseSelect } from './shared/HouseSelect';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import { TitleBarStatus } from './shell/TitleBarControls';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { TitleRoute, type TitleRouteSegment } from './shell/TitleRoute';
import { RunIdentityChip, RunTitleBarMeasures } from './RunTitleBarChips';
import { PLAY_RUN_SELECTOR_HREF } from './playHubRoute';
import {
  Skirmish,
  type RunBattlePresentation,
  type RunDeploymentPresentation,
} from './Skirmish';
import { navigateApp } from './navigation';
import { installedRunSectioWrap, runSectioWrapLiveMount } from './runSectioWrapCandidates';
import { runSceneWorkspaceIdentity, type RunSceneSnapshot } from './shell/sceneManifest';
import { RunPresentationSceneSlot } from './shell/AuthoredSceneSlot';
import { useConfirm } from './shared/ConfirmDialog';
import { RunSceneViewport } from './RunWorkspace';
import { workspaceBackgroundArtwork } from './workspaceBackgrounds';
import {
  ADLECTED_DISPLAY_NAME,
  ATARAXIA_BY_TIER,
  CACOCHYMIC_DISPLAY_NAME,
  GOLD_SCALE,
  LIPSANON_BY_ID,
  performAdlectio,
  buyPaidLipsanon,
  canRestartBattle,
  canTargetLipsanon,
  canLeaveSectio,
  canUndoRunBattleMove,
  cashOutPawn,
  captureRunBattleUndo,
  closeBattle,
  hasLipsanon,
  hasRunAbility,
  leaveAftermath,
  leaveSectio,
  lipsanonNeedsUnitTarget,
  markReservistDeployed,
  observeRunUnitDeath,
  prepareDeployment,
  resetSectio,
  RUN_BATTLE_RETRY_COST_TENTHS,
  restartBattle,
  runBattleActivityId,
  runAbilityDescription,
  runAbilityDisplayName,
  performAlienatio,
  performExpunctio,
  sectioHasChanges,
  takeVacantiaLipsanon,
  undoRunBattleMove,
  type RunCardOffer,
  type RunDocument,
  type LipsanonId,
} from '../run/model';
import {
  advanceAutomaticDeployment,
  advanceDeploymentTransport,
  beginDeploymentDeal,
  completeDeploymentDeal,
  currentDeploymentUnit,
  deploymentInteractionStage,
  deploymentOptions,
  disciplinePlacementCells,
  finishDeploymentCardDiscard,
  finishDeploymentCardReveal,
  finishDeploymentUnitSettlement,
  gameForRunDeployment,
  levelWithRunDeployment,
  normalReservistCell,
  placeAdlectedDeploymentUnit,
  placeRevealedDeploymentUnit,
  revealActiveDeploymentCard,
  resolveForcedDeploymentChoices,
  selectedDeploymentLayout,
  setDeploymentTransport,
  type RunDeploymentInteractionStage,
} from '../run/deployment';
import { useActiveRun } from '../run/store';
import { SkirmishViewStoreProvider } from '../game/SkirmishViewStoreContext';
import { runLinkTargetMismatch } from '../run/craft';
import { useRunCraft } from './useRunCraft';
import { LipsanonIcon, LipsanaWorkspace } from './Lipsana';
import { RunBonaVacantia, RunBonaVacantiaTarget } from './RunBonaVacantia';
import { RunGoldAmount } from './RunResources';
import {
  isSectioWorkspaceView,
  RUN_WORKSPACE_VIEW_LABEL,
  SECTIO_WORKSPACE_VIEWS,
  runArmyUnitHref,
  runBonaTargetHref,
  runWorkspaceHref,
  runWorkspaceTitleSegment,
  type RunSelfInspectionView,
  type RunWorkspaceView,
} from './RunSelfInspection';
import {
  DEFAULT_RUN_ARMY_FILTERS,
  DEFAULT_RUN_ALIENATIO_FILTERS,
  RunArmyWorkspace,
  RunAlienatioWorkspace,
  runUnitIdentifier,
  runUnitRosterLabel,
  type RunArmyFilters,
  type RunAlienatioFilters,
} from './RunArmyWorkspace';
import { RunCard } from './RunCard';
import { RunBattlePreview } from './RunBattlePreview';
import { RunDeploymentCardStack, RunDeploymentDeckDeal } from './RunDeploymentCardStack';
import { useSceneMotion } from './shell/SceneActivity';
import { RunExpunctioWorkspace } from './RunExpunctioWorkspace';
import { runCardName } from '../run/cardNames';
import {
  runCardMotionDurationMs,
  runCardReflowOffset,
  useRunCardFlights,
  type RunCardFlightRect,
} from './runCardFlightView';
import { isStrategikonPath, strategikonRouteCrumbs } from './strategikonRoute';
import { createRunForm, runActivity, type RunForm } from './RunForm';
import { ChromeButton, ChromeNavButton } from './shared/ChromeButton';
import { PredrawnMoveHighlightPaint } from '../render/PredrawnMoveHighlightPaint';
import type { SkirmishBoardSurfaceState } from '../render/SkirmishBoard';
import { boardLabCellPosition } from '../render/boardProjection';
import { objectBaseZIndex } from '../render/sceneDepth';

type RunScreenView = RunWorkspaceView;

function visibleLipsanonCount(run: RunDocument): number {
  return run.lipsana.filter((lipsanonId) => Boolean(LIPSANON_BY_ID[lipsanonId])).length;
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
    ? 'War Won'
    : run.phase === 'aftermath'
      ? 'Victory'
      : run.phase === 'bona-vacantia'
        ? 'Bona Vacantia'
        : `${run.phase.charAt(0).toUpperCase()}${run.phase.slice(1)}`;
}

export function runTitleBarRouteSegments(
  run: RunDocument,
  path: string,
  search: string,
  requestedView: RunScreenView,
): readonly TitleRouteSegment[] {
  const runRootHref = runWorkspaceHref(`/run${search}`, 'primary');
  const segments: TitleRouteSegment[] = [{ label: runPhaseRouteName(run), to: runRootHref }];
  if (isStrategikonPath(path)) {
    segments.push(...strategikonRouteCrumbs(path).map((crumb) => ({
      ...crumb,
      to: `${crumb.to}${search}`,
    })));
  } else {
    const view = isSectioWorkspaceView(requestedView) && run.phase !== 'sectio'
      ? 'primary'
      : requestedView;
    const workspaceSegment = runWorkspaceTitleSegment(`/run${search}`, view);
    if (workspaceSegment) segments.push(workspaceSegment);
  }
  return segments;
}

function RunTitleBarStatus({ run, path, search, view }: {
  run: RunDocument;
  path: string;
  search: string;
  view: RunScreenView;
}): ReactElement {
  const progress = runBattleProgress(run);
  const levelName = run.war.battles[run.battleIndex]?.level.name ?? 'Battle';
  return (
    <>
      {/* The phase is the durable Run position; an open Strategikon appends the exact
          visible workspace address — Sectio › Strategikon › Enchiridion › Cards —
          rather than leaving the covered phase as the last word in the route. */}
      <TitleBarSlot region="route">
        <TitleRoute segments={runTitleBarRouteSegments(run, path, search, view)} />
      </TitleBarSlot>
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

/** The installed full-screen Sectio scene, or null when the Sectio has no scene art. */
function useInstalledSectioScene(): ReactElement | null {
  return useMemo(() => {
    const installed = installedRunSectioWrap();
    return installed?.kind === 'screen'
      ? <img className="run-sectio-scene-artwork" src={installed.src} alt="" draggable={false} />
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
  const sectio = run.phase === 'sectio' ? run.sectio : null;
  const canLeave = canLeaveSectio(run);
  // Nothing inside the Sectio blocks Continue any more: the Conflict's lipsanon is taken on
  // Bona Vacantia, before the Sectio is even built.
  const continueHint: string | null = null;
  const primaryLabel = run.phase === 'bona-vacantia'
    ? 'Bona Vacantia'
    : run.phase === 'deployment'
      ? 'Deployment'
      : run.phase === 'battle'
        ? 'Battle'
        : run.phase === 'aftermath'
          ? 'Victory'
          : run.phase === 'victory'
            ? 'War Won'
            : 'Sectio';
  return (
    <>
      {abandonDialog}
      <section
        className="run-meta-controls"
        aria-label="Run controls"
      >
        <div className="skirmish-view-group">
          <span className="skirmish-eyebrow">{sectio ? 'Sectio views' : 'Run views'}</span>
          <div className="run-meta-navigation">
            <ChromeButton unit="inner-text-button"
              data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
              data-testid="run-view-primary"
              className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === 'primary' && 'active')}
              style={{ ['--run-leaf-control-index' as string]: 0 } as CSSProperties}
              aria-pressed={view === 'primary'}
              onClick={() => onNavigate('primary')}
            >
              {primaryLabel}
            </ChromeButton>
            {sectio ? (
              SECTIO_WORKSPACE_VIEWS.map((candidate, index) => (
                <ChromeButton unit="inner-text-button"
                  key={candidate}
                  data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                  data-testid={`run-view-${candidate}`}
                  className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === candidate && 'active')}
                  style={{ ['--run-leaf-control-index' as string]: index + 1 } as CSSProperties}
                  aria-pressed={view === candidate}
                  onClick={() => onNavigate(candidate)}
                >
                  {RUN_WORKSPACE_VIEW_LABEL[candidate]}
                </ChromeButton>
              ))
            ) : null}
          </div>
        </div>
        {sectio ? (
          <div className="skirmish-view-group">
            <span className="skirmish-eyebrow">Sectio</span>
            <div className="run-meta-navigation">
              <ChromeButton unit="inner-text-button"
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
                style={{ ['--run-leaf-control-index' as string]: SECTIO_WORKSPACE_VIEWS.length + 1 } as CSSProperties}
                disabled={!sectioHasChanges(run)}
                data-testid="reset-run-sectio"
                onClick={() => {
                  replace(resetSectio(run));
                  onNavigate('primary');
                }}
              >
                Reset Sectio
              </ChromeButton>
              <ChromeButton unit="inner-text-button"
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                style={{ ['--run-leaf-control-index' as string]: SECTIO_WORKSPACE_VIEWS.length + 2 } as CSSProperties}
                disabled={!canLeave}
                data-testid="continue-run-sectio"
                title={!canLeave && continueHint ? continueHint : undefined}
                onClick={() => {
                  const deployment = prepareDeployment(leaveSectio(run));
                  const level = deployment.war.battles[deployment.battleIndex]?.level;
                  replace(level ? advanceAutomaticDeployment(deployment, level) : deployment);
                  onNavigate('primary');
                }}
              >
                {sectio.kind === 'opening' ? 'Continue to first Battle' : 'Continue to next Battle'}
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
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'danger')}
                style={{ ['--run-leaf-control-index' as string]: SECTIO_WORKSPACE_VIEWS.length + 3 } as CSSProperties}
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

function deploymentSquareLabel(cellKey: string | undefined, rows: number): string | null {
  const match = cellKey ? /^(\d+),(\d+)$/.exec(cellKey) : null;
  if (!match) return null;
  return `${String.fromCharCode(65 + Number(match[1]))}${rows - Number(match[2])}`;
}

function DeploymentControls({
  run,
  stage,
  activeUnit,
  dealProgress,
  onDealProgress,
  onSetTransport,
  onNext,
  onDealComplete,
  onRevealComplete,
  onDiscardComplete,
}: {
  run: RunDocument;
  stage: RunDeploymentInteractionStage;
  activeUnit: ReturnType<typeof currentDeploymentUnit>;
  dealProgress: number;
  onDealProgress: (count: number) => void;
  onSetTransport: (transport: 'paused' | 'playing' | 'full-deploy') => void;
  onNext: () => void;
  onDealComplete: () => void;
  onRevealComplete: () => void;
  onDiscardComplete: () => void;
}): ReactElement {
  const { abandonDialog, abandoning, requestAbandon } = useRunAbandon(run);
  const transport = run.deployment?.transport ?? 'paused';
  const transportReady = stage !== 'await-deal' && stage !== 'dealing' && stage !== 'ready';
  const inputRequired = stage === 'adlected';
  const nextReady = stage === 'place';
  const abilities = activeUnit
    ? (['adlected', 'eutactic', 'agminate'] as const).filter((ability) => (
        ability === 'adlected'
          ? activeUnit.abilities.includes('adlected') || run.deployment?.temporaryAdlectedUnitId === activeUnit.id
          : hasRunAbility(run, activeUnit, ability)
      ))
    : [];
  return (
    <>
      {abandonDialog}
      <section className="run-meta-controls run-deployment-controls" aria-label="Deployment controls">
        <RunDeploymentCardStack
          run={run}
          dealProgress={dealProgress}
          onDealProgress={onDealProgress}
          onDealComplete={onDealComplete}
          onRevealComplete={onRevealComplete}
          onDiscardComplete={onDiscardComplete}
        />

        <div className="skirmish-view-group run-deployment-control" data-testid="deployment-transport-control">
          <div className="run-deployment-transport" role="group" aria-label="Deployment transport">
            <ChromeButton
              unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'app-header-button', transport === 'paused' && 'active')}
              aria-label="Pause deployment"
              title="Pause"
              aria-pressed={transport === 'paused'}
              disabled={!transportReady || transport === 'paused'}
              onClick={() => onSetTransport('paused')}
            >
              ⏸
            </ChromeButton>
            <ChromeButton
              unit="inner-text-button"
              data-testid="deployment-play"
              className={chromeUnitClassNames('inner-text-button', 'app-header-button', transport === 'playing' && 'active')}
              aria-label="Play deployment"
              title="Play"
              aria-pressed={transport === 'playing'}
              disabled={!transportReady || inputRequired}
              onClick={() => onSetTransport('playing')}
            >
              ▶
            </ChromeButton>
            <ChromeButton
              unit="inner-text-button"
              data-testid="deployment-next"
              className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
              aria-label="Next deployment step"
              title="Next step"
              disabled={!nextReady}
              onClick={onNext}
            >
              ⏭
            </ChromeButton>
            <ChromeButton
              unit="inner-text-button"
              data-testid="deployment-full-deploy"
              className={chromeUnitClassNames('inner-text-button', 'app-header-button', transport === 'full-deploy' && 'active')}
              aria-pressed={transport === 'full-deploy'}
              disabled={!transportReady || inputRequired}
              onClick={() => onSetTransport('full-deploy')}
            >
              Full deploy
            </ChromeButton>
          </div>
        </div>

        {activeUnit && (stage === 'place' || stage === 'adlected') ? (
          <div className="skirmish-view-group run-deployment-control" data-testid="deployment-active-unit">
            <span className="skirmish-eyebrow">Deploying</span>
            <strong>{runUnitRosterLabel(activeUnit)}</strong>
            {abilities.map((ability) => (
              <p key={ability}>
                <b>{runAbilityDisplayName(ability)}</b> · {runAbilityDescription(ability, activeUnit.type)}
              </p>
            ))}
            {stage === 'adlected' ? <p>Select one of the highlighted squares.</p> : null}
          </div>
        ) : null}

        {stage === 'settling' && activeUnit ? (
          <div className="skirmish-view-group run-deployment-control">
            <span className="skirmish-eyebrow">Settling</span>
            <strong>{runUnitRosterLabel(activeUnit)}</strong>
          </div>
        ) : null}

        <div className="skirmish-view-group run-meta-abandon">
          <span className="skirmish-eyebrow">Run</span>
          <ChromeButton
            unit="inner-text-button"
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
}: {
  run: RunDocument;
}): RunDeploymentPresentation | null {
  const replace = useActiveRun((state) => state.replace);
  const level = run.war.battles[run.battleIndex].level;
  const prepared = useMemo(
    () => resolveForcedDeploymentChoices(run.deployment ? run : prepareDeployment(run), level),
    [level, run],
  );
  const options = useMemo(() => deploymentOptions(prepared, level), [level, prepared]);
  const stage = deploymentInteractionStage(prepared, options);
  const activeUnit = currentDeploymentUnit(prepared);
  const activeAdlected = stage === 'adlected' ? activeUnit : null;
  const legalCells = useMemo(
    () => activeAdlected ? disciplinePlacementCells(prepared, options, activeAdlected.id) : [],
    [activeAdlected, options, prepared],
  );
  const legalCellKeys = useMemo(() => new Set(legalCells.map((cell) => `${cell.x},${cell.y}`)), [legalCells]);
  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null);
  const [dealProgress, setDealProgress] = useState(0);
  const hoveredPlacementCell = hoveredCellKey
    ? legalCells.find((cell) => `${cell.x},${cell.y}` === hoveredCellKey) ?? null
    : null;
  const hoveredPlacementSeat = hoveredPlacementCell ? boardLabCellPosition(hoveredPlacementCell) : null;
  const layout = selectedDeploymentLayout(prepared, options);
  const deploymentGame = useMemo(
    () => gameForRunDeployment(prepared, level, layout, true),
    [layout, level, prepared],
  );
  const deploymentSurfaceState = useMemo<SkirmishBoardSurfaceState>(() => ({
    game: deploymentGame,
    seed: prepared.deployment?.seed ?? prepared.seed,
    viewKey: runBattleActivityId(prepared.id, prepared.battleIndex),
  }), [deploymentGame, prepared.battleIndex, prepared.deployment?.seed, prepared.id, prepared.seed]);

  useEffect(() => {
    if (prepared !== run && prepared.phase === 'deployment') replace(prepared);
  }, [prepared, replace, run]);

  useEffect(() => {
    if (prepared.deployment?.stage === 'awaiting-deal') setDealProgress(0);
  }, [prepared.deployment?.battleIndex, prepared.deployment?.stage]);

  useEffect(() => {
    if (prepared.phase !== 'deployment') return;
    if (prepared.deployment?.stage === 'card') {
      replace(revealActiveDeploymentCard(prepared));
      return;
    }
    if (stage === 'adlected' && prepared.deployment?.transport !== 'paused') {
      replace(setDeploymentTransport(prepared, 'paused'));
      return;
    }
    if (
      stage === 'place'
      && (prepared.deployment?.transport === 'playing' || prepared.deployment?.transport === 'full-deploy')
    ) {
      replace(advanceDeploymentTransport(prepared, level));
    }
  }, [level, prepared, replace, stage]);

  const beginDeal = useCallback(() => {
    const latest = useActiveRun.getState().run;
    if (latest?.id === prepared.id && latest.phase === 'deployment') {
      replace(beginDeploymentDeal(latest));
    }
  }, [prepared.id, replace]);
  const finishDeal = useCallback(() => {
    const latest = useActiveRun.getState().run;
    if (latest?.id === prepared.id && latest.phase === 'deployment') {
      replace(completeDeploymentDeal(latest, level));
    }
  }, [level, prepared.id, replace]);
  const setTransport = useCallback((transport: 'paused' | 'playing' | 'full-deploy') => {
    const latest = useActiveRun.getState().run;
    if (latest?.id === prepared.id && latest.phase === 'deployment') {
      replace(setDeploymentTransport(latest, transport));
    }
  }, [prepared.id, replace]);
  const advanceOne = useCallback(() => {
    const latest = useActiveRun.getState().run;
    if (latest?.id !== prepared.id || latest.phase !== 'deployment') return;
    const paused = setDeploymentTransport(latest, 'paused');
    if (deploymentInteractionStage(paused) === 'place') {
      replace(placeRevealedDeploymentUnit(paused, level));
    } else if (paused !== latest) {
      replace(paused);
    }
  }, [level, prepared.id, replace]);
  const finishReveal = useCallback(() => {
    const latest = useActiveRun.getState().run;
    if (latest?.id === prepared.id && latest.phase === 'deployment') {
      replace(finishDeploymentCardReveal(latest));
    }
  }, [prepared.id, replace]);
  const finishDiscard = useCallback(() => {
    const latest = useActiveRun.getState().run;
    if (latest?.id === prepared.id && latest.phase === 'deployment') {
      replace(finishDeploymentCardDiscard(latest));
    }
  }, [prepared.id, replace]);
  const reportArrivals = useCallback((unitIds: readonly string[]) => {
    const latest = useActiveRun.getState().run;
    const settlingUnitIds = latest?.id === prepared.id && latest.phase === 'deployment'
      ? latest.deployment?.settlingUnitIds ?? []
      : [];
    if (settlingUnitIds.length > 0 && settlingUnitIds.every((unitId) => !unitIds.includes(unitId))) {
      replace(finishDeploymentUnitSettlement(latest!, level));
    }
  }, [level, prepared.id, replace]);

  if (run.phase !== 'deployment') return null;
  return {
    surfaceState: deploymentSurfaceState,
    screenClassName: 'run-deployment-screen',
    boardClassName: 'run-deployment-board',
    boardAriaLabel: `${level.name} deployment battlefield`,
    onArrivingUnitIdsChange: reportArrivals,
    controlsContent: (
      <DeploymentControls
        run={prepared}
        stage={stage}
        activeUnit={activeUnit}
        dealProgress={dealProgress}
        onDealProgress={setDealProgress}
        onSetTransport={setTransport}
        onNext={advanceOne}
        onDealComplete={finishDeal}
        onRevealComplete={finishReveal}
        onDiscardComplete={finishDiscard}
      />
    ),
    renderCellOverlay: ({ cell, visualFootprintStyle }) => {
      const cellKey = `${cell.x},${cell.y}`;
      const legal = legalCellKeys.has(cellKey);
      if (!activeAdlected) return null;
      const label = deploymentSquareLabel(cellKey, level.board.rows);
      return (
        <button
          type="button"
          className={`skirmish-board-cell-hit run-deployment-cell ${legal ? 'is-move' : 'is-deployment-blocked'}`}
          aria-label={legal ? `Place ${runUnitRosterLabel(activeAdlected)} on ${label}` : `${label} is unavailable`}
          aria-disabled={!legal}
          style={visualFootprintStyle}
          onPointerDown={(event) => {
            // ViewPane owns primary-drag panning on its bubbling path. An Adlected square is
            // a real button, so keep its primary press paired with its release; secondary
            // button panning still reaches ViewPane's capture handler.
            if (event.button === 0) event.stopPropagation();
          }}
          onPointerEnter={() => setHoveredCellKey(cellKey)}
          onPointerLeave={() => setHoveredCellKey((current) => current === cellKey ? null : current)}
          onClick={legal ? () => replace(placeAdlectedDeploymentUnit(prepared, level, cell)) : undefined}
        >
          <PredrawnMoveHighlightPaint />
        </button>
      );
    },
    boardOverlay: (
      <>
        <RunDeploymentDeckDeal
          run={prepared}
          dealtCount={dealProgress}
          onBeginDeal={beginDeal}
        />
        {activeAdlected && hoveredPlacementCell && hoveredPlacementSeat ? (
          <span
            className={`board-unit-seat is-${activeAdlected.type} run-deployment-placement-ghost`}
            data-testid="deployment-placement-ghost"
            style={{
              left: hoveredPlacementSeat.left,
              top: hoveredPlacementSeat.top,
              zIndex: objectBaseZIndex(hoveredPlacementCell),
            }}
            aria-hidden="true"
          >
            <img
              src={pieceSpritePath(activeAdlected.type, paletteForSide('player'), defaultFacingForSide('player'))}
              alt=""
              draggable={false}
            />
          </span>
        ) : null}
      </>
    ),
  };
}

function LipsanonOffer({
  run,
  lipsanonId,
  action,
  actionLabel,
  disabled = false,
}: {
  run: RunDocument;
  lipsanonId: LipsanonId;
  action: (targetUnitId?: string) => void;
  actionLabel: ReactNode;
  disabled?: boolean;
}): ReactElement {
  const lipsanon = LIPSANON_BY_ID[lipsanonId];
  const [target, setTarget] = useState('');
  const needsTarget = lipsanonNeedsUnitTarget(lipsanonId);
  return (
    <InnerChromeBox className="run-card run-lipsanon-card">
      <header className="run-lipsanon-card-heading">
        <LipsanonIcon lipsanonId={lipsanonId} />
        <h3>{lipsanon.name}</h3>
      </header>
      <p>{lipsanon.description}</p>
      {needsTarget ? (
        <HouseSelect
          value={target}
          options={[
            { value: '', label: 'Choose a unit…' },
            ...run.army
              .filter((unit) => canTargetLipsanon(run, lipsanonId, unit.id))
              .map((unit) => ({ value: unit.id, label: runUnitRosterLabel(unit) })),
          ]}
          onChange={setTarget}
          ariaLabel="Adlected target unit"
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
 * The Sectio's card row. When the owner has installed a wrap, the same row is
 * mounted inside its painted stall; otherwise it is the plain grid. The wrap is
 * decoration around the real cards — it never changes what is purchasable.
 */
function SectioCardRow({
  children,
  offerIds,
}: {
  children: ReactNode;
  offerIds: string[];
}): ReactElement {
  const sceneMotion = useSceneMotion();
  const wrap = useMemo(() => installedRunSectioWrap(), []);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const previousRectsRef = useRef(new Map<string, RunCardFlightRect>());
  const previousLayoutKeyRef = useRef<string | null>(null);
  const cardCount = Children.count(children);
  const layoutKey = offerIds.join('|');
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

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const currentRects = new Map<string, RunCardFlightRect>();
    const elements = new Map<string, HTMLElement>();
    row.querySelectorAll<HTMLElement>('[data-run-sectio-offer-id]').forEach((element) => {
      const id = element.dataset.runSectioOfferId;
      if (!id) return;
      const rect = element.getBoundingClientRect();
      currentRects.set(id, rect);
      elements.set(id, element);
    });

    const previousKey = previousLayoutKeyRef.current;
    const previousRects = previousRectsRef.current;
    previousLayoutKeyRef.current = layoutKey;
    previousRectsRef.current = currentRects;
    if (previousKey === null || previousKey === layoutKey) {
      return undefined;
    }

    const moving = [...currentRects].flatMap(([id, rect]) => {
      const previous = previousRects.get(id);
      const element = elements.get(id);
      const offset = previous ? runCardReflowOffset(previous, rect) : null;
      if (!element || !offset || (Math.abs(offset.x) < 0.5 && Math.abs(offset.y) < 0.5)) return [];
      return [{ element, offset }];
    });
    if (!moving.length) return undefined;

    const rowStyle = getComputedStyle(row);
    const duration = runCardMotionDurationMs(rowStyle.getPropertyValue('--ds-duration-fade'));
    const easing = rowStyle.getPropertyValue('--ds-ease-standard').trim();
    if (!duration || !easing || typeof Element.prototype.animate !== 'function') return undefined;

    let cancelled = false;
    let animations: Animation[];
    const clearPresentation = (): void => {
      moving.forEach(({ element }) => {
        element.classList.remove('is-reflowing');
      });
    };
    const finish = (): void => {
      if (cancelled) return;
      clearPresentation();
    };

    animations = moving.map(({ element, offset }) => {
      element.classList.add('is-reflowing');
      return sceneMotion.animate(
        element,
        [
          { translate: `${offset.x}px ${offset.y}px` },
          { translate: '0 0' },
        ],
        { duration, easing },
      );
    }).flatMap((animation) => animation ? [animation] : []);
    if (animations.length !== moving.length) {
      clearPresentation();
      return undefined;
    }
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);

    return () => {
      cancelled = true;
      // A second Adlectio can change the row while this FLIP is mid-flight. Preserve
      // each survivor's current visual rectangle so the replacement FLIP continues
      // from the pixels the player just clicked beside instead of snapping to a stale
      // logical seat before beginning again.
      const interruptedRects = new Map<string, RunCardFlightRect>();
      row.querySelectorAll<HTMLElement>('[data-run-sectio-offer-id]').forEach((element) => {
        const id = element.dataset.runSectioOfferId;
        if (id) interruptedRects.set(id, element.getBoundingClientRect());
      });
      if (interruptedRects.size) previousRectsRef.current = interruptedRects;
      animations.forEach((animation) => animation.cancel());
      clearPresentation();
    };
  }, [box.height, box.width, layoutKey, sceneMotion]);

  if (!wrap || wrap.kind !== 'band' || cardCount < 1) {
    return <div className="run-card-grid" ref={rowRef}>{children}</div>;
  }
  const mount = box.width > 0 && box.height > 0
    ? runSectioWrapLiveMount(wrap, cardCount, box.width, box.height)
    : null;
  return (
    <div className="run-sectio-wrap-host" ref={hostRef} data-testid="run-sectio-wrap">
      {mount ? (
        <div
          className="run-sectio-wrap-frame"
          style={{
            insetInlineStart: `${mount.frame.left}px`,
            insetBlockStart: `${mount.frame.top}px`,
            inlineSize: `${mount.frame.width}px`,
            blockSize: `${mount.frame.height}px`,
          }}
        >
          <img className="run-sectio-wrap-art" src={wrap.src} alt="" draggable={false} />
          <div
            className="run-sectio-wrap-cards"
            ref={rowRef}
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

function SectioPanel({
  run,
  view,
  alienatioWorkspace,
  expunctioWorkspace,
  adlectioAnnouncement,
  onAdlect,
}: {
  run: RunDocument;
  view: RunScreenView;
  alienatioWorkspace: ReactElement;
  expunctioWorkspace: ReactElement;
  adlectioAnnouncement: string;
  onAdlect: (offer: RunCardOffer, source: HTMLButtonElement) => void;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const sectio = run.sectio!;
  const availableOffers = sectio.cardOffers.filter((offer) => !sectio.adlectedCardOfferIds.includes(offer.offerId));
  const pestiferousLosses = run.pestiferousLosses.filter((loss) => loss.battleIndex === sectio.afterBattleIndex);
  return (
    <>
      {view === 'alienatio'
        ? alienatioWorkspace
        : view === 'expunctio'
          ? expunctioWorkspace
          : view === 'battle-preview' ? <RunBattlePreview run={run} /> : (
        // The title bar already says Run › Sectio, so a heading painted into the
        // scene's corner only repeats it. The name stays for assistive tech.
        <RunSceneViewport
          scene={{
            view: 'sectio',
            className: 'run-sectio-workspace',
            contentClassName: 'run-sectio-workspace-content',
            testId: 'run-sectio-workspace',
            ariaLabel: 'Sectio',
          }}
        >
        {/* What the Battle paid is reported on the Battle's own aftermath screen, which the
            player has already passed through to reach this one. */}
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
        <section
          className="run-sectio-cards-section"
          aria-label="Cards"
        >
          <span className="sr-only" role="status" aria-live="polite">{adlectioAnnouncement}</span>
          <SectioCardRow
            offerIds={availableOffers.map((offer) => offer.offerId)}
          >
            {availableOffers.map((offer) => (
              <RunCard
                card={offer}
                mode="sectio"
                layoutId={offer.offerId}
                key={offer.offerId}
                disabled={run.goldTenths < offer.cost * GOLD_SCALE}
                onSelect={(source) => onAdlect(offer, source)}
              />
            ))}
          </SectioCardRow>
          {availableOffers.length === 0 ? (
            <InnerChromeBox className="run-sectio-cards-empty" role="status">
              All offered cards are in the Chartulary.
            </InnerChromeBox>
          ) : null}
        </section>


        {sectio.paidLipsanonOffer ? (
          <section>
            <h3>Merchant&apos;s Shopkey</h3>
            <LipsanonOffer
              run={run}
              lipsanonId={sectio.paidLipsanonOffer}
              actionLabel={sectio.paidLipsanonBought ? 'Sold out this Conflict' : (
                <span className="run-paid-lipsanon-price">
                  <span>Buy</span>
                  <RunGoldAmount valueTenths={10 * GOLD_SCALE} className="run-gold-amount--button" />
                </span>
              )}
              disabled={sectio.paidLipsanonBought || run.goldTenths < 10 * GOLD_SCALE}
              action={(target) => replace(buyPaidLipsanon(run, target))}
            />
          </section>
        ) : null}

        </RunSceneViewport>
      )}
    </>
  );
}

/** Wall-clock time on a Battle, in the shape a clock reads: 4:37, or 1:04:37 past an hour. */
function formatBattleElapsed(elapsedMs: number): string {
  const total = Math.round(elapsedMs / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const padded = (value: number): string => String(value).padStart(2, '0');
  return hours ? `${hours}:${padded(minutes)}:${padded(seconds)}` : `${minutes}:${padded(seconds)}`;
}

function AftermathMeasure({
  label,
  children,
  detail = null,
}: {
  label: string;
  children: ReactNode;
  detail?: ReactNode;
}): ReactElement {
  return (
    <div className="run-aftermath-measure">
      <dt>{label}</dt>
      <dd>
        <span className="run-aftermath-measure-value">{children}</span>
        {detail ? <span className="run-aftermath-measure-detail">{detail}</span> : null}
      </dd>
    </div>
  );
}

/**
 * The screen that closes a won Battle. It is a phase of its own rather than a card over the
 * board: the fight is finished, so the board behind it is no longer the thing being looked at,
 * and the reward it reports used to be a line inside the Sectio -- announcing the result of the
 * fight in the room where the money is spent.
 *
 * The gold is not banked until Continue, so what the screen says it won and what the Run then
 * receives are the same number read twice.
 */
function AftermathPanel({ run }: { run: RunDocument }): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const aftermath = run.aftermath!;
  const progress = runBattleProgress(run);
  const levelName = run.war.battles[aftermath.battleIndex]?.level.name ?? '';
  const named = levelName && !isGeneratedRunBattleName(levelName) ? levelName : null;
  return (
    <RunSceneViewport
      scene={{
        view: 'aftermath',
        className: 'run-aftermath-workspace',
        contentClassName: 'run-aftermath-workspace-content',
        testId: 'run-aftermath-workspace',
        ariaLabelledBy: 'run-aftermath-workspace-title',
        backgroundArtwork: workspaceBackgroundArtwork('run-victory'),
      }}
    >
      <header className="run-aftermath-head">
        <p className="run-aftermath-eyebrow">
          Conflict {progress.conflict} · Battle {progress.battle} of {progress.battlesInConflict}
        </p>
        <h2 id="run-aftermath-workspace-title" className="run-aftermath-title">Victory</h2>
        {named ? <p className="run-aftermath-subtitle">{named}</p> : null}
      </header>

      <InnerChromeBox as="div" className="run-aftermath-report">
        <dl className="run-aftermath-ledger">
          <AftermathMeasure
            label="Gold won"
            detail={aftermath.bonusGoldTenths
              ? `including ${LIPSANON_BY_ID['mercenarys-rifle'].name}`
              : null}
          >
            <RunGoldAmount valueTenths={aftermath.goldTenths} />
          </AftermathMeasure>
          <AftermathMeasure label="Turns taken">{aftermath.turns}</AftermathMeasure>
          <AftermathMeasure label="Time">
            {aftermath.elapsedMs === null ? '—' : formatBattleElapsed(aftermath.elapsedMs)}
          </AftermathMeasure>
          <AftermathMeasure
            label="Fallen"
            detail={aftermath.fallenUnits.length
              ? aftermath.fallenUnits.map((unit) => unit.name).join(' · ')
              : 'The whole force came through.'}
          >
            {aftermath.fallenUnits.length}
          </AftermathMeasure>
        </dl>
      </InnerChromeBox>

      <ChromeButton unit="inner-text-button"
        data-testid="run-aftermath-continue"
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
        onClick={() => replace(leaveAftermath(run))}
      >
        Continue
      </ChromeButton>
    </RunSceneViewport>
  );
}

function VictoryPanel({ run }: { run: RunDocument }): ReactElement {
  const abandon = useActiveRun((state) => state.abandon);
  return (
    <RunSceneViewport
      scene={{
        view: 'victory',
        className: 'run-victory-workspace',
        contentClassName: 'run-victory-workspace-content',
        testId: 'run-victory-workspace',
        ariaLabelledBy: 'run-victory-workspace-title',
        backgroundArtwork: workspaceBackgroundArtwork('run-victory'),
      }}
    >
      <h2 id="run-victory-workspace-title">War won</h2>
      <h2>{run.war.name}</h2>
      <p>{ATARAXIA_BY_TIER[run.ataraxiaTier].label} — {ATARAXIA_BY_TIER[run.ataraxiaTier].title}</p>
      <p>{run.war.description}</p>
      <p className="run-victory-summary">
        <span>{run.army.length} persistent units</span>
        <span>{visibleLipsanonCount(run)} lipsana</span>
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
    </RunSceneViewport>
  );
}

function RunBattlefieldPanel({
  form,
  run,
  routePath,
  routeSearch,
  view,
  onNavigate,
}: {
  form: RunForm;
  run: RunDocument;
  view: RunScreenView;
  onNavigate: (view: RunScreenView) => void;
  routePath: string;
  routeSearch: string;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const currentRun = useActiveRun((state) => state.run);
  const { abandonDialog, requestAbandon } = useRunAbandon(run);
  const deploymentPresentation = useRunDeploymentPresentation({ run });
  const baseLevel = run.war.battles[run.battleIndex].level;
  // Battle-runtime writes (including Restart) do not change deployment. Keep the
  // projected board document referentially stable across those persistence updates,
  // so Skirmish does not re-run its board-entry effect for an unchanged battle.
  const options = useMemo(
    () => deploymentOptions(run, baseLevel),
    [baseLevel, run.army, run.deployment, run.lipsana, run.seed],
  );
  const layout = useMemo(
    () => selectedDeploymentLayout(run, options),
    [options, run.deployment, run.lipsana],
  );
  const battleLevel = useMemo(
    () => levelWithRunDeployment(run, baseLevel, layout),
    [baseLevel, layout, run.army, run.lipsana],
  );
  const runId = run.id;
  const battleSeed = run.deployment?.seed ?? run.seed;
  const canCashOutPawn = hasLipsanon(run, 'mercenary-boat');
  const retryRun = currentRun?.id === runId ? currentRun : run;

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
    transformCommittedBoard,
    undoAdapter: {
      capture: () => {
        const latest = useActiveRun.getState().run;
        return latest?.id === runId ? captureRunBattleUndo(latest) : null;
      },
      canRestore: (checkpoint) => {
        const latest = useActiveRun.getState().run;
        return Boolean(latest?.id === runId && canUndoRunBattleMove(latest, checkpoint));
      },
      restore: (checkpoint) => {
        const latest = useActiveRun.getState().run;
        if (!latest || latest.id !== runId) return false;
        const restored = undoRunBattleMove(latest, checkpoint);
        if (restored === latest) return false;
        replace(restored);
        return true;
      },
    } satisfies RunBattleUndoAdapter,
    onVictory: (report) => {
      const latest = useActiveRun.getState().run;
      if (latest?.id === runId) replace(closeBattle(latest, report));
    },
    onRestart: () => {
      const latest = useActiveRun.getState().run;
      if (!latest || latest.id !== runId) return false;
      const restarted = restartBattle(latest);
      if (restarted === latest) return false;
      replace(restarted);
      return true;
    },
    canRestart: canRestartBattle(retryRun),
    retryCostTenths: RUN_BATTLE_RETRY_COST_TENTHS,
    onAbandonRun: () => { void requestAbandon(); },
    onPawnCashOut: canCashOutPawn
      ? (unitId) => {
          const latest = useActiveRun.getState().run;
          if (latest?.id === runId) replace(cashOutPawn(latest, unitId));
        }
      : undefined,
  }), [battleLevel, battleSeed, canCashOutPawn, replace, requestAbandon, retryRun, run.battleIndex, runId, transformCommittedBoard]);

  // Subscribe to the current document so a Paid Crossing cash-out or Reservist event
  // refreshes the hook inputs without restarting the already-live matching board.
  return (
    <>
      {run.phase === 'battle' ? abandonDialog : null}
      <Skirmish
        runForm={form}
        runBattle={presentation}
        runDeployment={deploymentPresentation}
        routePath={routePath}
        routeSearch={routeSearch}
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
  const [adlectioAnnouncement, setAdlectioAnnouncement] = useState('');
  const { launch: launchCardFlight, element: cardFlightElement } = useRunCardFlights();
  // A craft address sets the account's Run to the state it names before the screen reads one,
  // every time it is opened, then lands here without its craft parameters (ADR-0354).
  const craft = useRunCraft(routePath, routeSearch);
  const filterScope = run?.phase === 'sectio'
    ? `${run.id}:sectio:${run.sectio?.afterBattleIndex ?? run.battleIndex}`
    : run
      ? `${run.id}:outside-sectio`
      : 'no-run';
  const [armyFilterState, setArmyFilterState] = useState<{ scope: string; filters: RunArmyFilters }>({
    scope: 'no-run',
    filters: { ...DEFAULT_RUN_ARMY_FILTERS },
  });
  const [alienatioFilterState, setAlienatioFilterState] = useState<{ scope: string; filters: RunAlienatioFilters }>({
    scope: 'no-run',
    filters: { ...DEFAULT_RUN_ALIENATIO_FILTERS },
  });
  // The Strategikon is the Run's reference workspace in EVERY phase, not just Battle —
  // Deployment, Sectio, and Victory all open it from the same Controls title mark. Only an
  // absent Run has nothing to reference, so that is the sole address the screen repairs.
  useEffect(() => {
    if (hydrated && isStrategikonPath(routePath) && !run) {
      navigateApp(`/run${routeSearch}`, { replace: true, scroll: false });
    }
  }, [hydrated, routePath, routeSearch, run]);

  // The pre-hydration document may exist from browser storage, but the screen treats
  // the Run as absent until hydrate() has arbitrated browser and account copies.
  const shellRun = hydrated ? run : null;
  const rawView: RunScreenView = sceneSnapshot.workspace.view === 'strategikon'
    ? 'primary'
    : sceneSnapshot.workspace.view === 'bona-target'
      ? 'primary'
      : sceneSnapshot.workspace.view;
  const view = shellRun?.phase !== 'sectio' && (rawView === 'alienatio' || rawView === 'expunctio')
    ? 'primary'
    : rawView;
  const strategikonOpen = sceneSnapshot.workspace.view === 'strategikon';
  const bonaTarget = sceneSnapshot.workspace.view === 'bona-target'
    ? sceneSnapshot.workspace
    : null;
  const beginAdlectio = (offer: RunCardOffer, source: HTMLButtonElement): void => {
    const latest = useActiveRun.getState().run;
    if (!latest || latest.phase !== 'sectio' || !latest.sectio) return;
    const adlected = performAdlectio(latest, offer.offerId);
    if (adlected === latest) return;
    const target = document.querySelector('[data-run-card-flight-target]');
    launchCardFlight(offer, source, target);
    // The animation explains a transaction; it never owns one. Commit immediately so
    // every remaining affordable card and every Sectio control stays responsive while
    // any number of independent visual flights finish in the continuity layer.
    replace(adlected);
    setAdlectioAnnouncement(`${runCardName(offer)} admitted by Adlectio and added to the Chartulary.`);
  };
  const selectedUnitId = sceneSnapshot.workspace.view === 'army'
    || sceneSnapshot.workspace.view === 'bona-target'
      ? sceneSnapshot.workspace.unitId
      : null;
  const armyFilters = armyFilterState.scope === filterScope
    ? armyFilterState.filters
    : { ...DEFAULT_RUN_ARMY_FILTERS };
  const alienatioFilters = alienatioFilterState.scope === filterScope
    ? alienatioFilterState.filters
    : { ...DEFAULT_RUN_ALIENATIO_FILTERS };
  // Army, Lipsana, and Alienatio are workspaces of the Run screen itself, so they always
  // address the Run root. Dropping any open Strategikon address keeps these Controls
  // live instead of navigating to a path the reference workspace still covers.
  const navigateRunView = (nextView: RunScreenView): void => {
    const current = new URL(window.location.href);
    current.pathname = '/run';
    const nextHref = runWorkspaceHref(current.toString(), nextView);
    navigateApp(nextHref, { replace: true, scroll: false });
  };
  const navigateArmyUnit = (unitId: string | null): void => {
    const current = new URL(window.location.href);
    current.pathname = '/run';
    navigateApp(runArmyUnitHref(current.toString(), unitId), { replace: true, scroll: false });
  };
  const navigateBonaTarget = (lipsanonId: LipsanonId, unitId: string | null = null): void => {
    const current = new URL(window.location.href);
    current.pathname = '/run';
    navigateApp(runBonaTargetHref(current.toString(), lipsanonId, unitId), { replace: true, scroll: false });
  };
  const alieneUnit = (unitId: string): void => {
    if (!shellRun) return;
    const latest = useActiveRun.getState().run;
    if (!latest || latest.id !== shellRun.id) return;
    const aliened = performAlienatio(latest, unitId);
    if (aliened !== latest) replace(aliened);
  };
  const expunctCard = (cardId: string): void => {
    if (!shellRun) return;
    const latest = useActiveRun.getState().run;
    if (!latest || latest.id !== shellRun.id) return;
    const expuncted = performExpunctio(latest, cardId);
    if (expuncted !== latest) replace(expuncted);
  };
  const armyWorkspace = shellRun ? (
    <RunArmyWorkspace
      run={shellRun}
      filters={armyFilters}
      selectedUnitId={selectedUnitId}
      onFiltersChange={(filters) => setArmyFilterState({ scope: filterScope, filters })}
      onSelectUnit={(unitId) => navigateArmyUnit(unitId)}
      onBack={() => navigateArmyUnit(null)}
      onAliene={alieneUnit}
    />
  ) : null;
  const lipsanaWorkspace = shellRun ? <LipsanaWorkspace lipsanonIds={shellRun.lipsana} /> : null;
  const inspectionWorkspace = view === 'army'
    ? armyWorkspace
    : view === 'lipsana'
      ? lipsanaWorkspace
      : null;
  const sectioScene = useInstalledSectioScene();
  const alienatioWorkspace = shellRun ? (
    <RunAlienatioWorkspace
      run={shellRun}
      filters={alienatioFilters}
      onFiltersChange={(filters) => setAlienatioFilterState({ scope: filterScope, filters })}
      onAliene={alieneUnit}
    />
  ) : null;
  const expunctioWorkspace = shellRun ? (
    <RunExpunctioWorkspace run={shellRun} onExpunct={expunctCard} />
  ) : null;
  // The Sectio scene belongs to the retained shell viewport, not to whichever Sectio
  // workspace happens to be in front of it. Keeping it outside the transition region
  // prevents Sectio/View Battle/Alienatio/Expunctio swaps from fading or remounting the room.
  const persistentSectioScene = shellRun?.phase === 'sectio' ? sectioScene : null;
  // A craft request speaks for the whole screen while it runs: the Run it is about to replace must
  // not flash its own phase first, and a refused spec has to say why instead of silently doing
  // nothing.
  // A link made for a specific Run says so. Rendering someone else's Run — or this browser's
  // signed-out copy — under that link is the failure worth catching: it looks like it worked.
  const linkMismatch = hydrated && runLinkTargetMismatch(routeSearch, run?.id ?? null);
  const craftWorkspace = craft.crafting
    ? (
      <RunSceneViewport
        scene={{
          view: 'status',
          className: 'run-loading-workspace',
          contentClassName: 'run-status-workspace-content',
          testId: 'run-craft-workspace',
          role: 'status',
        }}
      >
        <p>Crafting Run…</p>
      </RunSceneViewport>
    )
    : craft.error
      ? (
        <RunSceneViewport
          scene={{
            view: 'status',
            className: 'run-empty-workspace',
            contentClassName: 'run-status-workspace-content',
            testId: 'run-craft-error-workspace',
            role: 'alert',
            ariaLabelledBy: 'run-craft-error-title',
          }}
        >
          <h2 id="run-craft-error-title">This Run could not be crafted</h2>
          <p>{craft.error}</p>
        </RunSceneViewport>
      )
      : linkMismatch
        ? (
          <RunSceneViewport
            scene={{
              view: 'status',
              className: 'run-empty-workspace',
              contentClassName: 'run-status-workspace-content',
              testId: 'run-link-mismatch-workspace',
              role: 'status',
              ariaLabelledBy: 'run-link-mismatch-title',
            }}
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
          </RunSceneViewport>
        )
        : null;
  const workspace = craftWorkspace ?? (!hydrated
    ? (
      <RunSceneViewport
        scene={{
          view: 'status',
          className: 'run-loading-workspace',
          contentClassName: 'run-status-workspace-content',
          testId: 'run-loading-workspace',
          role: 'status',
        }}
      >
        <p>Loading Run…</p>
      </RunSceneViewport>
    )
    : !shellRun
      ? (
        <RunSceneViewport
          scene={{
            view: 'status',
            className: 'run-empty-workspace',
            contentClassName: 'run-status-workspace-content',
            testId: 'run-empty-workspace',
            ariaLabelledBy: 'run-empty-workspace-title',
          }}
        >
          <h2 id="run-empty-workspace-title">No active Run</h2>
          <p>Start a Run from Play, or direct-play one of your Wars from the War Editor.</p>
          <ChromeNavButton unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
            to={PLAY_RUN_SELECTOR_HREF}
          >
            Back to Run
          </ChromeNavButton>
        </RunSceneViewport>
      )
      : shellRun.phase === 'sectio' && shellRun.sectio
            ? (
              <SectioPanel
                run={shellRun}
                view={view}
                alienatioWorkspace={alienatioWorkspace!}
                expunctioWorkspace={expunctioWorkspace!}
                adlectioAnnouncement={adlectioAnnouncement}
                onAdlect={beginAdlectio}
              />
            )
            // Explicit, because the branch below is an else-fallthrough: any phase without
            // its own case silently renders Victory.
            : shellRun.phase === 'bona-vacantia' && shellRun.vacantia
              ? bonaTarget
                ? (
                  <RunBonaVacantiaTarget
                    run={shellRun}
                    lipsanonId={bonaTarget.lipsanonId}
                    selectedUnitId={bonaTarget.unitId}
                    filters={armyFilters}
                    onFiltersChange={(filters) => setArmyFilterState({ scope: filterScope, filters })}
                    onSelectUnit={(unitId) => navigateBonaTarget(bonaTarget.lipsanonId, unitId)}
                    onBackToUnits={() => navigateBonaTarget(bonaTarget.lipsanonId)}
                    onBackToOffers={() => navigateRunView('primary')}
                    onConfirm={(unitId) => replace(takeVacantiaLipsanon(
                      shellRun,
                      bonaTarget.lipsanonId,
                      unitId,
                    ))}
                  />
                )
                : <RunBonaVacantia run={shellRun} replace={replace} onTargetLipsanon={navigateBonaTarget} />
              : shellRun.phase === 'aftermath' && shellRun.aftermath
                ? <AftermathPanel run={shellRun} />
                : <VictoryPanel run={shellRun} />);
  const battlefieldActive = !craftWorkspace
    && (shellRun?.phase === 'deployment' || shellRun?.phase === 'battle');
  const runSurfacePhase = sceneSnapshot.phase;
  const sceneInstance = battlefieldActive && shellRun
    ? `${shellRun.id}:battlefield:${shellRun.battleIndex}:${runSceneWorkspaceIdentity(sceneSnapshot.workspace)}`
    : `${shellRun?.id ?? 'none'}:${runSurfacePhase}:${runSceneWorkspaceIdentity(sceneSnapshot.workspace)}`;
  const visibleLipsanonIds = shellRun
    ? bonaTarget
      ? [...shellRun.lipsana, bonaTarget.lipsanonId]
      : shellRun.lipsana
    : [];
  const form = createRunForm({
    run: shellRun,
    routePath,
    routeSearch,
    strategikonOpen,
    titleBarContent: shellRun ? (
      <RunTitleBarStatus run={shellRun} path={routePath} search={routeSearch} view={view} />
    ) : null,
    lipsanonIds: visibleLipsanonIds,
    inspectionWorkspace,
    className: `run-screen${shellRun && (visibleLipsanonCount(shellRun) || bonaTarget) ? ' has-lipsana' : ''}`,
  });
  const formSurface = battlefieldActive && shellRun
    ? (
      <RunBattlefieldPanel
        form={form}
        run={shellRun}
        routePath={routePath}
        routeSearch={routeSearch}
        view={view}
        onNavigate={navigateRunView}
      />
    )
    : (
      <SkirmishViewStoreProvider>
        {form.add(runActivity({
          id: sceneInstance,
          testId: 'run-screen',
          controlsContent: shellRun ? (
            <RunMetaControls
              run={shellRun}
              view={view}
              onNavigate={navigateRunView}
              showAbandon={shellRun.phase !== 'victory'}
            />
          ) : null,
          hudProps: { enableGlobalShortcuts: false },
          persistentViewportArtwork: persistentSectioScene,
          viewport: {
            className: 'run-phase-workspace',
            primaryClassName: 'run-phase-primary',
            primary: workspace,
            ariaLabel: 'Run workspace',
            sceneInstance: '/run',
          },
          readyToCompose: hydrated,
        }))}
      </SkirmishViewStoreProvider>
    );
  return (
    <RunPresentationSceneSlot className="run-scene-slot" sceneInstance={sceneInstance}>
      {cardFlightElement}
      {formSurface}
    </RunPresentationSceneSlot>
  );
}
