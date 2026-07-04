// Throughput benchmark for the alpha-beta engine WITH quiescence search.
//
//   Run (from frontend/):  npx vitest bench scripts/bench-qsearch.bench.ts
//
// A `.bench.ts` file, so `vitest run` (CI) skips it — only `vitest bench` executes
// it. vitest reports hz = games/sec at depth 6 on one thread; multiply by the
// D8als_v7 pool's worker count (~7) for the cluster figure that drives the
// trainer's throughput/cost estimate. This is a wall-clock measurement, not a test;
// determinism is covered in src/core/ai.test.ts and src/game/selfplay.test.ts.
import { bench, describe } from 'vitest';
import { playLevelGame } from '../src/game/selfplay';
import { createBlankLevel, type Level } from '../src/core/level';

function benchLevel(): Level {
  // Ten pieces, mostly sliders — lots of captures so quiescence recurses,
  // approximating a real skirmish mid-game's branching and exchange density.
  const level = createBlankLevel('bench-duel', 'Bench Duel', 8, 8);
  level.objective = 'capture-all';
  level.layers.units = [
    { x: 1, y: 6, type: 'queen', side: 'player' },
    { x: 3, y: 6, type: 'rook', side: 'player' },
    { x: 5, y: 7, type: 'bishop', side: 'player' },
    { x: 6, y: 6, type: 'knight', side: 'player' },
    { x: 2, y: 7, type: 'pawn', side: 'player' },
    { x: 6, y: 1, type: 'queen', side: 'enemy' },
    { x: 4, y: 1, type: 'rook', side: 'enemy' },
    { x: 2, y: 0, type: 'bishop', side: 'enemy' },
    { x: 1, y: 1, type: 'knight', side: 'enemy' },
    { x: 5, y: 0, type: 'pawn', side: 'enemy' },
  ];
  return level;
}

describe('q-search throughput', () => {
  let seed = 100;
  bench(
    'one depth-6 self-play game (maxNodes 100k)',
    () => {
      playLevelGame(benchLevel(), { seed: seed++, search: { maxDepth: 6, maxNodes: 100_000 }, maxPlies: 24 });
    },
    { time: 8_000, warmupIterations: 0 },
  );
});
