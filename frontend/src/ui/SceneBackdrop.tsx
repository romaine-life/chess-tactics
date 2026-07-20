import { useLayoutEffect, useRef, type ReactElement } from 'react';
import { drawableAssets, requiredDrawableRole } from '@chess-tactics/board-render';

// The main-menu background scene as REAL elements instead of a `::after`
// background — so animated regions can anchor to scene coordinates.
//
// The old pseudo painted `center / cover`, which crops differently per window
// aspect ratio; an overlay positioned against the viewport would drift off its
// cliff. Here `.scene-backdrop-canvas` reproduces the cover crop as an element
// (container units + aspect-ratio, see style.css), and each animated region is
// a child positioned in PERCENT OF THE SCENE, so it stays glued to the art at
// any window size. Layering inside the backdrop: scene canvas -> animated
// overlays -> scrim gradients (the same two the pseudo stacked), so the
// moving water is darkened exactly like the still art around it.
//
// The overlays are BAKED frame sheets (scripts/build-scene-anim.py — the menu
// twin of ADR-0048's water ripple): only water pixels are opaque, frame 0 is
// bit-identical to the shipped scene, and CSS steps() just advances the frame.
// Region, timing, scene, and sheet bindings are installed drawable-catalog data.
//
// This module exposes the scene as DATA (SCENE_ANIMS) + a plain-DOM builder
// (buildSceneBackdropNode). Homepage SCREENS never render the scene from here: the
// live backdrop must be ONE continuous instance re-parented across route swaps
// (never re-mounted), so it lives as a singleton node owned by HomepageBackdrop —
// a per-screen React subtree would re-crop/re-fade on navigation (ADR-0064). The
// <SceneBackdrop> component below is a STANDALONE render for the studio inspector
// only (SceneAnimLab's Animated Scenes picker); it builds the same DOM via the
// builder so there is one structure. See ui/HomepageBackdrop.tsx.

export interface SceneAnim {
  id: string;
  /** Region rect in scene pixels (the --rect the sheet was baked with). */
  x: number;
  y: number;
  w: number;
  h: number;
  frames: number;
  frameMs: number;
  sceneRole: string;
  slot: string;
  sheet: string;
}

// Every animated region of the menu scene — six waterfalls, scroll-baked
// (build-scene-anim.py --scroll, from the static art alone; no run dir). Per the
// color-cycling canon (Mark Ferrari), each region runs its OWN loop tempo
// (1.44s / 1.56s / 1.68s / 1.80s / 1.92s / 2.16s) so the scene never pulses in
// unison. The database owns the installed placement/timing records and active media.
const positive = (value: unknown, field: string, id: string): number => {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error(`scene animation ${id} has invalid ${field}`);
  return result;
};
const nonnegative = (value: unknown, field: string, id: string): number => {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`scene animation ${id} has invalid ${field}`);
  return result;
};

