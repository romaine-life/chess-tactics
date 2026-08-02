import { describe, expect, it } from 'vitest';
import { alphaBoundIconLayout } from './AlphaBoundIcon';

describe('alphaBoundIconLayout', () => {
  it('centers and fits the visible pixels rather than the transparent canvas', () => {
    expect(alphaBoundIconLayout({
      canvasWidth: 64,
      canvasHeight: 64,
      left: 5,
      top: 19,
      width: 53,
      height: 26,
    })).toEqual({
      inlineSize: '99.0189%',
      blockSize: '99.0189%',
      insetInlineStart: '1.2642%',
      insetBlockStart: '0.4906%',
    });
  });

  it('rejects empty or out-of-range fitting geometry', () => {
    expect(() => alphaBoundIconLayout({
      canvasWidth: 64,
      canvasHeight: 64,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    })).toThrow('invalid alpha-bound icon geometry');
  });
});
