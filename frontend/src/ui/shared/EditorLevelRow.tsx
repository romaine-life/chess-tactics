import { type ReactElement, type ReactNode } from 'react';
import { MODE_NAME } from '../../core/objectives';
import type { Level } from '../../core/level';
import { levelThumbnailUrl } from '../../net/levelThumbnails';
import { levelObjectiveLine } from '../LevelInfoCompact';
import { installedUiMedia } from '../installedUiMedia';
import { GatedLevelThumbnail } from '../shell/ThumbnailSurface';
import { ActionListRow, type ActionListAction } from './ActionList';
import { EDITOR_COLUMN_BOX_FILL_ROLE, EDITOR_COLUMN_CONTROL_FILL_SURFACE } from './EditorColumnControls';

const EDITOR_ROW_ICONS = {
  favorite: installedUiMedia('ui-kit-icons-brand-shield-png'),
  'chevron-up': installedUiMedia('ui-kit-icons-chevron-up-png'),
  'chevron-down': installedUiMedia('ui-kit-icons-chevron-down-png'),
  delete: installedUiMedia('ui-kit-icons-delete-png'),
  info: installedUiMedia('ui-kit-icons-info-png'),
  lock: installedUiMedia('ui-kit-icons-lock-png'),
  pencil: installedUiMedia('ui-kit-icons-pencil-png'),
  save: installedUiMedia('ui-kit-icons-save-png'),
} as const;

export type EditorRowIconName = keyof typeof EDITOR_ROW_ICONS;

/**
 * The preview is a compartment of the row, so it fills the row's content height rather than
 * being a smaller picture floating in a pane: 86px box less the 7px inner rail on each side is
 * 72px tall, which at the board's canonical 4:3 window is 96px wide. LevelThumbnail owns its
 * ratio and takes only a width, so the width is what this states — keep it in step with
 * `.ce-editor-level-row`'s `block-size` in style.css.
 */
const LEVEL_ROW_PREVIEW_WIDTH = 96;

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
  onInfo,
  infoLabel,
  framed = true,
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
  /** Renders an "i" verb beside the row controls instead of making the row itself pressable. */
  onInfo?: () => void;
  infoLabel?: string;
  /** False for a row that is a member of a list BOX; the box is already the frame. */
  framed?: boolean;
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
  const hasDefaultActions = !readOnly && Boolean(onInfo || editHref || onMoveUp || onMoveDown || onDelete);
  // Every verb on the row is a trigger, so every verb wears the column's oak (see
  // EditorColumnControls) rather than the inner role's tint.
  const oak = EDITOR_COLUMN_CONTROL_FILL_SURFACE;
  const defaultActions: ActionListAction[] = hasDefaultActions ? [
    // An "i" beside the other verbs, for a row that is a MEMBER of a list box rather than a
    // clickable slab of its own. Selecting by pressing the row needs the row to LOOK pressable,
    // which is the per-row frame this kind of list is trying not to draw; the button says the
    // same thing in the space the row already gives its verbs.
    ...(onInfo ? [{ id: 'info', label: infoLabel ?? `Details for ${rowName}`, title: 'Details', icon: <EditorRowIcon icon="info" />, selected: active, fillSurface: oak, onPress: onInfo }] : []),
    ...(editHref ? [{ id: 'edit', href: editHref, label: `Edit board for ${rowName}`, title: 'Edit board', icon: <EditorRowIcon icon="pencil" />, fillSurface: oak }] : []),
    ...(onMoveUp ? [{ id: 'move-up', label: `Move ${rowName} up`, title: 'Move up', icon: <EditorRowIcon icon="chevron-up" />, disabled: !canMoveUp, fillSurface: oak, onPress: onMoveUp }] : []),
    ...(onMoveDown ? [{ id: 'move-down', label: `Move ${rowName} down`, title: 'Move down', icon: <EditorRowIcon icon="chevron-down" />, disabled: !canMoveDown, fillSurface: oak, onPress: onMoveDown }] : []),
    ...(onDelete ? [{ id: 'delete', label: deleteLabel ?? `Delete saved level ${rowName}`, title: deleteTitle ?? 'Delete saved level', icon: <EditorRowIcon icon="delete" />, tone: 'danger' as const, fillSurface: oak, onPress: onDelete }] : []),
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
      // The board preview is a COMPARTMENT of this box, not a second box inside it: it seats
      // flush against the row's own frame and the kit's 9-slice divider separates it from the
      // copy, so the row reads as one framed object split into panes (the treatment the Run's
      // Battle preview wears). A nested inner frame here also could not fit — its rails made
      // the leading content taller than the row's content box, which is what pushed every
      // control in the row off centre.
      leadingChrome: false,
      leadingClassName: 'ce-editor-level-thumb',
      // The rail between the preview and the copy is what makes a FRAMED row read as one object
      // split into panes. An unframed member has no frame for it to meet, so a row of them stacks
      // those rails into a continuous spine down the list with junction atoms at every seam.
      leadingDivider: framed,
      leading: level ? (
          <GatedLevelThumbnail
            level={level}
            width={LEVEL_ROW_PREVIEW_WIDTH}
            authoringPreview={!levelThumbnailUrl(level.id)}
          />
        ) : (
          <span className="settings-row-thumb-empty" />
        ),
      fillRole: framed ? EDITOR_COLUMN_BOX_FILL_ROLE : undefined,
      framed,
      // A framed row shows which one is current by lighting its own frame. An unframed member has
      // none to light, and the same class paints a bare outline floating in the list — so the "i"
      // that opened the details carries the state instead, which is also the thing you pressed.
      selected: framed ? active : false,
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
