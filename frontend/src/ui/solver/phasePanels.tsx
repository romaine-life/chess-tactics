// Per-phase detail panels — one component per SolveStep variant, each rendering that step's
// ACTUAL data the way bender-world's Perceive/Decide/Act/Reward/Learn panels show the math:
// a one-line "what this phase does" rule, then the step's numbers/lists verbatim. The
// dispatcher reads the lab view-model (SolverPhaseData — exactly ONE key set per step), so a
// new SolveStep variant surfaces here as a missing-panel compile hint, not a blank pane.

import type { ReactElement } from 'react';
import type { Move } from '../../core/types';
import type { DecidedPosition, OrderedMove, RootBounds, SearchWindow, Value } from '../../core/solver';
import type { SolverPhaseData } from '../../lab/solver/phaseData';
import type {
  BackUpPhaseData, ConvergePhaseData, DescendPhaseData, EnumeratePhaseData, GeneratePhaseData,
  OrderPhaseData, PropagatePhaseData, QuiescePhaseData, ReadValuePhaseData, SeedTerminalsPhaseData,
} from '../../lab/solver/phaseData';

// ── Shared formatting ─────────────────────────────────────────────────────────────────────

const fmtInt = (n: number): string => Math.round(n).toLocaleString();

/** Position keys are canonical numeric strings — long; show a stable short handle. */
export const fmtKey = (key: string): string => (key.length > 10 ? `#${key.slice(0, 10)}…` : `#${key}`);

const fmtBound = (n: number): string =>
  n >= Number.MAX_SAFE_INTEGER / 2 || n === Infinity ? '+∞'
  : n <= -Number.MAX_SAFE_INTEGER / 2 || n === -Infinity ? '−∞'
  : String(n);

export const fmtMove = (m: { pieceId: string; move: Move }): string =>
  `${m.pieceId} → (${m.move.x},${m.move.y})${m.move.capture ? ` ×${m.move.capture}` : ''}`;

/** Coloured outcome chip: "win (player) · DTM 3". */
export function ValueBadge({ value }: { value: Value }): ReactElement {
  return (
    <span
      className={`solver-value v-${value.outcome}`}
      data-help={value.distancePlies !== undefined
        ? `A proven ${value.outcome}${value.winner ? ` for ${value.winner}` : ''}. DTM ${value.distancePlies} = distance to mate: ${value.distancePlies} plies (half-moves) to the game-ending capture under perfect play by both sides.`
        : value.outcome === 'draw'
          ? 'A proven draw: neither side can force the winning capture in any finite number of moves (this game has no repetition rule, so play can cycle forever).'
          : `Outcome under perfect play: ${value.outcome}.`}
      data-help-glossary="dtm"
      title={value.distancePlies !== undefined ? `DTM = distance to mate in plies (${value.distancePlies} half-moves to the deciding capture)` : undefined}
    >
      {value.outcome}
      {value.winner ? ` (${value.winner})` : ''}
      {value.distancePlies !== undefined ? ` · DTM ${value.distancePlies}` : ''}
    </span>
  );
}

function WindowRow({ window }: { window: SearchWindow }): ReactElement {
  return (
    <p
      className="solver-panel-row mono"
      data-help="The α/β window threaded through the search. This proof search deliberately never prunes a proof node with it (a cutoff could hide a SHORTER mate, so distances would stop being exact) — the window still steers the quiescence leaf and value ordering."
      data-help-glossary="alpha-beta"
      title="The α/β window. The proof nodes search FULL-WIDTH (no cutoff — exact distances); the window still steers the quiescence leaf and ordering."
    >
      window α <b>{fmtBound(window.alpha)}</b> · β <b>{fmtBound(window.beta)}</b>
      {' · '}depth <b>{window.depth}</b> · ply <b>{window.ply}</b>
    </p>
  );
}

/** One frontier position's WHY — the back-up rule's arithmetic with the real numbers in it. */
export function WhyLine({ d }: { d: DecidedPosition }): ReactElement | null {
  const census = d.successorCensus;
  if (!census) return null;
  const dtm = d.value.distancePlies;
  if (d.value.outcome === 'win' && d.witnessMove) {
    const w = d.witnessMove;
    return (
      <span className="solver-why-line" data-help="The some-move-wins rule: a position is a WIN when at least one move reaches a position already proven LOST for the opponent; the win distance is that child's DTM + 1 (the move itself).">
        <b className="mono">{fmtMove(w)}</b> reaches <span className="mono">{fmtKey(w.childKey)}</span>, a proven loss-for-opponent at DTM {w.childValue.distancePlies}
        {dtm !== undefined && w.childValue.distancePlies !== undefined ? <> ⇒ win in {dtm} = {w.childValue.distancePlies}+1</> : null}
        {census.opponentLosses > 1 ? <> · {census.opponentLosses} of {census.moves} moves win</> : null}
      </span>
    );
  }
  if (d.value.outcome === 'loss') {
    return (
      <span className="solver-why-line" data-help="The all-moves-lose rule: a position is a LOSS only when EVERY move reaches a position already proven WON for the opponent; the loss distance is the best defence's DTM + 1.">
        all {census.moves} moves reach proven opponent wins
        {census.bestDefenceDTM !== undefined && dtm !== undefined
          ? <> · best defence DTM {census.bestDefenceDTM} ⇒ loss in {dtm} = {census.bestDefenceDTM}+1</>
          : null}
      </span>
    );
  }
  return null;
}

