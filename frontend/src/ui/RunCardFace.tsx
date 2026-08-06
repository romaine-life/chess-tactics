import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { paletteForSide, pieceSpritePath, type PlayablePieceType } from '../core/pieces';
import {
  CACOCHYMIC_DESCRIPTION,
  CACOCHYMIC_DISPLAY_NAME,
  PIECE_LABEL,
  runAbilityDescription,
  runAbilityDisplayName,
  type RunCardType,
} from '../run/model';
import type { RunCardFaceContent, RunCardGrant } from './runCardFaceContent';
import {
  RUN_CARD_FRAME_BOX_NAMES,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
  RUN_CARD_TEXT_PLACEMENT,
  runCardCostSizeCqw,
  runCardFrameGeometryVariables,
  type RunCardFrameBoxName,
  type RunCardFrameBoxStyle,
  type RunCardFrameGeometry,
} from './runCardFrameGeometry';
import { RunAbilityIcon, runUnitStateIconUrl, type RunUnitState } from './shared/RunAbilityIcon';
import { installedUiMedia } from './installedUiMedia';
import { Tooltip } from './shared/InfoTip';

// Frame identity lives with the boxes each frame owns; the face re-exports it so
// hosts pick a frame and its geometry from one import.
export {
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  RUN_CARD_CONCINNOUS_FRAME_SLOT,
  RUN_CARD_LEGATINE_FRAME_SLOT,
  RUN_CARD_HIERATIC_FRAME_SLOT,
  RUN_CARD_PRAECIPUUS_FRAME_SLOT,
} from './runCardFrameGeometry';
export const RUN_CARD_COST_COIN_SOURCE_SLOT = 'ui/run/card-prototypes/cost-coin-source-v1.png';
export const RUN_CARD_REFERENCE_WIDTH = 360;

const PLAYER_CARD_PALETTE = paletteForSide('player');
const PLAYER_CARD_FACING = 'south';

/** The card properties are the model's, not a lookalike list maintained beside it. */
export type RunCardProperty = RunCardType | 'praecipuus';
export type { RunUnitState };

/**
 * Each causal card property owns its own typed `card-property-icon` role, distinct from
 * the unit state it bestows. Runtime code resolves the role and never substitutes text,
 * a glyph, or the paired unit-state icon (ADR-0339).
 */
const RUN_CARD_PROPERTY_MEDIA_ROLE: Readonly<Record<RunCardProperty, string>> = Object.freeze({
  pestiferous: 'ui-kit-icons-card-properties-pestiferous-png',
  concinnous: 'ui-kit-icons-card-properties-concinnous-png',
  legatine: 'ui-kit-icons-card-properties-legatine-png',
  hieratic: 'ui-kit-icons-card-properties-hieratic-png',
  praecipuus: 'ui-kit-icons-card-properties-praecipuus-png',
});

export function runCardPropertyIconUrl(property: RunCardProperty): string {
  return installedUiMedia(RUN_CARD_PROPERTY_MEDIA_ROLE[property]);
}

export type RunCardIconMedia = Readonly<{
  propertyUrl?: string;
  unitStateUrls?: Readonly<Partial<Record<RunUnitState, string>>>;
}>;

const EMPTY_RUN_CARD_ICON_MEDIA: RunCardIconMedia = Object.freeze({});

export type RunCardIconPlacement = Readonly<{
  x: number;
  y: number;
  scale: number;
}>;

export type RunCardUnitHighlight = Readonly<{
  unit: PlayablePieceType;
  /** Zero-based occurrence inside this piece type's visible card stack. */
  index: number;
}>;

export type RunCardUnitSelection = Readonly<{
  id: (unit: PlayablePieceType, index: number) => string | null;
  label: (unit: PlayablePieceType, index: number) => string | null;
  onSelect: (unit: PlayablePieceType, index: number) => void;
}>;

export type RunCardIconTuning = Readonly<{
  property: RunCardIconPlacement;
  unitState: RunCardIconPlacement;
}>;

export const RUN_CARD_ICON_PLACEMENT_BASELINE: RunCardIconPlacement = Object.freeze({
  x: 0,
  y: 0,
  scale: 1,
});

/**
 * The committed Card Icon Fitting result (ADR-0340): one placement per card property in
 * its type-strip symbol seat, and one placement shared by every unit-state marker. These
 * are the Reset-to-committed baseline the Studio instrument compares its draft against
 * (ADR-0057), not a zeroed-out placement.
 */
export const RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS: Readonly<Record<RunCardProperty, RunCardIconPlacement>> = Object.freeze({
  pestiferous: Object.freeze({ x: -1.35, y: -1.05, scale: 2 }),
  concinnous: Object.freeze({ x: -0.6, y: 0.3, scale: 1 }),
  legatine: Object.freeze({ x: -4, y: -0.95, scale: 2.75 }),
  hieratic: Object.freeze({ x: -4, y: -3.45, scale: 1.8 }),
  praecipuus: Object.freeze({ x: 1.35, y: -1.05, scale: 2.4 }),
});

export const RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT: RunCardIconPlacement = Object.freeze({
  x: 4.2,
  y: -0.45,
  scale: 4.15,
});

export const RUN_CARD_ICON_TUNING_BASELINE: RunCardIconTuning = Object.freeze({
  property: RUN_CARD_ICON_PLACEMENT_BASELINE,
  unitState: RUN_CARD_ICON_PLACEMENT_BASELINE,
});

/** The committed fitting for one card, selected by the property it carries. */
export function runCardCommittedIconTuning(property?: RunCardProperty): RunCardIconTuning {
  return {
    property: property ? RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS[property] : RUN_CARD_ICON_PLACEMENT_BASELINE,
    unitState: RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT,
  };
}

export type RunCardImageKind =
  | 'frame'
  | 'coin'
  | 'art'
  | 'property-icon'
  | `unit-state:${RunUnitState}`
  | `unit:${number}:${PlayablePieceType}:${number}`;

/**
 * The face renders only what `runCardFaceContent` projects from a real card. The type is
 * branded there so a host cannot hand-author one, and it carries no free-text slot to
 * fill (ADR-0305, ADR-0339).
 */
export type { RunCardFaceContent, RunCardGrant } from './runCardFaceContent';

/**
 * What a host may still choose about the face's text: how big it is, and the two
 * shared placement values from RUN_CARD_TEXT_PLACEMENT. Where a line sits is not
 * on this list — that is the frame's box, centered (ADR-0347).
 */
export type RunCardFaceTuning = Readonly<{
  costSize: number;
  titleSize: number;
  typeSize: number;
  flavorSize: number;
  textInset: number;
  textInkCentre: number;
}>;

export type RunCardContentsTuning = Readonly<{
  unitHeight: number;
  unitNaturalGap: number;
  countSize: number;
  countColumn: number;
  columnGap: number;
  rowGap: number;
  flavorScale: number;
  paddingBlockStart: number;
  paddingBlockEnd: number;
}>;

