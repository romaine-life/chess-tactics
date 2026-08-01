import { type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { InnerChromeBox } from './ChromeBox';
import { IconButton, IconNavButton, InnerTextButton, InnerTextNavButton, type ChromeButtonTone } from './ChromeButton';
import { NavButton } from './NavButton';

export type ActionListAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  text?: ReactNode;
  title?: string;
  href?: string;
  disabled?: boolean;
  selected?: boolean;
  tone?: ChromeButtonTone;
  className?: string;
  onPress?: () => void;
  presentation?: 'icon' | 'text';
};

export type ActionListPrimaryAction = {
  label: string;
  title?: string;
  href?: string;
  describedBy?: string;
  onPress?: () => void;
};

export type ActionListItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  heading?: ReactNode;
  headingId?: string;
  descriptionId?: string;
  leading?: ReactNode;
  leadingClassName?: string;
  leadingChrome?: boolean;
  selected?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  neutral?: boolean;
  className?: string;
  copyClassName?: string;
  actionsClassName?: string;
  ariaLabel?: string;
  actionsLabel?: string;
  onSelect?: () => void;
  primaryAction?: ActionListPrimaryAction;
  actions?: readonly ActionListAction[];
  /** Escape hatch for genuinely stateful inline forms; their buttons must still use shared primitives. */
  actionContent?: ReactNode;
};

function activateRow(event: KeyboardEvent<HTMLElement>, onSelect: (() => void) | undefined): void {
  if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    onSelect();
  }
}

function ActionControl({ action }: { action: ActionListAction }): ReactElement {
  const presentation = action.presentation ?? (action.icon === undefined ? 'text' : 'icon');
  const common = {
    selected: action.selected,
    tone: action.tone,
    className: action.className,
    disabled: action.disabled,
    'aria-label': action.label,
    title: action.title,
    stopPropagation: true,
  } as const;
  const contents = action.icon ?? action.text ?? action.label;

  if (presentation === 'icon') {
    return action.href ? (
      <IconNavButton {...common} to={action.href}>{contents}</IconNavButton>
    ) : (
      <IconButton {...common} onClick={action.onPress}>{contents}</IconButton>
    );
  }
  return action.href ? (
    <InnerTextNavButton {...common} to={action.href}>{contents}</InnerTextNavButton>
  ) : (
    <InnerTextButton {...common} onClick={action.onPress}>{contents}</InnerTextButton>
  );
}

/** Canonical row renderer for selectable/editor/action lists. */
export function ActionListRow({ item }: { item: ActionListItem }): ReactElement {
  const interactive = Boolean(item.onSelect);
  const hasActions = Boolean(item.actions?.length || item.actionContent);
  const leading = item.leading === undefined ? null : item.leadingChrome === false ? (
    <span className={item.leadingClassName}>{item.leading}</span>
  ) : (
    <InnerChromeBox as="span" className={`settings-row-thumb ${item.leadingClassName ?? ''}`.trim()} aria-hidden="true">
      {item.leading}
    </InnerChromeBox>
  );
  const primary = item.primaryAction;

  return (
    <InnerChromeBox
      className={`settings-row action-list-row ${item.className ?? ''} ${item.selected ? 'active is-active is-selected' : ''} ${item.disabled ? 'is-disabled' : ''} ${item.readOnly ? 'is-read-only' : ''} ${item.neutral ? 'is-neutral' : ''}`.replace(/\s+/g, ' ').trim()}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? item.ariaLabel : undefined}
      aria-current={interactive && item.selected ? 'true' : undefined}
      aria-disabled={item.disabled || undefined}
      onClick={item.disabled ? undefined : item.onSelect}
      onKeyDown={(event) => {
        if (!item.disabled) activateRow(event, item.onSelect);
      }}
    >
      {leading}
      <div className={`settings-row-copy action-list-copy ${item.copyClassName ?? ''}`.trim()}>
        {item.heading ?? <h4 id={item.headingId}>{item.title}</h4>}
        {item.description !== undefined ? <div id={item.descriptionId} className="action-list-description">{item.description}</div> : null}
      </div>
      {primary?.href ? (
        <NavButton
          className="action-list-primary ce-editor-level-primary"
          to={primary.href}
          aria-label={primary.label}
          aria-describedby={primary.describedBy}
          aria-current={item.selected ? 'true' : undefined}
          title={primary.title}
        />
      ) : primary?.onPress ? (
        <button
          type="button"
          className="action-list-primary ce-editor-level-primary"
          aria-label={primary.label}
          aria-describedby={primary.describedBy}
          aria-current={item.selected ? 'true' : undefined}
          title={primary.title}
          onClick={primary.onPress}
        />
      ) : null}
      {hasActions ? (
        <div className={`settings-row-control action-list-actions ce-row-actions ${item.actionsClassName ?? ''}`.trim()} role="group" aria-label={item.actionsLabel ?? `Actions for ${typeof item.title === 'string' ? item.title : 'item'}`}>
          {item.actionContent}
          {item.actions?.map((action) => <ActionControl key={action.id} action={action} />)}
        </div>
      ) : null}
    </InnerChromeBox>
  );
}

/** Data-in, rows-out list. Item-specific JSX is limited to content slots, never row chrome. */
export function ActionList({
  items,
  className = 'action-list',
  empty,
}: {
  items: readonly ActionListItem[];
  className?: string;
  empty?: ReactNode;
}): ReactElement {
  return (
    <div className={className}>
      {items.length === 0 ? empty : null}
      {items.map((item) => <ActionListRow key={item.id} item={item} />)}
    </div>
  );
}
