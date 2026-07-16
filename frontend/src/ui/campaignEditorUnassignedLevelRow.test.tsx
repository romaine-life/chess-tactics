import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import { UnassignedLevelRow } from './CampaignEditor';

const level = createBlankLevel('l7', 'Standalone map');
const callbacks = {
  onSelect: () => undefined,
  onDelete: () => undefined,
};

describe('Campaign Editor unassigned level row', () => {
  it('offers edit and delete without campaign-order controls when the level is manageable', () => {
    const markup = renderToStaticMarkup(
      <UnassignedLevelRow
        level={level}
        index={0}
        active
        canManage
        editHref="/editor/level?levelId=l7"
        {...callbacks}
      />,
    );

    expect(markup).not.toContain('<div role="button"');
    expect(markup).toContain('data-chrome-unit="inner-box" class="inner-box settings-row ce-editor-level-row active is-selected is-neutral"');
    expect(markup).toContain('aria-label="Preview Standalone map"');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('role="group" aria-label="Actions for Standalone map"');
    expect(markup).toContain('aria-label="Edit board for Standalone map"');
    expect(markup).toContain('aria-label="Delete saved level Standalone map"');
    expect(markup).not.toContain('Move Standalone map up');
    expect(markup).not.toContain('Move Standalone map down');
  });

  it('does not expose mutating controls while the level tier is unavailable', () => {
    const markup = renderToStaticMarkup(
      <UnassignedLevelRow
        level={level}
        index={0}
        active={false}
        canManage={false}
        editHref="/editor/level?levelId=l7"
        {...callbacks}
      />,
    );

    expect(markup).toContain('data-chrome-unit="inner-box" class="inner-box settings-row ce-editor-level-row is-read-only is-neutral"');
    expect(markup).toContain('aria-label="Preview Standalone map"');
    expect(markup).not.toContain('role="group"');
    expect(markup).not.toContain('Edit board for Standalone map');
    expect(markup).not.toContain('Delete saved level Standalone map');
  });

});
