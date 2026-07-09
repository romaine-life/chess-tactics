// The Board Solver bench (ADR-0069 §7 / plan Phase 2) — the Studio viewer surface that lets
// the owner DRIVE a solve and WATCH it think, one named phase at a time, in the exact idiom
// of the bender-world / eight-queens visualizers: pure runner + producer buffer + rAF clock
// (lab/solver/*), transport Controls with keyboard map, PhaseBar, per-phase math panels, and
// the position landing on the REAL board renderer. Styled as Studio chrome (GL_CSS-style
// scoped inline CSS), laid out like GameLab/Gym: output in the main pane, config in the
// 260px Controls rail. Hosts the Phase-3 cluster Run tab as its second tab (`runTab` prop —
// passed in by SolveViewer so this file never imports SolveRuns back, no import cycle).
//
// Three sources drive the SAME viewer (one SolverStepConfig): a live retrograde solve (tiny
// boards, gated by feasibility BEFORE Play — the engine generator computes the solve on the
// first pull), a live bounded search (any authored level), and a recorded SolveStep[] trace
// (the cluster-replay seam — load a JSON trace and scrub it identically).

import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { Level } from '../../core/level';
import { MODE_NAME } from '../../core/objectives';
import { estimateFeasibility } from '../../core/solver';
import type { FeasibilityReport, SolveBounds, SolveMode, SolveStep } from '../../core/solver';
import { useSolverStepper } from '../../lab/solver/useSolverStepper';
import { phaseDataFromStep, phaseIndexOfName } from '../../lab/solver/phaseData';
import type { SolverStepConfig, SolverStepResult, SolverViewState } from '../../lab/solver/solverRunner';
import { SOLVER_DEMO_BOARDS, demoBoardById } from './demoBoards';
import { SolverPhaseBar, PHASE_COLORS } from './PhaseBar';
import { SolverControls } from './SolverControls';
import { PhasePanel } from './phasePanels';
import { FrontierBoard } from './FrontierBoard';
import { SolverHelpBar } from './HelpBar';
import { SolverGlossaryPanel } from './SolverGlossary';
import { SolverHelpPanel } from './SolverHelp';

export type SolverTab = 'step' | 'run' | 'help' | 'glossary';

// Live-stepping budget: comfortably interactive in a browser tab. Retrograde additionally
// gates on the feasibility estimate below — the engine generator is collect-then-yield, so
// the FIRST pull computes the whole solve synchronously; the gate keeps that a beat, not a
// freeze. The cluster Run tab is the pressure valve for anything bigger.
const STEP_BOUNDS: SolveBounds = { wallClockMs: 120_000, maxStates: 200_000, maxMemoryBytes: 1 << 30 };
/** Live retrograde stepping refuses boards whose state-space estimate exceeds this. */
const LIVE_RETRO_STATE_CAP = 200_000;

const DEFAULT_MODE_CHOICE = 'auto' as const;
const DEFAULT_DEPTH_PLIES = 6;
const DEFAULT_BATCH = 1;
const DEFAULT_SPEED = 4;

const fmtInt = (n: number): string => (Number.isFinite(n) ? Math.round(n).toLocaleString() : '∞');

type ModeChoice = 'auto' | SolveMode;

/** Parse a recorded trace file: a bare SolveStep[] or {steps|trace: SolveStep[]}. */
function parseTraceJson(text: string): SolveStep[] {
  const doc: unknown = JSON.parse(text);
  const arr = Array.isArray(doc) ? doc
    : doc && typeof doc === 'object' && Array.isArray((doc as { steps?: unknown }).steps) ? (doc as { steps: unknown[] }).steps
    : doc && typeof doc === 'object' && Array.isArray((doc as { trace?: unknown }).trace) ? (doc as { trace: unknown[] }).trace
    : null;
  if (!arr || arr.length === 0) throw new Error('no steps found');
  for (const s of arr) {
    const kind = (s as { kind?: unknown })?.kind;
    if (kind !== 'retrograde' && kind !== 'search') throw new Error('not a SolveStep[] trace');
  }
  return arr as SolveStep[];
}

