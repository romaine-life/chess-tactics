import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from 'react';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { FittedTabLabel } from './FittedTabLabel';
import { ChromeNavButton } from './ChromeButton';

export interface ApparatusRailTabProps {
  label: string;
  to: string;
  index: number;
  active?: boolean;
  /**
   * The installed media URL of this tab's mark — REQUIRED, and the only way a rail tab
   * can carry one. A class-name escape hatch used to sit beside it, and every tab that
   * took it painted a CSS background under different sizing rules than the shared <img>:
   * the Strategikon's Enchiridion tab drew the SAME installed icon as the main menu's,
   * cropped to a 30px window of its 64px source, which is how one destination ended up
   * with two marks. Resolve the URL at the call site (menuModeIcon, installedUiMedia).
   */
  iconSrc: string;
  /**
   * How the mark's SOURCE CANVAS is authored, which decides the drawn size — not a
   * per-tab style knob. The kit icons this rail was built for reserve canvas margin
   * (their glyph fills 62-84% of a 64px square), so the seat's own size is their
   * optical size. The Run's marks — Ataraxia's emblem, Conflict, Battle — are authored
   * edge-to-edge for the title bar's tight measure seat, so drawing one at the same
   * seat size lands a glyph a third larger than its neighbours and spills the button's
   * frame. 'bleed' supplies the canvas margin the art does not carry.
   */
  markCanvas?: 'inset' | 'bleed';
  title?: string;
  testId?: string;
  detail?: string;
}

export interface ApparatusRailColumnProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  placement?: 'open' | 'framed';
}

/**
 * The registered chrome fill surface every menu-language rail button is painted with.
 * ONE declaration for the whole family: the rail column below stamps it, so the Main
 * Menu, Settings, Editor, Play, Enchiridion, and Strategikon rails cannot diverge and
 * re-skinning the menu buttons is a single edit here. (The Strategikon rails were a
 * lookalike for exactly as long as this literal sat on the main-menu screen alone.)
 * The id is a CHROME_FILL_SURFACES entry; chromeFamilyRuntime emits the matching
 * `[data-chrome-tab-fill-surface="<id>"] .settings-tab` fill rule.
 */
export const APPARATUS_RAIL_FILL_SURFACE = 'hybrid-wood-oak';

/**
 * Canonical menu-language rail column. The component owns the fixed column
 * width, button-stack gap, the placement-specific main-menu perimeter, and the
 * button fill surface; consumers only provide the ordered buttons and a semantic
 * host class.
 */
export function ApparatusRailColumn({
  children,
  className = '',
  placement = 'open',
  ...props
}: ApparatusRailColumnProps): ReactElement {
  return (
    <aside
      {...props}
      data-apparatus-rail-column=""
      data-apparatus-rail-placement={placement}
      // After the spread: the surface is family-owned, not a per-consumer choice.
      data-chrome-tab-fill-surface={APPARATUS_RAIL_FILL_SURFACE}
      className={`apparatus-rail-column ${className}`.trim()}
    >
      {children}
    </aside>
  );
}

/**
 * Canonical menu-language rail tab. Main Menu, Play, and Strategikon all use
 * this one primitive so size, indentation, surface continuity, focus, and active
 * state cannot drift into lookalike implementations (ADR-0059, ADR-0231).
 */
export function ApparatusRailTab({
  label,
  to,
  index,
  active = false,
  iconSrc,
  markCanvas = 'inset',
  title,
  testId,
  detail,
}: ApparatusRailTabProps): ReactElement {
  return (
    <ChromeNavButton unit="inner-box"
      data-testid={testId}
      className={chromeUnitClassNames('inner-box', 'settings-tab main-menu-mode-tab', active && 'is-active')}
      to={to}
      aria-current={active ? 'page' : undefined}
      title={title}
      style={{ ['--tab-index' as string]: index } as CSSProperties}
    >
      <span className="settings-tab-icon" data-mark-canvas={markCanvas} aria-hidden="true">
        <img src={iconSrc} alt="" />
      </span>
      {detail ? (
        <span className="apparatus-tab-copy">
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
      ) : <FittedTabLabel>{label}</FittedTabLabel>}
    </ChromeNavButton>
  );
}
