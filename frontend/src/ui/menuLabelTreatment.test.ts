import { describe, it, expect } from 'vitest';
import { labelTreatmentDecls, outlineNeedsClipRelief, type LabelTreatment } from './PagesLibraryStudio';
import { MM_LABEL_LIVE } from './dressing/mmLive';

// The dressing-room principle: an untouched panel must emit NOTHING, so the preview is the real
// menu rather than a re-statement of it that has already started to drift. Everything else here
// guards the one bit of real logic in the label tuner — that a `text-shadow`-based outline and the
// drop shadow share one property and therefore have to be composed, not written twice.

const live: LabelTreatment = { ...MM_LABEL_LIVE };
const tune = (patch: Partial<LabelTreatment>): LabelTreatment => ({ ...live, ...patch });

describe('menu label text treatment', () => {
  it('emits nothing at the shipped baseline', () => {
    expect(labelTreatmentDecls(live)).toEqual([]);
  });

  it('emits nothing when an outline is armed but its width is still zero', () => {
    expect(labelTreatmentDecls(tune({ outline: 'ring' }))).toEqual([]);
    expect(labelTreatmentDecls(tune({ outline: 'stroke' }))).toEqual([]);
  });

  it('pixel ring: eight hard copies that KEEP the shipped drop shadow', () => {
    const [shadow, ...rest] = labelTreatmentDecls(tune({ outline: 'ring', strokeW: 1, strokeColor: '#101820' }));
    expect(rest).toEqual([]); // a ring is text-shadow only — no stroke properties
    const parts = shadow.replace('text-shadow: ', '').split(', ');
    expect(parts).toHaveLength(9); // 8 ring copies + the drop shadow
    expect(parts.slice(0, 8).every((p) => p.endsWith('#101820') && p.includes(' 0 '))).toBe(true);
    // The drop shadow survives the ring — writing the ring alone would silently delete it.
    expect(parts[8]).toBe('0 2px 0 #02070b');
  });

  it('ring width is whole pixels even when the slider carries a half step', () => {
    const shadow = labelTreatmentDecls(tune({ outline: 'ring', strokeW: 2.5 }))[0];
    expect(shadow).toContain('3px');
    expect(shadow).not.toContain('2.5px');
  });

  it('stroke: a real stroke, with paint-order so the fill is repainted over it', () => {
    const decls = labelTreatmentDecls(tune({ outline: 'stroke', strokeW: 1.5, strokeColor: '#101820' }));
    expect(decls).toContain('-webkit-text-stroke: 1.5px #101820');
    expect(decls).toContain('paint-order: stroke fill');
    // Stroke alone does not touch the shadow, so the shipped one stays as-is.
    expect(decls.some((d) => d.startsWith('text-shadow'))).toBe(false);
  });

  it('a fully zeroed shadow removes it rather than emitting an invisible no-op', () => {
    expect(labelTreatmentDecls(tune({ shadowX: 0, shadowY: 0, shadowBlur: 0 }))).toEqual(['text-shadow: none']);
  });

  it('a moved shadow is emitted with CSS shorthand zeroes', () => {
    expect(labelTreatmentDecls(tune({ shadowY: 3, shadowBlur: 2 }))).toEqual(['text-shadow: 0 3px 2px #02070b']);
  });
});

// The label box clips both axes and the glyph ink starts flush against its left edge (measured
// slack: 0px), so ink painted outside is cut down the left of every word. Relief must ride with
// the outline — an outline emitted without it is an outline you cannot judge.
describe('outline clip relief', () => {
  it('is required by any armed outline, of either kind', () => {
    expect(outlineNeedsClipRelief(tune({ outline: 'ring', strokeW: 1 }))).toBe(true);
    expect(outlineNeedsClipRelief(tune({ outline: 'stroke', strokeW: 0.5 }))).toBe(true);
  });

  it('is NOT applied when there is no ink outside the box', () => {
    // The shipped drop shadow lands inside the line box, so hidden stays correct — relief is not
    // a blanket "lift the clip", it is scoped to the case that needs it.
    expect(outlineNeedsClipRelief(live)).toBe(false);
    expect(outlineNeedsClipRelief(tune({ shadowY: 4, shadowBlur: 3 }))).toBe(false);
    expect(outlineNeedsClipRelief(tune({ outline: 'ring', strokeW: 0 }))).toBe(false);
  });
});