export interface AnimatedScene { id: string; label: string; role: string; w: number; h: number; background: string }
export const animatedScenes = (): AnimatedScene[] => drawableAssets('animated-scene').map((asset) => {
  const roles = Array.isArray(asset.behavior.roles) ? asset.behavior.roles.filter((role): role is string => typeof role === 'string') : [];
  if (roles.length !== 1 || !asset.media.background) throw new Error(`animated scene ${asset.id} is incomplete`);
  return { id: asset.id, label: asset.label, role: roles[0], w: positive(asset.behavior.width, 'width', asset.id), h: positive(asset.behavior.height, 'height', asset.id), background: asset.media.background.media.immutableUrl };
});
export const sceneAnimations = (): SceneAnim[] => drawableAssets('scene-animation').map((asset) => {
  const sheet = asset.media.sheet;
  const sceneRole = String(asset.behavior.sceneRole ?? '');
  if (!sheet || !sceneRole) throw new Error(`scene animation ${asset.id} is incomplete`);
  return { id: asset.id, sceneRole, slot: sheet.slot, sheet: sheet.media.immutableUrl,
    x: nonnegative(asset.behavior.x, 'x', asset.id), y: nonnegative(asset.behavior.y, 'y', asset.id),
    w: positive(asset.behavior.width, 'width', asset.id), h: positive(asset.behavior.height, 'height', asset.id),
    frames: positive(asset.behavior.frames, 'frames', asset.id), frameMs: positive(asset.behavior.frameMs, 'frameMs', asset.id) };
});
export const SCENE_ANIMS: SceneAnim[] = new Proxy([] as SceneAnim[], { get: (_target, property) => { const values = sceneAnimations(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; } });

/** The exact installed media consumed by the homepage DOM. Startup priority and
 * readiness must use this binding too; a parallel app-ui rendition is not proof
 * that the animated-scene consumer can paint. */
export function homepageSceneMedia() {
  const binding = requiredDrawableRole('animated-scene', 'homepage-scene').media.background?.media;
  if (!binding) throw new Error('installed homepage scene has no background media');
  return binding;
}

// Build the scene backdrop as a detached DOM subtree — the plain-DOM twin of the
// old JSX (identical class names, so the existing style.css rules apply
// unchanged). Created ONCE by HomepageBackdrop and re-parented across screens; a
// moved node keeps its computed cover-crop and animation state, so the scene
// never re-adjusts on navigation. aria-hidden: it is pure decoration.
export function buildSceneBackdropNode(): HTMLDivElement {
  const sceneAsset = requiredDrawableRole('animated-scene', 'homepage-scene');
  const scene = animatedScenes().find((candidate) => candidate.id === sceneAsset.id);
  if (!scene) throw new Error('drawable catalog has no complete homepage scene');
  const root = document.createElement('div');
  root.className = 'scene-backdrop';
  root.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('div');
  canvas.className = 'scene-backdrop-canvas';
  canvas.style.backgroundImage = `url("${homepageSceneMedia().immutableUrl}")`;

  for (const a of sceneAnimations().filter((candidate) => candidate.sceneRole === scene.role)) {
    const span = document.createElement('span');
    span.className = 'scene-backdrop-anim';
    span.dataset.sceneAnim = a.id;
    const s = span.style;
    s.left = `${(a.x / scene.w) * 100}%`;
    s.top = `${(a.y / scene.h) * 100}%`;
    s.width = `${(a.w / scene.w) * 100}%`;
    s.height = `${(a.h / scene.h) * 100}%`;
    s.backgroundImage = `url("${a.sheet}")`;
    s.setProperty('--scene-anim-frames', `${a.frames}`);
    // steps(N) over [0, N/(N-1) * 100%] lands step k on frame k of an N-frame
    // sheet sized in percent (bg-pos % maps k/(N-1) -> -k*boxW).
    s.setProperty('--scene-anim-travel', `${(a.frames / (a.frames - 1)) * 100}%`);
    s.setProperty('--scene-anim-dur', `${a.frames * a.frameMs}ms`);
    canvas.appendChild(span);
  }
  root.appendChild(canvas);

  const scrim = document.createElement('div');
  scrim.className = 'scene-backdrop-scrim';
  root.appendChild(scrim);

  return root;
}

// Standalone scene render for the studio inspector (SceneAnimLab overlays clickable
// region boxes on it). NOT for homepage screens — those use <HomepageBackdrop/>, the
// one continuous instance. Builds the same DOM as the singleton (buildSceneBackdropNode)
// under a display:contents host, so `.scene-backdrop` anchors to the picker box exactly
// as a direct child would and the shared style.css rules apply unchanged.
export function SceneBackdrop(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const node = buildSceneBackdropNode();
    host.appendChild(node);
    return () => node.remove();
  }, []);
  return <div ref={hostRef} style={{ display: 'contents' }} aria-hidden="true" />;
}
