import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { fetchLiveRuns, liveRunCaption, type LiveRunPresence } from '../net/liveRuns';
import { relativeTimeLabel } from './relativeTime';

// Studio → Live Runs. The presence half of observation: who is playing and roughly where.
//
// This is deliberately the cheap tier. Every row here is read straight off the Run document that
// was already being written on each acknowledged mutation, so showing this page costs the players
// on it nothing at all — no stream and no work started on their side. Pressing Watch is what
// begins an observation, and only then does the player's seat light up.

export function LiveRunsCatalog(): ReactElement {
  const [runs, setRuns] = useState<LiveRunPresence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setRuns(await fetchLiveRuns());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  if (error && !runs) return <p className="tileset-catalog-note" role="alert">{error}</p>;
  if (!runs) return <p className="tileset-catalog-note">Reading active Runs…</p>;

  return (
    <div className="live-runs">
      {error ? <p className="tileset-catalog-note" role="alert">{error}</p> : null}
      {runs.length === 0 ? <p className="tileset-catalog-note">Nobody has a Run in progress.</p> : null}
      <ul className="live-run-list">
        {runs.map((run) => (
          <li key={run.handle} className="live-run">
            <span className="live-run-player">{run.owner_label}</span>
            <span className="live-run-caption">{liveRunCaption(run)}</span>
            <span className="live-run-seen">{relativeTimeLabel(run.updated_at)}</span>
            <a
              className="tileset-view-action"
              href={`/run/watch/${encodeURIComponent(run.handle)}`}
              data-nav={`/run/watch/${encodeURIComponent(run.handle)}`}
            >
              Watch
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
