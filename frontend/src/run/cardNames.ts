import {
  RUN_STARTER_CARD_BY_ID,
  RUN_STARTER_CARDS,
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

/**
 * One banner name per illustration, in the same historical-medieval register as the lipsanon
 * names. The key is the art id — `<footprint>-<roster>` — which is exactly what ADR-0520 keys an
 * illustration to, so **a name always means one picture**. Naming by roster alone, as this map
 * used to, gave 272 cards only 36 names: a single Sectio row repeated a banner 43.6% of the time,
 * and 20 of those names spanned more than one illustration, which reads as a rendering fault.
 *
 * A roster keeps its title on the shape that reads as its plain form, and the other footprints
 * qualify it, so the family stays legible while the card in hand is named exactly. The shape words
 * are fixed: Close for the square, Broken and Crooked for the two Z chiralities, Bent and Hooked
 * for J and L, Crossroads for the T.
 *
 * Cards still sharing a name share both footprint and roster, differing only in which piece sits
 * in which seat — the distinction the card's own formation diagram draws (ADR-0520).
 */
const RUN_CARD_NAME_BY_ART: Readonly<Record<string, string>> = Object.freeze({
  // One and two seats: each is its own scene already.
  '00-p': 'The Volunteer',
  '00-b': 'Wandering Preacher',
  '00-k': 'Errant Rider',
  '00-r': 'The Watchtower',
  '00-q': 'Regal Serenity',
  '0010-pp': 'Two Good Boots',
  '0001-pb': "Pilgrim's Shelter",
  '0001-pk': "Squire's Shelter",
  '0001-bb': 'Matins and Vespers',
  '0011-bb': 'Crooked Diocese',
  '0001-pr': "Gatekeeper's Charge",
  '0010-kk': 'Thundering Lances',
  '0111-kb': 'Sword and Censer',
  '0111-br': 'Cloister and Keep',
  '0111-kr': "Castellan's Sally",
  '0001-pq': 'The Last Attendant',
  '0001-rr': 'The Twin Keeps',

  // Three seats: a rank, a corner, and the covered triangle.
  '001020-ppp': 'Farmhand Levy',
  '100111-ppp': 'Levy at the Corner',
  '002011-ppb': 'Country Parish',
  '011121-ppb': 'Parish in Line',
  '100111-ppb': 'Parish at the Corner',
  '002011-ppk': 'Outrider Patrol',
  '011121-ppk': 'Patrol in Line',
  '100111-ppk': 'Patrol at the Corner',
  '011121-pbb': 'Synod on the Road',
  '100111-pbb': 'Synod at the Corner',
  '011121-pkb': 'Little Crusade',
  '100111-pkb': 'Crusade at the Corner',
  '011121-pkk': 'Vanguard Escort',
  '100111-pkk': 'Vanguard at the Corner',
  '011121-ppr': 'Border Garrison',
  '100111-ppr': 'Garrison at the Corner',
  '011121-bbb': 'Ecumenical Council',
  '100111-bbb': 'Council at the Corner',
  '011121-kbb': 'Blessed Charger',
  '100111-kbb': 'Blessing at the Corner',
  '011121-kkb': 'Chaplain of the Charge',
  '100111-kkb': 'Chaplain at the Corner',
  '011121-kkk': 'Full Gallop',
  '100111-kkk': 'Gallop at the Corner',
  '011121-pbr': 'Church and Castle',
  '100111-pbr': 'Church at the Corner',
  '011121-pkr': 'Sortie at Dawn',
  '100111-pkr': 'Sortie at the Corner',

  // Four seats: seven footprints per roster, the base title on the straight column.
  '01112131-pppp': 'Ragged Column',
  '00100111-pppp': 'Close Muster',
  '00101121-pppp': 'Broken Muster',
  '10200111-pppp': 'Crooked Muster',
  '00102021-pppp': 'Bent Muster',
  '20011121-pppp': 'Hooked Muster',
  '10011121-pppp': 'Crossroads Muster',

  '01112131-pppb': "Shepherd's Flock",
  '00100111-pppb': 'Close Flock',
  '00101121-pppb': 'Broken Flock',
  '10200111-pppb': 'Crooked Flock',
  '00102021-pppb': 'Bent Flock',
  '20011121-pppb': 'Hooked Flock',
  '10011121-pppb': 'Crossroads Flock',

  '01112131-pppk': "Banneret's Retinue",
  '00100111-pppk': 'Close Retinue',
  '00101121-pppk': 'Broken Retinue',
  '10200111-pppk': 'Crooked Retinue',
  '00102021-pppk': 'Bent Retinue',
  '20011121-pppk': 'Hooked Retinue',
  '10011121-pppk': 'Crossroads Retinue',

  '01112131-ppbb': 'Traveling Chapel',
  '00100111-ppbb': 'Close Chapel',
  '00101121-ppbb': 'Broken Chapel',
  '10200111-ppbb': 'Crooked Chapel',
  '00102021-ppbb': 'Bent Chapel',
  '20011121-ppbb': 'Hooked Chapel',
  '10011121-ppbb': 'Crossroads Chapel',

  '01112131-ppkb': "Wayfarers' Compact",
  '00100111-ppkb': 'Close Compact',
  '00101121-ppkb': 'Broken Compact',
  '10200111-ppkb': 'Crooked Compact',
  '00102021-ppkb': 'Bent Compact',
  '20011121-ppkb': 'Hooked Compact',
  '10011121-ppkb': 'Crossroads Compact',

  '01112131-ppkk': 'Escort of Lances',
  '00100111-ppkk': 'Close Escort',
  '00101121-ppkk': 'Broken Escort',
  '10200111-ppkk': 'Crooked Escort',
  '00102021-ppkk': 'Bent Escort',
  '20011121-ppkk': 'Hooked Escort',
  '10011121-ppkk': 'Crossroads Escort',

  '01112131-pppr': 'Rampart Detail',
  '00100111-pppr': 'Close Rampart',
  '00101121-pppr': 'Broken Rampart',
  '10200111-pppr': 'Crooked Rampart',
  '00102021-pppr': 'Bent Rampart',
  '20011121-pppr': 'Hooked Rampart',
  '10011121-pppr': 'Crossroads Rampart',
});

/**
 * The one place an illustration is not enough to name a card. On the five awkward footprints a
 * Bishop pair's seat colours decide rarity (ADR-0523), so the same picture carries two frames.
 * The opposite-colour pair -- the prize the rarity rule protects -- takes the two-offices title
 * that ADR-0493's Matins and Vespers established; the same-colour pair keeps the family name.
 */
const RUN_CARD_NAME_BY_ART_AND_RARITY: Readonly<Record<string, string>> = Object.freeze({
  '00101121-ppbb|rare': 'Broken Matins and Vespers',
  '10200111-ppbb|rare': 'Crooked Matins and Vespers',
  '00102021-ppbb|rare': 'Bent Matins and Vespers',
  '20011121-ppbb|rare': 'Hooked Matins and Vespers',
  '10011121-ppbb|rare': 'Crossroads Matins and Vespers',
});

/** Every deck card's banner name, resolved once. A card outside the deck (an art-review fixture,
 * say) has no illustration to name and falls back to its prose label. */
export const RUN_CARD_NAME_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(RUN_CARD_DECK.map((card) => [
    card.id,
    RUN_CARD_NAME_BY_ART_AND_RARITY[`${card.artId}|${card.rarity}`]
      ?? RUN_CARD_NAME_BY_ART[card.artId ?? '']
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
  Object.fromEntries(RUN_CARD_DECK.map((card) => [
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
  for (const card of RUN_CARD_CATALOG) {
    const base = slugify(runCardName(card));
    byBase.set(base, [...(byBase.get(base) ?? []), card.id]);
  }
  return Object.fromEntries([...byBase.entries()].flatMap(([base, ids]) => {
    // A named authored card anchors its rotational class (ADR-0515), so it keeps the plain
    // address when it shares a banner with generated siblings.
    const primary = ids.find((id) => !id.startsWith('f-')) ?? ids[0];
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
