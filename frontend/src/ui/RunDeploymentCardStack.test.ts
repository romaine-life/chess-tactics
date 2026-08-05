import { describe, expect, it } from 'vitest';
import type { RunArmyPieceType } from '../run/model';
import { deploymentCardEmptyPieceIndices } from './RunDeploymentCardStack';

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

  it('matches shuffled deployment seats back to authored seats by piece type', () => {
    expect(deploymentCardEmptyPieceIndices(
      ['pawn', 'knight'],
      ['knight-unit', 'pawn-unit'],
      unitTypes([['knight-unit', 'knight'], ['pawn-unit', 'pawn']]),
      1,
    )).toEqual([1]);
  });

  it('leaves pre-existing losses vacant without needing their removed unit record', () => {
    expect(deploymentCardEmptyPieceIndices(
      ['pawn', 'knight'],
      [null, 'pawn-unit'],
      unitTypes([['pawn-unit', 'pawn']]),
      0,
    )).toEqual([1]);
  });
});
