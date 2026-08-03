import { liveMediaSlotsWithPrefix } from '@chess-tactics/board-render';

/**
 * The carved-stone rung marks (ADR-0363), forged by `scripts/forge-ataraxia-numerals.mjs`
 * and installed as live media under one prefix. The numeral IS Ataraxia's mark, so every
 * surface that shows a tier — the Enchiridion ladder, the Run title bar — resolves it
 * here rather than inventing a second symbol for the same idea (ADR-0059).
 *
 * Read by PREFIX, not by required slot: an installed art set is the enrichment, and a
 * tier must still render on a deployment where the set has not been accepted yet.
 * `liveMediaForSlot` would throw there and take the surface down for a mark.
 *
 * The slug rule matches the forge's: the baseline is `zero` because a bare `0.png` reads
 * as an index, and every Roman rung is its own numeral lowercased.
 */
export const ATARAXIA_NUMERAL_SLOT_PREFIX = 'ui/kit/numerals/stone/';

export function ataraxiaNumeralSlot(numeral: string): string {
  return `${ATARAXIA_NUMERAL_SLOT_PREFIX}${numeral === '0' ? 'zero' : numeral.toLowerCase()}.png`;
}

export function ataraxiaNumeralArtUrl(numeral: string): string | null {
  const slot = ataraxiaNumeralSlot(numeral);
  return liveMediaSlotsWithPrefix(ATARAXIA_NUMERAL_SLOT_PREFIX)
    .find((entry) => entry.slot === slot)?.media.immutableUrl ?? null;
}
