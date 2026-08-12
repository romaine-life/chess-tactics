// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
const runArmyWorkspace = readFileSync(new URL('./RunArmyWorkspace.tsx', import.meta.url), 'utf8');
const runExpunctioWorkspace = readFileSync(new URL('./RunExpunctioWorkspace.tsx', import.meta.url), 'utf8');
const runAdlectioMark = readFileSync(new URL('./RunAdlectioMark.tsx', import.meta.url), 'utf8');
const tilePreview = readFileSync(new URL('./TilePreview.tsx', import.meta.url), 'utf8');
const runTitleBarChips = readFileSync(new URL('./RunTitleBarChips.tsx', import.meta.url), 'utf8');
const titleBarControls = readFileSync(new URL('./shell/TitleBarControls.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const enchiridionSource = readFileSync(new URL('./Enchiridion.tsx', import.meta.url), 'utf8');
const sceneManifest = readFileSync(new URL('./shell/sceneManifest.ts', import.meta.url), 'utf8');
const sceneDirector = readFileSync(new URL('./shell/sceneDirector.ts', import.meta.url), 'utf8');
const sceneBoundary = readFileSync(new URL('./shell/SceneBoundary.tsx', import.meta.url), 'utf8');
const titleBarSlot = readFileSync(new URL('./shell/TitleBarSlot.tsx', import.meta.url), 'utf8');
const titleBarPortal = readFileSync(new URL('./shell/TitleBarPortalContext.tsx', import.meta.url), 'utf8');
const runWorkspace = readFileSync(new URL('./RunWorkspace.tsx', import.meta.url), 'utf8');
const runUnitInspectionScene = readFileSync(new URL('./RunUnitInspectionScene.tsx', import.meta.url), 'utf8');
const runCard = readFileSync(new URL('./RunCard.tsx', import.meta.url), 'utf8');
const runCardPile = readFileSync(new URL('./RunCardPile.tsx', import.meta.url), 'utf8');
const runCardFlight = readFileSync(new URL('./runCardFlightView.tsx', import.meta.url), 'utf8');
const strategikonTitleNavigation = readFileSync(new URL('./StrategikonTitleNavigation.tsx', import.meta.url), 'utf8');
const runCardFace = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
const runBattlePreview = readFileSync(new URL('./RunBattlePreview.tsx', import.meta.url), 'utf8');
const levelInfoCompact = readFileSync(new URL('./LevelInfoCompact.tsx', import.meta.url), 'utf8');
const chromeDividedGrid = readFileSync(new URL('./shared/ChromeDividedGrid.tsx', import.meta.url), 'utf8');
const chromeVerbRow = readFileSync(new URL('./shared/ChromeVerbRow.tsx', import.meta.url), 'utf8');
const runDeploymentCardStack = readFileSync(new URL('./RunDeploymentCardStack.tsx', import.meta.url), 'utf8');
const runLipsana = readFileSync(new URL('./Lipsana.tsx', import.meta.url), 'utf8');
const runSelfInspection = readFileSync(new URL('./RunSelfInspection.tsx', import.meta.url), 'utf8');
const skirmish = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const runBattleRetryButton = readFileSync(new URL('./RunBattleRetryButton.tsx', import.meta.url), 'utf8');
const runBattleUndoButton = readFileSync(new URL('./RunBattleUndoButton.tsx', import.meta.url), 'utf8');
const runDeploymentRerollButton = readFileSync(new URL('./RunDeploymentRerollButton.tsx', import.meta.url), 'utf8');
const skirmishShell = readFileSync(new URL('./SkirmishShell.tsx', import.meta.url), 'utf8');
const runForm = readFileSync(new URL('./RunForm.tsx', import.meta.url), 'utf8');
const skirmishBoard = readFileSync(new URL('../render/SkirmishBoard.tsx', import.meta.url), 'utf8');
const skirmishHud = readFileSync(new URL('./SkirmishHud.tsx', import.meta.url), 'utf8');
const chromeBox = readFileSync(new URL('./shared/ChromeBox.tsx', import.meta.url), 'utf8');
const houseSelect = readFileSync(new URL('./shared/HouseSelect.tsx', import.meta.url), 'utf8');
const chromeSurfacePolicy = readFileSync(new URL('./shared/chromeSurfacePolicy.ts', import.meta.url), 'utf8');
const paintedSurfaceBoundary = readFileSync(new URL('./shell/PaintedSurfaceBoundary.tsx', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const gameStore = readFileSync(new URL('../game/store.ts', import.meta.url), 'utf8');
const matchPersistence = readFileSync(new URL('../game/matchPersistence.ts', import.meta.url), 'utf8');
const useRunCraft = readFileSync(new URL('./useRunCraft.ts', import.meta.url), 'utf8');
const craftedRunLanding = readFileSync(new URL('./craftedRunLanding.ts', import.meta.url), 'utf8');
const bonaVacantia = readFileSync(new URL('./RunBonaVacantia.tsx', import.meta.url), 'utf8');
const lipsanonFlight = readFileSync(new URL('./runLipsanonFlightView.tsx', import.meta.url), 'utf8');
const sceneContinuity = readFileSync(new URL('./shell/SceneContinuity.tsx', import.meta.url), 'utf8');

describe('Run chrome hierarchy', () => {
  it('admits every Run phase through the form-owned shell and HUD', () => {
    const metaControls = runScreen.match(
      /function RunMetaControls\b[\s\S]*?\r?\n}\r?\n\r?\nfunction ArrangedDeploymentControls/,
    )?.[0] ?? '';

    expect(runForm).toContain('export function createRunForm');
    expect(runForm).toContain('add(activity: RunActivity): ReactElement');
    expect(runForm).toContain('<SkirmishShell');
    expect(skirmishShell).toContain('<SkirmishHud {...hudProps} controlsContent={controlsContent} />');
    expect(skirmish).toContain('function SkirmishSession');
    expect(skirmish).toContain('runForm: RunForm;');
    expect(skirmish).toContain('return runForm.add(runActivity({');
    expect(skirmish).not.toContain('titleBarContent: ReactNode;');
    expect(runScreen).toContain('const form = createRunForm({');
    expect(runScreen).toContain('<RunTitleBarStatus run={shellRun} path={routePath} search={routeSearch} view={view} battlefieldMounted={battlefieldActive} />');
    expect(skirmish).toMatch(/export function Skirmish\b[\s\S]*?<SkirmishStoreProvider>/);
    expect(skirmishShell).toContain('<SceneSurfaceReadiness');
    expect(skirmishShell).toContain('surface="gameplay-hud"');
    expect(skirmishShell).toContain('readyToCompose={readyToCompose}');
    expect(runScreen).not.toContain('<SkirmishShell');
    expect(runScreen).toContain('readyToCompose: hydrated');
    expect(runScreen).not.toContain("classList.add('skirmish-active')");
    expect(runScreen).toMatch(/<RunMetaControls[\s\S]*?run=\{shellRun\}[\s\S]*?onNavigate=\{navigateRunView\}/);
    expect(metaControls).not.toContain('inert=');
    expect(metaControls).not.toContain('adlectioInFlight');
    // A phase with no sibling destination must not render a selected button which only
    // navigates back to itself. The navigation group exists only for real Sectio views.
    expect(metaControls).not.toContain('Run views');
    expect(metaControls).toContain("const sectio = run.phase === 'sectio' ? run.sectio : null;");
    expect(metaControls).toContain('SECTIO_WORKSPACE_VIEWS.map');
    expect(metaControls).toContain('RUN_WORKSPACE_VIEW_LABEL[candidate]');
    expect(metaControls).toContain('data-testid={`run-view-${candidate}`}');
    // The Run rail no longer carries Army/Lipsana: the Strategikon is Run-wide (ADR-0335)
    // and its Prosopography/Lipsanotheca render the same RunArmyWorkspace and held-lipsanon
    // codex, so a second entry point to them was a duplicate. The battle HUD keeps its own.
    expect(metaControls).not.toContain('Self inspection');
    expect(metaControls).not.toContain('<RunSelfInspectionControls');
    // The module keeps the view/address helpers; its button pair is gone with the rail
    // group and the battle-HUD group, so nothing renders Army/Lipsana entries any more.
    expect(runSelfInspection).not.toContain('ChromeButton');
    expect(runSelfInspection).toContain("url.searchParams.set('view', view)");
    expect(runScreen).toContain("current.pathname = '/run';");
    expect(runScreen).toContain('runWorkspaceHref(current.toString(), nextView)');
    expect(runScreen).toContain("navigateApp(nextHref, { replace: true, scroll: false })");
    expect(metaControls).toContain('Reset Sectio');
    expect(metaControls).toContain('Continue to next Battle');
    expect(metaControls).not.toContain('openingNeedsPurchase');
    expect(metaControls).not.toContain('Buy one card before continuing.');
    expect(metaControls).not.toContain('data-ui-sfx="gold"');
    expect(metaControls).not.toContain('<OuterChromeBox');
    expect(metaControls).not.toContain('data-chrome-unit="outer-panel"');
    expect(runArmyWorkspace).toContain('{profileAction ? (');
    expect(runArmyWorkspace).not.toContain('data-ui-sfx="gold"');
    expect(runArmyWorkspace).not.toContain('chromeConsumer="run-army-ledger"');
    expect(runArmyWorkspace).not.toContain('chromeConsumer="run-army-profile"');
    expect(runArmyWorkspace).toContain('<RunSceneViewport');
    expect(runArmyWorkspace).toContain('className="run-self-inspection-workspace run-army-workspace run-army-ledger"');
    expect(runLipsana).toContain("className: 'run-self-inspection-workspace run-lipsana-workspace'");
    expect(skirmishHud).toContain('<ShellControlsPanel');
    expect(skirmishHud).toContain('{controlsContent === undefined ? (');
    expect(runScreen).not.toContain('function RunShell');
    expect(runScreen).not.toContain('function RunControlsRail');
    expect(runScreen).not.toContain('chromeConsumer="run-controls"');
    expect(styleCss).not.toContain('.run-controls-panel');
    expect(styleCss).toMatch(/\.run-phase-workspace\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?grid-row:\s*2;/);
  });

  it('makes Run phase and workspace replacement a closed director-owned scene slot', () => {
    expect(runScreen).not.toContain('<SkirmishShell');
    expect(runScreen.match(/createRunForm\(/g)).toHaveLength(1);
    expect(runForm).toContain("const RUN_ACTIVITY = Symbol('run-activity')");
    expect(runForm).toContain('RunForm accepts only runActivity contributions.');
    expect(runScreen).toContain('sceneSnapshot: RunSceneSnapshot');
    expect(runScreen).toContain('<RunPresentationSceneSlot');
    expect(runScreen).toContain("&& (shellRun?.phase === 'deployment' || shellRun?.phase === 'battle' || reviewingWonBattle)");
    expect(runScreen).not.toContain('klerosisRun');
    expect(runScreen).toContain('const runSurfacePhase = sceneSnapshot.phase;');
    expect(runScreen).toContain('? `${shellRun.id}:battlefield:${shellRun.battleIndex}:${runSceneWorkspaceIdentity(sceneSnapshot.workspace)}`');
    expect(runScreen).toContain('<RunBattlefieldPanel');
    expect(runScreen).toContain('form={form}');
    expect(runScreen).not.toMatch(/if \([^)]*phase === 'deployment'[\s\S]{0,200}return \(/);
    expect(skirmish).toContain('presentedDeploymentSurface');
    expect(skirmish).toContain('preserveBoardPresentation: true');
    // A terminal review — and an earlier half-move held up for reading — both keep their
    // already-arrived position settled rather than replaying an entrance.
    expect(skirmish).toContain("unitArrivals={runBattleReviewTerminal || reviewSurface ? 'settled' : sceneActivated ? 'active' : 'pending'}");
    expect(skirmish).toContain('revealTransition="scene"');
    expect(skirmishBoard).toContain("data-reveal-transition={revealTransition}");
    expect(skirmishBoard).toContain('data-unit-arrivals={unitArrivals}');
    expect(skirmishBoard).toContain("if (unitArrivals === 'settled') arrivalPlansRef.current.clear()");
    expect(skirmish).toContain('onArrivingUnitIdsChange={reportArrivingUnitIds}');
    // A merely PLANNED unit is outside the arrival ledger, so seating a formation spends no
    // entrance and the promotion into Battle is what introduces — and voices — the army.
    expect(skirmishBoard).toContain('newlyVisibleArrivalPieces(visibleUnitIdsRef.current, deployedPieces)');
    expect(skirmishBoard).toContain('livePieces.filter((piece) => !plannedPieceIds.has(piece.id))');
    expect(skirmishBoard).toContain('for (const piece of deployedPieces) visibleUnitIdsRef.current.add(piece.id);');
    expect(skirmish).toContain('voiceDeployRollCall: true');
    expect(gameStore).toContain('if (!opts.preserveBoardPresentation || opts.voiceDeployRollCall) {');
    expect(runScreen).toContain('placeArrangedDeploymentCard(');
    expect(runScreen).not.toContain('pendingPlacementArrivalUnitIdRef');
    expect(runScreen).not.toContain('RunWorkspaceStages');
    expect(runScreen).not.toContain('window.history');
    expect(runScreen).toContain('const run = sceneSnapshot.run;');
    expect(runScreen).not.toMatch(/useActiveRun\(\(state\) => state\.run\)/);
    expect(skirmish).toContain('const runBattleLevel = runBattle?.level ?? null;');
    expect(skirmish).toContain('const runBattleActivityId = runBattle?.activityId ?? null;');
    expect(skirmish).toContain('const runBattleSeed = runBattle?.seed ?? null;');
    expect(skirmish).toContain('const runBattleReviewTerminal = runBattle?.reviewTerminalResult ?? false;');
    expect(skirmish).toContain('const runDeploymentActive = Boolean(runDeployment);');
    expect(skirmish).toContain('runBattleActivityId, runBattleLevel, runBattleReviewTerminal, runBattleSeed, runDeploymentActive]);');
    expect(styleCss).not.toContain('.run-stage');
    expect(sceneManifest).toContain("instance(SCENE_DEFINITIONS.runPhase, { phase: phaseIdentity })");
    expect(sceneManifest).toContain('workspace: runSceneWorkspaceIdentity(snapshot.workspace),');
    expect(sceneDirector).toContain("type: 'refresh-source'");
    expect(app).toContain("source: 'active-run'");
    expect(app).toContain('sceneSnapshot={scene.snapshot as RunSceneSnapshot}');
    expect(app).toContain('sceneTransitionRelationship');
    expect(app).toContain("transitionRelationship?.kind === 'scene-replacement'");
    expect(app).toContain("transitionRelationship?.kind === 'selection-change'");
    expect(app).toContain('data-scene-transition-relationship={transitionRelationship?.kind}');
    expect(sceneBoundary).toContain("visualRole === 'outgoing'");
    expect(sceneBoundary).toContain('directorPhase: ScenePhase');
    expect(sceneBoundary).toContain('target.inert = true');
    expect(titleBarSlot).toContain('const active = useSceneActivation()');

    // The persistent title bar creates route-owned portal hosts only at scene commit,
    // after a destination screen has already mounted; the slot lookup must therefore
    // watch for the host instead of sampling once and staying empty (missing Run
    // status chips on the muster screen).
    expect(titleBarPortal).toContain('MutationObserver');
    expect(titleBarPortal).toContain('observer.observe(document.body, { childList: true, subtree: true })');
  });

  it('derives full-scene crossfades and within-scene deselection from ownership', () => {
    // A Run workspace is a selection inside its phase. Its viewport is the named
    // transition target; Controls and the surrounding Run scene are not.
    expect(chromeBox).toContain('{...gameplayWorkspaceTransitionTarget()}');
    expect(chromeBox).toContain('<GameplayWorkspaceActivation>');
    expect(sceneManifest).toContain("'run/phase': 'gameplay-workspace'");
    expect(sceneManifest).toContain("kind: 'selection-change'");
    expect(sceneManifest).toContain("kind: 'scene-replacement'");
    expect(sceneManifest).toContain("path.snapshot.workspace.view === 'battle-review'");
    expect(sceneManifest).not.toContain('overlapsStateDrivenRunScene');
    expect(sceneManifest).not.toContain('sceneOverlapScope');
    expect(sceneBoundary).not.toContain('data-scene-overlap-scope');
    expect(styleCss).not.toContain('data-scene-overlap-scope');
    expect(styleCss).not.toContain('data-scene-overlap-region');
    expect(styleCss).toMatch(/\.scene-director\.is-exiting \[data-scene-transition-target\]\[data-scene-transition-active\]\s*\{[\s\S]*?opacity:\s*0;/);
    expect(styleCss).toMatch(/\.scene-director\.is-entering \[data-scene-transition-target\]\[data-scene-transition-active\]\s*\{[\s\S]*?opacity:\s*1;/);
    expect(sceneManifest).not.toContain("'out-in'");
    expect(sceneBoundary).not.toContain('data-scene-overlap-mode');
    expect(styleCss).not.toContain('data-scene-overlap-mode');
    expect(styleCss).toMatch(/\.scene-director\.is-entering \.scene-boundary\[data-scene-visual-role="outgoing"\]\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?transition:\s*opacity var\(--ds-duration-fade\) var\(--ds-ease-linear\);/);
    expect(styleCss).toMatch(/\.scene-director\.is-entering \[data-scene-transition-target\]\[data-scene-transition-active\]\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?transition:\s*opacity var\(--ds-duration-fade\) var\(--ds-ease-linear\);/);
    expect(styleCss).not.toContain('retire-then-reveal');
    expect(app).toContain("const homepageBackdropActive = scene.current.background === 'homepage'");
    expect(app).toContain("|| scene.destination?.background === 'homepage'");
    expect(app).toContain('{homepageBackdropActive ? (');
    // A shared element crossing either relationship follows the director's settlement,
    // not the lifetime of a selected workspace that deliberately unmounts in loading.
    expect(app).toContain('<SceneContinuityHost phase={scene.phase} generation={scene.generation}>');
    expect(sceneContinuity).toContain("if (phase !== 'current')");
    expect(sceneContinuity).toContain('awaitingSettlement.current = generation');
    expect(lipsanonFlight).toContain("options.handoff === 'scene-settled'");
    expect(runScreen).toContain('launchLipsanon={launchBonaLipsanon}');
    expect(runScreen).toMatch(/\{bonaLipsanonFlightElement\}[\s\S]*?\{formSurface\}/);
    expect(bonaVacantia).not.toContain('useLipsanonFlight(');
    // The panel and any environment artwork retained across sibling destinations are
    // rendered beside the swap, never inside its fading overlap region.
    expect(skirmishShell).toContain('className="shell-persistent-viewport-artwork"');
    expect(skirmishShell).toMatch(/\{persistentViewportArtwork \? \([\s\S]*?\) : null\}\s*\{shellWorkspaceCoversLipsana \? null : <LipsanonStrip lipsanonIds=\{lipsanonIds\} \/>\}\s*\{children\}/);
    expect(skirmishHud).toContain('<ShellControlsPanel');
  });

  it('replaces the complete left shell workspace for Army and Lipsana while preserving the covered phase', () => {
    expect(runScreen).not.toContain('function RunPhaseWorkspace');
    expect(runScreen).toContain("className: 'run-phase-workspace'");
    expect(runScreen).toContain("primaryClassName: 'run-phase-primary'");
    expect(runScreen).toContain("view === 'lipsana'");
    expect(runScreen).toContain('<LipsanaWorkspace lipsanonIds={shellRun.lipsana} />');
    expect(skirmish).toContain("className: 'skirmish-war-room'");
    expect(skirmish).toContain("primaryClassName: 'skirmish-field'");
    expect(runForm).toContain('const workspaceOpen = form.strategikonOpen || Boolean(form.inspectionWorkspace);');
    expect(skirmishShell).toContain('{shellWorkspaceCoversLipsana ? null : <LipsanonStrip lipsanonIds={lipsanonIds} />}');
    expect(runForm).toContain('{form.inspectionWorkspace}');
    expect(styleCss).toMatch(/\.shell-viewport-primary\[data-shell-workspace-covered\]\s*\{[\s\S]*?visibility:\s*hidden;/);
    expect(styleCss).toMatch(/\.run-phase-primary\s*>\s*\.run-workspace\s*\{[\s\S]*?grid-row:\s*1;/);
  });

  it('offers the Strategikon from the Controls title mark in every Run phase, not only Battle', () => {
    // Deployment, Sectio, and Victory are still the same Run: the reference workspace must
    // open from the same title mark Battle uses. Only an absent Run repairs the address.
    expect(runScreen).toContain("const strategikonOpen = sceneSnapshot.workspace.view === 'strategikon';");
    expect(runScreen).toContain('strategikonOpen,');
    expect(runForm).toContain('const strategikonPath = form.run ? form.routePath : null;');
    expect(runForm).toContain('strategikonPath,');
    expect(runForm).toContain('strategikonSearch: form.routeSearch,');
    expect(runForm).toContain('className="strategikon-slot"');
    expect(runForm).toContain('<Strategikon path={form.routePath} search={form.routeSearch} run={form.run} />');
    expect(runScreen).toContain('isStrategikonPath(routePath) && !run');
    expect(runScreen).not.toContain("sceneSnapshot.phase !== 'battle'");
    expect(skirmishHud).toContain('<StrategikonTitleNavigation path={strategikonPath} search={strategikonSearch} />');
    expect(skirmishHud).toContain('titleActions={strategikonNavigation}');
    expect(strategikonTitleNavigation).toContain('data-testid="strategikon-toggle"');
    expect(strategikonTitleNavigation).toContain('data-run-card-flight-target');
    expect(styleCss).toMatch(/\.strategikon-slot\s*\{[\s\S]*?position:\s*absolute;/);
    expect(styleCss).toMatch(/\.run-phase-workspace\s*\{[\s\S]*?position:\s*relative;/);
  });

  it('keeps Run abandonment at the bottom of Controls and removes redundant Battle resignation', () => {
    expect(runScreen).toContain('function useRunAbandon');
    expect(runScreen).toContain("title: 'Abandon this Run?'");
    expect(runScreen).toContain("tone: 'danger'");
    expect(runScreen).toContain('navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false })');
    expect(runScreen).toContain('data-testid="abandon-run"');
    expect(skirmishHud).toContain('onAbandonRun?: (() => void) | null');
    expect(skirmishHud).toContain('<span className="skirmish-eyebrow">Run</span>');
    expect(skirmish).toContain('canResign: !isRunPlay');
    expect(skirmishHud).toContain('canResign && !game.winner');
    expect(runScreen).not.toContain('TitleBarControlContribution');
  });

  it('uses the gold transaction cue and transfers adlected cards into the Chartulary', () => {
    // A purchase keeps the gold cue; the Run's free opening grant is not a transaction
    // and takes the card cue instead, from the same shared card primitive.
    expect(runCard).toContain("data-ui-sfx={grant ? 'card' : 'gold'}");
    expect(runScreen).toContain('useRunCardFlights()');
    expect(runScreen).toContain("document.querySelector('[data-run-card-flight-target]')");
    // The index is the seat's own drift/light clock (runCardLife.ts), not offer state.
    expect(runScreen).toContain('sectio.cardOffers.map((offer, index) => {');
    expect(runScreen).toContain('sectio.adlectedCardOfferIds.includes(offer.offerId)');
    expect(runScreen).toContain('<RunCardPile');
    expect(runCardPile).toContain('<RunCardBack');
    expect(runScreen).toContain('admitted by Adlectio and added to the Chartulary.');
    // A Sectio admits one card. The count stands over the row for the whole visit and a padlock
    // is laid on each survivor when the admission is spent; the two together are the whole
    // statement, so nothing pops up to announce it.
    expect(runScreen).toContain('They require compensation. Only one may be admitted.');
    expect(runScreen).toContain('locked={adlectioSpent}');
    expect(runScreen).toContain('disabled={adlectioSpent || run.goldTenths < offer.cost * GOLD_SCALE}');
    // The kit's own lock, not a mark drawn for this row -- and through the same installed
    // `app-ui` role every other mark on this screen resolves, not a second door to it.
    expect(runScreen).toContain("const RUN_SECTIO_LOCK_ICON_ROLE = 'ui-kit-icons-lock-png';");
    expect(runScreen).toContain('installedUiMedia(RUN_SECTIO_LOCK_ICON_ROLE)');
    expect(runCardPile).toContain("data-run-card-pile-lock={sealed ? 'locked' : 'open'}");
    // A locked offer stops asking: the drift and the gold emanation are settled through the
    // seat's own registered vars and paused, not deleted, so a card caught mid-drift comes down
    // onto its seat instead of snapping onto it.
    expect(runCardPile).toContain('const sealed = covered && locked;');
    expect(styleCss).toMatch(/\.run-card-pile\.is-locked\s*\{[\s\S]*?--run-card-float-rise:\s*0px;[\s\S]*?--run-card-glow:\s*0;/);
    expect(styleCss).toMatch(/\.run-card-pile\.is-locked \.run-card-action\s*\{\s*animation-play-state:\s*paused\s*!important;/);
    // A card you cannot take is not an error to be scolded for reaching toward.
    expect(styleCss).toMatch(/\.run-card-action:disabled\s*\{[\s\S]*?cursor:\s*default;/);
    // Supplied for the whole visit and CONCEALED until it locks, exactly as the back beneath it
    // is: a lock mounted at the moment of locking is fetched then too, and the survivors of an
    // Adlectio stand unmarked until it arrives.
    expect(runScreen).toContain('lockMediaUrl={lockMediaUrl}');
    // And it is PUT ON the card rather than switched on over it: it comes down onto the face and
    // fades up. At the speed a Run card moves -- the hover RAISE exactly, same duration, same
    // curve, and the same distance, so the Studio cannot tune the two of them apart.
    expect(styleCss).toMatch(/\.run-card-pile-lock\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?translate:\s*0 calc\(-1 \* var\(--run-card-hover-raise, 7px\)\);/);
    expect(styleCss).toMatch(/\.run-card-pile-lock\.is-locked\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?translate:\s*0 0;/);
    expect(styleCss).toMatch(/\.run-card-pile-lock\s*\{[\s\S]*?transition:[\s\S]*?opacity var\(--run-card-raise-duration\) var\(--run-card-raise-ease\),[\s\S]*?translate var\(--run-card-raise-duration\) var\(--run-card-raise-ease\);/);
    // The same two variables the hovered card's own raise is declared with -- one speed, named
    // once, so neither gesture can drift away from the other.
    expect(styleCss).toMatch(/\.run-card-alive \.run-card-action\s*\{[\s\S]*?translate var\(--run-card-raise-duration\) var\(--run-card-raise-ease\);/);
    // The settle and the light it takes with it stay on the hover settle's own timing.
    expect(styleCss).toMatch(/\.run-card-alive\s*\{[\s\S]*?--run-card-float-rise 240ms cubic-bezier\(0\.3, 0\.7, 0\.3, 1\),[\s\S]*?--run-card-glow 240ms cubic-bezier\(0\.3, 0\.7, 0\.3, 1\);/);
    expect(runScreen).not.toContain('run-sectio-cards-empty');
    expect(runCardFlight).toContain('<RunCard card={flight.offer} mode="reference" />');
    expect(runCard).not.toContain('run-card-purchased-indicator');
  });

  it('transfers the opening grant into the Chartulary on the same beat, carried past its phase', () => {
    // The Run's first card is admitted exactly as Adlectio admits one, so it gets the same
    // travel. It differs only in outliving its own screen: the take ends Bona Vacantia, so
    // the carry is retained until the director settles Deployment underneath it (ADR-0385).
    expect(runScreen).toContain("useRunCardFlights({ handoff: 'scene-settled' })");
    expect(runScreen).toContain('launchGrantCardFlight(card, source, target)');
    expect(runScreen).toContain('takeVacantiaCard(latest, coreId)');
    expect(runScreen).toContain('taken and added to the Chartulary.');
    expect(runCardFlight).toContain("handoff?: 'landing' | 'scene-settled'");
    expect(runCardFlight).toContain('onSceneSettled={retain ? settle : undefined}');
    expect(runCardFlight).toContain('if (!retain) settle();');
  });

  it('fills shell-owned Run destinations while Deployment uses the battlefield', () => {
    const playerRunSources = `${runScreen}\n${runArmyWorkspace}\n${runExpunctioWorkspace}\n${runBattlePreview}\n${runDeploymentCardStack}\n${runLipsana}`;
    const runWorkspaceRule = styleCss.match(/\.run-workspace\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(runWorkspace).toContain('export function RunSceneViewport');
    expect(runWorkspace).toContain('scene: RunViewportSceneSpec;');
    expect(runWorkspace).toContain('data-run-scene-view={scene.view}');
    expect(runWorkspace).toContain('className={`run-workspace ${scene.className ?? \'\'}`.trim()}');
    expect(runWorkspace).toContain('<ShellWorkspace');
    expect(runWorkspace).toContain('className="run-shell-workspace"');
    expect(runWorkspace).toContain('bodyClassName={`run-shell-workspace-content ${scene.contentClassName ?? \'\'}`.trim()}');
    expect(chromeBox).toContain('export function ShellWorkspace');
    expect(chromeBox).not.toContain('export function ShellWorkspaceBody');
    for (const testId of [
      'run-sectio-workspace',
      'run-battle-preview-workspace',
      'run-aftermath-workspace',
      'run-victory-workspace',
      'run-army-ledger-workspace',
      'run-army-profile-workspace',
      'run-expunctio-workspace',
      'run-lipsana-workspace',
      'run-loading-workspace',
      'run-empty-workspace',
    ]) {
      expect(playerRunSources).toMatch(new RegExp(`(?:data-testid="${testId}"|testId: '${testId}')`));
    }
    for (const retiredConsumer of [
      'run-draft',
      'run-deployment',
      'run-sectio',
      'run-victory',
      'run-army-ledger',
      'run-army-profile',
      'run-sell-units',
      'run-empty',
    ]) {
      expect(playerRunSources).not.toContain(`chromeConsumer="${retiredConsumer}"`);
    }
    expect(playerRunSources).not.toContain('<OuterChromeBox');
    expect(playerRunSources).not.toContain('<OuterChromeHeader');
    expect(playerRunSources).not.toContain('<select');
    expect(playerRunSources).not.toContain('type="checkbox"');
    expect(runScreen).not.toContain('<HouseSelect');
    expect(runArmyWorkspace).toContain('<HouseSelect');
    expect(runWorkspaceRule).toContain('position: relative');
    expect(runWorkspaceRule).not.toMatch(/\b(?:padding|gap)\s*:/);
    expect(runScreen).toContain('visibleLipsanonCount(shellRun)');
    expect(runScreen).not.toContain('bonaTarget');
    expect(styleCss).toMatch(/\.skirmish-screen\s*\{[\s\S]*?column-gap:\s*0/);
    expect(styleCss).toMatch(/\.skirmish-screen:not\(\.level-editor-screen\) \.skirmish-war-room > \.skirmish-field\s*\{[\s\S]*?margin-inline-end:\s*var\(--skirmish-board-controls-gutter\)/);
    expect(styleCss).not.toContain('.skirmish-screen.is-run-self-inspection-open');
    expect(styleCss).not.toContain('.skirmish-screen.run-screen');
    expect(styleCss).toMatch(/\.run-shell-workspace\s*\{[\s\S]*?--shell-workspace-body-inset-block:\s*var\(--ds-gutter\);[\s\S]*?--shell-workspace-body-inset-start:\s*var\(--ds-gutter\)/);
    expect(styleCss).toMatch(/\.shell-workspace-body\s*\{[\s\S]*?padding-inline-end:\s*0/);
    expect(styleCss).toContain('.run-shell-workspace-content');
    expect(styleCss).toContain('.run-screen.has-lipsana .run-shell-workspace-content');
    expect(styleCss).not.toContain('.run-workspace--full');
    expect(styleCss).not.toContain('.run-screen.has-lipsana .run-workspace');
    expect(runScreen).not.toContain('DraftPanel');
    expect(runScreen).not.toContain("phase === 'draft'");
    expect(runCard).not.toContain("'draft'");
    expect(runExpunctioWorkspace).toContain('edgeAttached: true');
    expect(runExpunctioWorkspace).toContain('<KitScroll className="run-sectio-operation-list-scroll">');
    expect(runExpunctioWorkspace).toContain("if (status === 'available') return 'Athetize';");
    expect(runExpunctioWorkspace).toContain("if (status === 'expuncted') return 'Athetized this visit';");
    expect(runExpunctioWorkspace).not.toContain("return 'Expunctio';");
    expect(runExpunctioWorkspace).toContain('className="run-expunctio-companion"');
    // The gallery says which formations this visit admitted, because Reset Sectio takes back
    // exactly those and nothing else on the tile reveals it.
    expect(runExpunctioWorkspace).toContain('sectioAdmittedCardIds(run)');
    // One component owns the line, so the Studio review mounts the real thing (ADR-0059) and the
    // workspace cannot drift from what the owner judged.
    expect(runExpunctioWorkspace).toContain('<RunAdlectioMarkLine />');
    expect(runAdlectioMark).toContain('<span className="run-expunctio-visit-mark">');
    expect(runAdlectioMark).toContain('Adlected this Sectio');
    expect(styleCss).toMatch(/\.run-expunctio-visit-mark\s*\{[\s\S]*?color:\s*var\(--skirmish-ink\)/);
    // No coin and no transaction mark in this line: the fee below it already paints the loss arrow
    // and says what the card cost, so gold here says only what is already said.
    expect(runAdlectioMark).not.toContain('RunGoldIcon');
    expect(runExpunctioWorkspace).not.toContain('<RunGoldTransactionIcon');
    // A review surface is a Studio category reached by clicking, never a review parameter on a
    // player route (ADR-0058). Nothing in the Run may read one for this mark.
    expect(runAdlectioMark).not.toContain('URLSearchParams');
    expect(runAdlectioMark).not.toContain('Candidate=');
    expect(tilePreview).toContain("id: 'adlectiomark', label: 'Adlectio Mark'");
    expect(tilePreview).toContain('<AdlectioMarkReviewCatalog');
    expect(runExpunctioWorkspace).toContain('runCardFramePaintInsetRatios');
    expect(runExpunctioWorkspace).toContain('fillRole="outer"');
    expect(runExpunctioWorkspace).toContain('data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}');
    expect(runExpunctioWorkspace).not.toContain('<h3>{runCardName');
    expect(styleCss).not.toContain('.run-expunctio-row:is(.is-expuncted, .is-spent, .is-unavailable, .is-unaffordable)');
    expect(styleCss).toMatch(/\.run-expunctio-workspace \.run-sectio-operation-list-scroll > \.kit-scroll-content\s*\{[\s\S]*?padding-inline-start:\s*var\(--ds-space-1\)/);
    expect(styleCss).toMatch(/\.run-expunctio-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(styleCss).toMatch(/\.run-expunctio-companion\s*\{[\s\S]*?block-size:\s*calc\(var\(--run-expunctio-card-inline-size\) \* 7 \/ 5\);[\s\S]*?padding-block:\s*var\(--run-expunctio-card-paint-start-inset\) var\(--run-expunctio-card-paint-end-inset\);/);
    expect(styleCss).toMatch(/\.inner-chrome-box > \.inner-chrome-box-fill\s*\{[\s\S]*?inset:\s*0;/);
    expect(styleCss).toMatch(/\.run-expunctio-copy > :first-child\s*\{[\s\S]*?translate:\s*0 -\.34em;/);
    expect(skirmish).toContain("testId: runDeployment ? 'run-deployment' : 'skirmish'");
    expect(skirmish).toContain("className: 'skirmish-war-room'");
    expect(skirmish).toContain("primaryClassName: 'skirmish-field'");
    expect(runScreen).toContain('className="run-meta-controls run-deployment-controls run-arrangement-controls"');
    expect(skirmish).toContain('<SkirmishBoard');
    // One passive-position seam for the battlefield, with Deployment first in line: a move
    // review of the live match may offer a board there, and never displaces this one.
    expect(skirmish).toContain('surfaceState={presentedDeploymentSurface ?? reviewSurface}');
    expect(skirmish).not.toContain('cameraActive=');
    expect(runScreen).toContain('viewKey: runBattleActivityId(prepared.id, prepared.battleIndex)');
    expect(runScreen).toContain('gameForRunDeployment(prepared, level, layout, true)');
    expect(runScreen).toContain('<RunDeploymentCardStack');
    expect(runScreen).not.toContain('KlerosisOverlay');
    expect(runDeploymentCardStack).toContain("document.querySelector<HTMLElement>('[data-run-card-flight-target]')");
    expect(runDeploymentCardStack).toContain('<RunCardBack');
    expect(runDeploymentCardStack).toContain('identityCard={activeIdentity}');
    expect(runDeploymentCardStack).toContain('data-deployment-card-stage');
    expect(runDeploymentCardStack).not.toContain('Your deployment deal');
    expect(runDeploymentCardStack).not.toContain('These cards supply this combat');
    expect(runDeploymentCardStack).not.toContain('Deploy all');
    expect(runDeploymentCardStack).not.toContain('Step through');
    expect(runDeploymentCardStack).not.toContain('SkirmishBoard');
    expect(runDeploymentCardStack).toContain('Draw automatically');
    expect(runDeploymentCardStack).toContain('data-deployment-center-deck');
    // The deck empties as it DEALS. It used to count the hand arriving in Controls, two and a half
    // seconds after the cards left, so it stood at full height and full number while the whole
    // hand flew out of it and the last card never appeared to take it with it.
    expect(runDeploymentCardStack).toContain('run.cards.length - departedCount');
    expect(runDeploymentCardStack).not.toContain('run.cards.length - dealtCount');
    expect(runScreen).toContain('departedCount={deckDeparted}');
    expect(runScreen).toContain('onDeckDeparture={setDeckDeparted}');
    expect(runScreen).not.toContain('dealtCount={dealProgress}');
    // A pile with nothing in it draws nothing — the floor of one layer is what left a phantom deck
    // standing on the table after its last card had gone.
    expect(runDeploymentCardStack).toContain('if (layers < 1) return null;');
    expect(runDeploymentCardStack).not.toContain('Math.max(1, centerCount)');
    // Departures ride the deal's own timeline, not a wall clock a throttled tab would drift from.
    expect(runDeploymentCardStack).toContain('onDeckDeparture(index + 1)');
    expect(runDeploymentCardStack).not.toContain('scene.after(index * stagger');
    expect(runDeploymentCardStack).toContain('const expectedAnimationCount = cards.length * 4 + 1');
    // The swept remainder IS the deck, not a single card standing in for it.
    expect(runDeploymentCardStack).toContain('<RunDeckPile count={undealtCardCount}');
    expect(runDeploymentCardStack).toContain('data-testid="deployment-deal"');
    expect(runDeploymentCardStack).toContain("deployment?.stage === 'awaiting-deal' || deployment?.stage === 'dealing'");
    expect(runDeploymentCardStack).toContain('data-deployment-discard-flight-card');
    expect(runDeploymentCardStack).toContain('runCardFlightGeometry(sourceRect, targetRect)');
    expect(runDeploymentCardStack).toContain('Promise.allSettled(animations.map((animation) => animation.finished))');
    expect(runDeploymentCardStack).toContain('emptyPieceIndices={activePresentation?.emptyPieceIndices ?? []}');
    expect(runDeploymentCardStack).not.toContain('owned.unitSeats.slice(');
    expect(styleCss).toMatch(/\.run-deployment-stack-card\.is-active\.is-revealed > \.run-deployment-stack-side\.is-back\s*\{[\s\S]*?transform:\s*rotateY\(-180deg\)/);
    expect(styleCss).toMatch(/\.run-deployment-stack-card\.is-active\.is-revealed > \.run-deployment-stack-side\.is-front\s*\{[\s\S]*?transform:\s*rotateY\(0deg\)/);
    expect(styleCss).not.toMatch(/\.run-deployment-stack-card\.is-active\.is-revealed\s*\{[\s\S]*?transform:\s*rotateY/);
    expect(styleCss).not.toContain('@keyframes run-deployment-card-discard');
    expect(runScreen).not.toContain('Full deploy');
    expect(runScreen).not.toContain('data-testid="deployment-next"');
    expect(runScreen).toContain('beginDeploymentDeal(latest)');
    expect(runScreen).not.toContain('Place {activeUnit.type');
    expect(runScreen).not.toContain("setDeploymentTransport(latest, transport)");
    expect(runScreen).not.toContain('View Formation {index + 1}');
    expect(runScreen).not.toContain('Deploy this formation');
    expect(runScreen).toContain('renderCellOverlay: ({ cell, visualFootprintStyle }) =>');
    expect(runScreen).not.toContain('FramedReadOnlyBoardView');
    expect(runScreen).not.toContain('levelToEditorBoard');
    expect(runScreen).toContain('gameForRunDeployment(prepared, level, layout, true)');
    expect(runScreen).not.toContain('placeAdlectedDeploymentUnit');
    expect(runScreen).toContain('previewPieces: arrangementPreviewPieces');
    // A seated formation reads as a PLAN, not a deployment: the same strength as the formation
    // on the cursor, and no entrance until Begin Battle promotes the whole plan at once.
    expect(runScreen).toContain('const plannedPieceIds = useMemo(');
    expect(runScreen).toContain('() => new Set(Object.keys(layout.placements)),');
    expect(runScreen).toContain('plannedPieceIds,');
    expect(skirmishBoard).toContain('export const PLANNED_UNIT_OPACITY = 0.62;');
    expect(skirmishBoard).toContain('opacity: PLANNED_UNIT_OPACITY });');
    expect(skirmishBoard).toContain('const baseOpacity = state.plannedPieceIds.has(piece.id)');
    expect(runScreen).not.toContain('advanceAutomaticDeployment(deployment, level)');
    expect(runScreen).toContain('data-testid="arrangement-begin-battle"');
    expect(runScreen).toContain('onBeginBattle={startArrangedBattle}');
    // The phase is the title bar's first clickable ROUTE segment (Run › Sectio),
    // and an open Strategikon appends its exact canonical section/reference links.
    expect(runScreen).toContain('<TitleRoute segments={runTitleBarRouteSegments(run, path, search, view)} />');
    expect(runScreen).toContain('runWorkspaceTitleSegment(`/run${search}`, view)');
    expect(runScreen).toContain('strategikonRouteCrumbs(path).map');
    // A Run Battle is timed like every other Battle, and by the SAME chip — the Run bar
    // showed no clock at all, so a Battle could be played with nothing saying how long it
    // had been running. The seat is the mounted battlefield, never the phase alone: the
    // chip reads the battlefield's session store, so a Run bar rendered beside any other
    // workspace would report the module default store's clock instead.
    expect(runScreen).toContain("import { BattleClockChip } from './BattleClockChip';");
    expect(runScreen).toContain('battlefieldMounted={battlefieldActive}');
    // Material answers to the same seat for the same reason, and sits ahead of the clock exactly
    // as it does on the Skirmish bar, so every play surface reads alike (ADR-0580). ONE box holds
    // both forces — a comparison cannot have the clock standing in the middle of it. It rides in
    // and out WITH the clock: a force's points exist only while there is a board to count them
    // on, so it is not a Run measure.
    expect(runScreen).toContain("import { BattleMaterialChip } from './BattleMaterialChip';");
    expect(runScreen).toMatch(
      /\{battlefieldMounted && run\.phase === 'battle'\s*\?\s*\(\s*<>\s*<BattleMaterialChip fillSurface=\{CHROME_LEAF_FILL_SURFACE\} \/>\s*<BattleClockChip fillSurface=\{CHROME_LEAF_FILL_SURFACE\} \/>\s*<\/>\s*\)\s*:\s*null\}/,
    );
    // Address-only Play breadcrumbs are App-owned, so they remain present even
    // while the replaceable battlefield scene is not yet active.
    expect(skirmish).not.toContain('<TitleBarSlot region="route">');
    expect(runScreen).toContain('levelName={isGeneratedRunBattleName(levelName) ? null : levelName}');
    expect(runScreen).not.toContain('run-deployment-workspace');
    expect(runScreen).not.toContain('<LevelPreviewColumn');
    expect(runScreen).not.toContain('Choose square…');
    expect(styleCss).toContain('.run-deployment-board');
    expect(styleCss).toContain('.skirmish-board-cell-hit.is-threat::before');
    expect(styleCss).not.toContain('.run-deployment-cell.is-deployment-blocked:hover::before');
  });

  it('keeps Sectio operation lists on the canonical drawn scrollbar', () => {
    const operationListRule = styleCss.match(/\.run-sectio-operation-list\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(runExpunctioWorkspace).toContain('<KitScroll className="run-sectio-operation-list-scroll">');
    expect(runExpunctioWorkspace).toContain('className="run-sectio-operation-list run-expunctio-list"');
    expect(runExpunctioWorkspace).toContain('fillRole="outer"');
    expect(runExpunctioWorkspace).toContain("['--run-operation-row-index' as string]: index");
    expect(styleCss).toMatch(/\.run-expunctio-row\s*\{[\s\S]*?--chrome-surface-position-y:\s*calc\(var\(--run-operation-row-index, 0\)/);
    expect(styleCss).toMatch(/\.run-expunctio-row\s*\{[\s\S]*?--run-operation-surface-pitch:\s*calc\([\s\S]*?var\(--run-expunctio-card-inline-size\) \* 7 \/ 5[\s\S]*?var\(--ds-stack\)[\s\S]*?\);/);
    expect(styleCss).toMatch(/\.run-sectio-operation-list-scroll\s*\{[^}]*--run-operation-clip-apron-block-start:\s*var\(--le-inner-atom-top-overhang, 0px\);[^}]*--run-operation-clip-apron-block-end:\s*var\(--le-inner-atom-bottom-overhang, 0px\);/s);
    expect(styleCss).toMatch(/\.run-sectio-operation-list-scroll > \.kit-scroll-rail\s*\{[^}]*bottom:\s*var\(--run-operation-clip-apron-block-end\);[^}]*top:\s*var\(--run-operation-clip-apron-block-start\);/s);
    expect(operationListRule).toMatch(/overflow-block:\s*clip/);
    expect(operationListRule).toMatch(/overflow-inline:\s*visible/);
    expect(operationListRule).toMatch(/padding-block:\s*var\(--run-operation-clip-apron-block-start\)\s*var\(--run-operation-clip-apron-block-end\)/);
    expect(operationListRule).not.toMatch(/overflow(?:-[xy])?:\s*(?:auto|scroll)/);
    expect(styleCss).not.toMatch(/\.run-expunctio-row:nth-child/);
    expect(styleCss).not.toMatch(/\.run-expunctio-row:is\([^}]+\)\s*\{[^}]*opacity:/);
  });

  it('reserves structural teal for containers and paints Run leaf chrome with data-phased oak', () => {
    const metaControls = runScreen.match(
      /function RunMetaControls\b[\s\S]*?\r?\n}\r?\n\r?\nfunction ArrangedDeploymentControls/,
    )?.[0] ?? '';

    expect(chromeSurfacePolicy).toContain("export const CHROME_LEAF_FILL_SURFACE = 'hybrid-wood-oak'");
    expect(houseSelect).toContain('fillSurface?: string;');
    // One props object for both forks — the framed trigger and the one seated in a divided cell —
    // so a picker cannot wear the oak in one shape and lose it in the other.
    expect(houseSelect).toContain("'data-chrome-fill-surface': fillSurface,");
    expect((runArmyWorkspace.match(/fillSurface=\{CHROME_LEAF_FILL_SURFACE\}/g) ?? [])).toHaveLength(3);
    expect(runArmyWorkspace).toContain("['--run-roster-filter-index' as string]: 2");
    expect(styleCss).toMatch(/\.run-roster-filters \.house-select\s*\{[\s\S]*?--chrome-surface-position-y:\s*calc\(var\(--run-roster-filter-index, 0\)/);

    expect(metaControls).toContain('data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}');
    expect(metaControls).toContain('SECTIO_WORKSPACE_VIEWS.map((candidate, index) =>');
    expect(metaControls).toContain("['--chrome-leaf-surface-index' as string]: index + 1");
    expect(metaControls).toContain("['--chrome-leaf-surface-index' as string]: SECTIO_WORKSPACE_VIEWS.length + 3");
    // One derivation turns a renderer's phase index into the surface offset, for every leaf
    // however it was painted — a named surface here, an adopted host's material rule
    // elsewhere. A per-surface copy of the same calc is how the two drift apart.
    expect(styleCss).toMatch(/\[data-chrome-fill-surface\],\s*\r?\n\[data-chrome-leaf-surface\] \[data-chrome-unit\]\s*\{\s*\r?\n\s*--chrome-surface-position-y:\s*calc\(var\(--chrome-leaf-surface-index, 0\) \* -1 \* var\(--chrome-leaf-surface-pitch\)\)/);
    expect(styleCss).not.toMatch(/\.run-(?:meta-controls|army-profile) \[data-chrome-fill-surface\]/);

    expect(runArmyWorkspace).toContain('data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}');
    expect(runExpunctioWorkspace).toContain('data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}');
    // Every element in the Run bar is a framed leaf now, so the leaf fill rides the
    // shared box-is-the-tooltip primitive rather than a hand-placed attribute.
    expect((runTitleBarChips.match(/fillSurface=\{CHROME_LEAF_FILL_SURFACE\}/g) ?? [])).toHaveLength(2);
    expect(runTitleBarChips).not.toContain('data-chrome-fill-surface=');
    expect(titleBarControls).toContain('data-chrome-fill-surface={fillSurface}');
    expect(runExpunctioWorkspace).toContain('fillRole="outer"');
    // The aftermath report is a structural box and takes the marble by NAMING the shared policy
    // role, not by inheriting the scene's leaf adoption (ADR-0433/ADR-0557 — a box wears the
    // marble, the verbs that close it wear the oak). Unfilled it read its ledger off the vista.
    expect(runScreen).toMatch(/className="run-aftermath-report"\s*\r?\n\s*columns=\{verbColumns\(verbs\)\}\s*\r?\n\s*fillRole=\{CHROME_STRUCTURAL_FILL_ROLE\}/);
    expect(styleCss).not.toMatch(/\.run-(?:roster-filters|meta-controls)[^}]*:nth-child/);
  });

  /**
   * ADR-0557. The screens a Battle or a Run ENDS on are one family the player meets in one
   * moment, so they adopt the leaf material together — a half-adopted family reads as a bug
   * the first time a Battle is lost. Every one of them declares adoption with the single host
   * attribute the role field excludes; a per-surface attribute would grow that exclusion list
   * once per destination, which is what let the Controls panel's own oak go silently.
   */
  it('wears the leaf material on every screen a Battle or a Run ends on', () => {
    for (const testId of ['run-battle-result', 'campaign-result', 'netplay-result']) {
      // The won board and the lost board are both `run-battle-result`; both must adopt.
      const adopted = skirmish.match(
        new RegExp(`data-testid="${testId}"\\s*\\r?\\n?\\s*data-chrome-leaf-surface=""`, 'g'),
      ) ?? [];
      expect(adopted.length).toBe(testId === 'run-battle-result' ? 2 : 1);
    }
    // The dismissed netplay card leaves its exit behind; it is the same result, still standing.
    expect(skirmish).toMatch(/role="status"\s*\r?\n\s*data-chrome-leaf-surface=""/);

    // The two Run outcome scenes adopt from the VIEW the viewport already has, so a scene
    // cannot be added to the family and forget (ADR-0063).
    expect(runWorkspace).toContain("const RUN_OUTCOME_SCENE_VIEWS: readonly RunViewportSceneView[] = ['aftermath', 'victory']");
    expect(runWorkspace).toContain("data-chrome-leaf-surface={RUN_OUTCOME_SCENE_VIEWS.includes(scene.view) ? '' : undefined}");

    // A row of result actions is a repeated leaf collection: it phases from the action's
    // authored seat, never from DOM position. The borrowed Run battle buttons forward the
    // style for exactly that — annotating them any other way reskins them everywhere.
    expect(skirmish).toContain('<RunBattleUndoButton testId="undo-run-move-result" style={leafSurfacePhase(0)} />');
    expect(skirmish).toContain('style={leafSurfacePhase(1)}');
    expect(skirmish).toContain('style={leafSurfacePhase(2)}');
    // The result reports' verbs are a repeated leaf collection too, and the row that seats them
    // phases each one from the index of the verb DATA — the same rule, owned once.
    expect(chromeVerbRow).toContain('style: leafSurfacePhase(index),');
    expect(chromeVerbRow).toContain("'data-chrome-fill-surface': CHROME_LEAF_FILL_SURFACE,");
    expect(runScreen).not.toContain('leafSurfacePhase');
    for (const button of [runBattleRetryButton, runBattleUndoButton, runDeploymentRerollButton]) {
      expect(button).toContain('style?: CSSProperties;');
      expect(button).toContain('style={style}');
    }
    expect(styleCss).not.toMatch(/\.(?:campaign-result-actions|run-result-verbs)[^}]*:nth-child/);

    // A result report closes with its own verbs. They used to be a loose pair of framed buttons
    // under the box — the vista showing through between the report and the thing it is read to
    // decide, each button drawing a second frame inside the one already there. They are cells of
    // the box's bottom row now, so nothing is left to hold to its own width beneath it.
    expect(runScreen).not.toContain('run-victory-finish');
    expect(runScreen).not.toContain('run-victory-actions');
    expect(runScreen).not.toContain('run-aftermath-actions');
    expect(styleCss).not.toContain('.run-victory-actions');
    expect(styleCss).not.toContain('.run-aftermath-actions');
    for (const panel of ['run-aftermath', 'run-victory']) {
      expect(runScreen).toMatch(new RegExp(`className="${panel}-report"[\\s\\S]*?<ChromeVerbRow verbs=\\{verbs\\} className="run-result-verbs"`));
    }
  });

  it('keeps Expunctio card-first and removes only complete held formations', () => {
    expect(runExpunctioWorkspace).toContain('<h2 id="run-expunctio-workspace-title">Expunctio</h2>');
    expect(runExpunctioWorkspace).toContain('Athetize one complete formation.');
    expect(runExpunctioWorkspace).toContain('Individual units cannot be removed from a held card.');
    // The tile repeats nothing the face, the workspace copy or the action already says: no card
    // name beside a face that prints one, no per-tile restatement of the Athetize rule, and no
    // attached-unit count left over from the retired per-unit Alienatio (ADR-0511).
    expect(runExpunctioWorkspace).not.toContain('attached unit${');
    expect(runExpunctioWorkspace).not.toContain('runCardName');
    expect(runExpunctioWorkspace).not.toContain('Athetize removes this card and every attached unit as one formation.');
    expect(runExpunctioWorkspace).toContain('<RunGoldTransactionAmount direction="loss"');
    expect(runExpunctioWorkspace).toContain('onExpunct(card.id)');
    expect(runScreen).toContain('<RunExpunctioWorkspace run={shellRun} onExpunct={expunctCard} />');
    expect(runExpunctioWorkspace).not.toMatch(/Alienatio|Aliene|CyclePicker|onPieceSelect|highlightedPieceIndex/);
    expect(runArmyWorkspace).not.toMatch(/Alienatio|Aliene|onAlienate/);
    expect(runScreen).not.toMatch(/performAlienatio|launchUnitDeparture|unitDepartureElement/);
    expect(styleCss).not.toContain('.run-unit-departure');
    expect(styleCss).not.toContain('.run-card-prototype-unit-icon-seat.is-highlighted');
  });

  it('previews the upcoming Sectio Battle through the canonical read-only board and Level ledger', () => {
    expect(runBattlePreview).toContain('<RunSceneViewport');
    expect(runBattlePreview).toContain("view: 'battle-preview'");
    expect(runBattlePreview).toContain('<FramedReadOnlyBoardView');
    expect(runScreen).toContain('<RunBattlePreview run={run} />');
    expect(runBattlePreview).toContain('<LevelInfoCompact');
    expect(runBattlePreview).toContain('levelToEditorBoard(level)');
    // The Sectio's own battleIndex is the Battle just fought; reconnaissance is of the next one.
    expect(runBattlePreview).toContain('const battleIndex = sectioUpcomingBattleIndex(run);');
    expect(runBattlePreview).not.toMatch(/battles\[run\.battleIndex\]/);
    // ONE filled pane, and every separation on it is one of that pane's own drawn rails. Three
    // framed boxes with gaps between them let strips of the page show through between them.
    // And it fills the WHOLE workspace, the way the Strategikon's sheet does — no margin of the
    // Sectio scene left showing around a plate laid on top of it.
    expect(runBattlePreview).toContain('edgeAttached: true');
    // On the SHELL element: `.run-shell-workspace` declares these itself, so the same declaration
    // on the scene around it is shadowed and the body silently keeps its 12px gutter.
    expect(styleCss).toMatch(
      /\.run-battle-preview-workspace > \.run-shell-workspace\s*\{[^}]*--shell-workspace-body-inset-block: 0px;[^}]*--shell-workspace-body-inset-start: 0px;/,
    );
    expect(styleCss).toMatch(/\.run-battle-preview-content\s*\{[^}]*padding:\s*0;/);

    expect(runBattlePreview).toContain('<DividedInnerChromeBox');
    expect(runBattlePreview).toContain("columns={['minmax(0, 1fr)', 'minmax(300px, 34%)']}");
    // The pane wears no frame of its own: the title bar above and the Controls rail beside it are
    // already its boundary, and a box frame there draws a second outline just inside them with a
    // strip of surface trapped between. It still takes the SURFACE — this workspace replaces a
    // retained scene, so without one the Sectio market reads straight through the text.
    expect(runBattlePreview).toContain('framed={false}');
    expect(runBattlePreview).toContain('fillRole="outer"');
    expect(styleCss).toMatch(
      /\.chrome-divided-grid\.has-chrome-surface-fill > \.chrome-divided-grid__fill\s*\{\s*inset: 0;/,
    );
    // Lift the CONTENT above that fill, not every child: a blanket rule also catches the rail
    // layer, whose own z-index it outranks, and the board then paints over the vertical rail
    // below the header — its south stroke comes out thinner than the three the atom covers.
    expect(styleCss).toMatch(
      /\.chrome-divided-grid\.has-chrome-surface-fill > \.chrome-divided-grid__rows,[\s\S]*?z-index: 1;/,
    );
    expect(styleCss).not.toMatch(
      /\.chrome-divided-grid\.has-chrome-surface-fill > :not\(\.chrome-divided-grid__fill\)/,
    );
    // A junction caps a rail where it meets the box's own FRAME. Unframed there is no such frame,
    // so a boundary cap caps nothing and sits on the host's chrome as a stray atom.
    expect(chromeDividedGrid).toContain("nodes.filter((node) => node.inlineBoundary === 'internal')");
    // A vertical rail's frame caps also require a rail to actually ARRIVE at that edge — a grid
    // whose first or last row spans every column has none, and the cap became an ornament sitting
    // in a rail with nothing running through it.
    expect(chromeDividedGrid).toContain('topNodes: framed && !rowSpansAllColumns(rows[0]) ? topology.topNodes : [],');
    expect(chromeDividedGrid).toContain('bottomNodes: framed && !rowSpansAllColumns(rows[rows.length - 1]) ? topology.bottomNodes : [],');
    expect(styleCss).toMatch(
      /\.chrome-divided-grid\[data-chrome-grid-framed="false"\]\s*\{\s*overflow: hidden;/,
    );
    expect(runBattlePreview).not.toContain('PreviewTitleBar');
    expect(runBattlePreview).not.toContain('<InnerChromeBox');
    expect(styleCss).not.toContain('.run-battle-preview-titlebar');
    expect(styleCss).not.toContain('.run-battle-preview-board-frame');
    expect(styleCss).not.toContain('.run-battle-preview-layout');

    // The header band is ONE row split by the pane's vertical rail: the level's name over the
    // board, the Battle it is over the readout.
    expect(runBattlePreview).toMatch(
      /<ChromeDividedGridRow className="run-battle-preview-headers">[\s\S]*?<h2 id="run-battle-preview-title">\{level\.name\}<\/h2>[\s\S]*?Battle \{battleIndex \+ 1\} of \{run\.war\.battles\.length\}[\s\S]*?<\/ChromeDividedGridRow>/,
    );
    expect(runBattlePreview).toContain('<ChromeDividedGridRow className="run-battle-preview-body">');
    // Header, rail, body — three tracks for three children. Naming two puts the zero-height rail
    // in the flexible track and the board in an implicit one.
    expect(styleCss).toMatch(
      /\.run-battle-preview-pane > \.chrome-divided-grid__rows\s*\{[^}]*grid-template-rows:\s*auto 0 minmax\(0, 1fr\);/,
    );
    // A filled inner box lifts its children above the fill; the rail layer must stay an absolute
    // OVERLAY or it takes a grid row and pushes the rows layer off the bottom of the pane.
    expect(styleCss).toMatch(
      /\.inner-chrome-box\.has-chrome-surface-fill > \.chrome-divided-grid__fixed-rails\s*\{\s*position: absolute;/,
    );

    expect(runBattlePreview).not.toContain('Drag to pan');
    // A pane's own name outranks the section headers inside it, which outrank their rows.
    expect(styleCss).toMatch(/\.run-battle-preview-header > h2\s*\{[^}]*--ds-text-xl/);
    expect(styleCss).toMatch(/:is\(\.ce-li-board, \.ce-li-forces, \.ce-li-deployment\) > \.ce-li-title\s*\{[^}]*--ds-text-lg/);
    expect(runBattlePreview).toContain('viewportMode="fill"');
    expect(runBattlePreview).toContain('showGrid');
    // The installed surface paints under the whole pane, so padding would ring the level art with
    // a flat slab of that material between the border art and the board.
    expect(styleCss).toMatch(/\.run-battle-preview-pane\s*\{[^}]*padding:\s*0;/);
    expect(styleCss).not.toMatch(/\.run-battle-preview-pane\s*\{[^}]*overflow:\s*hidden/);

    // The readout takes no frame of its own — the pane's rail is already its left edge — and the
    // note is its last section rather than a third box.
    expect(runBattlePreview).toContain('framed={false}');
    expect(runBattlePreview).toContain('<section className="ce-li-zones-row run-battle-preview-note">');
    expect(levelInfoCompact).toContain('const Frame = framed ? InnerChromeBox : UnframedLevelInfo;');
    // Zones are authoring detail, and the readout reads at column scale rather than tab scale.
    expect(runBattlePreview).toContain('showZones={false}');
    expect(styleCss).toMatch(/\.run-battle-preview-info \.ce-li-roster-head strong\s*\{[^}]*--ds-text-lg/);
    expect(runBattlePreview).toContain('setup forces whose');
    expect(runBattlePreview).not.toContain('<OuterChromeBox');
    expect(runBattlePreview).not.toContain('<LevelPreviewColumn');
    expect(runBattlePreview).not.toContain('backgroundArtwork');
  });

  // The stage decides how much of the player's collection it plays, and the Forces ledger says
  // nothing about it — reconnaissance that omits both leaves the one force the player controls
  // unaccounted for.
  it('reports the stage’s own deal and lights the band it deploys onto', () => {
    // The count comes from the Run's own reader, so the readout and the Deployment that follows
    // it cannot disagree — and it reads the UPCOMING Battle, not the one just fought.
    expect(runBattlePreview).toContain('runDeploymentDealCount({ war: run.war, battleIndex })');
    expect(runBattlePreview).toContain('leave the Sectio: {dealtLine}, onto the lit band.');
    // A stage may deal more than the player carries, so the sentence cannot take a fraction of
    // a smaller hand — "deals 3 of the 2 cards you hold" is the shape that must not come back.
    expect(runBattlePreview).toContain('held <= dealCount');
    expect(runBattlePreview).toContain('`this stage deals ${dealCount} of the ${held} cards you hold`');
    // The whole held hand deploying was never true, and stated it as a fact.
    expect(runBattlePreview).not.toMatch(/\{run\.cards\.length\} formation/);

    // The band is the same square set capacity admission is measured against.
    expect(runBattlePreview).toMatch(
      /const bandCells = useMemo\(\s*\(\) => new Set\(playerDeploymentCells\(level\)\.map\(\(cell\) => `\$\{cell\.x\},\$\{cell\.y\}`\)\),/,
    );
    expect(runBattlePreview).toMatch(
      /renderCellOverlay=\{bandShown\s*\?\s*\(cell\) => bandCells\.has\(`\$\{cell\.x\},\$\{cell\.y\}`\)/,
    );
    // The board already has ONE drawing for a zone — the Level Editor's tinted diamond with its
    // own per-square outline, in the Player Deployment accent. A move highlight here was a second
    // language for the same fact, and without a per-square edge it read as an invented slab.
    expect(runBattlePreview).toContain('<span className="le-zone-cell le-zone-player" aria-hidden="true" />');
    expect(runBattlePreview).not.toContain('PredrawnMoveHighlightPaint');
    expect(styleCss).toMatch(/\.le-zone-cell\s*\{[^}]*background: rgba\(var\(--le-zone-accent\)/);
    expect(styleCss).toMatch(/\.le-zone-cell\s*\{[^}]*box-shadow: inset 0 0 0 2px rgba\(var\(--le-zone-accent\)/);
    expect(styleCss).toContain('.le-zone-blue, .le-zone-player { --le-zone-accent:');
    expect(styleCss).not.toContain('.run-battle-preview-band');

    // A tile-frame overlay mounted through renderCellOverlay rides a DIFFERENT band: the seat is
    // translated by the equator plane rather than the whole equator, so the tile frame's 41px top
    // puts the diamond three quarters of a tile below the square it names. The band owns the
    // correction, so the next caller cannot land off-grid by forgetting to write its own — the
    // Enchiridion's local copy of it is gone. Measured live: 0px offset on both surfaces.
    expect(styleCss).toMatch(
      /\.tileset-generated-board-overlay-cell > :is\(\.le-zone-cell, \.le-tactical-cell\)\s*\{\s*top: 0;/,
    );
    expect(styleCss).not.toMatch(/\.enchiridion-unit-board \.le-tactical-cell\s*\{/);
    // The tile-frame seating itself is untouched — that is what the Level Editor's own mounts use.
    expect(styleCss).toMatch(/\.le-zone-cell\s*\{[^}]*top: var\(--iso-tile-surface-top\)/);

    // Both facts also stand in the Level readout, which is where a reader looks for numbers.
    expect(levelInfoCompact).toContain('const cardsDealt = levelBattleCardsDealt(level);');
    expect(levelInfoCompact).toContain('playerDeploymentCells(level).length');
    // The COUNT is the readout's own reader, which says "Not set" for a Battle that authors none
    // — the state W4_BATTLE_CARDS_DEALT blocks Save on, and one a clamp would quietly hide. The
    // clamped number stays for the prose beneath, which needs a real quantity to describe.
    expect(levelInfoCompact).toMatch(/<RowIcon src=\{cardsIconSrc\}[^>]*\/>Cards dealt<\/span>\s*<strong>\{dealLine\}<\/strong>/);
    expect(levelInfoCompact).toContain('{dealLine !== null ? (');
    expect(levelInfoCompact).toContain('const deploymentSquares = dealLine === null ? 0 : playerDeploymentCells(level).length;');
    // Campaign and standalone Levels deal nothing, so the section is a War Battle's alone.
    expect(levelInfoCompact).toContain('{cardsDealt !== null ? (');
  });

  // Every mark in the readout resolves REAL game art through its installed role. A readout that
  // invents a glyph for a fact the game already has a picture of teaches the player a second
  // vocabulary for the same thing.
  it('marks the readout rows with the game’s own art, and makes Zone the band’s control', () => {
    // Each side flies its OWN palette's flag; a palette with no variant falls back to the one
    // shared objective flag rather than flying nothing. Reviewing a candidate never installs it.
    expect(levelInfoCompact).toContain('installedUiMediaIfPresent(`ui-kit-icons-game-objective-${palette}-png`)');
    expect(levelInfoCompact).toContain("?? installedUiMedia('ui-kit-icons-game-objective-png')");
    expect(levelInfoCompact).toContain("new URLSearchParams(window.location.search).get('flagCandidate')");
    expect(levelInfoCompact).toContain('flagSrc={flagIconSrc(palettes.player)}');
    expect(levelInfoCompact).toContain('flagSrc={flagIconSrc(palettes.enemy)}');
    expect(levelInfoCompact).toContain("installedUiMedia('ui-kit-icons-game-wait-png')");
    expect(levelInfoCompact).toContain('useStrategikonCardsIcon()');
    // There is no tile mark, because there is no tile census: most levels are drawn from
    // whole-board artwork, where a count of painted squares and a chip per terrain type describe
    // nothing the reader can see. Board states its size and stops.
    expect(levelInfoCompact).not.toMatch(/studioFamilies\.find\(\(family\) => family\.id === 'grass'\)/);
    expect(levelInfoCompact).not.toContain('ce-li-chips');
    expect(levelInfoCompact).not.toContain('ce-li-tile-icon');
    // The Battle mark is the Run's registered Battle icon, not a second drawing of a Battle.
    expect(runBattlePreview).toContain('<RunProgressIcon variant="battle"');

    // A count of a piece is drawn as that many of the piece, in the palette that side wears on
    // the board beside it — read from the projection the renderer itself consumes.
    expect(levelInfoCompact).toContain('<PieceFile type={p} count={counts[p] ?? 0} palette={palette} />');
    expect(levelInfoCompact).toContain('const projected = levelToEditorBoard(level).units ?? {};');
    // Bare count, never "×N": N sprites beside "×N" reads as N lots of N.
    expect(levelInfoCompact).toContain('<b>{counts[p]}</b>');
    expect(levelInfoCompact).not.toContain('×{counts[p]}');
    // Rocks and rubble have no unit sprite and must not ask for one.
    expect(levelInfoCompact).toContain('if (!isPlayablePieceType(type))');

    // Zone is the control for the band, through the registered text button's toggle variant, and
    // it wears the OAK every other trigger wears. The segmented `le-seg-btn` skin must stay off
    // it: that frame is a `fill` border-image, so it paints the interior itself and covers the
    // surface — which is how this one control came out slate on a screen of wooden buttons.
    expect(levelInfoCompact).toContain('unit="inner-text-button"');
    expect(levelInfoCompact).toContain('className="app-header-button ce-li-zone-toggle"');
    expect(levelInfoCompact).toContain('data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}');
    // On a className, not anywhere — the comment above the control names the class it avoids.
    expect(levelInfoCompact).not.toMatch(/className="[^"]*le-seg-btn/);
    expect(levelInfoCompact).toContain('selected={deploymentBand.shown}');
    expect(levelInfoCompact).toContain('onClick={deploymentBand.onToggle}');
    // Verified live: pressing it takes the painted band from 18 cells to 0 and back.
    expect(runBattlePreview).toContain('deploymentBand={{ shown: bandShown, onToggle: () => setBandShown((shown) => !shown) }}');
    expect(runBattlePreview).toContain('renderCellOverlay={bandShown');
    // A readout with no board of its own states the fact instead of offering a dead control.
    expect(levelInfoCompact).toContain('deploymentBand ? (');
  });

  it('retains the installed Sectio scene outside the workspace transition region', () => {
    expect(runScreen).toContain("const persistentSectioScene = shellRun?.phase === 'sectio' ? sectioScene : null;");
    expect(runScreen).toContain('persistentViewportArtwork: persistentSectioScene');
    expect(runScreen).not.toContain('backgroundArtwork={sectioScene}');
    expect(skirmishShell).toContain("persistentViewportArtwork = null");
    expect(skirmishShell).toContain("has-persistent-viewport-artwork");
    expect(styleCss).toMatch(/\.shell-persistent-viewport-artwork\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?grid-row:\s*2;/);
    expect(styleCss).toMatch(/\.run-screen\.has-persistent-viewport-artwork \.run-phase-primary > \.run-workspace \.shell-workspace-fill\s*\{[\s\S]*?visibility:\s*hidden;/);
  });

  it('draws every card through the approved shared trading-card face', () => {
    expect(runCard).not.toContain('RunCardScene');
    expect(runCard).toContain('const identity = identityCard ?? card');
    expect(runCard).toContain('runCardName(identity)');
    expect(runCard).toContain('runCardArtSlot(identity)');
    // Name, flavor, contents and cost all arrive already projected, so RunCard has no
    // reason to reach for the card's authored text itself.
    expect(runCard).not.toContain('runCardFlavor(');
    // RunCard is a host, not a second card model: it picks no frame, derives no grants
    // and authors no face of its own. Every one of those belongs to the single
    // projection in runCardFaceContent.ts, and this guard keeps them from creeping back.
    expect(runCard).toContain("from './runCardFaceContent'");
    expect(runCard).toContain('emptyPieceIndices = []');
    expect(runCard).toContain('runCardFaceContent(card, {');
    expect(runCard).toContain('runCardFrameSlot(card)');
    expect(runCard).not.toContain('RUN_CARD_PESTIFEROUS_FRAME_SLOT');
    expect(runCard).not.toContain('RUN_CARD_LEGATINE_FRAME_SLOT');
    expect(runCard).not.toContain('RUN_CARD_CONCINNOUS_FRAME_SLOT');
    expect(runCard).not.toContain('RUN_CARD_HIERATIC_FRAME_SLOT');
    expect(runCard).not.toMatch(/cardType|ability|adlected|agminate/);
    expect(runCardFace).toContain('<FormationDiagram');
    expect(runCardFace).toContain('RUN_CARD_COST_COIN_SOURCE_SLOT');
    expect(runCardFace).toContain('run-card-prototype-cost-coin-source');
    expect(runCard).not.toMatch(/\brules\s*:/);
    expect(runCard).not.toContain('After every Battle');
    expect(runCard).toContain('<RunCardFace');
    expect(runCard).not.toContain('RunCardScene');
    expect(runCard).not.toContain('run-bundle-card-art');
    expect(runCard).not.toContain('run-bundle-card-plate');
    expect(runCard).not.toContain('RunGoldAmount');
    expect(runScreen).toContain("import { RunCard } from './RunCard';");
    expect(styleCss).toMatch(/\.run-card-action\s*\{[\s\S]*?aspect-ratio:\s*5 \/ 7;/);
    expect(styleCss).toMatch(/\.run-card-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,[\s\S]*?justify-content:\s*center;/);
    // Back, face, and the padlock a spent Sectio lays on a survivor all occupy the ONE seat.
    expect(styleCss).toMatch(/\.run-card-pile > :is\(\.run-card-pile-back, \.run-card-offer, \.run-card-pile-lock\)\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?grid-row:\s*1;/);
    // A covered pile paints no part of the card it conceals: the back's opaque
    // generated backdrop otherwise reads as a black edge around every offer.
    expect(styleCss).toMatch(/\.run-card-pile\.is-covered > \.run-card-pile-back\s*\{[\s\S]*?visibility:\s*hidden;/);
    // Cold route entry still holds the veil for any nested painted surface: the
    // shell's painted-surface boundary waits for loading surfaces before painting.
    expect(paintedSurfaceBoundary).toContain(".querySelector('.painted-surface.is-loading')");
    expect(paintedSurfaceBoundary).toContain('.then(nestedSurfacesSettled)');
  });

  it('uses one divided Army ledger grid with readable metadata and value hierarchy', () => {
    const ledgerBranch = runArmyWorkspace.slice(
      runArmyWorkspace.indexOf('className="run-self-inspection-workspace run-army-workspace run-army-ledger"'),
      runArmyWorkspace.length,
    );
    expect(runArmyWorkspace).toContain('<DividedInnerChromeBox');
    expect(runArmyWorkspace).toContain('className="run-army-ledger-grid"');
    expect(runArmyWorkspace).toContain("columns={['var(--run-army-row-block-size, 158px)', 'minmax(0, 1fr)', '112px']}");
    expect(runArmyWorkspace).toContain('contentRef={ledgerRef}');
    expect(runArmyWorkspace).toContain('<ChromeDividedGridRow');
    expect(runArmyWorkspace).not.toContain('<ChromeDivider');
    // The ledger delegates its scrollbar to DividedInnerChromeBox. The sibling
    // unit profile may use KitScroll directly for its own responsive body.
    expect(ledgerBranch).not.toContain('<KitScroll');
    expect(runArmyWorkspace).not.toContain('data-chrome-unit="inner-list-row"');
    expect(runArmyWorkspace).not.toContain('data-chrome-frame-layout="overlay"');
    expect(runArmyWorkspace).not.toContain('ChromeFrameOverlay');
    expect(runArmyWorkspace).toContain('className="run-army-ledger-portrait unit-portrait--divided"');
    expect(runArmyWorkspace).toContain('framed={false}');
    expect(styleCss).toMatch(/\.chrome-divided-grid\s*\{[\s\S]*?--chrome-divided-grid-scroll-gutter:/);
    expect(styleCss).toMatch(/\.chrome-divided-grid\s*\{[\s\S]*?--chrome-divided-grid-inline-apron-start:[\s\S]*?--le-inner-divider-atom-left-overhang/);
    expect(styleCss).toMatch(/\.chrome-divided-grid__scroll\s*\{[\s\S]*?margin-inline-start:\s*calc\(-1 \* var\(--chrome-divided-grid-inline-apron-start\)\)/);
    expect(styleCss).toMatch(/\.chrome-divided-grid__scroll > \.kit-scroll-content\s*\{[\s\S]*?padding-inline:\s*var\(--chrome-divided-grid-inline-apron-start\) 0;/);
    expect(styleCss).toMatch(/\.chrome-divided-grid__vertical-rail\s*\{[\s\S]*?align-self:\s*stretch;[\s\S]*?margin-block:\s*calc\(-1 \* var\(--chrome-divided-grid-reach\)\)/);
    expect(styleCss).not.toContain('--run-army-ledger-apron');
    expect(styleCss).not.toContain('.run-army-ledger-scroll-divider');
    expect(styleCss).not.toContain('.run-army-ledger-portrait-divider');
    expect(styleCss).not.toContain('.run-army-ledger-value-divider');
    expect(styleCss).toMatch(/\.run-army-ledger-grid\s*\{[\s\S]*?--run-army-row-block-size:\s*158px;/);
    expect(styleCss).toMatch(/\.run-army-ledger-row\s*\{[\s\S]*?all:\s*unset;/);
    expect(styleCss).toMatch(/\.run-army-ledger-portrait\s*\{[\s\S]*?block-size:\s*100%;[\s\S]*?inline-size:\s*100%;/);
    expect(styleCss).toMatch(/\.run-army-ledger-copy > small,[\s\S]*?font:\s*var\(--ds-weight-regular\)\s+var\(--ds-text-md\)/);
    expect(styleCss).toMatch(/\.run-army-ledger-value > small\s*\{[\s\S]*?var\(--ds-text-md\)/);
    expect(styleCss).toMatch(/\.run-army-ledger-value > strong\s*\{[\s\S]*?var\(--ds-text-xl\)/);
  });

  it('uses a canonical tile-backed board scene instead of enlarging a portrait in the unit profile', () => {
    const profile = runArmyWorkspace.match(
      /if \(selected\) \{[\s\S]*?\r?\n  \}\r?\n\r?\n  return \(/,
    )?.[0] ?? '';

    expect(profile).toContain('<RunUnitInspectionScene unit={selected} />');
    expect(profile).not.toContain('<RunArmyPortrait');
    expect(runUnitInspectionScene).toContain('<StudioReadOnlyBoard');
    expect(runUnitInspectionScene).toContain('board={plan.board}');
    expect(runUnitInspectionScene).toContain('boardPan={RUN_UNIT_INSPECTION_CAMERA.pan}');
    expect(runUnitInspectionScene).toContain('coverSeed={plan.coverSeed}');
    expect(runUnitInspectionScene).not.toContain('UnitPortrait');
    expect(runUnitInspectionScene).toContain('className="run-army-profile-scene-viewport"');
    expect(styleCss).toMatch(/\.run-army-profile-body\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(styleCss).toMatch(/\.run-army-profile-scene\s*\{[\s\S]*?position:\s*relative;/);
    expect(styleCss).toMatch(/\.run-army-profile-scene-viewport\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?position:\s*absolute;/);
    expect(styleCss).not.toContain('.run-army-profile-portrait');
  });

  // The played handoff cannot be rendered in this suite (the Battle board needs a live
  // compositor), so the wiring is pinned at its source instead: what the board overlay
  // gives the Run, and what the Run does with it.
  it('keeps the won board visible until Rewards opens its report', () => {
    const victoryBranch = skirmish.match(
      /game\.winner === 'player' \? \([\s\S]*?\n    \) : \(/,
    )?.[0] ?? '';
    const resultCard = skirmish.match(
      /data-testid="run-battle-result"[\s\S]*?onClick=\{\(\) => runBattle\.onVictory\(\{[\s\S]*?\}\)\}/,
    )?.[0] ?? '';

    expect(victoryBranch).toContain('data-chrome-leaf-surface=""');
    expect(victoryBranch).toContain('run-battle-victory-overlay');
    expect(victoryBranch).not.toContain('className="campaign-result ');
    expect(victoryBranch).toContain('role="status"');
    expect(victoryBranch).toContain('<h2>Victory</h2>');
    expect(victoryBranch).toContain('data-testid="run-battle-rewards"');
    expect(victoryBranch).toContain('Rewards &gt;');
    expect(victoryBranch).not.toContain('settings-frame');
    expect(victoryBranch).not.toContain('RunBattleUndoButton');
    expect(skirmish).toContain("game.winner === 'draw' ? <RunBattleUndoButton");
    expect(styleCss).toMatch(/\.run-battle-victory-overlay\s*\{[\s\S]*?display:\s*grid;[\s\S]*?pointer-events:\s*none;/);
    expect(styleCss).toMatch(/\.run-battle-rewards-button\s*\{[\s\S]*?pointer-events:\s*auto;/);
    expect(skirmish).toContain('useSceneOpacityEntrance(');
    expect(skirmish).toContain("!runBattleReviewTerminal && game.winner === 'player'");
    expect(skirmish).toContain('ref={runBattleVictoryBannerRef}');
    expect(styleCss).not.toContain('run-battle-victory-enter');
    expect(styleCss).toMatch(/\.run-battle-victory-banner\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\);/);
    expect(styleCss).toMatch(/\.run-battle-victory-banner h2\s*\{[\s\S]*?grid-column:\s*2;/);
    expect(styleCss).toMatch(/\.run-battle-rewards-button\s*\{[\s\S]*?grid-column:\s*3;[\s\S]*?min-inline-size:\s*0;/);

    // The exact review surface is itself craftable. The server response carries a transient
    // landing instruction beside the valid Battle document; the painted matching board consumes
    // it through the canonical one-shot victory action before the director reveals the scene.
    expect(useRunCraft).toContain('registerCraftedBattleResult(crafted.run, crafted.battleResult)');
    expect(craftedRunLanding).toContain("run.phase === 'battle'");
    expect(runScreen).toContain('const craftedBattleResult = onReviewRewards ? null : craftedBattleResultFor(run);');
    expect(runScreen).toContain('craftedResult: craftedBattleResult');
    expect(runScreen).toContain('reviewTerminalResult: Boolean(onReviewRewards || craftedBattleResult)');
    expect(skirmish).toContain("runBattle?.craftedResult !== 'player'");
    expect(skirmish).toContain('activityId !== runBattle.activityId');
    expect(skirmish).toContain('!playableSurfaceReady');
    expect(skirmish).not.toContain('|| !sceneActivated\n      || game.winner');
    expect(skirmish).toContain('useLayoutEffect(() => {');
    expect(skirmish).toContain("if (armAdminMode('win-battle')) adminWinBattle()");
    expect(runScreen).toContain('clearCraftedBattleResult({');
    // Back is a verb of the report box, so its test id is declared with the verb; the row that
    // seats it is what puts the attribute on the element.
    expect(runScreen).toContain("testId: 'run-aftermath-back',");
    expect(chromeVerbRow).toContain("'data-testid': verb.testId,");
    expect(runScreen).toContain("onReviewBattle={() => navigateRunView('battle-review')}");
    expect(runScreen).toContain("onReviewRewards={reviewingWonBattle ? () => navigateRunView('primary') : undefined}");
    expect(runScreen).toContain('loadReviewableRunBattleMatch(');
    expect(skirmish).toContain('? loadReviewableRunBattleMatch(levelId, activityId)');
    expect(runScreen).toContain("? { ...shellRun, phase: 'battle', aftermath: null }");
    expect(runScreen).toContain('clearMatch();');
    // The won-board snapshot outlives the report's Continue, because the report itself is
    // reachable from the Sectio it opens; the Sectio's Continue is what retires it (ADR-0568).
    expect(runScreen).toMatch(/data-testid="continue-run-sectio"[\s\S]{0,400}?clearMatch\(\);/);
    expect(runScreen).not.toMatch(/replace\(leaveAftermath\(run\)\);\s*\n\s*clearMatch\(\);/);
    // Back to Victory is seated with Continue, and reopens the report without touching the
    // Sectio standing behind it.
    expect(runScreen).toContain('data-testid="review-run-victory"');
    expect(runScreen).toContain('replace(reviewSectioBattleReport(run));');
    expect(runScreen).toContain('const battleReport = sectioBattleReport(run);');
    expect(runScreen).toContain('disabled={!battleReport}');
    expect(runScreen).toContain("data-run-controls-scroll={sectio ? 'scroll' : 'static'}");
    expect(styleCss).toMatch(/\.run-meta-controls\[data-run-controls-scroll="static"\]\s*\{[\s\S]*?overflow-y:\s*hidden;/);

    // The turn count lives in the board store and unmounts with the board, so it is read
    // while the board is still standing and travels with the survivors.
    expect(skirmish).toContain('const turnsElapsed = useSkirmish((s) => s.turnsElapsed);');
    expect(resultCard).toContain('survivingUnitIds: game.pieces');
    expect(resultCard).toContain('turns: turnsElapsed,');
    expect(skirmish).toContain('onVictory: (report: RunBattleReport) => void;');

    expect(runScreen).toContain('const closed = closeBattle(latest, report);');
    expect(runScreen).toContain('replace(closed);');
    expect(runScreen).not.toContain('replace(openSectio(latest');
    expect(runScreen).toContain("shellRun.phase === 'aftermath' && shellRun.aftermath");
    expect(runScreen).toContain('<AftermathPanel');
    expect(runScreen).toContain('replace(leaveAftermath(run));');
    expect(runScreen).not.toContain('run-aftermath-eyebrow');
    expect(runScreen).not.toContain('Conflict {progress.conflict} · Battle');
    // A Battle's Aftermath and a War's Victory are the same moment at two scales, so ONE set of
    // rules composes both and the optical placement cannot drift apart between them (ADR-0456).
    expect(styleCss).toMatch(/\.run-aftermath-workspace,\s*\.run-victory-workspace\s*\{[\s\S]*?container-type:\s*size;/);
    expect(styleCss).toMatch(/\.run-aftermath-workspace-content,\s*\.run-victory-workspace-content\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\);/);
    expect(styleCss).toMatch(/\.run-aftermath-head,\s*\.run-victory-head,\s*\.run-aftermath-report,\s*\.run-victory-report\s*\{[\s\S]*?translate:\s*0 -5cqh;/);
    // The report is the whole slab now — its verbs are its bottom row — so both take the same
    // grid row and the same zero padding, because a divided box's rails run its full inner width.
    expect(styleCss).toMatch(/\.run-aftermath-report,\s*\.run-victory-report\s*\{\s*\r?\n\s*grid-row:\s*2;\s*\r?\n\s*padding:\s*0;/);
    // Only the display heading may stand on the artwork; every factual line moved into the
    // report box, because Victory's backdrop is a bright daylight sky.
    expect(runScreen).toMatch(/<ChromeDividedGridRow spans="all" className="run-victory-record">[\s\S]*?run\.war\.description[\s\S]*?<\/ChromeDividedGridRow>/);
    expect(runScreen).not.toMatch(/<h2>\{run\.war\.name\}<\/h2>/);
    // Both report boxes name the structural marble. Naming no fill drops a box onto the inner
    // role's TINT — a translucent field rather than an installed material, and unapproved paint
    // no gate catches, because it arrives from the generated role CSS and not from style.css.
    expect(runScreen).toMatch(/className="run-victory-report"\s*\r?\n\s*columns=\{verbColumns\(verbs\)\}\s*\r?\n\s*fillRole=\{CHROME_STRUCTURAL_FILL_ROLE\}/);
    // The aftermath report's own fill is pinned above, against the wrapping this file already
    // expects. Asserting it a second time here only pinned a line break.
    expect(styleCss).toMatch(/\.run-screen\.has-lipsana \.run-aftermath-workspace-content\s*\{[\s\S]*?padding-block-start:\s*0;/);

    // The reward is reported in aftermath; restating it in Sectio remains retired.
    expect(runScreen).not.toContain('run-sectio-rules');
    expect(styleCss).not.toContain('.run-sectio-rules');
  });

  it('pairs a paid Run checkpoint with the board before every player move', () => {
    expect(runScreen).toContain('capture: () => {');
    expect(runScreen).toContain('captureRunBattleUndo(latest)');
    expect(runScreen).toContain('canUndoRunBattleMove(latest, checkpoint)');
    expect(runScreen).toContain('const restored = undoRunBattleMove(latest, checkpoint);');
    expect(skirmish).toContain('setRunBattleUndoAdapter(runBattle?.undoAdapter ?? null)');
    expect(gameStore).toContain('const captured = capturePlayerMoveUndo();');
    // The line wears the coin, because what it reports is the Run's economy moving — the
    // same mark the bounty lines two rows up wear when it moves the other way.
    expect(gameStore).toContain("log: extendLog(checkpoint.log, [logNote('Move undone — 10 gold paid.', 'gold')])");
    expect(gameStore).toContain('commitPlayerMove(p, mv, type, true);');
    expect(matchPersistence).toContain('undoStack: state.undoStack ?? []');
  });

  it('keeps one checkpoint per played move and prices every step of the walk back', () => {
    // The history is a stack the Battle grows a move at a time, and Undo pops it rather than
    // emptying it, so the whole Battle is reachable a decision at a time (ADR-0556).
    expect(gameStore).toContain('const undoStack = captured ? [...s.undoStack, captured] : [];');
    expect(gameStore).toContain('const checkpoint = s.undoStack[s.undoStack.length - 1];');
    expect(gameStore).toContain('undoStack: s.undoStack.slice(0, -1).map((older) => ({');
    expect(gameStore).toContain('run: adapter.chargeEarlier(older.run),');
    expect(runScreen).toContain('chargeEarlier: (checkpoint) => chargeRunBattleUndoCheckpoint(checkpoint),');
    // The board store holds the history; only the Run names a price for it, so the store's
    // view of run/model stays type-only and no gold arithmetic leaks into the board.
    expect(gameStore).toContain(
      "import type { RunBattleNotice, RunBattleUndoCheckpoint } from '../run/model';",
    );
  });
});
