import { describe, expect, it } from 'vitest';
import { encodePredrawnOcclusionDepth, type BoardDrawOp } from '@chess-tactics/board-render';
import {
  boardCanvasFramePlan,
  boardCanvasSources,
  boardCanvasScratchRegion,
  drawBoardOps,
  isAnimatedGroundCoverOp,
  predrawnOcclusionDepthImageDimensionIssue,
  sizeCanvasForBounds,
} from './BoardCanvasLayer';

function drawOp(overrides: Partial<BoardDrawOp> = {}): BoardDrawOp {
  return {
    layer: 'scene',
    src: `/api/media/${'a'.repeat(64)}`,
    dx: 0,
    dy: 0,
    dw: 40,
    dh: 37,
    z: 1,
    sx: 0,
    sy: 0,
    sw: 40,
    sh: 37,
    ...overrides,
  };
}

describe('BoardCanvasLayer live ground-cover animation', () => {
  it('defers backing-store geometry changes until the complete frame paint', () => {
    const canvas = { width: 300, height: 150 };
    sizeCanvasForBounds(canvas, { minX: -10, minY: -20, width: 640.2, height: 479.1 });
    expect(canvas).toEqual({ width: 641, height: 480 });

    sizeCanvasForBounds(canvas, { minX: 0, minY: 0, width: 0, height: -5 });
    expect(canvas).toEqual({ width: 1, height: 1 });
  });

  it('validates empty-scene depth resources without requiring a canvas paint', () => {
    expect(boardCanvasSources([])).toEqual([]);
    expect(boardCanvasFramePlan(
      [],
      [drawOp({ src: 'unused-mask' })],
      {
        src: 'unused-depth',
        frameWidth: 100,
        frameHeight: 80,
        worldBounds: { minX: 0, minY: 0, width: 100, height: 80 },
      },
    )).toEqual({
      sources: ['unused-mask', 'unused-depth'],
      paint: false,
    });
    expect(boardCanvasSources(
      [drawOp({ src: 'shared' })],
      [drawOp({ src: 'shared' }), drawOp({ src: 'mask' })],
      {
        src: 'depth',
        frameWidth: 100,
        frameHeight: 80,
        worldBounds: { minX: 0, minY: 0, width: 100, height: 80 },
      },
    )).toEqual(['shared', 'mask', 'depth']);
  });

  it('uses typed draw metadata instead of inferring ownership from an asset URL', () => {
    expect(isAnimatedGroundCoverOp(drawOp({
      animation: { kind: 'ground-cover-sway', frameCount: 6, durationMs: 1140, phase: 2 },
    }))).toBe(true);
    expect(isAnimatedGroundCoverOp(drawOp())).toBe(false);
  });

  it('does not animate a single-frame live sheet', () => {
    expect(isAnimatedGroundCoverOp(drawOp({
      animation: { kind: 'ground-cover-sway', frameCount: 1, durationMs: 1140, phase: 0 },
    }))).toBe(false);
  });
});