function StatusStrip({ view, stepCount, solved }: { view: SolverViewState | null; stepCount: number; solved: boolean }): ReactElement {
  const counts = view?.solvedCounts ?? { win: 0, loss: 0, draw: 0, undecided: 0 };
  const provenTotal = counts.win + counts.loss + counts.draw;
  const coverage = view && view.enumerated > 0 ? Math.min(100, (provenTotal / view.enumerated) * 100) : null;
  const bounds = view?.rootBounds ?? null;
  return (
    <div className="solver-status" aria-label="Solve status">
      <span data-help="Which vocabulary is running: retrograde (strong solve — every position proven) or search (bounded weak solve — the root proven)." data-help-glossary="strong-weak-solve">mode <b>{view?.mode ?? '—'}</b></span>
      <span data-help="Trace position: how many phase micro-steps have been consumed.">step <b>{stepCount}</b></span>
      {view?.mode !== 'search' ? (
        <>
          <span data-help="How many distinct reachable positions the Enumerate phase listed — the whole state space the induction labels.">enumerated <b>{view ? fmtInt(view.enumerated) : '—'}</b></span>
          <span data-help="Positions where the game is already over — proven at distance 0, the induction's base.">terminals <b>{view ? fmtInt(view.terminals) : '—'}</b></span>
          <span data-help="The running census of PROVEN positions — it accumulates sweep by sweep. Draws stay at the terminal count until the fixpoint drain proves the loopy draws." data-help-glossary="tablebase">proven <b className="w">{fmtInt(counts.win)}W</b> · <b className="l">{fmtInt(counts.loss)}L</b> · <b className="d">{fmtInt(counts.draw)}D</b></span>
          <span data-help="Positions not yet proven. Falls every sweep; drops to ZERO at the fixpoint, when the drain labels every remaining unknown a draw." data-help-glossary="draw-drain">unknown <b>{view ? fmtInt(view.remainingUnknown) : '—'}</b></span>
          {coverage !== null ? <span data-help="Proven positions as a share of the enumerated space — reaches 100% exactly at the fixpoint drain.">coverage <b>{coverage.toFixed(0)}%</b></span> : null}
        </>
      ) : (
        <>
          <span data-help="The current αβ window's remaining depth at the node under discussion." data-help-glossary="iterative-deepening">depth <b>{view?.window ? view.window.depth : '—'}</b></span>
          <span data-help="How deep the current line is — the moves folded onto the root to reach the position on the board.">line <b>{view ? view.line.length : 0}</b> plies</span>
        </>
      )}
      <span data-help="The tightening bounds on the ROOT position's value — the solve's answer. When lower = upper the root is proven; DTM is the proven distance to mate." data-help-glossary="root-bounds">
        root {bounds
          ? <>[<b>{bounds.lower}</b>, <b>{bounds.upper}</b>]{bounds.proven ? ' ✓ proven' : ''}{bounds.bestDistancePlies !== undefined ? ` · DTM ${bounds.bestDistancePlies}` : ''}</>
          : <b>unknown</b>}
      </span>
      {solved ? <span className="solver-status-done">trace complete</span> : null}
    </div>
  );
}

/** The walkthrough ticker — the last stretch of consumed steps as phase-colored chips (the
 * bender StepWalkthrough idiom, compacted): at a glance, WHERE the solve has just been —
 * P₃ C₃ P₄ C₄ … or G O D D Q B B — with the current step glowing. */
const TICKER_WINDOW = 14;
function StepTicker({ steps }: { steps: SolverStepResult[] }): ReactElement | null {
  if (steps.length === 0) return null;
  const window = steps.slice(-TICKER_WINDOW);
  const label = (r: SolverStepResult): string => {
    const s = r.step;
    if (s.kind === 'retrograde') {
      switch (s.phase) {
        case 'Enumerate': return 'Enum';
        case 'SeedTerminals': return 'Seed';
        case 'Propagate': return `P${s.sweep}`;
        case 'Converge': return `C${s.sweep}`;
        case 'ReadValue': return 'Value';
        default: return s satisfies never;
      }
    }
    const short = s.phase === 'BackUp' ? 'B' : s.phase[0];
    return s.phase === 'BackUp' && s.rootBounds ? 'B★' : short;
  };
  return (
    <div
      className="solver-ticker"
      aria-label="Recent steps"
      data-help="The last steps consumed, oldest to newest — the current one glows. Retrograde: P/C per sweep. Search: G-enerate, O-rder, D-escend, Q-uiesce, B-ack up (B★ = a root back-up carrying the root bounds)."
    >
      <span className="solver-ticker-label">trail</span>
      {window.map((r, i) => {
        const color = PHASE_COLORS[phaseIndexOfName(r.phase)] ?? PHASE_COLORS[0];
        const isCurrent = i === window.length - 1;
        return (
          <span
            key={r.index}
            className="solver-ticker-chip"
            title={`step ${r.index}: ${r.phase}`}
            style={{
              color: isCurrent ? color : `${color}99`,
              borderColor: isCurrent ? color : '#29323f',
              boxShadow: isCurrent ? `0 0 6px ${color}66` : 'none',
            }}
          >
            {label(r)}
          </span>
        );
      })}
    </div>
  );
}