/** Owner-approved Card Layout handoff, measured in percent of the card width. */
export const RUN_CARD_APPROVED_TUNING: RunCardFaceTuning = Object.freeze({
  titleSize: 6.85,
  typeSize: 5.3,
  costSize: 6.2,
  flavorSize: 5,
  textInset: RUN_CARD_TEXT_PLACEMENT.insetInline,
  textInkCentre: RUN_CARD_TEXT_PLACEMENT.inkCentreEm,
});

/** The Contents Box base values every density step overrides. Hosts get the load-derived ladder below. */
export const RUN_CARD_DEFAULT_CONTENTS_TUNING: RunCardContentsTuning = Object.freeze({
  unitHeight: 9,
  unitNaturalGap: .8,
  countSize: 4,
  countColumn: 4.5,
  columnGap: 2,
  rowGap: .8,
  flavorScale: 1,
  paddingBlockStart: 2.2,
  paddingBlockEnd: 2.3,
});

export type RunCardContentsDensity = 'roomy' | 'filled' | 'packed' | 'scrunched';

export type RunCardContentsDensityStep = Readonly<{
  density: RunCardContentsDensity;
  tuning: RunCardContentsTuning;
}>;

/**
 * The reviewed Contents Box density steps (ADR-0270), most spacious first.
 * Each step was hand-tuned against its anchor load at the real card size:
 * roomy 1 cell, filled 2 cells, packed 3-4 cells over 2 rows, scrunched 5 cells.
 */
export const RUN_CARD_CONTENTS_DENSITY_LADDER: readonly RunCardContentsDensityStep[] = Object.freeze([
  {
    density: 'roomy',
    tuning: Object.freeze({
      ...RUN_CARD_DEFAULT_CONTENTS_TUNING,
      unitHeight: 21,
      unitNaturalGap: 1.2,
      countSize: 8,
      countColumn: 8.5,
      rowGap: 1,
      paddingBlockStart: 1.5,
      paddingBlockEnd: 1.5,
    }),
  },
  {
    density: 'filled',
    tuning: Object.freeze({
      ...RUN_CARD_DEFAULT_CONTENTS_TUNING,
      unitHeight: 12,
      unitNaturalGap: .9,
      countSize: 5.4,
      countColumn: 5.9,
      rowGap: .65,
      paddingBlockStart: 1.7,
      paddingBlockEnd: 1.7,
    }),
  },
  {
    density: 'packed',
    tuning: Object.freeze({
      ...RUN_CARD_DEFAULT_CONTENTS_TUNING,
      unitHeight: 11.5,
      unitNaturalGap: .85,
      countSize: 4.9,
      countColumn: 5.4,
      rowGap: .6,
      paddingBlockStart: 1.5,
      paddingBlockEnd: 1.5,
    }),
  },
  {
    density: 'scrunched',
    tuning: Object.freeze({
      ...RUN_CARD_DEFAULT_CONTENTS_TUNING,
      unitHeight: 8,
      unitNaturalGap: .6,
      countSize: 3.8,
      countColumn: 4.3,
      columnGap: 1.5,
      rowGap: .45,
      flavorScale: .96,
      paddingBlockStart: 1.35,
      paddingBlockEnd: 1.35,
    }),
  },
]);

/** Mirrors the ledger's 2-column grid: 1-2 cells span full rows, denser cells pair up. */
export function runCardLedgerRows(cellCount: number): number {
  return cellCount <= 2 ? cellCount : Math.ceil(cellCount / 2);
}

// Fit-estimate constants mirroring the Contents Box CSS (style.css). The glyph
// advance is deliberately conservative so estimated line counts round up before
// a bigger density step could clip the bottom-anchored flavor.
const CONTENTS_INLINE_PADDING_CQW = 5.2;
const CONTENTS_TEXT_ADVANCE_EM = .34;
const FLAVOR_LINE_HEIGHT = 1.2;

function estimatedLineCount(text: string, fontSizeCqw: number, lineWidthCqw: number): number {
  const perLine = Math.max(1, Math.floor(lineWidthCqw / (fontSizeCqw * CONTENTS_TEXT_ADVANCE_EM)));
  return Math.max(1, Math.ceil(text.length / perLine));
}

function estimatedContentsHeightCqw(
  card: RunCardFaceContent,
  tuning: RunCardContentsTuning,
  flavorSizeCqw: number,
  lineWidthCqw: number,
): number {
  const rows = runCardLedgerRows(card.grants.length);
  const ledger = rows * tuning.unitHeight + Math.max(0, rows - 1) * tuning.rowGap;
  const flavorSize = flavorSizeCqw * tuning.flavorScale;
  const flavor = estimatedLineCount(card.flavor, flavorSize, lineWidthCqw) * flavorSize * FLAVOR_LINE_HEIGHT;
  return tuning.paddingBlockStart + ledger + flavor + tuning.paddingBlockEnd;
}

// Flavor may grow into verified leftover box room in these increments, but it
// stays flavor: it never exceeds the cap and never influences the step choice.
const FLAVOR_GROWTH_INCREMENT = .05;
const FLAVOR_SCALE_CAP = 1.3;

function grownFlavorScale(
  card: RunCardFaceContent,
  tuning: RunCardContentsTuning,
  flavorSizeCqw: number,
  lineWidthCqw: number,
  boxHeightCqw: number,
): number {
  let grown = tuning.flavorScale;
  for (let increment = 1; ; increment += 1) {
    const candidate = Math.round((tuning.flavorScale + increment * FLAVOR_GROWTH_INCREMENT) * 100) / 100;
    if (candidate > FLAVOR_SCALE_CAP) return grown;
    const height = estimatedContentsHeightCqw(
      card,
      { ...tuning, flavorScale: candidate },
      flavorSizeCqw,
      lineWidthCqw,
    );
    // Estimated height is monotone in flavor size, so the first miss is final.
    if (height > boxHeightCqw) return grown;
    grown = candidate;
  }
}

/**
 * ADR-0270: sparse cards use the room available. The card's cell/row load picks
 * its reviewed anchor step; the step only moves denser when this frame's actual
 * Contents Box could not hold the estimated stack (properties, rules, long
 * flavor), because clipped flavor is worse than a denser reviewed layout.
 * After the step is fixed, the flavor text grows into any leftover box room —
 * units always win the step first, and growth is capped and clip-checked.
 */
