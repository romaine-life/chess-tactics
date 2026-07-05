// Cluster training panel for the Gym: launch a headless tuning run on the D8als_v7
// pool (POST /api/train-runs → a k8s Job), poll the run list + a run's live result,
// and adopt the champion for this level's live AI. The heavy self-play runs on the
// cluster (auto-provisioned 8-core node, scales to zero) — never on this machine.

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { Level } from '../core/level';
import {
  launchTrainRun, listTrainRuns, getTrainRun, cancelTrainRun,
  type TrainRunSummary, type TrainRunDoc,
} from '../net/trainRuns';
import { shipAiWeights } from '../net/aiWeights';

const shortId = (id: string): string => id.slice(0, 8);
const fmtTime = (iso: string): string => { try { return new Date(iso).toLocaleTimeString(); } catch { return iso; } };

function verdictLabel(h: TrainRunDoc['body']['holdout']): string {
  if (!h || h.verdict === 'skipped') return 'no improvement to validate';
  if (h.verdict === 'accept') return `ACCEPT · +${h.elo} Elo on held-out (${h.w}/${h.d}/${h.l}, n=${h.n})`;
  if (h.verdict === 'reject') return `reject · ${h.elo} Elo on held-out (${h.w}/${h.d}/${h.l}, n=${h.n})`;
  return `${h.verdict} · ${h.w}/${h.d}/${h.l}, n=${h.n}`;
}

export function ClusterRuns({ level, levelId, onAdopt }: {
  level?: Level;
  levelId?: string;
  onAdopt: (vec: number[]) => void;
}): ReactElement {
  const [runs, setRuns] = useState<TrainRunSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TrainRunDoc | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [shipMsg, setShipMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setRuns(await listTrainRuns()); setError(null); }
    catch (e) { setError(String((e as Error).message || e)); }
  }, []);

  // Poll the run list every 8s (statuses advance as Jobs run on the cluster).
  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(t);
  }, [refresh]);

  // Poll the open run's full result every 6s until it's terminal.
  useEffect(() => {
    if (!openId) { setDetail(null); return undefined; }
    let live = true;
    const load = async () => { try { const d = await getTrainRun(openId); if (live) setDetail(d); } catch { /* transient */ } };
    void load();
    const t = window.setInterval(load, 6000);
    return () => { live = false; window.clearInterval(t); };
  }, [openId]);

  const launch = useCallback(async () => {
    if (!level) return;
    setLaunching(true); setError(null);
    try {
      const { id, status } = await launchTrainRun({
        level,
        steps: 30, restarts: 7, holdoutFraction: 0.3,
        match: { search: { maxDepth: 2, maxNodes: 20_000 }, maxPlies: 70 },
        bookSettings: { size: 12, seedBase: 1, plies: 4, variety: 0.7 },
      });
      setOpenId(id);
      if (status !== 'running') setError('run persisted but not launched (no cluster in this environment)');
      await refresh();
    } catch (e) { setError(String((e as Error).message || e)); }
    setLaunching(false);
  }, [level, refresh]);

  const cancel = useCallback(async (id: string) => {
    try { await cancelTrainRun(id); if (openId === id) setOpenId(null); await refresh(); }
    catch (e) { setError(String((e as Error).message || e)); }
  }, [openId, refresh]);

  // Whether this account may ship-to-everyone (admin). Gates the global publish button.
  useEffect(() => {
    let live = true;
    void fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d) setIsAdmin(!!d.is_admin); })
      .catch(() => { /* signed out / offline */ });
    return () => { live = false; };
  }, []);

  const ship = useCallback(async (vec: number[]) => {
    if (!levelId) return;
    setShipMsg(null);
    try { await shipAiWeights(levelId, vec); setShipMsg('✓ shipped to every player on this level'); }
    catch (e) { setShipMsg(String((e as Error).message || e)); }
  }, [levelId]);

  const champTheta = detail?.body?.champion?.step != null && detail.body.champion.step >= 0
    ? detail.body.champion.theta : null;
  const canAdopt = !!(levelId && champTheta && detail?.status === 'done');

  return (
    <div className="cluster-runs">
      <div className="cluster-runs-head">
        <button type="button" className="tileset-view-action" onClick={() => void launch()} disabled={!level || launching}>
          {launching ? 'Launching…' : 'Launch tune on the cluster'}
        </button>
        <span className="cluster-runs-note">
          8-core node auto-provisions, tunes with decisive books, validates on held-out openings, scales to zero.
        </span>
      </div>
      {error ? <p className="cluster-runs-err">{error}</p> : null}

      <div className="cluster-runs-body">
        <ul className="cluster-runs-list">
          {runs.length === 0 ? <li className="cluster-runs-empty">No runs yet.</li> : null}
          {runs.map((r) => (
            <li key={r.id}>
              <button type="button" className={`cluster-run-row${openId === r.id ? ' active' : ''}`} onClick={() => setOpenId(r.id)}>
                <span className="cluster-run-id">{shortId(r.id)}</span>
                <span className={`cluster-run-status s-${r.status}`}>{r.status}</span>
                <span className="cluster-run-time">{fmtTime(r.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="cluster-run-detail">
          {!detail ? <p className="cluster-runs-empty">Select a run.</p> : (
            <>
              <div className="cluster-run-detail-head">
                <b className={`cluster-run-status s-${detail.status}`}>{detail.status}</b>
                {detail.status === 'running' || detail.status === 'pending'
                  ? <button type="button" className="tileset-view-action" onClick={() => void cancel(detail.id)}>Cancel</button>
                  : null}
              </div>
              {detail.body?.restarts?.length ? (
                <p className="cluster-run-line">restarts: {detail.body.restarts.map((x) => x.score.toFixed(3)).join(', ')}</p>
              ) : null}
              {detail.status === 'done' ? (
                <>
                  <p className="cluster-run-line">
                    best train score <b>{(detail.body?.champion?.score ?? 0.5).toFixed(4)}</b>
                    {detail.body?.secs != null ? ` · ${detail.body.secs}s` : ''}
                  </p>
                  <p className="cluster-run-line">held-out: <b>{verdictLabel(detail.body?.holdout)}</b></p>
                  <button
                    type="button"
                    className="tileset-view-action"
                    disabled={!canAdopt}
                    title={canAdopt ? '' : 'no improvement found to adopt'}
                    onClick={() => champTheta && onAdopt(champTheta)}
                  >
                    Adopt champion (just me)
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      className="tileset-view-action"
                      disabled={!canAdopt}
                      title={canAdopt ? 'Publish to every player on this level' : 'no improvement found to ship'}
                      onClick={() => champTheta && void ship(champTheta)}
                    >
                      Ship to everyone (admin)
                    </button>
                  ) : null}
                  {shipMsg ? <p className="cluster-run-line">{shipMsg}</p> : null}
                </>
              ) : (
                <p className="cluster-run-line">tuning on the cluster… (this panel polls the result)</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