function BoundsRow({ bounds }: { bounds: RootBounds }): ReactElement {
  return (
    <p className="solver-panel-row">
      root bounds [<b>{bounds.lower}</b>, <b>{bounds.upper}</b>]{bounds.proven ? ' — proven' : ''}
      {bounds.bestDistancePlies !== undefined ? ` · best DTM ${bounds.bestDistancePlies}` : ''}
    </p>
  );
}

function MoveList({ moves, mark }: { moves: OrderedMove[]; mark?: number }): ReactElement {
  return (
    <ol className="solver-movelist">
      {moves.map((m, i) => (
        <li key={`${m.pieceId}-${m.move.x}-${m.move.y}-${i}`} className={mark === i ? 'is-marked' : ''}>
          <span className="mono">{fmtMove(m)}</span>
          <em title="MVV ordering key: victim piece value, −1 for a quiet move">k={m.orderKey}</em>
        </li>
      ))}
    </ol>
  );
}

// ── Retrograde panels ─────────────────────────────────────────────────────────────────────

export function EnumeratePanel({ data }: { data: EnumeratePhaseData }): ReactElement {
  return (
    <div className="solver-panel">
      <h4>Enumerate</h4>
      <p className="solver-panel-why">List every position reachable from the root — the state space the induction will label.</p>
      <p className="solver-panel-row">states enumerated <b>{fmtInt(data.statesEnumerated)}</b></p>
      {data.current ? (
        <p className="solver-panel-row">
          root <span className="mono">{fmtKey(data.current.key)}</span> · branching <b>{data.current.branching}</b> legal moves
        </p>
      ) : null}
    </div>
  );
}

export function SeedTerminalsPanel({ data }: { data: SeedTerminalsPhaseData }): ReactElement {
  return (
    <div className="solver-panel">
      <h4>Seed terminals</h4>
      <p className="solver-panel-why">Positions where the game is already over get their value at distance 0 — the base of the backward induction. These are the first PROVEN positions; every later value is measured back from them.</p>
      <p className="solver-panel-row">terminals <b>{fmtInt(data.terminalCount)}</b> · decisive seeds shown <b>{data.seeded.length}</b></p>
      {data.seedCounts ? (
        <p className="solver-panel-row">
          seeded census — <b className="w">win {fmtInt(data.seedCounts.win)}</b> · <b className="l">loss {fmtInt(data.seedCounts.loss)}</b> · <b className="d">draw {fmtInt(data.seedCounts.draw)}</b>
          <span className="dim"> (draws here are stalemate-like terminals; they seed nothing — only decisive terminals propagate)</span>
        </p>
      ) : null}
      {data.seeded.length > 0 ? (
        <ul className="solver-poslist">
          {data.seeded.map((d) => (
            <li key={d.key}><span className="mono">{fmtKey(d.key)}</span> <ValueBadge value={d.value} /></li>
          ))}
        </ul>
      ) : (
        <p className="solver-panel-row dim">No decisive terminal on this board — nothing to propagate; the drain will label everything a draw.</p>
      )}
    </div>
  );
}