function FeasibilityReadout({ report }: { report: FeasibilityReport }): ReactElement {
  return (
    <div className="solver-feas">
      <p>
        <b className={`v-${report.verdict === 'solvable' ? 'win' : report.verdict === 'hard' ? 'draw' : 'loss'}`}>{report.verdict}</b>
        {' · '}~{fmtInt(report.stateSpaceUpperBound)} states
        {' · '}recommends <b>{report.recommendedMode}</b>
      </p>
      {report.enPassantUnsound ? <p className="warn">en passant reachable — retrograde would be unsound here.</p> : null}
      {report.hiddenStateUnsound ? <p className="warn">castle / chess-draws events on this level — the solver can't key their hidden ledger yet; solving is refused (ADR-0072).</p> : null}
      {report.notes.length > 0 ? <p className="dim">{report.notes.join(' · ')}</p> : null}
    </div>
  );
}

export function SolverStepper({
  level,
  header,
  tab,
  onTabChange,
  runTab,
}: {
  level?: Level;
  header?: ReactNode;
  tab: SolverTab;
  onTabChange: (tab: SolverTab) => void;
  /** The mounted Phase-3 cluster Run surface (SolveRuns), provided by SolveViewer. */
  runTab: ReactNode;
}): ReactElement {
  const stepper = useSolverStepper();

  // ── Config (the Controls rail) ──────────────────────────────────────────────────────
  const [boardSource, setBoardSource] = useState<string>(() => (level ? 'level' : SOLVER_DEMO_BOARDS[0].id));
  const [modeChoice, setModeChoice] = useState<ModeChoice>(DEFAULT_MODE_CHOICE);
  const [depthPlies, setDepthPlies] = useState(DEFAULT_DEPTH_PLIES);
  const [captureDetail, setCaptureDetail] = useState(true);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH);
  const [playSpeed, setPlaySpeed] = useState(DEFAULT_SPEED);
  const [trace, setTrace] = useState<{ name: string; steps: SolveStep[] } | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [built, setBuilt] = useState<SolverStepConfig | null>(null);

  const activeLevel = boardSource === 'level' ? level : demoBoardById(boardSource)?.level;
  const activeDemo = boardSource === 'level' ? undefined : demoBoardById(boardSource);

  const feasibility = useMemo<FeasibilityReport | null>(() => {
    if (!activeLevel) return null;
    try { return estimateFeasibility(activeLevel); } catch { return null; }
  }, [activeLevel]);

  const resolvedMode: SolveMode = modeChoice === 'auto' ? (feasibility?.recommendedMode ?? 'search') : modeChoice;

  // The feasibility gate — MUST precede Play: the engine generator computes the solve on the
  // first pull, so an ungated retrograde on a big board would freeze the tab.
  const gate = ((): { ok: boolean; why?: string } => {
    if (!activeLevel) return { ok: false, why: 'Pick a board (a demo, or select a level in the catalog).' };
    if (trace) return { ok: true }; // replaying a recording computes nothing
    // Hidden-ledger refusal blocks BOTH modes (runWeakSolve throws on such boards too).
    if (feasibility?.hiddenStateUnsound) return { ok: false, why: 'This level authors castle or chess-draws events (ADR-0072) — the solver cannot key their hidden ledger yet, so solving is refused on this board.' };
    if (resolvedMode === 'retrograde') {
      if (!feasibility) return { ok: false, why: 'No feasibility read for this board.' };
      if (feasibility.enPassantUnsound) return { ok: false, why: 'En passant is reachable — a retrograde strong solve is unsound here. Step it in search mode instead.' };
      if (feasibility.verdict !== 'solvable') return { ok: false, why: `Feasibility says "${feasibility.verdict}" — too big to enumerate live. Step it in search mode, or launch it on the cluster (Run tab).` };
      if (feasibility.stateSpaceUpperBound > LIVE_RETRO_STATE_CAP) return { ok: false, why: `~${fmtInt(feasibility.stateSpaceUpperBound)} states is over the live-stepping cap (${fmtInt(LIVE_RETRO_STATE_CAP)}). Use search mode or the cluster Run tab.` };
    }
    return { ok: true };
  })();

  const build = useCallback(() => {
    if (!activeLevel || !gate.ok) return;
    const config: SolverStepConfig = trace
      ? { level: activeLevel, bounds: STEP_BOUNDS, seed: 0, trace: trace.steps }
      : {
        level: activeLevel, bounds: STEP_BOUNDS, seed: 0, mode: resolvedMode,
        ...(resolvedMode === 'search' ? { searchDepthPlies: depthPlies } : {}),
      };
    stepper.start(config);
    stepper.setSpeed(playSpeed);
    stepper.setClockSpeed(playSpeed);
    stepper.setCaptureSteps(captureDetail);
    setBuilt(config);
  }, [activeLevel, gate.ok, trace, resolvedMode, depthPlies, stepper, playSpeed, captureDetail]);

  // Transport Reset: back to step 0 of the SAME build (deterministic — the rerun is identical).
  const resetRun = useCallback(() => {
    if (!built) return;
    stepper.start(built);
    stepper.setSpeed(playSpeed);
    stepper.setClockSpeed(playSpeed);
    stepper.setCaptureSteps(captureDetail);
  }, [built, stepper, playSpeed, captureDetail]);

  const handleStep = useCallback(() => {
    if (batchSize > 1) stepper.stepN(batchSize);
    else stepper.step();
  }, [batchSize, stepper]);

  const handleSpeedChange = useCallback((v: number) => {
    setPlaySpeed(v);
    stepper.setSpeed(v);
    stepper.setClockSpeed(v);
  }, [stepper]);

  const handleCaptureDetail = useCallback((enabled: boolean) => {
    setCaptureDetail(enabled);
    stepper.setCaptureSteps(enabled);
  }, [stepper]);

  const onTraceFile = useCallback((file: File | undefined) => {
    if (!file) return;
    file.text()
      .then((text) => {
        setTrace({ name: file.name, steps: parseTraceJson(text) });
        setTraceError(null);
      })
      .catch((e: unknown) => setTraceError(String((e as Error).message ?? e)));
  }, []);

  // Rail Reset (ADR-0057): back to the committed defaults — derived, not a zero-out.
  const defaultSource = level ? 'level' : SOLVER_DEMO_BOARDS[0].id;
  const configIsDefault =
    boardSource === defaultSource && modeChoice === DEFAULT_MODE_CHOICE && depthPlies === DEFAULT_DEPTH_PLIES
    && captureDetail && trace === null && built === null;
  const resetConfig = useCallback(() => {
    setBoardSource(level ? 'level' : SOLVER_DEMO_BOARDS[0].id);
    setModeChoice(DEFAULT_MODE_CHOICE);
    setDepthPlies(DEFAULT_DEPTH_PLIES);
    setCaptureDetail(true);
    setTrace(null);
    setTraceError(null);
    setBatchSize(DEFAULT_BATCH);
    setPlaySpeed(DEFAULT_SPEED);
    stepper.reset();
    setBuilt(null);
  }, [level, stepper]);

  const hasStarted = built !== null;
  // Panels always get the current step's math — coarse batches (stepN) skip captured phase
  // detail, so re-derive it from the last step (phaseDataFromStep is pure and cheap).
  const panelData = stepper.phaseTrace ?? (stepper.lastStep ? phaseDataFromStep(stepper.lastStep.step) : null);
  const builtLevel = built?.level ?? null;

  // HelpBar → Glossary jump: switch to the Glossary tab with the term highlighted.
  const [glossaryTerm, setGlossaryTerm] = useState<string | null>(null);
  const openGlossary = useCallback((termId: string) => {
    setGlossaryTerm(termId);
    onTabChange('glossary');
  }, [onTabChange]);

  return (
    <>
      <style>{SOLVER_CSS}</style>
      <section className="al-lab-main solver-main" aria-label="Board Solver output">
        <nav className="solver-modebar" aria-label="Solver surface">
          <button type="button" className={tab === 'step' ? 'active' : ''} onClick={() => onTabChange('step')} aria-pressed={tab === 'step'}>Stepper</button>
          <button type="button" className={tab === 'run' ? 'active' : ''} onClick={() => onTabChange('run')} aria-pressed={tab === 'run'}>Cluster run</button>
          <button type="button" className={tab === 'help' ? 'active' : ''} onClick={() => onTabChange('help')} aria-pressed={tab === 'help'}
            data-help="How to use this tool: what it is, why the demo boards, the build-then-step model, how to read each region, and how to check it isn't lying.">
            Help
          </button>
          <button type="button" className={tab === 'glossary' ? 'active' : ''} onClick={() => onTabChange('glossary')} aria-pressed={tab === 'glossary'}
            data-help="The vocabulary reference: retrograde analysis, tablebase, DTM, the back-up rule, fixpoint, GHI and the rest of what the panels say.">
            Glossary
          </button>
        </nav>
        <SolverHelpBar onOpenGlossary={openGlossary} />
        {tab === 'run' ? (
          <div className="solver-run-wrap">{runTab}</div>
        ) : tab === 'help' ? (
          <div className="solver-run-wrap"><SolverHelpPanel /></div>
        ) : tab === 'glossary' ? (
          <div className="solver-run-wrap"><SolverGlossaryPanel highlight={glossaryTerm} /></div>
        ) : (
          <div className="solver-step-surface">
            <SolverControls
              isRunning={stepper.running}
              onPlay={stepper.resume}
              onPause={stepper.pause}
              onStep={handleStep}
              onStepN={stepper.stepN}
              onStepSweep={stepper.stepSweep}
              onBack={stepper.goBack}
              onReset={resetRun}
              batchSize={batchSize}
              onBatchSizeChange={setBatchSize}
              playSpeed={playSpeed}
              onPlaySpeedChange={handleSpeedChange}
              hasStarted={hasStarted}
              algorithmEnded={stepper.solved}
              canGoBack={stepper.canGoBack}
              mode={stepper.mode}
            />
            <SolverPhaseBar
              mode={stepper.mode}
              phase={stepper.phase}
              stepCount={stepper.stepCount}
              sweepIndex={stepper.sweepIndex}
              searchDepth={stepper.viewState?.window ? stepper.viewState.window.depth : null}
              atFixpoint={stepper.viewState?.atFixpoint ?? false}
              hasData={hasStarted && stepper.stepCount > 0}
            />
            <StepTicker steps={stepper.allStepsRef.current} />
            <div className="solver-body">
              <div className="solver-board-col">
                {builtLevel ?? activeLevel ? (
                  <FrontierBoard level={(builtLevel ?? activeLevel)!} view={stepper.viewState} lastStep={stepper.lastStep} />
                ) : (
                  <p className="solver-hint">Pick a demo board (or a catalog level) in the rail, then <b>Build</b>.</p>
                )}
              </div>
              <div className="solver-panel-col">
                <PhasePanel data={panelData} hasStarted={hasStarted} />
              </div>
            </div>
            <StatusStrip view={stepper.viewState} stepCount={stepper.stepCount} solved={stepper.solved} />
          </div>
        )}
      </section>

      <aside className="tileset-view-controls solver-rail" aria-label="Board Solver controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            {tab === 'run' ? (
              <p className="solver-hint">
                {level ? `Level: ${level.name} (${MODE_NAME[level.objective]})` : 'No level selected — pick one in the Catalog.'}
                {' '}Launch and poll cluster solves in the main pane.
              </p>
            ) : tab === 'glossary' ? (
              <p className="solver-hint">
                The terms the Stepper&rsquo;s panels use. On the Stepper, hover anything for a one-line
                explanation and press <b>S</b> to pin it — pinned help links back here.
              </p>
            ) : (
              <>
                <label className="solver-field">Board
                  <select value={boardSource} onChange={(e) => setBoardSource(e.target.value)} disabled={stepper.running}>
                    <option value="level" disabled={!level}>{level ? `Level: ${level.name}` : 'Level: (none selected)'}</option>
                    {SOLVER_DEMO_BOARDS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                {activeDemo ? <p className="solver-note">{activeDemo.note}</p> : null}
                {feasibility ? <FeasibilityReadout report={feasibility} /> : null}

                <label className="solver-field">Mode
                  <select value={modeChoice} onChange={(e) => setModeChoice(e.target.value as ModeChoice)} disabled={stepper.running || trace !== null}>
                    <option value="auto">auto — {feasibility?.recommendedMode ?? 'search'} (recommended)</option>
                    <option value="retrograde">retrograde (strong solve)</option>
                    <option value="search">search (bounded αβ)</option>
                  </select>
                </label>
                {resolvedMode === 'search' && !trace ? (
                  <>
                    <label className="solver-field">Search depth (plies)
                      <input type="number" min={2} max={16} value={depthPlies} disabled={stepper.running}
                        onChange={(e) => setDepthPlies(Math.max(2, Math.min(16, Number(e.target.value) || DEFAULT_DEPTH_PLIES)))} />
                    </label>
                    <p className="solver-note">
                      The FIRST Step/Play computes the whole bounded search in one go (the trace is
                      collected up front), so on a big board at high depth the first press can take a
                      few seconds before stepping begins — that beat is the solve, not a hang.
                    </p>
                  </>
                ) : null}
                <label className="solver-check">
                  <input type="checkbox" checked={captureDetail} onChange={(e) => handleCaptureDetail(e.target.checked)} />
                  full phase detail (uncheck for fast playback)
                </label>

                <div className="solver-run-row">
                  <button type="button" className="tileset-view-action" onClick={build} disabled={!gate.ok || stepper.running}>
                    {trace ? 'Load replay' : 'Build & solve'}
                  </button>
                  {/* ADR-0057: reset to the committed defaults (derived baseline, not a zero-out). */}
                  <button type="button" onClick={resetConfig} disabled={configIsDefault}>Reset</button>
                </div>
                {!gate.ok && gate.why ? <p className="solver-gate" role="alert">{gate.why}</p> : null}
                {built && !trace ? (
                  <p className="solver-note">
                    Built <b>{resolvedMode}</b> on “{(builtLevel ?? activeLevel)?.name}”. Space plays, → steps, ← goes back.
                  </p>
                ) : null}

                <div className="solver-trace">
                  <h3>Recorded trace</h3>
                  <p className="solver-note">Replay a recorded SolveStep[] JSON (e.g. a cluster run’s trace) through this same viewer. The board picked above renders its positions.</p>
                  <input type="file" accept=".json,application/json" disabled={stepper.running}
                    onChange={(e) => { onTraceFile(e.target.files?.[0]); e.target.value = ''; }} />
                  {trace ? (
                    <p className="solver-note">
                      loaded <b>{trace.name}</b> · {trace.steps.length} steps{' '}
                      <button type="button" className="solver-linklike" onClick={() => { setTrace(null); setTraceError(null); }}>clear</button>
                    </p>
                  ) : null}
                  {traceError ? <p className="solver-gate" role="alert">trace: {traceError}</p> : null}
                </div>
              </>
            )}
          </div>
        </section>
      </aside>
    </>
  );
}

