import { RUN_CARD_BACKS, type RunCardBack } from './appSettings';

/**
 * The live-media identity of each offered back.
 *
 * One slot per back, named for the back rather than for its position in the offered set, so
 * retiring one or changing which is default never re-points another one's pixels. The legacy
 * `standard.png` slot is kept in step with the shipped default and is the fallback for any surface
 * that has not asked the player what they chose; see RunCardBack.tsx.
 */
export const RUN_CARD_BACK_SLOT_PREFIX = 'ui/run/card-back/';

export function runCardBackSlot(back: RunCardBack): string {
  return `${RUN_CARD_BACK_SLOT_PREFIX}${back}.png`;
}

/** Every slot the offered set depends on. Exported so a media check can assert the set is whole. */
export const RUN_CARD_BACK_SLOTS: readonly string[] = RUN_CARD_BACKS.map(runCardBackSlot);

/**
 * The name the player picks by, and one line of what they are choosing between.
 *
 * The detail names what is actually on the card — this is a picture being chosen by sight, and the
 * dropdown row has to be readable before the preview redraws. None of them describes gameplay,
 * because none of them changes it: a back conceals every card identity equally.
 */
export const RUN_CARD_BACK_LABELS: Readonly<Record<RunCardBack, { label: string; detail: string }>> = Object.freeze({
  'kings-position': {
    label: 'The King’s Position',
    detail: 'The king alone on a board of his own pieces. Chess with no fantasy in it.',
  },
  'fivefold-gambit': {
    label: 'The Fivefold Gambit',
    detail: 'Five gemmed powers ringing a checkered field, pillared at the corners.',
  },
  'closed-position': {
    label: 'The Closed Position',
    detail: 'Four knights turned inward on a cream and black board, facing off across the centre.',
  },
  'arcane-relic': {
    label: 'The Arcane Relic',
    detail: 'Concentric brass rings around a lit amber core, like an instrument for reading the sky.',
  },
  'crowned-gambit': {
    label: 'The Crowned Gambit',
    detail: 'The crowned king standing at the centre of the board’s own geometry.',
  },
  register: {
    label: 'The Register',
    detail: 'No figure at all — a clasped campaign ledger in steel and midnight blue.',
  },
});
