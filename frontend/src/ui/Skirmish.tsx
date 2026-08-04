import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isPredrawnBackgroundActive } from '@chess-tactics/board-render';
import {
  SkirmishBoard,
  type SkirmishBoardCellOverlayContext,
  type SkirmishBoardSurfaceState,
} from '../render/SkirmishBoard';
import { SkirmishHud, type SkirmishHudProps } from './SkirmishHud';
import { SceneSurfaceReadiness } from './shell/PaintedSurfaceBoundary';
import { useSceneActivation, useSceneReveal } from './shell/SceneBoundary';
import { NavButton } from './shared/NavButton';
import { RestartGlyph } from './shared/actionGlyphs';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { TitleBarControlContribution, TitleBarStatus } from './shell/TitleBarControls';
import { shouldStartFreshSkirmish, type RunBattleTransformSink } from '../game/store';
import { SkirmishStoreProvider, useSkirmish, useSkirmishStoreApi } from '../game/SkirmishStoreContext';
import { loadMatch, persistedMatchMatchesActivity, setMatchPersistenceEnabled } from '../game/matchPersistence';
import {
  fetchLobby,
  postMove,
  reportLobbyResult,
  resignLobby,
  leaveLobby,
  fetchMovesSince,
  subscribeLobbyChannel,
  type MoveEvent,
  type ReportedLobbyResult,
} from '../net/lobbies';
import type { Level, TimeControl } from '../core/level';
import { clientTurnLabel, type PlayingSide } from '../game/clientPerspective';
import { clearPersistedNetIntent } from '../game/netIntentPersistence';
import { acquireNetSeatLease } from '../game/netSeatLease';
import { objectiveSummary, victoryRulesForObjective } from '../core/objectives';
import { objectiveBriefingForSide } from '../game/objectiveBriefing';
import { formatClockMs } from '../core/clock';
import { useCampaigns } from '../campaign/store';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { decodeBoard } from './boardCode';
import {
  appendLevelEventsParam,
  appendTimeControlParams,
  appendVictoryRulesParam,
  readLevelEventsParam,
  readTimeControlParams,
  readVictoryRulesParam,
  resolvePlayReturnHref,
} from './playtestRoute';
import { editorBoardToLevel } from '../core/levelBoard';
import { fetchPublicMap } from '../net/maps';
import { HttpError } from '../net/http';
import { OBJECTIVE_TYPES, type ObjectiveType } from '../core/level';
import { spawnEventsForLevel } from '../core/levelEvents';
import { defaultBackgroundSet } from '../art/backgroundSets';
import { isPlayablePieceType, paletteForSide } from '../core/pieces';
import { type Piece as PortraitPiece, type Palette as PortraitPalette } from './PortraitEditor';
import { runtimePortraitMasterSrc } from './portraitCandidates';
import { preloadImages } from '../art/preload';
import { nextLevelRef, orderedLevels, recordLevelWin } from '../campaign/progress';
import { navigateApp, readValidatedReturnTo } from './navigation';
import { useInstalledChromeCss } from './useInstalledChromeCss';
import { PLAY_SKIRMISH_SELECTOR_HREF, playCampaignSelectorHref } from './playHubRoute';
import { PredrawnCornerPicker } from './PredrawnCornerPicker';
import {
  predrawnBoardPreviewRegistration,
  predrawnBoardPreviewSrc,
  serializePredrawnBoardPreviewRegistration,
  storedPredrawnBoardRegistration,
  type PredrawnBoardCornerRegistration,
} from '../render/PredrawnBoardLayer';
import { useSkirmishViewStoreApi } from '../game/SkirmishViewStoreContext';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { InnerChromeBox, ShellViewportSwap } from './shared/ChromeBox';
import { rememberAdminBattleHref } from '../admin/battleRoute';
import type { LipsanonId, RunBattleReport } from '../run/model';
import { useActiveRun } from '../run/store';
import { LipsanonStrip } from './Lipsana';
import { Strategikon } from './Strategikon';
import { GameplayWorkspaceSceneSlot } from './shell/AuthoredSceneSlot';
import { ChromeButton, ChromeNavButton } from './shared/ChromeButton';

export interface RunBattlePresentation {
  level: Level;
  seed: number;
  activityId: string;
  lipsanonIds: readonly LipsanonId[];
  /** The Battle is won. What it cost is read off the live board here, because nothing
   *  outside it keeps the turn count once the board unmounts. */
  onVictory: (report: RunBattleReport) => void;
  onRestart: () => void;
  onPawnCashOut?: (unitId: string) => void;
  onAbandonRun?: () => void;
  transformCommittedBoard?: RunBattleTransformSink;
}

/** Deployment chrome and interaction projected onto the Battle compositor already on screen. */
export interface RunDeploymentPresentation {
  surfaceState: SkirmishBoardSurfaceState;
  titleBarContent: ReactNode;
  lipsanonIds: readonly LipsanonId[];
  controlsContent: ReactNode;
  renderCellOverlay: (context: SkirmishBoardCellOverlayContext) => ReactNode;
  boardOverlay: ReactNode;
  screenClassName?: string;
  boardClassName?: string;
  boardAriaLabel: string;
  onArrivingUnitIdsChange: (unitIds: readonly string[]) => void;
}

export interface SkirmishProps {
  runBattle?: RunBattlePresentation | null;
  runDeployment?: RunDeploymentPresentation | null;
  runWorkspace?: ReactNode;
  routePath?: string;
  routeSearch?: string;
}

export function shouldLoadSkirmishWorldBackground(
  boardSettled: boolean,
  predrawnBackgroundActive: boolean,
): boolean {
  return boardSettled && !predrawnBackgroundActive;
}

export function SkirmishShell({
  className = '',
  testId = 'skirmish',
  titleBarContent,
  persistentViewportArtwork = null,
  lipsanonIds = [],
  shellWorkspaceCoversLipsana = false,
  controlsContent,
  hudProps,
  hudContent,
  screenStyle,
  registerSceneSurface = true,
  surfaceSignature,
  readyToCompose = true,
  children,
}: {
  className?: string;
  testId?: string;
  titleBarContent: ReactNode;
  /** Artwork shared by sibling viewport destinations. It is deliberately outside
   *  the director-faded overlap region so the environment remains continuous. */
  persistentViewportArtwork?: ReactNode;
  lipsanonIds?: readonly LipsanonId[];
  shellWorkspaceCoversLipsana?: boolean;
  controlsContent?: ReactNode;
  hudProps?: SkirmishHudProps;
  hudContent?: ReactNode;
  screenStyle?: CSSProperties | null;
  registerSceneSurface?: boolean;
  /** Stable mounted-surface identity when chrome state changes within one battlefield. */
  surfaceSignature?: string;
  readyToCompose?: boolean;
  children: ReactNode;
}): ReactElement {
  const installedChromeCss = useInstalledChromeCss();
  const [paintAttempt, setPaintAttempt] = useState(0);
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('skirmish-active');
    return () => shell?.classList.remove('skirmish-active');
  }, []);
  const resolvedScreenStyle = screenStyle === undefined
    ? {
        '--skirmish-world-bg': `url("${defaultBackgroundSet().world}")`,
      } as CSSProperties
    : screenStyle ?? undefined;
  const surface = (
    <>
      {persistentViewportArtwork ? (
        <div className="shell-persistent-viewport-artwork" aria-hidden="true">
          {persistentViewportArtwork}
        </div>
      ) : null}
      {shellWorkspaceCoversLipsana ? null : <LipsanonStrip lipsanonIds={lipsanonIds} />}
      {children}
      {hudContent === undefined
        ? <SkirmishHud {...hudProps} controlsContent={controlsContent} />
        : hudContent}
    </>
  );

  return (
    <div
      data-testid={testId}
      className={`skirmish-screen${persistentViewportArtwork ? ' has-persistent-viewport-artwork' : ''} ${className}`.trim()}
      style={resolvedScreenStyle}
    >
      {installedChromeCss ? <style data-skirmish-chrome-family dangerouslySetInnerHTML={{ __html: installedChromeCss }} /> : null}
      <TitleBarSlot region="center">{titleBarContent}</TitleBarSlot>
      {registerSceneSurface ? (
        <SceneSurfaceReadiness
          surface="gameplay-hud"
          signature={`${surfaceSignature ?? testId}:${paintAttempt}`}
          readyToCompose={readyToCompose}
          loadingLabel="Preparing Run…"
          onRetry={() => setPaintAttempt((value) => value + 1)}
          showStatus={false}
        >
          {surface}
        </SceneSurfaceReadiness>
      ) : surface}
    </div>
  );
}

