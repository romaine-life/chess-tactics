import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RunActionIcon, RUN_ACTION_ICON_SLOT, RUN_ACTION_MEDIA_ROLE } from './RunActionIcon';

describe('RunActionIcon', () => {
  it('names one slot and one app-ui role per action, so two seats cannot drift', () => {
    expect(RUN_ACTION_MEDIA_ROLE.athetize).toBe('ui-kit-icons-game-athetize-png');
    expect(RUN_ACTION_ICON_SLOT.athetize).toBe('ui/kit/icons/game/athetize.png');
  });

  it('reserves the seat when no art decision exists yet', () => {
    const markup = renderToStaticMarkup(<RunActionIcon variant="athetize" src={undefined} />);
    expect(markup).toContain('data-run-action-icon="athetize"');
    expect(markup).toContain('is-unavailable');
    expect(markup).not.toContain('<img');
  });

  it('draws the candidate a review hands it without touching the installed role', () => {
    const markup = renderToStaticMarkup(
      <RunActionIcon variant="athetize" src="/api/admin/media/abc" />,
    );
    expect(markup).toContain('src="/api/admin/media/abc"');
    expect(markup).not.toContain('is-unavailable');
  });
});
