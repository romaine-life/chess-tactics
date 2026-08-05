// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
const runArmyWorkspace = readFileSync(new URL('./RunArmyWorkspace.tsx', import.meta.url), 'utf8');
const runExpunctioWorkspace = readFileSync(new URL('./RunExpunctioWorkspace.tsx', import.meta.url), 'utf8');
const runTitleBarChips = readFileSync(new URL('./RunTitleBarChips.tsx', import.meta.url), 'utf8');
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
const runCardFlight = readFileSync(new URL('./runCardFlightView.tsx', import.meta.url), 'utf8');
const strategikonTitleNavigation = readFileSync(new URL('./StrategikonTitleNavigation.tsx', import.meta.url), 'utf8');
const runCardFace = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
const runBattlePreview = readFileSync(new URL('./RunBattlePreview.tsx', import.meta.url), 'utf8');
const runDeploymentCardStack = readFileSync(new URL('./RunDeploymentCardStack.tsx', import.meta.url), 'utf8');
const runLipsana = readFileSync(new URL('./Lipsana.tsx', import.meta.url), 'utf8');
const runSelfInspection = readFileSync(new URL('./RunSelfInspection.tsx', import.meta.url), 'utf8');
const skirmish = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
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

describe('Run chrome hierarchy', () => {
  it('admits every Run phase through the form-owned shell and HUD', () => {
    const metaControls = runScreen.match(
      /function RunMetaControls\b[\s\S]*?\r?\n}\r?\n\r?\nfunction deploymentSquareLabel/,
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
    expect(runScreen).toContain('<RunTitleBarStatus run={shellRun} path={routePath} search={routeSearch} view={view} />');
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
    expect(metaControls).toContain('Continue to first Battle');
    expect(metaControls).toContain('Continue to next Battle');
    expect(metaControls).not.toContain('openingNeedsPurchase');
    expect(metaControls).not.toContain('Buy one card before continuing.');
    expect(metaControls).not.toContain('data-ui-sfx="gold"');
    expect(metaControls).not.toContain('<OuterChromeBox');
    expect(metaControls).not.toContain('data-chrome-unit="outer-panel"');
    expect(runArmyWorkspace).toContain('data-ui-sfx={status === \'alienable\' ? \'gold\' : undefined}');
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
    expect(runScreen).toContain("&& (shellRun?.phase === 'deployment' || shellRun?.phase === 'battle')");
    expect(runScreen).not.toContain('klerosisRun');
    expect(runScreen).toContain('const runSurfacePhase = sceneSnapshot.phase;');
    expect(runScreen).toContain('? `${shellRun.id}:battlefield:${shellRun.battleIndex}:${runSceneWorkspaceIdentity(sceneSnapshot.workspace)}`');
    expect(runScreen).toContain('<RunBattlefieldPanel');
    expect(runScreen).toContain('form={form}');
    expect(runScreen).not.toMatch(/if \([^)]*phase === 'deployment'[\s\S]{0,200}return \(/);
    expect(skirmish).toContain('presentedDeploymentSurface');
    expect(skirmish).toContain('preserveBoardPresentation: true');
    expect(skirmish).toContain("unitArrivals={sceneActivated ? 'active' : 'pending'}");
    expect(skirmish).toContain('onArrivingUnitIdsChange={runDeployment?.onArrivingUnitIdsChange}');
    expect(skirmishBoard).toContain('newlyVisibleArrivalPieces(visibleUnitIdsRef.current, livePieces)');
    expect(runScreen).toContain('onArrivingUnitIdsChange: reportArrivals');
    expect(runScreen).not.toContain('pendingPlacementArrivalUnitIdRef');
    expect(runScreen).not.toContain('RunWorkspaceStages');
    expect(runScreen).not.toContain('window.history');
    expect(runScreen).toContain('const run = sceneSnapshot.run;');
    expect(runScreen).not.toContain('const run = useActiveRun((state) => state.run);');
    expect(styleCss).not.toContain('.run-stage');
    expect(sceneManifest).toContain("instance(SCENE_DEFINITIONS.runPhase, { phase: phaseIdentity })");
    expect(sceneManifest).toContain('workspace: runSceneWorkspaceIdentity(snapshot.workspace),');
    expect(sceneDirector).toContain("type: 'refresh-source'");
    expect(app).toContain("source: 'active-run'");
    expect(app).toContain('sceneSnapshot={scene.snapshot as RunSceneSnapshot}');
    expect(app).toContain('overlapsStateDrivenRunScene');
    expect(app).toContain('(!preservesSceneHost || overlapsRunScene)');
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

  it('keeps the retained Controls panel out of an overlapping Run workspace fade', () => {
    // Sectio <-> Alienatio overlaps two complete Run layers so the outgoing snapshot stays
    // frozen. Both layers paint the same Controls panel, so fading the boundary blended
    // its title plank toward the backdrop mid-transition. Only the shell's replaceable
    // viewport may carry that fade; the panel is a sibling of it and must not.
    expect(chromeBox).toContain('{...shellViewportOverlapRegion()}');
    expect(chromeBox).toMatch(/<section[\s\S]*?\{\.\.\.shellViewportOverlapRegion\(\)\}[\s\S]*?data-shell-viewport-swap=""/);
    expect(app).toContain('sceneOverlapScope(scene.current, scene.destination!)');
    expect(app).toContain('overlapScope={layer.overlapScope}');
    expect(sceneBoundary).toContain("data-scene-overlap-scope={overlapScope === 'scene' ? undefined : overlapScope}");
    expect(styleCss).toMatch(/\.scene-director\.is-entering \.scene-boundary\[data-scene-overlap-scope="shell-viewport"\]\[data-scene-visual-role="outgoing"\]\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?transition:\s*none;/);
    expect(styleCss).toMatch(/\.scene-director\.is-entering \.scene-boundary\[data-scene-overlap-scope="shell-viewport"\]\[data-scene-transition-active\]\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?transition:\s*none;/);
    expect(styleCss).toMatch(/\.scene-director\.is-entering \.scene-boundary\[data-scene-overlap-scope="shell-viewport"\]\[data-scene-visual-role="outgoing"\] \[data-scene-overlap-region\]\s*\{[\s\S]*?opacity:\s*0;/);
    expect(styleCss).toMatch(/\.scene-director\.is-entering \.scene-boundary\[data-scene-overlap-scope="shell-viewport"\]\[data-scene-transition-active\] \[data-scene-overlap-region\]\s*\{[\s\S]*?opacity:\s*1;/);
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
    expect(runCard).toContain('data-ui-sfx="gold"');
    expect(runScreen).toContain('useRunCardFlights()');
    expect(runScreen).toContain("document.querySelector('[data-run-card-flight-target]')");
    expect(runScreen).toContain('sectio.cardOffers.filter((offer) => !sectio.adlectedCardOfferIds.includes(offer.offerId))');
    expect(runScreen).toContain('admitted by Adlectio and added to the Chartulary.');
    expect(runScreen).toContain('All offered cards are in the Chartulary.');
    expect(runCardFlight).toContain('<RunCard card={flight.offer} mode="reference" />');
    expect(runCard).not.toContain('run-card-purchased-indicator');
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
      'run-alienatio-workspace',
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
    expect(runScreen).toContain('<HouseSelect');
    expect(runArmyWorkspace).toContain('<HouseSelect');
    expect(runWorkspaceRule).toContain('position: relative');
    expect(runWorkspaceRule).not.toMatch(/\b(?:padding|gap)\s*:/);
    expect(runScreen).toContain('visibleLipsanonCount(shellRun)');
    expect(runScreen).toContain('|| bonaTarget');
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
    expect(skirmish).toContain("testId: runDeployment ? 'run-deployment' : 'skirmish'");
    expect(skirmish).toContain("className: 'skirmish-war-room'");
    expect(skirmish).toContain("primaryClassName: 'skirmish-field'");
    expect(runScreen).toContain('className="run-meta-controls run-deployment-controls"');
    expect(skirmish).toContain('<SkirmishBoard');
    expect(skirmish).toContain('surfaceState={presentedDeploymentSurface}');
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
    expect(runDeploymentCardStack).toContain('Deal automatically');
    expect(runDeploymentCardStack).toContain('data-deployment-center-deck');
    expect(runDeploymentCardStack).toContain("deployment?.stage === 'awaiting-deal' || deployment?.stage === 'dealing'");
    expect(runDeploymentCardStack).toContain('emptyPieceIndices={activePresentation?.emptyPieceIndices ?? []}');
    expect(runDeploymentCardStack).not.toContain('owned.unitSeats.slice(');
    expect(styleCss).toMatch(/\.run-deployment-stack-card\.is-active\.is-revealed > \.run-deployment-stack-side\.is-back\s*\{[\s\S]*?transform:\s*rotateY\(-180deg\)/);
    expect(styleCss).toMatch(/\.run-deployment-stack-card\.is-active\.is-revealed > \.run-deployment-stack-side\.is-front\s*\{[\s\S]*?transform:\s*rotateY\(0deg\)/);
    expect(styleCss).not.toMatch(/\.run-deployment-stack-card\.is-active\.is-revealed\s*\{[\s\S]*?transform:\s*rotateY/);
    expect(runScreen).toContain('Full deploy');
    expect(runScreen).toContain('data-testid="deployment-next"');
    expect(runScreen).toContain("onSetTransport('playing')");
    expect(runScreen).toContain("onSetTransport('paused')");
    expect(runScreen).not.toContain('Place {activeUnit.type');
    expect(runScreen).toContain("setDeploymentTransport(latest, transport)");
    expect(runScreen).toContain("placeRevealedDeploymentUnit(paused, level)");
    expect(runScreen).not.toContain('View Formation {index + 1}');
    expect(runScreen).not.toContain('Deploy this formation');
    expect(runScreen).toContain('renderCellOverlay: ({ cell, visualFootprintStyle }) => {');
    expect(runScreen).not.toContain('FramedReadOnlyBoardView');
    expect(runScreen).not.toContain('levelToEditorBoard');
    expect(runScreen).toContain("legal ? 'is-move' : 'is-deployment-blocked'");
    expect(runScreen).toContain('aria-disabled={!legal}');
    expect(runScreen).toContain('if (event.button === 0) event.stopPropagation();');
    expect(runScreen).toContain('onClick={legal ? () => replace(placeAdlectedDeploymentUnit(prepared, level, cell)) : undefined}');
    expect(runScreen).toContain('boardLabCellPosition(hoveredPlacementCell)');
    expect(runScreen).toContain('left: hoveredPlacementSeat.left');
    expect(runScreen).toContain('zIndex: objectBaseZIndex(hoveredPlacementCell)');
    expect(runScreen).toContain('data-testid="deployment-placement-ghost"');
    expect(runScreen).not.toContain('const showGhost = hoveredCellKey === cellKey');
    expect(runScreen).toContain('gameForRunDeployment(prepared, level, layout, true)');
    expect(runScreen).toContain("stage === 'adlected'");
    expect(runScreen).toContain('advanceAutomaticDeployment(deployment, level)');
    expect(runScreen).toContain('placeRevealedDeploymentUnit(paused, level)');
    expect(runScreen).not.toContain('data-testid="begin-run-battle"');
    expect(runScreen).not.toContain('onBeginBattle');
    // The phase is the title bar's first clickable ROUTE segment (Run › Sectio),
    // and an open Strategikon appends its exact canonical section/reference links.
    expect(runScreen).toContain('<TitleRoute segments={runTitleBarRouteSegments(run, path, search, view)} />');
    expect(runScreen).toContain('runWorkspaceTitleSegment(`/run${search}`, view)');
    expect(runScreen).toContain('strategikonRouteCrumbs(path).map');
    expect(runScreen).toContain('<RunTitleBarStatus run={shellRun} path={routePath} search={routeSearch} view={view} />');
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

    expect(runArmyWorkspace).toContain('<KitScroll className="run-sectio-operation-list-scroll">');
    expect(runExpunctioWorkspace).toContain('<KitScroll className="run-sectio-operation-list-scroll">');
    expect(runArmyWorkspace).toContain('className="run-sectio-operation-list run-alienatio-list"');
    expect(runExpunctioWorkspace).toContain('className="run-sectio-operation-list run-expunctio-list"');
    expect(runArmyWorkspace).toContain('data-chrome-fill-surface="baseline-stone-blue"');
    expect(runExpunctioWorkspace).toContain('data-chrome-fill-surface="baseline-stone-blue"');
    expect(runArmyWorkspace).toContain("['--run-operation-row-index' as string]: index");
    expect(runExpunctioWorkspace).toContain("['--run-operation-row-index' as string]: index");
    expect(styleCss).toMatch(/\.run-alienatio-row\s*\{[\s\S]*?--chrome-surface-position-y:\s*calc\(var\(--run-operation-row-index, 0\)/);
    expect(styleCss).toMatch(/\.run-expunctio-row\s*\{[\s\S]*?--chrome-surface-position-y:\s*calc\(var\(--run-operation-row-index, 0\)/);
    expect(styleCss).toMatch(/\.run-alienatio-row\s*\{[^}]*--run-operation-surface-pitch:\s*calc\(112px \+ var\(--ds-inline-tight\)\);[^}]*block-size:\s*112px;/s);
    expect(styleCss).toMatch(/\.run-expunctio-row\s*\{[^}]*--run-operation-surface-pitch:\s*calc\(252px \+ \(2 \* var\(--ds-space-3\)\) \+ var\(--ds-inline-tight\)\);[^}]*block-size:\s*calc\(252px \+ \(2 \* var\(--ds-space-3\)\)\);/s);
    expect(styleCss).toMatch(/@media \(max-width: 960px\)[\s\S]*?\.run-alienatio-row\s*\{[^}]*--run-operation-surface-pitch:\s*calc\(224px \+ var\(--ds-inline-tight\)\);[^}]*block-size:\s*224px;/s);
    expect(styleCss).toMatch(/\.run-sectio-operation-list-scroll\s*\{[^}]*--run-operation-clip-apron-block-start:\s*var\(--le-inner-atom-top-overhang, 0px\);[^}]*--run-operation-clip-apron-block-end:\s*var\(--le-inner-atom-bottom-overhang, 0px\);/s);
    expect(styleCss).toMatch(/\.run-sectio-operation-list-scroll > \.kit-scroll-rail\s*\{[^}]*bottom:\s*var\(--run-operation-clip-apron-block-end\);[^}]*top:\s*var\(--run-operation-clip-apron-block-start\);/s);
    expect(operationListRule).toMatch(/overflow-block:\s*clip/);
    expect(operationListRule).toMatch(/overflow-inline:\s*visible/);
    expect(operationListRule).toMatch(/padding-block:\s*var\(--run-operation-clip-apron-block-start\)\s*var\(--run-operation-clip-apron-block-end\)/);
    expect(operationListRule).not.toMatch(/overflow(?:-[xy])?:\s*(?:auto|scroll)/);
    expect(styleCss).not.toMatch(/\.run-(?:alienatio|expunctio)-row:nth-child/);
    expect(styleCss).not.toMatch(/\.run-alienatio-row(?:\.is-aliened|:is\([^}]+\))\s*\{[^}]*opacity:/);
    expect(styleCss).not.toMatch(/\.run-expunctio-row:is\([^}]+\)\s*\{[^}]*opacity:/);
  });

  it('reserves structural teal for containers and paints Run leaf chrome with data-phased oak', () => {
    const metaControls = runScreen.match(
      /function RunMetaControls\b[\s\S]*?\r?\n}\r?\n\r?\nfunction deploymentSquareLabel/,
    )?.[0] ?? '';

    expect(chromeSurfacePolicy).toContain("export const CHROME_LEAF_FILL_SURFACE = 'hybrid-wood-oak'");
    expect(houseSelect).toContain('fillSurface?: string;');
    expect(houseSelect).toContain('data-chrome-fill-surface={fillSurface}');
    expect((runArmyWorkspace.match(/fillSurface=\{CHROME_LEAF_FILL_SURFACE\}/g) ?? [])).toHaveLength(4);
    expect(runArmyWorkspace).toContain("['--run-roster-filter-index' as string]: 3");
    expect(styleCss).toMatch(/\.run-roster-filters \.house-select\s*\{[\s\S]*?--chrome-surface-position-y:\s*calc\(var\(--run-roster-filter-index, 0\)/);

    expect(metaControls).toContain('data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}');
    expect(metaControls).toContain('SECTIO_WORKSPACE_VIEWS.map((candidate, index) =>');
    expect(metaControls).toContain("['--run-leaf-control-index' as string]: index + 1");
    expect(metaControls).toContain("['--run-leaf-control-index' as string]: SECTIO_WORKSPACE_VIEWS.length + 3");
    expect(styleCss).toMatch(/\.run-meta-controls \[data-chrome-fill-surface\]\s*\{[\s\S]*?--chrome-surface-position-y:\s*calc\(var\(--run-leaf-control-index, 0\)/);

    expect(runArmyWorkspace).toContain('data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}');
    expect(runExpunctioWorkspace).toContain('data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}');
    expect(runTitleBarChips).toMatch(/<TitleBarStatus[\s\S]*?data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}/);
    expect(runArmyWorkspace).toContain('data-chrome-fill-surface="baseline-stone-blue"');
    expect(runExpunctioWorkspace).toContain('data-chrome-fill-surface="baseline-stone-blue"');
    expect(styleCss).not.toMatch(/\.run-(?:roster-filters|meta-controls)[^}]*:nth-child/);
  });

  it('uses Alienatio as the operation noun and Aliene as its action verb', () => {
    expect(runArmyWorkspace).toContain('<h2 id="run-alienatio-workspace-title">Alienatio</h2>');
    expect(runArmyWorkspace).toContain("status === 'alienable' ? 'Aliene'");
    expect(runArmyWorkspace).toContain("status === 'aliened' ? 'Aliened this visit'");
    expect(runArmyWorkspace).toContain("{ value: 'aliened', label: 'Aliened this visit' }");
    expect(runArmyWorkspace).toContain("? 'Aliened during this Sectio visit. Reset Sectio to restore this unit.'");
    expect(runArmyWorkspace).toContain("<span>{unit.type === 'king' ? 'Retained' : 'Aliene'}</span>");
    expect(runArmyWorkspace).not.toContain("status === 'alienable' ? 'Alienatio'");
    expect(runArmyWorkspace).not.toContain('Alienated this visit');
    expect(runArmyWorkspace).not.toContain('onAlienate');
    expect(runScreen).toContain('const alieneUnit = (unitId: string): void => {');
    expect(runScreen).toContain('onAliene={alieneUnit}');
    expect(styleCss).toContain('.run-alienatio-row:is(.is-aliened, .is-retained) > *');
  });

  it('previews the upcoming Sectio Battle through the canonical read-only board and Level ledger', () => {
    expect(runBattlePreview).toContain('<RunSceneViewport');
    expect(runBattlePreview).toContain("view: 'battle-preview'");
    expect(runBattlePreview).toContain('<FramedReadOnlyBoardView');
    expect(runScreen).toContain('<RunBattlePreview run={run} />');
    expect(runBattlePreview).toContain('<LevelInfoCompact level={level} />');
    expect(runBattlePreview).toContain('levelToEditorBoard(level)');
    expect(runBattlePreview).toContain('Drag to pan · scroll to zoom');
    expect(runBattlePreview).toContain('setup forces whose');
    expect(runBattlePreview).not.toContain('<OuterChromeBox');
    expect(runBattlePreview).not.toContain('<LevelPreviewColumn');
    expect(runBattlePreview).not.toContain('backgroundArtwork');
    expect(styleCss).toMatch(/\.run-battle-preview-layout\s*\{[\s\S]*?grid-template-areas:[\s\S]*?"head intelligence"[\s\S]*?"board intelligence"/);
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
    // A held card's property (ADR-0371) reaches the face through the projection too,
    // rather than RunCard re-deriving a frame or a face from it.
    expect(runCard).toContain('emptyPieceIndices,');
    expect(runCard).toContain('runCardFaceContent(card, {');
    expect(runCard).toContain('runCardFrameSlot(card, ownedCardType)');
    expect(runCard).not.toContain('RUN_CARD_PESTIFEROUS_FRAME_SLOT');
    expect(runCard).not.toContain('RUN_CARD_LEGATINE_FRAME_SLOT');
    expect(runCard).not.toContain('RUN_CARD_CONCINNOUS_FRAME_SLOT');
    expect(runCard).not.toContain('RUN_CARD_HIERATIC_FRAME_SLOT');
    expect(runCard).not.toContain("'adlected' as const");
    expect(runCard).not.toContain("'agminate' as const");
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
    // Cold route entry still holds the veil for any nested painted surface: the
    // shell's painted-surface boundary waits for loading surfaces before painting.
    expect(paintedSurfaceBoundary).toContain(".querySelector('.painted-surface.is-loading')");
    expect(paintedSurfaceBoundary).toContain('.then(nestedSurfacesSettled)');
  });

  it('uses one divided Army ledger grid with readable metadata and value hierarchy', () => {
    const ledgerBranch = runArmyWorkspace.slice(
      runArmyWorkspace.indexOf('className="run-self-inspection-workspace run-army-workspace run-army-ledger"'),
      runArmyWorkspace.indexOf('interface AlienatioRow'),
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
  // compositor), so the wiring is pinned at its source instead: what the result card
  // gives the Run, and what the Run does with it.
  it('hands the won Battle to its own report instead of straight to the Sectio', () => {
    const resultCard = skirmish.match(
      /data-testid="run-battle-result"[\s\S]*?onClick=\{\(\) => runBattle\.onVictory\(\{[\s\S]*?\}\)\}/,
    )?.[0] ?? '';

    // The turn count lives in the board store and unmounts with the board, so it is read
    // while the board is still standing and travels with the survivors.
    expect(skirmish).toContain('const turnsElapsed = useSkirmish((s) => s.turnsElapsed);');
    expect(resultCard).toContain('survivingUnitIds: game.pieces');
    expect(resultCard).toContain('turns: turnsElapsed,');
    expect(skirmish).toContain('onVictory: (report: RunBattleReport) => void;');

    expect(runScreen).toContain('if (latest?.id === runId) replace(closeBattle(latest, report));');
    expect(runScreen).not.toContain('replace(openSectio(latest');
    expect(runScreen).toContain("shellRun.phase === 'aftermath' && shellRun.aftermath");
    expect(runScreen).toContain('<AftermathPanel run={shellRun} />');
    expect(runScreen).toContain('onClick={() => replace(leaveAftermath(run))}');

    // The reward is reported on the Battle's own screen; restating it in the Sectio is the
    // placement ADR-0377 retired.
    expect(runScreen).not.toContain('run-sectio-rules');
    expect(styleCss).not.toContain('.run-sectio-rules');
  });

  it('pairs a paid Run checkpoint with the board before every player move', () => {
    expect(runScreen).toContain('capture: () => {');
    expect(runScreen).toContain('captureRunBattleUndo(latest)');
    expect(runScreen).toContain('canUndoRunBattleMove(latest, checkpoint)');
    expect(runScreen).toContain('const restored = undoRunBattleMove(latest, checkpoint);');
    expect(skirmish).toContain('setRunBattleUndoAdapter(runBattle?.undoAdapter ?? null)');
    expect(gameStore).toContain('const undoCheckpoint = capturePlayerMoveUndo();');
    expect(gameStore).toContain("log: ['Move undone — 1 gold paid.', ...checkpoint.log]");
    expect(gameStore).toContain('beforeApply?.(piece.id);');
    expect(gameStore).toContain('commitPlayerMove(p, mv, undefined, true, commitRunCashOut);');
    expect(matchPersistence).toContain('undoCheckpoint: state.undoCheckpoint ?? null');
  });
});
