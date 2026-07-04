import { useEffect, useState, type ReactElement } from 'react';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { CLOCK_INCREMENT_SECONDS, CLOCK_INITIAL_SECONDS, DEFAULT_TIME_CONTROL, formatClockSeconds, parseClockSeconds, stepLadder } from '../core/clock';
import { loadSkirmishClockPref, saveSkirmishClockPref } from '../game/skirmishClockPref';

// The random-skirmish battle-clock picker: a Timed on/off toggle plus Start and Increment
// steppers (the shared kit chrome the level editor uses). It reads and WRITES the saved
// preference (game/skirmishClockPref) directly, so wherever it's shown — the pre-game
// Skirmish hub or the in-match Controls tab — it edits one source of truth, and any "start
// a fresh skirmish" path just reads that preference back. Free-play only; a level authors
// its own clock.
export function SkirmishClockControl({ timedHint }: { timedHint: string }): ReactElement {
  const [pref] = useState(loadSkirmishClockPref);
  const [enabled, setEnabled] = useState(pref !== null);
  const [initialSeconds, setInitialSeconds] = useState((pref ?? DEFAULT_TIME_CONTROL).initialSeconds);
  const [incrementSeconds, setIncrementSeconds] = useState((pref ?? DEFAULT_TIME_CONTROL).incrementSeconds);

  // Persist on every change so a "New skirmish" / "Start" elsewhere reads the current pick.
  useEffect(() => {
    saveSkirmishClockPref(enabled ? { initialSeconds, incrementSeconds } : null);
  }, [enabled, initialSeconds, incrementSeconds]);

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
