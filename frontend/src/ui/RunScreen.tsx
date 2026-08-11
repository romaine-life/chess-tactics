import { Children, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import type { RunBattleTransformSink, RunBattleUndoAdapter } from '../game/store';
import { defaultFacingForSide } from '../core/pieces';
import { manubiaeEarnedBy } from '../run/manubiae';
import { levelParTurns, speedBonusClockMs, speedBonusRemainingMs, speedBonusTenths } from '../core/speedBonus';
import type { GameState, Piece, Vec } from '../core/types';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { InnerChromeBox } from './shared/ChromeBox';
import { ChromeDividedGridRow, DividedInnerChromeBox } from './shared/ChromeDividedGrid';
import { ChromeVerbRow, verbColumns, type ChromeVerb } from './shared/ChromeVerbRow';
import { CHROME_LEAF_FILL_SURFACE, CHROME_STRUCTURAL_FILL_ROLE } from './shared/chromeSurfacePolicy';
import { TitleBarStatus } from './shell/TitleBarControls';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { TitleRoute, type TitleRouteSegment } from './shell/TitleRoute';
import { RunIdentityChip, RunTitleBarMeasures } from './RunTitleBarChips';
import { BattleClockChip } from './BattleClockChip';
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
  ATARAXIA_BY_TIER,
  GOLD_SCALE,
  LIPSANON_BY_ID,
  performAdlectio,
  buyPaidLipsanon,
  canRerollDeployment,
  canRestartBattle,
  canLeaveSectio,
  canUndoRunBattleMove,
  captureRunBattleUndo,
  chargeRunBattleUndoCheckpoint,
  closeBattle,
  deditioGoldTenths,
  hasLipsanon,
  leaveAftermath,
  leaveSectio,
  markReservistDeployed,
  observeRunUnitDeath,
  payRunManubium,
  prepareDeployment,
  rerollDeployment,
  resetSectio,
  RUN_BATTLE_DEPLOYMENT_REROLL_COST_TENTHS,
  RUN_BATTLE_RETRY_COST_TENTHS,
  RUN_CARD_BY_ID,
  restartBattle,
  runBattleActivityId,
  runCardUnitIds,
  performExpunctio,
  sectioAdlectioSpent,
  sectioHasChanges,
  runCardDefinition,
  takeCommendatioKing,
  takeVacantiaCard,
  takeVacantiaLipsanon,
  undoRunBattleMove,
  type RunBattleNotice,
  type RunCardOffer,
  type RunDocument,
  type RunPhase,
  type LipsanonId,
} from '../run/model';
import {
  arrangedCardAtCell,
  arrangedCardPlaceableCells,
  arrangedDeploymentCanBegin,
  arrangedDeploymentCards,
  arrangedDeploymentProgress,
  beginArrangedBattle,
  beginDeploymentDeal,
  cardTurn,
  completeDeploymentDeal,
  deploymentInteractionStage,
  deploymentOptions,
  gameForRunDeployment,
  levelWithRunDeployment,
  openDeploymentBandCells,
  nextArrangedCardToPlace,
  normalReservistCell,
  placeableCardRotations,
  steppedArrangedCard,
  turnedCardPlacement,
  placeArrangedDeploymentCard,
  resolveForcedDeploymentChoices,
  removeArrangedDeploymentCard,
  selectedDeploymentLayout,
  type RunDeploymentInteractionStage,
  type RunFormationRotation,
} from '../run/deployment';
import { useActiveRun } from '../run/store';
import {
  clearMatch,
  loadReviewableRunBattleMatch,
} from '../game/matchPersistence';
import { SkirmishViewStoreProvider } from '../game/SkirmishViewStoreContext';
import { runLinkTargetMismatch } from '../run/craft';
import { useRunCraft } from './useRunCraft';
import { clearCraftedBattleResult, craftedBattleResultFor } from './craftedRunLanding';
import { LipsanonIcon, LipsanaWorkspace } from './Lipsana';
import { RunCommendatio } from './RunCommendatio';
import { RunBonaVacantia } from './RunBonaVacantia';
import { useLipsanonFlight } from './runLipsanonFlightView';
import { RunGoldAmount } from './RunResources';
import {
  isSectioWorkspaceView,
  RUN_SECTIO_CONTROL_ICON_ROLE,
  RUN_WORKSPACE_VIEW_LABEL,
  SECTIO_WORKSPACE_VIEWS,
  runArmyUnitHref,
  runWorkspaceHref,
  runWorkspaceTitleSegment,
  type RunSectioControl,
  type RunSelfInspectionView,
  type RunWorkspaceView,
} from './RunSelfInspection';
import { installedUiMedia } from './installedUiMedia';
import {
  DEFAULT_RUN_ARMY_FILTERS,
  RunArmyWorkspace,
  runUnitIdentifier,
  runUnitRosterLabel,
  type RunArmyFilters,
} from './RunArmyWorkspace';
import { RunCard } from './RunCard';
import { useRunCardBackMediaUrl } from './RunCardBack';
import { RunCardPile } from './RunCardPile';
import { RunCardRow } from './RunCardRow';
import { RunBattlePreview } from './RunBattlePreview';
import { RunDeploymentCardStack, RunDeploymentDeckDeal } from './RunDeploymentCardStack';
import { RunArrangementCard, RunArrangementSteppers } from './RunArrangementHand';
import { RunFormationGroupPaint } from './RunFormationGroupPaint';
import {
  RUN_FORMATION_LIVERY_COUNT,
  deploymentLayoutInHand,
  formationBlockSquares,
  seatedFormationsBySquare,
} from './runDeploymentGrouping';
import { RunDeploymentRerollButton } from './RunDeploymentRerollButton';
import { RunExpunctioWorkspace } from './RunExpunctioWorkspace';
import { runCardName } from '../run/cardNames';
import {
  useRunCardFlights,
} from './runCardFlightView';
import { isStrategikonPath, strategikonRouteCrumbs } from './strategikonRoute';
import { presentedRunAddress } from './runRoute';
import { createRunForm, runActivity, type RunForm } from './RunForm';
import { ChromeButton, ChromeNavButton } from './shared/ChromeButton';
import { KitScroll } from './KitScroll';
import { PredrawnMoveHighlightPaint } from '../render/PredrawnMoveHighlightPaint';
import { useFormationKeys, type FormationTurnDirection } from './formationKeys';
import type { SkirmishBoardSurfaceState, UnitDepartureRequest } from '../render/SkirmishBoard';

type RunScreenView = RunWorkspaceView;

function visibleLipsanonCount(run: RunDocument): number {
  return run.lipsana.filter((lipsanonId) => Boolean(LIPSANON_BY_ID[lipsanonId])).length;
}

/**
 * Phases whose workspace paints an installed opaque raster over the whole environment
 * column, so the shell's battlefield backdrop reaches no pixel behind them and is dropped
 * (`.skirmish-screen.run-workspace-owns-environment`). Both mount the `run-victory`
 * workspace background at cover fit over the shell's own opaque surface fill.
 *
 * This is a claim about pixels, so re-measure it rather than extend it by eye: paint
 * `.skirmish-screen::before` a flat colour on the live phase and count the pixels that
 * change. A phase that yields its fill to a retained scene — Sectio's room, which hides
 * `.shell-workspace-fill` — does NOT qualify, and keeps the backdrop.
 */
export function runWorkspaceOwnsEnvironment(phase: RunPhase | undefined): boolean {
  return phase === 'victory' || phase === 'aftermath';
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
  // Commendatio capitalises from its own id, so it needs no case of its own here.
}

export function runTitleBarRouteSegments(
  run: RunDocument,
  path: string,
  search: string,
  requestedView: RunScreenView,
): readonly TitleRouteSegment[] {
  const runRootHref = runWorkspaceHref(`/run${search}`, 'primary');
  const phaseName = run.phase === 'aftermath' && requestedView === 'battle-review'
    ? 'Battle'
    : runPhaseRouteName(run);
  const segments: TitleRouteSegment[] = [{ label: phaseName, to: runRootHref }];
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

function RunTitleBarStatus({ run, path, search, view, battlefieldMounted }: {
  run: RunDocument;
  path: string;
  search: string;
  view: RunScreenView;
  /** Whether the battlefield activity — and so its session store — is actually mounted. */
  battlefieldMounted: boolean;
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
        {/* A Run Battle is a Battle: it gets the same clock every other play surface shows,
            from the same chip. The phase alone is NOT the condition. The chip reads the
            session store it is portalled out of, and only the battlefield activity provides
            one — a Run bar rendered beside any other workspace (a craft still landing, most
            visibly) would fall through to the module default store and report a clock
            belonging to no Battle on screen. So it is seated exactly while the battlefield
            it is timing is. */}
        {battlefieldMounted && run.phase === 'battle'
          ? <BattleClockChip fillSurface={CHROME_LEAF_FILL_SURFACE} />
          : null}
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
    // Leave in the same tick the Run is cleared. `abandon()` drops it from this browser before
    // it suspends, so nothing here waits on the account's DELETE — and holding for it parked the
    // player on the empty "No active Run" workspace for the length of a round trip, which is a
    // dead end nobody chose. The DELETE is ordered inside the save chain, so a Run started from
    // the picker in the next second still lands behind it.
    const abandoned = abandon();
    clearMatch();
    navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
    await abandoned;
  }, [abandon, abandoning, ask, run.war.name]);
  return { abandonDialog: dialog, abandoning, requestAbandon };
}

/**
 * The padlock laid on a Sectio offer the visit's one admission has closed. The installed kit
 * lock, through the same `app-ui` role the Level Editor's own lock resolves and the same door
 * every other mark on this screen uses: this is the ordinary "you cannot have this" glyph, and
 * both a padlock drawn for one row and a second way of reaching this one would be a bespoke
 * parallel (ADR-0059).
 */
