import { runCardArtSlot, runCardFlavor, runCardName } from '../run/cardNames';
import {
  PIECE_VALUE,
  RUN_CARD_TYPE_REFERENCE,
  hieraticAgminateAcquisitionTarget,
  runCardOfferCost,
  tacticalDisciplineAcquisitionTarget,
  type PurchasablePieceType,
  type RunAbility,
  type RunCardOffer,
  type RunCardType,
  type RunCoreCard,
} from '../run/model';
import {
  RUN_CARD_CONCINNOUS_FRAME_SLOT,
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_HIERATIC_FRAME_SLOT,
  RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  RUN_CARD_TACTICAL_FRAME_SLOT,
} from './runCardFrameGeometry';

/**
 * A card face is projected from a Run card, never authored. The brand is declared but
 * never exported, so no other module can produce a value of this type: `runCardFaceContent`
 * below is the only constructor, and every surface that draws a card — the Shop, the
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
  unit: PurchasablePieceType;
  /** Occurrence indices within this cell marked Cacochymic. */
  plaguedIndices?: readonly number[];
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
    id: RunCardType;
    name: string;
    effect: string;
  }>;
  grants: readonly RunCardGrant[];
  flavor: string;
}> & { readonly [RUN_CARD_FACE_PROJECTION]: true };

/** Every current card is a unit card, so the type strip's left side never varies (ADR-0339). */
export const RUN_CARD_TYPE_LINE = 'Units';

const CARD_PIECE_ORDER: readonly PurchasablePieceType[] = Object.freeze([
  'pawn',
  'knight',
  'bishop',
  'rook',
  'queen',
]);

const FRAME_SLOT_BY_CARD_TYPE: Readonly<Record<RunCardType, string>> = Object.freeze({
  pestiferous: RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  concinnous: RUN_CARD_CONCINNOUS_FRAME_SLOT,
  tactical: RUN_CARD_TACTICAL_FRAME_SLOT,
  hieratic: RUN_CARD_HIERATIC_FRAME_SLOT,
});

export function isRunCardOffer(card: RunCoreCard | RunCardOffer): card is RunCardOffer {
  return 'offerId' in card;
}

/** The frame a card property is printed on, chosen once here rather than per host. */
export function runCardFrameSlotForType(cardType: RunCardType | null): string {
  return cardType ? FRAME_SLOT_BY_CARD_TYPE[cardType] : RUN_CARD_FRAME_SLOT;
}

/** The frame a card is printed on. */
export function runCardFrameSlot(card: RunCoreCard | RunCardOffer): string {
  return runCardFrameSlotForType(isRunCardOffer(card) ? card.cardType : null);
}

export type RunCardFaceOptions = Readonly<{
  /**
   * Acquisition has happened, so a target that was drawn at purchase is now public.
   * Before that the target is hidden, and a hidden target draws nothing at all — no
   * marker and no substitute sentence (ADR-0339's Tactical rule, applied to every type).
   */
  purchased?: boolean;
}>;

type PublicAbilityTarget = Readonly<{ state: RunAbility; pieceIndex: number }>;

/**
 * Which unit, if any, wears its granted state on the face. The property-to-state pairing
 * is read from RUN_CARD_TYPE_REFERENCE so cause and result cannot drift apart here.
 */
function publicAbilityTarget(
  card: RunCoreCard | RunCardOffer,
  purchased: boolean,
): PublicAbilityTarget | null {
  if (!isRunCardOffer(card) || !card.cardType) return null;
  const granted = RUN_CARD_TYPE_REFERENCE[card.cardType].grants;
  // Cacochymic is a modifier the offer already names publicly through plaguedPieceIndex.
  if (granted === 'plagued') return null;
  const state: RunAbility = granted;
  // A one-unit offer forces its target, so its state is public before purchase.
  if (card.pieces.length === 1) return { state, pieceIndex: 0 };
  if (!purchased) return null;
  const pieceIndex = card.cardType === 'concinnous'
    ? card.effectTargetIndex
    : card.cardType === 'tactical'
      ? tacticalDisciplineAcquisitionTarget(card.effectSeed, card.pieces.length)
      : hieraticAgminateAcquisitionTarget(card.effectSeed, card.pieces.length);
  if (pieceIndex === null || !card.pieces[pieceIndex]) return null;
  return { state, pieceIndex };
}

