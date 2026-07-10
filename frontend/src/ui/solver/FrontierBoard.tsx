// The stepper's board view — the CURRENT position on the real board renderer (the exact
// GameLab replay path: levelToEditorBoard + unitsForGamePieces + ViewPane + StudioReadOnlyBoard),
// with the retrograde frontier made visible: each SeedTerminals/Propagate step carries newly
// decided positions (inline GameStates), and the board flips to them as they land — a chip strip
// picks within the step's sample, and the selected position's WHY (the back-up rule's witness
// move + arithmetic) rides under the caption. In search mode the board follows the current line
// from the root, so the pieces literally walk the tree as the search descends and backs up.
//
// Honesty guards for replayed traces (the board is user-picked, the trace is a file):
//  - folding a search line onto a mismatched board is DETECTED (applyMove silently no-ops on an
//    unknown pieceId), falls back to the root and says so — never a silently wrong position;
//  - a frontier entry without an inline state renders the ROOT board; the value badge is shown
//    ONLY when the shown position IS the valued position (never another position's value).

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { Level } from '../../core/level';
import type { GameState } from '../../core/types';
import { applyMove } from '../../core/rules';
import { createFromLevel } from '../../game/setup';
import { levelToEditorBoard, unitsForGamePieces } from '../../core/levelBoard';
import { StudioReadOnlyBoard } from '../../render/StudioReadOnlyBoard';
import { ViewPane } from '../shared/ViewPane';
import type { SolverStepResult, SolverViewState } from '../../lab/solver/solverRunner';
import { fmtKey, fmtMove, WhyLine } from './phasePanels';

export function FrontierBoard({
  level,
  view,
  lastStep,
}: {
  level: Level;
  view: SolverViewState | null;
  lastStep: SolverStepResult | null;
}): ReactElement {
  const [zoom, setZoom] = useState(0.7);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [sel, setSel] = useState(0);

  // A new step landing resets the pick to the first newly-decided position, so during play
  // the frontier visibly lands on the board without any clicking.
  const stepIdx = lastStep?.index ?? -1;
  useEffect(() => { setSel(0); }, [stepIdx]);

  const baseBoard = useMemo(() => levelToEditorBoard(level), [level]);
  // Root state at seed 0 — the same seed the runner pins, so the displayed root matches the
  // position the solver actually solves.
  const rootState = useMemo(() => createFromLevel(level, 0), [level]);

  // Search mode: fold the current line's moves onto the root — the position being searched.
  // A trace replayed over the WRONG board can reference pieceIds this board doesn't have
  // (applyMove silently no-ops); detect that and fall back to the root with a warning.
  const line = view?.mode === 'search' ? view.line : null;
  const { lineState, lineMismatch } = useMemo((): { lineState: GameState | null; lineMismatch: boolean } => {
    if (!line) return { lineState: null, lineMismatch: false };
    let state: GameState = rootState;
    try {
      for (const om of line) {
        const piece = state.pieces.find((p) => p.id === om.pieceId && p.alive);
        if (!piece) return { lineState: null, lineMismatch: true };
        state = applyMove(state, om.pieceId, om.move).state;
      }
    } catch {
      return { lineState: null, lineMismatch: true };
    }
    return { lineState: state, lineMismatch: false };
  }, [line, rootState]);

  const frontier = view && view.mode !== 'search' ? view.frontier : [];
  const selIndex = frontier.length > 0 ? Math.min(sel, frontier.length - 1) : -1;
  const selEntry = selIndex >= 0 ? frontier[selIndex] : null;

  const shownState: GameState = lineState ?? selEntry?.state ?? rootState;
  // The badge claims "THIS position has THIS value" — only honest when the frontier entry's
  // own board is what is actually shown (recorded traces may omit inline states).
  const shownValue = lineState || !selEntry?.state ? null : selEntry.value;

  const board = useMemo(
    () => ({ ...baseBoard, units: unitsForGamePieces(shownState.pieces) }),
    [baseBoard, shownState],
  );

  const caption = lineMismatch
    ? <b className="solver-board-warn">trace/board mismatch — this line references pieces this board does not have; showing the root. Pick the board the trace was recorded on.</b>
    : lineState
      ? (line && line.length > 0
        ? <>root + line: <span className="mono">{line.map(fmtMove).join(' · ')}</span></>
        : <>root position — the search starts here</>)
      : selEntry
        ? selEntry.state
          ? <>
              frontier position <b>{selIndex + 1}</b>/{frontier.length}
              {lastStep?.phase === 'SeedTerminals' ? ' (terminal seed)' : ' (decided this sweep)'}
            </>
          : <>
              frontier position <b>{selIndex + 1}</b>/{frontier.length} — <b>board not embedded in this trace</b>{' '}
              (<span className="mono">{fmtKey(selEntry.key)}</span>); showing the root position instead
            </>
        : <>root position (as authored)</>;

  return (
    <div className="solver-stage">
      <p className="solver-stage-caption">{caption}</p>
      {selEntry && !lineState ? (
        <p className="solver-stage-why"><WhyLine d={selEntry} /></p>
      ) : null}
      <div className={`solver-board${shownValue ? ` is-${shownValue.outcome}` : ''}`}>
        <ViewPane
          kind="board"
          ariaLabel="Solver board"
          zoom={zoom}
          pan={pan}
          minZoom={0.3}
          maxZoom={2}
          onZoomChange={setZoom}
          onPanChange={setPan}
        >
          <div className="tileset-view-board-content is-board">
            <StudioReadOnlyBoard board={board} boardZoom={zoom} boardPan={pan} ariaLabel="Solver board" />
          </div>
        </ViewPane>
        {shownValue ? (
          <span
            className={`solver-board-badge v-${shownValue.outcome}`}
            data-help={shownValue.distancePlies !== undefined
              ? `This exact position is a proven ${shownValue.outcome}${shownValue.winner ? ` for ${shownValue.winner}` : ''} at DTM ${shownValue.distancePlies} — ${shownValue.distancePlies} plies from the deciding capture under perfect play.`
              : `This exact position is a proven ${shownValue.outcome}.`}
            data-help-glossary="dtm"
          >
            {shownValue.outcome}
            {shownValue.winner ? ` · ${shownValue.winner}` : ''}
            {shownValue.distancePlies !== undefined ? ` · DTM ${shownValue.distancePlies}` : ''}
          </span>
        ) : null}
      </div>
      {frontier.length > 0 ? (
        <div
          className="solver-frontier-strip"
          aria-label="Frontier positions"
          data-help="The positions this step decided (a sample of the layer). Click a chip to land that position on the board; its witness-move arithmetic shows above the board."
        >
          <span className="solver-frontier-label">
            {lastStep?.phase === 'SeedTerminals' ? 'seeded' : 'newly decided'}
          </span>
          {frontier.map((entry, i) => (
            <button
              key={entry.key}
              type="button"
              className={`solver-frontier-chip v-${entry.value.outcome}${i === selIndex ? ' is-selected' : ''}`}
              onClick={() => setSel(i)}
              title={`${entry.value.outcome}${entry.value.winner ? ` for ${entry.value.winner}` : ''}${entry.value.distancePlies !== undefined ? ` in ${entry.value.distancePlies} plies` : ''}`}
            >
              {entry.value.outcome === 'win' ? 'W' : entry.value.outcome === 'loss' ? 'L' : 'D'}
              {entry.value.distancePlies !== undefined ? entry.value.distancePlies : ''}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
