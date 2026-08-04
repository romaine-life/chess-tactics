import {
  RUN_STARTER_CARD_BY_ID,
  cardContentsLabel,
  type RunArmyPieceType,
  type AdlectablePieceType,
  type RunStarterCardId,
} from './model';

const CARD_INITIAL: Readonly<Record<AdlectablePieceType, string>> = Object.freeze({
  pawn: 'p',
  knight: 'k',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
});
const CARD_PIECE_ORDER: readonly AdlectablePieceType[] = Object.freeze(['pawn', 'knight', 'bishop', 'rook', 'queen']);

/**
 * A card's identity is its piece composition, not the offer that dealt it: a Sectio
 * offer and an Enchiridion record with the same pieces are the same card. This
 * resolves any card to the deck's canonical id (piece initials in
 * Adlectio order), regardless of the carrier's own id or piece ordering.
 */
type NameableRunCard = Readonly<{ id?: string; pieces: readonly RunArmyPieceType[] }>;

export function canonicalCardId(card: NameableRunCard): string {
  if (card.id === 'his-grace' || card.id === 'front-lines') return card.id;
  return [...card.pieces]
    .filter((piece): piece is AdlectablePieceType => piece !== 'king')
    .sort((left, right) => CARD_PIECE_ORDER.indexOf(left) - CARD_PIECE_ORDER.indexOf(right))
    .map((piece) => CARD_INITIAL[piece])
    .join('');
}

// Every card in the generated deck carries an authored banner name, in the same
// historical-medieval register as the lipsanon names. The id scheme is the card's
// piece initials in Adlectio order (p/k/b/r/q — k is the Knight), so 'ppb' is two Pawns
// and a Bishop. A card outside the deck (e.g. an art-review fixture) falls back to its
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

// Original anti-story fragments tied to the same four historical pressure sources as
// the core names and illustrations. They identify a card without explaining why this
// history has surfaced in the game.
export const RUN_CARD_FLAVOR_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  p: 'The frost came in June. By August, the road had found him.',
  pp: 'The road kept both pairs of boots, and returned neither name.',
  b: 'The sanctuary was gone. The lesson continued beside the road.',
  k: 'Every road was marked urgent. None said where it led.',
  ppp: 'They covered the seedlings at noon and took up poles by dusk.',
  pb: 'The pilgrim carried the lamp. The escort carried what remained.',
  pk: 'The seal was unbroken. The stable boy had already understood.',
  pppp: 'When the gate ceased to matter, the road filled with households.',
  ppb: 'The abbey lost its roof. The parish borrowed the stones.',
  ppk: 'They patrolled the road for holes; the war supplied them freely.',
  ppppp: 'Five answered the bell. The harvest had answered nothing.',
  r: 'From the tower, every road led away.',
  bb: 'Matins survived the bells. Vespers survived the roof.',
  kb: 'The blade guarded the road; the censer remembered the room.',
  kk: 'Thunder crossed the fields long before the horses did.',
  pppb: 'The flock found grass beneath snow that had fallen in June.',
  pppk: 'The banner arrived clean. Nothing else did.',
  pppppp: 'They left in ranks only because the road was narrow.',
  pr: 'He kept the gate after the house behind it was emptied.',
  pbb: 'The council adjourned to the road and never reconvened indoors.',
  pkb: 'No city received them. They continued as though one might.',
  pkk: 'The escort knew the route by the carts returning empty.',
  ppppb: 'The blessing was brief. The frost was not.',
  ppppk: 'The horses wore summer tack beneath a winter sky.',
  ppppppp: 'Seven hands sowed the field. The sun withheld its witness.',
  ppr: 'The garrison watched a border drawn by those already gone.',
  br: 'The cloister was sold. The keep remained employed.',
  kr: 'At dawn the castellan rode through an abbey with no brothers.',
  ppbb: 'The chapel traveled because the wounded could not.',
  ppkb: 'They agreed upon the road, having nowhere left to meet.',
  ppkk: 'Four riders escorted linen farther than any standard.',
  pppppb: 'The tithe arrived at a door whose owner had changed.',
  pppppk: 'The levy knew the mile markers better than the cause.',
  pppppppp: 'Eight backs bent beneath a sky that mistook June for November.',
  pppr: 'They repaired the wall with stones from the abandoned quarter.',
  bbb: 'Three doctrines agreed that the room could no longer hold them.',
  kbb: 'The charger knelt where the altar had been carted away.',
  kkb: 'He blessed the departing riders and counted the returning horses.',
  kkk: 'They rode hard beneath snow no calendar had permitted.',
  pbr: 'The church became stone. The castle called it repair.',
  pkr: 'They opened the gate before dawn. The road was already awake.',
  pppbb: 'The vessels were carried out. The feast became the carrying.',
  pppkb: 'The bell was gone. Five shadows gathered at the accustomed hour.',
  pppkk: 'They returned with one spare horse and no account of the fifth.',
  ppppppb: 'They gathered beside the chapel once gathering inside became trespass.',
  ppppppk: 'By the seventh mile, inspection and endurance were the same duty.',
  ppppppppp: 'Nine sowed in frost. None called it winter.',
  ppppr: 'Relief entered through the breach after the city had left.',
  q: 'She watched the empty court until ceremony became weather.',
});

/** The card's banner name; compositions outside the authored deck read as their contents. */
export function runCardName(card: NameableRunCard): string {
  const starter = RUN_STARTER_CARD_BY_ID[card.id as RunStarterCardId];
  if (starter) return starter.name;
  return RUN_CARD_NAME_BY_ID[canonicalCardId(card)] ?? cardContentsLabel(card);
}

/** The card's stable authored flavor; only out-of-deck diagnostic cards fall back. */
export function runCardFlavor(card: NameableRunCard): string {
  const starter = RUN_STARTER_CARD_BY_ID[card.id as RunStarterCardId];
  if (starter) return starter.flavor;
  return RUN_CARD_FLAVOR_BY_ID[canonicalCardId(card)] ?? 'No account survives.';
}

/** Stable semantic live-media slot for one canonical core Units card. */
export function runCardArtSlot(card: NameableRunCard): string {
  // The starter pair uses installed royal and levy illustrations in the beta. Their shared
  // purple frame carries starter identity while His Grace's royal subject does the rest.
  const id = canonicalCardId(card);
  return `ui/run/card-art/${id === 'his-grace' ? 'q' : id === 'front-lines' ? 'pp' : id}/illustration.png`;
}

// A card is addressed by the name printed on its banner, not by the piece-initial id the
// model keys it under: `/enchiridion/cards/country-parish` names the record a reader can
// see, where `ppb` names an implementation detail. The id remains the model's key.
const slugify = (name: string): string => name
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

/** The address form of a card id: its banner name, hyphenated. Unnamed ids address as themselves. */
export function runCardSlug(cardId: string): string {
  const name = RUN_CARD_NAME_BY_ID[cardId];
  return name ? slugify(name) : cardId;
}

/** Every authored card address, resolved back to the deck id it names. */
export const RUN_CARD_ID_BY_SLUG: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.keys(RUN_CARD_NAME_BY_ID).map((id) => [runCardSlug(id), id])),
);
