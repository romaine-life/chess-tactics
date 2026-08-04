import { liveMediaForSlot } from '@chess-tactics/board-render';

/**
 * The surface the Conflict's lipsana are laid out on. Its own runtime slot rather than a
 * workspace background: a workspace background covers the whole screen, and this is one
 * object sitting on it, sized against the lipsana rather than against the viewport.
 *
 * Decorative — an unaccepted slot leaves the lipsana on the backdrop alone rather than
 * throwing the screen away.
 */
export const LIPSANON_MAT_SLOT = 'ui/run/bona-vacantia/mat.png';

export function installedLipsanonMatUrl(): string | null {
  try {
    return liveMediaForSlot(LIPSANON_MAT_SLOT).media?.immutableUrl ?? null;
  } catch {
    return null;
  }
}
