import { installedUiMedia } from './installedUiMedia';
import { menuModeIcon } from './menuModeIcon';
import { runCardBackMediaUrl } from './RunCardBack';
import { useAppSettings } from '../settings/appSettings';
import { STRATEGIKON_SECTION_LABEL, type StrategikonSection } from './strategikonRoute';

export interface StrategikonNavigationItem {
  section: StrategikonSection;
  label: string;
  title: string;
  iconSrc: string;
  iconClassName?: string;
}

/**
 * The card mark is the only mark in the game's rails that is a PAINTING rather than
 * native pixel art: it is the player's 1060x1484 card back, drawn at a ~22px seat.
 *
 * Every mark beside it is a 64px sprite that `image-rendering: pixelated` protects —
 * smoothing those would blur pixels an artist placed. Point-sampling this one keeps
 * roughly one source pixel in 2300 and returns speckle rather than a card, so it asks
 * the compositor to filter instead. Every seat it occupies wears this class, so the
 * two treatments cannot drift apart on one surface and not another (ADR-0059).
 */
export const STRATEGIKON_CARD_MARK_CLASS = 'strategikon-card-mark';

/**
 * The mark for held cards is the back of the card itself.
 *
 * It is where cards GO — the register a draw's remainder is swept into, and the endpoint every
 * card transfer animates toward — so a card arriving there should be arriving at its own kind.
 * A generic glyph made that landing read as a card stopping on top of an unrelated button.
 *
 * It follows the back the player chose, for the same reason every other face-down card in the
 * Run does: the cards in the air and the place they land must not disagree about what a card
 * looks like.
 */
export function useStrategikonCardsIcon(): string {
  return runCardBackMediaUrl(useAppSettings().runCardBack);
}

/**
 * One inventory for both places that navigate the Strategikon: its full rail and
 * the compact shortcuts beside the Controls-title book. A destination never gets
 * a second label or mark merely because it is reached from the title band.
 */
export function strategikonNavigationItems(cardsIconSrc: string): readonly StrategikonNavigationItem[] {
  return [
    {
      section: 'enchiridion',
      label: STRATEGIKON_SECTION_LABEL.enchiridion,
      title: 'The Enchiridion — Rules and references',
      iconSrc: menuModeIcon('enchiridion'),
    },
    {
      section: 'prosopography',
      label: STRATEGIKON_SECTION_LABEL.prosopography,
      title: 'The Martial Prosopography — Current Army',
      iconSrc: installedUiMedia('ui-kit-icons-unit-studio-png'),
    },
    {
      section: 'chartulary',
      label: STRATEGIKON_SECTION_LABEL.chartulary,
      title: 'The Chartulary — Held Cards',
      iconSrc: cardsIconSrc,
      iconClassName: STRATEGIKON_CARD_MARK_CLASS,
    },
    {
      section: 'lipsanotheca',
      label: STRATEGIKON_SECTION_LABEL.lipsanotheca,
      title: 'The Lipsanotheca — Held Lipsana',
      iconSrc: installedUiMedia('ui-kit-icons-info-png'),
    },
  ];
}