export function PropagatePanel({ data }: { data: PropagatePhaseData }): ReactElement {
  return (
    <div className="solver-panel">
      <h4>Propagate — sweep {data.sweepIndex}</h4>
      <p className="solver-panel-why">
        One backward-induction layer: a position is a <b>WIN</b> if SOME move reaches a proven loss-for-opponent
        (win DTM = that child&rsquo;s +1), a <b>LOSS</b> if EVERY move reaches a proven win-for-opponent
        (loss DTM = the best defence&rsquo;s +1). Sweep {data.sweepIndex} decides exactly the DTM-{data.sweepIndex} layer.
        Each position below shows which rule fired and its arithmetic.
      </p>
      <p className="solver-panel-row">
        newly decided (sample) <b className="w">{data.newlyWon} W</b> / <b className="l">{data.newlyLost} L</b>
        {' · '}still unknown <b>{fmtInt(data.remainingUnknown)}</b>
      </p>
      {data.frontier.length > 0 ? (
        <ul className="solver-poslist why">
          {data.frontier.map((d) => (
            <li key={d.key}>
              <div>
                <span className="mono">{fmtKey(d.key)}</span> <ValueBadge value={d.value} />
              </div>
              <WhyLine d={d} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="solver-panel-row dim">Nothing new this sweep — the frontier is exhausted (fixpoint next).</p>
      )}
    </div>
  );
}

export function ConvergePanel({ data }: { data: ConvergePhaseData }): ReactElement {
  return (
    <div className="solver-panel">
      <h4>Converge — sweep {data.sweepIndex}</h4>
      <p className="solver-panel-why">
        Fixpoint check: can any later sweep still decide a position? Once the frontier queue drains, no — and
        whatever is still unknown then is a proven <b>DRAW</b>: neither side can force the winning capture in
        finite plies (this game has no repetition rule, so play can cycle forever).
      </p>
      <p className="solver-panel-row">decided this sweep <b>{fmtInt(data.decidedThisSweep)}</b> · at fixpoint <b>{data.reachedFixpoint ? 'yes' : 'no'}</b></p>
      <p className="solver-panel-row">
        proven so far — <b className="w">win {fmtInt(data.proven.win)}</b> · <b className="l">loss {fmtInt(data.proven.loss)}</b> · <b className="d">draw {fmtInt(data.proven.draw)}</b>
      </p>
      {data.reachedFixpoint && data.drainedToDraw !== undefined ? (
        <p className="solver-panel-row">
          <b className="d">drain:</b> the {fmtInt(data.drainedToDraw)} positions still unknown at the fixpoint are all proven <b className="d">DRAWS</b> — unknown drops to 0.
        </p>
      ) : null}
      {!data.reachedFixpoint ? (
        <p className="solver-panel-row dim">draws stay at the terminal count until the fixpoint — loopy draws are only proven by the final drain.</p>
      ) : null}
    </div>
  );
}

export function ReadValuePanel({ data }: { data: ReadValuePhaseData }): ReactElement {
  return (
    <div className="solver-panel">
      <h4>Read value</h4>
      <p className="solver-panel-why">The root position's entry in the finished tablebase IS the board's game value under perfect play.</p>
      <p className="solver-panel-row">root value <ValueBadge value={data.rootValue} /></p>
      {data.pieceValues && data.pieceValues.entries.length > 0 ? (
        <>
          <p className="solver-panel-row dim">Honest piece values by ablation — remove every piece of a type, re-solve, read the difference:</p>
          <table className="solver-table">
            <thead>
              <tr><th>piece</th><th>baseline</th><th>ablated</th><th>worth</th></tr>
            </thead>
            <tbody>
              {data.pieceValues.entries.map((e) => (
                <tr key={`${e.side}-${e.type}`}>
                  <td>{e.side} {e.type}</td>
                  <td><ValueBadge value={e.baselineValue} /></td>
                  <td><ValueBadge value={e.ablatedValue} /></td>
                  <td>
                    {e.outcomeFlipped ? 'flips the outcome'
                      : e.distanceDeltaPlies !== undefined ? `${e.distanceDeltaPlies >= 0 ? '+' : ''}${e.distanceDeltaPlies} plies`
                      : '±0'}
                    {e.authoredScalar !== undefined ? ` (authored ${e.authoredScalar})` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.pieceValues.partial ? <p className="solver-panel-row dim">ablation partial — budget ran out before every piece was re-solved.</p> : null}
        </>
      ) : (
        <p className="solver-panel-row dim">No piece-value ablation on this trace.</p>
      )}
    </div>
  );
}

// ── Search panels ─────────────────────────────────────────────────────────────────────────

export function GeneratePanel({ data }: { data: GeneratePhaseData }): ReactElement {
  return (
    <div className="solver-panel">
      <h4>Generate</h4>
      <p className="solver-panel-why">List the legal moves at this node — the branches alpha-beta will consider.</p>
      <WindowRow window={data.window} />
      <p className="solver-panel-row">generated <b>{data.generated}</b> moves · line from root: <span className="mono">{data.line.length ? data.line.map(fmtMove).join(' · ') : '(root)'}</span></p>
    </div>
  );
}

export function OrderPanel({ data }: { data: OrderPhaseData }): ReactElement {
  const ttShortCircuit = data.ttHit && data.ordered.length === 0;
  return (
    <div className="solver-panel">
      <h4>Order</h4>
      <p className="solver-panel-why">
        Sort captures first (most-valuable-victim). This proof search never α/β-prunes, so ordering does not cut
        the tree — it surfaces the winning lines EARLY, proving the short mates first and filling the
        transposition table with the strongest reusable proofs.
      </p>
      <WindowRow window={data.window} />
      {data.ttHit ? (
        <p className="solver-panel-row" data-help="Transposition table: every position proven once is cached under its canonical key; reaching it again by any move order returns the stored proof instead of re-searching." data-help-glossary="transposition-table">
          transposition-table hit <span className="mono">{fmtKey(data.ttHit.key)}</span> <ValueBadge value={data.ttHit.value} />
          {ttShortCircuit ? ' — already PROVEN, so this whole subtree is skipped (nothing to order).' : ' — this position was already searched.'}
        </p>
      ) : null}
      {data.ordered.length > 0 ? <MoveList moves={data.ordered} /> : null}
    </div>
  );
}

export function DescendPanel({ data }: { data: DescendPhaseData }): ReactElement {
  return (
    <div className="solver-panel">
      <h4>Descend</h4>
      <p className="solver-panel-why">Recurse into the best-ordered child with the window negated and narrowed — the tree walk itself.</p>
      <WindowRow window={data.window} />
      <p className="solver-panel-row">into <b className="mono">{fmtMove(data.into)}</b></p>
      <p className="solver-panel-row">line: <span className="mono">{data.line.length ? data.line.map(fmtMove).join(' · ') : '(root)'}</span></p>
    </div>
  );
}

export function QuiescePanel({ data }: { data: QuiescePhaseData }): ReactElement {
  return (
    <div className="solver-panel">
      <h4>Quiesce</h4>
      <p className="solver-panel-why">
        The depth horizon: instead of scoring this leaf mid-exchange, keep resolving CAPTURES only until the
        position is quiet. Stand-pat is the static eval of doing nothing — declining every capture is always an
        option, so it is a floor. A quiescence value is a heuristic bound, never a proof.
      </p>
      <WindowRow window={data.window} />
      <p className="solver-panel-row" data-help="Stand-pat: the static evaluation of this leaf if the side to move declines every capture — the lower bound the capture extension tries to beat." data-help-glossary="quiescence">
        stand-pat <b>{data.standPat}</b> · pending captures <b>{data.pending.length}</b>
      </p>
      {data.pending.length > 0 ? <MoveList moves={data.pending} /> : null}
    </div>
  );
}

export function BackUpPanel({ data }: { data: BackUpPhaseData }): ReactElement {
  const rootLevel = data.window.ply === 0;
  return (
    <div className="solver-panel">
      <h4>Back up{rootLevel ? ' — root' : ''}</h4>
      <p className="solver-panel-why">
        Fold the child&rsquo;s value into this node, negated (negamax: my child&rsquo;s win is my loss). The proof rule is
        the SAME minimax rule retrograde runs backward: a <b>WIN</b> if some child is a proven loss-for-opponent
        (min DTM +1), a <b>LOSS</b> if every child is a proven win-for-opponent (max +1). This proof search is
        FULL-WIDTH — it never takes an α/β cutoff, because a cutoff could prune a sibling holding a SHORTER mate
        and the distances would stop being exact.
      </p>
      <WindowRow window={data.window} />
      <p className="solver-panel-row">
        child value <ValueBadge value={data.childValue} />
        {data.cutoff ? <b className="solver-cutoff"> β-cutoff</b> : null}
      </p>
      {data.rootBounds ? (
        <>
          <BoundsRow bounds={data.rootBounds} />
          <p className="solver-panel-row dim">a completed deepening iteration — the root answer so far.</p>
        </>
      ) : null}
    </div>
  );
}

// ── Dispatcher — exactly one key is set per step (lab/solver/phaseData contract) ──────────

export function PhasePanel({ data, hasStarted }: { data: SolverPhaseData | null; hasStarted?: boolean }): ReactElement {
  if (!data) {
    return (
      <div className="solver-panel">
        <h4>Phase detail</h4>
        <p className="solver-panel-why">
          {hasStarted
            ? <>At the start of the trace — press <b>Step</b> (or Play) to consume the first phase.</>
            : <>Build a solve, then press <b>Step</b> (or Play) — each step shows here exactly what the solver just did and why.</>}
        </p>
      </div>
    );
  }
  if (data.enumerate) return <EnumeratePanel data={data.enumerate} />;
  if (data.seedTerminals) return <SeedTerminalsPanel data={data.seedTerminals} />;
  if (data.propagate) return <PropagatePanel data={data.propagate} />;
  if (data.converge) return <ConvergePanel data={data.converge} />;
  if (data.readValue) return <ReadValuePanel data={data.readValue} />;
  if (data.generate) return <GeneratePanel data={data.generate} />;
  if (data.order) return <OrderPanel data={data.order} />;
  if (data.descend) return <DescendPanel data={data.descend} />;
  if (data.quiesce) return <QuiescePanel data={data.quiesce} />;
  if (data.backUp) return <BackUpPanel data={data.backUp} />;
  return (
    <div className="solver-panel">
      <h4>Phase detail</h4>
      <p className="solver-panel-why">This step carried no per-phase detail (coarse batch) — single-step to see the phase math.</p>
    </div>
  );
}
