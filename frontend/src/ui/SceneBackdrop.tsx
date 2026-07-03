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

// Every animated region of the menu scene. Per the color-cycling canon (Mark
// Ferrari): when more regions land, give them DIFFERENT loop tempos so the
// scene never pulses in unison.
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