const RUN_SECTIO_LOCK_ICON_ROLE = 'ui-kit-icons-lock-png';

/** The installed full-screen Sectio scene, or null when the Sectio has no scene art. */
function useInstalledSectioScene(): ReactElement | null {
  return useMemo(() => {
    const installed = installedRunSectioWrap();
    return installed?.kind === 'screen'
      ? <img className="run-sectio-scene-artwork" src={installed.src} alt="" draggable={false} />
      : null;
  }, []);
}

/**
 * A Sectio control's mark, seated ahead of its word.
 *
 * `.app-header-button` is already an inline flex row with its own gap, so the mark takes a fixed
 * seat and the label follows it — every button in the rail then starts its text on the same line
 * whatever glyph it wears, which is what makes the column scannable rather than ragged.
 */
function RunControlMark({ control }: { control: RunSectioControl }): ReactElement {
  return (
    <span className="run-control-mark" aria-hidden="true">
      <img src={installedUiMedia(RUN_SECTIO_CONTROL_ICON_ROLE[control])} alt="" draggable={false} />
    </span>
  );
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
  return (
    <>
      {abandonDialog}
      <section
        className="run-meta-controls"
        data-run-controls-scroll={sectio ? 'scroll' : 'static'}
        aria-label="Run controls"
      >
        {sectio ? (
          <div className="skirmish-view-group">
            <span className="skirmish-eyebrow">Sectio views</span>
            <div className="run-meta-navigation">
              <ChromeButton unit="inner-text-button"
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                data-testid="run-view-primary"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === 'primary' && 'active')}
                style={{ ['--chrome-leaf-surface-index' as string]: 0 } as CSSProperties}
                aria-pressed={view === 'primary'}
                onClick={() => onNavigate('primary')}
              >
                <RunControlMark control="primary" />
                Sectio
              </ChromeButton>
              {SECTIO_WORKSPACE_VIEWS.map((candidate, index) => (
                <ChromeButton unit="inner-text-button"
                  key={candidate}
                  data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                  data-testid={`run-view-${candidate}`}
                  className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === candidate && 'active')}
                  style={{ ['--chrome-leaf-surface-index' as string]: index + 1 } as CSSProperties}
                  aria-pressed={view === candidate}
                  onClick={() => onNavigate(candidate)}
                >
                  <RunControlMark control={candidate} />
                  {RUN_WORKSPACE_VIEW_LABEL[candidate]}
                </ChromeButton>
              ))}
            </div>
          </div>
        ) : null}
        {sectio ? (
          <div className="skirmish-view-group">
            <span className="skirmish-eyebrow">Sectio</span>
            <div className="run-meta-navigation">
              <ChromeButton unit="inner-text-button"
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
                style={{ ['--chrome-leaf-surface-index' as string]: SECTIO_WORKSPACE_VIEWS.length + 1 } as CSSProperties}
                disabled={!sectioHasChanges(run)}
                data-testid="reset-run-sectio"
                onClick={() => {
                  replace(resetSectio(run));
                  onNavigate('primary');
                }}
              >
                <RunControlMark control="reset-sectio" />
                Reset Sectio
              </ChromeButton>
              <ChromeButton unit="inner-text-button"
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                style={{ ['--chrome-leaf-surface-index' as string]: SECTIO_WORKSPACE_VIEWS.length + 2 } as CSSProperties}
                disabled={!canLeave}
                data-testid="continue-run-sectio"
                title={!canLeave && continueHint ? continueHint : undefined}
                onClick={() => {
                  replace(prepareDeployment(leaveSectio(run)));
                  onNavigate('primary');
                }}
              >
                <RunControlMark control="continue" />
                Continue to next Battle
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
                style={{ ['--chrome-leaf-surface-index' as string]: SECTIO_WORKSPACE_VIEWS.length + 3 } as CSSProperties}
                data-testid="abandon-run"
                disabled={abandoning}
                onClick={() => { void requestAbandon(); }}
              >
                <RunControlMark control="abandon" />
                {abandoning ? 'Abandoning…' : 'Abandon Run'}
              </ChromeButton>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

function ArrangedDeploymentControls({
  run,
  stage,
  selectedCardId,
  availableRotations,
  dealProgress,
  onDealProgress,
  onStepCard,
  onSelectCard,
  onTurn,
  onRemove,
  onBeginBattle,
  onDealComplete,
  departing,
}: {
  run: RunDocument;
  stage: RunDeploymentInteractionStage;
  selectedCardId: string | null;
  availableRotations: ReadonlySet<RunFormationRotation>;
  dealProgress: number;
  onDealProgress: (count: number) => void;
  onStepCard: (step: 1 | -1) => void;
  onSelectCard: (cardId: string) => void;
  onTurn: (direction: FormationTurnDirection) => void;
  onRemove: () => void;
  onBeginBattle: () => void;
  onDealComplete: () => void;
  departing: boolean;
}): ReactElement {
  const { abandonDialog, abandoning, requestAbandon } = useRunAbandon(run);
  const cards = arrangedDeploymentCards(run);
  const selected = cards.find(({ card }) => card.id === selectedCardId) ?? null;
  const canBegin = arrangedDeploymentCanBegin(run);
  // The one count of how much of the hand is down, read from the Run rather than recounted here.
  // It answers before the draw too — the hand's size is settled when Deployment is prepared —
  // which is what lets the panel below be dressed rather than built as the cards land.
  const progress = arrangedDeploymentProgress(run);
  // The hand is in the player's hands. Until then every control is present but answers nothing.
  const arranging = stage === 'arrange';
  const turnable = arranging && Boolean(selected?.admitted);
  return (
    <>
      {abandonDialog}
      <section
        className="run-meta-controls run-deployment-controls run-arrangement-controls"
        aria-label="Formation arrangement controls"
        aria-busy={departing || undefined}
        inert={departing || undefined}
      >
        {/* The card is the subject of the whole panel, so it is PINNED above the rail and only
            the controls beneath it move. ADR-0030: the panel itself never scrolls — the house
            rail is a drawn element that is always present, so nothing here may fall back to the
            browser's own bar.

            The dealt stack takes the SAME pinned seat, because it is the same card one moment
            earlier. It used to land inside the rail at a third of this width, so the deal flew
            to a box the card never occupied and the hand jumped across the panel and doubled in
            size the instant dealing finished. One seat, and the deal ends where the card lives. */}
        {stage === 'arrange' ? (
          <RunArrangementCard run={run} cards={cards} selectedCardId={selectedCardId} />
        ) : null}
        {stage === 'await-deal' || stage === 'dealing' ? (
          <RunDeploymentCardStack
            run={run}
            dealProgress={dealProgress}
            onDealProgress={onDealProgress}
            onDealComplete={onDealComplete}
            onRevealComplete={() => undefined}
            onDiscardComplete={() => undefined}
          />
        ) : null}
        <KitScroll className="run-arrangement-scroll">
        {/* The panel is DRESSED from the moment Deployment opens and never gains a control: the
            hand's size, its rotations and its Battle are all known before the draw, so every
            group below is the arranging panel exactly, disabled until the cards are in hand.
            Building it as the cards landed re-laid the whole panel under the player at the one
            moment they were watching it, and made the arrival look like a different screen. */}
        <>
            <RunArrangementSteppers
              cards={cards}
              selectedCardId={selectedCardId}
              onStep={onStepCard}
              onSelect={onSelectCard}
              disabled={!arranging}
            />
            {/* Never conditional on there being a formation in hand. A group that comes and goes
                as the hand is stepped moves everything under it, Remove included. */}
            <div className="skirmish-view-group run-deployment-control" data-testid="arrangement-rotation-control">
                <span className="skirmish-eyebrow">Rotation</span>
                {/* Two turns, not four absolute angles. The formation on the board already shows
                    which way it faces, so the control is the VERB — and it is the same verb the
                    keys and the secondary click run, wearing the keys that run it. */}
                <div className="run-arrangement-rotations" role="group" aria-label="Turn the formation">
                  <ChromeButton
                    unit="inner-text-button"
                    data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'run-arrangement-turn')}
                    style={{ ['--chrome-leaf-surface-index' as string]: 2 } as CSSProperties}
                    disabled={!turnable || departing || availableRotations.size < 2}
                    onClick={() => onTurn('counter-clockwise')}
                    aria-label="Turn the formation left"
                  >
                    <kbd className="skirmish-grid-cap">Q</kbd>
                    <span className="skirmish-grid-label">Left</span>
                  </ChromeButton>
                  <ChromeButton
                    unit="inner-text-button"
                    data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'run-arrangement-turn')}
                    style={{ ['--chrome-leaf-surface-index' as string]: 3 } as CSSProperties}
                    disabled={!turnable || departing || availableRotations.size < 2}
                    onClick={() => onTurn('clockwise')}
                    aria-label="Turn the formation right"
                  >
                    <kbd className="skirmish-grid-cap">E</kbd>
                    <span className="skirmish-grid-label">Right</span>
                  </ChromeButton>
                </div>
                {/* The instruction the hand is about to answer to. It reads the same before the
                    draw as it does the moment the first card is in hand, so the line does not
                    rewrite itself as the cards land. */}
                <p className="skirmish-grid-hint">
                  {selected?.placed
                    ? 'Point somewhere else on the battlefield to move this formation, or remove it.'
                    : 'Point at the battlefield and click to place this formation.'}
                  {availableRotations.size > 1 ? ' Right-click turns it too.' : ''}
                </p>
                {/* Always here, greyed until there is something to remove: a control that
                    appears and disappears re-lays the panel under the player's hand. */}
                <ChromeButton
                  unit="inner-text-button"
                  data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                  className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
                  style={{ ['--chrome-leaf-surface-index' as string]: 4 } as CSSProperties}
                  data-testid="arrangement-remove-formation"
                  disabled={!arranging || departing || !selected?.placed}
                  onClick={onRemove}
                >
                  Remove formation
                </ChromeButton>
              </div>
        </>

        {/* Abandon Run scrolls with everything else. Pinning it took height from the controls
            the player is actually using, and it is not worth more than them — it is the one
            action here nobody is reaching for in a hurry. */}
        <div className="skirmish-view-group run-meta-abandon">
          <span className="skirmish-eyebrow">Run</span>
          <ChromeButton
            unit="inner-text-button"
            data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'danger')}
            style={{ ['--chrome-leaf-surface-index' as string]: 6 } as CSSProperties}
            data-testid="abandon-run"
            disabled={abandoning || departing}
            onClick={() => { void requestAbandon(); }}
          >
            {/* The same control as the Sectio rail's, so it wears the same mark: one button
                cannot read two ways because it is reached from two screens. */}
            <RunControlMark control="abandon" />
            {abandoning ? 'Abandoning…' : 'Abandon Run'}
          </ChromeButton>
        </div>
        </KitScroll>
        {/* The panel's one key that leaves the screen, so it wears its cap like the rest: Space
            confirms the arrangement and goes.

            It is PINNED to the foot rather than sitting last in the rail. Below the card, the
            steppers, the turns and Remove there was no height left for it, so the primary action
            of the whole screen was under the fold — the player finished arranging and had nothing
            to press. Pinned, it costs the rail a row and is always reachable.

            It also STATES the arrangement rather than sitting beside a line that states it. The
            count used to be its own row under the card, which read as the thing to press once it
            said the hand was down, and was not pressable. The sentence a player wants to act on
            and the control that acts are one control. It is always rendered, changing state
            rather than appearing, so completion never re-lays the panel under a moving hand. */}
        <div className="skirmish-view-group run-arrangement-begin-group">
            <ChromeButton
              unit="inner-text-button"
              data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
              className={chromeUnitClassNames(
                'inner-text-button', 'app-header-button', 'run-arrangement-begin', canBegin && 'active',
              )}
              style={{ ['--chrome-leaf-surface-index' as string]: 5 } as CSSProperties}
              data-testid="arrangement-begin-battle"
              disabled={departing || !canBegin}
              onClick={onBeginBattle}
            >
              <span className="run-arrangement-begin-go">
                <kbd className="skirmish-grid-cap">Space</kbd>
                <span className="skirmish-grid-label">Begin Battle</span>
              </span>
              <span
                className={`run-arrangement-progress${progress.complete ? ' is-complete' : ''}`}
                data-testid="arrangement-progress"
                data-complete={progress.complete ? 'true' : 'false'}
                aria-live="polite"
              >
                <span className="run-arrangement-progress-mark" aria-hidden="true">
                  {progress.complete ? '✓' : '·'}
                </span>
                {progress.complete
                  ? `All ${progress.total} on the board`
                  : `${progress.placed} of ${progress.total} on the board`}
              </span>
            </ChromeButton>
            <p className="skirmish-grid-hint">
              {canBegin
                ? 'Any formation left off the board sits out this Battle.'
                : 'Place His Grace before beginning Battle.'}
            </p>
        </div>
      </section>
    </>
  );
}

