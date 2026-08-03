import { createContext, useContext } from 'react';

/**
 * The rungs of the ONE cold-load ladder (ADR-0368).
 *
 * Every route walks these in order, not just the main menu: the shared backdrop, then
 * the persistent title bar, then the scene body. The third rung is the ordinary
 * `SceneBoundary` painted contract — this ladder puts the shell in front of it rather
 * than running beside it.
 *
 * This is deliberately not a per-scene sequence. Every scene wears the same shell, so a
 * configurable order would model variance that does not exist; what genuinely varies is
 * declared where it varies (`manifest.background`, and the scene's own participants).
 */
export type ShellLayer = 'background' | 'chrome' | 'scene';

export const SHELL_LADDER: readonly ShellLayer[] = ['background', 'chrome', 'scene'];

export interface StartupSceneController {
  active: boolean;
  generation: number;
  revealed: (layer: ShellLayer) => boolean;
  reportReady: (layer: ShellLayer) => void;
  reportFailed: (error: unknown) => void;
}

const completeController: StartupSceneController = {
  active: false,
  generation: 0,
  revealed: () => true,
  reportReady: () => {},
  reportFailed: () => {},
};

/**
 * Readiness transport only. The SceneDirector reducer owns the ladder state, ordering,
 * failure, retry generation, and the hand-off into the ordinary entrance.
 */
export const StartupSceneContext = createContext<StartupSceneController>(completeController);

export function useStartupScene(): StartupSceneController {
  return useContext(StartupSceneContext);
}
