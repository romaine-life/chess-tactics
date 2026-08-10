import { type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import type { ChromeRole } from '../chromeCandidateSources';
import { ChromeDivider, InnerChromeBox } from './ChromeBox';
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
  /** Installed chrome surface for this control's fill (e.g. the oak every trigger wears). */
  fillSurface?: string;
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
  /** Register the kit's 9-slice divider between the leading slot and the copy, so the leading
   *  content reads as a compartment of this box rather than a second box floating inside it. */
  leadingDivider?: boolean;
  selected?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  neutral?: boolean;
  /**
   * False for a row that is a MEMBER of a list box rather than a slab standing on its own: the
   * box around it is already the frame and already wears the material, so framing the row again
   * draws the same stuff inside itself. Members are told apart by the rail the list puts between
   * them. Defaults true, so every existing list keeps its per-row frame.
   */
  framed?: boolean;
  className?: string;
  copyClassName?: string;
  actionsClassName?: string;
  /** Borrow another role's installed fill under this row's inner frame (ADR-0433). */
  fillRole?: ChromeRole;
  fillSurface?: string;
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
    'data-chrome-fill-surface': action.fillSurface,
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
  const framed = item.framed !== false;
  const Frame = framed ? InnerChromeBox : 'div';
  const frameProps = framed ? { fillRole: item.fillRole, fillSurface: item.fillSurface } : {};

  return (
    <Frame
      {...frameProps}
      className={`settings-row action-list-row ${framed ? '' : 'action-list-row-member'} ${item.className ?? ''} ${item.selected ? 'active is-active is-selected' : ''} ${item.disabled ? 'is-disabled' : ''} ${item.readOnly ? 'is-read-only' : ''} ${item.neutral ? 'is-neutral' : ''}`.replace(/\s+/g, ' ').trim()}
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
      {leading && item.leadingDivider ? (
        <ChromeDivider role="inner" orientation="vertical" className="action-list-leading-rule" />
      ) : null}
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
    </Frame>
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
