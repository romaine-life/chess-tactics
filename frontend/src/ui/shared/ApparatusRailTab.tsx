import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from 'react';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { FittedTabLabel } from './FittedTabLabel';
import { ChromeNavButton } from './ChromeButton';

export interface ApparatusRailTabProps {
  label: string;
  to: string;
  index: number;
  active?: boolean;
  iconSrc?: string;
  iconClassName?: string;
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
  iconClassName,
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
      <span className="settings-tab-icon" aria-hidden="true">
        {iconSrc ? <img src={iconSrc} alt="" /> : <span className={iconClassName} />}
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
