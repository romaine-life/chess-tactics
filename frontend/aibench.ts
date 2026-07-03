// Throwaway benchmark: branching factor + achievable alpha-beta depth on real boards.
// Run: compile with tsc (main checkout) then node. Not part of the app.
import * as fs from 'fs';
import * as path from 'path';
import { legalMoves, applyMove, livingPieces } from './src/core/rules';
import { buildTerrainIndex } from './src/core/terrain';
import { propCells, propDef } from './src/core/props';
import type { GameState, Piece, PieceType, Side, Move } from './src/core/types';

const VAL: Record<string, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100, rock: 0, 'random-rock': 0 };

interface Board { name: string; state: GameState; env: any }

function stateFromLevel(name: string, level: any): Board {
  const pieces: Piece[] = level.layers.units.map((u: any, i: number) => ({
    id: `${u.side}-${u.type}-${i}`, side: u.side, type: u.type, x: u.x, y: u.y,
    alive: true, startY: u.side === 'player' ? level.board.rows - 1 : 0,
  }));
  const occupied = new Set(pieces.map((p) => `${p.x},${p.y}`));
  for (const placed of level.layers.props ?? []) {
    const def = propDef(placed.propId);
    if (!def || !def.blocking) continue;
    propCells(placed.x, placed.y, def).forEach((cell: any, ci: number) => {
      const key = `${cell.x},${cell.y}`;
      if (occupied.has(key)) return;
      occupied.add(key);
      pieces.push({ id: `prop-${placed.propId}-${ci}-${cell.x}-${cell.y}`, side: 'neutral', type: 'rock', x: cell.x, y: cell.y, alive: true, startY: cell.y });
    });
  }
  const state: GameState = {
    size: { cols: level.board.cols, rows: level.board.rows },
    pieces, turn: 'enemy', winner: null,
    terrain: level.layers.terrain,
  };
  const env = level.layers.terrain?.length ? { terrain: buildTerrainIndex(level.layers.terrain) } : {};
  return { name, state, env };
}

function bigBoard(): Board {
  // 20x20, 40 units/side: 20 pawns + 20 back pieces per side, chess-like rows.
  const back: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'queen', 'bishop', 'knight', 'rook', 'queen', 'king', 'rook', 'knight', 'bishop', 'queen', 'queen', 'bishop', 'knight', 'rook', 'bishop', 'knight'];
  const pieces: Piece[] = [];
  for (const side of ['enemy', 'player'] as Side[]) {
    const backRow = side === 'enemy' ? 0 : 19;
    const pawnRow = side === 'enemy' ? 2 : 17;
    for (let x = 0; x < 20; x += 1) {
      pieces.push({ id: `${side}-back-${x}`, side, type: back[x], x, y: backRow, alive: true, startY: backRow });
      pieces.push({ id: `${side}-pawn-${x}`, side, type: 'pawn', x, y: pawnRow, alive: true, startY: pawnRow });
    }
  }
  return { name: '20x20 open, 40v40', state: { size: { cols: 20, rows: 20 }, pieces, turn: 'enemy', winner: null }, env: {} };
}

function branching(state: GameState, env: any, side: Side): number {
  let n = 0;
  for (const p of livingPieces(state.pieces, side)) n += legalMoves(p, state.pieces, state.size, env).length;
  return n;
}

function material(state: GameState): number {
  let v = 0;
  for (const p of state.pieces) if (p.alive && p.side !== 'neutral') v += (p.side === 'player' ? 1 : -1) * VAL[p.type];
  return v;
}

let nodes = 0;
let deadline = 0;
let aborted = false;

function search(state: GameState, env: any, depth: number, alpha: number, beta: number): number {
  if ((nodes & 1023) === 0 && Date.now() > deadline) { aborted = true; return 0; }
  const color = state.turn === 'player' ? 1 : -1;
  if (depth === 0 || state.winner) return color * material(state);
  const side = state.turn as Side;
  const entries: { p: Piece; m: Move }[] = [];
  for (const p of livingPieces(state.pieces, side)) {
    for (const m of legalMoves(p, state.pieces, state.size, env)) entries.push({ p, m });
  }
  if (!entries.length) return color * material(state);
  entries.sort((a, b) => (b.m.capture ? 1 : 0) - (a.m.capture ? 1 : 0));
  let best = -Infinity;
  for (const e of entries) {
    nodes += 1;
    const res = applyMove(state, e.p.id, e.m);
    const v = -search(res.state, env, depth - 1, -beta, -alpha);
    if (aborted) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function bench(b: Board, budgetMs: number): void {
  const be = branching(b.state, b.env, 'enemy');
  const bp = branching(b.state, b.env, 'player');
  console.log(`\n=== ${b.name} (${b.state.size.cols}x${b.state.size.rows}) — branching: enemy ${be}, player ${bp}`);
  for (let depth = 1; depth <= 10; depth += 1) {
    nodes = 0;
    aborted = false;
    deadline = Date.now() + budgetMs;
    const t0 = Date.now();
    search(b.state, b.env, depth, -Infinity, Infinity);
    const ms = Date.now() - t0;
    if (aborted) {
      console.log(`  depth ${depth}: ABORTED at ${budgetMs}ms budget (${nodes.toLocaleString()} nodes searched)`);
      break;
    }
    console.log(`  depth ${depth}: ${nodes.toLocaleString()} nodes in ${ms}ms`);
  }
}

const wsPath = path.join(__dirname, '..', 'public', 'assets', 'campaigns', 'official.json');
const ws = JSON.parse(fs.readFileSync(wsPath, 'utf-8'));
const boards: Board[] = Object.entries(ws.levels).map(([id, lvl]: [string, any]) => stateFromLevel(lvl.name ?? id, lvl));
boards.push(bigBoard());

for (const b of boards) bench(b, 3000);
