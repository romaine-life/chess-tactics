import { liveMediaForSlot } from '@chess-tactics/board-render';

/**
 * The surface the Conflict's relics are laid out on. Its own runtime slot rather than a
 * workspace background: a workspace background covers the whole screen, and this is one
 * object sitting on it, sized against the relics rather than against the viewport.
 *
 * Decorative — an unaccepted slot leaves the relics on the backdrop alone rather than
 * throwing the screen away.
 */
export const RUN_RELIC_MAT_SLOT = 'ui/run/bona-vacantia/mat.png';

export function installedRelicMatUrl(): string | null {
  try {
    return liveMediaForSlot(RUN_RELIC_MAT_SLOT).media?.immutableUrl ?? null;
  } catch {
    return null;
  }
}
