import type { ComponentPropsWithoutRef, HTMLAttributes, ReactElement, ReactNode } from 'react';
import type { ChromeRole } from '../chromeCandidateSources';
import { chromeUnitClassNames } from '../chromeUnitRegistry';

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
      <span className="le-outer-panel-fill" aria-hidden="true" />
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
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { title: ReactNode }): ReactElement {
  return (
    <section {...props} className={`skirmish-card outer-chrome-header ${className}`.trim()}>
      <OuterChromeTitle>{title}</OuterChromeTitle>
      {children}
    </section>
  );
}

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
