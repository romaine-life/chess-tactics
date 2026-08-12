import { useEffect, useState, type ReactElement } from 'react';
import { observeRun, type RunObservationFrame } from '../net/runObservation';
import { useSceneParticipant } from './shell/SceneBoundary';

// Read-only observation of one player's Run, live.
//
// It reads and never writes: there is no store to adopt into and no control to press, because a
// watcher's browser holding a Run would be a second authority over a document that already has
// one. Frames arrive on the player's own acknowledged mutations, so this follows them through the
// War — Sectio to Deployment to Aftermath — for as long as the page is open.
//
// Opening this page IS the observation. Closing it ends it, and the player's seat goes dark.

interface WatchedRun {
  id?: string;
  phase?: string;
  battleIndex?: number;
  goldTenths?: number;
  army?: { id: string; name?: string; type?: string }[];
  cards?: { id: string; coreId?: string }[];
  lipsana?: string[];
  war?: { name?: string; battles?: unknown[] };
}

const PHASE_LABELS: Record<string, string> = {
  commendatio: 'Commendatio',
  sectio: 'Sectio',
  deployment: 'Deployment',
  battle: 'Battle',
  aftermath: 'Aftermath',
  victory: 'Victory',
};

export function RunWatch({ owner }: { owner: string }): ReactElement {
  const [frame, setFrame] = useState<RunObservationFrame | null>(null);

  useEffect(() => observeRun(owner, setFrame), [owner]);

  // The scene is painted once the first frame lands: until then there is nothing to show, and a
  // scene that never reports leaves the shell on its startup ladder forever.
  useSceneParticipant(
    'run-watch',
    frame === null ? 'loading' : frame.type === 'unavailable' ? 'error' : 'painted',
    frame?.type === 'unavailable' ? new Error('run observation unavailable') : null,
  );

  if (!frame) return <p className="run-watch-note">Opening the observation…</p>;
  if (frame.type === 'gone') return <p className="run-watch-note">{owner} has no Run in progress.</p>;
  if (frame.type !== 'run') return <p className="run-watch-note" role="alert">That Run could not be read.</p>;

  const run = (frame.run ?? {}) as WatchedRun;
  const battle = Number.isInteger(run.battleIndex) ? (run.battleIndex as number) + 1 : null;
  const battles = Array.isArray(run.war?.battles) ? run.war?.battles.length : null;
  // Gold is whole and exact; the document carries tenths and the screen shows the number.
  const gold = Number.isFinite(run.goldTenths) ? Math.round((run.goldTenths as number) / 10) : null;

  return (
    <div className="run-watch">
      <p className="run-watch-caption">
        <span className="run-watch-player">{owner}</span>
        <span className="run-watch-where">
          {[
            run.phase ? PHASE_LABELS[run.phase] ?? run.phase : null,
            battle === null ? null : battles ? `Battle ${battle} of ${battles}` : `Battle ${battle}`,
            run.war?.name ?? null,
          ].filter(Boolean).join(' · ')}
        </span>
      </p>
      <dl className="run-watch-facts">
        <div><dt>Gold</dt><dd>{gold ?? '—'}</dd></div>
        <div><dt>Army</dt><dd>{run.army?.length ?? 0}</dd></div>
        <div><dt>Cards</dt><dd>{run.cards?.length ?? 0}</dd></div>
        <div><dt>Lipsana</dt><dd>{run.lipsana?.length ?? 0}</dd></div>
        <div><dt>Revision</dt><dd>{frame.revision ?? '—'}</dd></div>
      </dl>
      {run.army?.length ? (
        <ul className="run-watch-army">
          {run.army.map((unit) => (
            <li key={unit.id}>{unit.name || unit.type || unit.id}</li>
          ))}
        </ul>
      ) : null}
      <p className="run-watch-note">
        Live. Every move they make on the Run reaches this page; closing it ends the observation.
      </p>
    </div>
  );
}
