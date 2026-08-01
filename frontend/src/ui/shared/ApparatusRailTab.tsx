import type { CSSProperties, ReactElement } from 'react';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { FittedTabLabel } from './FittedTabLabel';
import { NavButton } from './NavButton';

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
    <NavButton
      data-testid={testId}
      data-chrome-unit="inner-box"
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
    </NavButton>
  );
}
