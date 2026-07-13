import type { HTMLAttributes, ReactElement } from 'react';
import type { ChromeRole } from '../chromeCandidateSources';
import { chromeUnitClassNames } from '../chromeUnitRegistry';

export function InnerChromeBox({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      {...props}
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'inner-chrome-box', className)}
    />
  );
}

export function ChromeDivider({
  role,
  className = '',
}: {
  role: ChromeRole;
  className?: string;
}): ReactElement {
  return (
    <div
      data-chrome-divider-role={role}
      className={`kit-divider chrome-divider ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
