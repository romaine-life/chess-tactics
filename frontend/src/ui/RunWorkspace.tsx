import type { AriaRole, ReactElement, ReactNode } from 'react';
import { ShellWorkspace } from './shared/ChromeBox';

export type RunViewportSceneView =
  | 'status'
  | 'sectio'
  | 'aftermath'
  | 'victory'
  | 'bona-mat'
  | 'bona-target'
  | 'army'
  | 'lipsana'
  | 'alienatio'
  | 'expunctio'
  | 'battle-preview';

export interface RunViewportSceneSpec {
  view: RunViewportSceneView;
  className?: string;
  contentClassName?: string;
  edgeAttached?: boolean;
  /** The shell's registered artwork slot. Feature code cannot mount a competing
   * viewport layer; it may only contribute artwork through this field. */
  backgroundArtwork?: ReactNode;
  testId: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  role?: AriaRole;
}

/**
 * The sole capability that emits a Run viewport.
 *
 * A Run feature contributes a typed scene specification and body content. This
 * renderer alone owns the landmark, shell frame, artwork layer, and viewport
 * identity. Direct `RunWorkspace`/`ShellWorkspace` mounting is deliberately not
 * exported: replacing the viewport must first become an authored scene.
 */
export function RunSceneViewport({
  scene,
  children,
}: {
  scene: RunViewportSceneSpec;
  children: ReactNode;
}): ReactElement {
  return (
    <main
      className={`run-workspace ${scene.className ?? ''}`.trim()}
      data-run-scene-view={scene.view}
    >
      <ShellWorkspace
        data-testid={scene.testId}
        aria-label={scene.ariaLabel}
        aria-labelledby={scene.ariaLabelledBy}
        role={scene.role}
        className="run-shell-workspace"
        bodyClassName={`run-shell-workspace-content ${scene.contentClassName ?? ''}`.trim()}
        backgroundArtwork={scene.backgroundArtwork ?? null}
        edgeAttached={scene.edgeAttached ?? false}
      >
        {children}
      </ShellWorkspace>
    </main>
  );
}
