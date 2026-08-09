import { useEffect, useState, type ReactElement } from 'react';
import { formatClockMs, formatElapsedClockMs, readElapsedClockMs, type ElapsedClockState } from '../core/clock';
import { useSkirmish } from '../game/SkirmishStoreContext';
import { TitleBarStatusTip } from './shell/TitleBarControls';

// THE battle clock readout, for every play surface that mounts a battlefield — the
// standalone Skirmish title bar and the Run's (ADR-0059: one primitive, not a second
// parallel clock). A timed level counts its bank down; an untimed one counts elapsed
// Battle time upward, so a board is never presented without saying how long it has
// been running.
//
// It reads the mounted session store itself rather than taking a time as a prop: the
// countdown is quantized by the store's own ticker, and the elapsed readout needs a
// ticker of its own. A caller that had to supply both would be re-deriving the clock.

/** Live elapsed readout: re-read the wall clock while the Battle is actually running. */
function useElapsedClockReadout(clock: ElapsedClockState, enabled: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    setNowMs(Date.now());
    if (!enabled || clock.startedAtMs === null) return undefined;
    const ticker = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(ticker);
  }, [clock.startedAtMs, enabled]);
  return readElapsedClockMs(clock, nowMs);
}

export function BattleClockChip({ fillSurface }: { fillSurface?: string } = {}): ReactElement {
  // The battle clock (null = untimed level). The store quantizes the countdown.
  const clock = useSkirmish((s) => s.clock);
  const battleElapsed = useSkirmish((s) => s.battleElapsed);
  const elapsedReadoutMs = useElapsedClockReadout(battleElapsed, clock === null);
  const readout = clock ? formatClockMs(clock.remainingMs) : formatElapsedClockMs(elapsedReadoutMs);
  return (
    <TitleBarStatusTip
      className={`skirmish-status-chip skirmish-clock${clock && clock.remainingMs <= 20_000 ? ' danger is-low' : ''}`}
      fillSurface={fillSurface}
      label={clock ? `Battle clock. ${readout} remaining` : `Elapsed time ${readout}`}
      name={clock ? 'Battle clock' : 'Elapsed time'}
      detail={clock
        ? (clock.incrementMs > 0
            ? `Time left on this Battle's clock. Each move you make adds ${clock.incrementMs / 1000} seconds back.`
            : "Time left on this Battle's clock.")
        : 'This Battle has no time control. The clock counts up from the first move, and the Aftermath reports it.'}
      // A clock is not a Run mechanic, and its own words ("Battle") would otherwise
      // raise a definition pane under a readout that explains itself.
      explainMechanics={false}
    >
      {/* The installed kit hourglass, the same forged glyph family the objective chip's
          flag comes from — so the reading is marked as TIME at a glance instead of being
          a bare pair of numbers between two labelled chips. One glyph for both branches:
          a bank draining and time accumulating are the same fact to the eye. */}
      <span className="skirmish-icon skirmish-icon-hourglass" aria-hidden="true" />
      <span className="skirmish-clock-readout">
        {clock ? (
          <>
            <strong>{readout}</strong>
            <small>{clock.incrementMs > 0 ? `+${clock.incrementMs / 1000}s / move` : 'Battle Clock'}</small>
          </>
        ) : (
          <>
            <strong data-testid="untimed-battle-clock">{readout}</strong>
            <small>No limit</small>
          </>
        )}
      </span>
    </TitleBarStatusTip>
  );
}
