import type { ReactElement } from 'react';
import { ApparatusRailTab } from './ApparatusRailTab';
import { EditorRowIcon } from './EditorLevelRow';

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
  opensAddress,
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
  /**
   * Where this collection's panel lives. Required, because these tabs navigate from `onSelect`
   * rather than by being links, and without the address the open mark can only follow the
   * committed scene — which lands a crossfade after the press.
   */
  opensAddress: string;
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
      opensAddress={opensAddress}
      iconSrc={iconSrc}
      className="ce-campaign-tab ce-campaign-tab-meta"
      onSelect={onSelect}
            // The installed save mark, not a typed "!". A mark on this rail is carved art like every
      // other one, and the exclamation was a keyboard character wearing a CSS glow.
      trailing={hasAttention ? (
        <span
          className="ce-tab-trail ce-tab-draft-status"
          data-testid="unassigned-draft-attention"
          title={attentionLabel}
          aria-hidden="true"
        ><EditorRowIcon icon="save" /></span>
      ) : undefined}
    />
  );
}
