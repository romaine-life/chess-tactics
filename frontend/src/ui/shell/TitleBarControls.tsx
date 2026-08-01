import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { useTitleBarPortalTarget } from './TitleBarPortalContext';
import { ChromeButton, ChromeNavButton } from '../shared/ChromeButton';
import { useSceneActivation } from './SceneBoundary';

type TitleBarControlVariant = 'label' | 'return' | 'icon';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function TitleBarStatus({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }): ReactElement {
  return (
    <div
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'titlebar-status', className)}
      {...props}
    >
      {children}
    </div>
  );
}

interface TitleBarButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  active?: boolean;
  replace?: boolean;
  scroll?: boolean;
  to?: string | (() => string);
  variant?: TitleBarControlVariant;
}

/** App-shell internal. Routed screens contribute TitleBarControlSpec values instead. */
export function TitleBarButtonPrimitive({
  active,
  children,
  className,
  replace,
  scroll,
  to,
  variant = 'label',
  ...props
}: TitleBarButtonProps): ReactElement {
  const controlClassName = chromeUnitClassNames(
    'inner-box',
    'titlebar-control',
    `titlebar-control--${variant}`,
    active && 'active titlebar-control--active',
    className,
  );

  if (to) {
    return (
      <ChromeNavButton unit="inner-box" className={controlClassName} to={to} replace={replace} scroll={scroll} {...props}>
        {children}
      </ChromeNavButton>
    );
  }

  return (
    <ChromeButton unit="inner-box" className={controlClassName} {...props}>
      {children}
    </ChromeButton>
  );
}

interface TitleBarIconButtonProps extends Omit<TitleBarButtonProps, 'aria-label' | 'children' | 'variant'> {
  iconClassName?: string;
  iconSrc: string;
  label: string;
}

/** App-shell internal. Routed screens contribute TitleBarControlSpec values instead. */
export function TitleBarIconButtonPrimitive({
  iconClassName,
  iconSrc,
  label,
  title = label,
  ...props
}: TitleBarIconButtonProps): ReactElement {
  return (
    <TitleBarButtonPrimitive aria-label={label} title={title} variant="icon" {...props}>
      <img className={cx('titlebar-control-glyph', iconClassName)} src={iconSrc} alt="" aria-hidden="true" />
    </TitleBarButtonPrimitive>
  );
}

type TitleBarTextPresentation = {
  presentation?: 'label' | 'return';
  iconSrc?: never;
};

type TitleBarIconPresentation = {
  presentation: 'icon';
  iconSrc: string;
};

interface TitleBarControlBase {
  /** Stable identity for React and geometry diagnostics. */
  id: string;
  /** Visible text for labeled controls; accessible name for icon controls. */
  label: string;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  testId?: string;
}

export type TitleBarControlSpec = TitleBarControlBase & (TitleBarTextPresentation | TitleBarIconPresentation) & (
  | {
      kind: 'navigation';
      destination: string | (() => string);
      replace?: boolean;
      scroll?: boolean;
    }
  | {
      kind: 'action';
      onActivate: () => void;
    }
);

function renderContributedControl(control: TitleBarControlSpec): ReactElement {
  const common = {
    active: control.active,
    disabled: control.disabled,
    title: control.title ?? control.label,
    'aria-pressed': control.pressed,
    'data-testid': control.testId,
    'data-titlebar-control-id': control.id,
  };

  if (control.presentation === 'icon') {
    return control.kind === 'navigation' ? (
      <TitleBarIconButtonPrimitive
        key={control.id}
        {...common}
        to={control.destination}
        replace={control.replace}
        scroll={control.scroll}
        label={control.label}
        iconSrc={control.iconSrc}
      />
    ) : (
      <TitleBarIconButtonPrimitive
        key={control.id}
        {...common}
        onClick={control.onActivate}
        label={control.label}
        iconSrc={control.iconSrc}
      />
    );
  }

  const content = control.label;
  return control.kind === 'navigation' ? (
    <TitleBarButtonPrimitive
      key={control.id}
      {...common}
      to={control.destination}
      replace={control.replace}
      scroll={control.scroll}
      variant={control.presentation ?? 'label'}
    >
      {content}
    </TitleBarButtonPrimitive>
  ) : (
    <TitleBarButtonPrimitive
      key={control.id}
      {...common}
      onClick={control.onActivate}
      variant={control.presentation ?? 'label'}
    >
      {content}
    </TitleBarButtonPrimitive>
  );
}

/**
 * The only routed-screen API for ordinary title-bar controls. Callers describe
 * intent; AppTitleBar owns the DOM lane, divider, size, gaps, and edge clearance.
 */
export function TitleBarControlContribution({
  ariaLabel,
  controls,
}: {
  ariaLabel: string;
  controls: readonly TitleBarControlSpec[];
}): ReactElement | null {
  const beforeDividerNode = useTitleBarPortalTarget('before-divider');
  const active = useSceneActivation();
  if (!beforeDividerNode || !active || controls.length === 0) return null;
  return createPortal(
    <div className="app-titlebar-contributed-controls" role="group" aria-label={ariaLabel}>
      {controls.map(renderContributedControl)}
    </div>,
    beforeDividerNode,
  );
}
