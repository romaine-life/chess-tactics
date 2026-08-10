import type { ReactElement } from 'react';
import { ApparatusRailTab } from './ApparatusRailTab';

/**
 * One collection-level destination in the Editor rail.
 *
 * Campaigns, Wars, Skirmish profiles, and Unassigned levels all live in the
 * Editor's scrolling navigation column. Keeping their collection entries on
 * this primitive prevents a content destination from drifting into the pinned
 * workspace-action footer.
 */
export function EditorCollectionRailTab({
  count,
  active,
  index,
  onSelect,
  iconSrc,
  title,
  itemName,
  hasAttention = false,
  attentionLabel = 'Unsaved drafts available',
}: {
  count: number;
  active: boolean;
  index: number;
  onSelect: () => void;
  iconSrc: string;
  title: string;
  itemName: string;
  hasAttention?: boolean;
  attentionLabel?: string;
}): ReactElement {
  const itemCount = `${count} ${itemName}${count === 1 ? '' : 's'}`;
  return (
    <ApparatusRailTab
      label={title}
      detail={itemCount}
      ariaLabel={`${title}, ${itemCount}${hasAttention ? `, ${attentionLabel.toLowerCase()}` : ''}`}
      index={index}
      active={active}
      iconSrc={iconSrc}
      className="ce-campaign-tab ce-campaign-tab-meta"
      onSelect={onSelect}
      trailing={hasAttention ? (
        <span
          className="ce-tab-trail ce-tab-draft-status"
          data-testid="unassigned-draft-attention"
          title={attentionLabel}
          aria-hidden="true"
        >!</span>
      ) : undefined}
    />
  );
}
