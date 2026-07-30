import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkTooltipSource,
  collectCssSurfaceRules,
  collectInlineSurfaceStyles,
  compareSurfaceSnapshots,
} from './check-ui-surface-contract.mjs';

test('surface guard ignores layout but detects CSS-fabricated surfaces', () => {
  assert.deepEqual(collectCssSurfaceRules('.layout { display: grid; padding: 8px; }'), []);
  const entries = collectCssSurfaceRules('.invented { background: #123; border: 1px solid red; box-shadow: 0 2px #000; }');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].selector, '.invented');
});

test('surface guard permits only the approved frameless Strategikon button resets', () => {
  assert.deepEqual(
    collectCssSurfaceRules(`
      .skirmish-hud-title-action {
        background: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      .skirmish-hud-title-action.active {
        background: none;
        border-color: transparent;
        box-shadow: none;
      }
    `),
    [],
  );
  assert.equal(
    collectCssSurfaceRules('.other-button { background: none; border: 0; box-shadow: none; }').length,
    1,
  );
});

test('surface guard permits grouped reliquary triggers to remain unframed', () => {
  assert.deepEqual(
    collectCssSurfaceRules(`
      .enchiridion-relic-grouped-trigger {
        background: none;
        border: 0;
        border-radius: 0;
      }
    `),
    [],
  );
});

test('surface guard detects inline React surface fabrication', () => {
  assert.deepEqual(collectInlineSurfaceStyles('<div style={{ display: "grid" }} />'), []);
  const entries = collectInlineSurfaceStyles('<div style={{ backgroundColor: "#123", border: "1px solid red" }} />');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].selector, '<div style>');
});

test('surface guard rejects new debt relative to an empty baseline', () => {
  const current = {
    entries: collectCssSurfaceRules('.invented { background: #123; }'),
  };
  assert.match(compareSurfaceSnapshots({ entries: [] }, current).join('\n'), /new unregistered surface paint/);
});

test('tooltip role is exclusive to the shared approved-chrome owner', () => {
  assert.match(
    checkTooltipSource('src/ui/Feature.tsx', '<span role="tooltip">No</span>').join('\n'),
    /must be owned/,
  );
  assert.deepEqual(
    checkTooltipSource('src/ui/shared/InfoTip.tsx', '<InnerChromeBox role="tooltip">Yes</InnerChromeBox>'),
    [],
  );
});
