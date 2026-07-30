import type { ComponentPropsWithoutRef, HTMLAttributes, ReactElement, ReactNode } from 'react';
import type { ChromeRole } from '../chromeCandidateSources';
import { chromeUnitClassNames } from '../chromeUnitRegistry';

export function ChromeSurfaceFill({
  role,
  className = '',
}: {
  role: ChromeRole;
  className?: string;
}): ReactElement {
  return (
    <span
      data-chrome-fill-role={role}
      className={`chrome-surface-fill ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

export function ShellWorkspace({
  className = '',
  contentClassName = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  contentClassName?: string;
}): ReactElement {
  return (
    <section {...props} className={`shell-workspace ${className}`.trim()}>
      <ChromeSurfaceFill role="outer" className="shell-workspace-fill" />
      <div className={`shell-workspace-content ${contentClassName}`.trim()}>
        {children}
      </div>
    </section>
  );
}

export function OuterChromeBox({
  as: Element = 'aside',
  chromeConsumer,
  titled = false,
  contentClassName = '',
  className = '',
  children,
  ...props
}: ComponentPropsWithoutRef<'aside'> & {
  as?: 'aside' | 'div';
  chromeConsumer: string;
  titled?: boolean;
  contentClassName?: string;
}): ReactElement {
  const contentClasses = [
    'le-outer-panel-content',
    titled ? 'le-outer-panel-content--titled' : '',
    contentClassName,
  ].filter(Boolean).join(' ');

  return (
    <Element
      {...props}
      data-chrome-unit="outer-panel"
      data-chrome-consumer={chromeConsumer}
      className={chromeUnitClassNames('outer-panel', 'le-outer-panel', className)}
    >
      <ChromeSurfaceFill role="outer" className="le-outer-panel-fill" />
      <div className={contentClasses}>{children}</div>
    </Element>
  );
}

export function OuterChromeTitle({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>): ReactElement {
  return (
    <h2 {...props} className={`kit-panel-title ${className}`.trim()}>
      <span className="kit-panel-title-text">{children}</span>
    </h2>
  );
}

export function OuterChromeHeader({
  title,
  actions,
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { title: ReactNode; actions?: ReactNode }): ReactElement {
  return (
    <section {...props} className={`skirmish-card outer-chrome-header ${className}`.trim()}>
      <OuterChromeTitle>{title}</OuterChromeTitle>
      {actions ? <div className="outer-chrome-header-title-actions">{actions}</div> : null}
      {children}
    </section>
  );
}

export function InnerChromeBox({
  as: Element = 'div',
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'span';
}): ReactElement {
  return (
    <Element
      {...props}
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'inner-chrome-box', className)}
    />
  );
}

export type ChromeJunctionSides = 'nes' | 'nsw' | 'esw' | 'new' | 'nesw';

export function ChromeDivider({
  role,
  orientation = 'horizontal',
  junctions = 'endpoints',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  role: ChromeRole;
  orientation?: 'horizontal' | 'vertical';
  junctions?: 'endpoints' | 'none';
}): ReactElement {
  return (
    <div
      {...props}
      data-chrome-divider-role={role}
      data-chrome-divider-orientation={orientation}
      data-chrome-divider-junctions={junctions}
      className={`kit-divider chrome-divider ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

export function ChromeJunction({
  role,
  sides,
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  role: ChromeRole;
  sides: ChromeJunctionSides;
}): ReactElement {
  return (
    <span
      {...props}
      data-chrome-junction-role={role}
      data-chrome-junction-sides={sides}
      className={`chrome-junction ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
