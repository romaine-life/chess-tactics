import { type ReactElement, type ReactNode } from 'react';
import { MODE_NAME } from '../../core/objectives';
import type { Level } from '../../core/level';
import { levelThumbnailUrl } from '../../net/levelThumbnails';
import { levelObjectiveLine } from '../LevelInfoCompact';
import { installedUiMedia } from '../installedUiMedia';
import { GatedLevelThumbnail } from '../shell/ThumbnailSurface';
import { ActionListRow, type ActionListAction } from './ActionList';
import { ChromeDividedGridRow, DividedInnerChromeBox } from './ChromeDividedGrid';
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
 * The preview is a compartment of the row, so it fills the row's content height rather than being
 * a smaller picture floating in a pane. LevelThumbnail owns the board's 4:3 window and takes only
 * a WIDTH, so the width is derived from the height it has to fill.
 *
 * How much height it has depends on whether the row is framed: a framed row spends the inner rail
 * on each side, an unframed member spends nothing. Stating that as arithmetic rather than as two
 * magic numbers is what keeps the picture flush in both — the unframed rows in the War editor's
 * Battles box kept the framed row's 96px and so sat 14px short of their own compartment.
 * Keep LEVEL_ROW_BLOCK_SIZE in step with `.ce-editor-level-row`'s `block-size` in style.css.
 */
const LEVEL_ROW_BLOCK_SIZE = 86;
const LEVEL_ROW_FRAME_RAIL = 7;
const BOARD_VIEW_ASPECT = 4 / 3;

function levelRowPreviewWidth(framed: boolean): number {
  const height = LEVEL_ROW_BLOCK_SIZE - (framed ? LEVEL_ROW_FRAME_RAIL * 2 : 0);
  return Math.round(height * BOARD_VIEW_ASPECT);
}

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
  const preview = level ? (
    <GatedLevelThumbnail
      level={level}
      width={levelRowPreviewWidth(framed)}
      authoringPreview={!levelThumbnailUrl(level.id)}
    />
  ) : (
    <span className="settings-row-thumb-empty" />
  );

  // The row is TWO CELLS — preview, then everything else — either way. What differs is who owns
  // the rail between them: a member hands its cells to the list box around it and that box's
  // column line divides them; a framed row is its OWN one-row box and its own column line does.
  // Neither draws a rule of its own, because a rule drawn here can only cap its ends as though
  // they met a frame, and the ends it actually has belong to whichever box is around it.
  const cells = (
    <>
      <div className="ce-editor-level-thumb ce-editor-level-cell-preview">{preview}</div>
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
        framed: false,
        // Never on the cell. A framed row shows which one is current by lighting its own frame,
        // and that frame is the box's; the same class on the cell would outline the copy alone.
        // The current row is announced on the box instead (aria-current below).
        selected: false,
        readOnly: !hasActions,
        neutral: !containerIsButton,
        className: `${className} ce-editor-level-cell-body`,
        copyClassName,
        // A framed row is pressable as a whole, so the label and the press live on the box; the
        // body cell would otherwise announce the row a second time and leave the preview dead.
        ariaLabel: framed ? undefined : ariaLabel,
        actionsLabel: actionsLabel ?? `Actions for ${rowName}`,
        onSelect: framed ? undefined : onSelect,
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
    </>
  );

  if (!framed) return cells;

  return (
    <DividedInnerChromeBox
      columns={['var(--ce-level-row-preview-inline)', 'minmax(0, 1fr)']}
      className={`ce-editor-level-row-box ${className} ${active ? 'active is-active is-selected' : ''} ${!hasActions ? 'is-read-only' : ''} ${!containerIsButton ? 'is-neutral' : ''}`.replace(/\s+/g, ' ').trim()}
      fillRole={EDITOR_COLUMN_BOX_FILL_ROLE}
      role={containerIsButton ? 'button' : undefined}
      tabIndex={containerIsButton ? 0 : undefined}
      aria-label={containerIsButton ? ariaLabel : undefined}
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <ChromeDividedGridRow className="ce-editor-level-row-cells">{cells}</ChromeDividedGridRow>
    </DividedInnerChromeBox>
  );
}
