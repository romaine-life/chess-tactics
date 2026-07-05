import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { NavButton } from '../shared/NavButton';

type TitleBarControlVariant = 'label' | 'return' | 'icon';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function TitleBarActions({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }): ReactElement {
  return (
    <div className={cx('titlebar-actions', className)} {...props}>
      {children}
    </div>
  );
}

export interface TitleBarButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  active?: boolean;
  replace?: boolean;
  scroll?: boolean;
  to?: string | (() => string);
  variant?: TitleBarControlVariant;
}

export function TitleBarButton({
  active,
  children,
  className,
  replace,
  scroll,
  to,
  variant = 'label',
  ...props
}: TitleBarButtonProps): ReactElement {
  const controlClassName = cx(
    'titlebar-control',
    `titlebar-control--${variant}`,
    active && 'titlebar-control--active',
    className,
  );

  if (to) {
    return (
      <NavButton className={controlClassName} to={to} replace={replace} scroll={scroll} {...props}>
        {children}
      </NavButton>
    );
  }

  return (
    <button type="button" className={controlClassName} {...props}>
      {children}
    </button>
  );
}

export interface TitleBarIconButtonProps extends Omit<TitleBarButtonProps, 'aria-label' | 'children' | 'variant'> {
  iconClassName?: string;
  iconSrc: string;
  label: string;
}

export function TitleBarIconButton({
  iconClassName,
  iconSrc,
  label,
  title = label,
  ...props
}: TitleBarIconButtonProps): ReactElement {
  return (
    <TitleBarButton aria-label={label} title={title} variant="icon" {...props}>
      <img className={cx('titlebar-control-glyph', iconClassName)} src={iconSrc} alt="" aria-hidden="true" />
    </TitleBarButton>
  );
}
