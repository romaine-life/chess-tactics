import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { fetchLiveRuns, liveRunCaption, type LiveRunPresence } from '../net/liveRuns';
import { relativeTimeLabel } from './relativeTime';

// Studio → Live Runs. The presence half of observation: who is playing and roughly where.
//
// This is deliberately the cheap tier. Every row here is read straight off the Run document that
// was already being written on each acknowledged mutation, so showing this page costs the players
// on it nothing at all — no stream, no share, no work started on their side. Watch is what begins
// an observation, and until that exists this page is the honest half that already works.

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
          <li key={run.owner_email} className="live-run">
            <span className="live-run-player">{run.owner_email}</span>
            <span className="live-run-caption">{liveRunCaption(run)}</span>
            <span className="live-run-seen">{relativeTimeLabel(run.updated_at)}</span>
            <button type="button" className="tileset-view-action" disabled title="Observation is not wired yet">
              Watch
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
