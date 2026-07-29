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
    expect(app).toContain('sceneManifest(initialPath)');
    expect(app).toContain('<Suspense fallback={null}>');
    expect(app).not.toMatch(/route-veil|screen-exit|screen-enter|useScreenEntrance|screenExit/);
    expect(director).toContain("ScenePhase = 'startup' | 'current' | 'exiting' | 'loading' | 'entering' | 'error'");
    expect(director).toContain("type: 'startup-reveal'");
    expect(app).toContain('<StartupSceneContext.Provider');
    expect(boundary).toContain("manifest.paintOwner === 'dom'");
    expect(boundary).toContain('participantsRef.current.get(manifest.paintOwner)');
    expect(app).toContain("manifest.background === 'homepage'");
    expect(read('./style.css')).toContain('.scene-director.is-entering .scene-homepage-background.is-destination');
  });

  it('enrolls standalone Studio routes in the Studio scene owner', () => {
    expect(read('./ui/WallCandidateReview.tsx')).toContain("useSceneParticipant(\n    'studio'");
    expect(read('./ui/WallCandidateReview.tsx')).toContain('onFirstFrame');
    expect(read('./ui/WallCandidateReview.tsx')).toContain('onFrameError');
    expect(read('./ui/DrawableCatalogLab.tsx')).toContain("useSceneParticipant(\n    'studio'");
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
    expect(app).toContain('key={manifest.instances[0]?.key ?? scene.generation}');
    expect(app).toContain('const mountedScene = sceneManifest(path)');
    expect(app).toContain('renderScene(mountedScene, search)');
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

  it('does not let menu, screen, or board readiness expire into success', () => {
    const app = read('./ui/App.tsx');
    const coldReveal = read('./ui/shell/startupScene.ts');
    expect(coldReveal).not.toContain('FAILSAFE_MS');
    expect(app).toContain('if (!scene.startupReady.includes(nextLayer)) return undefined');
    expect(app).toContain('SCENE_FADE_MS + STARTUP_STAGE_BEAT_MS');
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
    expect(boundary).toContain("inert={phase !== 'painted' ? true : undefined}");
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
    expect(read('./ui/PlayMenu.tsx')).toContain('&& (!selectedLevel || levelPreviewPainted)');
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
    expect(skirmish).toContain('playableSurfaceReady ? <TitleBarSlot');
    expect(skirmish).toContain('surface="gameplay-hud"');
    expect(skirmish).toContain('Preparing battlefield…');
    expect(read('../scripts/shot.mjs')).toContain('An explicit readiness contract is an assertion');
    expect(skirmish).toContain('if (playableSurfaceReady) activateClock()');
    expect(read('./game/store.ts')).toContain('if (!opts.deferClockStart) startClock()');
  });
});