function useRunDeploymentPresentation({
  run,
  departureActive,
  routeSearch,
}: {
  run: RunDocument;
  departureActive: boolean;
  routeSearch: string;
}): RunDeploymentPresentation | null {
  const replace = useActiveRun((state) => state.replace);
  const level = run.war.battles[run.battleIndex].level;
  const prepared = useMemo(
    () => resolveForcedDeploymentChoices(run.deployment ? run : prepareDeployment(run), level),
    [level, run],
  );
  const options = useMemo(() => deploymentOptions(prepared, level), [level, prepared]);
  const stage = deploymentInteractionStage(prepared, options);
  const [dealProgress, setDealProgress] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [arrangementRotation, setArrangementRotation] = useState<RunFormationRotation>(0);
  // Where the mouse is. ONLY the pointer may clear it — pointerenter does not fire again for a
  // pointer that never moved, so any other reset leaves the formation invisible until the player
  // jiggles the mouse onto a different square. Changing card, turn, or placement all keep it, so
  // whatever is now in hand appears under the cursor at once.
  const [pointedArrangementCell, setPointedArrangementCell] = useState<string | null>(null);
  // The box the formation is being turned in. Set only BY a turn and dropped the moment the
  // pointer moves, so the mouse always says where the formation goes and a turn only says which
  // way it faces there.
  const [heldArrangementAnchor, setHeldArrangementAnchor] = useState<string | null>(null);
  // The formation the player has PICKED UP. It comes off the board whole — its units and its plot
  // both — so a formation being moved looks exactly like one being placed for the first time.
  // Drawing it at its old seats as well as on the cursor painted the same formation twice over,
  // and the player could not tell which of the two they were deciding about.
  //
  // Held is a gesture, not a selection: placing the last card of a hand leaves it selected, and a
  // card resting on the board must stay on the board. Nothing is written to the Run for it, so a
  // player who picks a formation up and wanders off has not lost the seat it came from.
  const [heldCardId, setHeldCardId] = useState<string | null>(null);
  const arrangementCards = useMemo(() => arrangedDeploymentCards(prepared), [prepared]);
  const selectedArrangementCard = arrangementCards.find(({ card }) => card.id === selectedCardId) ?? null;
  const heldFormationCardId = heldCardId === selectedCardId ? heldCardId : null;
  // Which square belongs to which seated formation. A projection of the card's seats and the
  // committed placements — nothing is persisted for it, so no save version moves. The formation in
  // hand is not among them: it is not on the ground to be wrapped.
  const seatedFormationSquares = useMemo(
    () => seatedFormationsBySquare(prepared, heldFormationCardId),
    [heldFormationCardId, prepared],
  );
  // Which SEATED formation the pointer is over — the whole card, not the square. Read off the
  // square the pointer already reports rather than tracked separately: a second enter/leave pair
  // on the same element is a second source of truth for where the mouse is, and the one that is
  // already there is the one the placement gesture trusts.
  const hoveredFormationCardId = pointedArrangementCell
    ? seatedFormationSquares.get(pointedArrangementCell)?.cardId ?? null
    : null;
  // The card the player is HOLDING, if any. A card that has not been placed is in hand by
  // definition; a card on the board is in hand only once it has been picked up. Everything the
  // carry gesture paints — the band, the reachable squares, the turns, the formation on the
  // cursor — belongs to a card in hand, so a formation resting on the board is not also
  // following the mouse around (ADR-0526: the band is painted whenever a formation is in hand).
  const cardInHandId = selectedArrangementCard && (!selectedArrangementCard.placed || heldFormationCardId)
    ? selectedCardId
    : null;
  // Where deployment is allowed at all. A property of the level and of what is already seated,
  // so it holds still while the carried formation is turned — turning a formation in one corner
  // must not put out a square at the other end of the band.
  const arrangementBandCells = useMemo(() => new Set(
    (cardInHandId ? openDeploymentBandCells(prepared, level, cardInHandId) : [])
      .map((cell) => `${cell.x},${cell.y}`),
  ), [cardInHandId, level, prepared]);
  // Squares held by a formation ALREADY on the board. Clicking one picks that formation up rather
  // than trying to drop the held one on top of it — including the card just placed, which is
  // still selected and is standing on the ground like any other. Only the formation actually in
  // hand is missing from this: it is off the board, so its old squares are open ground.
  const arrangementPlacedCells = useMemo(() => {
    const seats = new Map<string, string>();
    for (const { card, placed } of arrangementCards) {
      if (!placed || card.id === heldFormationCardId) continue;
      for (const unitId of runCardUnitIds(card)) {
        const seat = prepared.deployment?.placements?.[unitId];
        if (seat) seats.set(seat, card.id);
      }
    }
    return seats;
  }, [arrangementCards, heldFormationCardId, prepared.deployment?.placements]);
  // The squares the player may point at — every square the formation could COVER at this turn,
  // not the squares its bounding-box corner could sit on. Aiming at a unit is the whole gesture.
  const arrangementPlaceableCells = useMemo(() => new Set(
    (cardInHandId
      ? arrangedCardPlaceableCells(prepared, level, cardInHandId, arrangementRotation)
      : []).map((cell) => `${cell.x},${cell.y}`),
  ), [arrangementRotation, cardInHandId, level, prepared]);
  // A rotation is offered only when it both fits the band and looks different from a turn
  // already on the rail. Redundant turns are skipped the same way unplaceable ones are, so
  // the control never presents two buttons that produce the same board. The rail and the
  // secondary-click cycle read this one ordered list, so both walk the same turns.
  const availableArrangementRotationList = useMemo<readonly RunFormationRotation[]>(() => (
    cardInHandId ? placeableCardRotations(prepared, level, cardInHandId) : []
  ), [cardInHandId, level, prepared]);
  const availableArrangementRotations = useMemo(
    () => new Set<RunFormationRotation>(availableArrangementRotationList),
    [availableArrangementRotationList],
  );
  const asCell = (encoded: string | null): Vec | null => {
    const parts = encoded?.split(',').map(Number);
    return parts && parts.length === 2 && parts.every((value) => Number.isFinite(value))
      ? { x: parts[0], y: parts[1] }
      : null;
  };
  const pointedCell = useMemo(() => asCell(pointedArrangementCell), [pointedArrangementCell]);
  const heldAnchor = useMemo(() => asCell(heldArrangementAnchor), [heldArrangementAnchor]);
  // The formation is carried on the cursor: the pointed square resolves to a whole seating, and
  // the player never has to work out where a corner would have to go. Once a turn has held a box
  // the formation stays in it and spins there, until the pointer moves and picks a new one.
  const pointedArrangementOption = useMemo(() => (
    cardInHandId
      ? turnedCardPlacement(prepared, level, cardInHandId, arrangementRotation, heldAnchor, pointedCell)
      : null
  ), [arrangementRotation, cardInHandId, heldAnchor, level, pointedCell, prepared]);
  const arrangementFootprint = useMemo(() => new Set(
    Object.values(pointedArrangementOption?.placements ?? {}).map((cell) => `${cell.x},${cell.y}`),
  ), [pointedArrangementOption]);
  // The block the CARRIED formation makes, solved exactly like a seated one. Since ADR-0533 the
  // formation on the cursor and the formation on the ground are both a plan drawn at the same
  // strength, so a mark that says "this is one block" has to be on both: showing it only once the
  // formation is let go would say the block is made by placing rather than by the card.
  const carriedFormationBlock = useMemo(() => formationBlockSquares(
    Object.values(pointedArrangementOption?.placements ?? {}),
  ), [pointedArrangementOption]);
  // The livery the carried block will keep once it is seated, so the colour does not change under
  // the player's hand at the moment they commit it.
  const carriedGroupIndex = arrangementCards.findIndex(({ card }) => card.id === selectedCardId);
  const arrangementPreviewPieces = useMemo<readonly Piece[]>(() => {
    if (!pointedArrangementOption) return [];
    const facing = defaultFacingForSide('player');
    return Object.entries(pointedArrangementOption.placements).flatMap(([unitId, cell]) => {
      const unit = prepared.army.find((candidate) => candidate.id === unitId);
      if (!unit) return [];
      return [{
        id: `deployment-preview:${unit.id}`,
        name: unit.name,
        type: unit.type,
        side: 'player' as const,
        ...cell,
        alive: true,
        facing,
        startX: cell.x,
        startY: cell.y,
        ...(unit.type === 'pawn' ? { pawnForward: facing } : {}),
      }];
    });
  }, [pointedArrangementOption, prepared.army]);
  const seatedLayout = selectedDeploymentLayout(prepared, options);
  // The board as it stands with the formation in hand taken off it — see deploymentLayoutInHand.
  const layout = useMemo(() => {
    const held = heldFormationCardId
      ? arrangementCards.find(({ card }) => card.id === heldFormationCardId)?.card
      : null;
    return deploymentLayoutInHand(seatedLayout, held ? runCardUnitIds(held) : []);
  }, [arrangementCards, heldFormationCardId, seatedLayout]);
  const deploymentGame = useMemo(
    () => gameForRunDeployment(prepared, level, layout, true),
    [layout, level, prepared],
  );
  // A seated formation is still a PLAN: it can be taken back, turned, or left off the board
  // entirely, so it is drawn at the same strength as the formation on the cursor and spends no
  // entrance. Every one of these units arrives together when Begin Battle promotes the plan into
  // an army — the seating is a decision, the arrival is the event. The board keys the plan by
  // piece id, which is the Run unit id these placements are written under (setup.ts runUnitId).
  const plannedPieceIds = useMemo(
    () => new Set(Object.keys(layout.placements)),
    [layout.placements],
  );
  const deploymentSurfaceState = useMemo<SkirmishBoardSurfaceState>(() => ({
    game: deploymentGame,
    seed: prepared.deployment?.seed ?? prepared.seed,
    viewKey: runBattleActivityId(prepared.id, prepared.battleIndex),
    previewPieces: arrangementPreviewPieces,
    plannedPieceIds,
  }), [arrangementPreviewPieces, deploymentGame, plannedPieceIds, prepared.battleIndex, prepared.deployment?.seed, prepared.id, prepared.seed]);

  useEffect(() => {
    if (prepared !== run && prepared.phase === 'deployment') replace(prepared);
  }, [prepared, replace, run]);

  useEffect(() => {
    if (prepared.deployment?.stage === 'awaiting-deal') setDealProgress(0);
  }, [prepared.deployment?.battleIndex, prepared.deployment?.stage]);

  useEffect(() => {
    if (stage !== 'arrange') return;
    const current = arrangementCards.find(({ card, admitted }) => card.id === selectedCardId && admitted);
    if (current) return;
    setSelectedCardId(arrangementCards.find(({ admitted, placed }) => admitted && !placed)?.card.id
      ?? arrangementCards.find(({ admitted }) => admitted)?.card.id
      ?? null);
    // Falling back to a card because the last one went away is not the player picking it up, so a
    // formation the fallback lands on stays where it is standing.
    setHeldCardId(null);
    setArrangementRotation(0);
    setHeldArrangementAnchor(null);
  }, [arrangementCards, selectedCardId, stage]);

  useEffect(() => {
    if (availableArrangementRotations.has(arrangementRotation)) return;
    setArrangementRotation(availableArrangementRotations.values().next().value ?? 0);
    setHeldArrangementAnchor(null);
  }, [arrangementRotation, availableArrangementRotations]);

  const beginDeal = useCallback(() => {
    if (departureActive) return;
    const latest = useActiveRun.getState().run;
    if (latest?.id === prepared.id && latest.phase === 'deployment') {
      replace(beginDeploymentDeal(latest));
    }
  }, [departureActive, prepared.id, replace]);
  const finishDeal = useCallback(() => {
    if (departureActive) return;
    const latest = useActiveRun.getState().run;
    if (latest?.id === prepared.id && latest.phase === 'deployment') {
      replace(completeDeploymentDeal(latest, level));
    }
  }, [departureActive, level, prepared.id, replace]);
  // The hand shows one card at a time, so the arrows and the W/S keys are the only way through
  // it. Both run this, so they cannot disagree about what "the next card" is.
  const stepArrangementCard = useCallback((step: 1 | -1) => {
    if (departureActive) return;
    const next = steppedArrangedCard(arrangementCards, selectedCardId, step);
    if (!next || next === selectedCardId) return;
    setSelectedCardId(next);
    setHeldCardId(next);
    setArrangementRotation(0);
    setHeldArrangementAnchor(null);
  }, [arrangementCards, departureActive, selectedCardId]);
  // Choosing a card is taking it in hand, wherever the choice comes from — the rail, the keys, or
  // a click on the formation itself. A card already on the board comes off it: it is the one being
  // decided about, so it cannot also be standing where it used to be.
  const selectArrangementCard = useCallback((cardId: string) => {
    setSelectedCardId(cardId);
    setHeldCardId(cardId);
    setArrangementRotation(0);
    setHeldArrangementAnchor(null);
  }, []);
  // A secondary click, the rail, and Q/E all run one verb, and cardTurn is the whole of it: which
  // way the formation faces next and which box it holds while it turns are one decision, so the
  // three gestures cannot disagree about it. They deliberately keep the pointed square — the
  // formation spins about its grip seat, on the square being aimed at, rather than vanishing until
  // the mouse is jiggled.
  const turnArrangement = useCallback((direction: FormationTurnDirection) => {
    if (departureActive || !cardInHandId) return;
    const turn = cardTurn(
      prepared,
      level,
      cardInHandId,
      arrangementRotation,
      direction,
      heldAnchor,
      pointedCell,
    );
    if (!turn) return;
    setArrangementRotation(turn.rotation);
    setHeldArrangementAnchor(turn.anchor ? `${turn.anchor.x},${turn.anchor.y}` : null);
  }, [
    arrangementRotation, cardInHandId, departureActive, heldAnchor, level, pointedCell, prepared,
  ]);
  const turnArrangementUnderCursor = useCallback(() => {
    turnArrangement('clockwise');
  }, [turnArrangement]);
  const removeArrangementCard = useCallback(() => {
    if (!selectedCardId || departureActive) return;
    const latest = useActiveRun.getState().run;
    if (latest?.id === prepared.id && latest.phase === 'deployment') {
      replace(removeArrangedDeploymentCard(latest, selectedCardId));
      // Taken off the board by the control rather than by hand, and now unplaced, so it is in
      // hand for the same reason any undealt card is. Holding it as well would say nothing more.
      setHeldCardId(null);
      setHeldArrangementAnchor(null);
    }
  }, [departureActive, prepared.id, replace, selectedCardId]);
  // Space is Begin Battle, and it runs the same guard the button's `disabled` runs: His Grace on
  // the board, on a Run still in Deployment. Reading the LATEST run rather than the render's copy
  // is what lets the key stay bound for the whole stage — see useFormationKeys on why swallowing
  // Space matters more here than leaving it to whichever board square last took focus.
  const startArrangedBattle = useCallback(() => {
    if (departureActive) return;
    const latest = useActiveRun.getState().run;
    if (latest?.id === prepared.id && latest.phase === 'deployment' && arrangedDeploymentCanBegin(latest)) {
      replace(beginArrangedBattle(latest));
    }
  }, [departureActive, prepared.id, replace]);
  // The keys are offered on exactly the terms the rail's turn buttons are, so the two cannot
  // drift apart: a dealt formation admitted and IN HAND, on a screen that is not departing. A
  // formation resting on the board has nothing to turn until it is picked up.
  const arranging = stage === 'arrange' && !departureActive;
  useFormationKeys({
    turn: arranging && selectedArrangementCard?.admitted && cardInHandId ? turnArrangement : null,
    step: arranging ? stepArrangementCard : null,
    begin: arranging ? startArrangedBattle : null,
  });

  if (run.phase !== 'deployment') return null;
  return {
    surfaceState: deploymentSurfaceState,
    screenClassName: 'run-deployment-screen',
    // While a seating is resolved the formation itself is the cursor, so the pointer is hidden
    // under it. When nothing resolves the pointer comes back, so the player is never left with
    // no cursor and no formation.
    boardClassName: pointedArrangementOption
      ? 'run-deployment-board is-carrying-formation'
      : 'run-deployment-board',
    boardAriaLabel: `${level.name} deployment battlefield`,
    unitArrivalTrack: 'drop',
    unitArrivalStartDelta: { x: 0, y: 0 },
    onArrivingUnitIdsChange: () => undefined,
    onBoardSecondaryClick: stage === 'arrange' && selectedArrangementCard?.admitted && cardInHandId
      ? turnArrangementUnderCursor
      : undefined,
    // Every square takes the pointer, not just the ones a corner could sit on. The player
    // sweeps the formation across the board and the seating resolves under it; the squares it
    // would fill light up, so what is highlighted is what will be occupied.
    renderCellOverlay: ({ cell, visualFootprintStyle }) => {
      if (stage !== 'arrange' || !selectedArrangementCard?.admitted) {
        return null;
      }
      const cellKey = `${cell.x},${cell.y}`;
      const band = arrangementBandCells.has(cellKey);
      // Clicking here places the formation. That includes the square being pointed at while a
      // box is held even when the turn has left it the empty corner — the click commits the box
      // on screen, so the square is a placement action and keeps its marker and crosshair.
      const placeable = arrangementPlaceableCells.has(cellKey)
        || (pointedArrangementOption !== null && cellKey === pointedArrangementCell);
      const filled = arrangementFootprint.has(cellKey);
      const standing = arrangementPlacedCells.get(cellKey) ?? null;
      const actionable = placeable || Boolean(standing);
      // Which formation this square belongs to, if any is seated on it. Derived from the card's
      // own seats and the committed placements — see runDeploymentGrouping on why nothing is
      // persisted for it.
      const seated = seatedFormationSquares.get(cellKey) ?? null;
      // The carried block wins the square it is over: the formation under the cursor is the one
      // the player is deciding about, and where it overlaps ground it may take, what it will look
      // like there is the useful answer.
      const carriedEdges = carriedFormationBlock.get(cellKey) ?? null;
      const block = carriedEdges
        ? { edges: carriedEdges, groupIndex: carriedGroupIndex, cardId: selectedCardId }
        : seated;
      return (
        <button
          type="button"
          className={[
            'skirmish-board-cell-hit',
            'run-deployment-cell',
            band ? 'is-band' : '',
            placeable ? 'is-placeable' : '',
            standing ? 'is-seated-formation' : '',
            filled ? 'is-move' : '',
            block ? 'has-formation-group' : '',
            carriedEdges ? 'is-formation-carried' : '',
            !carriedEdges && seated && hoveredFormationCardId === seated.cardId
              ? 'is-formation-hovered'
              : '',
          ].filter(Boolean).join(' ')}
          data-formation-card={block?.cardId ?? undefined}
          data-formation-index={block && block.groupIndex >= 0 ? block.groupIndex % RUN_FORMATION_LIVERY_COUNT : undefined}
          data-formation-edges={block?.edges.join(' ')}
          aria-label={standing
            ? `Take back the formation at ${cell.x}, ${cell.y}`
            : placeable
              ? `Place formation covering ${cell.x}, ${cell.y}`
              : `Tile ${cell.x}, ${cell.y}`}
          aria-hidden={actionable ? undefined : true}
          tabIndex={actionable ? undefined : -1}
          style={visualFootprintStyle}
          onPointerDown={(event) => {
            if (event.button === 0) event.stopPropagation();
          }}
          // Moving the pointer releases whatever box a turn was holding: the mouse says WHERE
          // the formation goes, and a turn only says which way it faces once it is there.
          onPointerEnter={() => { setPointedArrangementCell(cellKey); setHeldArrangementAnchor(null); }}
          onPointerLeave={() => setPointedArrangementCell((current) => current === cellKey ? null : current)}
          onClick={() => {
            const latest = useActiveRun.getState().run;
            if (latest?.id !== prepared.id || latest.phase !== 'deployment' || !selectedCardId) return;
            // A formation already standing here is still the player's to move. Clicking it picks
            // it up rather than reading as an attempt to drop the held one on top of it — the
            // only way to reposition a formation without removing it first. The card in hand is
            // the one exception: the document still records where it stood, but the player is
            // holding it, so its old squares take the placement instead of picking it up again.
            const standing = arrangedCardAtCell(latest, cell);
            if (standing && standing !== heldFormationCardId) {
              selectArrangementCard(standing);
              return;
            }
            // Only a formation in hand can be put down. A card resting on the board paints no
            // band, no reachable squares and nothing on the cursor, so a click on open ground
            // must not silently move it out from under a player who was shown no such offer.
            if (!cardInHandId) return;
            // Commit the box on screen, not a fresh guess from the square: after a turn the
            // formation is standing in a held box, and the pointed square may be the corner it
            // leaves empty. Re-resolving from the square would place something else.
            const seating = turnedCardPlacement(
              latest,
              level,
              cardInHandId,
              arrangementRotation,
              heldAnchor,
              cell,
            );
            if (!seating) return;
            const placed = placeArrangedDeploymentCard(
              latest,
              level,
              cardInHandId,
              arrangementRotation,
              seating.anchor,
            );
            replace(placed);
            // Put down: the formation is on the ground again, so it is no longer in hand. When
            // nothing else is left to place this card stays SELECTED, and it has to keep standing
            // on the board while it is — a released formation is not a carried one.
            setHeldCardId(null);
            // Placing finishes with a formation, so the hand moves on rather than leaving the
            // player holding one already on the board. The pointed square is KEPT: the next
            // formation appears under the cursor ready to place, so a whole hand is seated
            // without the mouse having to leave the battlefield between cards.
            const following = nextArrangedCardToPlace(placed, cardInHandId);
            if (following) {
              setSelectedCardId(following);
              setHeldCardId(following);
              setArrangementRotation(0);
            }
          }}
        >
          {/* One paint at two strengths: quiet across the squares the formation could take,
              full across the squares this seating fills. The band never goes dark, so a turn
              that finds no seating still leaves the player looking at where they may deploy. */}
          <PredrawnMoveHighlightPaint />
          {/* The seated formation's own boundary, drawn on the sides that face OFF it — the
              card's rule, on the card's geometry, at board scale. */}
          {block ? <RunFormationGroupPaint edges={block.edges} /> : null}
        </button>
      );
    },
    controlsContent: (
      <ArrangedDeploymentControls
        run={prepared}
        stage={stage}
        selectedCardId={selectedCardId}
        availableRotations={availableArrangementRotations}
        dealProgress={dealProgress}
        onDealProgress={setDealProgress}
        onStepCard={stepArrangementCard}
        onSelectCard={selectArrangementCard}
        onTurn={turnArrangement}
        onRemove={removeArrangementCard}
        onBeginBattle={startArrangedBattle}
        onDealComplete={finishDeal}
        departing={departureActive}
      />
    ),
    boardOverlay: (
      <>
        <RunDeploymentDeckDeal
          run={prepared}
          dealtCount={dealProgress}
          onBeginDeal={beginDeal}
          disabled={departureActive}
        />
      </>
    ),
  };
}

