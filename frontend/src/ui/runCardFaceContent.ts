import { runCardArtSlot, runCardFlavor, runCardName } from '../run/cardNames';
import {
  PIECE_VALUE,
  runCardRarity,
  type AdlectablePieceType,
  type RunArmyPieceType,
  type RunCardDefinition,
  type RunCardOffer,
  type RunCardRarity,
} from '../run/model';
import {
  RUN_CARD_STANDARD_FRAME_SLOT_BY_RARITY,
} from './runCardFrameGeometry';

declare const RUN_CARD_FACE_PROJECTION: unique symbol;

export type RunCardGrant = Readonly<{
  count: number;
  unit: RunArmyPieceType;
  emptyIndices?: readonly number[];
}>;

export type RunCardFormationPiece = Readonly<{
  pieceIndex: number;
  unit: RunArmyPieceType;
  occurrenceIndex: number;
  x: number;
  y: number;
  empty: boolean;
}>;

export type RunCardFaceContent = Readonly<{
  name: string;
  rarity: RunCardRarity;
  cost: number;
  showsCost: boolean;
  typeLine: string;
  grants: readonly RunCardGrant[];
  formation: readonly RunCardFormationPiece[];
  flavor: string;
}> & { readonly [RUN_CARD_FACE_PROJECTION]: true };

export const RUN_CARD_TYPE_LINE = 'Units';

const CARD_PIECE_ORDER: readonly RunArmyPieceType[] = Object.freeze([
  'king',
  'pawn',
  'knight',
  'bishop',
  'rook',
  'queen',
]);

export function isRunCardOffer(card: RunCardDefinition | RunCardOffer): card is RunCardOffer {
  return 'offerId' in card;
}

/** Rarity selects material inside the Standard family; frame type remains independent. */
export function runCardFrameSlot(card: RunCardDefinition | RunCardOffer): string {
  return RUN_CARD_STANDARD_FRAME_SLOT_BY_RARITY[card.rarity];
}

export type RunCardFaceOptions = Readonly<{
  identity?: RunCardDefinition | RunCardOffer;
  emptyPieceIndices?: readonly number[];
}>;

export function runCardGrants(
  card: RunCardDefinition | RunCardOffer,
  { emptyPieceIndices = [] }: RunCardFaceOptions = {},
): readonly RunCardGrant[] {
  const emptyPieces = new Set(emptyPieceIndices);
  return CARD_PIECE_ORDER.flatMap((unit) => {
    const pieceIndices = card.pieces.flatMap((piece, index) => piece === unit ? [index] : []);
    if (pieceIndices.length === 0) return [];
    const emptyIndices = pieceIndices.flatMap((pieceIndex, index) => emptyPieces.has(pieceIndex) ? [index] : []);
    return [{
      unit,
      count: pieceIndices.length,
      ...(emptyIndices.length ? { emptyIndices } : {}),
    }];
  });
}

export function runCardFormation(
  card: RunCardDefinition | RunCardOffer,
  { emptyPieceIndices = [] }: RunCardFaceOptions = {},
): readonly RunCardFormationPiece[] {
  const empty = new Set(emptyPieceIndices);
  const seen = new Map<RunArmyPieceType, number>();
  return card.pieces.map((unit, pieceIndex) => {
    const occurrenceIndex = seen.get(unit) ?? 0;
    seen.set(unit, occurrenceIndex + 1);
    const cell = card.formation?.[pieceIndex] ?? { x: pieceIndex, y: 0 };
    return {
      pieceIndex,
      unit,
      occurrenceIndex,
      x: cell.x,
      y: cell.y,
      empty: empty.has(pieceIndex),
    };
  });
}

export function runCardFaceContent(
  card: RunCardDefinition | RunCardOffer,
  options: RunCardFaceOptions = {},
): RunCardFaceContent {
  const identity = options.identity ?? card;
  const offer = isRunCardOffer(card) ? card : null;
  return {
    name: runCardName(identity),
    rarity: identity.rarity,
    cost: offer?.cost ?? card.value,
    showsCost: identity.id !== 'his-grace',
    typeLine: RUN_CARD_TYPE_LINE,
    grants: runCardGrants(card, options),
    formation: runCardFormation(card, options),
    flavor: runCardFlavor(identity),
  } as RunCardFaceContent;
}

export { runCardArtSlot };

export type RunCardSpecimenSpec = Readonly<{
  pieces: readonly AdlectablePieceType[];
  cost?: number;
  formation?: readonly Readonly<{ x: number; y: number }>[];
}>;

/** A plain synthetic card for layout tests and owner-operated review surfaces. */
export function runCardSpecimen({ pieces, cost, formation }: RunCardSpecimenSpec): RunCardOffer {
  const value = pieces.reduce((total, piece) => total + PIECE_VALUE[piece], 0);
  const id = pieces.map((piece) => piece.slice(0, 1)).join('');
  return {
    id,
    pieces: [...pieces],
    artId: id,
    formation: formation?.map((cell) => ({ ...cell })) ?? pieces.map((_, x) => ({ x, y: 0 })),
    value,
    rarity: runCardRarity(pieces, formation ?? pieces.map((_, x) => ({ x, y: 0 }))),
    offerId: `specimen-${pieces.join('-')}`,
    cost: cost ?? value,
  };
}
