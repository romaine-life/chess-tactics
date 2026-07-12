import { describe, it, expect } from 'vitest';
import {
  flatContactClipRects,
  flatContactSplitPercent,
  propZBracket,
  seatTransformPercent,
  structureSourceSplitMode,
} from './BoardStructure';
import { objectBaseZIndex, structureBackZIndex, structureFrontZIndex } from './sceneDepth';

describe('seatTransformPercent — contact pixel onto the ground point', () => {
  it('the 1×1 doodad (96×180 @ 48,69) reproduces the shipped translate(-50%, -38.333%)', () => {
    const s = seatTransformPercent({ w: 96, h: 180, anchorX: 48, anchorY: 69 });
    expect(s.x).toBeCloseTo(-50, 4);
    expect(s.y).toBeCloseTo(-38.3333, 3); // NOT -61.667 — that complement re-floats every prop/doodad
  });

  it('a 2×2 prop (192×300 @ 96,255) seats centred + low (-50%, -85%)', () => {
    const s = seatTransformPercent({ w: 192, h: 300, anchorX: 96, anchorY: 255 });
    expect(s.x).toBeCloseTo(-50, 4);
    expect(s.y).toBeCloseTo(-85, 4);
  });
});

describe('propZBracket — depth spans the full multi-cell footprint', () => {
  it('a 2×2 at (3,3) spans from back cell (3,3) to front cell (4,4)', () => {
    const z = propZBracket(3, 3, 2, 2);
    expect(z.base).toBe(objectBaseZIndex({ x: 4, y: 4 }));
    expect(z.back).toBe(structureBackZIndex({ x: 3, y: 3 }));
    expect(z.front).toBe(structureFrontZIndex({ x: 4, y: 4 }));
  });

  it('a 1×1 at (3,3) matches the legacy doodad bracket (front cell == anchor)', () => {
    const z = propZBracket(3, 3, 1, 1);
    expect(z.base).toBe(objectBaseZIndex({ x: 3, y: 3 }));
    expect(z.back).toBe(structureBackZIndex({ x: 3, y: 3 }));
    expect(z.front).toBe(structureFrontZIndex({ x: 3, y: 3 }));
  });

  it('side/intermediate cells can sort between a multi-cell prop back and front', () => {
    const z = propZBracket(4, 2, 2, 2);
    const sideRook = objectBaseZIndex({ x: 3, y: 3 });
    expect(z.back).toBeLessThan(sideRook);
    expect(z.front).toBeGreaterThan(sideRook);
  });

  it('the front half always sits above the back half', () => {
    for (const [ax, ay, w, h] of [[0, 0, 2, 2], [5, 2, 2, 1], [1, 7, 1, 2]] as const) {
      const z = propZBracket(ax, ay, w, h);
      expect(z.front).toBeGreaterThan(z.back);
      expect(z.front).toBe(z.base + 1);
    }
  });
});

describe('flat-contact prop splitting', () => {
  it('splits duplicate flat art at the contact anchor', () => {
    expect(flatContactSplitPercent({ h: 176, anchorY: 107 })).toBeCloseTo((107 / 176) * 100, 4);
    expect(flatContactClipRects({ w: 220, h: 176, anchorY: 107 })).toEqual({
      back: { sx: 0, sy: 0, sw: 220, sh: 107 },
      front: { sx: 0, sy: 107, sw: 220, sh: 69 },
    });
  });

  it('uses flat-contact only for flat duplicate prop sources', () => {
    expect(structureSourceSplitMode({ kind: 'asset', id: 'cabin' })).toBe('flat-contact');
    expect(structureSourceSplitMode({ kind: 'asset', id: 'oak' })).toBe('authored');
    expect(structureSourceSplitMode({ kind: 'doodad', id: 'boulder' })).toBe('authored');
  });
});
