import { createContext, useContext } from 'react';

export type StartupLayer = 'background' | 'title' | 'controls';

export interface StartupSceneController {
  active: boolean;
  generation: number;
  revealed: (layer: StartupLayer) => boolean;
  reportReady: (layer: StartupLayer) => void;
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
 * Readiness transport only. The SceneDirector reducer owns the startup state,
 * ordering, failure, retry generation, and terminal `current` transition.
 */
export const StartupSceneContext = createContext<StartupSceneController>(completeController);

export function useStartupScene(): StartupSceneController {
  return useContext(StartupSceneContext);
}

export function isMainMenuPath(path: string): boolean {
  const normalized = path.replace(/\/+$/, '') || '/';
  return normalized === '/' || normalized === '/menu-next' || normalized === '/main-menu';
}
