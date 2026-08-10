import type { AriaRole, ReactElement, ReactNode } from 'react';
import { ShellWorkspace } from './shared/ChromeBox';

export type RunViewportSceneView =
  | 'status'
  | 'sectio'
  | 'aftermath'
  | 'victory'
  | 'bona-mat'
  | 'army'
  | 'lipsana'
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
 * The Run scenes that report an OUTCOME: the Battle's report and the won War. They read as
 * one family with the board-visible Victory banner and the result cards beside it, so they
 * adopt the leaf material the same way (ADR-0557). Deriving the adoption from the scene view
 * — the data the viewport already has — is what keeps a call site from forgetting it.
 */
const RUN_OUTCOME_SCENE_VIEWS: readonly RunViewportSceneView[] = ['aftermath', 'victory'];

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
      data-chrome-leaf-surface={RUN_OUTCOME_SCENE_VIEWS.includes(scene.view) ? '' : undefined}
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
