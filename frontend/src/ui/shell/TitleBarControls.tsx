import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { useTitleBarPortalTarget } from './TitleBarPortalContext';
import { ChromeButton, ChromeNavButton } from '../shared/ChromeButton';
import { Tooltip } from '../shared/InfoTip';
import { useSceneActivation } from './SceneBoundary';

type TitleBarControlVariant = 'label' | 'return' | 'icon';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function TitleBarStatus({
  as: Tag = 'div',
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  /** `span` when the box is seated inside inline content — a tooltip trigger. */
  as?: 'div' | 'span';
  children: ReactNode;
}): ReactElement {
  return (
    <Tag
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'titlebar-status', className)}
      {...props}
    >
      {children}
    </Tag>
  );
}

/**
 * A title-bar box that IS its own hover/focus tooltip.
 *
 * The box is not decoration and is not free: every framed element in the bar costs
 * width on a row that has none to spare, so a box has to be earned. What earns it is
 * being one target — hovering anywhere on the frame names the thing inside it. That
 * is the whole rule for the persistent bar, and it is why the Run's measures, which
 * were bare marks, are boxed now: they were already tooltips, so the frame states
 * where each target begins and ends instead of leaving the reader to guess.
 *
 * The box is the trigger, not a wrapper around one — the tip is positioned from the
 * frame's own rect, so it hangs off the box rather than off some span inside it.
 */
export function TitleBarStatusTip({
  children,
  className,
  detail,
  explainMechanics,
  fillSurface,
  label,
  name,
  popupClassName,
}: {
  children: ReactNode;
  className?: string;
  /** The explanation. */
  detail: ReactNode;
  explainMechanics?: boolean;
  /** Installed leaf fill for a box that ends a containment level (ADR-0433). */
  fillSurface?: string;
  /** What a screen reader hears in place of the marks. */
  label: string;
  /** The named thing the tip is about. */
  name?: ReactNode;
  popupClassName?: string;
}): ReactElement {
  return (
    <Tooltip
      className="titlebar-status-tip"
      triggerClassName="titlebar-status-trigger"
      label={label}
      title={name}
      explainMechanics={explainMechanics}
      popupClassName={popupClassName}
      trigger={(
        <TitleBarStatus as="span" className={className} data-chrome-fill-surface={fillSurface}>
          {children}
        </TitleBarStatus>
      )}
    >
      {detail}
    </Tooltip>
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
