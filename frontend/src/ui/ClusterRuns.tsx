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
import { ClusterJobPanel, useClusterJobController } from './shared/ClusterJobPanel';

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
  const controller = useClusterJobController<TrainRunSummary, TrainRunDoc>({
    listRuns: listTrainRuns,
    getRun: getTrainRun,
    cancelRun: cancelTrainRun,
    clearSelectionOnCancel: true,
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [shipMsg, setShipMsg] = useState<string | null>(null);

  const launch = useCallback(() => {
    if (!level) return;
    void controller.launch(() => launchTrainRun({
        level,
        steps: 30, restarts: 7, holdoutFraction: 0.3,
        match: { search: { maxDepth: 2, maxNodes: 20_000 }, maxPlies: 70 },
        bookSettings: { size: 12, seedBase: 1, plies: 4, variety: 0.7 },
      }));
  }, [controller, level]);

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

  const champTheta = controller.detail?.body?.champion?.step != null && controller.detail.body.champion.step >= 0
    ? controller.detail.body.champion.theta : null;
  const canAdopt = !!(levelId && champTheta && controller.detail?.status === 'done');

  return (
    <ClusterJobPanel
      launchLabel="Launch tune on the cluster"
      launchDisabled={!level}
      launching={controller.launching}
      onLaunch={launch}
      note="8-core node auto-provisions, tunes with decisive books, validates on held-out openings, scales to zero."
      error={controller.error}
      runs={controller.runs}
      openId={controller.openId}
      onOpen={controller.setOpenId}
      detail={controller.detail}
      onCancel={(id) => { void controller.cancel(id); }}
      renderDetail={(detail) => <>
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
      </>}
    />
  );
}
