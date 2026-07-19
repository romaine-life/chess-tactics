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

const outerDivider: DividerRender = {
  railUrl: 'divider.png',
  railHeight: 12,
  railTileWidth: 24,
  height: 34,
  atomOverlay: null,
};
const innerDivider: DividerRender = {
  railUrl: 'inner-divider.png',
  railHeight: 5,
  railTileWidth: 10,
  height: 7,
  atomOverlay: null,
};
const dividers = { outer: outerDivider, inner: innerDivider };

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
    expect(dividerDefault('outer')).toMatchObject({
      atomSourceId: CHROME_LIVE_SLOTS.dividerJoint,
      bandHeight: 34,
    });
    expect(dividerDefault('inner')).toMatchObject({
      atomSourceId: CHROME_LIVE_SLOTS.dividerJoint,
      bandHeight: 7,
      atomX: 3.5,
      atomLeftX: -0.5,
    });
  });

  it('exports geometry without promoting auditioned version ids into defaults', () => {
    const payload = installedChromeTuningPayload(
      'level-editor',
      { ...roleDefault('outer'), atomSourceId: 'private-atom-version', railSourceId: 'private-rail-version' },
      { ...roleDefault('inner'), atomSourceId: 'private-inner-atom', railSourceId: 'private-inner-rail' },
      {
        outer: { ...dividerDefault('outer'), atomSourceId: 'private-divider-version' },
        inner: { ...dividerDefault('inner'), atomSourceId: 'none' },
      },
    );
    expect(payload.outer).toMatchObject({
      atomSourceId: CHROME_LIVE_SLOTS.outerAtom,
      railSourceId: CHROME_LIVE_SLOTS.outerRail,
    });
    expect(payload.inner).toMatchObject({
      atomSourceId: CHROME_LIVE_SLOTS.innerAtom,
      railSourceId: CHROME_LIVE_SLOTS.innerRail,
    });
    expect(payload.dividers.outer.atomSourceId).toBe(CHROME_LIVE_SLOTS.dividerJoint);
    expect(payload.dividers.inner.atomSourceId).toBe('none');
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
    const css = frameCss(outer, inner, frame('outer.png', 19), frame('inner.png', 5), dividers);

    expect(css).toContain('--le-chrome-outer-rail-w: 12px !important;');
    expect(css).toContain('--le-outer-fill-box-left: 3px !important;');
    expect(css).toContain('--le-outer-content-padding: 25px !important;');
    expect(css).toContain('--le-panel-title-align-extra-x: calc(-1 * var(--ds-space-3)) !important;');
    expect(css).toContain('border-image-slice: 19 !important;');
    expect(css).toContain('border-image-width: 12px !important;');
    expect(css).not.toContain('--le-chrome-outer-frame-w');
    expect(css).not.toContain('--le-control-fill-inset');
  });

  it('exports atom overhang only as paint-safe clip geometry', () => {
    const outer = roleDefault('outer');
    const inner = roleDefault('inner');
    const innerFrame: FrameRender = {
      ...frame('inner.png', 5),
      atomOverlay: {
        tl: 'tl.png',
        tr: 'tr.png',
        bl: 'bl.png',
        br: 'br.png',
        size: 11,
        outset: 23,
        leftX: -8,
        rightX: -7,
        topY: -8,
        bottomY: -8,
      },
    };
    const dividerRenders = {
      ...dividers,
      inner: {
        ...innerDivider,
        atomOverlay: {
          left: 'left-joint.png',
          right: 'right-joint.png',
          width: 11,
          height: 11,
          outset: 18,
          leftX: -2.5,
          rightX: -2,
          leftY: -2,
          rightY: -2,
        },
      },
    };
    const css = frameCss(outer, inner, frame('outer.png', 19), innerFrame, dividerRenders);

    expect(css).toContain('--le-inner-atom-left-overhang: 8px !important;');
    expect(css).toContain('--le-inner-atom-right-overhang: 7px !important;');
    expect(css).toContain('--le-inner-atom-top-overhang: 8px !important;');
    expect(css).toContain('--le-inner-atom-bottom-overhang: 8px !important;');
    expect(css).toContain('--le-inner-divider-atom-left-overhang: 2.5px !important;');
    expect(css).toContain('--le-inner-divider-atom-right-overhang: 2px !important;');
    expect(css).not.toContain('atom-left-footprint');
    expect(css).not.toContain('atom-right-footprint');
    expect(css).not.toContain('visible-content');
    expect(css).toContain('overflow: visible !important;');
    expect(css).toContain('position: absolute;');
    expect(css).toContain('inset: -23px;');
  });

  it('lets viewport-edge control dividers flow offscreen without a floating right joint', () => {
    const outer = roleDefault('outer');
    const inner = roleDefault('inner');
    const dividerRenders = {
      ...dividers,
      outer: {
        ...outerDivider,
        atomOverlay: {
          left: 'left-joint.png',
          right: 'right-joint.png',
          width: 24,
          height: 24,
          outset: 12,
          leftX: -4,
          rightX: -4,
          leftY: -3,
          rightY: -3,
        },
      },
    };
    const css = frameCss(outer, inner, frame('outer.png', 19), frame('inner.png', 5), dividerRenders);
    const viewportEdgeSelector = ':root:has(.app-titlebar.chrome-rails-offscreen) :is(.level-editor-screen, .skirmish-screen, .chrome-family-surface) .le-outer-panel:is([data-chrome-consumer="level-editor-controls"], [data-chrome-consumer="skirmish-hud"]) [data-chrome-divider-role="outer"]::after';
    const viewportEdgeRuleStart = css.indexOf(`${viewportEdgeSelector} {`);
    const viewportEdgeRule = css.slice(viewportEdgeRuleStart, css.indexOf('}', viewportEdgeRuleStart) + 1);

    expect(css).toContain('background-image: url("left-joint.png"), url("right-joint.png");');
    expect(viewportEdgeRuleStart).toBeGreaterThanOrEqual(0);
    expect(viewportEdgeRule).toContain('background-image: url("left-joint.png");');
    expect(viewportEdgeRule).not.toContain('right-joint.png');
    expect(css).toMatch(/\[data-chrome-divider-role="outer"\]::before \{[\s\S]*?left: 0;[\s\S]*?right: 0;/);
  });

  it('targets real hierarchy classes and registry legacy selectors on every family surface', () => {
    const outer = roleDefault('outer');
    const inner = roleDefault('inner');
    const selectors = chromeFamilyRoleSelectors('inner');
    const css = frameCss(outer, inner, frame('outer.png', 19), frame('inner.png', 5), dividers);

    expect(selectors).toBe(chromeUnitScopedSelectors(
      CHROME_FAMILY_SURFACE_SELECTOR,
      chromeUnitRoleSelectors('inner'),
    ));
    expect(selectors.split(',\n')[0]).toBe(`${CHROME_FAMILY_SURFACE_SELECTOR} .inner-box`);
    expect(selectors).toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} .settings-toggle`);
    expect(selectors).toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} .le-md-item`);
    expect(selectors.split(',\n')).not.toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} .le-layer-select`);
    expect(css).toContain(`${selectors} {`);
    expect(CHROME_FAMILY_SURFACE_SELECTOR).toContain('.chrome-family-surface');
    expect(css).toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} .inner-box:is(.active, .is-active, [aria-pressed="true"])`);
    expect(css).toContain('border-image-source: var(--skirmish-chrome-inner-control-active-image) !important;');
    expect(css).toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} .inner-box.danger`);
    expect(css).toContain('border-image-source: var(--skirmish-chrome-inner-control-danger-image) !important;');
    expect(css).toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} [data-chrome-divider-role="outer"]`);
    expect(css).toContain(`${CHROME_FAMILY_SURFACE_SELECTOR} [data-chrome-divider-role="inner"]`);
    expect(css).toContain('.app-titlebar.chrome-family-surface::before');
    expect(css).toContain('.app-titlebar-persistent-divider::before');
    expect(css).toContain('--kit-divider-reach: 31px;');
    expect(css).toContain('--kit-divider-reach: 7px;');
    expect(css).toContain('height: 34px !important;');
    expect(css).toContain('height: 7px !important;');
  });
});
