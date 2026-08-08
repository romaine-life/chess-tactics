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

// Every card in the deck carries its OWN banner name -- no card borrows another's. Names are
// authored in the same historical-medieval register as the lipsanon names, and grouped below by
// the art family (footprint + roster) whose illustration the card shares, because that is the
// grouping a reader sees: siblings within a family differ only in which seat each piece holds,
// so their names are written as variations on one scene rather than as unrelated titles.
//
// Keys are exact card ids. Generated ids read `f-<footprint>-<pieces>`, where the footprint is
// the occupied cells in reading order and the pieces are initials in seat order (p/k/b/r/q --
// k is the Knight). The diagrams in comments read left-to-right, front row first: `.P/BP` is a
// Pawn behind, with a Bishop and Pawn ahead of it.
//
// A card outside the deck (e.g. an art-review fixture) falls back to its prose label.
const ALL_RUN_CARD_NAME_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  // --- 1-4 gold: single pieces, pairs, and the seven Pawn quartets ---
  p: 'The Volunteer',
  pp: 'Two Good Boots',
  b: 'Wandering Preacher',
  k: 'Errant Rider',
  ppp: 'Farmhand Levy',
  'f-011011-ppp': 'Three at the Turning',
  'pb-front': "Pilgrim's Shelter",
  'pk-front': "Squire's Shelter",
  'f-00011011-pppp': 'The Fourfold Yoke',
  'f-00101121-pppp': 'Broken Furrow',
  'f-00102021-pppp': 'The Bent Rank',
  'f-01112131-pppp': 'Ragged Column',
  'f-01101121-pppp': 'Four to the Crossroad',
  'f-01101120-pppp': 'The Staggered Sowing',
  'f-01112021-pppp': 'The Trailing Fourth',

  // --- 5 gold ---
  r: 'The Watchtower',
  'ppb-protected': 'Country Parish',
  'ppk-protected': 'Outrider Patrol',
  // two Pawns and a Bishop, in a line of three
  'f-011121-bpp': 'The Roadside Homily',
  'f-011121-pbp': 'Lesson Between Two',
  // two Pawns and a Knight, in a line of three
  'f-011121-kpp': 'The Rider Sets Out',
  'f-011121-pkp': 'Horse Between Hedges',
  // two Pawns and a Bishop, around a corner
  'f-011011-bpp': 'Corner Chapel',
  'f-011011-pbp': "The Curate's Corner",
  'f-011011-ppb': 'Vespers at the Bend',
  // two Pawns and a Knight, around a corner
  'f-011011-kpp': 'The Bend Patrol',
  'f-011011-pkp': 'Rider at the Elbow',
  'f-011011-ppk': 'Last Horse in the Lane',

  // --- 6 gold ---
  'bb-vertical': 'Matins and Vespers',
  'pr-front': "Gatekeeper's Charge",
  'kk-horizontal': 'Thundering Lances',
  'bb-diagonal': 'Crooked Diocese',
  'f-0111-bk': 'Sword and Censer',
  // three Pawns and a Bishop, by footprint
  'f-00011011-bppp': 'Blessing of the Square',
  'f-00101121-bppp': 'The Broken Procession',
  'f-00101121-pbpp': 'Homily on Uneven Ground',
  'f-00102021-bppp': "Shepherd's Flock",
  'f-00102021-pbpp': 'Sermon Mid-Rank',
  'f-00102021-ppbp': 'The Turning Homily',
  'f-00102021-pppb': 'Blessing at the Tail',
  'f-01112131-bppp': 'Preacher at the Head',
  'f-01112131-pbpp': 'Second in the Line',
  'f-01101121-bppp': 'Crossroad Blessing',
  'f-01101121-pbpp': 'The Raised Pulpit',
  'f-01101121-ppbp': 'Chapel at the Junction',
  'f-01101121-pppb': 'The Far Verge',
  'f-01101120-bppp': 'Zigzag Parish',
  'f-01101120-pbpp': 'Stepped Procession',
  'f-01112021-bppp': 'Preacher at the Flank',
  'f-01112021-pbpp': 'The Middle Office',
  'f-01112021-ppbp': 'Blessing from Above',
  'f-01112021-pppb': 'The Corner Curate',
  // three Pawns and a Knight, by footprint
  'f-00011011-kppp': 'Rider in the Square',
  'f-00101121-kppp': 'Split Column, One Horse',
  'f-00101121-pkpp': 'The Uneven Escort',
  'f-00102021-kppp': "Banneret's Retinue",
  'f-00102021-pkpp': 'Horse Amid Foot',
  'f-00102021-ppkp': 'The Turning Lance',
  'f-00102021-pppk': 'Rearguard Rider',
  'f-01112131-kppp': 'Lance Before Four',
  'f-01112131-pkpp': 'The Horse in the Rank',
  'f-01101121-kppp': 'Crossroad Watch',
  'f-01101121-pkpp': 'The Forward Scout',
  'f-01101121-ppkp': 'Horse at the Junction',
  'f-01101121-pppk': 'The Far Picket',
  'f-01101120-kppp': 'The Stepped Patrol',
  'f-01101120-pkpp': 'Rider on the Offset',
  'f-01112021-kppp': 'Flanking Lance',
  'f-01112021-pkpp': 'Horse in the Middle',
  'f-01112021-ppkp': 'The Overlooking Rider',
  'f-01112021-pppk': 'Corner Outrider',

  // --- 7 gold: three-piece formations in a line, and around a corner ---
  'f-011121-bbp': 'Two Offices Abreast',
  'f-011121-bpb': 'Synod on the Road',
  'f-011121-bkp': 'Little Crusade',
  'f-011121-bpk': 'Censer, Then Sword',
  'f-011121-kbp': 'Escort Before the Office',
  'f-011121-kkp': 'Vanguard Escort',
  'f-011121-kpk': 'Two Horses, One Boy',
  'f-011121-prp': 'Border Garrison',
  'f-011121-rpp': 'Tower at the Head',
  'f-011011-bbp': 'Two Offices at the Bend',
  'f-011011-bpb': 'Chapter in the Corner',
  'f-011011-pbb': 'The Cornered Diocese',
  'f-011011-bkp': 'Corner Crusade',
  'f-011011-bpk': 'Censer at the Turn',
  'f-011011-kbp': 'Rider Above the Office',
  'f-011011-kpb': 'The Guarded Homily',
  'f-011011-pbk': 'Office and Outrider',
  'f-011011-pkb': 'Lance Over Lectern',
  'f-011011-kkp': 'Two Lances at the Bend',
  'f-011011-kpk': 'The Cornered Pair',
  'f-011011-pkk': 'Riders on Two Sides',
  'f-011011-ppr': 'The Corner Tower',
  'f-011011-prp': 'Tower Above the Lane',
  'f-011011-rpp': 'Keep at the Turning',

  // --- 8 gold, square footprint (PP/PP) ---
  'f-00011011-bbpp': 'Traveling Chapel',
  'f-00011011-bppb': 'Chapel Corner to Corner',
  'f-00011011-bkpp': "Wayfarers' Compact",
  'f-00011011-bpkp': 'Office Above, Horse Beside',
  'f-00011011-bppk': 'Compact of the Square',
  'f-00011011-kkpp': 'Escort of Lances',
  'f-00011011-kppk': 'Lances at Opposite Corners',
  'f-00011011-rppp': 'Rampart Detail',

  // --- 8 gold, stepped footprint (XX./.XX) ---
  'f-00101121-bbpp': 'Two Offices, One Step',
  'f-00101121-bpbp': 'The Divided Chapter',
  'f-00101121-bppb': 'Chapel Across the Gap',
  'f-00101121-pbbp': 'Offices at the Seam',
  'f-00101121-bkpp': 'Censer and Lance Abreast',
  'f-00101121-bpkp': 'Compact Across the Step',
  'f-00101121-bppk': 'Preacher Ahead, Rider Behind',
  'f-00101121-kbpp': 'Lance Before the Office',
  'f-00101121-kpbp': 'Rider Ahead of the Homily',
  'f-00101121-pbkp': 'The Stepped Compact',
  'f-00101121-kkpp': 'Two Lances, One Step',
  'f-00101121-kpkp': 'Riders on Either Rank',
  'f-00101121-kppk': 'Lances at the Seam',
  'f-00101121-pkkp': 'The Offset Escort',
  'f-00101121-prpp': 'Tower on the Step',
  'f-00101121-rppp': 'The Offset Rampart',

  // --- 8 gold, hooked footprint (XXX/..X) ---
  'f-00102021-bbpp': 'Chapter at the Hook',
  'f-00102021-bpbp': 'Two Offices, One Rank',
  'f-00102021-bppb': 'Preacher Fore and Aft',
  'f-00102021-pbbp': 'The Middle Chapter',
  'f-00102021-pbpb': 'Office Ahead of the Turn',
  'f-00102021-ppbb': 'Two Offices at the Turn',
  'f-00102021-bkpp': 'Censer, Lance, and Two Boys',
  'f-00102021-bpkp': 'The Preacher Sets the Pace',
  'f-00102021-bppk': 'The Rider Brings Up the Rear',
  'f-00102021-kbpp': 'Lance and Lectern Abreast',
  'f-00102021-kpbp': 'The Homily at Third Place',
  'f-00102021-kppb': 'Blessing from the Back of the Line',
  'f-00102021-pbkp': 'The Office in the Middle of It',
  'f-00102021-pbpk': 'A Sermon and a Straggler',
  'f-00102021-pkbp': 'The Boy, the Horse, the Book',
  'f-00102021-pkpb': 'Lance Amid, Blessing Behind',
  'f-00102021-ppbk': 'The Office at the Elbow',
  'f-00102021-ppkb': 'The Lance at the Elbow',
  'f-00102021-kkpp': 'Two Lances at the Hook',
  'f-00102021-kpkp': 'Riders Split by Foot',
  'f-00102021-kppk': 'Lances Fore and Aft',
  'f-00102021-pkkp': 'The Middle Lances',
  'f-00102021-pkpk': 'Rider Amid, Rider After',
  'f-00102021-ppkk': 'Two Lances at the Turn',
  'f-00102021-pppr': 'The Tower Behind',
  'f-00102021-pprp': 'Tower at the Elbow',
  'f-00102021-prpp': 'Keep Amid the Rank',
  'f-00102021-rppp': 'Tower Leads the Hook',

  // --- 8 gold, two-piece pairs ---
  'f-0111-rb': 'Cloister and Keep',
  'f-0111-rk': "Castellan's Sally",

  // --- 8 gold, line of four (..../XXXX) ---
  'f-01112131-bbpp': 'Two Offices in Front',
  'f-01112131-bpbp': 'Alternating Office',
  'f-01112131-bppb': 'Offices at Both Ends',
  'f-01112131-pbbp': 'Chapter in the Middle',
  'f-01112131-bkpp': 'Censer and Lance Lead',
  'f-01112131-bpkp': 'Preacher First, Rider Third',
  'f-01112131-bppk': 'Blessing First, Lance Last',
  'f-01112131-kbpp': 'Lance First, Office Second',
  'f-01112131-kpbp': 'Rider First, Homily Third',
  'f-01112131-pbkp': 'The Compact in the Line',
  'f-01112131-kkpp': 'Two Lances in Front',
  'f-01112131-kpkp': 'Alternating Lances',
  'f-01112131-kppk': 'Lances at Both Ends',
  'f-01112131-pkkp': 'Lances in the Middle',
  'f-01112131-prpp': 'Tower Second in Line',
  'f-01112131-rppp': 'Tower Heads the Line',

  // --- 8 gold, tee footprint (.X./XXX) ---
  'f-01101121-bbpp': 'Chapter at the Crossroad',
  'f-01101121-bpbp': 'Two Offices Below',
  'f-01101121-bppb': 'Offices Flanking the Road',
  'f-01101121-pbbp': 'The Raised and the Middle',
  'f-01101121-pbpb': 'Office Above, Office After',
  'f-01101121-ppbb': 'Two Offices at the Far Verge',
  'f-01101121-bkpp': 'The Rider Takes the Rise',
  'f-01101121-bpkp': 'Preacher and Lance Below',
  'f-01101121-bppk': 'Preacher Left, Rider Right',
  'f-01101121-kbpp': 'The Office Takes the Rise',
  'f-01101121-kpbp': 'Lance Left, Office Between',
  'f-01101121-kppb': 'Lance Left, Blessing Right',
  'f-01101121-pbkp': 'A Homily Over the Junction',
  'f-01101121-pbpk': 'Office on the Rise, Lance at the End',
  'f-01101121-pkbp': 'A Horse Over the Junction',
  'f-01101121-pkpb': 'Rider on the Rise, Office at the End',
  'f-01101121-ppbk': 'The Office Between, the Lance Beyond',
  'f-01101121-ppkb': 'The Lance Between, the Office Beyond',
  'f-01101121-kkpp': 'Two Lances at the Crossroad',
  'f-01101121-kpkp': 'Lances Hold the Left',
  'f-01101121-kppk': 'Lances Flanking the Road',
  'f-01101121-pkkp': 'The Raised and the Middle Lance',
  'f-01101121-pkpk': 'Lance Above, Lance After',
  'f-01101121-ppkk': 'Two Lances at the Far Verge',
  'f-01101121-pppr': 'Tower at the Far Verge',
  'f-01101121-pprp': 'Tower Below the Junction',
  'f-01101121-prpp': 'Tower Above the Crossroad',
  'f-01101121-rppp': 'Tower Holds the Left',

  // --- 8 gold, zigzag footprint (.XX/XX.) ---
  'f-01101120-bbpp': 'Chapter on the Offset',
  'f-01101120-bpbp': 'Two Offices Below the Step',
  'f-01101120-bppb': 'Offices Across the Zigzag',
  'f-01101120-pbbp': 'The Staggered Chapter',
  'f-01101120-bkpp': 'Lance Above the Stepped Office',
  'f-01101120-bpkp': 'Office and Lance on the Step',
  'f-01101120-bppk': 'Preacher Below, Rider Above',
  'f-01101120-kbpp': 'Office Above the Stepped Lance',
  'f-01101120-kpbp': 'Lance and Office on the Step',
  'f-01101120-pbkp': 'The Zigzag Compact',
  'f-01101120-kkpp': 'Lances on the Offset',
  'f-01101120-kpkp': 'Two Lances Below the Step',
  'f-01101120-kppk': 'Lances Across the Zigzag',
  'f-01101120-pkkp': 'The Staggered Lances',
  'f-01101120-prpp': 'Tower on the Offset',
  'f-01101120-rppp': 'Tower Below the Step',

  // --- 8 gold, flagged footprint (..X/XXX) ---
  'f-01112021-bbpp': 'Two Offices Under the Flank',
  'f-01112021-bpbp': 'Office Above, Office Leading',
  'f-01112021-bppb': "Offices at the Line's Ends",
  'f-01112021-pbbp': 'Office Above, Office Amid',
  'f-01112021-pbpb': 'The Trailing Chapter',
  'f-01112021-ppbb': 'Office Above, Office Behind',
  'f-01112021-bkpp': 'Censer and Lance Beneath the Watch',
  'f-01112021-bpkp': 'The Rider Keeps the High Ground',
  'f-01112021-bppk': 'Preacher First, Lance Last',
  'f-01112021-kbpp': 'Lance and Lectern Beneath the Watch',
  'f-01112021-kpbp': 'The Office Keeps the High Ground',
  'f-01112021-kppb': 'Lance First, Blessing Last',
  'f-01112021-pbkp': 'A Horse Above the Homily',
  'f-01112021-pbpk': 'Sermon Amid, Lance at the End',
  'f-01112021-pkbp': 'An Office Above the Lance',
  'f-01112021-pkpb': 'Lance Amid, Blessing at the End',
  'f-01112021-ppbk': 'The Office Above, the Lance Behind',
  'f-01112021-ppkb': 'The Lance Above, the Office Behind',
  'f-01112021-kkpp': 'Two Lances Under the Flank',
  'f-01112021-kpkp': 'Lance Above, Lance Leading',
  'f-01112021-kppk': "Lances at the Line's Ends",
  'f-01112021-pkkp': 'Lance Above, Lance Amid',
  'f-01112021-pkpk': 'The Trailing Lances',
  'f-01112021-ppkk': 'Lance Above, Lance Behind',
  'f-01112021-pppr': "Tower at the Line's End",
  'f-01112021-pprp': 'Tower on the Flank',
  'f-01112021-prpp': 'Tower Amid the Rank',
  'f-01112021-rppp': 'Tower Leads the Rank',

  // --- 9 gold ---
  q: 'Regal Serenity',
  'f-011121-bbb': 'Ecumenical Council',
  'f-011121-bbk': 'Blessed Charger',
  'f-011121-bkb': 'Horse Between Two Offices',
  'f-011121-bkk': 'Chaplain of the Charge',
  'f-011121-kbk': 'Chaplain Between Lances',
  'f-011121-kkk': 'Full Gallop',
  'f-011121-brp': 'Church and Castle',
  'f-011121-rbp': 'Keep Before the Cloister',
  'f-011121-rpb': 'Tower First, Office Last',
  'f-011121-krp': 'Sortie at Dawn',
  'f-011121-rkp': 'Keep Before the Lance',
  'f-011121-rpk': 'Tower First, Lance Last',
  'f-011011-bbb': 'Council in the Corner',
  'f-011011-bbk': 'Charger at the Bend',
  'f-011011-bkb': 'Rider Above the Chapter',
  'f-011011-kbb': 'Two Offices, One Charger',
  'f-011011-bkk': 'Chaplain at the Bend',
  'f-011011-kbk': 'Office Above Two Lances',
  'f-011011-kkb': 'Two Lances, One Chaplain',
  'f-011011-kkk': 'Gallop at the Turning',
  'f-011011-bpr': 'Cloister Beside the Keep',
  'f-011011-brp': 'Keep Above the Cloister',
  'f-011011-pbr': 'Office Above, Keep Beside',
  'f-011011-prb': 'Keep Above, Office Beside',
  'f-011011-rbp': 'Office Above the Rampart',
  'f-011011-rpb': 'Rampart at the Bend',
  'f-011011-kpr': 'Lance Beside the Keep',
  'f-011011-krp': 'Keep Above the Lance',
  'f-011011-pkr': 'Lance Above, Keep Beside',
  'f-011011-prk': 'Keep Above, Lance Beside',
  'f-011011-rkp': 'Lance Above the Rampart',
  'f-011011-rpk': 'Sally from the Bend',

  // --- 10 gold ---
  'pq-front': 'The Last Attendant',
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

