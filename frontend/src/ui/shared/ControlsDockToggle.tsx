import type { ReactElement } from 'react';

import { installedUiMedia } from '../installedUiMedia';

const CHEVRON = {
  up: installedUiMedia('ui-kit-icons-chevron-up-png'),
  down: installedUiMedia('ui-kit-icons-chevron-down-png'),
};

/**
 * The docked Controls strip's collapse control.
 *
 * It is the SAME kind of control as the marks it sits beside — a title-action seat carrying an
 * installed kit glyph — because it shares their row. As a text button it wore a frame and a
 * label the other members of that row do not have, and read as something that had wandered in.
 * The chevron is the installed art the Level Editor's rows already use for the same meaning
 * (move/expand), pointing at what pressing it does: down to put the body away, up to bring it
 * back.
 *
 * It lives in its own module rather than inside ChromeBox because the Controls head's
 * compartments are deliberately NOT buttons — the divided block already drew every edge they
 * have (ADR-0569) — and check-empty-panel-frame-overlay pins that by refusing a ChromeButton in
 * that file. This is not a compartment; it is a control the DOCK adds.
 *
 * Only the docked strip can collapse: the desktop rail is a full-height column with nothing to
 * reclaim, which is why the narrow band that docks the rail is the only place this is shown.
 */
export function ControlsDockToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className="skirmish-hud-title-action shell-controls-collapse"
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Show controls' : 'Hide controls'}
      title={collapsed ? 'Show controls' : 'Hide controls'}
      data-testid="controls-dock-toggle"
      onClick={onToggle}
    >
      {/* Its own class, not .skirmish-hud-title-action-glyph: that one states the INK
          FRACTIONS of a particular kit glyph, and borrowing another mark's numbers for this
          art would size it against a measurement that was never taken from it. */}
      <img
        className="shell-controls-collapse-glyph"
        src={collapsed ? CHEVRON.up : CHEVRON.down}
        alt=""
        aria-hidden="true"
      />
    </button>
  );
}
