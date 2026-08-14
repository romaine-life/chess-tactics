import { describe, expect, it } from 'vitest';
import { describeFrameWait, type FrameWait } from './MobileLab';

/**
 * The stuck-frame line is the only diagnosis available for a failure that has only ever happened
 * on the owner's machine: a framed route that never paints, which he can report by screenshotting
 * the lab and nothing else. So the exact words are asserted here rather than assumed — a generic
 * message that sticks is no better evidence than the black rectangle it replaced.
 *
 * The DOM read is separate (`readFrameWait`) precisely so this decision can be tested; there is no
 * DOM environment in this suite, and the sentence is the part that has to be right.
 */
const state = (over: Partial<FrameWait> = {}): FrameWait => ({
  reachable: true,
  bootstrapPresent: false,
  phases: [],
  waiting: [],
  errored: [],
  ...over,
});

describe('mobile lab stuck-frame diagnosis', () => {
  it('reports a document it cannot reach into', () => {
    expect(describeFrameWait(state({ reachable: false }))).toBe('frame document unreachable');
  });

  it('reports startup blocked while the static bootstrap is still on screen', () => {
    // index.html renders that status and React removes it by rendering over it, so its presence
    // means the startup chain in main.tsx never finished and nothing downstream has run at all.
    expect(describeFrameWait(state({ bootstrapPresent: true })))
      .toBe('React has not mounted — startup blocked');
  });

  it('distinguishes a mounted app with no scene from a scene that is stuck', () => {
    expect(describeFrameWait(state())).toBe('app mounted, no scene yet');
    expect(describeFrameWait(state({ phases: ['loading'] })))
      .toBe('scene loading · no surface reporting');
  });

  it('names the surfaces a stuck scene is still waiting on', () => {
    expect(describeFrameWait(state({ phases: ['loading'], waiting: ['board', 'gameplay-hud'] })))
      .toBe('scene loading · waiting on board, gameplay-hud');
  });

  it('prefers a failed surface over a waiting one, because that is the cause', () => {
    expect(describeFrameWait(state({
      phases: ['loading'],
      waiting: ['gameplay-hud'],
      errored: ['board'],
    }))).toBe('scene loading · FAILED: board');
  });

  it('keeps the line to one short sentence however many surfaces are stuck', () => {
    expect(describeFrameWait(state({
      phases: ['outgoing', 'loading'],
      waiting: ['a', 'b', 'c', 'd'],
    }))).toBe('scene outgoing, loading · waiting on a, b');
  });
});