export function runCardContentsDensityStepForCard(
  card: RunCardFaceContent,
  frameGeometry: RunCardFrameGeometry = RUN_CARD_STANDARD_FRAME_GEOMETRY,
  flavorSizeCqw: number = RUN_CARD_APPROVED_TUNING.flavorSize,
): RunCardContentsDensityStep {
  const cells = card.grants.length;
  const rows = runCardLedgerRows(cells);
  const anchor = cells <= 1 ? 0 : cells === 2 ? 1 : rows <= 2 ? 2 : 3;
  const contentsBox = frameGeometry.boxes.contents;
  const boxHeight = (contentsBox.height / frameGeometry.sourceWidth) * 100;
  const lineWidth = (contentsBox.width / frameGeometry.sourceWidth) * 100 - CONTENTS_INLINE_PADDING_CQW;
  let selected = RUN_CARD_CONTENTS_DENSITY_LADDER[RUN_CARD_CONTENTS_DENSITY_LADDER.length - 1];
  for (let index = anchor; index < RUN_CARD_CONTENTS_DENSITY_LADDER.length - 1; index += 1) {
    const step = RUN_CARD_CONTENTS_DENSITY_LADDER[index];
    if (estimatedContentsHeightCqw(card, step.tuning, flavorSizeCqw, lineWidth) <= boxHeight) {
      selected = step;
      break;
    }
  }
  const flavorScale = grownFlavorScale(card, selected.tuning, flavorSizeCqw, lineWidth, boxHeight);
  return flavorScale === selected.tuning.flavorScale
    ? selected
    : { density: selected.density, tuning: { ...selected.tuning, flavorScale } };
}

export const runCardUnitImageKind = (
  cell: number,
  unit: PlayablePieceType,
  index: number,
): RunCardImageKind => `unit:${cell}:${unit}:${index}`;

const runCardUnitStateImageKind = (
  state: RunUnitState,
): Extract<RunCardImageKind, `unit-state:${RunUnitState}`> => `unit-state:${state}`;

/**
 * Every declared property and unit state resolves an accepted role, so the card owes its
 * icons unconditionally and cannot promote a face that is still missing one.
 */
export function requiredRunCardImageKinds(card: RunCardFaceContent): readonly RunCardImageKind[] {
  const stateKinds = new Set<RunCardImageKind>();
  for (const grant of card.grants) {
    const emptyIndices = new Set(grant.emptyIndices ?? []);
    if (grant.ability && !emptyIndices.has(grant.ability.index)) {
      stateKinds.add(`unit-state:${grant.ability.state}`);
    }
    if (grant.cacochymicIndices?.some((index) => !emptyIndices.has(index))) {
      stateKinds.add('unit-state:cacochymic');
    }
  }
  return [
    'frame',
    'coin',
    'art',
    ...(card.cardProperty ? ['property-icon' as const] : []),
    ...stateKinds,
    ...card.grants.flatMap((grant, cell) => (
      Array.from({ length: grant.count }, (_, index) => (
        grant.emptyIndices?.includes(index) ? [] : [runCardUnitImageKind(cell, grant.unit, index)]
      )).flat()
    )),
  ];
}

export function runCardPresentationSignature(
  card: RunCardFaceContent,
  frameUrl: string,
  artUrl: string,
  frameGeometry: RunCardFrameGeometry = RUN_CARD_STANDARD_FRAME_GEOMETRY,
  coinSourceUrl = RUN_CARD_COST_COIN_SOURCE_SLOT,
  iconMedia: RunCardIconMedia = EMPTY_RUN_CARD_ICON_MEDIA,
): string {
  return JSON.stringify([
    frameUrl,
    coinSourceUrl,
    artUrl,
    frameGeometry.id,
    frameGeometry.frameSha256s,
    card.name,
    card.cost,
    card.showsCost,
    card.typeLine,
    card.cardProperty ? [card.cardProperty.id, card.cardProperty.name, card.cardProperty.effect] : null,
    iconMedia.propertyUrl ?? null,
    iconMedia.unitStateUrls ?? null,
    card.grants.map(({ count, unit, emptyIndices, cacochymicIndices, ability }) => (
      [count, unit, emptyIndices ?? [], cacochymicIndices ?? [], ability ? [ability.state, ability.index] : null]
    )),
    card.flavor,
  ]);
}

export function runCardPresentationCanPromote(
  requestedSignature: string,
  pendingSignature: string | null,
  card: RunCardFaceContent,
  settled: ReadonlySet<RunCardImageKind>,
): boolean {
  return requestedSignature === pendingSignature
    && requiredRunCardImageKinds(card).every((kind) => settled.has(kind));
}

export function runCardUnitStackSeatLeft(
  index: number,
  count: number,
  visibleWidth: number,
  naturalGap: number,
): string {
  if (count <= 1) return '0cqw';
  const endFraction = index / (count - 1);
  const naturalLeft = index * (visibleWidth + naturalGap);
  const fittedLeft = `calc(${(endFraction * 100).toFixed(4)}% - ${(endFraction * visibleWidth).toFixed(4)}cqw)`;
  return `min(${naturalLeft.toFixed(4)}cqw, ${fittedLeft})`;
}

type UnitSpriteMetrics = Readonly<{
  alphaMask: Uint8Array;
  naturalHeight: number;
  naturalWidth: number;
  opaqueLeft: number;
  opaqueWidth: number;
  canvasWidthPerHeight: number;
  opaqueLeftPerHeight: number;
  opaqueWidthPerHeight: number;
}>;

const unitSpriteMetrics = new Map<string, UnitSpriteMetrics>();

function measureUnitSprite(image: HTMLImageElement): UnitSpriteMetrics {
  const source = image.currentSrc || image.src;
  const cached = unitSpriteMetrics.get(source);
  if (cached) return cached;
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('unit sprite has no native dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('unit sprite alpha measurement is unavailable');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const alphaMask = new Uint8Array(canvas.width * canvas.height);
  let minX = canvas.width;
  let maxX = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[((y * canvas.width + x) * 4) + 3] <= 8) continue;
      alphaMask[(y * canvas.width) + x] = 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  if (maxX < minX) throw new Error('unit sprite contains no visible pixels');
  const measured = Object.freeze({
    alphaMask,
    naturalHeight: canvas.height,
    naturalWidth: canvas.width,
    opaqueLeft: minX,
    opaqueWidth: maxX - minX + 1,
    canvasWidthPerHeight: canvas.width / canvas.height,
    opaqueLeftPerHeight: minX / canvas.height,
    opaqueWidthPerHeight: (maxX - minX + 1) / canvas.height,
  });
  unitSpriteMetrics.set(source, measured);
  return measured;
}

/** A removal-only face update needs no new pixels and may commit in the current frame. */
export function runCardContentCanUpdateWithoutMediaLoad(
  current: RunCardFaceContent,
  requested: RunCardFaceContent,
): boolean {
  if (current.cardProperty?.id !== requested.cardProperty?.id) return false;
  const currentKinds = new Set(requiredRunCardImageKinds(current));
  return requiredRunCardImageKinds(requested).every((kind) => currentKinds.has(kind));
}

export type RunCardUnitStackLayout = Readonly<{
  stackCount: number;
  stackIndices: readonly (number | null)[];
  abilityStackIndex?: number;
}>;

