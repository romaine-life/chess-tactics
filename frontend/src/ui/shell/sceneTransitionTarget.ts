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