export function runCardGrants(
  card: RunCoreCard | RunCardOffer,
  { purchased = false }: RunCardFaceOptions = {},
): readonly RunCardGrant[] {
  const plaguedPieceIndex = isRunCardOffer(card) ? card.plaguedPieceIndex : null;
  const target = publicAbilityTarget(card, purchased);
  return CARD_PIECE_ORDER.flatMap((unit) => {
    const pieceIndices = card.pieces.flatMap((piece, index) => piece === unit ? [index] : []);
    if (pieceIndices.length === 0) return [];
    const plaguedIndex = plaguedPieceIndex === null ? -1 : pieceIndices.indexOf(plaguedPieceIndex);
    const abilityIndex = target === null ? -1 : pieceIndices.indexOf(target.pieceIndex);
    return [{
      unit,
      count: pieceIndices.length,
      plaguedIndices: plaguedIndex >= 0 ? [plaguedIndex] : [],
      ...(target !== null && abilityIndex >= 0
        ? { ability: { state: target.state, index: abilityIndex } }
        : {}),
    }];
  });
}

/** The one constructor of a card face. Every host draws what this returns, unedited. */
export function runCardFaceContent(
  card: RunCoreCard | RunCardOffer,
  options: RunCardFaceOptions = {},
): RunCardFaceContent {
  const offer = isRunCardOffer(card) ? card : null;
  const cardType = offer?.cardType ?? null;
  return {
    name: runCardName(card),
    cost: offer?.cost ?? card.value,
    typeLine: RUN_CARD_TYPE_LINE,
    ...(cardType ? {
      cardProperty: {
        id: cardType,
        name: RUN_CARD_TYPE_REFERENCE[cardType].name,
        effect: RUN_CARD_TYPE_REFERENCE[cardType].effect,
      },
    } : {}),
    grants: runCardGrants(card, options),
    flavor: runCardFlavor(card),
  } as RunCardFaceContent;
}

/** The art a card is illustrated with, alongside its frame. */
export { runCardArtSlot };

export type RunCardSpecimenSpec = Readonly<{
  pieces: readonly PurchasablePieceType[];
  cardType?: RunCardType | null;
  /** Overrides the composition's own gold value, for a study that pins a printed cost. */
  cost?: number;
  /** Which contained unit is Cacochymic, for a Pestiferous specimen. */
  plaguedPieceIndex?: number | null;
  /** Which contained unit a Concinnous specimen has drawn, revealed once purchased. */
  effectTargetIndex?: number | null;
  effectSeed?: number;
}>;

/**
 * A synthetic Run card for review, study and test surfaces. They declare a *card* and
 * project it like every other host, instead of hand-writing a face that answers to no
 * rule. Composition drives the name, flavor, art and contents exactly as it does in a
 * Shop, so a specimen cannot show something a real offer never could.
 */
export function runCardSpecimen({
  pieces,
  cardType = null,
  cost,
  plaguedPieceIndex = null,
  effectTargetIndex = null,
  effectSeed = 0,
}: RunCardSpecimenSpec): RunCardOffer {
  const value = pieces.reduce((total, piece) => total + PIECE_VALUE[piece], 0);
  const plaguedPiece = plaguedPieceIndex === null ? null : pieces[plaguedPieceIndex] ?? null;
  return {
    id: pieces.map((piece) => piece.slice(0, 1)).join(''),
    pieces: [...pieces],
    value,
    offerId: `specimen-${cardType ?? 'standard'}-${pieces.join('-')}`,
    // Priced by the Shop's own rule, so a specimen cannot print a cost no offer could.
    cost: cost ?? runCardOfferCost(value, cardType, plaguedPiece),
    cardType,
    effectSeed,
    plaguedPieceIndex,
    effectTargetIndex,
  };
}
