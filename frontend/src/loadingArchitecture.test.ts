// @ts-nocheck - source-level regression guards for forbidden competing paths.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('professional loading architecture guards', () => {
  it('has exactly one route lifecycle owner and no generic route fallback', () => {
    const app = read('./ui/App.tsx');
    const director = read('./ui/shell/sceneDirector.ts');
    const boundary = read('./ui/shell/SceneBoundary.tsx');
    expect(app).toContain('<SceneBoundary');
    expect(app).toContain('sceneManifest(initialPath, window.location.search, {');
    expect(app.indexOf('<AppTitleBar')).toBeLessThan(app.indexOf('<SceneBoundary'));
    expect(app).toContain('<Suspense fallback={null}>');
    expect(app).not.toMatch(/route-veil|screen-exit|screen-enter|useScreenEntrance|screenExit/);
    expect(director).toContain("ScenePhase = 'startup' | 'current' | 'exiting' | 'loading' | 'entering' | 'error'");
    expect(director).toContain("type: 'startup-reveal'");
    expect(app).toContain('<StartupSceneContext.Provider');
    expect(boundary).toContain("manifest.paintOwner === 'dom'");
    expect(boundary).toContain('participantsRef.current.get(manifest.paintOwner)');
    expect(app).toContain("visualRole: 'outgoing' as const");
    expect(app).toContain("visualRole: 'incoming' as const");
    expect(app).not.toContain("manifest.background === 'homepage'");
    expect(read('./style.css')).not.toContain('.scene-homepage-background.is-destination');
  });

  it('accepts redundant legacy port flags only inside a devctl-managed environment', () => {
    const launcher = read('../scripts/start-vite-dev.mjs');
    expect(launcher).toContain('if (badArg && managedPort === null)');
    expect(launcher).toContain("managedPort !== null && (arg === '--port' || arg === '-p')");
    expect(launcher).toContain("managedPort !== null && (arg === '--strictPort' || arg.startsWith('--port='))");
    expect(launcher).toContain("...(managedPort ? ['--port', String(managedPort), '--strictPort'] : [])");
  });

  it('enrolls standalone Studio routes in the Studio scene owner', () => {
    expect(read('./ui/WallCandidateReview.tsx').replace(/\r\n/g, '\n')).toContain("useSceneParticipant(\n    'studio'");
    expect(read('./ui/WallCandidateReview.tsx')).toContain('onFirstFrame');
    expect(read('./ui/WallCandidateReview.tsx')).toContain('onFrameError');
    expect(read('./ui/DrawableCatalogLab.tsx').replace(/\r\n/g, '\n')).toContain("useSceneParticipant(\n    'studio'");
    expect(read('./ui/RunShopArtReview.tsx')).toContain("useSceneParticipant('studio'");
    expect(read('./ui/RunRelicReview.tsx')).toContain("useSceneParticipant('studio'");
  });

  it('keeps asynchronous deep-linked Studio viewers inside the scene gate', () => {
    const gameLab = read('./ui/GameLab.tsx');
    const gym = read('./ui/Gym.tsx');
    const solver = read('./ui/SolveRuns.tsx');
    expect(gameLab).toContain("'studio:gamelab-viewer'");
    expect(gameLab).toContain('campaignsSettled && savedRuns !== null && signedIn !== null');
    expect(gameLab).toContain('savedRuns !== null && signedIn !== null');
    expect(gym).toContain("'studio:gym-viewer'");
    expect(gym).toContain('campaignsSettled && (!level ||');
    expect(gym).toContain('booksSettledFor === level.id && ready');
    expect(gym).toContain('worker.onerror');
    expect(solver).toContain("'studio:solver-runs'");
    expect(solver).toContain("'studio:solver-viewer'");
    expect(solver).toContain('initialSettled ?');
  });

  it('gives every retry and retarget a fresh cancellable scene generation', () => {
    const app = read('./ui/App.tsx');
    const director = read('./ui/shell/sceneDirector.ts');
    expect(app).toContain('const sceneLayers = overlapsCompleteScenes');
    expect(app).toContain('key: scene.current.leaf.key');
    expect(app).toContain('key: scene.destination!.leaf.key');
    expect(app).toContain('sceneLayers.map((layer)');
    expect(app).toContain('key={layer.key}');
    expect(app).not.toContain('key={`incoming:');
    expect(read('../scripts/shot.mjs')).toContain("const assertFullSceneExit = has('assert-full-scene-exit')");
    expect(read('../scripts/shot.mjs')).toContain('sameBoundary: boundary === window.__ctOutgoingSceneBoundary');
    expect(read('../scripts/shot.mjs')).toContain('assertImmediateLocalControl || backAfterClickMs !== undefined');
    expect(read('../scripts/shot.mjs')).toContain('full-scene wait did not retain the painted outgoing boundary');
    expect(read('../scripts/shot.mjs')).toContain('painted destination was remounted instead of promoted in place');
    expect(read('../scripts/shot.mjs')).toContain('rail.getClientRects().length > 0');
    expect(read('../scripts/shot.mjs')).toContain('.main-menu-mode-tab[data-nav="/editor"]');
    expect(app).toContain("const mountedScene = scene.phase === 'exiting'");
    expect(app).toContain('scene.destination ?? scene.current');
    expect(app).toContain('renderScene(layer.scene, layer.search)');
    expect(director).toContain('generation: state.generation + 1');
    expect(director).toContain('if (action.generation !== state.generation) return state');
    expect(app).toContain("'scene-cancelled'");
    expect(app).toContain("'scene-retry'");
    expect(app).toContain('A required level preview could not be prepared.');
  });

  it('keeps authored committed and pending scene instances separate from browser intent', () => {
    const app = read('./ui/App.tsx');
    const play = read('./ui/PlayMenu.tsx');
    const manifest = read('./ui/shell/sceneManifest.ts');
    const slots = read('./ui/shell/sceneSlots.ts');
    expect(manifest).toContain('export interface SceneDefinition');
    expect(manifest).toContain('export interface SceneInstance');
    expect(manifest).toContain('export interface ScenePath');
    expect(slots).toContain('committed: SceneInstance | null');
    expect(slots).toContain('pending: SceneInstance | null');
    expect(app).toContain('data-scene-committed={scene.current.leaf.key}');
    expect(app).toContain('data-scene-pending={scene.destination?.leaf.key}');
    expect(play).not.toContain('APP_NAVIGATION_EVENT');
    expect(play).not.toContain('window.location');
    expect(play).not.toContain('setSelection');
  });

  it('keeps an explicit empty main-menu slot so returning home can acknowledge paint', () => {
    const menu = read('./ui/MainMenu.tsx');
    expect(menu).toContain('<MenuDestinationSceneSlot');
    expect(read('./ui/shell/AuthoredSceneSlot.tsx')).toContain('region="menu-shell"');
    expect(menu).toContain("key={dest ?? 'home'}");
    expect(menu).toContain('<Suspense fallback={null}>');
    expect(menu.indexOf('<Suspense fallback={null}>')).toBeGreaterThan(menu.indexOf('className="menu-dest"'));
    expect(menu).toContain(': null}');
    expect(menu).not.toContain('{dest ? (');
  });

  it('visibly fades a preserved host child before committing an empty slot', () => {
    const app = read('./ui/App.tsx');
    const styles = read('./style.css');
    const target = read('./ui/shell/sceneTransitionTarget.ts');
    const boundary = read('./ui/shell/SceneBoundary.tsx');
    expect(styles).toContain(
      '.scene-director.is-exiting [data-scene-transition-target][data-scene-transition-active]',
    );
    expect(styles).toContain(
      '.scene-director.is-exiting [data-scene-transition-target][data-scene-transition-active][data-scene-transition-mode="contents"] > *',
    );
    expect(styles).toContain(
      '[data-scene-transition-mode="contents"] > .painted-surface > .painted-surface-content > *',
    );
    expect(styles).not.toContain('[data-transition-region="menu-shell"] [data-scene-region="menu-shell"]');
    expect(styles).not.toContain('[data-transition-region="play-shell"] [data-scene-region="play-shell"]');
    expect(styles).not.toContain('[data-transition-region="settings-shell"] [data-scene-region="settings-shell"]');
    expect(target).toContain('sceneTransitionTargetAttributes');
    expect(boundary).toContain("target.setAttribute('data-scene-transition-active', '')");
    expect(boundary).toContain('[generation, mountedKey, preserveHost, transitionRegion]');
    expect(app).toContain('mountedKey={layer.scene.leaf.key}');
    expect(app).toContain('isEmptySlotOrigin(scene.current, destination)');
    expect(app).toContain("'scene-empty-slot-origin-committed'");
    expect(app).toContain('const frame = window.requestAnimationFrame(() => {');
    expect(app).toContain('window.cancelAnimationFrame(frame)');
    expect(styles).not.toContain(
      '.scene-director.is-exiting:not(.is-host-preserving) .app-shell-titlebar',
    );
  });

  it('routes Settings panels through an authored nested scene slot', () => {
    const settings = read('./ui/Settings.tsx');
    const styles = read('./style.css');
    expect(settings).toContain('<SettingsContentSceneSlot');
    expect(settings).toContain('const activeTab = tabFromPath(path)');
    expect(settings).not.toContain('APP_NAVIGATION_EVENT');
    expect(settings).not.toContain('window.location.pathname');
    expect(settings).not.toContain('settings-xfade-');
    expect(styles).toContain('data-scene-transition-active');
    expect(styles).toContain('.settings-scroll > .kit-scroll-content');
    expect(styles).toContain('inline-size: calc(100% - 24px)');
    expect(read('./ui/App.tsx')).toContain("manifest.waitPresentation === 'loading'");
  });

  it('routes Editor collections and campaigns through one authored nested scene slot', () => {
    const editor = read('./ui/CampaignEditor.tsx');
    const manifest = read('./ui/shell/sceneManifest.ts');
    expect(editor).toContain('<EditorContentSceneSlot');
    expect(editor).toContain('const selectedCollection = editorCollectionFromLocation(path, search)');
    expect(editor).toContain("navigateApp(editorCampaignHref('/editor', campaignId))");
    expect(editor).not.toContain('setSelectedCollection');
    expect(editor).not.toContain('window.history.replaceState');
    expect(manifest).toContain("'campaign-editor': 'editor-shell'");
    expect(manifest).toContain("'editor-shell': 'editor-content'");
  });

  it('uses the persistent title bar for route loading and never invents a board background', () => {
    const app = read('./ui/App.tsx');
    const titleBar = read('./ui/shell/AppTitleBar.tsx');
    const styles = read('./style.css');
    expect(app).toContain("transitionStatus={titleBarLoading ? 'Loading…' : null}");
    expect(app).toContain("scene.phase === 'entering' || scene.phase === 'current'");
    expect(app).toContain('key: mountedScene.leaf.key');
    expect(titleBar).toContain('screenName={config.screenName}');
    expect(titleBar).toContain('transitionStatus={transitionStatus}');
    expect(titleBar).toContain('config.centerSlot ? <div className="app-shell-titlebar-center"');
    expect(titleBar).not.toContain('app-titlebar-transition-status');
    expect(titleBar).not.toContain('config.centerSlot || transitionStatus');
    expect(read('./ui/shared/BrandLockup.tsx')).toContain('brand-lockup-transition-status');
    expect(app).not.toContain('className="scene-wait-canvas"');
    expect(app).not.toContain('scene-retained-background');
    expect(styles).not.toContain('.scene-retained-background');
    expect(styles).not.toContain('.scene-wait-canvas');
    expect(styles).toContain('[data-scene-visual-role="outgoing"]');
    expect(styles).toContain('[data-scene-visual-role="incoming"]');
    expect(styles).not.toContain('.app-titlebar-transition-status');
    expect(styles).toContain('.brand-lockup-transition-status');
    expect(app).toContain("scene.phase === 'startup' && scene.startupStage < 0");
  });

  it('keeps gameplay control-panel tabs immediate while navigation remains explicit', () => {
    const hud = read('./ui/SkirmishHud.tsx');
    expect(hud).toContain('data-transition-policy="immediate-local"');
    expect(hud).toContain('onClick={() => setTab(t.id)}');
    expect(hud).not.toContain('onClick={() => navigateApp(t.id)}');
    expect(hud).toContain('<NavButton');
    expect(read('../scripts/shot.mjs')).toContain("const assertImmediateLocalControl = has('assert-immediate-local-control')");
    expect(read('../scripts/shot.mjs')).toContain('immediate local control entered the scene lifecycle');
  });

  it('preserves installed drawable identity when Chrome Lab saves visual tuning', () => {
    const chromeLab = read('./ui/ChromeLab.tsx');
    expect(chromeLab).toContain('...installed.behavior');
    expect(chromeLab).toContain('roles: installed.behavior.roles');
  });

  it('does not let menu, screen, or board readiness expire into success', () => {
    const app = read('./ui/App.tsx');
    const coldReveal = read('./ui/shell/startupScene.ts');
    expect(coldReveal).not.toContain('FAILSAFE_MS');
    expect(app).toContain('if (!scene.startupReady.includes(nextLayer)) return undefined');
    expect(app).toContain('sceneTransitionDurationMs() + STARTUP_STAGE_BEAT_MS');
    expect(app).not.toContain('SCENE_FADE_MS');
    expect(app).toContain('waitForSceneTransition(target');
    expect(read('./render/boardArtReady.ts')).not.toMatch(/FAILSAFE_MS|setTimeout/);
  });

  it('uses persistent derivatives for canonical list thumbnails', () => {
    const source = read('./render/LevelThumbnail.tsx');
    expect(source).toContain('levelThumbnailUrl(level.id)');
    expect(source).toContain('const canonicalDerivative = !authoringPreview');
    expect(source).not.toContain('const canonicalLevel =');
    expect(source).not.toContain('/assets/level-list-thumb/');
    expect(source).toContain('canonicalDerivative');
    expect(source).toContain('BOARD_THUMBNAIL_FRAMING_REVISION');
    expect(source).toContain('const coverThumbnail = true');
    expect(source).toContain("objectFit: coverThumbnail ? 'cover' : 'contain'");
    expect(source).toContain('client-bake-start'); // retained only for unsaved authoring previews
    expect(source).toContain('data-level-thumbnail-id={level.id}');
    expect(source).toContain('const [near, setNear] = useState(false)');
  });

  it('makes both runtime canvas renderers share the decoded image resource manager', () => {
    expect(read('./render/BoardTerrainLayer.tsx')).toContain("from './imageResources'");
    expect(read('./render/BoardCanvasLayer.tsx')).toContain("from './imageResources'");
  });

  it('does not preload the complete Studio tileset from every Studio route', () => {
    expect(read('./ui/TilePreview.tsx')).not.toMatch(/allStudioAssets\.flatMap[\s\S]{0,300}new Image\(/);
  });

  it('makes incomplete player surfaces inert as well as visually hidden', () => {
    expect(read('./render/SkirmishBoard.tsx')).toContain('inert={!boardVisible && !boardFrame.error ? true : undefined}');
    expect(read('./ui/shell/ThumbnailSurface.tsx')).toContain('inert={!complete || failure ? true : undefined}');
    expect(read('./style.css')).not.toContain('A failsafe in the hook');
  });

  it('never paints startup copy in a fallback font before the shell font is ready', () => {
    const html = read('../index.html');
    expect(html).toContain('rel="preload"');
    expect(html).toContain('/assets/fonts/advance-wars-2-gba/advance-wars-2-gba.otf');
    expect(html).toContain('id="app-bootstrap-status"');
    expect(html).toMatch(/\.app-bootstrap-status\.is-font-ready\s*\{[^}]*visibility:\s*visible/);
    expect(html.indexOf('id="app-bootstrap-status"')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
    expect(html).toContain("document.fonts.check('19px \"Advance Wars 2 GBA\"', 'Loading...')");
    expect(read('./ui/installedUiMedia.ts')).toContain('bootstrapFaceAlreadyInstalled');
    expect(read('../scripts/shot.mjs')).toContain('startup status exposed a fallback-font frame');
  });

  it('gates and prioritizes the exact homepage scene consumed by the DOM', () => {
    const reveal = read('./ui/App.tsx');
    const scene = read('./ui/SceneBackdrop.tsx');
    const sceneMedia = read('./ui/homepageSceneMedia.ts');
    const style = read('./style.css');
    const html = read('../index.html');
    const backend = read('../../backend/server.js');
    expect(html).toContain('/api/app-bootstrap-scene');
    expect(html).toContain("preload.setAttribute('fetchpriority', 'high')");
    expect(html.indexOf('/api/app-bootstrap-scene')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
    expect(backend).toContain("app.get('/api/app-bootstrap-scene'");
    expect(backend).toContain("da.behavior->'roles' ? 'homepage-scene'");
    expect(reveal).toContain('homepageSceneMedia().immutableUrl');
    expect(scene).toContain('canvas.style.backgroundImage = `url("${homepageSceneMedia().immutableUrl}")`');
    expect(scene).toContain('export async function repaintHomepageScene');
    expect(reveal).toContain('.then(() => repaintHomepageScene(backgroundUrl))');
    expect(sceneMedia).toContain("requiredDrawableRole('animated-scene', 'homepage-scene')");
    expect(read('./main.tsx')).not.toContain('homepageSceneMedia');
    expect(reveal).not.toContain('ui-main-menu-background-scene-v1-avif');
    expect(read('../scripts/shot.mjs')).toContain('criticalImages.every((img) => img.complete && img.naturalWidth > 0)');
    expect(read('../scripts/shot.mjs')).toContain('directorCurrent && count !== 3');
    expect(read('../scripts/shot.mjs')).toContain('homepage backdrop continuity failed');
    expect(style).toMatch(/\.settings-art-route\s*\{[^}]*background:\s*transparent/);
  });

  it('owns the complete Play destination behind a painted DOM surface boundary', () => {
    const play = read('./ui/PlayMenu.tsx');
    const boundary = read('./ui/shell/PaintedSurfaceBoundary.tsx');
    expect(play).toContain('<PaintedSurfaceBoundary');
    expect(play).toContain('surface="play-selector"');
    expect(boundary).toContain("querySelectorAll('img')");
    expect(boundary).toContain('afterTwoPaintOpportunities');
    expect(boundary).toContain('renderedCssImageUrls');
    expect(boundary).toContain('Required artwork could not be reached. Check your connection and try again.');
    expect(boundary).not.toContain('<small>{paintError?.message}</small>');
    expect(boundary).toContain("inert={ownsVisibility && phase !== 'painted' ? true : undefined}");
    expect(boundary).toContain("data-surface-readiness={ownsVisibility ? 'atomic-frame' : 'scene-probe'}");
    expect(read('../scripts/shot.mjs')).toContain('surface exposed a partial or interactive frame');
    expect(read('../scripts/shot.mjs')).toContain("request.url().includes(String(abortRequest))");
    expect(read('../scripts/shot.mjs')).toContain('isManagedApp || readyExpr');
    expect(read('./net/campaignWorkspace.ts')).not.toContain('AbortSignal.timeout');
  });

  it('keeps campaign row thumbnails and the selected board preview inside the scene gate', () => {
    const campaign = read('./ui/CampaignEditor.tsx');
    const preview = read('./ui/LevelPreviewColumn.tsx');
    const thumbnails = read('./ui/shell/ThumbnailSurface.tsx');
    expect(campaign).toContain('participantId="campaign-list-thumbnails"');
    expect(campaign).toContain('<GatedLevelThumbnail');
    expect(read('./ui/PlayMenu.tsx')).toContain("from './shell/ThumbnailSurface'");
    expect(thumbnails).toContain('root.closest(viewportSelector)');
    expect(thumbnails).toContain('rect.bottom >= bounds.top && rect.top <= bounds.bottom');
    expect(thumbnails).toContain('useSceneParticipant(participantId');
    expect(preview).toContain('<PaintedSurfaceBoundary');
    expect(preview).toContain('onTerrainFirstFrame');
    expect(preview).toContain('onSceneFirstFrame');
    expect(preview).toContain('onPaintedChange={onPaintedChange}');
    expect(read('./ui/PlayMenu.tsx')).not.toContain('&& (!selectedLevel || levelPreviewPainted)');
    expect(read('./ui/PlayMenu.tsx')).not.toContain("selectedLevelId ?? '',");
  });

  it('attributes every same-origin API and runtime resource to the active scene', () => {
    const timeline = read('./diagnostics/loadingTimeline.ts');
    const lab = read('./ui/LoadingLab.tsx');
    expect(timeline).toContain("url.pathname.startsWith('/api/')");
    expect(timeline).toContain('surface: `network:${owningScene}`');
    expect(lab).toContain('<span>cancellations</span>');
    expect(lab).toContain('<span>retries</span>');
  });

  it('does not expose gameplay HUD chrome before the board surface is ready', () => {
    const skirmish = read('./ui/Skirmish.tsx');
    const board = read('./render/SkirmishBoard.tsx');
    expect(board).toContain('onSurfaceReady?.(boardReady)');
    expect(skirmish).toContain('titleBarContent={playableSurfaceReady ? (');
    expect(skirmish).toContain('surface="gameplay-hud"');
    expect(skirmish).toContain('Preparing battlefield…');
    expect(read('../scripts/shot.mjs')).toContain('An explicit readiness contract is an assertion');
    expect(skirmish).toContain('if (playableSurfaceReady && sceneActivated) activateClock()');
    expect(skirmish).toContain('reveal={playableSurfaceReady && sceneRevealed}');
    expect(skirmish).toContain('activate={sceneActivated}');
    expect(skirmish).toContain('interactive={sceneActivated &&');
    expect(read('./game/store.ts')).toContain('if (!opts.deferClockStart) startClock()');
  });

  it('keeps Battle Restart separate from board-surface destruction', () => {
    const skirmish = read('./ui/Skirmish.tsx');
    const replayStart = skirmish.indexOf('const replayLevel = () => {');
    const replayEnd = skirmish.indexOf('\n  // The title-bar ornament', replayStart);
    const replay = skirmish.slice(replayStart, replayEnd);
    expect(replayStart).toBeGreaterThanOrEqual(0);
    expect(replayEnd).toBeGreaterThan(replayStart);
    expect(replay).not.toContain('setBoardSurfaceReady(false)');
    expect(replay).not.toContain('deferClockStart: true');
    expect(replay).toContain('restartSkirmish({ seed, level, activityId: runBattle?.activityId ?? null })');
    expect(replay).not.toContain('newSkirmish({ seed, level');
    expect(skirmish).not.toMatch(/<SkirmishBoard\s+key=/);
    expect(skirmish).not.toContain('storeSessionEpoch');
    expect(skirmish).toContain('signature="gameplay-hud"');
    expect(read('./render/SkirmishBoard.tsx')).toContain("viewKey: `${levelId ?? 'free'}:${boardViewEpoch}`");
  });
});
