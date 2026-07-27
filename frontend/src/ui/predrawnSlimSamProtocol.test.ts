import { describe, expect, it } from 'vitest';
import {
  PREDRAWN_SLIMSAM_CANDIDATE_COUNT,
  PredrawnSlimSamError,
  createPredrawnSlimSamMaskCandidates,
  resolvePredrawnSlimSamImageUrl,
  validatePredrawnSlimSamPoints,
} from './predrawnSlimSamProtocol';

describe('SlimSAM native mask candidates', () => {
  it('splits all three native-size NCHW masks and recommends the highest score', () => {
    const built = createPredrawnSlimSamMaskCandidates({
      dims: [1, PREDRAWN_SLIMSAM_CANDIDATE_COUNT, 2, 3],
      data: new Uint8Array([
        0, 1, 0, 1, 0, 1,
        1, 1, 0, 0, 1, 0,
        0, 0, 1, 1, 1, 1,
      ]),
    }, new Float32Array([0.25, 0.91, 0.6]), 3, 2);

    expect(built.recommendedIndex).toBe(1);
    expect(built.candidates).toHaveLength(3);
    expect([...built.candidates[0].alpha]).toEqual([0, 255, 0, 255, 0, 255]);
    expect([...built.candidates[1].alpha]).toEqual([255, 255, 0, 0, 255, 0]);
    expect([...built.candidates[2].alpha]).toEqual([0, 0, 255, 255, 255, 255]);
    expect(built.candidates.map(({ index, score }) => ({ index, score }))).toEqual([
      { index: 0, score: expect.closeTo(0.25) },
      { index: 1, score: expect.closeTo(0.91) },
      { index: 2, score: expect.closeTo(0.6) },
    ]);
  });

  it('fails instead of stretching a model mask with the wrong dimensions', () => {
    expect(() => createPredrawnSlimSamMaskCandidates({
      dims: [1, 3, 2, 2],
      data: new Uint8Array(12),
    }, new Float32Array([0.1, 0.2, 0.3]), 3, 2)).toThrowError(
      /returned 1×3×2×2 mask dimensions for a 3×2 raster/i,
    );
  });

  it('fails if the model does not return all three candidates and scores', () => {
    expect(() => createPredrawnSlimSamMaskCandidates({
      dims: [1, 2, 2, 2],
      data: new Uint8Array(8),
    }, new Float32Array([0.1, 0.2]), 2, 2)).toThrowError(
      /exactly 3 mask candidates and scores/i,
    );
  });
});

describe('SlimSAM source-image privacy boundary', () => {
  it('resolves the exact raster only within the app origin', () => {
    expect(resolvePredrawnSlimSamImageUrl(
      '/api/editor-documents/document-a/background-versions/warped-a/content',
      'http://127.0.0.1:5173/app-code/predrawnSlimSam.worker.js',
    )).toBe(
      'http://127.0.0.1:5173/api/editor-documents/document-a/background-versions/warped-a/content',
    );
    expect(() => resolvePredrawnSlimSamImageUrl(
      'https://example.test/warped.png',
      'http://127.0.0.1:5173/app-code/predrawnSlimSam.worker.js',
    )).toThrowError(/only same-origin warped artwork/i);
  });
});

describe('SlimSAM native prompt validation', () => {
  it('accepts positive and negative native-pixel points inside the source raster', () => {
    expect(() => validatePredrawnSlimSamPoints([
      { x: 0, y: 0, label: 'positive' },
      { x: 1667.5, y: 940.5, label: 'negative' },
    ], 1672, 941)).not.toThrow();
  });

  it('rejects empty and outside-raster prompt sets with actionable codes', () => {
    let emptyError: unknown;
    try {
      validatePredrawnSlimSamPoints([], 1672, 941);
    } catch (error) {
      emptyError = error;
    }
    expect(emptyError).toBeInstanceOf(PredrawnSlimSamError);
    expect(emptyError).toMatchObject({ code: 'invalid-points' });
    expect((emptyError as Error).message).toMatch(/at least one include or exclude point/i);

    expect(() => validatePredrawnSlimSamPoints([
      { x: 1672, y: 10, label: 'positive' },
    ], 1672, 941)).toThrowError(/outside the 1672×941 source raster/i);
  });
});
