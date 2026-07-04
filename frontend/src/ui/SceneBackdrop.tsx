import type { CSSProperties, ReactElement } from 'react';

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
  sheet: string;
}

// Every animated region of the menu scene — six waterfalls, scroll-baked
// (build-scene-anim.py --scroll, from the static art alone; no run dir). Per the
// color-cycling canon (Mark Ferrari), each region runs its OWN loop tempo
// (1.44s / 1.56s / 1.68s / 1.80s / 1.92s / 2.16s) so the scene never pulses in
// unison. Exact bake commands live in git (see the commit that added each sheet).
export const SCENE_ANIMS: SceneAnim[] = [
  {
    id: 'waterfall-right',
    x: 1290,
    y: 400,
    w: 170,
    h: 256,
    frames: 12,
    frameMs: 140,
    sheet: '/assets/ui/main-menu/scene-anim/waterfall-right.png',
  },
  {
    id: 'waterfall-right-lower',
    x: 1240,
    y: 600,
    w: 110,
    h: 130,
    frames: 12,
    frameMs: 120,
    sheet: '/assets/ui/main-menu/scene-anim/waterfall-right-lower.png',
  },
  {
    id: 'waterfall-right-mid',
    x: 1180,
    y: 500,
    w: 60,
    h: 120,
    frames: 12,
    frameMs: 150,
    sheet: '/assets/ui/main-menu/scene-anim/waterfall-right-mid.png',
  },
  {
    id: 'waterfall-left',
    x: 170,
    y: 485,
    w: 90,
    h: 195,
    frames: 12,
    frameMs: 160,
    sheet: '/assets/ui/main-menu/scene-anim/waterfall-left.png',
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
    sheet: '/assets/ui/main-menu/scene-anim/waterfall-upperright.png',
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
    sheet: '/assets/ui/main-menu/scene-anim/waterfall-lowerleft.png',
  },
];

export function SceneBackdrop(): ReactElement {
  return (
    <div className="scene-backdrop" aria-hidden="true">
      <div className="scene-backdrop-canvas">
        {SCENE_ANIMS.map((a) => (
          <span
            key={a.id}
            className="scene-backdrop-anim"
            data-scene-anim={a.id}
            style={
              {
                left: `${(a.x / SCENE_W) * 100}%`,
                top: `${(a.y / SCENE_H) * 100}%`,
                width: `${(a.w / SCENE_W) * 100}%`,
                height: `${(a.h / SCENE_H) * 100}%`,
                backgroundImage: `url("${a.sheet}")`,
                '--scene-anim-frames': `${a.frames}`,
                // steps(N) over [0, N/(N-1) * 100%] lands step k on frame k of an
                // N-frame sheet sized in percent (bg-pos % maps k/(N-1) -> -k*boxW).
                '--scene-anim-travel': `${(a.frames / (a.frames - 1)) * 100}%`,
                '--scene-anim-dur': `${a.frames * a.frameMs}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="scene-backdrop-scrim" />
    </div>
  );
}
