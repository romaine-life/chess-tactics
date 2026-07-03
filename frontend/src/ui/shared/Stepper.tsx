import { useState, type ReactElement } from 'react';

// Opt-in editable readout: pass `edit` and the value between the keys becomes a
// typeable field (click it, type an exact value) instead of a read-only <output>.
// Commits on Enter/blur, reverts a malformed entry, and focusing selects all so a
// click-and-type replaces cleanly. The +/- keys still walk their ladder. Omit `edit`
// to keep the plain read-only readout (board zoom, UI scale).
type StepperEdit = {
  /** The raw numeric value being edited (e.g. whole seconds). */
  value: number;
  /** Committed values are clamped to at least this. */
  min: number;
  /** Render the raw value into the field (e.g. 383 → "6:23"). */
  format: (value: number) => string;
  /** Parse a typed string back to a raw value, or null if it's malformed. */
  parse: (raw: string) => number | null;
  onCommit: (value: number) => void;
  ariaLabel: string;
};

// The +/- stepper: a numeric readout flanked by two forged kit-frame keys (ADR-0011/0014),
// with CSS-drawn minus/plus glyphs. Shared chrome — Settings (UI scale) and the level editor
// (board zoom) both render this so the control reads identically. Styled by .settings-stepper /
// .settings-chrome-button / .stepper-glyph in style.css.
export function Stepper({
  value,
  suffix,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
  edit,
}: {
  /** The read-only readout: a plain number, or a pre-formatted string (e.g. "5:00").
   *  Ignored when `edit` is given (the field renders from `edit.value`). */
  value?: number | string;
  suffix: string;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  edit?: StepperEdit;
}): ReactElement {
  return (
    <div className="settings-stepper">
      <button type="button" className="settings-chrome-button settings-chrome-button-neutral" aria-label={decreaseLabel} onClick={onDecrease}>
        <span><span className="stepper-glyph stepper-minus" aria-hidden="true" /></span>
      </button>
      {edit
        ? <StepperInput edit={edit} suffix={suffix} />
        : <output>{value}{suffix}</output>}
      <button type="button" className="settings-chrome-button settings-chrome-button-neutral" aria-label={increaseLabel} onClick={onIncrease}>
        <span><span className="stepper-glyph stepper-plus" aria-hidden="true" /></span>
      </button>
    </div>
  );
}

// The editable middle cell. Holds a draft string only while being edited (draft !==
// null); otherwise it mirrors the canonical formatted value, so a neighbouring +/-
// click stays in sync. A draft starts on the first keystroke, never on focus, so
// select-all-then-type replaces cleanly (a focus re-render would drop the selection).
function StepperInput({ edit, suffix }: { edit: StepperEdit; suffix: string }): ReactElement {
  const { value, min, format, parse, onCommit, ariaLabel } = edit;
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (): void => {
    if (draft === null) return;
    const parsed = parse(draft);
    if (parsed !== null) onCommit(Math.max(min, Math.round(parsed)));
    setDraft(null); // drop back to the canonical, formatted value
  };

  // The bordered box is the wrapper (fixed width, identical on every row so the +/-
  // keys line up); the input sits borderless inside it and any unit rides within the
  // same box — never outside it, which would shove the neighbouring key out of line.
  return (
    <span className="settings-stepper-field">
      <input
        className="settings-stepper-input"
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        value={draft ?? format(value)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { commit(); event.currentTarget.blur(); }
          else if (event.key === 'Escape') { setDraft(null); event.currentTarget.blur(); }
        }}
        onBlur={commit}
      />
      {suffix ? <span className="settings-stepper-unit" aria-hidden="true">{suffix}</span> : null}
    </span>
  );
}
