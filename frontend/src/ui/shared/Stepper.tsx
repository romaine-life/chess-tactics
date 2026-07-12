import { useRef, useState, type ReactElement } from 'react';
import { chromeUnitClassNames } from '../chromeUnitRegistry';

// Opt-in editable readout: pass `edit` and the value between the keys becomes a
// typeable field (click it, type an exact value) instead of a read-only <output>.
// It commits LIVE — every parseable keystroke is pushed to the parent immediately, so
// the surrounding UI (a dirty flag, a Save button, autosave) tracks a typed edit in real
// time exactly as the +/- keys already do on click. Enter/blur finalise (reverting a
// malformed final entry), Escape cancels back to the value editing started from, and
// focusing selects all so a click-and-type replaces cleanly. The +/- keys still walk their
// ladder. Omit `edit` to keep the plain read-only readout (board zoom, UI scale).
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
      <button
        type="button"
        data-chrome-unit="inner-minus-key"
        className={chromeUnitClassNames('inner-minus-key', 'settings-chrome-button', 'settings-chrome-button-neutral')}
        aria-label={decreaseLabel}
        onClick={onDecrease}
      >
        <span><span className="stepper-glyph stepper-minus" aria-hidden="true" /></span>
      </button>
      {edit
        ? <StepperInput edit={edit} suffix={suffix} />
        : <output>{value}{suffix}</output>}
      <button
        type="button"
        data-chrome-unit="inner-plus-key"
        className={chromeUnitClassNames('inner-plus-key', 'settings-chrome-button', 'settings-chrome-button-neutral')}
        aria-label={increaseLabel}
        onClick={onIncrease}
      >
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
  // A ref-mirror of the draft so the blur/key handlers read the CURRENT draft synchronously — a
  // handler fired by an in-handler .blur() would otherwise see the stale render-closure value and
  // re-commit after a cancel. `revertRef` is the value the edit started from, for Escape/undo.
  const draftRef = useRef<string | null>(null);
  const revertRef = useRef(value);
  const setDraftValue = (next: string | null): void => { draftRef.current = next; setDraft(next); };
  const clampParsed = (parsed: number): number => Math.max(min, Math.round(parsed));

  // Live-track typing: on the first keystroke remember the value we started from, always show the
  // raw draft (so the field never reformats mid-type — no snapping "300" to "5:00" under the
  // cursor), and push every parseable value straight to the parent. That is what makes a typed
  // edit register instantly, like a +/- click; a partial entry that doesn't parse yet ("3:", "")
  // simply leaves the last committed value in place until the next keystroke.
  const handleChange = (raw: string): void => {
    if (draftRef.current === null) revertRef.current = value;
    setDraftValue(raw);
    const parsed = parse(raw);
    if (parsed !== null) onCommit(clampParsed(parsed));
  };
  // Leave the field: the last parseable keystroke is already committed, so just drop the draft to
  // fall back to the canonical formatted value. If the FINAL text is malformed (e.g. "3:" or blank)
  // restore the value we started from rather than freezing a half-typed intermediate.
  const finish = (): void => {
    if (draftRef.current !== null && parse(draftRef.current) === null) onCommit(revertRef.current);
    setDraftValue(null);
  };
  // Escape cancels: undo the live commits back to the pre-edit value, then drop the draft. Runs
  // before the .blur()-driven finish(), which then sees draftRef === null and does nothing.
  const cancelEdit = (): void => {
    if (draftRef.current !== null) onCommit(revertRef.current);
    setDraftValue(null);
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
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.currentTarget.blur(); }
          else if (event.key === 'Escape') { cancelEdit(); event.currentTarget.blur(); }
        }}
        onBlur={finish}
      />
      {suffix ? <span className="settings-stepper-unit" aria-hidden="true">{suffix}</span> : null}
    </span>
  );
}
