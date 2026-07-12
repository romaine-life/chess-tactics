import { describe, expect, it } from 'vitest';

import {
  CHROME_FAMILY_SURFACE_SELECTOR,
  chromeFamilyRoleSelectors,
  dividerDefault,
  frameCss,
  installedChromeTuningPayload,
  renderedRailThickness,
  roleContentInset,
  roleDefault,
  type DividerRender,
  type FrameRender,
} from './chromeFamilyRuntime';
import { CHROME_LIVE_SLOTS } from './chromeCandidateSources';
import { chromeUnitRoleSelectors, chromeUnitScopedSelectors } from './chromeUnitRegistry';

const frame = (url: string, slice: number): FrameRender => ({
  url,
  slice,
  size: slice * 3,
  atomOverlay: null,
});

const divider: DividerRender = {
  railUrl: 'divider.png',
  railHeight: 12,
  railTileWidth: 24,
  height: 17,
  atomOverlay: null,
};

describe('chrome family geometry ownership (ADR-0083)', () => {
  it('keeps installed media selectors on canonical backend slots', () => {
    expect(roleDefault('outer')).toMatchObject({
      atomSourceId: CHROME_LIVE_SLOTS.outerAtom,
      railSourceId: CHROME_LIVE_SLOTS.outerRail,
    });
    expect(roleDefault('inner')).toMatchObject({
      atomSourceId: CHROME_LIVE_SLOTS.innerAtom,
      railSourceId: CHROME_LIVE_SLOTS.innerRail,
    });
    expect(dividerDefault().atomSourceId).toBe(CHROME_LIVE_SLOTS.dividerJoint);
  });

  it('exports geometry without promoting auditioned version ids into defaults', () => {
    const payload = installedChromeTuningPayload(
      'level-editor',
      { ...roleDefault('outer'), atomSourceId: 'private-atom-version', railSourceId: 'private-rail-version' },
      { ...roleDefault('inner'), atomSourceId: 'private-inner-atom', railSourceId: 'private-inner-rail' },
      { ...dividerDefault(), atomSourceId: 'none' },
    );
    expect(payload.outer).toMatchObject({
      atomSourceId: CHROME_LIVE_SLOTS.outerAtom,
      railSourceId: CHROME_LIVE_SLOTS.outerRail,
    });
    expect(payload.inner).toMatchObject({
      atomSourceId: CHROME_LIVE_SLOTS.innerAtom,
      railSourceId: CHROME_LIVE_SLOTS.innerRail,
    });
    expect(payload.divider.atomSourceId).toBe(CHROME_LIVE_SLOTS.dividerJoint);
  });

  it('keeps derived frame geometry and invisible rail seats out of authored state', () => {
    for (const role of ['outer', 'inner'] as const) {
      const tune = roleDefault(role);
      expect(tune).not.toHaveProperty('frameWidth');
      expect(tune).not.toHaveProperty('railX');
      expect(tune).not.toHaveProperty('railY');
    }
  });

  it('derives rail thickness and contents inset independently', () => {
    expect(renderedRailThickness({ railThickness: 12.4 })).toBe(12);
    expect(renderedRailThickness({ railThickness: 12.6 })).toBe(13);
    expect(renderedRailThickness({ railThickness: 0 })).toBe(1);
    expect(roleContentInset({ contentPadding: 25.4 })).toBe(25);
    expect(roleContentInset({ contentPadding: -8 })).toBe(0);
  });

  it('does not derive the rail, fill box, or contents box from one another', () => {
    const outer = {
      ...roleDefault('outer'),
      railThickness: 12,
      fillBoxLeft: 3,
      contentPadding: 25,
    };
    const inner = roleDefault('inner');
    const css = frameCss(outer, inner, frame('outer.png', 19), frame('inner.png', 5), divider);

    expect(css).toContain('--le-chrome-outer-rail-w: 12px !important;');
    expect(css).toContain('--le-outer-fill-box-left: 3px !important;');
    expect(css).toContain('--le-outer-content-padding: 25px !important;');
    expect(css).toContain('border-image-slice: 19 !important;');
    expect(css).toContain('border-image-width: 12px !important;');
    expect(css).not.toContain('--le-chrome-outer-frame-w');
    expect(css).not.toContain('--le-control-fill-inset');
  });

  it('targets real hierarchy classes and registry legacy selectors on every family surface', () => {
    const outer = roleDefault('outer');
    const inner = roleDefault('inner');
    const selectors = chromeFamilyRoleSelectors('inner');
    const css = frameCss(outer, inner, frame('outer.png', 19), frame('inner.png', 5), divider);

    expect(selectors).toBe(chromeUnitScopedSelectors(
      CHROME_FAMILY_SURFACE_SELECTOR,
      chromeUnitRoleSelectors('inner'),
    ));
    expect(selectors.split(',\n')[0]).toBe(`${CHROME_FAMILY_SURFACE_SELECTOR} .inner-box`);
    expect(selectors).toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} .settings-toggle`);
    expect(selectors).toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} .le-md-item`);
    expect(css).toContain(`${selectors} {`);
    expect(CHROME_FAMILY_SURFACE_SELECTOR).toContain('.chrome-family-surface');
    expect(css).toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} .inner-box:is(.active, .is-active, [aria-pressed="true"])`);
    expect(css).toContain('border-image-source: var(--skirmish-chrome-inner-control-active-image) !important;');
    expect(css).toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} .inner-box.danger`);
    expect(css).toContain('border-image-source: var(--skirmish-chrome-inner-control-danger-image) !important;');
  });
});
