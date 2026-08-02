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
 * Canonical menu-language rail column. The component owns the fixed column
 * width, button-stack gap, and the placement-specific main-menu perimeter;
 * consumers only provide the ordered buttons and a semantic host class.
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