/** Resolves either authored empty seats or the compact post-Alienatio next frame. */
export function runCardUnitStackLayout(
  grant: Pick<RunCardGrant, 'count' | 'emptyIndices' | 'cacochymicIndices' | 'ability'>,
  compactEmptySeats: boolean,
): RunCardUnitStackLayout {
  const emptyIndices = new Set(grant.emptyIndices ?? []);
  const visibleIndices = Array.from({ length: grant.count }, (_, index) => index)
    .filter((index) => !emptyIndices.has(index));
  const cacochymicIndices = grant.cacochymicIndices ?? [];
  const visibleCacochymicIndices = cacochymicIndices.filter((index) => !emptyIndices.has(index));
  const abilityUnitIndex = grant.ability?.index ?? -1;
  const abilityVisible = abilityUnitIndex >= 0 && !emptyIndices.has(abilityUnitIndex);
  const stackIndices = Array.from({ length: grant.count }, (_, index): number | null => {
    if (emptyIndices.has(index)) return null;
    const unitIndex = compactEmptySeats ? visibleIndices.indexOf(index) : index;
    const markersBefore = (compactEmptySeats ? visibleCacochymicIndices : cacochymicIndices)
      .filter((plaguedIndex) => plaguedIndex < index).length;
    return unitIndex + markersBefore;
  });
  const markerIndices = compactEmptySeats ? visibleCacochymicIndices : cacochymicIndices;
  const stackCount = (compactEmptySeats ? visibleIndices.length : grant.count)
    + markerIndices.length
    + (compactEmptySeats ? Number(abilityVisible) : Number(Boolean(grant.ability)));
  const abilityStackIndex = grant.ability && (!compactEmptySeats || abilityVisible)
    ? (compactEmptySeats ? visibleIndices.indexOf(abilityUnitIndex) : abilityUnitIndex)
      + markerIndices.filter((plaguedIndex) => plaguedIndex <= abilityUnitIndex).length
      + 1
    : undefined;
  return { stackCount, stackIndices, abilityStackIndex };
}

export function runCardUnitSpriteAlphaHit(
  sprite: Pick<UnitSpriteMetrics, 'alphaMask' | 'naturalHeight' | 'naturalWidth' | 'opaqueLeft' | 'opaqueWidth'>,
  inlineRatio: number,
  blockRatio: number,
  hitSlop = 0,
): boolean {
  return runCardUnitSpriteAlphaDistance(sprite, inlineRatio, blockRatio, hitSlop) !== null;
}

export function runCardUnitSpriteAlphaDistance(
  sprite: Pick<UnitSpriteMetrics, 'alphaMask' | 'naturalHeight' | 'naturalWidth' | 'opaqueLeft' | 'opaqueWidth'>,
  inlineRatio: number,
  blockRatio: number,
  hitSlop = 0,
): number | null {
  const radius = Math.max(0, Math.floor(hitSlop));
  const x = sprite.opaqueLeft + Math.floor(inlineRatio * sprite.opaqueWidth);
  const y = Math.floor(blockRatio * sprite.naturalHeight);
  let closestDistance: number | null = null;
  for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(sprite.naturalHeight - 1, y + radius); sampleY += 1) {
    for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(sprite.naturalWidth - 1, x + radius); sampleX += 1) {
      if (sprite.alphaMask[(sampleY * sprite.naturalWidth) + sampleX] !== 1) continue;
      const distance = ((sampleX - x) ** 2) + ((sampleY - y) ** 2);
      if (distance > radius ** 2) continue;
      closestDistance = closestDistance === null ? distance : Math.min(closestDistance, distance);
    }
  }
  return closestDistance;
}

type RunCardUnitAlphaSample = Readonly<{
  sprite: Pick<UnitSpriteMetrics, 'alphaMask' | 'naturalHeight' | 'naturalWidth' | 'opaqueLeft' | 'opaqueWidth'>;
  inlineRatio: number;
  blockRatio: number;
  hitSlop?: number;
}>;

export function runCardUnitClosestAlphaHit(
  samples: readonly (RunCardUnitAlphaSample | null)[],
): number | null {
  let closestIndex: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!sample) continue;
    const distance = runCardUnitSpriteAlphaDistance(
      sample.sprite,
      sample.inlineRatio,
      sample.blockRatio,
      sample.hitSlop,
    );
    // Equal-distance overlaps belong to the later painted sprite.
    if (distance === null || distance > closestDistance) continue;
    closestIndex = index;
    closestDistance = distance;
  }
  return closestIndex;
}

function runCardUnitStackPointerTarget(
  stack: HTMLSpanElement,
  clientX: number,
  clientY: number,
): HTMLButtonElement | null {
  const buttons = Array.from(stack.querySelectorAll<HTMLButtonElement>(
    'button.run-card-prototype-unit-icon-seat.is-selectable',
  ));
  const hitIndex = runCardUnitClosestAlphaHit(buttons.map((button) => {
    const image = button.querySelector<HTMLImageElement>('.run-card-prototype-unit-icon');
    const metrics = image ? unitSpriteMetrics.get(image.currentSrc || image.src) : null;
    if (!metrics) return null;
    const bounds = button.getBoundingClientRect();
    return {
      sprite: metrics,
      inlineRatio: (clientX - bounds.left) / bounds.width,
      blockRatio: (clientY - bounds.top) / bounds.height,
      hitSlop: Math.max(2, Math.round(metrics.naturalHeight * .06)),
    };
  }));
  return hitIndex === null ? null : buttons[hitIndex];
}

function setRunCardUnitStackPointerTarget(
  stack: HTMLSpanElement,
  target: HTMLButtonElement | null,
): void {
  stack.classList.toggle('has-pixel-hover', target !== null);
  stack.querySelectorAll<HTMLButtonElement>(
    'button.run-card-prototype-unit-icon-seat.is-selectable',
  ).forEach((button) => button.classList.toggle('is-pixel-hovered', button === target));
}

