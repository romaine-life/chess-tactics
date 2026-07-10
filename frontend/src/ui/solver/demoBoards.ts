// Built-in demo boards for the solver stepper — the same tiny, HAND-CHECKABLE fixtures the
// engine/stepper tests prove ground truth on (lab/solver/solverRunner.test.ts,
// core/solver/retrograde.test.ts), so retrograde stepping works instantly with a known
// right answer, no authored level required.

import { createBlankLevel, type Level, type LevelUnit } from '../../core/level';

export interface SolverDemoBoard {
  id: string;
  name: string;
  /** What the board teaches + its known ground truth (shown in the picker). */
  note: string;
  level: Level;
}

function demoLevel(id: string, name: string, cols: number, rows: number, units: LevelUnit[]): Level {
  const level = createBlankLevel(id, name, cols, rows);
  level.objective = 'rival-kings';
  level.layers.units = units;
  return level;
}

export const SOLVER_DEMO_BOARDS: SolverDemoBoard[] = [
  {
    id: 'demo-kqk',
    name: 'K+Q vs K · 3×3',
    note: 'Mate in 1 — proven {win, player, DTM 1}. The tiniest full retrograde solve.',
    level: demoLevel('solver-demo-kqk', 'Demo — K+Q vs K', 3, 3, [
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ]),
  },
  {
    id: 'demo-kvk',
    name: 'K vs K · 4×4',
    note: 'Every position drawn — the loopy canary: zero terminals, undecided→draw at the fixpoint.',
    level: demoLevel('solver-demo-kvk', 'Demo — K vs K', 4, 4, [
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
    ]),
  },
  {
    id: 'demo-kpk',
    name: 'K+P vs K · 3×5',
    note: 'Mate in 5 via queening — deep enough for real Propagate sweeps and a real search tree.',
    level: demoLevel('solver-demo-kpk', 'Demo — K+P vs K', 3, 5, [
      { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
      { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
    ]),
  },
];

export const demoBoardById = (id: string): SolverDemoBoard | undefined =>
  SOLVER_DEMO_BOARDS.find((d) => d.id === id);
