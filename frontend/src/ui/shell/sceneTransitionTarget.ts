import type { SceneHost } from './sceneManifest';

export type SceneTransitionTargetMode = 'self' | 'contents';

/**
 * Canonical declaration for a director-owned replaceable visual region.
 *
 * A scene host owns one target. Navigation may request a new child for that
 * target, but only SceneBoundary marks it active and only the director's commit
 * permits React to replace its DOM. `contents` preserves grid/flex participation
 * while applying the shared transition to the target's direct visual children.
 */
export function sceneTransitionTargetAttributes(
  region: SceneHost,
  mode: SceneTransitionTargetMode = 'self',
): {
  'data-scene-region': SceneHost;
  'data-scene-transition-target': SceneHost;
  'data-scene-transition-mode': SceneTransitionTargetMode;
} {
  return {
    'data-scene-region': region,
    'data-scene-transition-target': region,
    'data-scene-transition-mode': mode,
  };
}

export function sceneTransitionTargetSelector(region: SceneHost): string {
  return `[data-scene-transition-target="${region}"]`;
}

/**
 * The replaceable viewport inside a retained shell.
 *
 * Two state-driven scenes that share a shell (a Run workspace swap) overlap as two
 * complete layers so the outgoing snapshot stays frozen. Both layers then paint an
 * identical Controls panel, lipsanon rail, and shell fill, so fading the whole boundary
 * blends that retained chrome toward the backdrop at the crossfade midpoint — the
 * Controls title plank visibly dimmed on every Shop/Sell Units switch. Marking the
 * one region that actually changes lets the director scope the fade to it; see
 * `sceneOverlapScope` and the `data-scene-overlap-scope` rules in style.css.
 */
export function sceneOverlapRegionAttributes(): { 'data-scene-overlap-region': '' } {
  return { 'data-scene-overlap-region': '' };
}
