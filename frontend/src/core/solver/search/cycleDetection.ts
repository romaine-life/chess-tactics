// Board solver — repetition / cycle detection over the search path (ADR-0069 Phase 4).
//
// This is the mechanism that PROVES DRAWS in this loopy game (F8): there is no repetition
// or 50-move rule, so "draw" means "neither side can force a king-capture in finite moves."
// When the same canonical position recurs on the current search PATH, the side to move could
// have avoided the repetition if it had a winning continuation; recurring means it cannot
// force progress, so that branch is scored a draw (value 0).
//
// KEY: the same Phase-1 canonical encoding the TT uses (a stringified canonical bigint),
// so a repetition-by-piece-swap (two identical pieces exchanging squares) is detected — a
// slot-indexed key would miss it (§position key contract clause 2).
//
// PATH-SCOPED (GHI, §Risks): `repeats` asks only about the CURRENT path (the stack of
// ancestors), never a global set. A draw found this way is path-relative and MUST NOT be
// cached in the global TT — the same position may be a win via a different, non-repeating
// line. proofNegamax enforces the non-caching; PathHistory just answers "is this key an
// ancestor on the line I'm on right now?".

/**
 * An incremental multiset of the keys on the current search path. `push`/`pop` bracket a
 * descent into a child; `repeats(key)` reports whether that key already appears among the
 * ancestors (count > 0) — i.e. descending into it would close a cycle. O(1) amortized.
 *
 * A multiset (count, not a bare Set) is required for correct pop symmetry: the same position
 * can legitimately appear more than once on a path before it is recognized as a repetition,
 * and popping must decrement, not delete, so an earlier occurrence still registers.
 */
export class PathHistory {
  private readonly counts = new Map<string, number>();
  /** The stack-index (ply from the search root) at which each on-path key was FIRST pushed — the
   * cycle target's depth for GHI-sound memoization (a draw that only repeats back to a descendant,
   * never above the current node, is path-INDEPENDENT and cacheable — see proofNegamax). */
  private readonly firstDepth = new Map<string, number>();
  private len = 0;

  /** Enter a position on the path at the current stack depth. */
  push(key: string): void {
    const c = this.counts.get(key) ?? 0;
    this.counts.set(key, c + 1);
    if (c === 0) this.firstDepth.set(key, this.len);
    this.len += 1;
  }

  /** Leave the most recently pushed position. Decrements; clears the entry (and its recorded
   * depth) at zero so `size` reflects distinct live ancestors and the map stays bounded. */
  pop(key: string): void {
    const c = this.counts.get(key);
    if (c === undefined) return;
    this.len -= 1;
    if (c <= 1) { this.counts.delete(key); this.firstDepth.delete(key); }
    else this.counts.set(key, c - 1);
  }

  /** True when `key` is already an ancestor on the current path (descending closes a cycle). */
  repeats(key: string): boolean {
    return (this.counts.get(key) ?? 0) > 0;
  }

  /** The stack depth at which `key` first appears on the path (its cycle-target depth), or
   * Infinity when it is not on the path. */
  depthOf(key: string): number {
    return this.firstDepth.get(key) ?? Infinity;
  }

  /** The current path length (stack depth), i.e. the ply from the search root. */
  get stackLen(): number {
    return this.len;
  }

  /** Distinct positions currently on the path (for assertions/diagnostics). */
  get size(): number {
    return this.counts.size;
  }

  clear(): void {
    this.counts.clear();
    this.firstDepth.clear();
    this.len = 0;
  }
}