/** One authored banner name per card; no two cards in the deck share a title. */
export const RUN_CARD_NAME_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(nameableRunCards().map((card) => [
    card.id,
    ALL_RUN_CARD_NAME_BY_ID[card.id] ?? cardContentsLabel(card),
  ])),
);

// Original anti-story fragments tied to the same four historical pressure sources as
// the core names and illustrations -- a summer that froze, institutions emptied by plague,
// a levy that outlasted its cause, and a church turned out onto the road. Each card carries
// its own, keyed and ordered exactly as ALL_RUN_CARD_NAME_BY_ID above. They identify a card
// without explaining why this history has surfaced in the game.
const ALL_RUN_CARD_FLAVOR_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  // --- 1-4 gold ---
  p: 'The frost came in June. By August, the road had found him.',
  pp: 'The road kept both pairs of boots, and returned neither name.',
  b: 'The sanctuary was gone. The lesson continued beside the road.',
  k: 'Every road was marked urgent. None said where it led.',
  ppp: 'They covered the seedlings at noon and took up poles by dusk.',
  'f-011011-ppp': 'The road bent. Three of them bent with it, and did not straighten.',
  'pb-front': 'The lamp went first. The sermon followed where it could.',
  'pk-front': 'The rider waited behind the only order that had arrived.',
  'f-00011011-pppp': 'Four to a yoke meant for oxen. The oxen had been eaten in spring.',
  'f-00101121-pppp': 'The furrow broke where the field changed hands. They kept sowing across the seam.',
  'f-00102021-pppp': 'The rank held until the wall did not. After that it merely bent.',
  'f-01112131-pppp': 'When the gate ceased to matter, the road filled with households.',
  'f-01101121-pppp': 'Four roads and four men. No agreement on which was theirs.',
  'f-01101120-pppp': 'They sowed a week apart because the seed arrived a week apart.',
  'f-01112021-pppp': 'Three kept the pace. The fourth kept the count.',

  // --- 5 gold ---
  r: 'From the tower, every road led away.',
  'ppb-protected': 'The parish kept watch while the last lesson was read.',
  'ppk-protected': 'The horse advanced under two borrowed shields.',
  'f-011121-bpp': 'He preached at the ditch. The congregation had been walking since Lent.',
  'f-011121-pbp': 'The lesson stood between them because the church would not stand at all.',
  'f-011121-kpp': 'He left first and learned nothing the others did not learn by noon.',
  'f-011121-pkp': 'The hedges narrowed. The horse went where the men could not.',
  'f-011011-bpp': 'They built the corner first. The rest of the chapel never came.',
  'f-011011-pbp': 'The curate took the inside of the bend, where the wind was smaller.',
  'f-011011-ppb': 'Vespers was said at the turning. Nobody agreed on the hour.',
  'f-011011-kpp': 'They patrolled the bend because the straight road no longer mattered.',
  'f-011011-pkp': 'The horse held the elbow of the road, and the road held nothing else.',
  'f-011011-ppk': 'One horse remained in the lane. The lane remembered more.',

  // --- 6 gold ---
  'bb-vertical': 'Matins stood before Vespers because the roof admitted only one.',
  'pr-front': 'The gatekeeper put one name between the wall and morning.',
  'kk-horizontal': 'Neither rider yielded the width of the road.',
  'bb-diagonal': 'Two offices agreed on the destination and not the road.',
  'f-0111-bk': 'The blade guarded the road; the censer remembered the room.',
  'f-00011011-bppp': 'He blessed all four corners. Three had already been abandoned.',
  'f-00101121-bppp': 'The procession broke at the ford and re-formed shorter.',
  'f-00101121-pbpp': 'The ground was uneven. So was the attendance.',
  'f-00102021-bppp': 'The flock found grass beneath snow that had fallen in June.',
  'f-00102021-pbpp': 'He preached from the middle so both ends could pretend to hear.',
  'f-00102021-ppbp': 'The homily turned with the road and lost half its listeners.',
  'f-00102021-pppb': 'The blessing came last, to whoever was still there for it.',
  'f-01112131-bppp': 'He walked in front because nobody else would say where they were going.',
  'f-01112131-pbpp': 'Second place in the line, first in the account of who was owed.',
  'f-01101121-bppp': 'He blessed all three roads. Two were already impassable.',
  'f-01101121-pbpp': 'They set him above the road so the sermon would carry. It carried.',
  'f-01101121-ppbp': 'The chapel stood where the roads met, and outlived both.',
  'f-01101121-pppb': 'He stood on the far verge, where the parish stopped being anyone’s.',
  'f-01101120-bppp': 'The parish followed the road, and the road refused to be straight.',
  'f-01101120-pbpp': 'Each step down was a house that had emptied since the last.',
  'f-01112021-bppp': 'He kept the flank because the middle had a captain in it.',
  'f-01112021-pbpp': 'The office was read from the middle, where it could reach both ends.',
  'f-01112021-ppbp': 'He blessed them from the higher ground, which was all the elevation left.',
  'f-01112021-pppb': 'The curate took the corner. The corner took the wind.',
  'f-00011011-kppp': 'The seal was unbroken. The stable boy had already understood.',
  'f-00101121-kppp': 'The column split at the ford and only the horse crossed twice.',
  'f-00101121-pkpp': 'The escort was uneven because the road was, and nobody corrected either.',
  'f-00102021-kppp': 'The banner arrived clean. Nothing else did.',
  'f-00102021-pkpp': 'They put the horse among the foot, where it could be watched.',
  'f-00102021-ppkp': 'The lance turned with the road and the road turned again.',
  'f-00102021-pppk': 'The rearguard counted them at every halt and got a smaller number.',
  'f-01112131-kppp': 'One lance ahead of four men who had never seen one used.',
  'f-01112131-pkpp': 'The horse kept the rank. The rank kept nothing else.',
  'f-01101121-kppp': 'Three roads to watch and one rider to watch them.',
  'f-01101121-pkpp': 'He went ahead to see. What he saw did not need reporting.',
  'f-01101121-ppkp': 'The horse held the junction until the junction stopped mattering.',
  'f-01101121-pppk': 'The far picket heard the column arrive an hour before it did.',
  'f-01101120-kppp': 'They took the offset road. The straight one was watched.',
  'f-01101120-pkpp': 'He rode a road that agreed with no map drawn before the frost.',
  'f-01112021-kppp': 'The lance held the flank of a column with nothing to flank.',
  'f-01112021-pkpp': 'They put the horse in the middle, where both halves could see it.',
  'f-01112021-ppkp': 'From the rise he counted them twice and got two answers.',
  'f-01112021-pppk': 'The outrider held the corner, and the corner held the road shut.',

  // --- 7 gold ---
  'f-011121-bbp': 'Two offices walked abreast because neither would follow.',
  'f-011121-bpb': 'The council adjourned to the road and never reconvened indoors.',
  'f-011121-bkp': 'No city received them. They continued as though one might.',
  'f-011121-bpk': 'The censer went first by custom. The sword went second by arrangement.',
  'f-011121-kbp': 'The escort led. The office had stopped insisting on precedence.',
  'f-011121-kkp': 'The escort knew the route by the carts returning empty.',
  'f-011121-kpk': 'Two horses, one boy, and no account of the third rider.',
  'f-011121-prp': 'The garrison watched a border drawn by those already gone.',
  'f-011121-rpp': 'The tower led, which is to say the tower was carried.',
  'f-011011-bbp': 'Both offices took the bend. Neither conceded the inside.',
  'f-011011-bpb': 'The chapter met in a corner because the hall had been requisitioned.',
  'f-011011-pbb': 'The diocese fit in a corner by then, and still argued about the seating.',
  'f-011011-bkp': 'They set out from a corner and never rounded the second one.',
  'f-011011-bpk': 'The censer swung at the turning and the smoke went the other way.',
  'f-011011-kbp': 'The rider took the high side. The office was told it was for safety.',
  'f-011011-kpb': 'The homily was guarded. Nobody could say from what.',
  'f-011011-pbk': 'The office kept the record; the outrider kept the pace.',
  'f-011011-pkb': 'The lance stood over the lectern, and the reading continued.',
  'f-011011-kkp': 'Two lances at the bend, and the bend still went where it went.',
  'f-011011-kpk': 'Cornered by the road, not by anyone following.',
  'f-011011-pkk': 'A rider on each side of the turning, and one boy between them.',
  'f-011011-ppr': 'The corner tower saw two roads and reported neither.',
  'f-011011-prp': 'The tower stood above the lane after the lane stopped being used.',
  'f-011011-rpp': 'The keep held the turning. The turning was all it held.',

  // --- 8 gold, square footprint ---
  'f-00011011-bbpp': 'The chapel traveled because the wounded could not.',
  'f-00011011-bppb': 'Two offices, opposite corners, and the same short liturgy between them.',
  'f-00011011-bkpp': 'They agreed upon the road, having nowhere left to meet.',
  'f-00011011-bpkp': 'The office kept the height; the horse kept the exit.',
  'f-00011011-bppk': 'Four corners, one agreement, and nothing to enforce it.',
  'f-00011011-kkpp': 'Four riders escorted linen farther than any standard.',
  'f-00011011-kppk': 'Two lances at opposite corners, watching the same empty middle.',
  'f-00011011-rppp': 'They repaired the wall with stones from the abandoned quarter.',

  // --- 8 gold, stepped footprint ---
  'f-00101121-bbpp': 'Both offices took the higher step. The lower one flooded in March.',
  'f-00101121-bpbp': 'The chapter divided at the seam and read the same office twice.',
  'f-00101121-bppb': 'The chapel spanned the gap because the gap was where the people were.',
  'f-00101121-pbbp': 'Two offices met at the seam and disputed which side was the parish.',
  'f-00101121-bkpp': 'They walked abreast on the high step, in the order the road allowed.',
  'f-00101121-bpkp': 'The agreement crossed the step. Nothing else did.',
  'f-00101121-bppk': 'The preacher set the pace and the rider corrected it.',
  'f-00101121-kbpp': 'The lance went first, and the office recorded that it had.',
  'f-00101121-kpbp': 'He rode ahead of the homily and arrived before it was needed.',
  'f-00101121-pbkp': 'They agreed on uneven ground, which suited the agreement.',
  'f-00101121-kkpp': 'Two lances on the same step, and no room to turn either.',
  'f-00101121-kpkp': 'A rider to each rank, so both could be told the same thing.',
  'f-00101121-kppk': 'The lances held the seam where two fields had stopped being two.',
  'f-00101121-pkkp': 'The escort walked offset, out of the ruts the carts had left.',
  'f-00101121-prpp': 'The tower took the high step and watched the low one empty.',
  'f-00101121-rppp': 'The rampart did not meet the wall. It was built after the wall stopped mattering.',

  // --- 8 gold, hooked footprint ---
  'f-00102021-bbpp': 'The chapter met at the bend, standing, because the meeting was short.',
  'f-00102021-bpbp': 'Two offices in one rank, and one voice between them by evening.',
  'f-00102021-bppb': 'One preacher at each end, in case the column parted.',
  'f-00102021-pbbp': 'The chapter sat in the middle and heard both ends complain.',
  'f-00102021-pbpb': 'The office rounded the turn first and waited on the far side.',
  'f-00102021-ppbb': 'Both offices reached the turn. Neither continued past it.',
  'f-00102021-bkpp': 'A censer, a lance, and two boys who had not been asked.',
  'f-00102021-bpkp': 'He set a pace the horses could keep and the boys could not.',
  'f-00102021-bppk': 'The rider took the rear, where the counting was done.',
  'f-00102021-kbpp': 'Lance and lectern shared the front rank and disputed nothing aloud.',
  'f-00102021-kpbp': 'Third in the rank, and still the only one talking.',
  'f-00102021-kppb': 'The blessing came from behind, which is where it usually came from.',
  'f-00102021-pbkp': 'The office was in the middle of it, and recorded the middle only.',
  'f-00102021-pbpk': 'The sermon went ahead. The straggler arrived for the end of it.',
  'f-00102021-pkbp': 'A boy, a horse, and a book. Two of them were returned.',
  'f-00102021-pkpb': 'The lance held the middle and the blessing held the back.',
  'f-00102021-ppbk': 'The office stood at the elbow of the road and let the rest pass.',
  'f-00102021-ppkb': 'The lance held the elbow, where the road could be closed by one.',
  'f-00102021-kkpp': 'Two lances at the bend, and the bend was the whole position.',
  'f-00102021-kpkp': 'A man on foot between two riders, and no explanation offered.',
  'f-00102021-kppk': 'A lance at each end, in case the middle was the part that went.',
  'f-00102021-pkkp': 'Both horses in the middle, where the road was still a road.',
  'f-00102021-pkpk': 'One rider in the rank, one behind it, and one horse unaccounted.',
  'f-00102021-ppkk': 'They took the turn together and arrived as two separate reports.',
  'f-00102021-pppr': 'The tower came last, which is what towers do when they move at all.',
  'f-00102021-pprp': 'They set the tower at the elbow. The elbow held longer than the wall.',
  'f-00102021-prpp': 'The keep stood in the rank, and the rank formed around it.',
  'f-00102021-rppp': 'The tower led the bend, which is to say the bend was fortified first.',

  // --- 8 gold, two-piece pairs ---
  'f-0111-rb': 'The cloister was sold. The keep remained employed.',
  'f-0111-rk': 'At dawn the castellan rode through an abbey with no brothers.',

  // --- 8 gold, line of four ---
  'f-01112131-bbpp': 'Two offices in front and two boys behind, in that order, for a week.',
  'f-01112131-bpbp': 'Office, boy, office, boy — the line as the road had assembled it.',
  'f-01112131-bppb': 'An office at each end of the line, and the middle left to itself.',
  'f-01112131-pbbp': 'The chapter walked in the middle, where it could be heard both ways.',
  'f-01112131-bkpp': 'Censer and lance at the head, and nothing decided between them.',
  'f-01112131-bpkp': 'The preacher led; the rider held third and watched the second.',
  'f-01112131-bppk': 'The blessing opened the line and the lance closed it.',
  'f-01112131-kbpp': 'The lance went first. The office followed and made no note of it.',
  'f-01112131-kpbp': 'He rode at the head and the homily reached him at halts only.',
  'f-01112131-pbkp': 'They kept the agreement in marching order, which is how it survived.',
  'f-01112131-kkpp': 'Two lances led, and the two behind carried what the lances did not.',
  'f-01112131-kpkp': 'Horse, foot, horse, foot — the road had sorted them itself.',
  'f-01112131-kppk': 'A lance at each end of a line that needed neither.',
  'f-01112131-pkkp': 'Both horses in the middle, where the ruts were shallowest.',
  'f-01112131-prpp': 'The tower held second place, and the first place moved when it moved.',
  'f-01112131-rppp': 'The tower led the line down a road it had been built to watch.',

  // --- 8 gold, tee footprint ---
  'f-01101121-bbpp': 'The chapter convened at the crossroad. It adjourned in three directions.',
  'f-01101121-bpbp': 'Both offices kept the low road. The high one had a watch on it.',
  'f-01101121-bppb': 'An office at each verge, and the road between them going on regardless.',
  'f-01101121-pbbp': 'One above the junction, one in the middle of it, and no agreement.',
  'f-01101121-pbpb': 'One office took the rise, the other the far end, and the road took the rest.',
  'f-01101121-ppbb': 'They stopped at the far verge, which was as far as the parish went.',
  'f-01101121-bkpp': 'He took the rise to see the road. The road did not improve for being seen.',
  'f-01101121-bpkp': 'Preacher and lance held the low road and left the rise to nobody.',
  'f-01101121-bppk': 'The preacher took the left fork and the rider took the right.',
  'f-01101121-kbpp': 'The office climbed to be seen. It was seen and not attended.',
  'f-01101121-kpbp': 'The lance held the left; the office stood between and recorded both.',
  'f-01101121-kppb': 'Lance on one road, blessing on the other, and no traffic on either.',
  'f-01101121-pbkp': 'He preached above the junction, to whichever road was listening.',
  'f-01101121-pbpk': 'The office watched from the rise while the lance held the far end.',
  'f-01101121-pkbp': 'The horse held the rise above three roads and could close none of them.',
  'f-01101121-pkpb': 'The rider had the height and the office had the distance.',
  'f-01101121-ppbk': 'The office stood between them, and the lance stood past all of it.',
  'f-01101121-ppkb': 'The lance kept the middle; the office kept going.',
  'f-01101121-kkpp': 'Two horses at the crossroad, and three roads to fail to cover.',
  'f-01101121-kpkp': 'Both lances took the left road, on an order nobody could produce.',
  'f-01101121-kppk': 'A lance at each verge, and the road walked between them unescorted.',
  'f-01101121-pkkp': 'One horse on the rise, one in the road, and one report between them.',
  'f-01101121-pkpk': 'One above the junction, one past it, and the junction empty.',
  'f-01101121-ppkk': 'They held the far verge, where the parish ended and the road did not.',
  'f-01101121-pppr': 'The tower stood at the verge and watched a road that had stopped arriving.',
  'f-01101121-pprp': 'The tower sat below the junction and saw only what came down.',
  'f-01101121-prpp': 'From above the crossroad it watched three roads empty at three different rates.',
  'f-01101121-rppp': 'The tower held the left road because the left road held the mill.',

  // --- 8 gold, zigzag footprint ---
  'f-01101120-bbpp': 'The chapter met on the offset road, which no map had corrected.',
  'f-01101120-bpbp': 'Both offices took the lower road. The upper had been requisitioned.',
  'f-01101120-bppb': 'An office on each leg of the bend, and the bend between them.',
  'f-01101120-pbbp': 'They arrived a day apart and called it a chapter anyway.',
  'f-01101120-bkpp': 'The lance took the upper leg; the office took what was left.',
  'f-01101120-bpkp': 'They shared the step and disagreed about which direction it faced.',
  'f-01101120-bppk': 'The preacher kept the low road and the rider kept the high one.',
  'f-01101120-kbpp': 'The office had the height and the lance had the ground.',
  'f-01101120-kpbp': 'Lance and office on the same step, and the step too narrow for both.',
  'f-01101120-pbkp': 'The agreement bent twice before it reached anyone who could keep it.',
  'f-01101120-kkpp': 'Both horses took the offset road and found it as empty as the straight one.',
  'f-01101120-kpkp': 'Two lances on the low leg, watching a high leg nobody used.',
  'f-01101120-kppk': 'A lance on each leg of the bend, and the bend uncrossed.',
  'f-01101120-pkkp': 'The horses came a day apart and the report came as one.',
  'f-01101120-prpp': 'They fortified the offset road. The straight one had already been given up.',
  'f-01101120-rppp': 'The tower sat under the step and saw only the last of what passed.',

  // --- 8 gold, flagged footprint ---
  'f-01112021-bbpp': 'Both offices kept the low road, under a flank they did not hold.',
  'f-01112021-bpbp': 'One office on the height, one at the head, and one road between them.',
  'f-01112021-bppb': 'An office at each end of the line, and the line shorter every week.',
  'f-01112021-pbbp': 'One watched from the flank; the other walked in the middle of it.',
  'f-01112021-pbpb': 'The chapter trailed the column and arrived after the decisions.',
  'f-01112021-ppbb': 'One office above the road and one behind it, and the road between them empty.',
  'f-01112021-bkpp': 'Censer and lance kept the low road while the flank watched nothing.',
  'f-01112021-bpkp': 'He kept the high ground and reported that there was nothing on it.',
  'f-01112021-bppk': 'The preacher opened the road and the lance closed it behind them.',
  'f-01112021-kbpp': 'Lance and lectern on the low road, under a watch posted for a siege.',
  'f-01112021-kpbp': 'The office took the height, and the height gave it nothing to say.',
  'f-01112021-kppb': 'The lance went first. The blessing came last, to whoever was left for it.',
  'f-01112021-pbkp': 'The horse held the flank while the homily continued below it.',
  'f-01112021-pbpk': 'The sermon walked in the middle and the lance walked at the end.',
  'f-01112021-pkbp': 'The office watched from the flank and the lance walked where it was told.',
  'f-01112021-pkpb': 'The lance kept the middle; the blessing waited at the end of the line.',
  'f-01112021-ppbk': 'The office held the flank and the lance held the rear, and neither held the road.',
  'f-01112021-ppkb': 'The lance took the flank; the office took the rear and the record.',
  'f-01112021-kkpp': 'Both horses on the low road, under a flank held by nobody.',
  'f-01112021-kpkp': 'One on the height, one at the head, and the same road for both.',
  'f-01112021-kppk': 'A lance at each end and four men who did not know either.',
  'f-01112021-pkkp': 'One horse on the flank, one in the rank, and one road that needed neither.',
  'f-01112021-pkpk': 'The horses trailed the column, because the column had the carts.',
  'f-01112021-ppkk': 'One held the height and one held the rear, and the middle went unwatched.',
  'f-01112021-pppr': 'The tower closed the line, which is the only place a tower can march.',
  'f-01112021-pprp': 'They set the tower on the flank and the flank became the position.',
  'f-01112021-prpp': 'The tower stood in the rank and the rank re-formed around it.',
  'f-01112021-rppp': 'The tower led, and three men followed a wall down a road.',

  // --- 9 gold ---
  q: 'She watched the empty court until ceremony became weather.',
  'f-011121-bbb': 'Three doctrines agreed that the room could no longer hold them.',
  'f-011121-bbk': 'The charger knelt where the altar had been carted away.',
  'f-011121-bkb': 'The horse stood between two offices and was claimed by both.',
  'f-011121-bkk': 'He blessed the departing riders and counted the returning horses.',
  'f-011121-kbk': 'The chaplain rode between them and blessed whichever turned first.',
  'f-011121-kkk': 'They rode hard beneath snow no calendar had permitted.',
  'f-011121-brp': 'The church became stone. The castle called it repair.',
  'f-011121-rbp': 'The keep went first. The cloister had learned to follow.',
  'f-011121-rpb': 'The tower led and the office came last, in the order of what was defended.',
  'f-011121-krp': 'They opened the gate before dawn. The road was already awake.',
  'f-011121-rkp': 'The keep opened the road and the horse used it.',
  'f-011121-rpk': 'Stone at the head and horse at the tail, and one boy between.',
  'f-011011-bbb': 'Three doctrines in one corner, and the corner not large enough for one.',
  'f-011011-bbk': 'The charger took the bend and the two offices arrived by the inside.',
  'f-011011-bkb': 'The rider held the high side while the chapter argued the low one.',
  'f-011011-kbb': 'Two offices, one horse, and a road that would take only one of them.',
  'f-011011-bkk': 'He blessed them at the turning, which was as far as he was going.',
  'f-011011-kbk': 'The office watched from above while both horses took the corner badly.',
  'f-011011-kkb': 'Two horses and one chaplain, and the chaplain kept the count.',
  'f-011011-kkk': 'They took the turning at speed. Two of the three came out of it.',
  'f-011011-bpr': 'The cloister stood beside the keep and paid for the privilege in stone.',
  'f-011011-brp': 'The keep took the height. The cloister was told the height was shared.',
  'f-011011-pbr': 'The office had the rise and the keep had the road, and both called it defence.',
  'f-011011-prb': 'Stone above and office beside, in the order the bishop had agreed to.',
  'f-011011-rbp': 'The office stood on the rampart and read to the men repairing it.',
  'f-011011-rpb': 'They walled the bend, which is where the road could be lost.',
  'f-011011-kpr': 'The horse waited beside the keep for a gate that opened late.',
  'f-011011-krp': 'The keep held the height and the horse held the road beneath it.',
  'f-011011-pkr': 'The rider took the rise and the keep took the corner.',
  'f-011011-prk': 'Stone on the height, horse at its foot, and the road watched twice.',
  'f-011011-rkp': 'The rider crossed above the rampart while it was still being built.',
  'f-011011-rpk': 'They came out at the bend, where the road could not be seen along.',

  // --- 10 gold ---
  'pq-front': 'One attendant remained after the court learned to empty itself.',
  'rr-vertical': 'One keep watched the road. The other watched the first.',
});

/** One authored fragment per card, matched to that card's own banner name. */
export const RUN_CARD_FLAVOR_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  // Keyed like the banner: a retired formation a Run still holds keeps its authored fragment
  // rather than falling back to 'No account survives.' See nameableRunCards.
  Object.fromEntries(nameableRunCards().map((card) => [
    card.id,
    ALL_RUN_CARD_FLAVOR_BY_ID[card.id] ?? 'No account survives.',
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
