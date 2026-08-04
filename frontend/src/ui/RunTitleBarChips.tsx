import type { ReactElement, ReactNode } from 'react';
import { ATARAXIA_BY_TIER, ATARAXIA_TIERS, formatGold, type AtaraxiaTier } from '../run/model';
import { RunGoldIcon } from './RunResources';
import { ataraxiaNumeralArtUrl } from './ataraxiaNumeral';
import { RunProgressIcon } from './shared/RunProgressIcon';
import { Tooltip } from './shared/InfoTip';
import { TitleBarStatus } from './shell/TitleBarControls';

// What the persistent title bar says about a Run, in two parts.
//
// ONE chip carries the identity you cannot draw — the War's name, and the
// authored name of the Battle you are at. Everything else is a MEASURE: an icon
// and its number, sitting bare on the bar with no frame of its own. A Run's
// Ataraxia tier, gold, Conflict and Battle are all the same kind of fact, so
// they read as one row of marks rather than a row of little boxes.
//
// A mark is a symbol standing in for a word, so every measure names itself
// through the shared Tooltip — never a native title="", which is a browser
// convention rather than a game one (ADR-0052).
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

function RunMeasure({
  label,
  name,
  detail,
  explainMechanics,
  popupClassName,
  children,
}: {
  label: string;
  name: string;
  detail: ReactNode;
  explainMechanics?: boolean;
  popupClassName?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Tooltip
      className="run-topbar-measure-tip"
      triggerClassName="run-topbar-measure"
      label={label}
      title={name}
      trigger={children}
      explainMechanics={explainMechanics}
      popupClassName={popupClassName}
    >
      {detail}
    </Tooltip>
  );
}

function AtaraxiaTooltipRules({ tier }: { tier: AtaraxiaTier }): ReactElement {
  const activeTiers = ATARAXIA_TIERS.filter((activeTier) => activeTier <= tier);
  return (
    <span className="run-ataraxia-tooltip-list">
      {activeTiers.map((activeTier) => {
        const definition = ATARAXIA_BY_TIER[activeTier];
        const art = ataraxiaNumeralArtUrl(definition.numeral);
        return (
          <span className="run-ataraxia-tooltip-rule" key={activeTier}>
            {art
              ? (
                  <span className="run-ataraxia-tooltip-rung is-art" aria-hidden="true">
                    <img src={art} alt="" draggable={false} />
                  </span>
                )
              : (
                  <span className="run-ataraxia-tooltip-rung is-unavailable" aria-hidden="true">
                    {definition.numeral}
                  </span>
                )}
            <span>{definition.effect}</span>
          </span>
        );
      })}
    </span>
  );
}

export function RunTitleBarMeasures({
  tier,
  goldTenths,
  conflict,
  battle,
  battlesInConflict,
  ataraxiaIconSrc,
  goldIconSrc,
  conflictIconSrc,
  battleIconSrc,
}: {
  tier: AtaraxiaTier;
  goldTenths: number;
  conflict: number;
  battle: number;
  battlesInConflict: number;
  ataraxiaIconSrc?: string;
  goldIconSrc?: string;
  conflictIconSrc?: string;
  battleIconSrc?: string;
}): ReactElement {
  const ataraxia = ATARAXIA_BY_TIER[tier];
  const activeAtaraxia = ATARAXIA_TIERS.filter((activeTier) => activeTier <= tier);
  const rungArt = ataraxiaNumeralArtUrl(ataraxia.numeral);
  const gold = formatGold(goldTenths);
  return (
    <div className="run-topbar-measures">
      {/* The emblem says WHICH ladder, the carved rung says how far up it (ADR-0363).
          The Enchiridion row can drop the emblem because its section heading already
          names Ataraxia; a bar with no heading cannot, or the rung reads as a loose
          counter. The tier's name and rule stay in the tooltip. */}
      <RunMeasure
        label={`Ataraxia. ${activeAtaraxia.map((activeTier) => (
          `${ATARAXIA_BY_TIER[activeTier].numeral}: ${ATARAXIA_BY_TIER[activeTier].effect}`
        )).join(' ')}`}
        name="Ataraxia"
        detail={<AtaraxiaTooltipRules tier={tier} />}
        explainMechanics={false}
        popupClassName="run-ataraxia-tooltip"
      >
        <RunProgressIcon variant="ataraxia" src={ataraxiaIconSrc} />
        {rungArt
          ? <span className="run-topbar-rung"><img src={rungArt} alt="" draggable={false} /></span>
          : <span className="run-topbar-rung is-unavailable">{ataraxia.numeral}</span>}
      </RunMeasure>
      <RunMeasure
        label={`${gold} gold`}
        name="Gold"
        detail="What this Run has to spend in the Shop."
      >
        <RunGoldIcon src={goldIconSrc} />
        <span>{gold}</span>
      </RunMeasure>
      <RunMeasure
        label={`Conflict ${conflict}`}
        name={`Conflict ${conflict}`}
        detail="The chapter of the War this Run is in. Each one ends in Loot."
      >
        <RunProgressIcon variant="conflict" src={conflictIconSrc} />
        <span>{conflict}</span>
      </RunMeasure>
      <RunMeasure
        label={`Battle ${battle} of ${battlesInConflict}`}
        name={`Battle ${battle} of ${battlesInConflict}`}
        detail="Where this Run stands among that Conflict's Battles."
      >
        <RunProgressIcon variant="battle" src={battleIconSrc} />
        <span>{battle}/{battlesInConflict}</span>
      </RunMeasure>
    </div>
  );
}
