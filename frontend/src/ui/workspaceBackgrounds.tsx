import type { ReactElement } from 'react';
import { liveMediaForSlot } from '@chess-tactics/board-render';

/**
 * The installed full-screen artwork behind one workspace, read straight from the live
 * media catalog by semantic slot. A workspace with no accepted background simply keeps
 * the shared surface, so this is decorative and never throws the screen away: an absent
 * or unaccepted slot returns null.
 *
 * The Strategikon owns its own byte-pinned background (ADR-0336) and is not listed here.
 */
export type WorkspaceBackgroundId =
  | 'run-victory' | 'run-bona-vacantia' | 'run-commendatio' | 'level-editor-events';

export function workspaceBackgroundSlot(id: WorkspaceBackgroundId): string {
  return `ui/workspaces/${id}/background.png`;
}

export function installedWorkspaceBackgroundUrl(id: WorkspaceBackgroundId): string | null {
  try {
    const slot = liveMediaForSlot(workspaceBackgroundSlot(id));
    return slot.media?.immutableUrl ?? null;
  } catch {
    // Decorative: a catalog without the slot leaves the workspace on its shared surface.
    return null;
  }
}

/** The <img> ShellWorkspace paints behind a workspace, or null when none is installed. */
export function workspaceBackgroundArtwork(id: WorkspaceBackgroundId): ReactElement | null {
  const url = installedWorkspaceBackgroundUrl(id);
  if (!url) return null;
  return (
    <img
      className="workspace-background-artwork"
      data-workspace-background={id}
      src={url}
      alt=""
      draggable={false}
    />
  );
}
