import { describe, expect, it } from 'vitest';
import type { BoardDrawOp } from '@chess-tactics/board-render';
import { boardCanvasScratchRegion, drawBoardOps, isAnimatedGroundCoverOp } from './BoardCanvasLayer';

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