function SkirmishSession({
  runBattle = null,
  runDeployment = null,
  runWorkspace = null,
  routePath = window.location.pathname,
  routeSearch = window.location.search,
}: SkirmishProps = {}) {
  const sceneActivated = useSceneActivation();
  const sceneRevealed = useSceneReveal();
  const skirmishStore = useSkirmishStoreApi();
  const skirmishViewStore = useSkirmishViewStoreApi();
  const lastDeploymentSurfaceRef = useRef<SkirmishBoardSurfaceState | null>(null);
  const continuedFromDeploymentRef = useRef(false);
  const [stagedBattleActivityId, setStagedBattleActivityId] = useState<string | null>(null);
  if (runDeployment) {
    lastDeploymentSurfaceRef.current = runDeployment.surfaceState;
    continuedFromDeploymentRef.current = true;
  }
  const retainedDeploymentSurface = !runDeployment
    && runBattle
    && continuedFromDeploymentRef.current
    && stagedBattleActivityId !== runBattle.activityId
      ? lastDeploymentSurfaceRef.current
      : null;
  const presentedDeploymentSurface = runDeployment?.surfaceState ?? retainedDeploymentSurface ?? undefined;
  useEffect(() => {
    skirmishStore.getState().setRunBattleTransformSink(runBattle?.transformCommittedBoard ?? null);
    return () => skirmishStore.getState().setRunBattleTransformSink(null);
  }, [runBattle?.transformCommittedBoard, skirmishStore]);
  const routeParams = useMemo(() => new URLSearchParams(routeSearch), [routeSearch]);
  const strategikonOpen = routePath.startsWith('/play/strategikon/') || routePath.startsWith('/run/strategikon/');
  const strategikonBase = runBattle ? '/run' : '/play';
  const strategikonHref = strategikonOpen
    ? `${strategikonBase}${routeSearch}`
    : `${strategikonBase}/strategikon/enchiridion/units${routeSearch}`;
  const predrawnPreview = useMemo(
    () => predrawnBoardPreviewSrc(routeSearch, window.location.origin),
    [routeSearch],
  );
  const predrawnRegistration = useMemo(
    () => predrawnPreview
      ? storedPredrawnBoardRegistration(predrawnPreview)
        ?? predrawnBoardPreviewRegistration(routeSearch)
      : predrawnBoardPreviewRegistration(routeSearch),
    [predrawnPreview, routeSearch],
  );
  const [predrawnPickerOpen, setPredrawnPickerOpen] = useState(
    () => routeParams.get('predrawnPicker') === '1',
  );
  const routeCampaignId = routeParams.get('campaignId');
  const routeLevelId = runBattle?.level.id ?? routeParams.get('levelId');
  const routeMode = routeParams.get('mode');
  // Play-test a shared board-code link directly (no save/sign-in): `?board=<code>` decodes an
  // authored board into a one-off fixed-placement level. `?obj=<mode>` picks the win rule
  // (defaults to capture-all). Lets a crafted position be handed round as a URL.
  const routeBoard = routeParams.get('board');
  const routeLevelName = routeParams.get('name')?.trim() || 'Board Link';
  const routeObjective = routeParams.get('obj');
  const rawRouteSurviveTurns = Number(routeParams.get('survive'));
  const routeSurviveTurns = Number.isSafeInteger(rawRouteSurviveTurns) && rawRouteSurviveTurns >= 1
    ? rawRouteSurviveTurns
    : undefined;
  const routeTimeControl = useMemo(() => readTimeControlParams(routeParams), [routeParams]);
  const routeEvents = useMemo(() => readLevelEventsParam(routeParams), [routeParams]);
  const routeVictory = useMemo(() => readVictoryRulesParam(routeParams), [routeParams]);
  const [scenarioTimeControl, setScenarioTimeControl] = useState<TimeControl | null>(() => routeTimeControl ?? null);
  const routeBoardLevel = useMemo(() => {
    if (!routeBoard) return null;
    const decoded = decodeBoard(routeBoard);
    if (!decoded) return null;
    const objective: ObjectiveType = (OBJECTIVE_TYPES as readonly string[]).includes(routeObjective ?? '')
      ? (routeObjective as ObjectiveType) : 'capture-all';
    return editorBoardToLevel(decoded, {
      id: 'board-link',
      name: routeLevelName,
      objective,
      surviveTurns: objective === 'survive' ? routeSurviveTurns : undefined,
      timeControl: scenarioTimeControl ?? undefined,
      events: routeEvents,
      victory: routeVictory,
    });
  }, [routeBoard, routeLevelName, routeObjective, routeSurviveTurns, scenarioTimeControl, routeEvents, routeVictory]);
  // Multiplayer: `?lobby=<id>` enters a lobby's shared board as one of the two seats.
  const routeLobby = routeParams.get('lobby');
  // A shared USER map: `?map=<publicId>` fetches its public snapshot and plays it (no sign-in, no
  // campaign). The dead-link message shows if the id is unknown/removed.
  const routeMap = routeParams.get('map');
  // Where a test-play should return to (the editor board that launched it, via ?returnTo). Drives
  // a "‹ Back to editor" in the title bar so a live board test is a LOOP — tweak, play, back —
  // not a one-way trip to the skirmish. Null for a normal match (no returnTo), so nothing shows.
  const launchedReturnHref = readValidatedReturnTo();
  const boardReturnHref = useMemo(() => {
    if (!routeBoard) return null;
    const objective = (OBJECTIVE_TYPES as readonly string[]).includes(routeObjective ?? '')
      ? routeObjective as ObjectiveType
      : 'capture-all';
    const params = new URLSearchParams({ board: routeBoard, obj: objective });
    params.set('name', routeLevelName);
    if (routeSurviveTurns !== undefined) params.set('survive', String(routeSurviveTurns));
    appendTimeControlParams(params, scenarioTimeControl ?? undefined);
    appendLevelEventsParam(params, routeEvents);
    appendVictoryRulesParam(params, routeVictory);
    const predrawnPreview = routeParams.get('predrawnPreview');
    if (predrawnPreview) params.set('predrawnPreview', predrawnPreview);
    const predrawnCorners = routeParams.get('predrawnCorners');
    if (predrawnCorners) params.set('predrawnCorners', predrawnCorners);
    return `/editor/level?${params.toString()}`;
  }, [routeBoard, routeLevelName, routeObjective, routeSurviveTurns, scenarioTimeControl, routeEvents, routeVictory, routeParams]);
  const levelReturnHref = useMemo(() => {
    if (routeMode !== 'test' || !routeLevelId) return null;
    const params = new URLSearchParams({ levelId: routeLevelId });
    if (routeCampaignId) params.set('campaignId', routeCampaignId);
    return `/editor/level?${params.toString()}`;
  }, [routeCampaignId, routeLevelId, routeMode]);
  const returnHref = resolvePlayReturnHref({
    explicitReturnHref: launchedReturnHref,
    hasBoard: Boolean(routeBoard),
    boardReturnHref,
    levelReturnHref,
  });
  const returnIsEditor = !!returnHref && /^\/(editor\/level|level-editor|edit)(\?|$)/.test(returnHref);
  const [netError, setNetError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  // Netplay has no campaign result flow, so a decided match shows its own result card.
  // "View board" dismisses it to review the final position (re-armed for the next match).
  const [netResultDismissed, setNetResultDismissed] = useState(false);
  const [netResultDisputed, setNetResultDisputed] = useState(false);
  const [netSeatInteractive, setNetSeatInteractive] = useState(false);
  const [netSeatFailure, setNetSeatFailure] = useState<'unsupported' | 'unavailable' | 'error' | null>(null);
  const [netRelayFrozen, setNetRelayFrozen] = useState(false);
  // Real campaign play (records progress + shows the result flow), as opposed to the
  // editor's "Test Play" (mode=test) or an authored non-campaign level.
  const isCampaignPlay = !runBattle && Boolean(routeCampaignId && routeLevelId && routeMode !== 'test');
  const isRunPlay = Boolean(runBattle);
  // The Level Editor's "Test Play" is ephemeral author iteration — never persisted or
  // resumed (a stale snapshot after an edit would mislead), unlike real play below.
  const isTestPlay = routeMode === 'test';
  const [routeLevel, setRouteLevel] = useState<Level | null>(() => (
    runBattle?.level ?? (routeLevelId ? useCampaigns.getState().levels[routeLevelId] ?? null : null)
  ));
  // The board mounts only once this screen has DECIDED which game to play (fresh vs resume).
  // The store ships a populated placeholder game (store.ts INITIAL_GAME), so mounting the
  // board before that decision would render the placeholder, then a second time when
  // newSkirmish swaps in the real seed — the board (and the unit deploy) would play twice,
  // the second time at the new positions. Gating the mount on this lets the board mount once,
  // fresh, for the game we actually play.
  const [boardSettled, setBoardSettled] = useState(false);
  const [boardSurfaceReady, setBoardSurfaceReady] = useState(false);
  const [boardSurfaceError, setBoardSurfaceError] = useState<Error | null>(null);
  const [hudSurfaceReady, setHudSurfaceReady] = useState(false);
  const newSkirmish = useSkirmish((s) => s.newSkirmish);
  const restartSkirmish = useSkirmish((s) => s.restartSkirmish);
  const resumeMatch = useSkirmish((s) => s.resumeMatch);
  const activateClock = useSkirmish((s) => s.activateClock);
  const playableSurfaceReady = boardSurfaceReady && (runBattle ? true : hudSurfaceReady);
  const game = useSkirmish((s) => s.game);
  // The Battle's own turn clock, for the aftermath report. It lives in this store and
  // nowhere else, so it has to be read while the board is still mounted.
  const turnsElapsed = useSkirmish((s) => s.turnsElapsed);
  const adminMode = useSkirmish((s) => s.adminMode);
  const adminWinBattle = useSkirmish((s) => s.adminWinBattle);
  // A Run Battle is promoted in place from its already-painted Deployment board. Keep the
  // final Deployment position as the board source for the transition render, build the live
  // match into this same session store before paint, then release that temporary source. The
  // compositor never unmounts: incumbent units stay seated while its unit-identity ledger gives
  // only the newly introduced formation members the canonical arrival treatment.
  useLayoutEffect(() => {
    if (runDeployment || !runBattle || !continuedFromDeploymentRef.current) return;
    if (stagedBattleActivityId === runBattle.activityId) return;
    const ai = new URLSearchParams(window.location.search).get('ai') === 'greedy' ? 'greedy' as const : 'search' as const;
    newSkirmish({
      seed: runBattle.seed,
      level: runBattle.level,
      activityId: runBattle.activityId,
      ai,
      deferClockStart: true,
      preserveBoardPresentation: true,
    });
    setRouteLevel(runBattle.level);
    setBoardSettled(true);
    setStagedBattleActivityId(runBattle.activityId);
  }, [newSkirmish, runBattle, runDeployment, stagedBattleActivityId]);
  const screenBoard = useMemo(
    () => game.boardCode ? decodeBoard(game.boardCode) : null,
    [game.boardCode],
  );
  const screenPredrawnBackgroundActive = Boolean(
    screenBoard
      && isPredrawnBackgroundActive(screenBoard, {
        predrawnBackgroundActive: Boolean(predrawnPreview && screenBoard.surface),
      }),
  );
  // Subscribed (not getState) so the victory "Continue" button knows, reactively, whether
  // a next level exists once the workspace hydrates.
  const campaigns = useCampaigns((s) => s.campaigns);
  const levelDocs = useCampaigns((s) => s.levels);
  // The live objective/rules come from the STORE (not routeLevel). In netplay the same
  // canonical rule list is projected through this client's seat; solo retains the compact
  // historical player-facing summary.
  const objective = useSkirmish((s) => s.objective);
  const objectiveCtx = useSkirmish((s) => s.objectiveCtx);
  const victoryOverride = useSkirmish((s) => s.victoryOverride);
  // The battle clock (null = untimed level). The store quantizes
  // remainingMs to the displayed readout, so this subscription re-renders about
  // once a second, not per tick.
  const clock = useSkirmish((s) => s.clock);
  const net = useSkirmish((s) => s.net);
  const localSide: PlayingSide = net ? net.localSide : 'player';
  const activeLevel = useMemo(() => {
    if (routeBoardLevel) return routeBoardLevel;
    if (routeLevel && routeMode === 'test') return { ...routeLevel, timeControl: scenarioTimeControl ?? undefined };
    return routeLevel;
  }, [routeBoardLevel, routeLevel, routeMode, scenarioTimeControl]);
  const objectiveGoal = net
    ? objectiveBriefingForSide(victoryOverride ?? victoryRulesForObjective(objective, objectiveCtx), localSide).summary
    : objectiveSummary(objective, objectiveCtx.kingSide);
  // How the battle actually ended (ADR-0064) — the fired victory rule's name, when one decided the
  // game. Falls back to the static objective goal (checkmate / clock / draw, or an older save).
  const resultDetail = useSkirmish((s) => s.resultDetail);
  // Status reads from THIS client's seat (single-player: 'player'; netplay: the lobby seat).
  const turnLabel = clientTurnLabel(game, localSide, !!net?.pendingMove);

  // Leave a decided netplay match and return to the lobby list. Either participant closes
  // a started lifecycle into a durable tombstone; a pregame guest can still free its unused
  // seat. Keep the seat lease and this route alive until Leave is acknowledged; only then
  // clear the durable move identity and navigate.
  const returnToLobbies = async () => {
    if (net) {
      if (!netSeatInteractive) {
        window.alert(netSeatFailure === 'unavailable'
          ? 'This tab is read-only because the same seat is active in another tab. Use the interactive tab to leave or concede.'
          : 'Safe multiplayer control is unavailable in this browser. Update it or use a browser with Web Locks support.');
        return;
      }
      if (
        netResultDisputed
        && !window.confirm('The two clients disagree about the terminal position. Leaving now concedes the match and closes this recovery.')
      ) return;
      const completion: ReportedLobbyResult | undefined = net.terminalResult && !netResultDisputed
        ? {
            expectedMoveCount: net.terminalResult.expectedMoveCount,
            winner: net.terminalResult.winner,
            reason: net.terminalResult.reason,
          }
        : undefined;
      try {
        // Keep the seat Web Lock for the whole destructive request. Releasing it through
        // navigation first would let another tab mutate while Leave was still in flight.
        await leaveLobby(net.lobbyId, completion);
      } catch (error) {
        // A lost success response can race the other seat's acknowledgement/TTL and leave
        // no tombstone to retry. Absence is authoritative completion for this exit.
        if (error instanceof HttpError && error.status === 404) {
          clearPersistedNetIntent(net.lobbyId);
          skirmishStore.getState().leaveNetSession(net.lobbyId);
          navigateApp('/lobbies', { replace: true });
          return;
        }
        console.warn('[netplay] leave on match end failed', error);
        setNetError('Couldn’t leave the match. Your seat is still active; check the connection and try again.');
        return;
      }
      clearPersistedNetIntent(net.lobbyId);
      skirmishStore.getState().leaveNetSession(net.lobbyId);
    }
    navigateApp('/lobbies', { replace: true });
  };

  const savePredrawnRegistration = (registration: PredrawnBoardCornerRegistration): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('predrawnCorners', serializePredrawnBoardPreviewRegistration(registration));
    if (!skirmishViewStore.getState().showGrid) skirmishViewStore.getState().toggle('showGrid');
    navigateApp(`${url.pathname}${url.search}${url.hash}`, { replace: true, scroll: false });
  };

  // A move-derived result is just as durable as resignation: each seat independently
  // reports the exact settled relay count/reason. The server publishes only matching
  // reports, so neither client can unilaterally forge the shared terminal state.
  useEffect(() => {
    if (!net?.terminalResult || netResultDisputed || !netSeatInteractive) return;
    let active = true;
    const lobbyId = net.lobbyId;
    const result = net.terminalResult;
    reportLobbyResult(lobbyId, {
      expectedMoveCount: result.expectedMoveCount,
      winner: result.winner,
      reason: result.reason,
    }).catch((error) => {
      console.warn('[netplay] deterministic result report failed', error);
      if (active && skirmishStore.getState().net?.lobbyId === lobbyId) {
        setNetError('Match ended, but its lobby result is waiting to reconnect…');
      }
    });
    return () => { active = false; };
  }, [net?.lobbyId, net?.terminalResult, netResultDisputed, netSeatInteractive]);

  // Free Move and Kill Unit wait for a board gesture. Win Battle is the one immediate
  // intervention: consume it from the mounted Battle so the in-HUD action resolves in
  // place and the Settings round trip returns before deciding the existing position.
  useEffect(() => {
    if (adminMode === 'win-battle') adminWinBattle();
  }, [adminMode, adminWinBattle]);

  // Bank the win the moment a campaign battle is won (idempotent).
  useEffect(() => {
    if (isCampaignPlay && routeLevel && game.winner === 'player') recordLevelWin(routeLevel.id);
  }, [isCampaignPlay, routeLevel, game.winner]);

  useEffect(() => {
    rememberAdminBattleHref(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  }, []);

  // Re-arm the netplay result card whenever a fresh game is built (winner clears), so a
  // dismissal from the previous match doesn't suppress the next one's result.
  useEffect(() => { if (!game.winner) setNetResultDismissed(false); }, [game.winner]);

  useEffect(() => {
    if (routeBoard) {
      setScenarioTimeControl(routeTimeControl ?? null);
    } else if (routeLevel && routeMode === 'test') {
      setScenarioTimeControl(routeLevel.timeControl ?? null);
    }
  }, [routeBoard, routeTimeControl, routeLevel, routeMode]);

  const replayLevel = () => {
    const level = activeLevel;
    if (!level) return;
    // Retry the SAME position when pieces are authored on the board: reuse the current seed so it
    // rebuilds byte-identical. Setup spawn events instead re-roll, since reshuffling the deal is
    // the point of event-driven deployment and reads better as a fresh deploy.
    const seed = runBattle
      ? runBattle.seed
      : spawnEventsForLevel(level).length ? Math.floor(Math.random() * 999999) + 1 : skirmishStore.getState().seed;
    if (runBattle) runBattle.onRestart();
    // ADR-0235: restarting healthy gameplay replaces match state in place. The
    // already-painted board and HUD remain ready, so the new clock may start
    // immediately without routing through surface acquisition.
    restartSkirmish({ seed, level, activityId: runBattle?.activityId ?? null });
  };

  // The title-bar ornament diamond doubles as a Retry control in single-player (see the
  // stud TitleBarSlot below). It restarts the CURRENT authored level (campaign / test /
  // board-link / shared map) with replayLevel's fixed-vs-random logic. Netplay never
  // reaches here — the stud is hidden there, since a local reset would desync the board.
  const retrySkirmish = () => {
    if (activeLevel) { replayLevel(); return; }
    navigateApp(PLAY_SKIRMISH_SELECTOR_HREF);
  };
  const startNewScenario = () => {
    if (activeLevel) { replayLevel(); return; }
    navigateApp(PLAY_SKIRMISH_SELECTOR_HREF);
  };
  // Show the Retry stud only once a single-player board is up (no netplay, no dead map link).
  const showRetryStud = boardSettled && !mapError && !routeLobby && !net;
  const retryStudLabel = activeLevel ? (isRunPlay ? 'Retry Battle' : isCampaignPlay ? 'Retry level' : 'Retry board') : 'Back to Play';
  const newScenarioLabel = activeLevel ? 'New attempt' : 'Choose board';

  // The next level in this campaign after the one just cleared (null on the last level or
  // before the workspace hydrates) — powers the victory "Continue" button.
  const nextLevel = useMemo(() => {
    if (!isCampaignPlay || !routeCampaignId || !routeLevel) return null;
    const camp = campaigns.find((c) => c.id === routeCampaignId);
    if (!camp) return null;
    const ref = nextLevelRef(orderedLevels(camp), routeLevel.id);
    return ref ? levelDocs[ref.levelId] ?? null : null;
  }, [isCampaignPlay, campaigns, levelDocs, routeCampaignId, routeLevel]);

  // Victory "Continue": drop straight into the next level. The /play route keys on the
  // pathname only, so a bare search-param nav (levelId=A → levelId=B) would change the URL
  // without remounting — the board would keep showing the cleared level. So swap the board
  // in place the same way Replay does, and update the URL (replace, not push, so Back lands
  // on the campaign rather than a stale board) so a reload/deep-link resolves the new level.
  const advanceToNextLevel = () => {
    if (!routeCampaignId || !nextLevel) return;
    navigateApp(
      `/play?campaignId=${encodeURIComponent(routeCampaignId)}&levelId=${encodeURIComponent(nextLevel.id)}`,
      { replace: true },
    );
    useCampaigns.getState().selectLevel(nextLevel.id);
    setRouteLevel(nextLevel);
    setBoardSurfaceReady(false);
    newSkirmish({ seed: Math.floor(Math.random() * 999999) + 1, level: nextLevel, deferClockStart: true });
  };

  // Warm the portrait cache for the units actually on the board so the HUD bust
  // paints instantly on the first click instead of waiting for a fetch+decode at
  // that moment. The HUD renders the bust live from the editor master render (via
  // <UnitPortrait>), so preload THOSE — not the no-longer-used baked PNGs — plus
  // the backdrop scene. Scoped to the current roster (both sides are focusable).
  useEffect(() => {
    const urls: string[] = [];
    for (const piece of game.pieces) {
      if (!isPlayablePieceType(piece.type)) continue;
      urls.push(runtimePortraitMasterSrc(
        piece.type as PortraitPiece,
        paletteForSide(piece.side, piece.palette) as PortraitPalette,
      ));
      urls.push(defaultBackgroundSet().portraits[piece.type]);
    }
    preloadImages(urls);
  }, [game.pieces]);

  useEffect(() => {
    // Multiplayer routes are driven by the netplay effect below, not this single-player
    // start/resume path — bail so it can't clobber the shared board with a local match.
    if (routeLobby) return undefined;
    // A live board must name canonical content (or carry an authored board/map link).
    // Bare /play and the retired ?random=1 path return to the selector instead of
    // synthesizing an item-less procedural match (ADR-0070/0074).
    if (!routeLevelId && !routeBoard && !routeMap && !runBattle) {
      navigateApp(PLAY_SKIRMISH_SELECTOR_HREF, { replace: true, scroll: false });
      return undefined;
    }
    // A manual refresh or the "new version available" reload (net/appUpdate) rebuilds
    // the in-memory store from scratch; without a saved copy that would silently
    // restart a live battle. Turn disk persistence on for real play, off for the
    // editor's ephemeral Test Play and for one-off `?board=` link positions.
    setMatchPersistenceEnabled(!isTestPlay && !routeBoard && !routeMap);
    // Test-board controls (the CPU-delay floor) are live only for ?mode=test; leaving test mode
    // resets the floor so real/campaign play is never slowed.
    skirmishStore.getState().setTestMode(isTestPlay);
    // Deployment owns the visible position until its final choice has painted. It deliberately
    // does not initialize or persist a live match yet; the layout effect above promotes that
    // exact mounted presentation when the Run document advances to Battle.
    if (runDeployment && runBattle) {
      setRouteLevel(runBattle.level);
      setBoardSettled(true);
      return;
    }

    // Re-running this setup inside the same mounted battle scene should resume, not
    // restart: its instance-owned store already holds the live board. Only build a
    // fresh game when there isn't a matching in-progress one — i.e. the
    // first launch, after a finished game, or when a different level is opened.
    const shouldStartFresh = (levelId: string | null, activityId: string | null = null): boolean =>
      shouldStartFreshSkirmish(skirmishStore.getState(), levelId, activityId);
    const freshSeed = () => runBattle?.seed ?? Math.floor(Math.random() * 999999) + 1;
    // Dev A/B lever: `?ai=greedy` pits you against the legacy random-capture
    // enemy; anything else gets the objective-aware search AI.
    const ai = new URLSearchParams(window.location.search).get('ai') === 'greedy' ? 'greedy' as const : 'search' as const;

    // Enter the board for `levelId`: keep the live in-memory match if it's the one
    // asked for (a route change, not a reload); else resume the match saved to disk
    // for this level if one survived a reload; else start fresh. The saved board is
    // self-contained (full position), so resume needs no level document. It must match
    // both the Level and its owning activity: multiple Runs may reuse that Level.
    const startOrResume = (levelId: string, levelDoc: Level, activityId: string | null = null): void => {
      if (!shouldStartFresh(levelId, activityId)) return; // this scene store already holds this battle
      if (!isTestPlay) {
        const saved = loadMatch();
        if (saved && persistedMatchMatchesActivity(saved, levelId, activityId)) {
          resumeMatch(saved, { deferClockStart: true });
          return;
        }
      }
      newSkirmish({
        seed: freshSeed(),
        level: levelDoc,
        activityId,
        ai,
        deferClockStart: true,
      });
    };

    // A `?board=<code>` link plays an authored position straight away — decode it into a
    // fixed-placement level and start fresh (ephemeral, never persisted; see the
    // persistence toggle above). An invalid code stays loud instead of falling through
    // to a generated free match.
    if (routeBoard) {
      if (!routeBoardLevel) {
        setMapError('This board link isn’t valid.');
        setBoardSettled(true);
        return;
      }
      if (shouldStartFresh(routeBoardLevel.id)) newSkirmish({ seed: freshSeed(), level: routeBoardLevel, ai, deferClockStart: true });
      setBoardSettled(true);
      return;
    }

    // A `?map=<publicId>` link plays a SHARED user map: fetch its public snapshot (no sign-in) and
    // start fresh (ephemeral, like ?board=). Once fetched, routeLevel is set and this branch just
    // re-affirms the game on the effect's re-run (guarded so it never re-fetches in a loop).
    if (routeMap) {
      if (routeLevel) {
        if (shouldStartFresh(routeLevel.id)) newSkirmish({ seed: freshSeed(), level: routeLevel, ai, deferClockStart: true });
        setBoardSettled(true);
        return undefined;
      }
      let active = true;
      fetchPublicMap(routeMap)
        .then((level) => {
          if (!active) return;
          setMapError(null);
          if (shouldStartFresh(level.id)) newSkirmish({ seed: freshSeed(), level, ai, deferClockStart: true });
          setRouteLevel(level);
          setBoardSettled(true);
        })
        .catch(() => {
          if (!active) return;
          setMapError('This shared map isn’t available — the link may be wrong or the map was removed.');
          setBoardSettled(true);
        });
      return () => { active = false; };
    }

    if (runBattle) {
      setRouteLevel(runBattle.level);
      startOrResume(runBattle.level.id, runBattle.level, runBattle.activityId);
      setBoardSettled(true);
      return;
    }
    if (routeLevel) {
      startOrResume(routeLevel.id, routeLevel);
      setBoardSettled(true);
      return;
    }
    if (!routeLevelId) {
      navigateApp(PLAY_SKIRMISH_SELECTOR_HREF, { replace: true, scroll: false });
      return undefined;
    }
    const requestedLevelId = routeLevelId;
    let active = true;
    // Hydrate the shared workspace the same way the Play selector does so a deep-link /
    // reload resolves the same canonical level document as a clicked selection.
    ensureCampaignsHydrated()
      .then(() => {
        if (!active) return;
        if (routeCampaignId) useCampaigns.getState().selectCampaign(routeCampaignId);
        useCampaigns.getState().selectLevel(requestedLevelId);
        const level = useCampaigns.getState().levels[requestedLevelId] ?? null;
        if (!level) {
          setMapError('This level isn’t available — it may have been removed or the content service could not be reached.');
          setBoardSettled(true);
          return;
        }
        setRouteLevel(level);
        startOrResume(level.id, level);
        setBoardSettled(true);
      })
      .catch(() => {
        if (!active) return;
        setMapError('This level could not be loaded. Return to Play and try again.');
        setBoardSettled(true);
      });
    return () => { active = false; };
  }, [newSkirmish, resumeMatch, isTestPlay, routeBoard, routeBoardLevel, routeMap, routeCampaignId, routeLevel, routeLevelId, routeLobby, runBattle, runDeployment]);

  useEffect(() => {
    if (!runDeployment && playableSurfaceReady && sceneActivated) activateClock();
  }, [activateClock, playableSurfaceReady, runDeployment, sceneActivated]);

  // Multiplayer entry: `/play?lobby=<id>` enters a lobby's shared board. Both clients
  // build the SAME (level, seed) game; each side's moves relay through the lobby channel
  // and apply on the other client (no AI — see store.newNetMatch/applyRemoteMove). Runs
  // instead of the single-player effect above, which no-ops for lobby routes.
  useEffect(() => {
    if (!routeLobby) return undefined;
    let active = true;
    let unsubscribe: (() => void) | null = null;
    let sessionEpoch: number | null = null;
    let seatLeaseHeld = false;
    let seatLeaseFailure: 'unsupported' | 'unavailable' | 'error' | null = null;
    let releaseSeatLease: (() => void) | null = null;
    let relaySyncHalted = false;
    let relayAuthorityFrozen = false;
    const uncertainRecoveryTimers = new Set<number>();
    const uncertainRecoveryIntents = new Set<string>();
    const isResultAuthorityGate = (error: unknown): boolean => (
      error instanceof HttpError
      && Boolean(error.details?.includes('result_pending') || error.details?.includes('result_disputed'))
    );
    const freezeRelayInput = (): void => {
      relayAuthorityFrozen = true;
      setNetRelayFrozen(true);
      skirmishStore.getState().setNetMoveSink(null);
      skirmishStore.getState().freezeNetInput();
      for (const timer of uncertainRecoveryTimers) window.clearTimeout(timer);
      uncertainRecoveryTimers.clear();
      uncertainRecoveryIntents.clear();
    };
    setNetError(null);
    setNetResultDisputed(false);
    setNetSeatInteractive(false);
    setNetSeatFailure(null);
    setNetRelayFrozen(false);
    setBoardSettled(false);
    setMatchPersistenceEnabled(false);

    const belongsToThisMatch = (): boolean => {
      const state = skirmishStore.getState();
      return active
        && sessionEpoch !== null
        && state.sessionEpoch === sessionEpoch
        && state.net?.lobbyId === routeLobby;
    };

    // Apply a relayed move iff it's the next one this board expects. `i < moveCount` is an
    // already-applied move or this client's own echo (ignored); `i > moveCount` means we
    // missed some — backfill the gap. The `i === moveCount` guard makes every path
    // idempotent, so streamed frames and backfill can race safely.
    const applyRelayMove = (m: MoveEvent): void => {
      if (!belongsToThisMatch() || relaySyncHalted) return;
      const before = skirmishStore.getState().net?.moveCount ?? 0;
      if (m.i === before) {
        skirmishStore.getState().applyRemoteMove(m.pieceId, m.move, m.intentId);
        const after = skirmishStore.getState().net?.moveCount ?? 0;
        if (after === before) {
          // The expected next move could NOT be applied (a genuine desync / version skew).
          // Do not loop re-fetching the same doomed move — halt sync and surface it, so we
          // never enter the infinite-backfill trap.
          console.error('[netplay] desync: relayed move', m.i, 'could not apply; halting sync');
          relaySyncHalted = true;
          freezeRelayInput();
          setNetError('This match lost sync. Moves are frozen; concede/leave to close it without replaying a corrupt prefix.');
          return;
        }
        if (active && seatLeaseHeld) setNetError(null); // progress resumed — clear any transient send error
      } else if (m.i > before) {
        // A real gap (missed frames) — backfill. Only reachable when moveCount is genuinely
        // behind, never when it's stuck on an un-appliable move (guarded above).
        fetchMovesSince(routeLobby, before)
          .then((res) => { if (active) res.moves.forEach(applyRelayMove); })
          .catch((err) => console.warn('[netplay] move backfill failed', err));
      }
      // m.i < before: already applied (duplicate delivery) — ignore.
    };

    // A lost response does not make the gesture retryable under a new identity. Retry the
    // exact stable intent id until its idempotent response/echo arrives or an authoritative
    // different relay fills the slot. This remains safe even when the original POST lands
    // after a reconnect snapshot or after one of these retries.
    const scheduleUncertainRecovery = (expectedMoveCount: number, intentId: string, delayMs = 1200): void => {
      if (!seatLeaseHeld || relaySyncHalted || relayAuthorityFrozen) return;
      const recoveryKey = `${expectedMoveCount}:${intentId}`;
      if (uncertainRecoveryIntents.has(recoveryKey)) return;
      uncertainRecoveryIntents.add(recoveryKey);
      const timer = window.setTimeout(async () => {
        uncertainRecoveryTimers.delete(timer);
        if (!belongsToThisMatch()) {
          uncertainRecoveryIntents.delete(recoveryKey);
          return;
        }
        const pending = skirmishStore.getState().net?.pendingMove;
        if (
          !pending
          || pending.intentId !== intentId
          || pending.expectedMoveCount !== expectedMoveCount
          || !pending.uncertain
        ) {
          uncertainRecoveryIntents.delete(recoveryKey);
          return;
        }
        let resultAuthorityBlocked = false;
        try {
          const { move: echoed } = await postMove(
            routeLobby,
            pending.pieceId,
            pending.move,
            expectedMoveCount,
            intentId,
          );
          applyRelayMove(echoed);
        } catch (error) {
          console.warn('[netplay] stable move intent still awaiting authority', error);
          resultAuthorityBlocked = isResultAuthorityGate(error);
          try {
            const recovery = await fetchMovesSince(routeLobby, expectedMoveCount);
            if (belongsToThisMatch()) recovery.moves.forEach(applyRelayMove);
          } catch (recoveryError) {
            console.warn('[netplay] stable move intent backfill failed', recoveryError);
          }
          if (resultAuthorityBlocked) {
            freezeRelayInput();
            setNetError('The relay is frozen while the match result is confirmed.');
          }
        }
        const currentPending = skirmishStore.getState().net?.pendingMove;
        const shouldRearm = Boolean(
          belongsToThisMatch()
          && !resultAuthorityBlocked
          && !relayAuthorityFrozen
          && currentPending?.intentId === intentId
          && currentPending.expectedMoveCount === expectedMoveCount
        );
        // Hold the dedupe key through both awaited requests; a snapshot arriving while
        // either is in flight cannot spawn a parallel loop. Release only to arm one next beat.
        uncertainRecoveryIntents.delete(recoveryKey);
        if (shouldRearm) scheduleUncertainRecovery(expectedMoveCount, intentId, 2000);
      }, delayMs);
      uncertainRecoveryTimers.add(timer);
    };

    fetchLobby(routeLobby)
      .then(async ({ lobby }) => {
        if (!active) return;
        if (lobby.your_side === null) {
          setNetError('Only seated players can enter this match. Returning to lobbies…');
          window.setTimeout(() => { if (active) navigateApp('/lobbies', { replace: true }); }, 1400);
          return;
        }
        setNetResultDisputed(lobby.result_disputed);
        relayAuthorityFrozen = Boolean(lobby.result || lobby.result_pending || lobby.result_disputed);
        setNetRelayFrozen(relayAuthorityFrozen);
        // A waiting snapshot with a terminal result is a reconnect after the other seat
        // forfeited. Its board metadata remains replayable so the seated player can see the
        // result. A genuinely unstarted lobby has no result and belongs on the lobby screen.
        if (
          (lobby.phase !== 'started' && !lobby.result && !lobby.result_pending && !lobby.result_disputed)
          || lobby.level_id === null
          || lobby.seed === null
        ) {
          setNetError('This match hasn’t started yet. Returning to lobbies…');
          window.setTimeout(() => { if (active) navigateApp('/lobbies', { replace: true }); }, 1400);
          return;
        }
        const level = lobby.level_snapshot ?? null;
        if (!level || level.id !== lobby.level_id) {
          setNetError('This match’s pinned level snapshot is unavailable; reconnect cannot safely continue.');
          return;
        }
        // Lobby clocks require a server-owned shared deadline. The current store clock is
        // intentionally local/single-player, so admitting a timed level here would create two
        // different games. Refuse it until the multiplayer clock contract is implemented.
        if (level.timeControl) {
          setNetError('Timed levels aren’t supported in multiplayer yet. Returning to lobbies…');
          window.setTimeout(() => { if (active) navigateApp('/lobbies', { replace: true }); }, 1800);
          return;
        }
        const seat: PlayingSide = lobby.your_side;
        // One browser tab owns interactive authority for a seat. The Web Lock is held for
        // this effect's lifetime, making the localStorage journal + first POST atomic with
        // respect to other tabs: secondary tabs may watch, but cannot create a competing id.
        const seatLease = await acquireNetSeatLease(routeLobby, seat);
        seatLeaseHeld = seatLease.acquired;
        if (seatLease.acquired) releaseSeatLease = seatLease.release;
        else seatLeaseFailure = seatLease.reason;
        if (!active) {
          releaseSeatLease?.();
          return;
        }
        setNetSeatInteractive(seatLeaseHeld);
        setNetSeatFailure(seatLeaseFailure);
        skirmishStore.getState().newNetMatch({ lobbyId: routeLobby, localSide: seat, level, seed: lobby.seed });
        if (!seatLeaseHeld || lobby.result || lobby.result_pending || lobby.result_disputed) {
          skirmishStore.getState().freezeNetInput();
        }
        sessionEpoch = skirmishStore.getState().sessionEpoch;
        // Relay this client's local moves to the lobby channel. Server-sequenced: the move
        // applies here only when it echoes back, so a failed POST is a no-op the seat retries.
        if (seatLeaseHeld && !lobby.result && !lobby.result_pending && !lobby.result_disputed) skirmishStore.getState().setNetMoveSink((pieceId, move, expectedMoveCount, intentId) => {
          postMove(routeLobby, pieceId, move, expectedMoveCount, intentId)
            .then(({ move: echoed }) => {
              // The HTTP response and SSE frame race; applyRelayMove is indexed/idempotent,
              // so whichever arrives first acknowledges the one pending intent.
              applyRelayMove(echoed);
            })
            .catch(async (err) => {
              console.warn('[netplay] relay POST failed; checking authoritative log', err);
              if (!belongsToThisMatch()) return;
              setNetError('Move delivery is uncertain — checking the match…');
              try {
                // A response can be lost after the server accepted the move. Re-read from
                // the pending relay index, then retain and retry the SAME stable intent if
                // it is not present yet. It is never unlocked into a request-arrival race.
                const recovery = await fetchMovesSince(routeLobby, expectedMoveCount);
                if (!belongsToThisMatch()) return;
                recovery.moves.forEach(applyRelayMove);
                const pending = skirmishStore.getState().net?.pendingMove;
                if (pending?.expectedMoveCount === expectedMoveCount && pending.intentId === intentId) {
                  skirmishStore.getState().markNetMoveUncertain(expectedMoveCount);
                  if (isResultAuthorityGate(err)) {
                    freezeRelayInput();
                    setNetError('The relay is frozen while the match result is confirmed.');
                  } else {
                    setNetError('Move delivery is uncertain — retrying the same move…');
                    scheduleUncertainRecovery(expectedMoveCount, intentId);
                  }
                } else {
                  setNetError(null);
                }
              } catch (recoveryError) {
                // Keep the intent pending: its server outcome is still unknown, and an SSE
                // echo or reconnect backfill can safely settle it later.
                console.warn('[netplay] could not verify failed move POST', recoveryError);
                if (belongsToThisMatch()) {
                  skirmishStore.getState().markNetMoveUncertain(expectedMoveCount);
                  if (isResultAuthorityGate(err)) {
                    freezeRelayInput();
                    setNetError('The relay is frozen while the match result is confirmed.');
                  } else {
                    setNetError('Couldn’t confirm that move. Retrying the same intent…');
                    scheduleUncertainRecovery(expectedMoveCount, intentId);
                  }
                }
              }
            });
        });
        else setNetError(seatLeaseFailure === 'unavailable'
          ? 'This seat is active in another tab. This tab is read-only; close the other tab and reload to take control.'
          : 'Safe multiplayer control is unavailable in this browser. Update it or use a browser with Web Locks support.');
        // Relay a resignation the same way: the game ends only when the server's result
        // frame echoes back (onLobby → concludeNet), so a failed POST is a retryable no-op.
        if (seatLeaseHeld) skirmishStore.getState().setNetResignSink(() => {
          resignLobby(routeLobby).catch((err) => {
            console.warn('[netplay] resign POST failed', err);
            if (active) setNetError('Couldn’t send your resignation — try again.');
          });
        });
        // Catch up on any moves already made (reconnect / entering mid-game), then stream.
        // A terminal lobby frame is applied only AFTER its entire move prefix; otherwise a
        // result arriving beside a missed move would stamp `winner` onto a stale board and
        // make the missing relay permanently unapplyable.
        let initialSynchronized = false;
        try {
          const back = await fetchMovesSince(routeLobby, 0);
          if (active) back.moves.forEach(applyRelayMove);
          initialSynchronized = (skirmishStore.getState().net?.moveCount ?? 0) >= lobby.move_count;
        } catch (err) {
          console.warn('[netplay] initial backfill failed', err);
          initialSynchronized = lobby.move_count === 0;
        }
        if (!active) return;
        // If the match was already conceded before we entered (late join / reload after a
        // resign), the lobby snapshot carries the terminal result — end the game now. The
        // SSE connect frame re-delivers it too, but concludeNet is idempotent.
        if (lobby.result && initialSynchronized) {
          skirmishStore.getState().concludeNet(lobby.result.winner, lobby.result.reason);
        } else if (lobby.result) {
          setNetError('The match ended, but its final moves are still reconnecting…');
        }
        // A reload restores the durable gesture before this board is rebuilt. Once its
        // entire prefix is synchronized, resume the SAME idempotent request; never let a
        // fresh click replace an in-flight identity merely because React remounted.
        const restoredPending = skirmishStore.getState().net?.pendingMove;
        if (
          seatLeaseHeld
          && !lobby.result
          && !lobby.result_pending
          && !lobby.result_disputed
          && initialSynchronized
          && restoredPending
          && restoredPending.expectedMoveCount === skirmishStore.getState().net?.moveCount
        ) {
          setNetError('Recovering your pending move…');
          scheduleUncertainRecovery(restoredPending.expectedMoveCount, restoredPending.intentId, 100);
        } else if (restoredPending && restoredPending.expectedMoveCount > lobby.move_count) {
          setNetError('This match’s relay history is older than your pending move; input is locked to prevent a duplicate.');
        }
        unsubscribe = subscribeLobbyChannel(routeLobby, {
          onMove: applyRelayMove,
          onLobby: (l) => {
            if (!active) return;
            setNetResultDisputed(l.result_disputed);
            const relayFrozen = Boolean(l.result || l.result_pending || l.result_disputed);
            setNetRelayFrozen(relayFrozen || relaySyncHalted);
            if (relayFrozen || relaySyncHalted) {
              freezeRelayInput();
            }
            void (async () => {
              if (relaySyncHalted) {
                // Keep lifecycle/result frames alive so an explicit concession can still
                // resolve the match; never fetch or apply another move prefix.
                if (l.result?.reason === 'resign') {
                  skirmishStore.getState().concludeNet(l.result.winner, l.result.reason);
                }
                return;
              }
              let synchronized = true;
              const before = skirmishStore.getState().net?.moveCount ?? 0;
              if (l.move_count > before) {
                try {
                  const recovery = await fetchMovesSince(routeLobby, before);
                  if (!active) return;
                  recovery.moves.forEach(applyRelayMove);
                } catch (err) {
                  synchronized = false;
                  console.warn('[netplay] reconnect backfill failed', err);
                  if (active) setNetError('The match is reconnecting its missing moves…');
                }
              }

              if (!active) return;
              const currentNet = skirmishStore.getState().net;
              synchronized = synchronized && !!currentNet && currentNet.moveCount >= l.move_count;

              // This also covers reload recovery when the initial backfill failed: the
              // first later snapshot that catches up re-arms the one durable identity.
              if (
                synchronized
                && seatLeaseHeld
                && !l.result_pending
                && !l.result_disputed
                && currentNet?.pendingMove?.uncertain
                && currentNet.pendingMove.expectedMoveCount === currentNet.moveCount
              ) {
                scheduleUncertainRecovery(
                  currentNet.pendingMove.expectedMoveCount,
                  currentNet.pendingMove.intentId,
                  100,
                );
              }

              // Terminal state is authoritative only with its full ordered move prefix.
              if (l.result && synchronized) {
                skirmishStore.getState().concludeNet(l.result.winner, l.result.reason);
              }

              // Retry a locally-derived result on every authoritative snapshot until the
              // server reflects it. The endpoint is exact-count + idempotent.
              const localResult = skirmishStore.getState().net?.terminalResult;
              if (!l.result && !l.result_disputed && localResult && seatLeaseHeld) {
                reportLobbyResult(routeLobby, {
                  expectedMoveCount: localResult.expectedMoveCount,
                  winner: localResult.winner,
                  reason: localResult.reason,
                }).catch((err) => console.warn('[netplay] result retry failed', err));
              }
              if (l.result_disputed) {
                setNetError('The clients disagree about the terminal position. Concede/leave to close this recovery.');
              } else if (l.result_pending && !localResult) {
                setNetError('The other client reported a terminal position. The relay is frozen while you reconnect or concede.');
              }

              if (l.phase === 'closed') {
                if (l.result) {
                  // Closed lobbies remain durable tombstones until both seats acknowledge
                  // them, so keep the final board/result visible until this seat Returns.
                  if (synchronized) setNetError(null);
                  return;
                }
                if (l.result_disputed) {
                  setNetError('The clients disagree about the terminal position. Review the board, then concede/leave to close recovery.');
                  return;
                }
                if (l.result_pending || localResult) {
                  setNetError('Match ended — waiting for both clients to confirm the result…');
                  return;
                }
                setNetError('The other player left the match. Returning to lobbies…');
                if (unsubscribe) { unsubscribe(); unsubscribe = null; }
                window.setTimeout(() => { if (active) navigateApp('/lobbies', { replace: true }); }, 1600);
                return;
              }
              if (l.phase === 'waiting' && !l.result && !l.result_pending && !l.result_disputed && !localResult) {
                setNetError('The match returned to the lobby. Returning to lobbies…');
                if (unsubscribe) { unsubscribe(); unsubscribe = null; }
                window.setTimeout(() => { if (active) navigateApp('/lobbies', { replace: true }); }, 1400);
              }
            })();
          },
        });
        setBoardSettled(true);
      })
      .catch((err) => {
        if (!active) return;
        console.warn('[netplay] failed to load lobby', err);
        setNetError('Couldn’t load this lobby.');
      });

    return () => {
      active = false;
      skirmishStore.getState().setNetMoveSink(null);
      skirmishStore.getState().setNetResignSink(null);
      if (unsubscribe) unsubscribe();
      for (const timer of uncertainRecoveryTimers) window.clearTimeout(timer);
      uncertainRecoveryTimers.clear();
      uncertainRecoveryIntents.clear();
      setNetSeatInteractive(false);
      setNetSeatFailure(null);
      releaseSeatLease?.();
      releaseSeatLease = null;
      skirmishStore.getState().leaveNetSession(routeLobby);
    };
  }, [routeLobby]);

  // A complete pre-drawn plate is the sole source of environment pixels (ADR-0158).
  // Do not even resolve the ordinary world image into CSS until the chosen board has
  // settled and proved that it needs that layer; this prevents a hidden wasted request.
  const screenStyle = shouldLoadSkirmishWorldBackground(
    boardSettled,
    screenPredrawnBackgroundActive,
  )
    ? {
        '--skirmish-world-bg': `url("${defaultBackgroundSet().world}")`,
      } as CSSProperties
    : undefined;
  const battleHud = boardSettled && !boardSurfaceError ? (
    <SkirmishHud
      canStartNewSkirmish={Boolean(activeLevel) && !isCampaignPlay && !isRunPlay}
      onRestart={showRetryStud ? retrySkirmish : null}
      restartLabel={activeLevel ? (isRunPlay ? 'Restart Battle' : isCampaignPlay ? 'Restart level' : 'Restart board') : 'Restart skirmish'}
      onNewSkirmish={startNewScenario}
      newSkirmishLabel={newScenarioLabel}
      showClockControl={!isCampaignPlay}
      clockControlValue={activeLevel ? scenarioTimeControl : undefined}
      onClockControlChange={activeLevel ? setScenarioTimeControl : undefined}
      returnHref={returnHref}
      returnLabel={returnIsEditor ? 'Back to editor' : 'Back'}
      netInteractive={netSeatInteractive}
      onOpenPredrawnRegistration={predrawnPreview ? () => setPredrawnPickerOpen(true) : null}
      onPawnCashOut={runBattle?.onPawnCashOut ?? null}
      onAbandonRun={runBattle?.onAbandonRun ?? null}
      strategikonHref={strategikonHref}
      strategikonOpen={strategikonOpen}
    />
  ) : null;
  // The continuous Run scene registers one stable outer gameplay surface across Deployment and
  // Battle. Other play modes keep their existing HUD-owned readiness boundary.
  const hudContent = runBattle ? battleHud : battleHud ? (
    <SceneSurfaceReadiness
      surface="gameplay-hud"
      signature="gameplay-hud"
      readyToCompose={boardSurfaceReady}
      loadingLabel="Preparing controls…"
      onRetry={() => setHudSurfaceReady(false)}
      onPaintedChange={setHudSurfaceReady}
      showStatus={false}
    >
      {battleHud}
    </SceneSurfaceReadiness>
  ) : null;
  const battleWorkspaceLayer = (
    <>
      {runWorkspace}
      <GameplayWorkspaceSceneSlot
        className="strategikon-slot"
        sceneInstance={strategikonOpen ? routePath : `${strategikonBase}/strategikon`}
      >
        {strategikonOpen ? (
          <Strategikon
            path={routePath}
            search={routeSearch}
            run={runBattle ? useActiveRun.getState().run : null}
          />
        ) : null}
      </GameplayWorkspaceSceneSlot>
    </>
  );
  const battlePersistentOverlay = boardSettled && netError ? (
    <InnerChromeBox className="skirmish-status-chip skirmish-turn-plate" role="status" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 40 }}>
      <strong>{netError}</strong>
      <small>Multiplayer</small>
    </InnerChromeBox>
  ) : null;

  return (
    <SkirmishShell
      testId={runDeployment ? 'run-deployment' : 'skirmish'}
      className={runDeployment?.screenClassName ?? (screenPredrawnBackgroundActive ? 'is-predrawn-board' : '')}
      shellWorkspaceCoversLipsana={Boolean(runWorkspace) || strategikonOpen}
      titleBarContent={runDeployment ? runDeployment.titleBarContent : playableSurfaceReady ? (
        <div className="skirmish-topbar-status">
          {/* The battle clock is ALWAYS the middle chip on every play surface — a timed game
            counts down and an authored untimed level reads "∞ / No limit". Keeping the
            centre chip present means
            the turn plate and objective always flank a real element, so the clock stays
            page-centred over the title bar's diamond (equal-width flanks, see style.css). */}
          <TitleBarStatus className="skirmish-status-chip skirmish-turn-plate">
            <strong>{turnLabel}</strong>
            <small>{game.winner ? 'Skirmish Complete' : 'Live Board'}</small>
          </TitleBarStatus>
          <TitleBarStatus className={`skirmish-status-chip skirmish-clock${clock && clock.remainingMs <= 20_000 ? ' danger is-low' : ''}`}>
            {clock ? (
              <>
                <strong>{formatClockMs(clock.remainingMs)}</strong>
                <small>{clock.incrementMs > 0 ? `+${clock.incrementMs / 1000}s / move` : 'Battle Clock'}</small>
              </>
            ) : (
              <>
                <strong className="skirmish-clock-unlimited" aria-label="No time limit">∞</strong>
                <small>No limit</small>
              </>
            )}
          </TitleBarStatus>
          <TitleBarStatus className="skirmish-status-chip skirmish-objective">
            <span className="skirmish-icon skirmish-icon-flag" aria-hidden="true" />
            <span>
              <strong>Objective</strong>
              <small>{objectiveGoal}</small>
            </span>
          </TitleBarStatus>
        </div>
      ) : null}
      lipsanonIds={runDeployment?.lipsanonIds ?? runBattle?.lipsanonIds ?? []}
      controlsContent={runDeployment?.controlsContent}
      hudProps={runDeployment ? { enableGlobalShortcuts: false } : undefined}
      screenStyle={runDeployment ? undefined : screenStyle ?? null}
      registerSceneSurface={Boolean(runBattle)}
      surfaceSignature={runBattle?.activityId}
      readyToCompose={playableSurfaceReady}
      hudContent={runDeployment ? undefined : hudContent}
    >

      {/* Test play is an authoring loop, so its return is a persistent title-bar action rather
          than an easy-to-miss floating chip. The target still comes from the validated exact
          editor snapshot above; this only gives that existing route its canonical home. */}
      {returnHref ? (
        <TitleBarControlContribution
          ariaLabel="Playtest navigation"
          controls={[{
            id: 'skirmish-return',
            kind: 'navigation',
            presentation: 'return',
            label: returnIsEditor ? '‹ Back to editor' : '‹ Back',
            destination: returnHref,
            title: returnIsEditor ? 'Return to the board editor with this position.' : 'Return to the previous screen.',
            testId: 'skirmish-return',
          }]}
        />
      ) : null}

      {/* The bottom-centre ornament diamond becomes a Retry button in single-player: one
          click restarts the current battle. Portals into the shell bar's stud slot (ADR-0042)
          so it sits exactly on the decorative nailhead without disturbing any other bar track. */}
      {!runDeployment && showRetryStud && playableSurfaceReady ? (
        <TitleBarSlot region="stud">
          <button
            type="button"
            className="skirmish-retry-stud"
            data-testid="retry-stud"
            aria-label={retryStudLabel}
            title={retryStudLabel}
            onClick={retrySkirmish}
          >
            <RestartGlyph className="skirmish-retry-stud-glyph" />
          </button>
        </TitleBarSlot>
      ) : null}

      <ShellViewportSwap
        className="skirmish-war-room"
        primaryClassName="skirmish-field"
        workspaceOpen={strategikonOpen || Boolean(runWorkspace)}
        persistent={battlePersistentOverlay}
        aria-label={runDeployment ? 'Run deployment battlefield' : strategikonOpen ? 'Battle reference workspace' : 'Skirmish battlefield'}
        data-scene-instance={strategikonBase}
        primary={(
          <>
          <div className="skirmish-board-frame">
            {mapError ? (
              <InnerChromeBox className="skirmish-status-chip skirmish-turn-plate" role="alert" style={{ gap: 10 }}>
                <strong>{mapError}</strong>
                <ChromeNavButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')} to={returnHref ?? PLAY_SKIRMISH_SELECTOR_HREF}>
                  {returnIsEditor ? 'Back to editor' : 'Back to Play'}
                </ChromeNavButton>
              </InnerChromeBox>
            ) : boardSettled ? (
              <>
                {/* ADR-0235: Restart changes match state, not board identity. Keep this
                  compositor mounted so pieces return to their starting positions without
                  hiding, reacquiring, or replaying the board's first-frame lifecycle. */}
                <SkirmishBoard
                  interactive={!runDeployment && sceneActivated && (!net || (netSeatInteractive && !netRelayFrozen))}
                  surfaceState={presentedDeploymentSurface}
                  renderCellOverlay={runDeployment?.renderCellOverlay}
                  boardOverlay={runDeployment?.boardOverlay}
                  className={runDeployment?.boardClassName}
                  ariaLabel={runDeployment?.boardAriaLabel}
                  onSurfaceReady={setBoardSurfaceReady}
                  onSurfaceError={setBoardSurfaceError}
                  onArrivingUnitIdsChange={runDeployment?.onArrivingUnitIdsChange}
                  reveal={playableSurfaceReady && sceneRevealed}
                  activate={!runDeployment && sceneActivated}
                  unitArrivals={sceneActivated ? 'active' : 'pending'}
                  predrawnReview={predrawnPreview ? {
                    src: predrawnPreview,
                    registration: predrawnRegistration,
                  } : undefined}
                />
                {!playableSurfaceReady && !boardSurfaceError ? (
                  <InnerChromeBox className="skirmish-status-chip skirmish-turn-plate skirmish-surface-loading" role="status">
                    <strong>Preparing battlefield…</strong>
                    <small>Composing terrain, units, and controls</small>
                  </InnerChromeBox>
                ) : null}
              </>
            ) : routeLobby ? (
              <InnerChromeBox className="skirmish-status-chip skirmish-turn-plate" role="status">
                <strong>{netError ?? 'Connecting…'}</strong>
                <small>Multiplayer</small>
              </InnerChromeBox>
            ) : routeMap ? (
              // A cold shared-map link fetches its snapshot before the board can mount.
              <InnerChromeBox className="skirmish-status-chip skirmish-turn-plate" role="status">
                <strong>Loading map…</strong>
                <small>Shared map</small>
              </InnerChromeBox>
            ) : null}
          </div>
          </>
        )}
      >
        {battleWorkspaceLayer}
      </ShellViewportSwap>
      {predrawnPickerOpen && predrawnPreview ? (
        <PredrawnCornerPicker
          src={predrawnPreview}
          initialRegistration={predrawnRegistration}
          columns={activeLevel?.board.cols ?? 1}
          rows={activeLevel?.board.rows ?? 1}
          onChange={savePredrawnRegistration}
          onClose={() => setPredrawnPickerOpen(false)}
        />
      ) : null}

      {isCampaignPlay && routeCampaignId && routeLevel && game.winner && (
        <div className="campaign-result" role="dialog" aria-modal="true" aria-label="Battle result" data-testid="campaign-result">
          <div className="settings-frame campaign-result-panel">
            <h2>{game.winner === 'player' ? 'Victory' : game.winner === 'draw' ? 'Draw' : 'Defeat'}</h2>
            <p>{routeLevel.name} — {resultDetail ?? objectiveGoal}</p>
            <div className="campaign-result-actions">
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button')} onClick={replayLevel}>
                {game.winner === 'player' ? 'Replay' : 'Retry'}
              </ChromeButton>
              {game.winner === 'player' && nextLevel ? (
                <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')} onClick={advanceToNextLevel}>
                  Continue
                </ChromeButton>
              ) : (
                <ChromeNavButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')} to={playCampaignSelectorHref(routeCampaignId)}>
                  Back to Campaign
                </ChromeNavButton>
              )}
            </div>
          </div>
        </div>
      )}

      {!runDeployment && isRunPlay && runBattle && routeLevel && game.winner && (
        <div className="campaign-result" role="dialog" aria-modal="true" aria-label="Run Battle result" data-testid="run-battle-result">
          <div className="settings-frame campaign-result-panel">
            <h2>{game.winner === 'player' ? 'Victory' : game.winner === 'draw' ? 'Draw' : 'Defeat'}</h2>
            <p>{routeLevel.name} — {resultDetail ?? objectiveGoal}</p>
            <div className="campaign-result-actions">
              {game.winner === 'player' ? (
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                  onClick={() => runBattle.onVictory({
                    survivingUnitIds: game.pieces
                      .filter((piece) => piece.alive && piece.side === 'player' && piece.id.startsWith('run-'))
                      .map((piece) => piece.id),
                    turns: turnsElapsed,
                  })}
                >
                  Continue
                </ChromeButton>
              ) : (
                <ChromeButton unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                  onClick={replayLevel}
                >
                  Retry
                </ChromeButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Netplay has no campaign result flow: a decided match gets its own result card with
          the way out (leaving via the app-shell nav was the only prior option). "View board"
          dismisses it to review the final position, leaving the persistent exit chip below. */}
      {net && game.winner && !netResultDismissed && (
        <div className="campaign-result" role="dialog" aria-modal="true" aria-label="Match result" data-testid="netplay-result">
          <div className="settings-frame campaign-result-panel">
            <h2>{turnLabel}</h2>
            <p>{netResultDisputed
              ? 'The clients disagree about this terminal position. Leaving concedes the match and closes recovery.'
              : `Multiplayer skirmish — ${resultDetail ?? objectiveGoal}`}</p>
            <div className="campaign-result-actions">
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button')} data-testid="netplay-view-board" onClick={() => setNetResultDismissed(true)}>
                View board
              </ChromeButton>
              <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')} data-testid="netplay-return" onClick={returnToLobbies}>
                {netResultDisputed ? 'Concede and leave' : 'Return to lobbies'}
              </ChromeButton>
            </div>
          </div>
        </div>
      )}

      {/* Persistent, non-blocking exit once the result card is dismissed — so reviewing the
          final board never strands the player without a way back to the lobby list. */}
      {net && game.winner && netResultDismissed && (
        <div
          role="status"
          style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <InnerChromeBox className="skirmish-status-chip skirmish-turn-plate">
            <strong>{turnLabel}</strong>
            <small>{netResultDisputed ? 'Result disputed' : 'Match complete'}</small>
          </InnerChromeBox>
          <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')} data-testid="netplay-return-persistent" onClick={returnToLobbies}>
            {netResultDisputed ? 'Concede and leave' : 'Return to lobbies'}
          </ChromeButton>
        </div>
      )}
    </SkirmishShell>
  );
}

/** Closed battlefield activity: every mount receives one isolated session store. */
export function Skirmish(props: SkirmishProps = {}): ReactElement {
  return (
    <SkirmishStoreProvider>
      <SkirmishSession {...props} />
    </SkirmishStoreProvider>
  );
}
