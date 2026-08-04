import { runCardArtSlot, runCardFlavor, runCardName } from '../run/cardNames';
import {
  PIECE_VALUE,
  RUN_CARD_TYPE_REFERENCE,
  RUN_STARTER_CARD_BY_ID,
  hieraticAgminateAcquisitionTarget,
  runCardOfferCost,
  legatineAdlectedAcquisitionTarget,
  type AdlectablePieceType,
  type RunArmyPieceType,
  type RunAbility,
  type RunCardDefinition,
  type RunCardOffer,
  type RunCardType,
  type RunCoreCard,
  type RunStarterCard,
  type RunStarterCardId,
} from '../run/model';
import {
  RUN_CARD_CONCINNOUS_FRAME_SLOT,
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_HIERATIC_FRAME_SLOT,
  RUN_CARD_PRAECIPUUS_FRAME_SLOT,
  RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  RUN_CARD_LEGATINE_FRAME_SLOT,
} from './runCardFrameGeometry';

/**
 * A card face is projected from a Run card, never authored. The brand is declared but
 * never exported, so no other module can produce a value of this type: `runCardFaceContent`
 * below is the only constructor, and every surface that draws a card — the Sectio, the
 * Enchiridion, the Studio prototype, art and icon review, tests — must go through it.
 *
 * That is the point. Hand-authored face literals had drifted into four private copies of
 * the same card, each free to invent what the others did not, and one of them printed an
 * ability sentence ADR-0305 had removed everywhere else.
 */
declare const RUN_CARD_FACE_PROJECTION: unique symbol;

/**
 * One cell of the contents ledger: a count of one unit type, plus whichever of its
 * occurrences carry a state the player is allowed to see.
 */
export type RunCardGrant = Readonly<{
  count: number;
  unit: RunArmyPieceType;
  /** Occurrence indices within this cell marked Cacochymic. */
  cacochymicIndices?: readonly number[];
  /** The single occurrence in this cell whose granted state is public, if any. */
  ability?: Readonly<{ state: RunAbility; index: number }>;
}>;

/**
 * Everything a card face may draw. There is deliberately no free-text slot: a card
 * says its name, its cost, its primary type, its property symbol, its contents and its
 * flavor. Anything a property does is taught by the property symbol's tooltip and the
 * Enchiridion, never by prose printed into the Contents Box (ADR-0305, ADR-0339).
 */
export type RunCardFaceContent = Readonly<{
  name: string;
  cost: number;
  typeLine: string;
  cardProperty?: Readonly<{
    id: RunCardType | 'praecipuus';
    name: string;
    effect: string;
  }>;
  grants: readonly RunCardGrant[];
  flavor: string;
}> & { readonly [RUN_CARD_FACE_PROJECTION]: true };

/** Every current card is a unit card, so the type strip's left side never varies (ADR-0339). */
export const RUN_CARD_TYPE_LINE = 'Units';

const CARD_PIECE_ORDER: readonly RunArmyPieceType[] = Object.freeze([
  'king',
  'pawn',
  'knight',
  'bishop',
  'rook',
  'queen',
]);

const FRAME_SLOT_BY_CARD_TYPE: Readonly<Record<RunCardType | 'praecipuus', string>> = Object.freeze({
  pestiferous: RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  concinnous: RUN_CARD_CONCINNOUS_FRAME_SLOT,
  legatine: RUN_CARD_LEGATINE_FRAME_SLOT,
  hieratic: RUN_CARD_HIERATIC_FRAME_SLOT,
  praecipuus: RUN_CARD_PRAECIPUUS_FRAME_SLOT,
});

export function isRunCardOffer(card: RunCardDefinition | RunCardOffer): card is RunCardOffer {
  return 'offerId' in card;
}

function isRunStarterCard(card: RunCardDefinition | RunCardOffer): card is RunStarterCard {
  return card.id === 'his-grace' || card.id === 'front-lines';
}

/** The frame a card property is printed on, chosen once here rather than per host. */
export function runCardFrameSlotForType(cardType: RunCardType | 'praecipuus' | null): string {
  return cardType ? FRAME_SLOT_BY_CARD_TYPE[cardType] : RUN_CARD_FRAME_SLOT;
}

/**
 * The frame a card is printed on. A card the Run HOLDS is no longer an offer but keeps
 * the property under which it was adlected, so its carrier supplies that property (ADR-0371).
 */
export function runCardFrameSlot(
  card: RunCardDefinition | RunCardOffer,
  heldCardType: RunCardType | null = null,
): string {
  // His Grace's royal frame follows Praecipuus. Front Lines has no property, so it uses
  // the same Standard frame as every other unqualified Units card (ADR-0413).
  return runCardFrameSlotForType(runCardProperty(card, heldCardType));
}

export type RunCardFaceOptions = Readonly<{
  /**
   * Adlectio has happened, so a target that was drawn at admission is now public.
   * Before that the target is hidden, and a hidden target draws nothing at all — no
   * marker and no substitute sentence (ADR-0339's Tactical rule, applied to every type).
   */
  adlected?: boolean;
  /**
   * The property of a card the Run holds, which carries no offer of its own (ADR-0371).
   * An offer always carries its own property and ignores this.
   */
  cardType?: RunCardType | null;
}>;

/** The property a card wears: its offer's, or the one under which a held card was adlected. */
function runCardProperty(
  card: RunCardDefinition | RunCardOffer,
  heldCardType: RunCardType | null,
): RunCardType | 'praecipuus' | null {
  if (isRunStarterCard(card)) return card.property;
  return (isRunCardOffer(card) ? card.cardType : null) ?? heldCardType;
}

