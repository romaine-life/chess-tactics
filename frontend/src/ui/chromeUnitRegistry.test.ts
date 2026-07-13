import { describe, expect, it } from 'vitest';

import {
  chromeUnitById,
  chromeUnitClassNames,
  chromeUnitClassPath,
  chromeUnitRoleSelectors,
  chromeUnitScopedSelectors,
} from './chromeUnitRegistry';

describe('chrome unit DOM hierarchy', () => {
  it('returns ancestor and leaf classes before filtered legacy extras', () => {
    expect(chromeUnitClassNames(
      'inner-plus-key',
      'settings-chrome-button',
      false,
      'active settings-chrome-button',
      null,
      undefined,
    )).toBe('inner-box locked-height-rectangle tool-square plus-key settings-chrome-button active');
  });

  it('registers chevron keys as a concrete square implementation with mirrored direction variants', () => {
    const chevron = chromeUnitById('inner-chevron-key');

    expect(chromeUnitClassPath(chevron)).toBe('inner-box.locked-height-rectangle.tool-square.chevron-key');
    expect(chevron.parentId).toBe('inner-tool-square');
    expect(chevron.catalogKind).toBe('implementation');
    expect(chevron.contentPolicy).toBe('fixed');
    expect(chevron.stateModel).toBe('disabled-capable');
    expect(chevron.selectors).toEqual(expect.arrayContaining([
      '.le-layer-stepper-button.settings-chrome-button',
      '[data-chrome-unit="inner-chevron-key"]',
    ]));
    expect(chevron.variants?.map((variant) => variant.name)).toEqual(['previous', 'next']);
    expect(chromeUnitClassNames('inner-chevron-key', 'settings-chrome-button'))
      .toBe('inner-box locked-height-rectangle tool-square chevron-key settings-chrome-button');
  });

  it('registers toggles and list rows as locked inner controls', () => {
    const toggle = chromeUnitById('inner-toggle');
    const listRow = chromeUnitById('inner-list-row');

    expect(chromeUnitClassPath(toggle)).toBe('inner-box.locked-height-rectangle.toggle');
    expect(toggle.selectors).toEqual(expect.arrayContaining([
      '.settings-toggle',
      '[data-chrome-unit="inner-toggle"]',
    ]));
    expect(chromeUnitClassPath(listRow)).toBe('inner-box.locked-height-rectangle.list-row');
    expect(listRow.selectors).toEqual(expect.arrayContaining([
      '.le-md-item',
      '.palette-select-option',
      '[data-chrome-unit="inner-list-row"]',
    ]));
    expect(listRow.selectors).not.toContain('.house-select-option');
  });

  it('registers asset swatches as free-form children of the inner role', () => {
    const swatch = chromeUnitById('inner-asset-swatch');

    expect(chromeUnitClassPath(swatch)).toBe('inner-box.asset-swatch');
    expect(swatch.dimensionPolicy).toBe('free-form');
    expect(swatch.selectors).toEqual(expect.arrayContaining([
      '.le-swatch',
      '[data-chrome-unit="inner-asset-swatch"]',
    ]));
  });

  it('frames the dropdown wrapper without framing its native select child', () => {
    const dropdown = chromeUnitById('inner-dropdown');

    expect(dropdown.selectors).toEqual(expect.arrayContaining([
      '.le-select-wrap',
      '[data-chrome-unit="inner-dropdown"]',
    ]));
    expect(dropdown.selectors).not.toContain('.le-layer-select');
  });

  it('makes the real role-root class primary and unions registered legacy selectors', () => {
    const selectors = chromeUnitRoleSelectors('inner');

    expect(selectors[0]).toBe('.inner-box');
    expect(selectors).toEqual(expect.arrayContaining([
      '.le-status-current',
      '.le-seg-btn',
      '.settings-toggle',
      '.le-md-item',
      '.palette-select-option',
      '.le-swatch',
      '.le-gen-cover-caret-btn',
      '.le-select-wrap',
    ]));
    expect(new Set(selectors).size).toBe(selectors.length);
    expect(selectors).not.toContain('.house-select-option');
    expect(chromeUnitScopedSelectors('.chrome-scope', selectors).split(',\n')[0])
      .toBe('.chrome-scope .inner-box');
  });

  it('makes inner boxes owner-operable divided containers', () => {
    const innerBox = chromeUnitById('inner-box');

    expect(innerBox.controlPolicy).toBe('width-height-dividers');
    expect(innerBox.contentPolicy).toBe('slot');
    expect(innerBox.defaultDividers).toBeGreaterThan(0);
    expect(innerBox.maxDividers).toBeGreaterThanOrEqual(5);
  });
});