function UnitGrantStack({
  cell,
  grant,
  iconMedia,
  stackLayout,
  pending,
  unitHighlight,
  unitSelection,
  tuning,
  onReady,
  onError,
}: {
  cell: number;
  grant: RunCardGrant;
  iconMedia: RunCardIconMedia;
  stackLayout: RunCardUnitStackLayout;
  pending: boolean;
  unitHighlight?: RunCardUnitHighlight | null;
  unitSelection?: RunCardUnitSelection | null;
  tuning: RunCardContentsTuning;
  onReady: (kind: RunCardImageKind) => void;
  onError: (kind: RunCardImageKind) => void;
}): ReactElement {
  const [metrics, setMetrics] = useState<UnitSpriteMetrics | null>(null);
  const { unit } = grant;
  const emptyIndices = grant.emptyIndices ?? [];
  const cacochymicIndices = grant.cacochymicIndices ?? [];
  const stackCount = stackLayout.stackCount;
  const source = pieceSpritePath(unit, PLAYER_CARD_PALETTE, PLAYER_CARD_FACING);
  const unitName = PIECE_LABEL[unit];
  const visibleWidth = metrics ? metrics.opaqueWidthPerHeight * tuning.unitHeight : 0;
  const canvasWidth = metrics ? metrics.canvasWidthPerHeight * tuning.unitHeight : 0;
  const canvasLeft = metrics ? -metrics.opaqueLeftPerHeight * tuning.unitHeight : 0;
  const placements = Array.from({ length: grant.count }, (_, index) => index)
    .filter((index) => !emptyIndices.includes(index))
    .map((index) => {
      const stackIndex = stackLayout.stackIndices[index]!;
      const selectionId = pending ? null : unitSelection?.id(unit, index) ?? null;
      return {
        index,
        stackIndex,
        plagued: cacochymicIndices.includes(index),
        highlighted: unitHighlight?.unit === unit && unitHighlight.index === index,
        selectionId,
        selectionLabel: pending ? null : unitSelection?.label(unit, index) ?? null,
        seatLeft: runCardUnitStackSeatLeft(
          stackIndex,
          stackCount,
          visibleWidth,
          tuning.unitNaturalGap,
        ),
      };
    });
  const firstSeatLeft = placements[0]?.seatLeft ?? '0cqw';
  const lastSeatLeft = placements[placements.length - 1]?.seatLeft ?? firstSeatLeft;
  const tooltipWidth = metrics && placements.length
    ? `calc(${lastSeatLeft} - ${firstSeatLeft} + ${visibleWidth.toFixed(4)}cqw)`
    : '0cqw';
  const abilityUnitIndex = grant.ability?.index ?? -1;
  const abilityStackIndex = stackLayout.abilityStackIndex;
  const abilitySeatLeft = abilityStackIndex === undefined
    ? null
    : runCardUnitStackSeatLeft(
      abilityStackIndex,
      stackCount,
      visibleWidth,
      tuning.unitNaturalGap,
    );

  return (
    <>
      {placements.length ? (
        <Tooltip
          className="run-card-prototype-unit-tooltip"
          triggerClassName="run-card-prototype-unit-tooltip-trigger"
          popupClassName="run-card-prototype-unit-tooltip-popup"
          popupMaxInlineSize={168}
          focusable={false}
          explainMechanics={false}
          label={unitName}
          title={unitName}
          style={{ insetInlineStart: firstSeatLeft, inlineSize: tooltipWidth }}
          trigger={placements.map(({
            index,
            stackIndex,
            plagued,
            highlighted,
            selectionId,
            selectionLabel,
            seatLeft,
          }) => {
            const kind = runCardUnitImageKind(cell, unit, index);
            const seatClassName = `run-card-prototype-unit-icon-seat${plagued ? ' is-plagued' : ''}${highlighted ? ' is-highlighted' : ''}${selectionLabel ? ' is-selectable' : ''}`;
            const seatStyle = {
              '--run-card-unit-canvas-left': `${canvasLeft.toFixed(4)}cqw`,
              '--run-card-unit-canvas-width': `${canvasWidth.toFixed(4)}cqw`,
              '--run-card-unit-seat-left': seatLeft === firstSeatLeft
                ? '0cqw'
                : `calc(${seatLeft} - ${firstSeatLeft})`,
              '--run-card-unit-seat-width': `${visibleWidth.toFixed(4)}cqw`,
              zIndex: stackIndex + 1,
            } as CSSProperties;
            const sprite = (
              <img
                className="run-card-prototype-unit-icon"
                data-unit-facing={PLAYER_CARD_FACING}
                data-unit-palette={PLAYER_CARD_PALETTE}
                src={source}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  try {
                    setMetrics(measureUnitSprite(event.currentTarget));
                    onReady(kind);
                  } catch {
                    onError(kind);
                  }
                }}
                onError={() => onError(kind)}
              />
            );
            return selectionLabel ? (
              <button
                type="button"
                className={seatClassName}
                data-stack-index={stackIndex}
                data-unit-index={index}
                data-run-card-unit-id={selectionId ?? undefined}
                key={selectionId ?? `${grant.unit}-${index}`}
                style={seatStyle}
                aria-label={selectionLabel}
                aria-pressed={highlighted}
                onClick={(event) => {
                  if (event.detail !== 0) return;
                  unitSelection?.onSelect(unit, index);
                }}
              >
                {sprite}
              </button>
            ) : (
              <span
                className={seatClassName}
                data-stack-index={stackIndex}
                data-unit-index={index}
                data-run-card-unit-id={selectionId ?? undefined}
                key={selectionId ?? `${grant.unit}-${index}`}
                style={seatStyle}
              >
                {sprite}
              </span>
            );
          })}
        >
          <img
            className="run-card-prototype-unit-tooltip-sprite"
            src={source}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </Tooltip>
      ) : null}
      {placements.map(({ index, stackIndex, plagued }) => plagued ? (
        <span
          className="run-card-prototype-unit-icon-seat run-card-prototype-unit-marker-seat"
          data-stack-index={stackIndex + 1}
          data-target-unit-index={index}
          style={{
            '--run-card-unit-seat-left': runCardUnitStackSeatLeft(
              stackIndex + 1,
              stackCount,
              visibleWidth,
              tuning.unitNaturalGap,
            ),
            '--run-card-unit-seat-width': `${visibleWidth.toFixed(4)}cqw`,
            zIndex: stackIndex + 2,
          } as CSSProperties}
          key={`cacochymic-${unit}-${index}`}
        >
          <Tooltip
            className="run-card-prototype-unit-marker-tooltip"
            triggerClassName="run-card-prototype-unit-marker-trigger"
            focusable={false}
            label={CACOCHYMIC_DISPLAY_NAME}
            title={CACOCHYMIC_DISPLAY_NAME}
            trigger={(
              <RunAbilityIcon
                ability="cacochymic"
                className="run-card-prototype-unit-marker"
                src={iconMedia.unitStateUrls?.cacochymic}
                onLoad={(event) => {
                  void acknowledgeDecodedImage(
                    event.currentTarget,
                    'unit-state:cacochymic',
                    onReady,
                    onError,
                  );
                }}
                onError={() => onError('unit-state:cacochymic')}
              />
            )}
          >
            <span>{CACOCHYMIC_DESCRIPTION}</span>
          </Tooltip>
        </span>
      ) : null)}
      {grant.ability
        && !emptyIndices.includes(abilityUnitIndex)
        && abilitySeatLeft !== null
        && abilityStackIndex !== undefined ? (
        <span
          className="run-card-prototype-unit-icon-seat run-card-prototype-unit-marker-seat"
          data-stack-index={abilityStackIndex}
          data-unit-state={grant.ability.state}
          style={{
            '--run-card-unit-seat-left': abilitySeatLeft,
            '--run-card-unit-seat-width': `${visibleWidth.toFixed(4)}cqw`,
            zIndex: abilityStackIndex + 1,
          } as CSSProperties}
        >
          <Tooltip
            className="run-card-prototype-unit-marker-tooltip"
            triggerClassName="run-card-prototype-unit-marker-trigger"
            focusable={false}
            label={runAbilityDisplayName(grant.ability.state)}
            title={runAbilityDisplayName(grant.ability.state)}
            trigger={(
              <RunAbilityIcon
                ability={grant.ability.state}
                className="run-card-prototype-unit-marker is-ability"
                src={iconMedia.unitStateUrls?.[grant.ability.state]}
                onLoad={(event) => {
                  void acknowledgeDecodedImage(
                    event.currentTarget,
                    runCardUnitStateImageKind(grant.ability!.state),
                    onReady,
                    onError,
                  );
                }}
                onError={() => onError(runCardUnitStateImageKind(grant.ability!.state))}
              />
            )}
          >
            <span>{runAbilityDescription(grant.ability.state, unit)}</span>
          </Tooltip>
        </span>
      ) : null}
    </>
  );
}

