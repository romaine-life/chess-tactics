// Solver Glossary — the static learning reference the plan's Phase-2 DoD names (retrograde
// analysis, tablebase, DTM, weak/strong solve, minimax back-up rule, fixpoint, GHI) plus the
// search-side vocabulary the panels use. Each entry has a stable id so the HelpBar's pinned
// "See in Glossary →" link (data-help-glossary="<id>") can jump to and highlight it.

import { useEffect, useRef, type ReactElement } from 'react';

export interface GlossaryEntry {
  id: string;
  term: string;
  body: string;
}

export const SOLVER_GLOSSARY: GlossaryEntry[] = [
  {
    id: 'retrograde',
    term: 'Retrograde analysis',
    body: 'Solving a game BACKWARD: seed every game-over position with its known value, then repeatedly apply the minimax back-up rule to positions one move earlier, until nothing new can be decided. The result is a proven value for every reachable position — a strong solve. This is exactly how chess endgame tablebases are built.',
  },
  {
    id: 'tablebase',
    term: 'Tablebase',
    body: 'The lookup table a retrograde solve produces: for every reachable position, its proven value (win / loss / draw) and distance. Once built, "perfect play" is just following the table — no search needed.',
  },
  {
    id: 'dtm',
    term: 'DTM (distance to mate)',
    body: 'How many plies (half-moves) a proven win or loss is from the game-ending capture, under perfect play by BOTH sides — the winner forcing the quickest end, the loser dragging it out longest. Terminals are DTM 0; a mate-in-1 position is DTM 1. Draws carry no distance: nothing is ever forced.',
  },
  {
    id: 'minimax-backup',
    term: 'Minimax back-up rule',
    body: 'The one rule both solvers run. A position is a WIN for the side to move if SOME move reaches a position already proven lost for the opponent (win DTM = that child’s DTM + 1, minimized). It is a LOSS only if EVERY move reaches a position proven won for the opponent (loss DTM = the best defence’s DTM + 1). Retrograde applies it backward layer by layer; the search applies it at each node as values back up the tree (negamax is the same rule with the sign flipped).',
  },
  {
    id: 'sweep',
    term: 'Sweep / frontier',
    body: 'One backward-induction layer. Sweep d decides exactly the positions at DTM d — the frontier — using the values proven in earlier sweeps. Watching the sweeps is watching the value literally spread outward from the terminal positions.',
  },
  {
    id: 'fixpoint',
    term: 'Fixpoint',
    body: 'The moment no further position can be decided: the frontier queue has drained, so running another sweep would change nothing. Everything still unknown at the fixpoint is then proven a DRAW (the drain) — if a forced capture existed for either side, some sweep would have found it.',
  },
  {
    id: 'draw-drain',
    term: 'Undecided → draw (the drain)',
    body: 'This game has no repetition or 50-move rule, so play can cycle forever. A position where neither side can FORCE the winning capture in finitely many moves is a draw. Those draws cannot be proven mid-solve — only once the fixpoint shows no more wins/losses exist do the remaining unknowns all become proven draws.',
  },
  {
    id: 'strong-weak-solve',
    term: 'Strong vs weak solve',
    body: 'A STRONG solve proves the value of every reachable position (the full tablebase — what retrograde builds on small boards). A WEAK solve proves the value of the root position only, typically by search. This bench runs retrograde where the state space fits, bounded search otherwise.',
  },
  {
    id: 'alpha-beta',
    term: 'Alpha-beta window',
    body: 'The (α, β) interval a search carries: values ≤ α cannot improve the searcher’s best; values ≥ β prove the opponent would avoid this line. Classic alpha-beta PRUNES on that proof. This proof search deliberately does NOT prune proof nodes — a cutoff could hide a shorter mate, making the DTM inexact — the window only steers the quiescence leaf and move ordering.',
  },
  {
    id: 'iterative-deepening',
    term: 'Iterative deepening',
    body: 'Run the search to depth 1, then 2, then 3… Each iteration re-sorts the root moves by the previous depth’s scores and proves the shortest mates first. It makes the solve ANYTIME: stop it whenever and the last completed depth’s bounds still hold.',
  },
  {
    id: 'quiescence',
    term: 'Quiescence / stand-pat',
    body: 'At the depth horizon a raw evaluation mid-exchange is garbage (you would score a queen as captured "for free" one ply before the recapture). Quiescence keeps resolving CAPTURES only until the position is quiet. Stand-pat is the static eval of declining every capture — always an option, so it floors the result.',
  },
  {
    id: 'transposition-table',
    term: 'Transposition table (TT)',
    body: 'A cache keyed by canonical position: a position proven once is never searched again, whichever move order reaches it. The accumulated proofs ARE the partial tablebase a search-mode run hands back. Only exact, path-independent proofs are stored (see GHI).',
  },
  {
    id: 'ghi',
    term: 'GHI (graph-history interaction)',
    body: 'The classic soundness trap of caching in cyclic games: a repetition on the CURRENT search path scores as a draw, but that draw is relative to the path taken — the same position reached another way might be a win. Caching such a path-dependent value and reusing it globally proves wrong values. This solver marks cycle draws path-dependent and never writes them to the TT.',
  },
  {
    id: 'root-bounds',
    term: 'Root bounds',
    body: 'The tightening [lower, upper] interval on the root’s value as the anytime solve runs. lower = the best outcome already proven forceable; upper = the best outcome not yet refuted. When they collapse to one outcome, the root is proven.',
  },
  {
    id: 'ablation',
    term: 'Piece values by ablation',
    body: 'The honest, board-specific worth of a piece type: remove every piece of that type, re-solve, and read how the ROOT value changed (outcome flip, or win-distance delta in plies). Measured against perfect play, not authored heuristics — compare it with the hand-tuned eval scalars.',
  },
];

export function SolverGlossaryPanel({ highlight }: { highlight?: string | null }): ReactElement {
  const highlightRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (highlight && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'start' });
    }
  }, [highlight]);

  return (
    <div className="solver-glossary" aria-label="Solver glossary">
      <p className="solver-note">
        The vocabulary the panels use. Hover anything on the Stepper for a one-line explanation
        (press <b>S</b> to pin it — a pinned entry links back here).
      </p>
      <dl>
        {SOLVER_GLOSSARY.map((e) => (
          <div
            key={e.id}
            className={`solver-glossary-entry${highlight === e.id ? ' is-highlight' : ''}`}
            ref={(el) => { if (highlight === e.id) highlightRef.current = el; }}
          >
            <dt>{e.term}</dt>
            <dd>{e.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
