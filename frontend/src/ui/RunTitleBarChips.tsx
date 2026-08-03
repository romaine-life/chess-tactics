import type { ReactElement } from 'react';
import { ATARAXIA_BY_TIER, type AtaraxiaTier } from '../run/model';
import { RunProgressIcon } from './shared/RunProgressIcon';
import { TitleBarStatus } from './shell/TitleBarControls';

// The two Run status chips the persistent title bar paints, as one shared
// component pair. The Run screen renders them live; the icon review mounts the
// SAME chips so a candidate is judged in its real seat rather than in a
// look-alike built beside it (ADR-0059). `iconSrc` is the review-only seam: it
// paints exact candidate bytes without installing anything.

export function RunAtaraxiaChip({
  warName,
  tier,
  iconSrc,
}: {
  warName: string;
  tier: AtaraxiaTier;
  iconSrc?: string;
}): ReactElement {
  const ataraxia = ATARAXIA_BY_TIER[tier];
  return (
    <TitleBarStatus className="skirmish-status-chip skirmish-turn-plate">
      <strong>{warName}</strong>
      <small className="run-topbar-measure" title={ataraxia.title}>
        <RunProgressIcon variant="ataraxia" src={iconSrc} />
        <span>{ataraxia.label}</span>
      </small>
    </TitleBarStatus>
  );
}

export function RunProgressChip({
  conflict,
  battle,
  battlesInConflict,
  levelName,
  conflictIconSrc,
  battleIconSrc,
}: {
  conflict: number;
  battle: number;
  battlesInConflict: number;
  levelName: string | null;
  conflictIconSrc?: string;
  battleIconSrc?: string;
}): ReactElement {
  return (
    <TitleBarStatus className="skirmish-status-chip skirmish-objective">
      <span>
        <strong className="run-topbar-progress">
          <span className="run-topbar-measure" title={`Conflict ${conflict}`}>
            <RunProgressIcon variant="conflict" src={conflictIconSrc} />
            <span>{conflict}</span>
          </span>
          <span className="run-topbar-measure" title={`Battle ${battle} of ${battlesInConflict}`}>
            <RunProgressIcon variant="battle" src={battleIconSrc} />
            <span>{battle}/{battlesInConflict}</span>
          </span>
        </strong>
        {levelName ? <small>{levelName}</small> : null}
      </span>
    </TitleBarStatus>
  );
}
