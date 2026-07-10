// Solver Help — the "how do I use this?" orientation page (the Glossary defines terms;
// THIS explains the tool). Written for someone landing cold: what the tool is, why demo
// boards exist, the build-then-step model, how to read each region of the screen, and
// how to check it isn't lying. Takes over the main pane like the Glossary tab does.

import type { ReactElement } from 'react';

interface Section {
  id: string;
  title: string;
  body: ReactElement;
}

const SECTIONS: Section[] = [
  {
    id: 'what',
    title: 'What this tool is',
    body: (
      <>
        <p>
          Every board in this game is a finite two-player game with no hidden information, so every board
          has a definite answer under perfect play: <b>one side can force a win, or neither can and it is a
          draw</b> (Zermelo&rsquo;s theorem). This tool computes that answer for a board — and its whole point is
          that you <b>drive and watch the computing</b>, one phase at a time, instead of being handed a result.
          The answer is the byproduct; seeing <i>how</i> it is found is the product.
        </p>
        <p>
          It is the front of the per-board AI pipeline: a board that solves exactly needs no learned
          evaluation (perfect play becomes a lookup), and a board too big to solve is where value
          functions earn their keep. Either way you learn which world the board lives in — measured,
          not guessed.
        </p>
      </>
    ),
  },
  {
    id: 'two-solvers',
    title: 'The two solvers inside (and who picks)',
    body: (
      <>
        <p>
          <b>Retrograde analysis</b> (strong solve): for a small enough board, work out the true value of{' '}
          <i>every reachable position</i> by seeding the game-over positions and applying the minimax
          back-up rule in backward sweeps until nothing new can be decided. You watch the proven value
          spread outward from the terminals, layer by layer — and it ends with the exact answer plus honest
          piece values (remove a piece type, re-solve, see if the outcome changes).
        </p>
        <p>
          <b>Search</b> (bounded weak solve): for boards too big to enumerate, an iterative-deepening
          alpha-beta look-ahead walks concrete lines under a time/node budget. You watch it generate moves,
          order them, descend, resolve captures, and back values up. It ends with either a proven root value
          or an honest interval (&ldquo;somewhere between loss and win, here is how far I got&rdquo;) — never a fake proof.
        </p>
        <p>
          You do not pick blind: the <b>feasibility card</b> in the right rail sizes the board first
          (state-space estimate, memory, verdict). <span className="solver-help-verdict">SOLVABLE</span> recommends
          retrograde; <span className="solver-help-verdict">HARD</span>/<span className="solver-help-verdict">INFEASIBLE</span>{' '}
          route to search. Mode <b>auto</b> follows that recommendation.
        </p>
      </>
    ),
  },
  {
    id: 'demo-boards',
    title: 'Why demo boards? Where are my levels?',
    body: (
      <>
        <p>
          The three demo boards (K+Q vs K, K vs K, K+P vs K) are tiny boards built in code — <b>not</b> game
          levels. They exist because you already know their right answers (K+Q vs K is mate-in-1; two bare
          kings can never catch each other; K+P vs K hinges on promotion vs blockade). Learning the tool on
          boards where you can <i>catch it lying</i> is the point. They also solve instantly, so every control
          is responsive while you learn them.
        </p>
        <p>
          <b>Real levels</b> enter through the catalog: Studio &rarr; <b>Board Solver</b> shelf &rarr; pick a level &rarr;{' '}
          <b>Open Solver</b>. That level then appears as the <code>Level:</code> option at the top of the Board
          select in the rail. Expect most authored boards to come back <i>hard</i> — Break the Line is ~5.6&times;10¹⁰
          positions — which is itself the finding: those boards get bounded search here, or a long bounded run
          on the <b>Cluster run</b> tab.
        </p>
      </>
    ),
  },
  {
    id: 'quick-start',
    title: 'Quick start (60 seconds)',
    body: (
      <ol>
        <li>In the rail, leave the Board select on <b>K+Q vs K · 3&times;3</b>.</li>
        <li>Press <b>Build &amp; solve</b>. The solver runs the whole solve and records every step of its thinking — instant on a demo board. The transport lights up.</li>
        <li>Press <b>Step</b> (or <kbd>&rarr;</kbd>) repeatedly. Each press advances one phase; the <b>Phase detail</b> panel narrates exactly what the solver just did and the arithmetic of why.</li>
        <li>At <b>Propagate</b>, watch the frontier: positions decided this sweep land as chips under the board — click one to see that position and its proof.</li>
        <li>Press <b>+100</b> to run to the end: <b>Read value</b> shows the proven answer (win, player, DTM 1) and the piece-value-by-ablation table.</li>
        <li>Press <kbd>&larr;</kbd> to step backward any time; <b>Play</b> + the speed slider autoplays; <b>Sweep ▸</b> jumps a whole backward-induction layer.</li>
      </ol>
    ),
  },
  {
    id: 'build-first',
    title: 'Do I have to build first, then inspect?',
    body: (
      <>
        <p>
          Yes — <b>Build &amp; solve</b> computes the solve up front and records the full step trace; the
          transport then drives that recording. This is not a compromise of honesty: the solver is
          deterministic, so the recording is <i>byte-identical</i> to what a live run does — same steps, same
          numbers, nothing staged or summarized.
        </p>
        <p>
          Recording first is what buys the controls a live algorithm cannot give you: stepping{' '}
          <b>backward</b>, jumping by sweeps, replaying at any speed, and loading a cluster run&rsquo;s recorded
          trace into this same viewer. On demo boards the build is instant so it feels live; a deep search
          build takes a visible beat (the rail says so while it works).
        </p>
      </>
    ),
  },
  {
    id: 'reading',
    title: 'Reading the screen',
    body: (
      <ul>
        <li><b>Transport bar</b> (top) — drive it: Play/Pause (<kbd>Space</kbd>), Back (<kbd>&larr;</kbd>), Step (<kbd>&rarr;</kbd>), +10, +100, Sweep ▸ jumps, Reset. <b>Batch</b> = phases per Step press; <b>Speed</b> = autoplay rate.</li>
        <li><b>Phase pipeline</b> — where you stand in the algorithm&rsquo;s loop (Enumerate &rarr; Seed terminals &rarr; Propagate &rarr; Converge &rarr; Read value, or the search five). The <b>trail chips</b> below it are the path you have taken so far — click to revisit.</li>
        <li><b>Board</b> — the position under inspection, on the real board renderer. Its badge is that position&rsquo;s proven value (e.g. <code>WIN · PLAYER · DTM 1</code>). During Propagate, the <b>newly-decided</b> chips under it are this sweep&rsquo;s frontier.</li>
        <li><b>Phase detail</b> (right) — the <i>why</i>: which rule fired and its arithmetic for this exact step (&ldquo;queen &rarr; (0,0) reaches a proven loss-for-opponent at DTM 0 &rArr; win in 1&rdquo;).</li>
        <li><b>Status strip</b> (bottom) — the running census: positions enumerated, proven W/L/D, unknown remaining, coverage %, and the root&rsquo;s current bounds. This line is your progress meter.</li>
        <li><b>Help bar</b> — hover any control for what it does; press <kbd>S</kbd> to pin the text (pinned entries link into the Glossary).</li>
      </ul>
    ),
  },
  {
    id: 'trust',
    title: 'How do I know it is working?',
    body: (
      <ol>
        <li><b>Check it against yourself.</b> On the demos you know the answer — the tool must agree (K+Q vs K: win, player, DTM 1; K vs K: draw, zero terminals). If it ever disagrees with something you can verify by hand, it is wrong and you have caught it.</li>
        <li><b>Watch the census move the right way.</b> Every Converge pass, <i>unknown</i> must fall and <i>proven</i> rise; the root bounds only ever tighten (never loosen) until <code>[win, win] ✓ proven</code> — or, in bounded search, until the budget stops it with an honest open interval.</li>
        <li><b>Demand the witness.</b> Every decided position shows the move and child position that prove it. The proof is inspectable at every step — nothing is asserted without its arithmetic.</li>
      </ol>
    ),
  },
  {
    id: 'terms',
    title: 'Unfamiliar words?',
    body: (
      <p>
        Every term the panels use — DTM, sweep, fixpoint, minimax back-up, stand-pat, transposition table,
        GHI — has a plain-language entry in the <b>Glossary</b> tab. Fastest path: hover the thing that
        confused you, press <kbd>S</kbd>, and take the &ldquo;See in Glossary&rdquo; link.
      </p>
    ),
  },
];

/** The Help tab: an orientation page that takes over the main pane (like the Glossary). */
export function SolverHelpPanel(): ReactElement {
  return (
    <div className="solver-help" aria-label="Solver help">
      <p className="solver-note">
        How to use the Board Solver. For what the <i>words</i> mean, see the Glossary tab; this page is
        about what you are looking at and how to drive it.
      </p>
      {SECTIONS.map((s) => (
        <section key={s.id} className="solver-help-section" id={`solver-help-${s.id}`}>
          <h3>{s.title}</h3>
          {s.body}
        </section>
      ))}
    </div>
  );
}
