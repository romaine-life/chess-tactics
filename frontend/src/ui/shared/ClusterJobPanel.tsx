import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { ChromeButton } from './ChromeButton';
import { InnerChromeBox } from './ChromeBox';

export interface ClusterRunSummaryLike {
  id: string;
  status: string;
  created_at: string;
}

export function useClusterJobController<Summary extends ClusterRunSummaryLike, Detail extends Summary>({
  listRuns,
  getRun,
  cancelRun,
  clearSelectionOnCancel = false,
}: {
  listRuns: () => Promise<Summary[]>;
  getRun: (id: string) => Promise<Detail>;
  cancelRun: (id: string) => Promise<void>;
  clearSelectionOnCancel?: boolean;
}) {
  const [runs, setRuns] = useState<Summary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialSettled, setInitialSettled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRuns(await listRuns());
      setError(null);
    } catch (value) {
      setError(String((value as Error).message || value));
    }
  }, [listRuns]);

  useEffect(() => {
    void refresh().finally(() => setInitialSettled(true));
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return undefined;
    }
    let live = true;
    const load = async () => {
      try {
        const next = await getRun(openId);
        if (live) setDetail(next);
      } catch {
        // Polling is deliberately tolerant of transient cluster/API failures.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 6000);
    return () => { live = false; window.clearInterval(timer); };
  }, [getRun, openId]);

  const launch = useCallback(async (operation: () => Promise<{ id: string; status: string }>) => {
    setLaunching(true);
    setError(null);
    try {
      const result = await operation();
      setOpenId(result.id);
      if (result.status !== 'running') setError('run persisted but not launched (no cluster in this environment)');
      await refresh();
    } catch (value) {
      setError(String((value as Error).message || value));
    } finally {
      setLaunching(false);
    }
  }, [refresh]);

  const cancel = useCallback(async (id: string) => {
    try {
      await cancelRun(id);
      if (clearSelectionOnCancel && openId === id) setOpenId(null);
      await refresh();
    } catch (value) {
      setError(String((value as Error).message || value));
    }
  }, [cancelRun, clearSelectionOnCancel, openId, refresh]);

  return {
    runs,
    openId,
    setOpenId,
    detail,
    launching,
    error,
    setError,
    initialSettled,
    refresh,
    launch,
    cancel,
  };
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(); } catch { return iso; }
}

/** Shared launch/list/detail shell for cluster-backed jobs. */
export function ClusterJobPanel<Summary extends ClusterRunSummaryLike, Detail extends Summary>({
  launchLabel,
  launchingLabel = 'Launching…',
  launchDisabled,
  launching,
  onLaunch,
  note,
  error,
  prelude,
  runs,
  openId,
  onOpen,
  detail,
  onCancel,
  renderDetail,
  className = '',
}: {
  launchLabel: string;
  launchingLabel?: string;
  launchDisabled?: boolean;
  launching: boolean;
  onLaunch: () => void;
  note: ReactNode;
  error?: string | null;
  prelude?: ReactNode;
  runs: readonly Summary[];
  openId: string | null;
  onOpen: (id: string) => void;
  detail: Detail | null;
  onCancel: (id: string) => void;
  renderDetail: (detail: Detail) => ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={`cluster-runs ${className}`.trim()}>
      <div className="cluster-runs-head">
        <button type="button" className="tileset-view-action" onClick={onLaunch} disabled={launchDisabled || launching}>
          {launching ? launchingLabel : launchLabel}
        </button>
        <span className="cluster-runs-note">{note}</span>
      </div>
      {error ? <p className="cluster-runs-err">{error}</p> : null}
      {prelude}
      <div className="cluster-runs-body">
        <ul className="cluster-runs-list">
          {runs.length === 0 ? <li className="cluster-runs-empty">No runs yet.</li> : null}
          {runs.map((run) => (
            <li key={run.id}>
              <ChromeButton unit="inner-box" selected={openId === run.id} className="cluster-run-row" onClick={() => onOpen(run.id)}>
                <span className="cluster-run-id">{shortId(run.id)}</span>
                <span className={`cluster-run-status s-${run.status}`}>{run.status}</span>
                <span className="cluster-run-time">{formatTime(run.created_at)}</span>
              </ChromeButton>
            </li>
          ))}
        </ul>
        <InnerChromeBox className="cluster-run-detail">
          {!detail ? <p className="cluster-runs-empty">Select a run.</p> : (
            <>
              <div className="cluster-run-detail-head">
                <b className={`cluster-run-status s-${detail.status}`}>{detail.status}</b>
                {detail.status === 'running' || detail.status === 'pending'
                  ? <button type="button" className="tileset-view-action" onClick={() => onCancel(detail.id)}>Cancel</button>
                  : null}
              </div>
              {renderDetail(detail)}
            </>
          )}
        </InnerChromeBox>
      </div>
    </div>
  );
}