describe('BoardCanvasLayer pre-drawn occlusion', () => {
  it('fails closed when immutable depth bytes do not match persisted frame dimensions', () => {
    const map = {
      src: '/depth.png',
      frameWidth: 100,
      frameHeight: 80,
      worldBounds: { minX: 0, minY: 0, width: 100, height: 80 },
    };
    expect(predrawnOcclusionDepthImageDimensionIssue(map, { naturalWidth: 100, naturalHeight: 80 })).toBeNull();
    expect(predrawnOcclusionDepthImageDimensionIssue(map, { naturalWidth: 100, naturalHeight: 79 }))
      .toMatch(/expected 100×80, decoded 100×79/);
  });

  it('turns the persisted depth raster into an op-specific erase mask', () => {
    const [red, green, blue] = encodePredrawnOcclusionDepth(6);
    let filteredAlpha = -1;
    const mainContext = {
      clearRect: () => {},
      drawImage: () => {},
      imageSmoothingEnabled: true,
    } as unknown as CanvasRenderingContext2D;
    const scratchContext = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: true,
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D;
    const depthContext = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: true,
      clearRect: () => {},
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray([red, green, blue, 255]) }),
      putImageData: (data: ImageData) => { filteredAlpha = data.data[3]; },
    } as unknown as CanvasRenderingContext2D;
    const unitImage = { complete: true, naturalWidth: 1, naturalHeight: 1 } as HTMLImageElement;
    const depthImage = { complete: true, naturalWidth: 1, naturalHeight: 1 } as HTMLImageElement;
    const surfaces = [
      { canvas: { width: 1, height: 1 } as HTMLCanvasElement, context: scratchContext },
      { canvas: { width: 1, height: 1 } as HTMLCanvasElement, context: depthContext },
    ];

    drawBoardOps(
      mainContext,
      [drawOp({ src: 'unit', dw: 1, dh: 1, z: 5 })],
      { minX: 0, minY: 0, width: 1, height: 1 },
      new Map([['unit', unitImage], ['depth', depthImage]]),
      0,
      undefined,
      [],
      () => surfaces.shift(),
      {
        src: 'depth',
        frameWidth: 1,
        frameHeight: 1,
        worldBounds: { minX: 0, minY: 0, width: 1, height: 1 },
      },
    );

    expect(filteredAlpha).toBe(255);
  });

  it('source-crops a grow-only depth scratch when a smaller op follows a larger one', () => {
    const depthCompositeDraws: unknown[][] = [];
    const depthCanvas = { width: 10, height: 10 } as HTMLCanvasElement;
    const scratchCanvas = { width: 10, height: 10 } as HTMLCanvasElement;
    const mainContext = {
      clearRect: () => {},
      drawImage: () => {},
      imageSmoothingEnabled: true,
    } as unknown as CanvasRenderingContext2D;
    const scratchContext = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: true,
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      drawImage: (...args: unknown[]) => {
        if (args[0] === depthCanvas) depthCompositeDraws.push(args);
      },
    } as unknown as CanvasRenderingContext2D;
    const depthContext = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: true,
      clearRect: () => {},
      drawImage: () => {},
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: () => {},
    } as unknown as CanvasRenderingContext2D;
    const unitImage = { complete: true, naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement;
    const depthImage = { complete: true, naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement;
    const surfaces = [
      { canvas: scratchCanvas, context: scratchContext },
      { canvas: depthCanvas, context: depthContext },
    ];

    drawBoardOps(
      mainContext,
      [
        drawOp({ src: 'unit', dw: 10, dh: 10 }),
        drawOp({ src: 'unit', dx: 12, dy: 12, dw: 4, dh: 3 }),
      ],
      { minX: 0, minY: 0, width: 20, height: 20 },
      new Map([['unit', unitImage], ['depth', depthImage]]),
      0,
      undefined,
      [],
      () => surfaces.shift(),
      {
        src: 'depth',
        frameWidth: 20,
        frameHeight: 20,
        worldBounds: { minX: 0, minY: 0, width: 20, height: 20 },
      },
    );

    expect(depthCompositeDraws).toEqual([
      [depthCanvas, 0, 0, 10, 10, 0, 0, 10, 10],
      [depthCanvas, 0, 0, 4, 3, 0, 0, 4, 3],
    ]);
  });

  it('erases lower-depth scene pixels with a front mask and keeps higher-depth pixels', () => {
    const draws: string[] = [];
    const recordingContext = (label: string): CanvasRenderingContext2D => {
      const stack: GlobalCompositeOperation[] = [];
      const state = { composite: 'source-over' as GlobalCompositeOperation };
      const context = {
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        clearRect: () => {},
        save() { stack.push(state.composite); },
        restore() { state.composite = stack.pop() ?? 'source-over'; },
        drawImage(image: HTMLImageElement) {
          draws.push(`${label}:${state.composite}:${image.dataset.testId}`);
        },
      };
      Object.defineProperty(context, 'globalCompositeOperation', {
        get: () => state.composite,
        set: (value: GlobalCompositeOperation) => { state.composite = value; },
      });
      return context as unknown as CanvasRenderingContext2D;
    };
    const context = recordingContext('main');
    const scratchContext = recordingContext('scratch');
    const scratchCanvas = { dataset: { testId: 'scratch-canvas' } } as unknown as HTMLCanvasElement;
    const image = (testId: string) => ({
      complete: true,
      naturalWidth: 40,
      dataset: { testId },
    }) as unknown as HTMLImageElement;
    const images = new Map([
      ['behind', image('behind')],
      ['front', image('front')],
      ['mask', image('mask')],
    ]);
    const bounds = { minX: 0, minY: 0, width: 40, height: 40 };
    const mask = drawOp({ src: 'mask', z: 2 });

    drawBoardOps(context, [
      drawOp({ src: 'behind', z: 1 }),
      drawOp({ src: 'front', z: 3 }),
    ], bounds, images, 0, undefined, [mask], () => ({
      canvas: scratchCanvas,
      context: scratchContext,
    }));

    expect(draws).toEqual([
      'scratch:source-over:behind',
      'scratch:destination-out:mask',
      'main:source-over:scratch-canvas',
      'main:source-over:front',
    ]);
  });

  it('uses only the live op/board intersection for a 4K render', () => {
    const op = drawOp({ dx: 3980, dy: 3985, dw: 40, dh: 37 });

    expect(boardCanvasScratchRegion(op, {
      minX: 0,
      minY: 0,
      width: 4000,
      height: 4000,
    })).toEqual({
      bounds: { minX: 3980, minY: 3985, width: 20, height: 15 },
      offsetX: 3980,
      offsetY: 3985,
      width: 20,
      height: 15,
    });
  });

  it('keeps atlas animation, flip, opacity, clips, and destination coordinates local to that region', () => {
    type RecordedCall = {
      label: string;
      name: string;
      args: unknown[];
      alpha: number;
      composite: GlobalCompositeOperation;
    };
    const calls: RecordedCall[] = [];
    const recordingContext = (label: string): CanvasRenderingContext2D => {
      const stack: Array<{ alpha: number; composite: GlobalCompositeOperation }> = [];
      const state = { alpha: 1, composite: 'source-over' as GlobalCompositeOperation };
      const record = (name: string, ...args: unknown[]) => calls.push({
        label,
        name,
        args,
        alpha: state.alpha,
        composite: state.composite,
      });
      const context = {
        imageSmoothingEnabled: true,
        clearRect: (...args: unknown[]) => record('clearRect', ...args),
        save: () => stack.push({ ...state }),
        restore: () => Object.assign(state, stack.pop() ?? state),
        beginPath: () => record('beginPath'),
        moveTo: (...args: unknown[]) => record('moveTo', ...args),
        lineTo: (...args: unknown[]) => record('lineTo', ...args),
        closePath: () => record('closePath'),
        clip: () => record('clip'),
        translate: (...args: unknown[]) => record('translate', ...args),
        scale: (...args: unknown[]) => record('scale', ...args),
        drawImage: (...args: unknown[]) => record('drawImage', ...args),
      };
      Object.defineProperties(context, {
        globalAlpha: {
          get: () => state.alpha,
          set: (value: number) => { state.alpha = value; },
        },
        globalCompositeOperation: {
          get: () => state.composite,
          set: (value: GlobalCompositeOperation) => { state.composite = value; },
        },
      });
      return context as unknown as CanvasRenderingContext2D;
    };
    const image = (testId: string) => ({
      complete: true,
      naturalWidth: 240,
      naturalHeight: 40,
      dataset: { testId },
    }) as unknown as HTMLImageElement;
    const main = recordingContext('main');
    const scratchContext = recordingContext('scratch');
    const scratchCanvas = {
      width: 20,
      height: 15,
      dataset: { testId: 'scratch-canvas' },
    } as unknown as HTMLCanvasElement;
    const requestedSizes: Array<[number, number]> = [];
    const liveOp = drawOp({
      src: 'behind',
      dx: 3980,
      dy: 3985,
      dw: 40,
      dh: 37,
      z: 1,
      sy: 2,
      opacity: 0.25,
      flipX: true,
      clipPolygons: [[3980, 3985, 4020, 3985, 4020, 4022, 3980, 4022]],
      animation: { kind: 'ground-cover-sway', frameCount: 6, durationMs: 1200, phase: 0 },
    });
    const mask = drawOp({
      src: 'mask',
      dx: 3970,
      dy: 3970,
      dw: 60,
      dh: 60,
      z: 2,
    });

    drawBoardOps(
      main,
      [liveOp],
      { minX: 0, minY: 0, width: 4000, height: 4000 },
      new Map([['behind', image('behind')], ['mask', image('mask')]]),
      600,
      undefined,
      [mask],
      (width, height) => {
        requestedSizes.push([width, height]);
        return { canvas: scratchCanvas, context: scratchContext };
      },
    );

    expect(requestedSizes).toEqual([[20, 15]]);
    expect(calls.find((call) => call.label === 'scratch' && call.name === 'moveTo')?.args).toEqual([0, 0]);
    expect(calls.find((call) => call.label === 'scratch' && call.name === 'translate')?.args).toEqual([40, 0]);
    expect(calls.find((call) => call.label === 'scratch' && call.name === 'scale')?.args).toEqual([-1, 1]);
    const liveDraw = calls.find((call) => (
      call.label === 'scratch'
      && call.name === 'drawImage'
      && (call.args[0] as HTMLImageElement).dataset.testId === 'behind'
    ));
    expect(liveDraw?.args).toEqual([
      expect.objectContaining({ dataset: { testId: 'behind' } }),
      120,
      2,
      40,
      37,
      0,
      0,
      40,
      37,
    ]);
    expect(liveDraw?.alpha).toBe(0.25);
    const maskDraw = calls.find((call) => (
      call.label === 'scratch'
      && call.name === 'drawImage'
      && (call.args[0] as HTMLImageElement).dataset.testId === 'mask'
    ));
    expect(maskDraw?.composite).toBe('destination-out');
    expect(maskDraw?.args.slice(1)).toEqual([0, 0, 40, 37, -10, -15, 60, 60]);
    const composite = calls.find((call) => call.label === 'main' && call.name === 'drawImage');
    expect(composite?.args).toEqual([
      scratchCanvas,
      0,
      0,
      20,
      15,
      3980,
      3985,
      20,
      15,
    ]);
  });

  it('preserves contain sizing inside an op-local scratch surface', () => {
    const draws: unknown[][] = [];
    const context = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: true,
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      drawImage: (...args: unknown[]) => draws.push(args),
    } as unknown as CanvasRenderingContext2D;
    const scratchCanvas = { width: 100, height: 120 } as HTMLCanvasElement;
    const unitImage = {
      complete: true,
      naturalWidth: 200,
      naturalHeight: 100,
    } as HTMLImageElement;
    const maskImage = {
      complete: true,
      naturalWidth: 100,
      naturalHeight: 120,
    } as HTMLImageElement;
    const unit = drawOp({ src: 'unit', contain: true, dw: 100, dh: 120, z: 1 });
    const mask = drawOp({ src: 'mask', dw: 100, dh: 120, z: 2 });

    drawBoardOps(
      context,
      [unit],
      { minX: 0, minY: 0, width: 4000, height: 4000 },
      new Map([['unit', unitImage], ['mask', maskImage]]),
      0,
      undefined,
      [mask],
      () => ({ canvas: scratchCanvas, context }),
    );

    expect(draws[0]).toEqual([unitImage, 0, 35, 100, 50]);
  });
});
