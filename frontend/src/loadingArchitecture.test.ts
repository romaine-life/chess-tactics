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
    expect(director).toContain("ScenePhase = 'current' | 'exiting' | 'loading' | 'entering' | 'error'");
    expect(boundary).toContain("manifest.paintOwner === 'dom'");
    expect(boundary).toContain('participantsRef.current.get(manifest.paintOwner)');
  });

  it('gives every retry and retarget a fresh cancellable scene generation', () => {
    const app = read('./ui/App.tsx');
    const director = read('./ui/shell/sceneDirector.ts');
    expect(app).toContain('key={scene.generation}');
    expect(director).toContain('generation: state.generation + 1');
    expect(director).toContain('if (action.generation !== state.generation) return state');
  });

  it('does not let menu, screen, or board readiness expire into success', () => {
    const coldReveal = read('./ui/shell/startupScene.ts');
    expect(coldReveal).not.toContain('FAILSAFE_MS');
    expect(coldReveal).toContain('This timer sequences already-ready painted stages');
    expect(read('./render/boardArtReady.ts')).not.toMatch(/FAILSAFE_MS|setTimeout/);
  });

  it('uses persistent derivatives for canonical list thumbnails', () => {
    const source = read('./render/LevelThumbnail.tsx');
    expect(source).toContain('levelThumbnailUrl(level.id)');
    expect(source).toContain('const canonicalDerivative = !authoringPreview');
    expect(source).not.toContain('const canonicalLevel =');
    expect(source).not.toContain('/assets/level-list-thumb/');
    expect(source).toContain('canonicalDerivative');
    expect(source).toContain('canonicalDerivative !== null ||');
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
    expect(read('./ui/PlayMenu.tsx')).toContain('inert={!complete || failure ? true : undefined}');
    expect(read('./style.css')).not.toContain('A failsafe in the hook');
  });

  it('never paints startup copy in a fallback font before the shell font is ready', () => {
    const entry = read('./main.tsx');
    const style = read('./style.css');
    const html = read('../index.html');
    expect(html).toContain('rel="preload"');
    expect(html).toContain('/assets/fonts/advance-wars-2-gba/advance-wars-2-gba.otf');
    expect(entry).toContain('app-startup-status is-font-pending');
    expect(entry).toContain("querySelector('.app-startup-status.is-font-pending')?.classList.remove('is-font-pending')");
    expect(style).toMatch(/\.app-startup-status\.is-font-pending\s*\{[^}]*visibility:\s*hidden/);
    expect(read('../scripts/shot.mjs')).toContain('startup status exposed a fallback-font frame');
  });

  it('gates and prioritizes the exact homepage scene consumed by the DOM', () => {
    const entry = read('./main.tsx');
    const reveal = read('./ui/shell/startupScene.ts');
    const scene = read('./ui/SceneBackdrop.tsx');
    const sceneMedia = read('./ui/homepageSceneMedia.ts');
    expect(entry).toContain('homepageSceneMedia()');
    expect(reveal).toContain('homepageSceneMedia().immutableUrl');
    expect(scene).toContain('canvas.style.backgroundImage = `url("${homepageSceneMedia().immutableUrl}")`');
    expect(sceneMedia).toContain("requiredDrawableRole('animated-scene', 'homepage-scene')");
    expect(entry).toContain("from './ui/homepageSceneMedia'");
    expect(entry).not.toContain("from './ui/SceneBackdrop'");
    expect(reveal).not.toContain('ui-main-menu-background-scene-v1-avif');
    expect(read('../scripts/shot.mjs')).toContain('criticalImages.every((img) => img.complete && img.naturalWidth > 0)');
    expect(read('../scripts/shot.mjs')).toContain('homepage backdrop continuity failed');
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
