import type { ReactElement } from 'react';
import { chromeUnitClassNames } from '../chromeUnitRegistry';

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
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title}, ${itemCount}${hasAttention ? `, ${attentionLabel.toLowerCase()}` : ''}`}
      aria-current={active ? 'page' : undefined}
      style={{ ['--tab-index' as string]: index }}
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'settings-tab main-menu-mode-tab ce-campaign-tab ce-campaign-tab-meta', active && 'is-active')}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="settings-tab-icon" aria-hidden="true">
        <img src={iconSrc} alt="" />
      </span>
      <span className="ce-campaign-tab-copy">
        <strong>{title}</strong>
        <small>{itemCount}</small>
      </span>
      {hasAttention ? (
        <span
          className="ce-tab-trail ce-tab-draft-status"
          data-testid="unassigned-draft-attention"
          title={attentionLabel}
          aria-hidden="true"
        >!</span>
      ) : null}
    </div>
  );
}