function grantLabel({ count, unit, emptyIndices = [], cacochymicIndices = [], ability }: RunCardGrant): string {
  const presentCount = Math.max(0, count - emptyIndices.length);
  const units = `${presentCount} ${unit}${presentCount === 1 ? '' : 's'}`;
  const plaguedCount = cacochymicIndices.filter((index) => !emptyIndices.includes(index)).length;
  const plagued = plaguedCount
    ? presentCount === 1 ? `1 ${CACOCHYMIC_DISPLAY_NAME} ${unit}` : `${units}, one ${CACOCHYMIC_DISPLAY_NAME}`
    : units;
  const withAbility = ability && !emptyIndices.includes(ability.index)
    ? `${plagued} with ${runAbilityDisplayName(ability.state)}`
    : plagued;
  const emptySeats = emptyIndices.length
    ? `; ${emptyIndices.length} empty seat${emptyIndices.length === 1 ? '' : 's'}`
    : '';
  return `${withAbility}${emptySeats}`;
}

function grantsLabel(grants: readonly RunCardGrant[]): string {
  return grants.map(grantLabel).join(', ');
}

type RunCardPresentation = Readonly<{
  signature: string;
  card: RunCardFaceContent;
  frameUrl: string;
  coinSourceUrl: string;
  artUrl: string;
  frameGeometry: RunCardFrameGeometry;
  iconMedia: RunCardIconMedia;
}>;

function runCardPresentationCanUpdateInPlace(
  current: RunCardPresentation,
  requested: RunCardPresentation,
): boolean {
  return requested.frameUrl === current.frameUrl
    && requested.coinSourceUrl === current.coinSourceUrl
    && requested.artUrl === current.artUrl
    && requested.frameGeometry.id === current.frameGeometry.id
    && JSON.stringify(requested.frameGeometry.frameSha256s) === JSON.stringify(current.frameGeometry.frameSha256s)
    && JSON.stringify(requested.iconMedia) === JSON.stringify(current.iconMedia)
    && runCardContentCanUpdateWithoutMediaLoad(current.card, requested.card);
}

async function acknowledgeDecodedImage(
  image: HTMLImageElement,
  kind: Exclude<RunCardImageKind, `unit:${number}:${PlayablePieceType}:${number}`>,
  onReady: (kind: RunCardImageKind) => void,
  onError: (kind: RunCardImageKind) => void,
): Promise<void> {
  try {
    if (typeof image.decode === 'function') await image.decode();
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) throw new Error(`${kind} image has no drawable pixels`);
    onReady(kind);
  } catch {
    onError(kind);
  }
}

