import { describe, it, expect } from 'vitest';
import { createSkirmish } from './setup';
import { applyMove, legalMoves, livingPieces } from '../core/rules';
import { buildTerrainIndex } from '../core/terrain';
import type { GameState, Move, Side } from '../core/types';

// The netplay contract (see store.ts newNetMatch/applyRemoteMove + Skirmish.tsx relay):
//   * both clients build the SAME board from (level, seed) — with the AI disabled the
//     only randomness is initial placement, so the boards are byte-identical;
//   * only { pieceId, x, y } travels the wire — the RECEIVER re-derives the canonical
//     Move (capture id, en-passant flag) from its own identical board via legalMoves;
//   * every applyMove is relayed in order and folded through the same pure core.
// This test proves that two independent boards fed the same relayed move sequence stay
// byte-identical at every step and reach the same outcome — the whole basis of the
// relay design. It deliberately mirrors the store's applyMove usage (NO { ap } option,
// so every move flips the turn — strict one-move-per-turn alternation).

const env = (g: GameState) => ({ terrain: g.terrain ? buildTerrainIndex(g.terrain) : undefined, lastMove: g.lastMove });

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
});
