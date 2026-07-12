import { describe, expect, it } from 'vitest';

import {
  frameCss,
  renderedRailThickness,
  roleContentInset,
  roleDefault,
  type DividerRender,
  type FrameRender,
} from './chromeFamilyRuntime';

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
});
