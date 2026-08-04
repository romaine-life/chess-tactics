import { type ReactNode, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useTitleBarPortalTarget } from './TitleBarPortalContext';
import { useSceneActivation } from './SceneBoundary';

// Renders non-lane content into the persistent app-shell title bar's center, route
// or stud region. Routed buttons MUST use TitleBarControlContribution instead: it
// accepts typed intent, not arbitrary JSX, and renders into the one App-owned lane
// (ADR-0104). The screen keeps this content (and its state) in its own component tree;
// createPortal paints it inside the bar's DOM so the bar-scoped CSS still applies.
// The `route` region is the trailing breadcrumb beneath the wordmark: a screen whose
// position is state rather than address (the Run's phase) contributes canonical
// NavButton segments there instead of inventing a second status chip. These intrinsic
// breadcrumb controls are distinct from arbitrary title-bar action contributions.
// Returns null until the target node exists (the bar mounts a tick before the screen
// reads it). Use only on screens whose titleBarConfig sets the matching slot.
export function TitleBarSlot({ region, children }: {
  region: 'center' | 'route' | 'stud';
  children: ReactNode;
}): ReactElement | null {
  const target = useTitleBarPortalTarget(region);
  const active = useSceneActivation();
  return target && active ? createPortal(children, target) : null;
}
