import { useLayoutEffect, useRef, type ReactElement } from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';

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
// Region + frame data here must match the sheet the script baked.
//
// This module exposes the scene as DATA (SCENE_ANIMS) + a plain-DOM builder
// (buildSceneBackdropNode). Homepage SCREENS never render the scene from here: the
// live backdrop must be ONE continuous instance re-parented across route swaps
// (never re-mounted), so it lives as a singleton node owned by HomepageBackdrop —
// a per-screen React subtree would re-crop/re-fade on navigation (ADR-0064). The
// <SceneBackdrop> component below is a STANDALONE render for the studio inspector
// only (SceneAnimLab's Animated Scenes picker); it builds the same DOM via the
// builder so there is one structure. See ui/HomepageBackdrop.tsx.

const SCENE_W = 1586;
const SCENE_H = 991;

export interface SceneAnim {
  id: string;
  /** Region rect in scene pixels (the --rect the sheet was baked with). */
  x: number;
  y: number;
  w: number;
  h: number;
  frames: number;
  frameMs: number;
  /** Backend-owned semantic slot; resolve it from one hydrated catalog snapshot at render time. */
  slot: string;
}

// Every animated region of the menu scene — six waterfalls, scroll-baked
// (build-scene-anim.py --scroll, from the static art alone; no run dir). Per the
// color-cycling canon (Mark Ferrari), each region runs its OWN loop tempo
// (1.44s / 1.56s / 1.68s / 1.80s / 1.92s / 2.16s) so the scene never pulses in
// unison. Git owns this deterministic placement/timing geometry; generated sheet
// pixels and their active pointers are backend-owned live-media versions.
export const SCENE_ANIMS: SceneAnim[] = [
  {
    id: 'waterfall-right',
    x: 1290,
    y: 400,
    w: 170,
    h: 256,
    frames: 12,
    frameMs: 140,
    slot: 'ui/main-menu/scene-anim/waterfall-right.png',
  },
  {
    id: 'waterfall-right-lower',
    x: 1240,
    y: 600,
    w: 110,
    h: 130,
    frames: 12,
    frameMs: 120,
    slot: 'ui/main-menu/scene-anim/waterfall-right-lower.png',
  },
  {
    id: 'waterfall-right-mid',
    x: 1180,
    y: 500,
    w: 60,
    h: 120,
    frames: 12,
    frameMs: 150,
    slot: 'ui/main-menu/scene-anim/waterfall-right-mid.png',
  },
  {
    id: 'waterfall-left',
    x: 170,
    y: 485,
    w: 90,
    h: 195,
    frames: 12,
    frameMs: 160,
    slot: 'ui/main-menu/scene-anim/waterfall-left.png',
  },
  {
    // The thin cliff fall right of waterfall-left — its water column is dimmer
    // than the bright main fall, so it's zoned + baked at a lower brightness gate
    // (--bright 46 --scroll 2 --zones 12,5,32,98) to catch it without the lake
    // behind it. Was un-animated until now (only five regions existed).
    id: 'waterfall-upperright',
    x: 325,
    y: 495,
    w: 75,
    h: 115,
    frames: 12,
    frameMs: 130,
    slot: 'ui/main-menu/scene-anim/waterfall-upperright.png',
  },
  {
    // Two lower falls + the cascade into the lake. The dim moonlit water sat
    // below the default brightness gate, so the first bake caught almost no
    // pixels and looked frozen; re-baked at --bright 44 --scroll 4 (these falls
    // are bluish, near-zero vegetation, so no zones are needed).
    id: 'waterfall-lowerleft',
    x: 110,
    y: 770,
    w: 220,
    h: 170,
    frames: 12,
    frameMs: 180,
    slot: 'ui/main-menu/scene-anim/waterfall-lowerleft.png',
  },
];

// Build the scene backdrop as a detached DOM subtree — the plain-DOM twin of the
// old JSX (identical class names, so the existing style.css rules apply
// unchanged). Created ONCE by HomepageBackdrop and re-parented across screens; a
// moved node keeps its computed cover-crop and animation state, so the scene
// never re-adjusts on navigation. aria-hidden: it is pure decoration.
export function buildSceneBackdropNode(): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'scene-backdrop';
  root.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('div');
  canvas.className = 'scene-backdrop-canvas';
  canvas.style.backgroundImage = `url("${resolvedLiveMediaUrl('ui/main-menu/background-scene-v1.avif')}")`;

  for (const a of SCENE_ANIMS) {
    const span = document.createElement('span');
    span.className = 'scene-backdrop-anim';
    span.dataset.sceneAnim = a.id;
    const s = span.style;
    s.left = `${(a.x / SCENE_W) * 100}%`;
    s.top = `${(a.y / SCENE_H) * 100}%`;
    s.width = `${(a.w / SCENE_W) * 100}%`;
    s.height = `${(a.h / SCENE_H) * 100}%`;
    s.backgroundImage = `url("${resolvedLiveMediaUrl(a.slot)}")`;
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
