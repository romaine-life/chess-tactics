// Solver stepper transport — port of bender-world's Controls.tsx BEHAVIOR (Play/Pause, Back,
// Step, +10, +100, Reset; logarithmic Batch + Speed sliders with click-to-type EditableValue;
// keyboard Space=play/pause, →=step, Shift+→=+10, ←=back), restyled as Studio chrome via
// SOLVER_CSS classes (no bender colors.ts import).

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { SolveMode } from '../../core/solver';

interface SolverControlsProps {
  isRunning: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onStepN: (count: number) => void;
  /** Jump to the next sweep boundary (retrograde: next Converge; search: next completed
   * deepening iteration). */
  onStepSweep: () => void;
  onBack: () => void;
  onReset: () => void;
  batchSize: number;
  onBatchSizeChange: (size: number) => void;
  playSpeed: number;
  onPlaySpeedChange: (speed: number) => void;
  hasStarted: boolean;
  algorithmEnded: boolean;
  canGoBack: boolean;
  /** Which vocabulary is running — labels the sweep button ("Sweep ▸" vs "Depth ▸"). */
  mode: SolveMode | null;
}

// ── Slider helpers (logarithmic scale, verbatim from the reference) ─────────────────────

function valueToSlider(value: number, min: number, max: number): number {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  return ((Math.log(value) - logMin) / (logMax - logMin)) * 100;
}

function sliderToValue(slider: number, min: number, max: number, round: (n: number) => number): number {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  return round(Math.exp(logMin + (slider / 100) * (logMax - logMin)));
}

// Batch: 1–500 integer phases per Step press.
const batchToSlider = (v: number): number => valueToSlider(v, 1, 500);
const sliderToBatch = (s: number): number => sliderToValue(s, 1, 500, Math.round);

// Speed: 0.25–500 steps/s (fractional at the low end, integer at the high end).
const speedToSlider = (v: number): number => valueToSlider(v, 0.25, 500);
const sliderToPlaySpeed = (s: number): number => {
  const raw = sliderToValue(s, 0.25, 500, (n) => n);
  return raw < 1 ? Math.round(raw * 4) / 4 : Math.round(raw);
};

// ── Editable inline value — click to type, Enter/blur commits, Escape cancels ───────────

function EditableValue({
  value,
  onChange,
  min,
  max,
  suffix,
  accentColor,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix: string;
  accentColor: string;
}): ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = (): void => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed < 1 ? Math.round(parsed * 4) / 4 : Math.round(parsed));
    }
  };

  // The span always renders to hold layout; the input overlays it while editing.
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        style={{ color: accentColor, fontWeight: 700, cursor: 'text', visibility: editing ? 'hidden' : 'visible' }}
        title="Click to type a value"
      >
        {value}{suffix}
      </span>
      {editing ? (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          style={{
            position: 'absolute', left: 0, top: -1, width: '100%',
            fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700,
            color: accentColor, backgroundColor: '#0b1016', border: `1px solid ${accentColor}`,
            borderRadius: 2, padding: '0 2px', outline: 'none', boxSizing: 'border-box',
          }}
        />
      ) : null}
    </span>
  );
}

// ── The transport bar ────────────────────────────────────────────────────────────────────

