import type { ReactElement } from 'react';
import { ATARAXIA_BY_TIER, type AtaraxiaTier } from '../run/model';
import { RunGoldAmount } from './RunResources';
import { RunProgressIcon } from './shared/RunProgressIcon';
import { TitleBarStatus } from './shell/TitleBarControls';

// What the persistent title bar says about a Run, in two parts.
//
// ONE chip carries the identity you cannot draw — the War's name, and the
// authored name of the Battle you are at. Everything else is a MEASURE: an icon
// and its number, sitting bare on the bar with no frame of its own. A Run's
// Ataraxia tier, gold, Conflict and Battle are all the same kind of fact, so
// they read as one row of marks rather than a row of little boxes.
//
// The icon review mounts these SAME components (ADR-0059), so a candidate is
// judged in its real seat. `…IconSrc` is the review-only seam: it paints exact
// candidate bytes without installing anything.

export function RunIdentityChip({
  warName,
  levelName,
}: {
  warName: string;
  levelName: string | null;
}): ReactElement {
  return (
    <TitleBarStatus className="skirmish-status-chip skirmish-turn-plate run-topbar-identity">
      <strong>{warName}</strong>
      {levelName ? <small>{levelName}</small> : null}
    </TitleBarStatus>
  );
}

export function RunTitleBarMeasures({
  tier,
  goldTenths,
  conflict,
  battle,
  battlesInConflict,
  ataraxiaIconSrc,
  conflictIconSrc,
  battleIconSrc,
}: {
  tier: AtaraxiaTier;
  goldTenths: number;
  conflict: number;
  battle: number;
  battlesInConflict: number;
  ataraxiaIconSrc?: string;
  conflictIconSrc?: string;
  battleIconSrc?: string;
}): ReactElement {
  const ataraxia = ATARAXIA_BY_TIER[tier];
  return (
    <div className="run-topbar-measures">
      {/* The symbol names Ataraxia; only its tier is written. The tier's own name
          stays available on hover rather than spending bar width on the word. */}
      <span className="run-topbar-measure" title={`${ataraxia.label} — ${ataraxia.title}`}>
        <RunProgressIcon variant="ataraxia" src={ataraxiaIconSrc} />
        <span>{tier}</span>
      </span>
      <RunGoldAmount valueTenths={goldTenths} className="run-gold-amount--title" />
      <span className="run-topbar-measure" title={`Conflict ${conflict}`}>
        <RunProgressIcon variant="conflict" src={conflictIconSrc} />
        <span>{conflict}</span>
      </span>
      <span className="run-topbar-measure" title={`Battle ${battle} of ${battlesInConflict}`}>
        <RunProgressIcon variant="battle" src={battleIconSrc} />
        <span>{battle}/{battlesInConflict}</span>
      </span>
    </div>
  );
}
