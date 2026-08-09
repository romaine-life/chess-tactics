import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsButton, SettingsRow } from './SettingsControls';
import { CHROME_LEAF_FILL_SURFACE, CHROME_STRUCTURAL_FILL_ROLE } from './chromeSurfacePolicy';

describe('Settings controls', () => {
  it('forwards an interface sound cue to its canonical button', () => {
    const markup = renderToStaticMarkup(<SettingsButton data-ui-sfx="gold">Grant</SettingsButton>);

    expect(markup).toContain('data-ui-sfx="gold"');
  });

  // ADR-0433's two materials are carried by the primitives, not chosen per call site: this is
  // what stops a settings-family surface drifting back into tinted voids holding unpainted
  // buttons. A row is a structural box (marble); a button is a leaf (oak).
  it('paints a row with the structural marble and a button with the leaf oak by default', () => {
    const row = renderToStaticMarkup(
      <SettingsRow title="Studio" description="The creator workspace.">
        <SettingsButton href="/studio">Open</SettingsButton>
      </SettingsRow>,
    );

    expect(row).toContain(`data-chrome-fill-role="${CHROME_STRUCTURAL_FILL_ROLE}"`);
    expect(row).toContain(`data-chrome-fill-surface="${CHROME_LEAF_FILL_SURFACE}"`);
  });

  // The defaults are a policy, not a lock: a surface with a stated material exception still
  // names its own. (The named surface here only has to reach the DOM — which installed
  // surfaces exist is the live catalog's answer, not this test's.)
  it('still lets a call site name a different material', () => {
    const markup = renderToStaticMarkup(
      <SettingsRow title="Now playing" fillRole="inner">
        <SettingsButton fillSurface="some-other-installed-surface">Stop</SettingsButton>
      </SettingsRow>,
    );

    expect(markup).toContain('data-chrome-fill-role="inner"');
    expect(markup).toContain('data-chrome-fill-surface="some-other-installed-surface"');
    expect(markup).not.toContain(`data-chrome-fill-surface="${CHROME_LEAF_FILL_SURFACE}"`);
  });
});
