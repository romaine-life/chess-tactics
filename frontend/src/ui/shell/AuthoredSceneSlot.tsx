import type { ComponentPropsWithoutRef, ReactElement } from 'react';
import {
  sceneOverlapRegionAttributes,
  sceneTransitionTargetAttributes,
  type SceneTransitionTargetMode,
} from './sceneTransitionTarget';
import type { SceneHost } from './sceneManifest';

/**
 * Declares the shell's replaceable viewport, the only region an overlapping
 * same-shell scene pair may fade. Everything outside it is retained chrome that
 * both layers paint identically, so it must never ride the transition.
 */
export const shellViewportOverlapRegion = sceneOverlapRegionAttributes;

type DivSlotProps = ComponentPropsWithoutRef<'div'> & { sceneInstance: string };
type MainSlotProps = ComponentPropsWithoutRef<'main'> & { sceneInstance: string };

function DivSceneSlot({
  sceneInstance,
  region,
  mode = 'self',
  ...props
}: DivSlotProps & { region: SceneHost; mode?: SceneTransitionTargetMode }): ReactElement {
  return (
    <div
      {...props}
      {...sceneTransitionTargetAttributes(region, mode)}
      data-scene-instance={sceneInstance}
    />
  );
}

function MainSceneSlot({
  sceneInstance,
  region,
  ...props
}: MainSlotProps & { region: SceneHost }): ReactElement {
  return (
    <main
      {...props}
      {...sceneTransitionTargetAttributes(region)}
      data-scene-instance={sceneInstance}
    />
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
  <DivSceneSlot {...props} region="gameplay-shell" />
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
