import { bundleLabel, type PieceBundle, type PurchasablePieceType } from './model';

const CARD_INITIAL: Readonly<Record<PurchasablePieceType, string>> = Object.freeze({
  pawn: 'p',
  knight: 'k',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
});
const CARD_PIECE_ORDER: readonly PurchasablePieceType[] = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen']);

/**
 * A card's identity is its piece composition, not the offer that dealt it: a draft
 * offer, a shop bundle, and an Enchiridion record with the same pieces are the same
 * card. This resolves any bundle to the deck's canonical id (piece initials in
 * purchase order), regardless of the carrier's own id or piece ordering.
 */
export function canonicalCardId(bundle: Pick<PieceBundle, 'pieces'>): string {
  return [...bundle.pieces]
    .sort((left, right) => CARD_PIECE_ORDER.indexOf(left) - CARD_PIECE_ORDER.indexOf(right))
    .map((piece) => CARD_INITIAL[piece])
    .join('');
}

// Every card in the generated piece-bundle deck carries an authored banner name, in the
// same historical-medieval register as the relic names. The id scheme is the bundle's
// piece initials in purchase order (p/k/b/r/q — k is the Knight), so 'ppb' is two Pawns
// and a Bishop. A bundle outside the deck (e.g. an art-review fixture) falls back to its
// prose label.
export const RUN_CARD_NAME_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  // 1 gold
  p: 'The Volunteer',
  // 2 gold
  pp: 'Two Good Boots',
  // 3 gold
  b: 'Wandering Preacher',
  k: 'Errant Rider',
  ppp: 'Farmhand Levy',
  // 4 gold
  pb: "Pilgrim's Escort",
  pk: "Squire's Errand",
  pppp: 'Ragged Column',
  // 5 gold
  ppb: 'Country Parish',
  ppk: 'Outrider Patrol',
  ppppp: 'Village Muster',
  r: 'The Watchtower',
  // 6 gold
  bb: 'Matins and Vespers',
  kb: 'Sword and Censer',
  kk: 'Thundering Lances',
  pppb: "Shepherd's Flock",
  pppk: "Banneret's Retinue",
  pppppp: 'The Long March',
  pr: "Gatekeeper's Watch",
  // 7 gold
  pbb: 'Synod on the Road',
  pkb: 'Little Crusade',
  pkk: 'Vanguard Escort',
  ppppb: 'Harvest Blessing',
  ppppk: 'Country Cavalcade',
  ppppppp: 'Seven Stout Hearts',
  ppr: 'Border Garrison',
  // 8 gold
  br: 'Cloister and Keep',
  kr: "Castellan's Sally",
  ppbb: 'Traveling Chapel',
  ppkb: "Wayfarers' Compact",
  ppkk: 'Escort of Lances',
  pppppb: 'Tithe Procession',
  pppppk: "Field Marshal's Levy",
  pppppppp: 'The Full Furrow',
  pppr: 'Rampart Detail',
  // 9 gold
  bbb: 'Ecumenical Council',
  kbb: 'Blessed Charger',
  kkb: 'Chaplain of the Charge',
  kkk: 'Full Gallop',
  pbr: 'Church and Castle',
  pkr: 'Sortie at Dawn',
  pppbb: 'Feast Day Procession',
  pppkb: 'Parish Militia',
  pppkk: "Raiders' Return",
  ppppppb: 'Sunday Congregation',
  ppppppk: 'The Long Patrol',
  ppppppppp: 'Nine Ranks Deep',
  ppppr: 'Garrison Relief',
  q: 'Regal Serenity',
});

/** The card's banner name; compositions outside the authored deck read as their contents. */
export function runCardName(bundle: Pick<PieceBundle, 'pieces'>): string {
  return RUN_CARD_NAME_BY_ID[canonicalCardId(bundle)] ?? bundleLabel(bundle);
}
