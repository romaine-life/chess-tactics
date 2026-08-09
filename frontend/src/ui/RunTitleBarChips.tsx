import type { ReactElement, ReactNode } from 'react';
import { ATARAXIA_BY_TIER, ATARAXIA_TIERS, formatGold, type AtaraxiaTier } from '../run/model';
import { RunGoldIcon } from './RunResources';
import { ataraxiaNumeralArtUrl } from './ataraxiaNumeral';
import { RunProgressIcon } from './shared/RunProgressIcon';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import { TitleBarStatusTip } from './shell/TitleBarControls';

// What the persistent title bar says about a Run.
//
// ONE chip carries the identity you cannot draw — the War's name, and the
// authored name of the Battle you are at. The rest are MEASURES: an icon and
// its number. A Run's Ataraxia tier, gold, Conflict and Battle are all the same
// kind of fact, so they read as one row.
//
// Every one of them is framed, and the frame is earned rather than decorative:
// each box is exactly one hover/keyboard target that names what is inside it. A
// mark is a symbol standing in for a word, so it has to be able to say the word
// — through the shared Tooltip, never a native title="", which is a browser
// convention rather than a game one (ADR-0052). Measures used to sit bare on the
// bar with no frame; they were already tooltips, so nothing said where one
// target ended and the next began. TitleBarStatusTip is that box-is-the-target
// rule, and it is the same rule the battle clock and the identity chip answer to.
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
    <TitleBarStatusTip
      className="skirmish-status-chip skirmish-turn-plate run-topbar-identity"
      fillSurface={CHROME_LEAF_FILL_SURFACE}
      label={levelName ? `${warName}. Battle: ${levelName}` : warName}
      name={warName}
      detail={levelName
        ? <>The War this Run is fighting, and the Battle it is at.</>
        : <>The War this Run is fighting.</>}
      explainMechanics={false}
    >
      <strong>{warName}</strong>
      {levelName ? <small>{levelName}</small> : null}
    </TitleBarStatusTip>
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
    <TitleBarStatusTip
      className="skirmish-status-chip run-topbar-measure"
      fillSurface={CHROME_LEAF_FILL_SURFACE}
      label={label}
      name={name}
      detail={detail}
      explainMechanics={explainMechanics}
      popupClassName={popupClassName}
    >
      {children}
    </TitleBarStatusTip>
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
        detail="What this Run has to spend in the Sectio."
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