export function SolverControls({
  isRunning,
  onPlay,
  onPause,
  onStep,
  onStepN,
  onStepSweep,
  onBack,
  onReset,
  batchSize,
  onBatchSizeChange,
  playSpeed,
  onPlaySpeedChange,
  hasStarted,
  algorithmEnded,
  canGoBack,
  mode,
}: SolverControlsProps): ReactElement {
  const canPlay = hasStarted && !algorithmEnded;
  const canStep = hasStarted && !isRunning && !algorithmEnded;

  // Keyboard shortcuts — exactly the reference map, guarded against form fields.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!canPlay) return;
      if (isRunning) onPause();
      else onPlay();
    } else if (e.code === 'ArrowRight' && !e.shiftKey) {
      e.preventDefault();
      if (canStep) onStep();
    } else if (e.code === 'ArrowRight' && e.shiftKey) {
      e.preventDefault();
      if (canStep) onStepN(10);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      if (canGoBack && !isRunning) onBack();
    }
  }, [isRunning, canPlay, canStep, canGoBack, onPlay, onPause, onStep, onStepN, onBack]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="solver-controls"
      title="Space = play/pause · → = step · Shift+→ = +10 · ← = back. Batch sets how many phases one Step press advances."
    >
      <button type="button" className="solver-btn play" onClick={isRunning ? onPause : onPlay} disabled={!canPlay} title="Space"
        data-help="Play consumes one phase per step interval at the Speed rate; Pause finishes the current step and stops (Space).">
        {isRunning ? 'Pause' : 'Play'}
      </button>
      <button type="button" className="solver-btn back" onClick={onBack} disabled={!canGoBack || isRunning} title="Left arrow"
        data-help="Undo the last gesture — one Step, or a whole +10/+100/Sweep batch. Going forward again replays the identical steps (the solve is deterministic).">
        Back
      </button>
      <button type="button" className="solver-btn step" onClick={onStep} disabled={!canStep} title="Right arrow"
        data-help="Advance one phase (× the Batch slider) and show its math in the panel (→).">
        Step
      </button>
      <button type="button" className="solver-btn step" onClick={() => onStepN(10)} disabled={!canStep} title="Shift+Right"
        data-help="Advance 10 phases as one gesture (Shift+→). One Back undoes the whole batch.">
        +10
      </button>
      <button type="button" className="solver-btn stepn" onClick={() => onStepN(100)} disabled={!canStep}
        data-help="Advance 100 phases as one gesture. One Back undoes the whole batch.">
        +100
      </button>
      <button type="button" className="solver-btn stepn" onClick={onStepSweep} disabled={!canStep}
        data-help={mode === 'search'
          ? 'Jump to the end of the current iterative-deepening iteration — the next root back-up that tightens the root bounds.'
          : 'Jump to the end of the current sweep — the next Converge (or the final Read value). One Back undoes the jump.'}
        data-help-glossary={mode === 'search' ? 'iterative-deepening' : 'sweep'}
        title={mode === 'search' ? 'To the next completed deepening iteration' : 'To the end of the current sweep'}>
        {mode === 'search' ? 'Depth ▸' : 'Sweep ▸'}
      </button>
      <button type="button" className="solver-btn reset" onClick={onReset} disabled={!hasStarted}
        data-help="Back to step 0 of the SAME build — the rerun is deterministic, so it replays identically.">
        Reset
      </button>

      <div className="solver-controls-sep" />

      <span className="solver-controls-label" data-help="How many phases ONE Step press advances (the +10/+100 buttons ignore this and mean exactly 10/100).">
        Batch: <EditableValue value={batchSize} onChange={onBatchSizeChange} min={1} max={500} suffix=" phases/step" accentColor="#8fce9b" />
      </span>
      <span className="solver-controls-mark">1</span>
      <input
        type="range"
        min={0}
        max={100}
        value={batchToSlider(batchSize)}
        onChange={(e) => onBatchSizeChange(sliderToBatch(parseInt(e.target.value, 10)))}
        className="solver-controls-slider"
        style={{ accentColor: '#8fce9b' }}
        title="Batch size: 1–500 phases per Step press"
        data-help="How many phases ONE Step press advances."
      />
      <span className="solver-controls-mark">500</span>

      <div className="solver-controls-sep" />

      <span className="solver-controls-label" data-help="Playback rate while Play is active, in steps per second — 0.25 means one phase every 4 seconds, slow enough to read each panel.">
        Speed: <EditableValue value={playSpeed} onChange={onPlaySpeedChange} min={0.25} max={500} suffix=" steps/s" accentColor="#d9b871" />
      </span>
      <span className="solver-controls-mark">¼</span>
      <input
        type="range"
        min={0}
        max={100}
        value={speedToSlider(playSpeed)}
        onChange={(e) => onPlaySpeedChange(sliderToPlaySpeed(parseInt(e.target.value, 10)))}
        className="solver-controls-slider"
        style={{ accentColor: '#d9b871' }}
        title="Playback speed while Play is active: 0.25–500 steps per second (the label is the real rate)"
        data-help="Playback rate in steps per second. The label is honored exactly: 0.25 plays one phase every 4 seconds."
      />
      <span className="solver-controls-mark">500</span>

      {algorithmEnded ? <span className="solver-controls-ended">Complete</span> : null}
    </div>
  );
}
