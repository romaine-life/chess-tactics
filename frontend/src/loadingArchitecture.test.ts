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
    expect(boundary).toContain('[deactivating, generation, manifest.id, mountedKey]');
    expect(boundary).not.toContain('[deactivating, generation, manifest.id, mountedKey, preparing]');
    expect(boundary).toContain('sceneBoundaryLifecycle(directorPhase, visualRole)');
    expect(app).toContain('directorPhase={scene.phase}');
    expect(app).not.toContain('preparing={layer.preparing}');
    expect(boundary).toContain('sceneActivity.holdPreparingMotion(root)');
    expect(boundary).toContain('sceneActivity.activate()');
    expect(read('./ui/shell/SceneActivity.tsx')).toContain('registerEntryMotion(id: string, motion: SceneEntryMotion)');
    expect(read('./ui/shell/SceneActivity.tsx')).toContain('animation.currentTime = 0');
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
    expect(read('./ui/RunSectioArtReview.tsx')).toContain("useSceneParticipant('studio'");
    expect(read('./ui/LipsanonReview.tsx')).toContain("useSceneParticipant('studio'");
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
    expect(app).toContain('key: sceneLayerKey(scene.current)');
    expect(app).toContain('key: sceneLayerKey(scene.destination!)');
    expect(app).toContain('sceneLayers.map((layer)');
    expect(app).toContain('key={layer.key}');
    expect(app).not.toContain('key={`incoming:');
    expect(read('../scripts/shot.mjs')).toContain("const assertFullSceneExit = has('assert-full-scene-exit')");
    expect(read('../scripts/shot.mjs')).toContain('sameBoundary: boundary === window.__ctOutgoingSceneBoundary');
    expect(read('../scripts/shot.mjs')).toContain('assertImmediateLocalControl || backAfterClickMs !== undefined');
    expect(read('../scripts/shot.mjs')).toContain('full-scene wait did not retain the painted outgoing boundary');
    expect(read('../scripts/shot.mjs')).toContain('painted destination was remounted instead of promoted in place');
    expect(read('../scripts/shot.mjs')).toContain('incomingMenuControlsPrecomposed');
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

  it('delivers navigation events through one lifetime location subscription', () => {
    const app = read('./ui/App.tsx');
    expect(app).toContain('const unsubscribeLocation = subscribeAppLocation(onNav)');
    expect(app).toContain('committedLocationRef.current');
    expect(app).toContain('resolveSceneRef.current(nextPath, nextSearch)');
    // Re-subscribing per dependency change opens a flush-wide gap (cleanups run
    // before child setups) where a screen's canonicalization navigation dispatched
    // from its own effect is silently lost between removal and re-add.
    expect(app).not.toMatch(/\}, \[path, resolveScene, search\]\);/);
    // A retargeted preparation adopts its canonical address; a same-scene address
    // change is observable in the loading timeline rather than silent.
    expect(app).toContain("destination.id === pending.id && sceneRef.current.phase !== 'exiting'");
    expect(app).toContain("'scene-address-refreshed'");
  });

  it('keeps authored committed and pending scene instances separate from browser intent', () => {
    const app = read('./ui/App.tsx');
    const play = read('./ui/PlayMenu.tsx');
    const graph = read('./ui/shell/sceneGraph.ts');
    const slots = read('./ui/shell/sceneSlots.ts');
    expect(graph).toContain('export interface SceneDefinition');
    expect(graph).toContain('export interface SceneInstance');
    expect(graph).toContain('export interface ScenePath');
    // The slot projection is derived from the scene graph, never retyped: the
    // hand-maintained copy had already lost `run-detail-content`.
    expect(slots).toContain('const ALL_SLOTS: readonly SceneSlotId[] = SCENE_SLOT_IDS');
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

  it('precomposes main-menu controls for warm scene returns and gates them only during cold startup', () => {
    const menu = read('./ui/MainMenu.tsx');
    const styles = read('./style.css').replace(/\r\n/g, '\n');
    expect(menu).toContain("import { useStartupScene } from './shell/startupScene';");
    expect(menu).toContain('const startup = useStartupScene();');
    expect(menu).toContain("data-reveal-buttons={startup.revealed('scene') ? '' : undefined}");
    expect(menu).not.toContain('useSceneReveal');
    expect(styles).toContain('Warm navigation\n   composes them at full local opacity');
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

  it('suppresses a preparing region by context value, never by changing the tree shape', () => {
    // A host-preserving navigation ends by clearing the preparing region. If
    // SceneSlotActivation answered that with a different element type — a bare fragment
    // when the region is not preparing, providers when it is — React would read the
    // change as a new tree and remount the destination it had just revealed, blanking
    // the committed column for a frame at the end of every menu navigation.
    const boundary = read('./ui/shell/SceneBoundary.tsx').replace(/\r\n/g, '\n');
    const activation = boundary.slice(boundary.indexOf('export function SceneSlotActivation'));
    const body = activation.slice(0, activation.indexOf('\n}\n') + 3);
    expect(body).toContain('const suppressed = preparingRegion === region;');
    expect(body).toContain('<SceneActivationContext.Provider value={inheritedActivation && !suppressed}>');
    expect(body).toContain('<SceneRevealContext.Provider value={inheritedReveal && !suppressed}>');
    // Exactly one return, and it is the provider pair — no early exit past them.
    expect(body.match(/\breturn\b/g)).toHaveLength(1);
    expect(body).not.toMatch(/return\s*<>/);
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
    expect(editor).toContain('<EditorContentSceneSlot');
    expect(editor).toContain('const selectedCollection = editorCollectionFromLocation(path, search)');
    expect(editor).toContain("navigateApp(editorCampaignHref('/editor', campaignId))");
    expect(editor).not.toContain('setSelectedCollection');
    expect(editor).not.toContain('window.history.replaceState');
  });

  it('derives every rail-of-sections family from the one sectioned-shell registry', () => {
    const manifest = read('./ui/shell/sceneManifest.ts');
    const registry = read('./ui/shell/sectionedShells.ts');
    // A family that presents a rail inside a retained shell is an ENTRY, never a
    // hand-written branch: whether its rail fades is decided by scene identity, and
    // a family that writes its own mapping can forget to (the Strategikon did, on
    // both of its hosts, in opposite directions). See sectionedShells.test.ts for
    // the structural rule this arrangement makes enforceable.
    for (const entry of ['main-menu', 'settings', 'enchiridion', 'campaign-editor', 'play', 'strategikon']) {
      expect(registry, `registry entry "${entry}"`).toContain(`id: '${entry}'`);
    }
    // The region and slot maps are generated from those entries, so a new rail
    // cannot land in one map and be forgotten in the other.
    expect(registry).toContain('export const SECTIONED_SHELL_REGION_BY_DEFINITION');
    expect(registry).toContain('export const SECTIONED_SHELL_SLOT_BY_REGION');
    expect(manifest).toContain('...SECTIONED_SHELL_REGION_BY_DEFINITION');
    expect(manifest).toContain('...SECTIONED_SHELL_SLOT_BY_REGION');
    expect(manifest).toContain("resolveSectionedShellScene('main-menu', path, search)");
    expect(manifest).toContain("resolveSectionedShellScene('strategikon', path, search, instances)");
    // The Strategikon's route grammar is shared with the manifest, not re-parsed
    // privately: two disagreeing copies is how its sections stayed invisible.
    expect(read('./ui/Strategikon.tsx')).toContain("from './strategikonRoute'");
    expect(read('./ui/Strategikon.tsx')).not.toContain('function sectionFromPath');
    expect(read('./ui/Strategikon.tsx')).not.toContain('function enchiridionSectionFromPath');
    expect(read('./ui/Strategikon.tsx')).toContain('<StrategikonContentSceneSlot');
    expect(read('./ui/Strategikon.tsx')).toContain('<StrategikonReferenceSceneSlot');
  });

  it('uses the persistent title bar for route loading and never invents a board background', () => {
    const app = read('./ui/App.tsx');
    const titleBar = read('./ui/shell/AppTitleBar.tsx');
    const styles = read('./style.css');
    expect(app).toContain("transitionStatus={titleBarLoading ? 'Loading…' : null}");
    // The curtain hands over on the ladder's FIRST rung, on every route — not once the
    // whole destination has entered (ADR-0369).
    expect(app).toContain('|| scene.startupStage >= 0');
    expect(app).toContain('|| !scene.startupActive;');
    expect(app).toContain('key: sceneLayerKey(mountedScene)');
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
    const titleNavigation = read('./ui/StrategikonTitleNavigation.tsx');
    expect(hud).toContain('data-transition-policy="immediate-local"');
    expect(hud).toContain('onClick={() => setTab(t.id)}');
    expect(hud).not.toContain('onClick={() => navigateApp(t.id)}');
    expect(hud).toContain('<StrategikonTitleNavigation');
    expect(titleNavigation).toContain('<NavButton');
    expect(read('../scripts/shot.mjs')).toContain("const assertImmediateLocalControl = has('assert-immediate-local-control')");
    expect(read('../scripts/shot.mjs')).toContain('immediate local control entered the scene lifecycle');
  });

  it('preserves installed drawable identity when Chrome Lab saves visual tuning', () => {
    const chromeLab = read('./ui/ChromeLab.tsx');
    expect(chromeLab).toContain('...installed.behavior');
    expect(chromeLab).toContain('roles: installed.behavior.roles');
  });

  it('runs ONE cold-load ladder for every route, with the shell in front of the scene', () => {
    const app = read('./ui/App.tsx');
    const director = read('./ui/shell/sceneDirector.ts');
    const startup = read('./ui/shell/startupScene.ts');
    const titleBar = read('./ui/shell/AppTitleBar.tsx');
    const menu = read('./ui/MainMenu.tsx');
    const styles = read('./style.css');
    // One ladder, one cold-load branch: the menu is not a special route any more.
    expect(startup).toContain("export type ShellLayer = 'background' | 'chrome' | 'scene'");
    expect(startup).toContain("SHELL_LADDER: readonly ShellLayer[] = ['background', 'chrome', 'scene']");
    expect(app).not.toContain('isMainMenuPath');
    expect(app).not.toContain('prepareStartup');
    expect(app).not.toContain('prepareInitialScene');
    expect(app).toContain('`${window.location.pathname}${window.location.search}`,');
    // The final rung is the ordinary painted contract, entering the ordinary way.
    expect(director).toContain("startupStage === SETTLED_STAGE");
    expect(director).toContain("? { ...state, startupStage, phase: 'entering' }");
    expect(director).not.toContain("startup-finished");
    expect(app).toContain("scene.phase === 'startup'");
    // The bar owns its own rung and its own art; the menu no longer decodes it.
    expect(titleBar).toContain("reportReady('chrome')");
    expect(titleBar).toContain('decodeShellChromeArt()');
    expect(menu).not.toContain('reportReady');
    expect(menu).not.toContain('ui-surfaces-hybrid-wood-oak-png');
    expect(app).toContain("revealTitle={startupController.revealed('chrome')}");
    // Committed identity, never browser intent.
    expect(app).toContain('const committedPath = scene.current.pathname;');
    expect(app).toContain('path={committedPath}');
    expect(app).toContain('search={committedSearch}');
    // Pending chrome is inert, not merely invisible: it outranks the curtain.
    expect(styles).toMatch(/\.app-shell-titlebar\.reveal-pending \{[^}]*pointer-events: none/);
  });

  it('makes shell art a startup precondition and critical participants enforceable', () => {
    const chromeCss = read('./ui/useInstalledChromeCss.ts');
    const boundary = read('./ui/shell/SceneBoundary.tsx');
    const main = read('./main.tsx');
    const editor = read('./ui/LevelEditor.tsx');
    // Chrome composition is COMPLETE — it decodes everything its own output references,
    // so the bar's fill surface cannot be the one image left outside the guarantee.
    expect(chromeCss).toContain('function referencedImageUrls');
    expect(chromeCss).toContain("!url.startsWith('data:')");
    expect(chromeCss).toContain('await Promise.all(referenced.map((url) => loadDecodedImage(url)))');
    expect(main).toContain("retryStartup('shell-chrome-art', decodeShellChromeArt)");
    expect(main.indexOf('shell-chrome-art')).toBeLessThan(main.indexOf("await import('./ui/App')"));
    // A declared critical participant that never registers FAILS the scene.
    expect(boundary).toContain('const missing = manifest.critical.filter((id) => !participantsRef.current.has(id))');
    expect(boundary).toContain('declares critical participants that never registered');
    // The editor registers the decomposition it already computes, rather than collapsing
    // three separately-computed authorities into one participant.
    const editorSource = editor.replace(/\r\n/g, '\n');
    for (const id of ['document', 'board-compositors', 'visible-editor-chrome', 'level-editor']) {
      expect(editorSource, id).toContain(`useSceneParticipant(\n    '${id}',`);
    }
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
    const war = read('./ui/WarEditor.tsx');
    const editorRow = read('./ui/shared/EditorLevelRow.tsx');
    const preview = read('./ui/LevelPreviewColumn.tsx');
    const thumbnails = read('./ui/shell/ThumbnailSurface.tsx');
    expect(campaign).toContain('participantId="campaign-list-thumbnails"');
    expect(editorRow).toContain('<GatedLevelThumbnail');
    // ThumbnailSurface gates the FIRST VIEWPORT. The War library's Battles list sits below
    // its Wars / War sections, so gating on it demands a thumbnail the lazy row never paints
    // and the entrance never settles; those rows are opportunistic below-fold content.
    expect(war).not.toContain('<ThumbnailSurface');
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
    const skirmishShell = read('./ui/SkirmishShell.tsx');
    const runForm = read('./ui/RunForm.tsx');
    const board = read('./render/SkirmishBoard.tsx');
    const storeContext = read('./game/SkirmishStoreContext.tsx');
    const viewContext = read('./game/SkirmishViewStoreContext.tsx');
    const viewState = read('./game/skirmishView.ts');
    expect(board).toContain('const completePreparedFrame = boardReady && cameraReady');
    expect(board).toContain('onSurfaceReady?.(surfaceReady)');
    expect(skirmish).toContain('const skirmishTitleBarContent = playableSurfaceReady ? (');
    expect(skirmish).toContain('readyToCompose: playableSurfaceReady');
    expect(runForm).toContain('titleBarContent={form.titleBarContent}');
    expect(skirmishShell).toContain('surface="gameplay-hud"');
    expect(skirmish).toContain('Preparing battlefield…');
    expect(read('../scripts/shot.mjs')).toContain('An explicit readiness contract is an assertion');
    expect(skirmish).toContain('if (!runDeployment && !unitDeparture && playableSurfaceReady && sceneActivated) activateClock()');
    expect(skirmish).toContain('reveal={playableSurfaceReady && sceneRevealed}');
    expect(skirmish).toContain('activate={!runDeployment && sceneActivated}');
    expect(skirmish).toContain('interactive={!runDeployment && !unitDeparture && sceneActivated &&');
    expect(skirmish).not.toContain('cameraActive=');
    expect(board).toContain('onZoomChange={setZoom}');
    expect(board).toContain('onPanChange={setBoardPan}');
    expect(board).toContain('onMinimumZoomChange={setMinZoom}');
    expect(board).not.toContain('IGNORE_CAMERA');
    expect(storeContext).toContain('<SkirmishViewStoreProvider>');
    expect(read('./ui/RunScreen.tsx')).toContain('<SkirmishViewStoreProvider>');
    expect(viewContext).toContain("if (!store) throw new Error('Skirmish view state requires a SkirmishViewStoreProvider.')");
    expect(viewState).toContain('createStore<SkirmishViewState>');
    expect(viewState).not.toContain('create<SkirmishViewState>');
    const runE2e = read('../scripts/run-battle-e2e.mjs');
    expect(runE2e).toContain('battlefieldTransition.cameraSamples.length !== 1');
    expect(runE2e).toContain("!battlefieldTransition.finalCommitted?.includes(':battlefield:')");
    expect(runE2e).toContain("awaitingDealState.stage !== 'awaiting-deal'");
    expect(runE2e).toContain('awaitingDealState.dealAnimations !== 0');
    expect(runE2e).toContain("dealingState.stage !== 'dealing'");
    expect(runE2e).toContain('awaitingDealState.totalCards > awaitingDealState.dealtCards ? 1 : 0');
    expect(runE2e).toContain('battlefieldTransition.dealConstructedBeforeCommit');
    expect(runE2e).toContain('battlefieldTransition.dealPlayedBeforeCommit');
    expect(runE2e).toContain('!battlefieldTransition.dealAdvancedAfterCommit');
    expect(runE2e).toContain('Array.from({ length: transportState.stackCards + 1 }, (_, index) => index)');
    expect(runE2e).toContain('sameViewStore: viewStore === probe.viewStore');
    expect(runE2e).toContain("deploymentResult.initialCamera !== deploymentResult.finalCamera");
    expect(read('./game/store.ts')).toMatch(
      /if \(!opts\.deferClockStart\) \{\s*startClock\(\);\s*startBattleElapsed\(\);\s*\}/,
    );
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
    expect(read('./render/SkirmishBoard.tsx')).toContain('const boardViewKey = surfaceState?.viewKey');
    expect(read('./render/SkirmishBoard.tsx')).toContain('?? storedActivityId');
  });
});