function LipsanonOffer({
  lipsanonId,
  action,
  actionLabel,
  disabled = false,
}: {
  lipsanonId: LipsanonId;
  action: () => void;
  actionLabel: ReactNode;
  disabled?: boolean;
}): ReactElement {
  const lipsanon = LIPSANON_BY_ID[lipsanonId];
  return (
    <InnerChromeBox className="run-card run-lipsanon-card">
      <header className="run-lipsanon-card-heading">
        <LipsanonIcon lipsanonId={lipsanonId} />
        <h3>{lipsanon.name}</h3>
      </header>
      <p>{lipsanon.description}</p>
      <ChromeButton unit="inner-text-button"
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
        disabled={disabled}
        onClick={action}
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
}: {
  children: ReactNode;
}): ReactElement {
  const wrap = useMemo(() => installedRunSectioWrap(), []);
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
    return <RunCardRow count={cardCount}>{children}</RunCardRow>;
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
  expunctioWorkspace,
  adlectioAnnouncement,
  onAdlect,
}: {
  run: RunDocument;
  view: RunScreenView;
  expunctioWorkspace: ReactElement;
  adlectioAnnouncement: string;
  onAdlect: (offer: RunCardOffer, source: HTMLButtonElement) => void;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const sectio = run.sectio!;
  // One card to a Sectio. The row keeps every unbought face on the table afterwards -- what you
  // turned down is part of what you decided -- and a padlock is laid on each one instead.
  const adlectioSpent = sectioAdlectioSpent(run);
  const cardBackMediaUrl = useRunCardBackMediaUrl();
  const lockMediaUrl = installedUiMedia(RUN_SECTIO_LOCK_ICON_ROLE);
  return (
    <>
      {view === 'expunctio'
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
        <section
          className="run-sectio-cards-section"
          aria-label="Cards"
        >
          <span className="sr-only" role="status" aria-live="polite">{adlectioAnnouncement}</span>
          {/*
            The answering half of the opening grant's line. Both screens deal the same faces
            with the same number printed on them; only here is that number what you hand over,
            and only here is one of them all you may have. It stands over the row for the whole
            visit, before and after the take: with the padlocks that appear on the survivors it
            reads as one statement — you get one, and this is the one you took. Nothing has to
            pop up to say so.
          */}
          <p className="run-card-row-call">They require compensation. Only one may be admitted.</p>
          <SectioCardRow>
            {sectio.cardOffers.map((offer, index) => {
              const adlected = sectio.adlectedCardOfferIds.includes(offer.offerId);
              return (
                <RunCardPile
                  backMediaUrl={cardBackMediaUrl}
                  lockMediaUrl={lockMediaUrl}
                  locked={adlectioSpent}
                  key={offer.offerId}
                  seatIndex={index}
                >
                  {adlected ? null : (
                    <RunCard
                      card={offer}
                      mode="sectio"
                      layoutId={offer.offerId}
                      disabled={adlectioSpent || run.goldTenths < offer.cost * GOLD_SCALE}
                      onSelect={(source) => onAdlect(offer, source)}
                    />
                  )}
                </RunCardPile>
              );
            })}
          </SectioCardRow>
        </section>


        {sectio.paidLipsanonOffer ? (
          <section>
            <h3>Merchant&apos;s Shopkey</h3>
            <LipsanonOffer
              lipsanonId={sectio.paidLipsanonOffer}
              actionLabel={sectio.paidLipsanonBought ? 'Sold out this Conflict' : (
                <span className="run-paid-lipsanon-price">
                  <span>Buy</span>
                  <RunGoldAmount valueTenths={10 * GOLD_SCALE} className="run-gold-amount--button" />
                </span>
              )}
              disabled={sectio.paidLipsanonBought || run.goldTenths < 10 * GOLD_SCALE}
              action={() => replace(buyPaidLipsanon(run))}
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
 * The rewards report entered from the won board's lightweight Victory overlay. It remains a
 * phase of its own because the reward it reports used to be a line inside the Sectio --
 * announcing the result of the fight in the room where the money is spent.
 *
 * The gold is not banked until Continue, so what the screen says it won and what the Run then
 * receives are the same number read twice.
 */
function AftermathPanel({
  run,
  canReviewBattle,
  onReviewBattle,
}: {
  run: RunDocument;
  canReviewBattle: boolean;
  onReviewBattle: () => void;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const aftermath = run.aftermath!;
  const battleLevel = run.war.battles[aftermath.battleIndex]?.level;
  const levelName = battleLevel?.name ?? '';
  const named = levelName && !isGeneratedRunBattleName(levelName) ? levelName : null;
  // Par and the speed bonus are DERIVED here from the Battle's own level and the report's
  // frozen elapsed time -- the same pure functions closeBattle paid the gold with, so this
  // screen reports the exact number the Run banks without the saved report carrying a field
  // for it (ADR-0539).
  const parTurns = battleLevel ? levelParTurns(battleLevel) : null;
  const speedTenths = battleLevel ? speedBonusTenths(battleLevel, aftermath.elapsedMs) : 0;
  const speedClockMs = battleLevel ? speedBonusClockMs(battleLevel) : 0;
  const speedRemainingMs = battleLevel ? speedBonusRemainingMs(battleLevel, aftermath.elapsedMs) : 0;
  const underPar = parTurns === null ? 0 : parTurns - aftermath.turns;
  // Priced from the standing count the report froze, for the same reason par and the speed
  // bonus are derived here: one number read twice rather than two numbers agreeing by luck.
  const deditioTenths = deditioGoldTenths(aftermath.standingEnemyValue);
  // One line naming every source folded into the purse, so the measures below read as a
  // breakdown of "Gold won" rather than as extras stacked on top of it.
  const goldSources = [
    aftermath.bonusGoldTenths ? LIPSANON_BY_ID['mercenarys-rifle'].name : null,
    deditioTenths ? 'Deditio' : null,
    speedTenths ? 'the speed bonus' : null,
  ].filter((source): source is string => source !== null);
  // The verbs that close the report, declared rather than composed: the box seats each one in a
  // compartment its own column line divides. Back is there only when the won board can still be
  // reopened, and a report with one verb has nothing to rule a line through.
  const verbs: readonly ChromeVerb[] = [
    ...(canReviewBattle ? [{
      id: 'back',
      label: 'Back',
      testId: 'run-aftermath-back',
      onPress: onReviewBattle,
    }] : []),
    {
      id: 'continue',
      label: 'Continue',
      testId: 'run-aftermath-continue',
      onPress: (): void => {
        replace(leaveAftermath(run));
        clearMatch();
      },
    },
  ];
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
        <h2 id="run-aftermath-workspace-title" className="run-aftermath-title">Victory</h2>
        {named ? <p className="run-aftermath-subtitle">{named}</p> : null}
      </header>

      {/* The report is a structural box, so it wears the installed marble borrowed from the outer
          role (ADR-0433) — the same material the Editor's rows and the Run's Battle-preview pane
          are painted with. Unfilled, the ledger read its labels and its numerals straight off the
          vista behind it, which is the one thing the frame around them was there to prevent.

          ONE box, with a rail instead of a gap. The verbs used to be a loose pair of framed buttons
          under it, so the vista showed through between the report and the thing it is read to
          decide, and each button drew a second frame a few pixels inside the one already there.
          They are cells of this box's bottom row now: the rail under the ledger and the line
          between Back and Continue are the box's own, laid and capped from its grid lines
          (ADR-0059). The oak they wear is still the leaf material the ADR-0557 family adopts —
          a box wears the marble, every trigger in it wears the oak. */}
      <DividedInnerChromeBox
        className="run-aftermath-report"
        columns={verbColumns(verbs)}
        fillRole={CHROME_STRUCTURAL_FILL_ROLE}
      >
        <ChromeDividedGridRow spans="all" className="run-aftermath-record">
          <dl className="run-aftermath-ledger">
            <AftermathMeasure
              label="Gold won"
              detail={goldSources.length ? `including ${goldSources.join(' and ')}` : null}
            >
              <RunGoldAmount valueTenths={aftermath.goldTenths} />
            </AftermathMeasure>
            {/* Par is a benchmark and never a rule -- crossing it costs nothing, so the detail
                states the standing plainly rather than dressing it as a pass or a failure. */}
            <AftermathMeasure
              label="Turns taken"
              detail={parTurns === null ? null : (
                underPar > 0
                  ? `${underPar} under par of ${parTurns}`
                  : underPar < 0
                    ? `${-underPar} over par of ${parTurns}`
                    : `Level par of ${parTurns}`
              )}
            >
              {aftermath.turns}
            </AftermathMeasure>
            <AftermathMeasure label="Time">
              {aftermath.elapsedMs === null ? '—' : formatBattleElapsed(aftermath.elapsedMs)}
            </AftermathMeasure>
            {/* What the enemy still had on the board when its King fell. A player who mates
                early is paid for the army they never had to take; one who grinds the board down
                to a bare King reads zero here, which is the whole of the incentive. */}
            <AftermathMeasure
              label="Deditio"
              detail={aftermath.standingEnemyValue > 0
                ? `${aftermath.standingEnemyValue} points of enemy force surrendered with their King`
                : 'The enemy had nothing left to surrender.'}
            >
              <RunGoldAmount valueTenths={deditioTenths} />
            </AftermathMeasure>
            {/* What the clock paid. The bonus clock is sized from par and is not lethal: an
                exhausted one reads 0:00 here and took nothing away from the fight. */}
            <AftermathMeasure
              label="Speed bonus"
              detail={aftermath.elapsedMs === null
                ? 'The battle clock was never started.'
                : `${formatBattleElapsed(speedRemainingMs)} left of ${formatBattleElapsed(speedClockMs)}`}
            >
              <RunGoldAmount valueTenths={speedTenths} />
            </AftermathMeasure>
            {/* Being taken off the board costs a unit the rest of the Battle and nothing more --
                it is back in the army for the next one. "Fallen" read as a permanent loss the
                Run does not actually impose, so the measure says what happened instead. */}
            <AftermathMeasure
              label="Recovered from wounds"
              detail={aftermath.fallenUnits.length
                ? aftermath.fallenUnits.map((unit) => (
                  <span className="run-aftermath-measure-name" key={unit.id}>{unit.name}</span>
                ))
                : 'The whole force came through unhurt.'}
            >
              {aftermath.fallenUnits.length}
            </AftermathMeasure>
          </dl>
        </ChromeDividedGridRow>

        <ChromeVerbRow verbs={verbs} className="run-result-verbs" cellClassName="run-result-verb" />
      </DividedInnerChromeBox>
    </RunSceneViewport>
  );
}

function VictoryPanel({ run }: { run: RunDocument }): ReactElement {
  const abandon = useActiveRun((state) => state.abandon);
  // One verb, so the row spans the box: there is nothing divided here for a rail to be.
  const verbs: readonly ChromeVerb[] = [{
    id: 'finish',
    label: 'Finish Run',
    onPress: (): void => {
      // Same as Abandon: the Run is closed locally before this suspends, so the finished
      // War does not hold the player on an empty workspace while its row is deleted.
      void abandon();
      navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
    },
  }];
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
      {/* The same composition as the Battle's Aftermath, because it is the same moment one scale
          up: a display heading standing on the artwork, the facts in a report box under it, the
          action last. Every line but the heading used to stand on the artwork too — and this
          workspace's artwork is a bright daylight sky, so a block of white copy was reading off
          clouds. Only the heading is display type, which carries its own shadow; the rest is the
          record the War is remembered by, and a record needs a surface. */}
      <header className="run-victory-head">
        <h2 id="run-victory-workspace-title" className="run-victory-title">War won</h2>
      </header>

      {/* Same box as the Aftermath's, for the same reason: the verb that ends the Run is the
          record's own last row rather than a button parked under it. */}
      <DividedInnerChromeBox
        className="run-victory-report"
        columns={verbColumns(verbs)}
        fillRole={CHROME_STRUCTURAL_FILL_ROLE}
      >
        <ChromeDividedGridRow spans="all" className="run-victory-record">
          <h3 className="run-victory-war">{run.war.name}</h3>
          <p className="run-victory-ataraxia">
            {ATARAXIA_BY_TIER[run.ataraxiaTier].label} — {ATARAXIA_BY_TIER[run.ataraxiaTier].title}
          </p>
          <p className="run-victory-description">{run.war.description}</p>
          <p className="run-victory-summary">
            <span>{run.army.length} persistent units</span>
            <span>{visibleLipsanonCount(run)} lipsana</span>
            <RunGoldAmount valueTenths={run.goldTenths} />
          </p>
        </ChromeDividedGridRow>

        <ChromeVerbRow verbs={verbs} className="run-result-verbs" cellClassName="run-result-verb" />
      </DividedInnerChromeBox>
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
  onReviewRewards,
}: {
  form: RunForm;
  run: RunDocument;
  view: RunScreenView;
  onNavigate: (view: RunScreenView) => void;
  onReviewRewards?: () => void;
  routePath: string;
  routeSearch: string;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const { abandonDialog, requestAbandon } = useRunAbandon(run);
  const runId = run.id;
  const departureSequenceRef = useRef(0);
  const departureRequestRef = useRef<UnitDepartureRequest | null>(null);
  const [unitDeparture, setUnitDeparture] = useState<UnitDepartureRequest | null>(null);
  const requestDeploymentReroll = useCallback((): boolean => {
    if (departureRequestRef.current) return false;
    const latest = useActiveRun.getState().run;
    if (!latest || latest.id !== runId || !canRerollDeployment(latest)) return false;
    departureSequenceRef.current += 1;
    const request: UnitDepartureRequest = {
      id: `${runBattleActivityId(runId, latest.battleIndex)}:deployment-reroll:${departureSequenceRef.current}`,
      reason: 'deployment-reroll',
    };
    departureRequestRef.current = request;
    setUnitDeparture(request);
    return true;
  }, [runId]);
  const completeDeploymentRerollDeparture = useCallback((requestId: string): void => {
    if (departureRequestRef.current?.id !== requestId) return;
    departureRequestRef.current = null;
    const latest = useActiveRun.getState().run;
    if (latest?.id === runId) {
      const rerolled = rerollDeployment(latest);
      if (rerolled !== latest) replace(rerolled);
    }
    setUnitDeparture(null);
  }, [replace, runId]);
  const deploymentPresentation = useRunDeploymentPresentation({
    run,
    departureActive: Boolean(unitDeparture),
    routeSearch,
  });
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
  const battleSeed = run.deployment?.seed ?? run.seed;
  const craftedBattleResult = onReviewRewards ? null : craftedBattleResultFor(run);
  const latestRun = useActiveRun.getState().run;
  const retryRun = latestRun?.id === runId ? latestRun : run;
  const battleCanRestart = !onReviewRewards && canRestartBattle(retryRun);
  const battleCanReroll = !onReviewRewards && !unitDeparture && canRerollDeployment(retryRun);

  const transformCommittedBoard = useCallback<RunBattleTransformSink>((game, events) => {
      const live = useActiveRun.getState().run;
      // Every change below reports itself here. The Battle log, the gold rising off the board,
      // and the coin all come from this one list, so there is no arrangement of this function
      // that moves the Run's gold without the player being told.
      const notices: RunBattleNotice[] = [];
      if (!live || live.phase !== 'battle' || live.id !== run.id || !live.battleRuntime) return { game, notices };
      // Re-bound as non-null past the guard: the payment helpers below close over it, and a
      // closure does not carry the narrowing the guard just established.
      let active: RunDocument = live;
      let transformed: GameState = game;
      let changed = false;
      // Manubiae are the PLAYER's alone: the same deeds are available to the enemy and pay it
      // nothing. What was earned is asked of one shared reader (ADR-0540) rather than worked
      // out here, so the Battle screen, the unit tests and the live gate cannot disagree about
      // what a board is worth. It is asked against the board as the move committed it — before
      // any Reservist below lands and stands in a ray, which would make the Run pay for a line
      // it drew itself.
      for (const { award, at } of manubiaeEarnedBy(transformed, events)) {
        const paid = payRunManubium(active, award, at);
        if (!paid) continue;
        active = paid.run;
        notices.push(paid.notice);
        changed = true;
      }
      const observedDeadUnitIds = active.battleRuntime?.observedDeadUnitIds ?? [];
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
        // Record and narrate the arrival BEFORE the unit is on the board, so a Reservist that
        // the Run could not account for never appears unannounced either.
        const deployed = markReservistDeployed(active, reservist.id, cell);
        if (!deployed) continue;
        active = deployed.run;
        notices.push(deployed.notice);
        transformed = { ...transformed, pieces: [...transformed.pieces, spawned] };
        changed = true;
      }
      if (changed) useActiveRun.getState().replace(active);
      return { game: transformed, notices };
  }, [baseLevel, run.id]);

  const presentation = useMemo<RunBattlePresentation>(() => ({
    level: battleLevel,
    seed: battleSeed,
    activityId: runBattleActivityId(runId, run.battleIndex),
    craftedResult: craftedBattleResult,
    // Both terminal-review entrances are already-resolved boards. Aftermath Back restores
    // the saved terminal match; a crafted Victory applies its one-shot result while this
    // incoming scene is still preparing. Neither should stage or replay unit arrivals.
    reviewTerminalResult: Boolean(onReviewRewards || craftedBattleResult),
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
      chargeEarlier: (checkpoint) => chargeRunBattleUndoCheckpoint(checkpoint),
    } satisfies RunBattleUndoAdapter,
    onVictory: (report) => {
      if (onReviewRewards) {
        onReviewRewards();
        return;
      }
      const latest = useActiveRun.getState().run;
      if (latest?.id === runId) {
        const closed = closeBattle(latest, report);
        // The transient craft marker stays for the whole visible-board Victory surface so
        // every render continues to classify it as terminal. Rewards retires both the
        // surface and its marker together.
        clearCraftedBattleResult({
          id: runId,
          phase: 'battle',
          battleIndex: run.battleIndex,
        });
        replace(closed);
        if (closed.phase === 'victory') clearMatch();
      }
    },
    onRestart: () => {
      if (onReviewRewards) return false;
      const latest = useActiveRun.getState().run;
      if (!latest || latest.id !== runId) return false;
      const restarted = restartBattle(latest);
      if (restarted === latest) return false;
      replace(restarted);
      return true;
    },
    onRerollDeployment: () => {
      if (onReviewRewards) return false;
      return requestDeploymentReroll();
    },
    canRestart: battleCanRestart,
    retryCostTenths: RUN_BATTLE_RETRY_COST_TENTHS,
    canRerollDeployment: battleCanReroll,
    deploymentRerollCostTenths: RUN_BATTLE_DEPLOYMENT_REROLL_COST_TENTHS,
    onAbandonRun: () => { void requestAbandon(); },
  }), [battleCanReroll, battleCanRestart, battleLevel, battleSeed, craftedBattleResult, onReviewRewards, requestAbandon, requestDeploymentReroll, run.battleIndex, runId, transformCommittedBoard]);

  // Subscribe to the current document so Reservist events refresh the hook inputs
  // without restarting the already-live matching board.
  return (
    <>
      {run.phase === 'battle' ? abandonDialog : null}
      <Skirmish
        runForm={form}
        runBattle={presentation}
        runDeployment={deploymentPresentation}
        unitDeparture={unitDeparture}
        onUnitDepartureComplete={completeDeploymentRerollDeparture}
        routePath={routePath}
        routeSearch={routeSearch}
      />
    </>
  );
}

export function RunScreen({
  sceneSnapshot,
  routePath: address = window.location.pathname,
  routeSearch: addressSearch = window.location.search,
}: {
  sceneSnapshot: RunSceneSnapshot;
  routePath?: string;
  routeSearch?: string;
}): ReactElement {
  const run = sceneSnapshot.run;
  const hydrated = sceneSnapshot.hydrated;
  const replace = useActiveRun((state) => state.replace);
  const [adlectioAnnouncement, setAdlectioAnnouncement] = useState('');
  const [grantAnnouncement, setGrantAnnouncement] = useState('');
  const { launch: launchCardFlight, element: cardFlightElement } = useRunCardFlights();
  // The opening grant's admission ends its own phase, so its carry is held past landing and
  // released by the director once Deployment has settled underneath it. A Sectio purchase
  // stays on the Sectio and needs no such retention.
  const {
    launch: launchGrantCardFlight,
    element: grantCardFlightElement,
  } = useRunCardFlights({ handoff: 'scene-settled' });
  // A craft address sets the account's Run to the state it names before the screen reads one,
  // every time it is opened (ADR-0354). The link stays in the address bar so it can be pressed
  // again, and the screen presents the Run address it names instead (ADR-0531) — so everything
  // below reads `routePath`/`routeSearch` and never the craft link itself.
  const craft = useRunCraft(address, addressSearch);
  const { path: routePath, search: routeSearch } = presentedRunAddress(address, addressSearch);
  const filterScope = run?.phase === 'sectio'
    ? `${run.id}:sectio:${run.sectio?.afterBattleIndex ?? run.battleIndex}`
    : run
      ? `${run.id}:outside-sectio`
      : 'no-run';
  const [armyFilterState, setArmyFilterState] = useState<{ scope: string; filters: RunArmyFilters }>({
    scope: 'no-run',
    filters: { ...DEFAULT_RUN_ARMY_FILTERS },
  });
  // The Strategikon is the Run's reference workspace in EVERY phase, not just Battle —
  // Deployment, Sectio, and Victory all open it from the same Controls title mark. Only an
  // absent Run has nothing to reference, so that is the sole address the screen repairs.
  useEffect(() => {
    // A craft still running, or refused, owns the screen: repairing the address out from under
    // it would throw away the link before it has landed, and its refusal with it.
    if (craft.crafting || craft.error) return;
    if (hydrated && isStrategikonPath(routePath) && !run) {
      navigateApp(`/run${routeSearch}`, { replace: true, scroll: false });
    }
  }, [craft.crafting, craft.error, hydrated, routePath, routeSearch, run]);

  // The pre-hydration document may exist from browser storage, but the screen treats
  // the Run as absent until hydrate() has arbitrated browser and account copies.
  const shellRun = hydrated ? run : null;
  const rawView: RunScreenView = sceneSnapshot.workspace.view === 'strategikon'
    ? 'primary'
    : sceneSnapshot.workspace.view;
  const battleReviewActivity = shellRun
    ? runBattleActivityId(shellRun.id, shellRun.battleIndex)
    : null;
  const battleReviewAvailable = Boolean(
    shellRun?.phase === 'aftermath'
    && battleReviewActivity
    && loadReviewableRunBattleMatch(
      shellRun.war.battles[shellRun.battleIndex].level.id,
      battleReviewActivity,
    ),
  );
  const view = rawView === 'battle-review' && !battleReviewAvailable
    ? 'primary'
    : shellRun?.phase !== 'sectio' && rawView === 'expunctio'
      ? 'primary'
      : rawView;
  const reviewingWonBattle = rawView === 'battle-review' && battleReviewAvailable;
  const battleSurfaceRun = useMemo<RunDocument | null>(() => (
    reviewingWonBattle && shellRun
      ? { ...shellRun, phase: 'battle', aftermath: null }
      : shellRun
  ), [reviewingWonBattle, shellRun]);
  useEffect(() => {
    // Same as the address repair above: a craft in flight has not yet produced the Run this
    // judges, and a refused one has nothing to judge at all.
    if (craft.crafting || craft.error) return;
    if (!hydrated || rawView !== 'battle-review' || battleReviewAvailable) return;
    navigateApp(runWorkspaceHref(`/run${routeSearch}`, 'primary'), { replace: true, scroll: false });
  }, [battleReviewAvailable, craft.crafting, craft.error, hydrated, rawView, routeSearch]);
  const strategikonOpen = sceneSnapshot.workspace.view === 'strategikon';
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
    // The closure is spoken with the admission because it is the same event: a screen reader
    // gets no second cue from a row whose remaining faces are printed exactly as they were.
    setAdlectioAnnouncement(
      `${runCardName(offer)} admitted by Adlectio and added to the Chartulary.`
      + ' This Sectio admits no other card.',
    );
  };
  // The Run's opening grant is the same admission as Adlectio and reads as one: the taken
  // card travels into the Chartulary from where it was lying. The Run phase owns that carry
  // rather than the Bona workspace, because taking the card is what ends the workspace.
  const takeGrantCard = (coreId: string, source: HTMLButtonElement): void => {
    const latest = useActiveRun.getState().run;
    if (!latest || latest.phase !== 'bona-vacantia' || latest.vacantia?.kind !== 'opening') return;
    const granted = takeVacantiaCard(latest, coreId);
    if (granted === latest) return;
    const card = RUN_CARD_BY_ID[coreId];
    const target = document.querySelector('[data-run-card-flight-target]');
    if (card) launchGrantCardFlight(card, source, target);
    replace(granted);
    if (card) setGrantAnnouncement(`${runCardName(card)} taken and added to the Chartulary.`);
  };
  /**
   * Taking a King ends its own phase, so the carry must outlive this component: a flight released
   * at landing lets go while Deployment is still preparing and the card is gone for that interval
   * (ADR-0385). Same launch the opening grant used, for the same reason.
   */
  const takeCommendatioCard = (kingId: string, source: HTMLButtonElement): void => {
    const latest = useActiveRun.getState().run;
    if (!latest || latest.phase !== 'commendatio') return;
    const served = takeCommendatioKing(latest, kingId);
    if (served === latest) return;
    const card = runCardDefinition(kingId);
    const target = document.querySelector('[data-run-card-flight-target]');
    if (card) launchGrantCardFlight(card, source, target);
    replace(served);
    if (card) setGrantAnnouncement(`${runCardName(card)} taken and added to the Chartulary.`);
  };
  const selectedUnitId = sceneSnapshot.workspace.view === 'army'
    ? sceneSnapshot.workspace.unitId
    : null;
  const armyFilters = armyFilterState.scope === filterScope
    ? armyFilterState.filters
    : { ...DEFAULT_RUN_ARMY_FILTERS };
  // Army, Lipsana, and Expunctio are workspaces of the Run screen itself, so they always
  // address the Run root. Dropping any open Strategikon address keeps these Controls
  // live instead of navigating to a path the reference workspace still covers, and taking the
  // PRESENTED search leaves a craft link's `to=` behind with the link (ADR-0531).
  const navigateRunView = (nextView: RunScreenView): void => {
    const current = new URL(window.location.href);
    current.search = presentedRunAddress(current.pathname, current.search).search;
    current.pathname = '/run';
    const nextHref = runWorkspaceHref(current.toString(), nextView);
    navigateApp(nextHref, { replace: true, scroll: false });
  };
  const navigateArmyUnit = (unitId: string | null): void => {
    const current = new URL(window.location.href);
    current.search = presentedRunAddress(current.pathname, current.search).search;
    current.pathname = '/run';
    navigateApp(runArmyUnitHref(current.toString(), unitId), { replace: true, scroll: false });
  };
  // The Run phase owns this carry, not the selected Bona workspace. A targeted take keeps
  // the same phase scene mounted while the gameplay workspace deselects, so local mat state
  // would unmount during preparation and leave the continuity layer blank.
  const {
    launch: launchBonaLipsanon,
    element: bonaLipsanonFlightElement,
  } = useLipsanonFlight((lipsanonId) => {
    const latest = useActiveRun.getState().run;
    if (!latest || latest.phase !== 'bona-vacantia') return;
    replace(takeVacantiaLipsanon(latest, lipsanonId));
  }, { handoff: 'scene-settled' });
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
    />
  ) : null;
  const lipsanaWorkspace = shellRun ? <LipsanaWorkspace lipsanonIds={shellRun.lipsana} /> : null;
  const inspectionWorkspace = view === 'army'
    ? armyWorkspace
    : view === 'lipsana'
      ? lipsanaWorkspace
      : null;
  const sectioScene = useInstalledSectioScene();
  const expunctioWorkspace = shellRun ? (
    <RunExpunctioWorkspace run={shellRun} onExpunct={expunctCard} />
  ) : null;
  // The Sectio scene belongs to the retained shell viewport, not to whichever Sectio
  // workspace happens to be in front of it. Keeping it outside the transition region
  // prevents Sectio/Exploratio/Expunctio swaps from fading or remounting the room.
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
                expunctioWorkspace={expunctioWorkspace!}
                adlectioAnnouncement={adlectioAnnouncement}
                onAdlect={beginAdlectio}
              />
            )
            // Explicit, because the branch below is an else-fallthrough: any phase without
            // its own case silently renders Victory.
            : shellRun.phase === 'commendatio' && shellRun.commendatio
              ? <RunCommendatio run={shellRun} takeKing={takeCommendatioCard} />
            : shellRun.phase === 'bona-vacantia' && shellRun.vacantia
              ? (
                <RunBonaVacantia
                  run={shellRun}
                  replace={replace}
                  launchLipsanon={launchBonaLipsanon}
                  takeCard={takeGrantCard}
                />
              )
              : shellRun.phase === 'aftermath' && shellRun.aftermath
                ? (
                  <AftermathPanel
                    run={shellRun}
                    canReviewBattle={battleReviewAvailable}
                    onReviewBattle={() => navigateRunView('battle-review')}
                  />
                )
                : <VictoryPanel run={shellRun} />);
  const battlefieldActive = !craftWorkspace
    && (shellRun?.phase === 'deployment' || shellRun?.phase === 'battle' || reviewingWonBattle);
  const runSurfacePhase = sceneSnapshot.phase;
  const sceneInstance = battlefieldActive && shellRun
    ? `${shellRun.id}:battlefield:${shellRun.battleIndex}:${runSceneWorkspaceIdentity(sceneSnapshot.workspace)}`
    : `${shellRun?.id ?? 'none'}:${runSurfacePhase}:${runSceneWorkspaceIdentity(sceneSnapshot.workspace)}`;
  const visibleLipsanonIds = shellRun
    ? shellRun.lipsana
    : [];
  const form = createRunForm({
    run: shellRun,
    routePath,
    routeSearch,
    strategikonOpen,
    titleBarContent: shellRun ? (
      <RunTitleBarStatus run={shellRun} path={routePath} search={routeSearch} view={view} battlefieldMounted={battlefieldActive} />
    ) : null,
    lipsanonIds: visibleLipsanonIds,
    inspectionWorkspace,
    className: `run-screen${shellRun && visibleLipsanonCount(shellRun) ? ' has-lipsana' : ''}`,
  });
  const formSurface = battlefieldActive && battleSurfaceRun
    ? (
      <RunBattlefieldPanel
        form={form}
        run={battleSurfaceRun}
        routePath={routePath}
        routeSearch={routeSearch}
        view={view}
        onNavigate={navigateRunView}
        onReviewRewards={reviewingWonBattle ? () => navigateRunView('primary') : undefined}
      />
    )
    : (
      <SkirmishViewStoreProvider>
        {form.add(runActivity({
          id: sceneInstance,
          testId: 'run-screen',
          className: runWorkspaceOwnsEnvironment(shellRun?.phase) ? 'run-workspace-owns-environment' : undefined,
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
          // The installed Sectio room is a cover-fitted opaque raster owning the whole viewport
          // column, so the ordinary world backdrop behind it is never seen — decline it explicitly
          // rather than letting SkirmishShell's `undefined` opt back in. Phases with no retained
          // room artwork keep the ordinary backdrop.
          screenStyle: persistentSectioScene ? null : undefined,
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
      {grantCardFlightElement}
      {bonaLipsanonFlightElement}
      {/* Outside the phase branch, because taking the opening grant replaces the workspace
          that would otherwise have carried this: a region unmounted in the same commit as
          its own text is never read. */}
      <span className="sr-only" role="status" aria-live="polite">{grantAnnouncement}</span>
      {formSurface}
    </RunPresentationSceneSlot>
  );
}