function RunCardFaceLayer({
  presentation,
  pending,
  explicitContentsTuning,
  faceTuning,
  explicitIconTuning,
  frameBoxStyle,
  selectedFrameBox,
  unitHighlight,
  unitSelection,
  compactEmptySeats,
  propertyTooltipFocusable,
  onImageLoad,
  onImageError,
}: {
  presentation: RunCardPresentation;
  pending: boolean;
  explicitContentsTuning: RunCardContentsTuning | null;
  faceTuning: RunCardFaceTuning;
  explicitIconTuning: RunCardIconTuning | null;
  frameBoxStyle: RunCardFrameBoxStyle;
  selectedFrameBox: RunCardFrameBoxName | null;
  unitHighlight: RunCardUnitHighlight | null;
  unitSelection: RunCardUnitSelection | null;
  compactEmptySeats: boolean;
  propertyTooltipFocusable: boolean;
  onImageLoad: (signature: string, pending: boolean, kind: RunCardImageKind) => void;
  onImageError: (signature: string, pending: boolean, kind: RunCardImageKind) => void;
}): ReactElement {
  const { signature, card, frameUrl, coinSourceUrl, artUrl, frameGeometry, iconMedia } = presentation;
  const ledgerRows = runCardLedgerRows(card.grants.length);
  // Density belongs to this layer's card so a crossfade never restyles the
  // outgoing face with the incoming card's step.
  const densityStep = explicitContentsTuning === null
    ? runCardContentsDensityStepForCard(card, frameGeometry, faceTuning.flavorSize)
    : null;
  const contentsTuning = explicitContentsTuning ?? densityStep!.tuning;
  // Placement follows this layer's own property, so a crossfade never fits the outgoing
  // symbol with the incoming card's seat.
  const iconTuning = explicitIconTuning ?? runCardCommittedIconTuning(card.cardProperty?.id);
  const acknowledgeLoad = (kind: RunCardImageKind): void => onImageLoad(signature, pending, kind);
  const acknowledgeError = (kind: RunCardImageKind): void => onImageError(signature, pending, kind);

  return (
    <span
      className={`run-card-face-layer${pending ? ' is-pending' : ' is-presented'}`}
      data-card-presentation={signature}
      data-frame-geometry={frameGeometry.id}
      data-contents-density={densityStep?.density ?? 'explicit'}
      style={{
        ...runCardFrameGeometryVariables(frameGeometry),
        '--run-card-flavor-size': `${(faceTuning.flavorSize * contentsTuning.flavorScale).toFixed(4)}cqw`,
        '--run-card-unit-height': `${contentsTuning.unitHeight}cqw`,
        '--run-card-ledger-count-size': `${contentsTuning.countSize}cqw`,
        '--run-card-ledger-count-column': `${contentsTuning.countColumn}cqw`,
        '--run-card-ledger-column-gap': `${contentsTuning.columnGap}cqw`,
        '--run-card-ledger-row-gap': `${contentsTuning.rowGap}cqw`,
        '--run-card-contents-padding-block-start': `${contentsTuning.paddingBlockStart}cqw`,
        '--run-card-contents-padding-block-end': `${contentsTuning.paddingBlockEnd}cqw`,
        '--run-card-property-icon-x': `${iconTuning.property.x}cqw`,
        '--run-card-property-icon-y': `${iconTuning.property.y}cqw`,
        '--run-card-property-icon-scale': iconTuning.property.scale,
        '--run-card-unit-state-icon-x': `${iconTuning.unitState.x}cqw`,
        '--run-card-unit-state-icon-y': `${iconTuning.unitState.y}cqw`,
        '--run-card-unit-state-icon-scale': iconTuning.unitState.scale,
      } as CSSProperties}
      aria-hidden={pending || undefined}
    >
      <img
        className="run-card-prototype-frame"
        src={frameUrl}
        alt=""
        draggable={false}
        onLoad={(event) => {
          void acknowledgeDecodedImage(event.currentTarget, 'frame', acknowledgeLoad, acknowledgeError);
        }}
        onError={() => acknowledgeError('frame')}
      />
      <img
        className="run-card-prototype-cost-coin-source"
        src={coinSourceUrl}
        alt=""
        draggable={false}
        onLoad={(event) => {
          void acknowledgeDecodedImage(event.currentTarget, 'coin', acknowledgeLoad, acknowledgeError);
        }}
        onError={() => acknowledgeError('coin')}
      />
      <img
        className="run-card-prototype-art"
        src={artUrl}
        alt=""
        draggable={false}
        onLoad={(event) => {
          void acknowledgeDecodedImage(event.currentTarget, 'art', acknowledgeLoad, acknowledgeError);
        }}
        onError={() => acknowledgeError('art')}
      />
      <span className="run-card-prototype-name">{card.name}</span>
      {card.showsCost ? (
        <strong className="run-card-prototype-cost" aria-label={`${card.cost} gold`}>{card.cost}</strong>
      ) : null}
      <span className="run-card-prototype-type">
        <span className="run-card-prototype-type-label">{card.typeLine}</span>
        {card.cardProperty ? (
          <Tooltip
            className="run-card-prototype-property-tooltip"
            triggerClassName="run-card-prototype-property-trigger"
            popupClassName="run-card-prototype-property-popup"
            focusable={propertyTooltipFocusable && !pending}
            label={`${card.cardProperty.name} card property`}
            title={card.cardProperty.name}
            trigger={(
              <img
                className="run-card-prototype-property-icon"
                src={iconMedia.propertyUrl ?? runCardPropertyIconUrl(card.cardProperty.id)}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  void acknowledgeDecodedImage(event.currentTarget, 'property-icon', acknowledgeLoad, acknowledgeError);
                }}
                onError={() => acknowledgeError('property-icon')}
              />
            )}
          >
            <span>{card.cardProperty.effect}</span>
          </Tooltip>
        ) : null}
      </span>
      <span className={`run-card-prototype-contents is-ledger-${ledgerRows}-rows`}>
        <span
          className={`run-card-prototype-ledger is-${card.grants.length}-cells`}
          data-cell-count={card.grants.length}
          aria-label="Card contents"
        >
          {card.grants.map((grant, cell) => {
            const emptyIndices = grant.emptyIndices ?? [];
            const stackLayout = runCardUnitStackLayout(grant, compactEmptySeats);
            return (
              <span
                className="run-card-prototype-ledger-row"
                aria-label={grantLabel(grant)}
                key={grant.unit}
              >
                <strong className="run-card-prototype-ledger-count" aria-hidden="true">
                  {Math.max(0, grant.count - emptyIndices.length)}
                </strong>
                <span
                  className="run-card-prototype-unit-stack"
                  aria-hidden={unitSelection ? undefined : true}
                  onPointerMove={pending || !unitSelection ? undefined : (event) => {
                    const target = runCardUnitStackPointerTarget(event.currentTarget, event.clientX, event.clientY);
                    setRunCardUnitStackPointerTarget(event.currentTarget, target);
                  }}
                  onPointerLeave={pending || !unitSelection ? undefined : (event) => {
                    setRunCardUnitStackPointerTarget(event.currentTarget, null);
                  }}
                  onClick={pending || !unitSelection ? undefined : (event) => {
                    if (event.detail === 0) return;
                    const target = runCardUnitStackPointerTarget(event.currentTarget, event.clientX, event.clientY);
                    if (!target) return;
                    event.preventDefault();
                    const selectedIndex = Number(target.dataset.unitIndex);
                    if (Number.isSafeInteger(selectedIndex)) unitSelection.onSelect(grant.unit, selectedIndex);
                  }}
                >
                  <UnitGrantStack
                    cell={cell}
                    grant={grant}
                    iconMedia={iconMedia}
                    stackLayout={stackLayout}
                    pending={pending}
                    unitHighlight={unitHighlight}
                    unitSelection={unitSelection}
                    tuning={contentsTuning}
                    onReady={acknowledgeLoad}
                    onError={acknowledgeError}
                  />
                </span>
              </span>
            );
          })}
        </span>
        <span className="run-card-prototype-flavor">{card.flavor}</span>
      </span>
      {frameBoxStyle !== 'off' ? (
        <span className={`run-card-frame-box-overlay is-${frameBoxStyle}`} aria-hidden="true">
          {RUN_CARD_FRAME_BOX_NAMES.map((name) => (
            <span
              className={`run-card-frame-box is-${name}${selectedFrameBox === name ? ' is-selected' : ''}`}
              data-frame-box={name}
              key={name}
            >
              <span className="run-card-frame-box-tag">{name}</span>
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The one Run trading-card face used by both the Studio instrument and live play.
 * Hosts choose only the immutable frame/art URLs and interaction around the face.
 * Without an explicit contentsTuning, each card derives its reviewed density
 * step from its own load (ADR-0270); only Studio experiments pass one.
 */
export function RunCardFace({
  card,
  frameUrl,
  artUrl,
  coinSourceUrl = resolvedLiveMediaUrl(RUN_CARD_COST_COIN_SOURCE_SLOT),
  iconMedia = EMPTY_RUN_CARD_ICON_MEDIA,
  iconTuning = null,
  width = '100%',
  tuning = RUN_CARD_APPROVED_TUNING,
  contentsTuning = null,
  frameGeometry = RUN_CARD_STANDARD_FRAME_GEOMETRY,
  frameBoxStyle = 'off',
  selectedFrameBox = null,
  unitHighlight = null,
  unitSelection = null,
  compactEmptySeats = false,
  onImageLoad = () => undefined,
  onImageError = () => undefined,
  ariaHidden = false,
  propertyTooltipFocusable = true,
}: {
  card: RunCardFaceContent;
  frameUrl: string;
  artUrl: string;
  coinSourceUrl?: string;
  iconMedia?: RunCardIconMedia;
  /** Only the Studio fitting instrument overrides the committed placements. */
  iconTuning?: RunCardIconTuning | null;
  width?: string;
  tuning?: RunCardFaceTuning;
  contentsTuning?: RunCardContentsTuning | null;
  frameGeometry?: RunCardFrameGeometry;
  frameBoxStyle?: RunCardFrameBoxStyle;
  selectedFrameBox?: RunCardFrameBoxName | null;
  /** Transactional hosts may mark one exact unit without changing canonical face content. */
  unitHighlight?: RunCardUnitHighlight | null;
  /** Transactional hosts may make occupied unit figures directly selectable. */
  unitSelection?: RunCardUnitSelection | null;
  /** Expunctio may compose the exact post-sale stack instead of retaining vacant authored seats. */
  compactEmptySeats?: boolean;
  onImageLoad?: (kind: RunCardImageKind) => void;
  onImageError?: (kind: RunCardImageKind) => void;
  ariaHidden?: boolean;
  propertyTooltipFocusable?: boolean;
}): ReactElement {
  const requestedSignature = runCardPresentationSignature(card, frameUrl, artUrl, frameGeometry, coinSourceUrl, iconMedia);
  // The signature contains every presentation field, so equal signatures are
  // equivalent even when a host recreates its card object on another render.
  // Boxes are layout, not identity: retuning them must reach the face without
  // starting a media crossfade, so they key the memo but stay out of the signature.
  const boxesKey = JSON.stringify(frameGeometry.boxes);
  const requested = useMemo<RunCardPresentation>(() => ({
    signature: requestedSignature,
    card,
    frameUrl,
    coinSourceUrl,
    artUrl,
    frameGeometry,
    iconMedia,
  }), [requestedSignature, boxesKey]);
  const [displayed, setDisplayed] = useState<RunCardPresentation>(requested);
  const [displayedLayerKey, setDisplayedLayerKey] = useState('run-card-layer:0');
  const [pending, setPending] = useState<RunCardPresentation | null>(null);
  const [pendingLayerKey, setPendingLayerKey] = useState<string | null>(null);
  const [pendingSettled, setPendingSettled] = useState<ReadonlySet<RunCardImageKind>>(() => new Set());
  const displayedRef = useRef(displayed);
  const pendingRef = useRef(pending);
  const promotionFramesRef = useRef<number[]>([]);
  const layerSequenceRef = useRef(0);
  displayedRef.current = displayed;
  pendingRef.current = pending;

  const cancelPromotion = useCallback((): void => {
    for (const frame of promotionFramesRef.current) cancelAnimationFrame(frame);
    promotionFramesRef.current = [];
  }, []);

  useEffect(() => cancelPromotion, [cancelPromotion]);

  useEffect(() => {
    cancelPromotion();
    if (requested.signature === displayed.signature) {
      // Same media, retuned boxes: apply the new layout in place, no crossfade.
      if (requested !== displayedRef.current) setDisplayed(requested);
      setPending(null);
      setPendingLayerKey(null);
      setPendingSettled(new Set());
      return;
    }
    if (runCardPresentationCanUpdateInPlace(displayed, requested)) {
      setDisplayed(requested);
      setPending(null);
      setPendingLayerKey(null);
      setPendingSettled(new Set());
      return;
    }
    layerSequenceRef.current += 1;
    setPending(requested);
    setPendingLayerKey(`run-card-layer:${layerSequenceRef.current}`);
    setPendingSettled(new Set());
  }, [cancelPromotion, displayed.signature, requested]);

  const settlePending = useCallback((signature: string, kind: RunCardImageKind): void => {
    if (pendingRef.current?.signature !== signature) return;
    setPendingSettled((current) => current.has(kind) ? current : new Set([...current, kind]));
  }, []);

  const handleImageLoad = useCallback((
    signature: string,
    isPending: boolean,
    kind: RunCardImageKind,
  ): void => {
    if (isPending) {
      if (pendingRef.current?.signature !== signature) return;
      onImageLoad(kind);
      settlePending(signature, kind);
      return;
    }
    if (displayedRef.current.signature === signature) onImageLoad(kind);
  }, [onImageLoad, settlePending]);

  const handleImageError = useCallback((
    signature: string,
    isPending: boolean,
    kind: RunCardImageKind,
  ): void => {
    if (isPending) {
      if (pendingRef.current?.signature !== signature) return;
      onImageError(kind);
      settlePending(signature, kind);
      return;
    }
    if (displayedRef.current.signature === signature) onImageError(kind);
  }, [onImageError, settlePending]);

  useEffect(() => {
    cancelPromotion();
    if (!pending || !pendingLayerKey) return undefined;
    if (!runCardPresentationCanPromote(
      pending.signature,
      pendingRef.current?.signature ?? null,
      pending.card,
      pendingSettled,
    )) return undefined;
    const signature = pending.signature;
    const readyLayerKey = pendingLayerKey;
    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        promotionFramesRef.current = [];
        const ready = pendingRef.current;
        if (!ready || ready.signature !== signature) return;
        setDisplayed(ready);
        setDisplayedLayerKey(readyLayerKey);
        setPending(null);
        setPendingLayerKey(null);
        setPendingSettled(new Set());
      });
      promotionFramesRef.current = [secondFrame];
    });
    promotionFramesRef.current = [firstFrame];
    return cancelPromotion;
  }, [cancelPromotion, pending, pendingLayerKey, pendingSettled]);

  const updatesInCurrentFrame = requested.signature !== displayed.signature
    && runCardPresentationCanUpdateInPlace(displayed, requested);
  const presented = updatesInCurrentFrame ? requested : displayed;
  const visiblePending = updatesInCurrentFrame ? null : pending;
  const layers = visiblePending
    ? [
        { key: displayedLayerKey, presentation: presented, pending: false },
        { key: pendingLayerKey!, presentation: visiblePending, pending: true },
      ]
    : [{ key: displayedLayerKey, presentation: presented, pending: false }];

  return (
    <span
      className="run-card-prototype run-card-face"
      style={{
        '--run-card-prototype-width': width,
        // The reading is sized to the coin's face, so a two-digit cost stops
        // crowding the rim while a one-digit cost keeps the approved size.
        '--run-card-cost-size': `${runCardCostSizeCqw(presented.card.cost, tuning.costSize)}cqw`,
        '--run-card-title-size': `${tuning.titleSize}cqw`,
        '--run-card-type-size': `${tuning.typeSize}cqw`,
        '--run-card-text-inset': `${tuning.textInset}cqw`,
        '--run-card-text-ink-centre': tuning.textInkCentre,
      } as CSSProperties}
      aria-hidden={ariaHidden || undefined}
      aria-busy={visiblePending ? true : undefined}
      data-frame-geometry={presented.frameGeometry.id}
      aria-label={ariaHidden ? undefined : `${presented.card.name}. ${presented.card.typeLine}${presented.card.cardProperty ? `, ${presented.card.cardProperty.name}: ${presented.card.cardProperty.effect}` : ''}.${presented.card.showsCost ? ` Costs ${presented.card.cost} gold.` : ''} Grants ${grantsLabel(presented.card.grants)}.`}
    >
      {layers.map((layer) => (
        <RunCardFaceLayer
          key={layer.key}
          presentation={layer.presentation}
          pending={layer.pending}
          explicitContentsTuning={contentsTuning}
          faceTuning={tuning}
          explicitIconTuning={iconTuning}
          frameBoxStyle={frameBoxStyle}
          selectedFrameBox={selectedFrameBox}
          unitHighlight={unitHighlight}
          unitSelection={unitSelection}
          compactEmptySeats={compactEmptySeats}
          propertyTooltipFocusable={propertyTooltipFocusable}
          onImageLoad={handleImageLoad}
          onImageError={handleImageError}
        />
      ))}
    </span>
  );
}
