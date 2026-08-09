import { useEffect, useState, type ReactElement } from 'react';
import { formatClockMs, formatElapsedClockMs, readElapsedClockMs, type ElapsedClockState } from '../core/clock';
import { useSkirmish } from '../game/SkirmishStoreContext';
import { TitleBarStatus } from './shell/TitleBarControls';

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
  return (
    <TitleBarStatus
      className={`skirmish-status-chip skirmish-clock${clock && clock.remainingMs <= 20_000 ? ' danger is-low' : ''}`}
      data-chrome-fill-surface={fillSurface}
    >
      {clock ? (
        <>
          <strong>{formatClockMs(clock.remainingMs)}</strong>
          <small>{clock.incrementMs > 0 ? `+${clock.incrementMs / 1000}s / move` : 'Battle Clock'}</small>
        </>
      ) : (
        <>
          <strong data-testid="untimed-battle-clock" aria-label={`Elapsed time ${formatElapsedClockMs(elapsedReadoutMs)}`}>
            {formatElapsedClockMs(elapsedReadoutMs)}
          </strong>
          <small>No limit</small>
        </>
      )}
    </TitleBarStatus>
  );
}
