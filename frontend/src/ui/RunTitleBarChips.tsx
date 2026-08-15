import type { ReactElement, ReactNode } from 'react';
import { ATARAXIA_BY_TIER, ATARAXIA_TIERS, formatGold, type AtaraxiaTier } from '../run/model';
import { RunGoldIcon } from './RunResources';
import { ataraxiaNumeralArtUrl } from './ataraxiaNumeral';
import { RunProgressIcon } from './shared/RunProgressIcon';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import { STRATEGIKON_CARD_MARK_CLASS, useStrategikonCardsIcon } from './strategikonNavigation';
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

/**
 * The deck: how many cards this Run holds, and how many of them the Battle it stands at deals.
 *
 * Both facts were reachable only by going and looking — the held count by opening the Chartulary,
 * the deal by reading a sentence in the Sectio's reconnaissance — and a player deciding what to buy
 * or which Battle to take is deciding about exactly these two numbers. So they stand in the row the
 * bar already keeps for a Run's measures, beside the gold that buys the cards.
 *
 * It is ONE measure and not two, because the pair is one fact: how much of what you carry this
 * Battle actually gets. `dealt/held` is the same reading the Battle measure two seats along gives
 * ("4/5"), which is what lets the row be scanned rather than parsed.
 *
 * The mark is the player's own card back, not a forged deck glyph — the same mark the Chartulary
 * wears, so the register, the pile on the Deployment table and this measure are visibly the same
 * kind of thing (ADR-0059).
 *
 * It is the one measure that is also a CONTROL: gold, Ataraxia and the Run's position are places
 * the Run has arrived at, but a deck is a thing you own and go through, so the measure is the way
 * in. It is a button rather than a link (ADR-0052), and the tooltip hangs off the control itself.
 */
export function RunDeckMeasure({
  held,
  dealt,
  to,
  cardBackSrc,
}: {
  /** Cards this Run holds — the Chartulary's whole register. */
  held: number;
  /** What this Battle's Deployment actually deals, which a hand smaller than the deal caps. */
  dealt: number;
  /** The Chartulary. */
  to: string;
  /** Review-only: paint exact candidate bytes in the real seat without installing them. */
  cardBackSrc?: string;
}): ReactElement {
  const installed = useStrategikonCardsIcon();
  const src = cardBackSrc ?? installed;
  // A Battle can ask for more than the player is carrying, so the sentence must not read a
  // fraction off a smaller hand — the same distinction the Sectio's reconnaissance draws.
  const detail = held <= dealt
    ? <>Every card you hold is dealt into this Battle&rsquo;s Deployment. Open the Chartulary.</>
    : <>This Battle&rsquo;s Deployment deals {dealt} of them. Open the Chartulary.</>;
  const cards = `${held} card${held === 1 ? '' : 's'}`;
  return (
    <TitleBarStatusTip
      className="skirmish-status-chip run-topbar-measure run-topbar-deck"
      fillSurface={CHROME_LEAF_FILL_SURFACE}
      label={`Deck. ${cards} held, ${dealt} dealt into this Battle.`}
      controlLabel={`Deck: ${cards} held, ${dealt} dealt into this Battle. Open the Chartulary.`}
      name="Deck"
      detail={detail}
      explainMechanics={false}
      testId="run-topbar-deck"
      to={to}
    >
      <span className="run-topbar-deck-mark" aria-hidden="true">
        <img className={STRATEGIKON_CARD_MARK_CLASS} src={src} alt="" draggable={false} />
      </span>
      <span>{dealt}/{held}</span>
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
  deck,
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
  /**
   * The deck measure, when the mounting screen can address the Chartulary. It is passed in
   * rather than built here because it is the row's one measure that NAVIGATES, and the
   * address belongs to the route — the Strategikon hangs off `/run` and `/play` both.
   * The icon review mounts this row without one; a measure that is also a destination has
   * nowhere to go on a Studio page.
   */
  deck?: ReactNode;
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
      {/* Beside the gold, because gold and cards are the two things a Run HAS; Conflict and
          Battle after them are where it stands. */}
      {deck}
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
