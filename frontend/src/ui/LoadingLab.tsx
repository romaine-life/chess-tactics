import { useMemo, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import {
  clearLoadingTimeline,
  loadingEvents,
  subscribeLoadingTimeline,
  type LoadingEventKind,
} from '../diagnostics/loadingTimeline';

function snapshot() {
  return loadingEvents();
}

function fmtBytes(value: number): string {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

export function LoadingLab({ header }: { header?: ReactNode }): ReactElement {
  const events = useSyncExternalStore(subscribeLoadingTimeline, snapshot, snapshot);
  const [kind, setKind] = useState<LoadingEventKind | 'all'>('all');
  const [surface, setSurface] = useState('all');
  const surfaces = useMemo(() => [...new Set(events.map((event) => event.surface))].sort(), [events]);
  const visible = useMemo(() => events.filter((event) => (
    (kind === 'all' || event.kind === kind) && (surface === 'all' || event.surface === surface)
  )).sort((a, b) => a.at - b.at || a.id - b.id), [events, kind, surface]);
  const resourceEvents = events.filter((event) => event.kind === 'resource');
  const transferBytes = resourceEvents.reduce((sum, event) => sum + Number(event.detail?.transferBytes ?? 0), 0);
  const cacheHits = resourceEvents.filter((event) => event.detail?.cacheHit).length;
  const errors = events.filter((event) => event.kind === 'error').length;
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify({ capturedAt: new Date().toISOString(), href: window.location.href, events }, null, 2));
  };

  return (
    <section className="loading-lab" aria-label="Loading timeline">
      <div className="loading-lab-stage">
        <div className="loading-lab-summary">
          <div><strong>{events.length}</strong><span>events</span></div>
          <div><strong>{resourceEvents.length}</strong><span>requests</span></div>
          <div><strong>{fmtBytes(transferBytes)}</strong><span>transferred</span></div>
          <div><strong>{cacheHits}</strong><span>cache hits</span></div>
          <div className={errors ? 'is-error' : ''}><strong>{errors}</strong><span>errors</span></div>
        </div>
        <div className="loading-lab-table-wrap">
          <table className="loading-lab-table">
            <thead><tr><th>Time</th><th>Kind</th><th>Surface</th><th>Phase / resource</th><th>Evidence</th></tr></thead>
            <tbody>
              {visible.map((event) => (
                <tr key={event.id} className={`is-${event.kind}`}>
                  <td>{event.at.toFixed(1)} ms</td>
                  <td>{event.kind}</td>
                  <td>{event.surface}</td>
                  <td title={event.phase}>{event.phase}</td>
                  <td>{event.detail ? Object.entries(event.detail).map(([key, value]) => `${key}=${String(value)}`).join(' · ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="tileset-view-controls" aria-label="Loading timeline controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          {header}
          <label className="tileset-category-select"><span>Kind</span><select value={kind} onChange={(event) => setKind(event.target.value as LoadingEventKind | 'all')}><option value="all">All</option><option value="mark">Marks</option><option value="measure">Measures</option><option value="resource">Resources</option><option value="error">Errors</option></select></label>
          <label className="tileset-category-select"><span>Surface</span><select value={surface} onChange={(event) => setSurface(event.target.value)}><option value="all">All surfaces</option>{surfaces.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <button type="button" className="tileset-view-action" onClick={() => void copy()}>Copy JSON</button>
          <button type="button" className="tileset-view-action" onClick={clearLoadingTimeline}>Clear timeline</button>
          <p className="tileset-catalog-note">Reload for a cold-start trace. Navigate normally to compare menu, thumbnail, editor, and board phases in one clock.</p>
        </section>
      </aside>
    </section>
  );
}
