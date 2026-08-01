import {
  type ComponentPropsWithRef,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { chromeUnitClassNames, type ChromeUnitId } from '../chromeUnitRegistry';
import { NavButton } from './NavButton';

export type ChromeButtonTone = 'neutral' | 'primary' | 'danger';

type ChromeButtonProps = Omit<ComponentPropsWithRef<'button'>, 'type'> & {
  unit: ChromeUnitId;
  selected?: boolean;
  tone?: ChromeButtonTone;
  buttonRef?: Ref<HTMLButtonElement>;
  stopPropagation?: boolean;
};

/**
 * Canonical renderer for a button backed by the chrome-unit registry.
 *
 * Consumers provide behavior and local layout classes. This component owns the
 * semantic button element, registered unit, tone classes, selected-state classes,
 * and pressed state so those details cannot drift between call sites.
 */
export function ChromeButton({
  unit,
  selected,
  tone = 'neutral',
  className = '',
  buttonRef,
  ref,
  stopPropagation = false,
  onClick,
  onKeyDown,
  'aria-pressed': ariaPressed,
  ...props
}: ChromeButtonProps): ReactElement {
  return (
    <button
      {...props}
      ref={buttonRef ?? ref}
      type="button"
      data-chrome-unit={unit}
      className={chromeUnitClassNames(
        unit,
        className,
        tone === 'primary' && 'active is-active',
        tone === 'danger' && 'danger is-danger',
        selected !== undefined && (selected ? 'active is-active is-selected' : 'is-unselected'),
      )}
      aria-pressed={ariaPressed ?? (selected !== undefined ? selected : undefined)}
      onClick={(event) => {
        onClick?.(event);
        if (stopPropagation) event.stopPropagation();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (stopPropagation) event.stopPropagation();
      }}
    />
  );
}

type ChromeNavButtonProps = ComponentProps<typeof NavButton> & {
  unit: ChromeUnitId;
  selected?: boolean;
  tone?: ChromeButtonTone;
  stopPropagation?: boolean;
};

/** Navigation counterpart to ChromeButton; it preserves NavButton routing semantics. */
export function ChromeNavButton({
  unit,
  selected,
  tone = 'neutral',
  className = '',
  stopPropagation = false,
  onClick,
  onKeyDown,
  ...props
}: ChromeNavButtonProps): ReactElement {
  return (
    <NavButton
      {...props}
      data-chrome-unit={unit}
      className={chromeUnitClassNames(
        unit,
        className,
        tone === 'primary' && 'active is-active',
        tone === 'danger' && 'danger is-danger',
        selected !== undefined && (selected ? 'active is-active is-selected' : 'is-unselected'),
      )}
      aria-pressed={props['aria-pressed'] ?? (selected !== undefined ? selected : undefined)}
      onClick={(event) => {
        onClick?.(event);
        if (stopPropagation) event.stopPropagation();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (stopPropagation) event.stopPropagation();
      }}
    />
  );
}

export function InnerTextButton(props: Omit<ChromeButtonProps, 'unit'>): ReactElement {
  return <ChromeButton unit="inner-text-button" {...props} />;
}

export function InnerTextNavButton(props: Omit<ChromeNavButtonProps, 'unit'>): ReactElement {
  return <ChromeNavButton unit="inner-text-button" {...props} />;
}

export function IconButton({
  children,
  className = '',
  ...props
}: Omit<ChromeButtonProps, 'unit'> & { children: ReactNode }): ReactElement {
  return (
    <ChromeButton unit="inner-tool-square" className={`ce-icon-button ${className}`.trim()} {...props}>
      <span aria-hidden="true">{children}</span>
    </ChromeButton>
  );
}

export function IconNavButton({
  children,
  className = '',
  ...props
}: Omit<ChromeNavButtonProps, 'unit'> & { children: ReactNode }): ReactElement {
  return (
    <ChromeNavButton unit="inner-tool-square" className={`ce-icon-button ${className}`.trim()} {...props}>
      <span aria-hidden="true">{children}</span>
    </ChromeNavButton>
  );
}
