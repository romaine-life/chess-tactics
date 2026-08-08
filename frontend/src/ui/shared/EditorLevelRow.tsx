import { type ReactElement, type ReactNode } from 'react';
import { MODE_NAME } from '../../core/objectives';
import type { Level } from '../../core/level';
import { levelThumbnailUrl } from '../../net/levelThumbnails';
import { levelObjectiveLine } from '../LevelInfoCompact';
import { installedUiMedia } from '../installedUiMedia';
import { GatedLevelThumbnail } from '../shell/ThumbnailSurface';
import { ActionListRow, type ActionListAction } from './ActionList';

const EDITOR_ROW_ICONS = {
  favorite: installedUiMedia('ui-kit-icons-brand-shield-png'),
  'chevron-up': installedUiMedia('ui-kit-icons-chevron-up-png'),
  'chevron-down': installedUiMedia('ui-kit-icons-chevron-down-png'),
  delete: installedUiMedia('ui-kit-icons-delete-png'),
  lock: installedUiMedia('ui-kit-icons-lock-png'),
  pencil: installedUiMedia('ui-kit-icons-pencil-png'),
  save: installedUiMedia('ui-kit-icons-save-png'),
} as const;

export type EditorRowIconName = keyof typeof EDITOR_ROW_ICONS;

/** The carved glyph every editor row control draws — never a typed arrow or ✕ character. */
export function EditorRowIcon({ icon }: { icon: EditorRowIconName }): ReactElement {
  return <img className="ce-icon-img" src={EDITOR_ROW_ICONS[icon]} alt="" aria-hidden="true" draggable={false} />;
}

/**
 * One authored level as an editor row: board thumbnail, ordinal + name, a fact line, and
 * the capability-scoped verbs (edit board, reorder, delete).
 *
 * Campaign levels, War Battles, and unassigned levels are all the same object seen through
 * a different container, so they share this row rather than each growing a parallel one
 * (ADR-0059). A container supplies the verbs it actually has — a War has no
 * campaign ordering, an unassigned level has no position — and omits the rest.
 */
export function EditorLevelRow({
  levelId,
  objective,
  level,
  index,
  active,
  readOnly = false,
  displayName,
  description,
  heading,
  actions,
  showOrdinal = true,
  ariaLabel,
  headingId,
  descriptionId,
  primaryHref,
  onPrimarySelect,
  primaryAriaLabel,
  primaryTitle,
  actionsLabel,
  className = 'ce-editor-level-row',
  copyClassName = 'ce-editor-level-copy',
  onSelect,
  editHref,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  onDelete,
  deleteLabel,
  deleteTitle,
}: {
  levelId: string;
  objective?: Level['objective'];
  level: Level | undefined;
  index: number;
  active: boolean;
  readOnly?: boolean;
  displayName?: string;
  description?: ReactNode;
  heading?: ReactNode;
  actions?: ReactNode;
  showOrdinal?: boolean;
  ariaLabel?: string;
  headingId?: string;
  descriptionId?: string;
  primaryHref?: string;
  onPrimarySelect?: () => void;
  primaryAriaLabel?: string;
  primaryTitle?: string;
  actionsLabel?: string;
  className?: string;
  copyClassName?: string;
  onSelect?: () => void;
  editHref?: string;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
  deleteTitle?: string;
}): ReactElement {
  // The full level doc drives a direction-aware goal line (King Assault reads "Protect
  // your King" when the player holds the King); before it hydrates, fall back to the
  // ref's objective as a mode name only.
  const rowName = displayName ?? level?.name ?? levelId;
  const goalLine = description ?? (level ? levelObjectiveLine(level) : MODE_NAME[objective ?? 'capture-all']);
  const hasDefaultActions = !readOnly && Boolean(editHref || onMoveUp || onMoveDown || onDelete);
  const defaultActions: ActionListAction[] = hasDefaultActions ? [
    ...(editHref ? [{ id: 'edit', href: editHref, label: `Edit board for ${rowName}`, title: 'Edit board', icon: <EditorRowIcon icon="pencil" /> }] : []),
    ...(onMoveUp ? [{ id: 'move-up', label: `Move ${rowName} up`, title: 'Move up', icon: <EditorRowIcon icon="chevron-up" />, disabled: !canMoveUp, onPress: onMoveUp }] : []),
    ...(onMoveDown ? [{ id: 'move-down', label: `Move ${rowName} down`, title: 'Move down', icon: <EditorRowIcon icon="chevron-down" />, disabled: !canMoveDown, onPress: onMoveDown }] : []),
    ...(onDelete ? [{ id: 'delete', label: deleteLabel ?? `Delete saved level ${rowName}`, title: deleteTitle ?? 'Delete saved level', icon: <EditorRowIcon icon="delete" />, tone: 'danger' as const, onPress: onDelete }] : []),
  ] : [];
  const rowActions = actions === undefined ? defaultActions : undefined;
  const actionContent = actions === undefined ? undefined : actions;
  const hasActions = Boolean(rowActions?.length || actionContent);
  const containerIsButton = Boolean(onSelect);
  return (
    <ActionListRow item={{
      id: levelId,
      title: `${showOrdinal ? `${index + 1}. ` : ''}${rowName}`,
      description: <p>{goalLine}</p>,
      heading: (
        <div className="ce-editor-level-heading">
          {heading ?? <h4 id={headingId}>{showOrdinal ? `${index + 1}. ` : ''}{rowName}</h4>}
        </div>
      ),
      descriptionId,
      leading: level ? (
          <GatedLevelThumbnail
            level={level}
            width={66}
            authoringPreview={!levelThumbnailUrl(level.id)}
          />
        ) : (
          <span className="settings-row-thumb-empty" />
        ),
      selected: active,
      readOnly: !hasActions,
      neutral: !containerIsButton,
      className,
      copyClassName,
      ariaLabel,
      actionsLabel: actionsLabel ?? `Actions for ${rowName}`,
      onSelect,
      primaryAction: primaryHref || onPrimarySelect ? {
        label: primaryAriaLabel ?? `Open ${rowName}`,
        title: primaryTitle,
        href: primaryHref,
        describedBy: descriptionId,
        onPress: onPrimarySelect,
      } : undefined,
      actions: rowActions,
      actionContent,
    }} />
  );
}
