// A structure asset can carry BOTH the authored back/front halves a placed prop is drawn from
// and an eight-way source-artwork turntable whose `south-*` view is a different render at a
// different frame size. The seat document's contact anchor and render scale are calibrated
// against the authored frame, so letting the turntable displace it reseats and resizes every
// placed prop at once. These tests pin the two lanes apart.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyDrawableCatalog,
  resetDrawableCatalog,
  structureArtAsset,
  structureArtDirectionHalfSrc,
  structureArtDirectionRasterDimensions,
  structureArtDirectionSprite,
  structureArtHalfSrc,
  structureRasterDimensions,
  type DrawableCatalog,
} from '@chess-tactics/board-render';

const descriptor = (name: string, width: number, height: number) => {
  const sha256 = name.split('').reduce((hash, character) => (
    Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  ), 2166136261).toString(16).padStart(8, '0').repeat(8);
  return {
    slot: name,
    media: {
      url: `/assets/${name}`,
      immutableUrl: `/api/media/${sha256}`,
      sha256,
      mediaType: 'image/png',
      byteLength: 512,
      width,
      height,
    },
  };
};

const AUTHORED = { w: 192, h: 300 };
const TURNTABLE = { w: 512, h: 512 };

function catalog(): DrawableCatalog {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: null,
    assets: [
      {
        id: 'structure-oak',
        kind: 'structure',
        label: 'Oak tree art',
        sortOrder: 0,
        lifecycleState: 'active',
        behavior: {
          value: 'oak',
          structureKind: 'tree',
          terrains: ['grass'],
          blocking: true,
          anchorX: 96,
          anchorY: 255,
          scale: 1,
          splitMode: 'authored',
          footprint: { w: 2, h: 2 },
        },
        metadata: {},
        rowRevision: 1,
        media: {
          back: descriptor('props/oak/back.png', AUTHORED.w, AUTHORED.h),
          front: descriptor('props/oak/front.png', AUTHORED.w, AUTHORED.h),
          'south-back': descriptor('source-art/oak/south.png', TURNTABLE.w, TURNTABLE.h),
          'south-front': descriptor('source-art/oak/south.png', TURNTABLE.w, TURNTABLE.h),
          'east-back': descriptor('source-art/oak/east.png', TURNTABLE.w, TURNTABLE.h),
          'east-front': descriptor('source-art/oak/east.png', TURNTABLE.w, TURNTABLE.h),
        },
      },
      {
        id: 'structure-castle',
        kind: 'structure',
        label: 'Castle',
        sortOrder: 1,
        lifecycleState: 'active',
        behavior: {
          value: 'castle',
          structureKind: 'landmark',
          sourceOnly: true,
          anchorX: 256,
          anchorY: 256,
          scale: 0.45,
          splitMode: 'flat-contact',
        },
        metadata: {},
        rowRevision: 1,
        media: {
          'south-back': descriptor('source-art/castle/south.png', TURNTABLE.w, TURNTABLE.h),
          'south-front': descriptor('source-art/castle/south.png', TURNTABLE.w, TURNTABLE.h),
        },
      },
    ],
  };
}

beforeAll(() => { applyDrawableCatalog(catalog()); });
afterAll(() => { resetDrawableCatalog(); });

describe('installed structure art versus source-artwork turntables', () => {
  it('draws an installed prop from its authored halves even when a south turntable exists', () => {
    const authoredBack = catalog().assets[0].media.back.media.immutableUrl;
    const authoredFront = catalog().assets[0].media.front.media.immutableUrl;
    expect(structureArtHalfSrc('oak', 'back')).toBe(authoredBack);
    expect(structureArtHalfSrc('oak', 'front')).toBe(authoredFront);
  });

  it('keeps the seat frame the authored frame, so anchor and scale stay calibrated', () => {
    expect(structureRasterDimensions('oak')).toEqual(AUTHORED);
    const sprite = structureArtAsset('oak')!.sprite;
    expect({ w: sprite.w, h: sprite.h }).toEqual(AUTHORED);
    // The contact anchor is a fraction of the frame; the authored frame is what makes it a
    // ground-centre seat rather than an arbitrary point inside a larger render.
    expect(sprite.anchorX / sprite.w).toBeCloseTo(0.5, 5);
  });

  it('still resolves the turntable through the directional source-artwork lane', () => {
    expect(structureArtDirectionRasterDimensions('oak', 'south')).toEqual(TURNTABLE);
    const south = structureArtDirectionSprite('oak', 'south')!;
    expect({ w: south.w, h: south.h }).toEqual(TURNTABLE);
    expect(structureArtDirectionHalfSrc('oak', 'south', 'front'))
      .toBe(catalog().assets[0].media['south-front'].media.immutableUrl);
    expect(structureArtDirectionHalfSrc('oak', 'east', 'front'))
      .toBe(catalog().assets[0].media['east-front'].media.immutableUrl);
  });

  it('falls back to the south view for a source-only asset that has no authored halves', () => {
    expect(structureRasterDimensions('castle')).toEqual(TURNTABLE);
    expect(structureArtHalfSrc('castle', 'front'))
      .toBe(catalog().assets[1].media['south-front'].media.immutableUrl);
  });
});
