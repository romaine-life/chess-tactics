import type { ReactElement } from 'react';

/**
 * Dedicated cyan move-paint layer.
 *
 * Cyan remains the high-contrast authoring preview, while the same inherited visual-footprint
 * clip is also consumed by the cell's non-cyan presentation layers. Logical hit geometry lives
 * on the parent and never consumes this clip.
 */
export function PredrawnMoveHighlightPaint(): ReactElement {
  return <span className="predrawn-cyan-move-highlight-paint" aria-hidden="true" />;
}
