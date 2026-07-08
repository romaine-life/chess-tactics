// Board solver — search-mode transposition table (ADR-0068 Phase 4, §3).
//
// The TT is two things at once: the alpha-beta bound cache that makes iterative deepening
// pay for itself (a proven or bounded position is not re-searched), AND the anytime
// "partial tablebase" — the store of PROVEN positions that survives an early stop and
// tightens the root bounds (ADR §3).
//
// Six flags: the three αβ bound flags (exact / lower / upper — heuristic, depth-relative)
// plus three PROOF flags (proven-win / proven-loss / proven-draw — game-theoretic, depth-
// INDEPENDENT). Replacement is depth-preferred but PROVEN-STICKY: a proof is final and
// never regresses to a shallower heuristic bound.
//
// GHI SOUNDNESS (§Risks — the GHI trap): a `proven-draw` written here is a PATH-INDEPENDENT
// draw (all successors drawn/lost, none winnable), NOT a repetition-derived draw. Cycle
// draws are path-scoped and MUST NOT be stored (proofNegamax enforces this). So a TT
// `proven-draw` is the same Value as a retrograde tablebase draw under the same key —
// the "key compatibility" that makes the two stores interchangeable for proven values.

import type { ProvenCounts } from '../types';

/** αβ bound flags (heuristic, depth-relative) plus the three proof flags (game-theoretic). */
export type TTFlag = 'exact' | 'lower' | 'upper' | 'proven-win' | 'proven-loss' | 'proven-draw';

/** One TT entry. `key` is the contract PositionKey (stringified canonical bigint); `value` is
 * side-to-move-positive (the ai.ts negamax convention); `depth` is the resolution depth (a
 * proof is resolved to the end of the game, recorded with a large sentinel depth so it always
 * wins depth-preference). `distancePlies` is the DTM for a proven win/loss (0 for draw/bound). */
export interface TTEntry {
  key: string;
  flag: TTFlag;
  value: number;
  depth: number;
  distancePlies: number;
  bestMoveIdx?: number;
}

const isProven = (f: TTFlag): boolean => f === 'proven-win' || f === 'proven-loss' || f === 'proven-draw';

/** A proof resolves the WHOLE subgame, so it dominates any heuristic depth — record it with a
 * sentinel depth larger than any real search depth so depth-preference keeps it. */
export const PROVEN_DEPTH = 1 << 29;

export class TranspositionTable {
  private readonly map = new Map<string, TTEntry>();
  private readonly limit: number;

  constructor(entryLimit = 1_000_000) {
    this.limit = Math.max(1, entryLimit);
  }

  get(key: string): TTEntry | undefined {
    return this.map.get(key);
  }

  /**
   * Insert or replace, depth-preferred + proven-sticky:
   *  - a PROVEN flag always replaces a non-proven entry (a proof is final);
   *  - a proven flag never regresses to a shallower/heuristic put (proven-sticky);
   *  - between two non-proven entries the deeper resolution wins (ties overwrite, so a
   *    re-search at the same depth refreshes the bound/move);
   *  - between two proven entries (should agree) the one with the SHORTER DTM for a
   *    win/loss wins, so the recorded proof is the tightest.
   * Evicts the shallowest non-proven entry when the limit is hit (proofs are kept).
   */
  put(e: TTEntry): void {
    const existing = this.map.get(e.key);
    if (existing) {
      if (isProven(existing.flag)) {
        // Proven-sticky: only a proof with a strictly shorter DTM refines it.
        if (isProven(e.flag) && e.distancePlies > 0 && (existing.distancePlies === 0 || e.distancePlies < existing.distancePlies)) {
          this.map.set(e.key, e);
        }
        return;
      }
      // existing is a heuristic bound: a proof always wins; else deeper (or equal) wins.
      if (isProven(e.flag) || e.depth >= existing.depth) this.map.set(e.key, e);
      return;
    }
    if (this.map.size >= this.limit) this.evictOne();
    this.map.set(e.key, e);
  }

  /** Evict the shallowest NON-proven entry (proofs are the anytime deliverable — never dropped
   * for a bound). A `Map` preserves insertion order; scanning for the shallowest non-proven is
   * O(n) but eviction is rare (only at the cap) and bounded by the cap itself. */
  private evictOne(): void {
    let victimKey: string | undefined;
    let victimDepth = Infinity;
    for (const [k, v] of this.map) {
      if (isProven(v.flag)) continue;
      if (v.depth < victimDepth) { victimDepth = v.depth; victimKey = k; }
    }
    // If every entry is proven the table is all-proof; drop the oldest to respect the cap.
    if (victimKey === undefined) {
      const first = this.map.keys().next();
      if (!first.done) this.map.delete(first.value);
      return;
    }
    this.map.delete(victimKey);
  }

  get size(): number {
    return this.map.size;
  }

  /** Iterate every stored entry (for merging one table's proofs into another — the anytime
   * partial tablebase after a separate proof pass). */
  entries(): IterableIterator<TTEntry> {
    return this.map.values();
  }

  /** The PROVEN entries only — the sound, path-independent partial tablebase to merge/persist. */
  *provenEntries(): IterableIterator<TTEntry> {
    for (const v of this.map.values()) if (isProven(v.flag)) yield v;
  }

  /** Census of PROVEN positions in the table — the partial-tablebase counts (ADR §3). */
  provenCounts(): ProvenCounts {
    let win = 0;
    let loss = 0;
    let draw = 0;
    for (const v of this.map.values()) {
      if (v.flag === 'proven-win') win += 1;
      else if (v.flag === 'proven-loss') loss += 1;
      else if (v.flag === 'proven-draw') draw += 1;
    }
    return { win, loss, draw };
  }

  clear(): void {
    this.map.clear();
  }
}
