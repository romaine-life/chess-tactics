import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsButton } from './SettingsControls';

describe('Settings controls', () => {
  it('forwards an interface sound cue to its canonical button', () => {
    const markup = renderToStaticMarkup(<SettingsButton data-ui-sfx="gold">Grant</SettingsButton>);

    expect(markup).toContain('data-ui-sfx="gold"');
  });
});
