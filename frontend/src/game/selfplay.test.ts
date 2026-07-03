// @ts-nocheck — node built-ins are untyped in the app tsconfig (same posture as
// forgeAtomCanvas.test.ts); vitest runs this via esbuild, which doesn't typecheck.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { playLevelGame, replayStates, aggregateRecords } from './selfplay';
import { createBlankLevel, type Level } from '../core/level';
import { livingPieces } from '../core/rules';

// Shallow, node-capped search keeps the sweep fast; decisions don't need depth
// to be *reached*, only to be legal and recorded.
const FAST = { maxDepth: 2, timeBudgetMs: 500, maxNodes: 20_000 };

function loadOfficialLevels(): Level[] {
  const url = new URL('../../public/assets/campaigns/official.json', import.meta.url);
  const ws = JSON.parse(readFileSync(url, 'utf-8')) as { levels: Record<string, Level> };
  return Object.values(ws.levels);
}

function duelLevel(): Level {
  const level = createBlankLevel('lab-duel', 'Duel', 8, 8);
  level.objective = 'capture-all';
  level.layers.units = [
    { x: 1, y: 6, type: 'queen', side: 'player' },
    { x: 2, y: 7, type: 'pawn', side: 'player' },
    { x: 6, y: 1, type: 'rook', side: 'enemy' },
    { x: 5, y: 0, type: 'pawn', side: 'enemy' },
  ];
  return level;
}

describe('playLevelGame', () => {
  it('plays every official campaign level to a decision', { timeout: 120_000 }, () => {
    const levels = loadOfficialLevels();
    expect(levels.length).toBeGreaterThan(0);
    for (const level of levels) {
      const record = playLevelGame(level, { seed: 7, search: FAST });
      expect(record.winner, `${level.name} must decide`).not.toBeNull();
      expect(record.plies).toBeLessThanOrEqual(300);
      expect(record.moves.length).toBe(record.plies);
    }
  });

  it('is deterministic per seed', () => {
    const a = playLevelGame(duelLevel(), { seed: 11, search: FAST });
    const b = playLevelGame(duelLevel(), { seed: 11, search: FAST });
    expect(a).toEqual(b);
  });

  it('records per-piece activity that matches the moves list', () => {
    const record = playLevelGame(duelLevel(), { seed: 3, search: FAST });
    const totalMoves = record.pieces.reduce((s, p) => s + p.moves, 0);
    expect(totalMoves).toBe(record.plies);
    const captures = record.moves.filter((m) => m.move.capture).length;
    expect(record.pieces.reduce((s, p) => s + p.captures, 0)).toBe(captures);
  });
});

describe('replayStates', () => {
  it('rebuilds one state per move plus the start', () => {
    const level = duelLevel();
    const record = playLevelGame(level, { seed: 5, search: FAST });
    const states = replayStates(level, record);
    expect(states.length).toBe(record.plies + 1);
    // Living combatants never increase as the game replays forward.
    let prev = Infinity;
    for (const s of states) {
      const living = livingPieces(s.pieces, 'player').length + livingPieces(s.pieces, 'enemy').length;
      expect(living).toBeLessThanOrEqual(prev);
      prev = living;
    }
  });
});

describe('aggregateRecords', () => {
  it('sums wins, draws, and rates coherently', () => {
    const level = duelLevel();
    const records = [1, 2, 3, 4].map((seed) => playLevelGame(level, { seed, search: FAST }));
    const agg = aggregateRecords(records);
    expect(agg.games).toBe(4);
    expect(agg.playerWins + agg.enemyWins + agg.draws).toBe(4);
    expect(agg.playerWinRate).toBeGreaterThanOrEqual(0);
    expect(agg.playerWinRate).toBeLessThanOrEqual(1);
  });
});
