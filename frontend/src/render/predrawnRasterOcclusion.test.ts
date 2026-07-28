import { describe, expect, it } from 'vitest';
import {
  decodePredrawnOcclusionDepth,
  type EditorBoard,
} from '@chess-tactics/board-render';
import {
  generatePredrawnRasterSelectionOcclusion,
  predrawnRasterSelectionDepthPixels,
} from './predrawnRasterOcclusion';

function depthAt(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const offset = ((y * width) + x) * 4;
  return decodePredrawnOcclusionDepth(
    data[offset],
    data[offset + 1],
    data[offset + 2],
  );
}

describe('predrawnRasterSelectionDepthPixels', () => {
  it('keeps every vertical pixel at its component column ground-contact depth', () => {
    const alpha = new Uint8Array([
      0, 255, 0,
      0, 128, 0,
      0, 255, 0,
    ]);
    const result = predrawnRasterSelectionDepthPixels({
      alpha,
      width: 3,
      height: 3,
      worldBounds: { minX: 0, minY: 0, width: 3, height: 81 },
    });

    expect(result.componentCount).toBe(1);
    expect(result.opaquePixelCount).toBe(3);
    expect(depthAt(result.data, 3, 1, 0)).toBe(depthAt(result.data, 3, 1, 2));
    expect(result.data[((1 * 3) + 1) * 4 + 3]).toBe(128);
  });

  it('advances a diagonal component independently in each occupied image column', () => {
    const alpha = new Uint8Array([
      255, 0, 0,
      0, 255, 0,
      0, 0, 255,
    ]);
    const result = predrawnRasterSelectionDepthPixels({
      alpha,
      width: 3,
      height: 3,
      worldBounds: { minX: 0, minY: 0, width: 3, height: 81 },
    });

    expect(result.componentCount).toBe(1);
    expect(depthAt(result.data, 3, 0, 0))
      .toBeLessThan(depthAt(result.data, 3, 1, 1));
    expect(depthAt(result.data, 3, 1, 1))
      .toBeLessThan(depthAt(result.data, 3, 2, 2));
  });

  it('does not let a nearer disconnected object change another object in the same column', () => {
    const alpha = new Uint8Array([
      255,
      0,
      0,
      255,
    ]);
    const result = predrawnRasterSelectionDepthPixels({
      alpha,
      width: 1,
      height: 4,
      worldBounds: { minX: 0, minY: 0, width: 1, height: 108 },
    });

    expect(result.componentCount).toBe(2);
    expect(depthAt(result.data, 1, 0, 0))
      .toBeLessThan(depthAt(result.data, 1, 0, 3));
  });

  it('rejects mismatched alpha dimensions', () => {
    expect(() => predrawnRasterSelectionDepthPixels({
      alpha: new Uint8Array(3),
      width: 2,
      height: 2,
      worldBounds: { minX: 0, minY: 0, width: 2, height: 2 },
    })).toThrow('alpha pixels');
  });

  it('deterministically records the exact owner selection and advisory backend', async () => {
    const board = {
      cols: 1,
      rows: 1,
      cells: {},
      units: {},
      doodads: {},
      props: {},
      cover: {},
      coverTypes: {},
      features: {},
      featureCuts: {},
      featureExits: {},
    } as unknown as EditorBoard;
    const input = {
      board,
      alpha: new Uint8Array([255, 0, 0, 255]),
      frameWidth: 2,
      frameHeight: 2,
      worldBounds: { minX: 0, minY: 0, width: 2, height: 54 },
      sourceBackgroundVersionId: 'warped-version-a',
      selection: {
        modelId: 'Xenova/slimsam-77-uniform',
        modelRevision: '5850ab45f587c112167512ffef949107115e26a0',
        backend: 'webgpu' as const,
        positivePointCount: 1,
        negativePointCount: 0,
        manualEditCount: 2,
      },
    };

    const first = await generatePredrawnRasterSelectionOcclusion(input);
    const second = await generatePredrawnRasterSelectionOcclusion(input);
    expect(new Uint8Array(await first.blob.arrayBuffer()))
      .toEqual(new Uint8Array(await second.blob.arrayBuffer()));
    expect(first.operation).toMatchObject({
      kind: 'occlusion-depth-v1',
      sourceBackgroundVersionId: 'warped-version-a',
      selection: {
        processor: 'owner-raster-selection-v1',
        modelId: input.selection.modelId,
        modelRevision: input.selection.modelRevision,
        backend: 'webgpu',
        positivePointCount: 1,
        negativePointCount: 0,
        manualEditCount: 2,
      },
      depthAssignment: {
        processor: 'screen-column-bottom-envelope-v1',
      },
    });
  });
});
