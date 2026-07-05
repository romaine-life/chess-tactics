import { useEffect, useState, type ReactElement } from 'react';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { CLOCK_INCREMENT_SECONDS, CLOCK_INITIAL_SECONDS, DEFAULT_TIME_CONTROL, formatClockSeconds, parseClockSeconds, stepLadder } from '../core/clock';
import { loadSkirmishClockPref, saveSkirmishClockPref } from '../game/skirmishClockPref';
import type { TimeControl } from '../core/level';

// The battle-clock picker: a Timed on/off toggle plus Start and Increment steppers (the shared
// kit chrome the level editor uses). Uncontrolled mode edits the saved random-skirmish preference.
// Controlled mode lets an editor/test-board scenario own the next-attempt timer without touching
// that free-play preference.
export function SkirmishClockControl({
  timedHint,
  value,
  onChange,
}: {
  timedHint: string;
  value?: TimeControl | null;
  onChange?: (value: TimeControl | null) => void;
}): ReactElement {
  const controlled = onChange !== undefined;
  const [pref] = useState(() => controlled ? value ?? null : loadSkirmishClockPref());
  const [enabled, setEnabled] = useState(pref !== null);
  const [initialSeconds, setInitialSeconds] = useState((pref ?? DEFAULT_TIME_CONTROL).initialSeconds);
  const [incrementSeconds, setIncrementSeconds] = useState((pref ?? DEFAULT_TIME_CONTROL).incrementSeconds);

  useEffect(() => {
    if (!controlled) return;
    const next = value ?? null;
    setEnabled(next !== null);
    setInitialSeconds((next ?? DEFAULT_TIME_CONTROL).initialSeconds);
    setIncrementSeconds((next ?? DEFAULT_TIME_CONTROL).incrementSeconds);
  }, [controlled, value]);

  // Persist/emit on every change so the matching "New" path reads the current pick.
  useEffect(() => {
    const next = enabled ? { initialSeconds, incrementSeconds } : null;
    if (controlled) onChange?.(next);
    else saveSkirmishClockPref(next);
  }, [controlled, enabled, initialSeconds, incrementSeconds, onChange]);

  return (
    <>
      <div className="skirmish-clock-row">
        <span>Timed</span>
        <Toggle checked={enabled} label="Toggle the battle clock" onChange={setEnabled} />
      </div>
      {enabled ? (
        <>
          <div className="skirmish-clock-row">
            <span>Start</span>
            <Stepper
              suffix=""
              decreaseLabel="Less starting time"
              increaseLabel="More starting time"
              onDecrease={() => setInitialSeconds((v) => stepLadder(CLOCK_INITIAL_SECONDS, v, -1))}
              onIncrease={() => setInitialSeconds((v) => stepLadder(CLOCK_INITIAL_SECONDS, v, 1))}
              edit={{
                value: initialSeconds,
                min: 1,
                format: formatClockSeconds,
                parse: parseClockSeconds,
                onCommit: setInitialSeconds,
                ariaLabel: 'Starting time (m:ss or seconds)',
              }}
            />
          </div>
          <div className="skirmish-clock-row">
            <span>Increment</span>
            <Stepper
              suffix="s"
              decreaseLabel="Smaller increment per move"
              increaseLabel="Larger increment per move"
              onDecrease={() => setIncrementSeconds((v) => stepLadder(CLOCK_INCREMENT_SECONDS, v, -1))}
              onIncrease={() => setIncrementSeconds((v) => stepLadder(CLOCK_INCREMENT_SECONDS, v, 1))}
              edit={{
                value: incrementSeconds,
                min: 0,
                format: (s) => String(s),
                parse: parseClockSeconds,
                onCommit: setIncrementSeconds,
                ariaLabel: 'Increment in seconds',
              }}
            />
          </div>
        </>
      ) : null}
      <p className="skirmish-grid-hint">{enabled ? timedHint : 'Untimed — think as long as you like.'}</p>
    </>
  );
}
