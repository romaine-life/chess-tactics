import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';
import {
  sceneTransitionTargetAttributes,
  type SceneTransitionTargetMode,
} from './sceneTransitionTarget';
import { SceneSlotActivation } from './SceneBoundary';
import type { SceneHost } from './sceneManifest';

type DivSlotProps = ComponentPropsWithoutRef<'div'> & { sceneInstance: string };
type MainSlotProps = ComponentPropsWithoutRef<'main'> & { sceneInstance: string };

/** Closed capability for the stable gameplay scene's selectable viewport. */
export const gameplayWorkspaceTransitionTarget = (): ReturnType<typeof sceneTransitionTargetAttributes> => (
  sceneTransitionTargetAttributes('gameplay-workspace')
);

export const GameplayWorkspaceActivation = ({ children }: { children: ReactNode }): ReactElement => (
  <SceneSlotActivation region="gameplay-workspace">{children}</SceneSlotActivation>
);

function DivSceneSlot({
  sceneInstance,
  region,
  mode = 'self',
  children,
  ...props
}: DivSlotProps & { region: SceneHost; mode?: SceneTransitionTargetMode }): ReactElement {
  return (
    <div
      {...props}
      {...sceneTransitionTargetAttributes(region, mode)}
      data-scene-instance={sceneInstance}
    >
      <SceneSlotActivation region={region}>{children}</SceneSlotActivation>
    </div>
  );
}

function MainSceneSlot({
  sceneInstance,
  region,
  children,
  ...props
}: MainSlotProps & { region: SceneHost }): ReactElement {
  return (
    <main
      {...props}
      {...sceneTransitionTargetAttributes(region)}
      data-scene-instance={sceneInstance}
    >
      <SceneSlotActivation region={region}>{children}</SceneSlotActivation>
    </main>
  );
}

export const MenuDestinationSceneSlot = (props: DivSlotProps): ReactElement => (
  <DivSceneSlot {...props} region="menu-shell" />
);

export const PlayContentSceneSlot = (props: DivSlotProps): ReactElement => (
  <DivSceneSlot {...props} region="play-shell" mode="contents" />
);

export const RunDetailContentSceneSlot = (props: DivSlotProps): ReactElement => (
  <DivSceneSlot {...props} region="run-detail" mode="contents" />
);

export const EditorContentSceneSlot = (props: DivSlotProps): ReactElement => (
  <DivSceneSlot {...props} region="editor-shell" mode="contents" />
);

export const SettingsContentSceneSlot = (props: MainSlotProps): ReactElement => (
  <MainSceneSlot {...props} region="settings-shell" />
);

export const EnchiridionContentSceneSlot = (props: MainSlotProps): ReactElement => (
  <MainSceneSlot {...props} region="enchiridion-shell" />
);

export const GameplayWorkspaceSceneSlot = (props: DivSlotProps): ReactElement => (
  <DivSceneSlot {...props} region="gameplay-workspace" />
);

export const RunPresentationSceneSlot = (props: DivSlotProps): ReactElement => (
  <DivSceneSlot {...props} region="gameplay-shell" />
);

/**
 * The Strategikon's two replaceable panes. It presents the same rail-of-sections
 * pattern as Settings and the main-menu Enchiridion, so it declares the same kind of
 * director-owned region: its section rail is retained while `strategikon-shell`
 * replaces the pane beside it, and the Enchiridion reference rail is retained while
 * `strategikon-reference-shell` replaces the record pane beside THAT.
 */
export const StrategikonContentSceneSlot = (props: DivSlotProps): ReactElement => (
  <DivSceneSlot {...props} region="strategikon-shell" mode="contents" />
);

export const StrategikonReferenceSceneSlot = (props: DivSlotProps): ReactElement => (
  <DivSceneSlot {...props} region="strategikon-reference-shell" mode="contents" />
);
