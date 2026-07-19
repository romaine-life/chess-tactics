import { useContext, type ReactNode, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { TitleBarPortalContext } from './TitleBarPortalContext';

// Renders non-lane content into the persistent app-shell title bar's center or stud
// region. Routed buttons MUST use TitleBarControlContribution instead: it accepts
// typed intent, not arbitrary JSX, and renders into the one App-owned lane (ADR-0104).
// The screen keeps this content (and its state) in its own component tree;
// createPortal paints it inside the bar's DOM so the bar-scoped CSS still applies.
// Returns null until the target node exists (the bar mounts a tick before the screen
// reads it). Use only on screens whose titleBarConfig sets centerSlot / studSlot.
export function TitleBarSlot({ region, children }: { region: 'center' | 'stud'; children: ReactNode }): ReactElement | null {
  const { centerNode, studNode } = useContext(TitleBarPortalContext);
  const target = region === 'center' ? centerNode : studNode;
  return target ? createPortal(children, target) : null;
}
