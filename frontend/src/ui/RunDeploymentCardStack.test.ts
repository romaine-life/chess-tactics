import { describe, expect, it } from 'vitest';
import type { RunArmyPieceType } from '../run/model';
import { deploymentCardEmptyPieceIndices, deploymentCardIsDiscarding } from './RunDeploymentCardStack';

function unitTypes(entries: ReadonlyArray<readonly [string, RunArmyPieceType]>) {
  return new Map<string, RunArmyPieceType>(entries);
}

describe('deploymentCardEmptyPieceIndices', () => {
  it('leaves an identical unit in its original authored seat', () => {
    expect(deploymentCardEmptyPieceIndices(
      ['pawn', 'pawn'],
      ['first-pawn', 'second-pawn'],
      unitTypes([['first-pawn', 'pawn'], ['second-pawn', 'pawn']]),
      1,
    )).toEqual([0]);
  });

  it('keeps different unit types in their authored seats as deployment advances', () => {
    expect(deploymentCardEmptyPieceIndices(
      ['pawn', 'knight'],
      ['pawn-unit', 'knight-unit'],
      unitTypes([['knight-unit', 'knight'], ['pawn-unit', 'pawn']]),
      1,
    )).toEqual([0]);
  });

  it('leaves pre-existing losses vacant without needing their removed unit record', () => {
    expect(deploymentCardEmptyPieceIndices(
      ['pawn', 'knight'],
      [null, 'knight-unit'],
      unitTypes([['knight-unit', 'knight']]),
      0,
    )).toEqual([0]);
  });
});

describe('deploymentCardIsDiscarding', () => {
  it('discards the complete remaining pile after a full-deploy wave', () => {
    const deployment = { stage: 'discarding' as const, activeCardIndex: 3, discardCursor: 0 };
    expect([0, 1, 2].map((index) => deploymentCardIsDiscarding(deployment, index, false))).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('retains the active input card while a completed automatic prefix discards', () => {
    const deployment = { stage: 'discarding' as const, activeCardIndex: 2, discardCursor: 0 };
    expect([0, 1, 2].map((index) => deploymentCardIsDiscarding(deployment, index, index === 2))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('keeps Play discard scoped to its one active card', () => {
    const deployment = { stage: 'discarding' as const, activeCardIndex: 1, discardCursor: 1 };
    expect(deploymentCardIsDiscarding(deployment, 1, true)).toBe(true);
    expect(deploymentCardIsDiscarding(deployment, 2, false)).toBe(false);
  });
});
