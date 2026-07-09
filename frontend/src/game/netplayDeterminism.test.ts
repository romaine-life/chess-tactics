import { describe, it, expect } from 'vitest';
import { createSkirmish } from './setup';
import { applyMove, gameEnv, legalMoves, livingPieces, recordPosition } from '../core/rules';
import { createBlankLevel } from '../core/level';
import type { GameState, Move, Side } from '../core/types';

// The netplay contract (see store.ts newNetMatch/applyRemoteMove + Skirmish.tsx relay):
//   * both clients build the SAME board from (level, seed) — with the AI disabled the
//     only randomness is initial placement, so the boards are byte-identical;
//   * only { pieceId, x, y } travels the wire — the RECEIVER re-derives the canonical
//     Move (capture id, en-passant flag) from its own identical board via legalMoves;
//   * every applyMove is relayed in order and folded through the same pure core.
// This test proves that two independent boards fed the same relayed move sequence stay
// byte-identical at every step and reach the same outcome — the whole basis of the
// relay design. It deliberately mirrors the store's applyMove usage, so every
// move flips the turn: strict one-move-per-turn alternation.

// The canonical env builder (terrain + fences + castle rules), exactly as the store's
// envFor does — so re-derivation here honours every gameplay layer, castling included.
const env = (g: GameState) => ({ ...gameEnv(g), lastMove: g.lastMove });

/** Pick a deterministic legal move for the side to move: first living piece (in stored
 *  order) that has a legal move, and its first legal move. Deterministic = both the
 *  "driver" and a re-derivation agree. */
function pickMove(g: GameState): { pieceId: string; move: Move } | null {
  const side = g.turn;
  if (side !== 'player' && side !== 'enemy') return null;
  for (const p of livingPieces(g.pieces, side as Side)) {
    const moves = legalMoves(p, g.pieces, g.size, env(g));
    if (moves.length) return { pieceId: p.id, move: moves[0] };
  }
  return null;
}

/** Re-derive the canonical Move for (pieceId → x,y) on THIS board — exactly what
 *  applyRemoteMove does with a relayed { pieceId, x, y }. */
function reDerive(g: GameState, pieceId: string, x: number, y: number): Move | null {
  const p = g.pieces.find((q) => q.id === pieceId && q.alive);
  if (!p) return null;
  return legalMoves(p, g.pieces, g.size, env(g)).find((m) => m.x === x && m.y === y) ?? null;
}

describe('netplay relay determinism', () => {
  it('createSkirmish is a pure function of the seed (both clients build identical boards)', () => {
    expect(createSkirmish({ seed: 4242 })).toEqual(createSkirmish({ seed: 4242 }));
    expect(createSkirmish({ seed: 4242 })).not.toEqual(createSkirmish({ seed: 9001 }));
  });

  it('two boards fed the same { pieceId, x, y } relay stream stay byte-identical and reach the same outcome', () => {
    for (const seed of [1, 7, 4242, 88888]) {
      // "Host" board (drives the moves) and "guest" board (receives the relay). Both
      // start from the same seed — the shared-board guarantee.
      let host = createSkirmish({ seed });
      let guest = createSkirmish({ seed });
      expect(guest).toEqual(host);

      let relayed = 0;
      for (let i = 0; i < 60; i += 1) {
        if (host.winner) break;
        const chosen = pickMove(host);
        if (!chosen) break; // side to move is stuck — game would resolve terminal
        // Host applies locally (as commitNet does for the local move)...
        host = applyMove(host, chosen.pieceId, chosen.move).state;
        // ...and relays ONLY { pieceId, x, y }. The guest re-derives + applies.
        const canon = reDerive(guest, chosen.pieceId, chosen.move.x, chosen.move.y);
        expect(canon, `seed ${seed}, move ${i}: guest could not re-derive the relayed move`).not.toBeNull();
        guest = applyMove(guest, chosen.pieceId, canon as Move).state;
        relayed += 1;
        // The crux: after each relayed move the two boards are byte-identical.
        expect(guest, `seed ${seed}: boards diverged after ${relayed} relayed moves`).toEqual(host);
      }

      expect(relayed, `seed ${seed}: expected the sim to relay at least one move`).toBeGreaterThan(0);
      expect(guest.winner).toEqual(host.winner);
    }
  });

  it('a castle relays as its plain { pieceId, x, y } and both boards reproduce the rook hop (ADR-0072)', () => {
    // A level with authored castling + threefold: the richest new state a relayed game
    // carries (castle rights, halfmove clock, position table) — all of it must fall out
    // of replaying the same move stream, byte-identical on both boards.
    const level = createBlankLevel('net-castle', 'Castle', 8, 8);
    level.objective = 'capture-king';
    level.layers.units = [
      { x: 4, y: 7, type: 'king', side: 'player' },
      { x: 7, y: 7, type: 'rook', side: 'player' },
      { x: 4, y: 0, type: 'king', side: 'enemy' },
      { x: 0, y: 0, type: 'rook', side: 'enemy' },
    ];
    level.events = [
      { trigger: { kind: 'setup' }, do: [{ kind: 'castle', side: 'player', king: { x: 4, y: 7 }, rook: { x: 7, y: 7 }, kingTo: { x: 6, y: 7 }, rookTo: { x: 5, y: 7 } }] },
      { trigger: { kind: 'setup' }, do: [{ kind: 'chess-draws', fiftyMove: true, threefold: true }] },
    ];
    let host = createSkirmish({ seed: 9, level });
    let guest = createSkirmish({ seed: 9, level });
    expect(guest).toEqual(host);

    // Host clicks the castle: the two-square king move, relayed as destination only.
    const hostKing = host.pieces.find((p) => p.type === 'king' && p.side === 'player')!;
    const castle = legalMoves(hostKing, host.pieces, host.size, env(host)).find((m) => m.castle);
    expect(castle).toMatchObject({ x: 6, y: 7 });
    // Both seats fold the settled position into the threefold table, as commitNet does.
    host = recordPosition(applyMove(host, hostKing.id, castle as Move).state);
    const canon = reDerive(guest, hostKing.id, 6, 7);
    expect(canon?.castle).toBeDefined();
    guest = recordPosition(applyMove(guest, hostKing.id, canon as Move).state);
    expect(guest).toEqual(host);
    // The rook hopped on both boards, rights burned, the clock ticked, the table grew.
    expect(guest.pieces.find((p) => p.type === 'rook' && p.side === 'player')).toMatchObject({ x: 5, y: 7, hasMoved: true });
    expect(guest.halfmoveClock).toBe(1);
    expect(Object.keys(guest.positionCounts ?? {})).toHaveLength(2);
  });
});
