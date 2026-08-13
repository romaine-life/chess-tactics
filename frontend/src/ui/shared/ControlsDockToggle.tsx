import type { ReactElement } from 'react';

import { ChromeButton } from './ChromeButton';

/**
 * The docked Controls strip's collapse control.
 *
 * It lives in its own module rather than inside ChromeBox because the Controls head's
 * compartments are deliberately NOT buttons — the divided block already drew every edge they
 * have, so each is a bare seat carrying the leaf material (ADR-0569), and
 * check-empty-panel-frame-overlay pins that by refusing a ChromeButton in that file. This
 * control is not a compartment; it is a control the DOCK adds, so it is registered chrome in
 * the ordinary way and simply does not belong in there.
 *
 * Only the docked strip can collapse: on the desktop rail there is a full-height column and
 * nothing to reclaim, which is why the narrow band that docks the rail is also the only place
 * this is shown.
 */
export function ControlsDockToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <ChromeButton
      unit="inner-text-button"
      className="shell-controls-collapse"
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Show controls' : 'Hide controls'}
      onClick={onToggle}
    >
      {collapsed ? 'Show' : 'Hide'}
    </ChromeButton>
  );
}
