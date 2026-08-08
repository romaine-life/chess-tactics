import {
  RUN_STARTER_CARD_BY_ID,
  RUN_STARTER_CARDS,
  RUN_CARD_BY_ID,
  RUN_CARD_CATALOG,
  RUN_CARD_DECK,
  runCardDefinition,
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
type NameableRunCard = Readonly<{ id?: string; artId?: string; pieces: readonly RunArmyPieceType[] }>;

function compositionCardId(pieces: readonly RunArmyPieceType[]): string {
  return [...pieces]
    .filter((piece): piece is AdlectablePieceType => piece !== 'king')
    .sort((left, right) => CARD_PIECE_ORDER.indexOf(left) - CARD_PIECE_ORDER.indexOf(right))
    .map((piece) => CARD_INITIAL[piece])
    .join('');
}

export function canonicalCardId(card: NameableRunCard): string {
  if (card.id && runCardDefinition(card.id)) return card.id;
  return compositionCardId(card.pieces);
}

// Every card in the generated deck carries an authored banner name, in the same
// historical-medieval register as the lipsanon names. The id scheme is the card's
// piece initials in Adlectio order (p/k/b/r/q — k is the Knight), so 'ppb' is two Pawns
// and a Bishop. A card outside the deck (e.g. an art-review fixture) falls back to its
// prose label.
const ALL_RUN_CARD_NAME_BY_ID: Readonly<Record<string, string>> = Object.freeze({
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
  pq: 'The Last Attendant',
  'pk-front': "Squire's Shelter",
  'pb-front': "Pilgrim's Shelter",
  'ppk-reversed': 'The Late Escort',
  'ppb-reversed': 'The Uncovered Office',
  'bb-diagonal': 'Crooked Diocese',
  'pr-front': "Gatekeeper's Charge",
  'kk-horizontal': 'Thundering Lances',
  'ppk-protected': 'Outrider Patrol',
  'ppb-protected': 'Country Parish',
  'pq-front': 'The Last Attendant',
  'bb-vertical': 'Matins and Vespers',
  'rr-vertical': 'The Twin Keeps',
});

/**
 * Every card that can be HELD, which is more than the deck deals.
 *
 * A formation retired from the offer deck stays in Runs that already hold one — `allRunCards`
 * retires the diagonal formations, and `legacyRunCards` deliberately keeps them resolvable. Keying
 * the banner off the dealt deck alone would drop a retired card's authored name and address the
 * moment it stopped being offered, so a held card would degrade to a prose contents label and its
 * `/enchiridion/cards/<name>` address would break. Authored ids are added back here.
 */
function nameableRunCards(): typeof RUN_CARD_DECK[number][] {
  const cards = new Map(RUN_CARD_DECK.map((card) => [card.id, card]));
  for (const id of Object.keys(ALL_RUN_CARD_NAME_BY_ID)) {
    // Composition keys such as `pb` name a family and resolve to no card; only real ids are added.
    // RUN_CARD_BY_ID is the core deck only, so a starter can never arrive through this door.
    const core = RUN_CARD_BY_ID[id];
    if (core && !cards.has(id)) cards.set(id, core);
  }
  return [...cards.values()];
}

/** Generated formations intentionally borrow their composition's existing title during the
 * playable prototype. Exact ids and diagrams remain distinct even when prose repeats. */
export const RUN_CARD_NAME_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(nameableRunCards().map((card) => [
    card.id,
    ALL_RUN_CARD_NAME_BY_ID[card.id]
      ?? ALL_RUN_CARD_NAME_BY_ID[compositionCardId(card.pieces)]
      ?? ALL_RUN_CARD_NAME_BY_ID[card.artId ?? '']
      ?? cardContentsLabel(card),
  ])),
);

// Original anti-story fragments tied to the same four historical pressure sources as
// the core names and illustrations. They identify a card without explaining why this
// history has surfaced in the game.
const ALL_RUN_CARD_FLAVOR_BY_ID: Readonly<Record<string, string>> = Object.freeze({
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
  pq: 'One attendant remained after the court learned to empty itself.',
  'pk-front': 'The rider waited behind the only order that had arrived.',
  'pb-front': 'The lamp went first. The sermon followed where it could.',
  'ppk-reversed': 'The men arrived to cover a rider already past them.',
  'ppb-reversed': 'The blessing waited behind the office it was meant to guard.',
  'bb-diagonal': 'Two offices agreed on the destination and not the road.',
  'pr-front': 'The gatekeeper put one name between the wall and morning.',
  'kk-horizontal': 'Neither rider yielded the width of the road.',
  'ppk-protected': 'The horse advanced under two borrowed shields.',
  'ppb-protected': 'The parish kept watch while the last lesson was read.',
  'pq-front': 'One attendant remained after the court learned to empty itself.',
  'bb-vertical': 'Matins stood before Vespers because the roof admitted only one.',
  'rr-vertical': 'One keep watched the road. The other watched the first.',
});

/** Generated formations borrow the same temporary composition prose as their art. */
export const RUN_CARD_FLAVOR_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  // Keyed like the banner: a retired formation a Run still holds keeps its authored fragment
  // rather than falling back to 'No account survives.' See nameableRunCards.
  Object.fromEntries(nameableRunCards().map((card) => [
    card.id,
    ALL_RUN_CARD_FLAVOR_BY_ID[card.id]
      ?? ALL_RUN_CARD_FLAVOR_BY_ID[compositionCardId(card.pieces)]
      ?? ALL_RUN_CARD_FLAVOR_BY_ID[card.artId ?? '']
      ?? 'No account survives.',
  ])),
);

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
  // Starter cards own their art identity just as firmly as the core deck. A shared
  // composition never aliases their accepted illustration bytes (ADR-0414).
  const definition = card.id ? runCardDefinition(card.id) : undefined;
  const artId = card.artId ?? definition?.artId ?? canonicalCardId({ pieces: card.pieces });
  return `ui/run/card-art/${artId}/illustration.png`;
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
const RUN_CARD_SLUG_BY_ID: Readonly<Record<string, string>> = Object.freeze((() => {
  const byBase = new Map<string, string[]>();
  // Retired-but-holdable cards address here too, or a card a Run still holds loses its address.
  const addressable = new Map([...RUN_CARD_CATALOG, ...nameableRunCards()].map((card) => [card.id, card]));
  for (const card of addressable.values()) {
    const base = slugify(runCardName(card));
    byBase.set(base, [...(byBase.get(base) ?? []), card.id]);
  }
  return Object.fromEntries([...byBase.entries()].flatMap(([base, ids]) => {
    const primary = ids.find((id) => ALL_RUN_CARD_NAME_BY_ID[id]) ?? ids[0];
    return ids.map((id) => [id, id === primary ? base : `${base}-${id}`]);
  }));
})());

export function runCardSlug(cardId: string): string {
  return RUN_CARD_SLUG_BY_ID[cardId] ?? slugify(cardId);
}

/** Every authored card address, resolved back to the catalog id it names. */
export const RUN_CARD_ID_BY_SLUG: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([
    ...RUN_STARTER_CARDS.map((card) => card.id),
    ...Object.keys(RUN_CARD_NAME_BY_ID),
  ].map((id) => [runCardSlug(id), id])),
);