type PublicAbilityTarget = Readonly<{ state: RunAbility; pieceIndex: number }>;

/**
 * Which unit, if any, wears its granted state on the face. The property-to-state pairing
 * is read from RUN_CARD_TYPE_REFERENCE so cause and result cannot drift apart here.
 */
function publicAbilityTarget(
  card: RunCardDefinition | RunCardOffer,
  adlected: boolean,
): PublicAbilityTarget | null {
  if (isRunStarterCard(card)) {
    return card.id === 'his-grace' ? { state: 'primogeniture', pieceIndex: 0 } : null;
  }
  if (!isRunCardOffer(card) || !card.cardType) return null;
  const granted = RUN_CARD_TYPE_REFERENCE[card.cardType].grants;
  // Cacochymic is a modifier the offer already names publicly through cacochymicPieceIndex.
  if (granted === 'cacochymic') return null;
  const state: RunAbility = granted;
  // A one-unit offer forces its target, so its state is public before Adlectio.
  if (card.pieces.length === 1) return { state, pieceIndex: 0 };
  if (!adlected) return null;
  const pieceIndex = card.cardType === 'concinnous'
    ? card.effectTargetIndex
    : card.cardType === 'legatine'
      ? legatineAdlectedAcquisitionTarget(card.effectSeed, card.pieces.length)
      : hieraticAgminateAcquisitionTarget(card.effectSeed, card.pieces.length);
  if (pieceIndex === null || !card.pieces[pieceIndex]) return null;
  return { state, pieceIndex };
}

export function runCardGrants(
  card: RunCardDefinition | RunCardOffer,
  { adlected = false }: RunCardFaceOptions = {},
): readonly RunCardGrant[] {
  const cacochymicPieceIndex = isRunCardOffer(card) ? card.cacochymicPieceIndex : null;
  const target = publicAbilityTarget(card, adlected);
  return CARD_PIECE_ORDER.flatMap((unit) => {
    const pieceIndices = card.pieces.flatMap((piece, index) => piece === unit ? [index] : []);
    if (pieceIndices.length === 0) return [];
    const plaguedIndex = cacochymicPieceIndex === null ? -1 : pieceIndices.indexOf(cacochymicPieceIndex);
    const abilityIndex = target === null ? -1 : pieceIndices.indexOf(target.pieceIndex);
    return [{
      unit,
      count: pieceIndices.length,
      cacochymicIndices: plaguedIndex >= 0 ? [plaguedIndex] : [],
      ...(target !== null && abilityIndex >= 0
        ? { ability: { state: target.state, index: abilityIndex } }
        : {}),
    }];
  });
}

/** The one constructor of a card face. Every host draws what this returns, unedited. */
export function runCardFaceContent(
  card: RunCardDefinition | RunCardOffer,
  options: RunCardFaceOptions = {},
): RunCardFaceContent {
  const offer = isRunCardOffer(card) ? card : null;
  const cardType = runCardProperty(card, options.cardType ?? null);
  return {
    name: runCardName(card),
    cost: offer?.cost ?? card.value,
    typeLine: RUN_CARD_TYPE_LINE,
    ...(cardType ? {
      cardProperty: {
        id: cardType,
        name: cardType === 'praecipuus' ? 'Praecipuus' : RUN_CARD_TYPE_REFERENCE[cardType].name,
        effect: cardType === 'praecipuus'
          ? 'Moves this card to the top of every deployment deal.'
          : RUN_CARD_TYPE_REFERENCE[cardType].effect,
      },
    } : {}),
    grants: runCardGrants(card, options),
    flavor: runCardFlavor(card),
  } as RunCardFaceContent;
}

/** The art a card is illustrated with, alongside its frame. */
export { runCardArtSlot };

export type RunCardSpecimenSpec = Readonly<{
  pieces: readonly AdlectablePieceType[];
  cardType?: RunCardType | null;
  /** Overrides the composition's own gold value, for a study that pins a printed cost. */
  cost?: number;
  /** Which contained unit is Cacochymic, for a Pestiferous specimen. */
  cacochymicPieceIndex?: number | null;
  /** Which contained unit a Concinnous specimen has drawn, revealed once adlected. */
  effectTargetIndex?: number | null;
  effectSeed?: number;
}>;

/**
 * A synthetic Run card for review, study and test surfaces. They declare a *card* and
 * project it like every other host, instead of hand-writing a face that answers to no
 * rule. Composition drives the name, flavor, art and contents exactly as it does in a
 * Sectio, so a specimen cannot show something a real offer never could.
 */
export function runCardSpecimen({
  pieces,
  cardType = null,
  cost,
  cacochymicPieceIndex = null,
  effectTargetIndex = null,
  effectSeed = 0,
}: RunCardSpecimenSpec): RunCardOffer {
  const value = pieces.reduce((total, piece) => total + PIECE_VALUE[piece], 0);
  const plaguedPiece = cacochymicPieceIndex === null ? null : pieces[cacochymicPieceIndex] ?? null;
  return {
    id: pieces.map((piece) => piece.slice(0, 1)).join(''),
    pieces: [...pieces],
    value,
    offerId: `specimen-${cardType ?? 'standard'}-${pieces.join('-')}`,
    // Priced by the Sectio's own rule, so a specimen cannot print a cost no offer could.
    cost: cost ?? runCardOfferCost(value, cardType, plaguedPiece),
    cardType,
    effectSeed,
    cacochymicPieceIndex,
    effectTargetIndex,
  };
}