// Scoped Studio-style inline CSS (the GL_CSS / GYM_CSS idiom — no design system, dark studio
// palette, never bender's colors).
const SOLVER_CSS = `
.solver-main { display:flex; flex-direction:column; overflow:hidden; color:#e7ebf0; font:13px/1.45 system-ui,sans-serif; }
.solver-modebar { display:flex; gap:8px; padding:10px 14px 0; }
.solver-modebar button { min-height:30px; min-width:96px; padding:0 14px; border-radius:5px; border:1px solid #29323f; background:#161d26; color:#93a0b0; font:600 12px system-ui,sans-serif; cursor:pointer; }
.solver-modebar button:not(:disabled):hover { border-color:#3a4757; color:#c6d0dc; }
.solver-modebar button.active { background:#212b37; color:#e7ebf0; border-color:#3a4757; }
.solver-run-wrap { flex:1 1 0; min-height:0; overflow-y:auto; }
.solver-step-surface { display:flex; flex-direction:column; flex:1 1 0; min-height:0; }

/* Transport bar */
.solver-controls { display:flex; align-items:center; gap:4px; padding:8px 14px; border-bottom:1px solid #1a222c; flex-wrap:wrap; }
.solver-btn { padding:5px 10px; border:1px solid #29323f; border-radius:4px; cursor:pointer; font:700 11px ui-monospace,monospace; }
.solver-btn:disabled { opacity:.4; cursor:not-allowed; }
.solver-btn.play { background:#1d3a28; color:#8fce9b; border-color:#2c5a3c; min-width:52px; }
.solver-btn.back { background:#2e2440; color:#c39be0; border-color:#453663; }
.solver-btn.step { background:#1d2c40; color:#9db8e8; border-color:#2c4160; }
.solver-btn.stepn { background:#1d2c40; color:#9db8e8; border-color:#2c4160; opacity:.85; }
.solver-btn.reset { background:#3d2020; color:#e2a0a0; border-color:#5a2f2f; }
.solver-controls-sep { width:1px; height:18px; background:#29323f; margin:0 8px; flex-shrink:0; }
.solver-controls-label { color:#93a0b0; font:11px ui-monospace,monospace; white-space:nowrap; flex-shrink:0; }
.solver-controls-mark { color:#5c6875; font:10px ui-monospace,monospace; flex-shrink:0; }
.solver-controls-slider { width:110px; flex-shrink:0; }
.solver-controls-ended { margin-left:8px; padding:3px 8px; background:#1d3a28; color:#8fce9b; border:1px solid #2c5a3c; border-radius:3px; font:700 10px ui-monospace,monospace; flex-shrink:0; }

/* PhaseBar */
.solver-phasebar { display:flex; align-items:center; gap:12px; padding:8px 14px; border-bottom:1px solid #1a222c; transition:opacity .2s; }
.solver-phasebar-counters { display:flex; flex-direction:column; gap:2px; flex-shrink:0; }
.solver-counter { display:flex; align-items:baseline; gap:4px; font-family:ui-monospace,monospace; }
.solver-counter em { font-style:normal; font-size:9px; color:#5c6875; text-transform:uppercase; letter-spacing:.3px; min-width:36px; }
.solver-counter b { font-size:14px; color:#e7ebf0; font-variant-numeric:tabular-nums; }
.solver-phasebar-track { flex:1; min-width:0; }
.solver-phasebar-segs { display:flex; gap:2px; height:14px; border-radius:3px; overflow:hidden; }
.solver-phasebar-seg { flex:1; height:100%; border-radius:2px; transition:box-shadow .2s, background .2s; }
.solver-phasebar-labels { display:flex; gap:2px; margin-top:3px; }
.solver-phasebar-labels > div { flex:1; font-size:9px; text-align:center; letter-spacing:.3px; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* HelpBar (bender's hover-help layer, Studio-styled) */
.solver-helpbar { display:flex; align-items:center; gap:8px; min-height:26px; padding:0 14px; border-bottom:1px solid #1a222c; background:#10151c; }
.solver-helpbar-pin { font:700 9px ui-monospace,monospace; color:#d9b871; letter-spacing:1px; flex-shrink:0; }
.solver-helpbar-text { flex:1; font:11px ui-monospace,monospace; color:#7c8a9c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.solver-helpbar-link { flex-shrink:0; padding:1px 8px; font:10px ui-monospace,monospace; background:none; border:1px solid #453663; border-radius:3px; color:#c39be0; cursor:pointer; white-space:nowrap; }

/* Step ticker (the compact walkthrough trail) */
.solver-ticker { display:flex; align-items:center; gap:4px; padding:5px 14px; border-bottom:1px solid #1a222c; overflow:hidden; }
.solver-ticker-label { font-size:9px; color:#5c6875; text-transform:uppercase; letter-spacing:.4px; margin-right:4px; flex-shrink:0; }
.solver-ticker-chip { padding:1px 5px; border:1px solid #29323f; border-radius:3px; background:#12181f; font:700 10px ui-monospace,monospace; white-space:nowrap; }

/* Glossary */
.solver-glossary { padding:14px 18px; max-width:760px; }
.solver-glossary dl { margin:0; }
.solver-glossary-entry { border:1px solid #29323f; background:#12181f; border-radius:6px; padding:10px 12px; margin:0 0 10px; }
.solver-glossary-entry.is-highlight { border-color:#d9b871; box-shadow:0 0 10px #d9b87133; }
.solver-glossary-entry dt { font-size:13px; font-weight:700; color:#e7ebf0; margin:0 0 4px; }
.solver-glossary-entry dd { font-size:12px; color:#a9b4c1; margin:0; line-height:1.5; }
/* Help (same visual family as the glossary cards) */
.solver-help { padding:14px 18px; max-width:820px; }
.solver-help-section { border:1px solid #29323f; background:#12181f; border-radius:6px; padding:12px 14px; margin:0 0 10px; }
.solver-help-section h3 { font-size:13px; font-weight:700; color:#e7ebf0; margin:0 0 6px; }
.solver-help-section p, .solver-help-section li { font-size:12px; color:#a9b4c1; line-height:1.55; }
.solver-help-section p { margin:0 0 8px; }
.solver-help-section p:last-child { margin-bottom:0; }
.solver-help-section ol, .solver-help-section ul { margin:0; padding-left:18px; }
.solver-help-section li { margin:0 0 6px; }
.solver-help-section code, .solver-help-section kbd { font-size:11px; color:#d9b871; background:#1a222c; border:1px solid #29323f; border-radius:3px; padding:0 4px; }
.solver-help-section b { color:#cfd7e0; }
.solver-help-verdict { color:#d9b871; font-weight:700; font-size:11px; letter-spacing:0.4px; }

/* Body: board + phase panel */
.solver-body { display:flex; flex:1 1 0; min-height:0; gap:12px; padding:12px 14px; }
.solver-board-col { flex:1.4 1 0; min-width:0; display:flex; flex-direction:column; }
.solver-panel-col { flex:1 1 0; min-width:260px; max-width:420px; overflow-y:auto; }
.solver-stage { display:flex; flex-direction:column; flex:1 1 0; min-height:0; }
.solver-stage-caption { margin:0 0 6px; font-size:12px; color:#93a0b0; }
.solver-stage-caption .mono, .solver-panel .mono, .solver-stage-why .mono { font-family:ui-monospace,monospace; }
.solver-stage-why { margin:-2px 0 6px; font-size:11px; color:#a9b4c1; }
.solver-board-warn { color:#e2a0a0; }
.solver-why-line { display:block; font-size:11px; color:#8f9aa8; }
.solver-why-line b, .solver-why-line .mono { color:#c6d0dc; }
.solver-poslist.why li { flex-direction:column; align-items:flex-start; gap:0; margin-bottom:4px; }
.solver-board { position:relative; flex:1 1 auto; min-height:240px; display:grid; grid-template-rows:minmax(0,1fr); border:1px solid #29323f; border-radius:6px; overflow:hidden; background:#0d1015; transition:box-shadow .25s, border-color .25s; }
.solver-board.is-win { border-color:#2c5a3c; box-shadow:0 0 14px #8fce9b33 inset; }
.solver-board.is-loss { border-color:#5a2f2f; box-shadow:0 0 14px #e2a0a033 inset; }
.solver-board.is-draw { border-color:#5a4c2c; box-shadow:0 0 14px #d9b87133 inset; }
.solver-board-badge { position:absolute; top:8px; left:8px; padding:3px 9px; border-radius:4px; font:700 11px ui-monospace,monospace; letter-spacing:.4px; text-transform:uppercase; background:#0b1016dd; border:1px solid #29323f; }
.solver-board-badge.v-win { color:#8fce9b; border-color:#2c5a3c; }
.solver-board-badge.v-loss { color:#e2a0a0; border-color:#5a2f2f; }
.solver-board-badge.v-draw { color:#d9b871; border-color:#5a4c2c; }
.solver-frontier-strip { display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-top:8px; }
.solver-frontier-label { font-size:10px; color:#5c6875; text-transform:uppercase; letter-spacing:.4px; margin-right:4px; }
.solver-frontier-chip { min-width:30px; padding:3px 6px; border-radius:4px; border:1px solid #29323f; background:#12181f; font:700 11px ui-monospace,monospace; cursor:pointer; }
.solver-frontier-chip.v-win { color:#8fce9b; }
.solver-frontier-chip.v-loss { color:#e2a0a0; }
.solver-frontier-chip.v-draw { color:#d9b871; }
.solver-frontier-chip.is-selected { background:#212b37; border-color:#3a4757; box-shadow:0 0 6px #9db8e855; }

/* Phase panels */
.solver-panel { border:1px solid #29323f; background:#12181f; border-radius:6px; padding:10px 12px; }
.solver-panel h4 { margin:0 0 4px; font-size:13px; color:#e7ebf0; }
.solver-panel-why { margin:0 0 8px; font-size:12px; color:#93a0b0; }
.solver-panel-row { margin:4px 0; font-size:12px; color:#c6d0dc; }
.solver-panel-row.dim, .solver-panel .dim { color:#7c8a9c; }
.solver-panel-row .w, .solver-status .w { color:#8fce9b; }
.solver-panel-row .l, .solver-status .l { color:#e2a0a0; }
.solver-panel-row .d, .solver-status .d { color:#d9b871; }
.solver-value { font:700 11px ui-monospace,monospace; }
.solver-value.v-win { color:#8fce9b; }
.solver-value.v-loss { color:#e2a0a0; }
.solver-value.v-draw { color:#d9b871; }
.solver-value.v-unknown { color:#93a0b0; }
.solver-cutoff { color:#e2a0a0; font-family:ui-monospace,monospace; }
.solver-poslist { list-style:none; margin:6px 0 0; padding:0; max-height:180px; overflow-y:auto; display:flex; flex-direction:column; gap:2px; }
.solver-poslist li { font-size:11px; color:#93a0b0; display:flex; gap:8px; align-items:baseline; }
.solver-movelist { margin:6px 0 0; padding-left:20px; max-height:180px; overflow-y:auto; font-size:11px; color:#c6d0dc; }
.solver-movelist li { margin:1px 0; }
.solver-movelist li em { font-style:normal; color:#5c6875; margin-left:6px; }
.solver-movelist li.is-marked { color:#e7ebf0; }
.solver-table { border-collapse:collapse; width:100%; margin-top:6px; }
.solver-table th, .solver-table td { border:1px solid #29323f; padding:3px 6px; text-align:left; font-size:11px; }
.solver-table th { background:#161d26; color:#93a0b0; font-weight:600; }

/* Status strip */
.solver-status { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; padding:8px 14px; border-top:1px solid #1a222c; font:11px ui-monospace,monospace; color:#93a0b0; font-variant-numeric:tabular-nums; }
.solver-status b { color:#e7ebf0; font-weight:600; }
.solver-status-done { color:#8fce9b; font-weight:700; text-transform:uppercase; letter-spacing:.4px; }

/* Controls rail */
.solver-rail .solver-field { display:flex; flex-direction:column; gap:4px; font-size:12px; color:#b9c2ce; margin-bottom:8px; }
.solver-rail .solver-field input, .solver-rail .solver-field select { background:#12151b; color:#e7ebf0; border:1px solid #3a4150; border-radius:4px; padding:5px 8px; font-size:13px; }
.solver-rail .solver-check { display:flex; align-items:center; gap:6px; font-size:12px; color:#b9c2ce; margin:2px 0 8px; }
.solver-rail .solver-run-row { display:flex; gap:8px; align-items:center; margin:10px 0 6px; }
.solver-rail .solver-run-row button { cursor:pointer; }
.solver-note { font-size:11px; color:#7c8a9c; margin:2px 0 8px; }
.solver-gate { font-size:11px; color:#e2a0a0; margin:4px 0 8px; }
.solver-hint { font-size:12px; color:#8f9aa8; padding:8px 2px; }
.solver-feas { border:1px solid #29323f; background:#12181f; border-radius:6px; padding:8px 10px; margin:0 0 10px; font-size:11px; }
.solver-feas p { margin:2px 0; color:#c6d0dc; }
.solver-feas .v-win { color:#8fce9b; text-transform:uppercase; }
.solver-feas .v-draw { color:#d9b871; text-transform:uppercase; }
.solver-feas .v-loss { color:#e2a0a0; text-transform:uppercase; }
.solver-feas .warn { color:#e2a0a0; }
.solver-feas .dim { color:#7c8a9c; }
.solver-trace { margin-top:14px; border-top:1px solid #1a222c; padding-top:10px; }
.solver-trace h3 { font-size:12px; color:#b9c2ce; margin:0 0 6px; }
.solver-trace input[type=file] { font-size:11px; color:#93a0b0; max-width:100%; }
.solver-linklike { background:none; border:none; padding:0; color:#9db8e8; cursor:pointer; font-size:11px; text-decoration:underline; }

@media (max-width: 980px) {
  .solver-body { flex-direction:column; overflow-y:auto; }
  .solver-panel-col { max-width:none; overflow-y:visible; }
  .solver-board { min-height:300px; }
}
`;
