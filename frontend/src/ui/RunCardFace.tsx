import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { paletteForSide, pieceSpritePath, type PlayablePieceType } from '../core/pieces';
import { CACOCHYMIC_DISPLAY_NAME, runAbilityDisplayName, type RunAbility } from '../run/model';
import {
  RUN_CARD_FRAME_BOX_NAMES,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
  runCardFrameGeometryVariables,
  type RunCardFrameGeometry,
} from './runCardFrameGeometry';
import { RunAbilityIcon } from './shared/RunAbilityIcon';
import { Tooltip } from './shared/InfoTip';

export const RUN_CARD_FRAME_SLOT = 'ui/run/card-prototypes/frame-v1.png';
export const RUN_CARD_PESTIFEROUS_FRAME_SLOT = 'ui/run/card-prototypes/pestiferous-frame-v1.png';
export const RUN_CARD_PLAGUED_ICON_SLOT = 'ui/run/card-status/plagued-v1.png';
export const RUN_CARD_PLAGUED_ICON_PLACEHOLDER = '◇';
export const RUN_CARD_CONCINNOUS_FRAME_SLOT = 'ui/run/card-prototypes/concinnous-frame-v1.png';
export const RUN_CARD_TACTICAL_FRAME_SLOT = 'ui/run/card-prototypes/tactical-discipline-frame-v1.png';
export const RUN_CARD_HIERATIC_FRAME_SLOT = 'ui/run/card-prototypes/hieratic-frame-v1.png';
export const RUN_CARD_COST_COIN_SOURCE_SLOT = 'ui/run/card-prototypes/cost-coin-source-v1.png';
export const RUN_CARD_REFERENCE_WIDTH = 360;

const PLAYER_CARD_PALETTE = paletteForSide('player');
const PLAYER_CARD_FACING = 'south';

export type RunCardProperty = 'pestiferous' | 'concinnous' | 'tactical' | 'hieratic';
export type RunUnitState = RunAbility | 'plagued';

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

export type RunCardIconTuning = Readonly<{
  property: RunCardIconPlacement;
  unitState: RunCardIconPlacement;
}>;

export const RUN_CARD_ICON_PLACEMENT_BASELINE: RunCardIconPlacement = Object.freeze({
  x: 0,
  y: 0,
  scale: 1,
});

export const RUN_CARD_ICON_TUNING_BASELINE: RunCardIconTuning = Object.freeze({
  property: RUN_CARD_ICON_PLACEMENT_BASELINE,
  unitState: RUN_CARD_ICON_PLACEMENT_BASELINE,
});

export type RunCardImageKind =
  | 'frame'
  | 'coin'
  | 'art'
  | 'property-icon'
  | `unit-state:${RunUnitState}`
  | `unit:${number}:${PlayablePieceType}:${number}`;

export type RunCardFaceContent = Readonly<{
  name: string;
  cost: number;
  typeLine: string;
  cardProperty?: Readonly<{
    id: RunCardProperty;
    name: string;
    effect: string;
  }>;
  grants: readonly Readonly<{
    count: number;
    unit: PlayablePieceType;
    plaguedIndices?: readonly number[];
    ability?: RunAbility;
  }>[];
  properties?: readonly Readonly<{ name: string; target: string }>[];
  rules?: string;
  flavor: string;
}>;

export type RunCardFaceTuning = Readonly<{
  costX: number;
  costY: number;
  costSize: number;
  titleX: number;
  titleY: number;
  titleSize: number;
  typeX: number;
  typeY: number;
  typeSize: number;
  flavorSize: number;
}>;

export type RunCardContentsTuning = Readonly<{
  unitHeight: number;
  unitNaturalGap: number;
  countSize: number;
  countColumn: number;
  columnGap: number;
  rowGap: number;
  effectSize: number;
  effectGap: number;
  flavorScale: number;
  paddingBlockStart: number;
  paddingBlockEnd: number;
}>;

/** Owner-approved Card Layout handoff, measured in percent of the card width. */
export const RUN_CARD_APPROVED_TUNING: RunCardFaceTuning = Object.freeze({
  titleSize: 6.85,
  titleX: 1.35,
  titleY: 0,
  typeSize: 5.3,
  typeX: 1.35,
  typeY: 1.2,
  costSize: 6.2,
  costX: 0,
  costY: 0,
  flavorSize: 5,
});

/** The Contents Box base values every density step overrides. Hosts get the load-derived ladder below. */
export const RUN_CARD_DEFAULT_CONTENTS_TUNING: RunCardContentsTuning = Object.freeze({
  unitHeight: 9,
  unitNaturalGap: .8,
  countSize: 4,
  countColumn: 4.5,
  columnGap: 2,
  rowGap: .8,
  effectSize: 2.75,
  effectGap: .7,
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
const EFFECT_LINE_HEIGHT = 1.12;

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
  const effectLine = tuning.effectSize * EFFECT_LINE_HEIGHT;
  const rules = card.rules
    ? tuning.effectGap + estimatedLineCount(card.rules, tuning.effectSize, lineWidthCqw) * effectLine
    : 0;
  const propertyCount = card.properties?.length ?? 0;
  const properties = propertyCount
    ? tuning.effectGap * propertyCount + propertyCount * effectLine
    : 0;
  const flavorSize = flavorSizeCqw * tuning.flavorScale;
  const flavor = estimatedLineCount(card.flavor, flavorSize, lineWidthCqw) * flavorSize * FLAVOR_LINE_HEIGHT;
  return tuning.paddingBlockStart + ledger + rules + properties + flavor + tuning.paddingBlockEnd;
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

export function requiredRunCardImageKinds(
  card: RunCardFaceContent,
  iconMedia: RunCardIconMedia = EMPTY_RUN_CARD_ICON_MEDIA,
): readonly RunCardImageKind[] {
  const stateKinds = new Set<RunCardImageKind>();
  for (const grant of card.grants) {
    if (grant.ability && iconMedia.unitStateUrls?.[grant.ability]) stateKinds.add(`unit-state:${grant.ability}`);
    if (grant.plaguedIndices?.length && iconMedia.unitStateUrls?.plagued) stateKinds.add('unit-state:plagued');
  }
  return [
    'frame',
    'coin',
    'art',
    ...(card.cardProperty && iconMedia.propertyUrl ? ['property-icon' as const] : []),
    ...stateKinds,
    ...card.grants.flatMap((grant, cell) => (
      Array.from({ length: grant.count }, (_, index) => runCardUnitImageKind(cell, grant.unit, index))
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
    card.typeLine,
    card.cardProperty ? [card.cardProperty.id, card.cardProperty.name, card.cardProperty.effect] : null,
    iconMedia.propertyUrl ?? null,
    iconMedia.unitStateUrls ?? null,
    card.grants.map(({ count, unit, plaguedIndices, ability }) => [count, unit, plaguedIndices ?? [], ability ?? null]),
    card.properties?.map(({ name, target }) => [name, target]) ?? null,
    card.rules ?? null,
    card.flavor,
  ]);
}

export function runCardPresentationCanPromote(
  requestedSignature: string,
  pendingSignature: string | null,
  card: RunCardFaceContent,
  settled: ReadonlySet<RunCardImageKind>,
  iconMedia: RunCardIconMedia = EMPTY_RUN_CARD_ICON_MEDIA,
): boolean {
  return requestedSignature === pendingSignature
    && requiredRunCardImageKinds(card, iconMedia).every((kind) => settled.has(kind));
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
  let minX = canvas.width;
  let maxX = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[((y * canvas.width + x) * 4) + 3] <= 8) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  if (maxX < minX) throw new Error('unit sprite contains no visible pixels');
  const measured = Object.freeze({
    canvasWidthPerHeight: canvas.width / canvas.height,
    opaqueLeftPerHeight: minX / canvas.height,
    opaqueWidthPerHeight: (maxX - minX + 1) / canvas.height,
  });
  unitSpriteMetrics.set(source, measured);
  return measured;
}

function UnitStackSprite({
  cell,
  unit,
  index,
  stackIndex,
  stackCount,
  plagued,
  plaguedIconUrl,
  ability,
  abilityIconUrl,
  abilityStackIndex,
  tuning,
  onReady,
  onError,
}: {
  cell: number;
  unit: PlayablePieceType;
  index: number;
  stackIndex: number;
  stackCount: number;
  plagued: boolean;
  plaguedIconUrl?: string;
  ability?: RunAbility;
  abilityIconUrl?: string;
  abilityStackIndex?: number;
  tuning: RunCardContentsTuning;
  onReady: (kind: RunCardImageKind) => void;
  onError: (kind: RunCardImageKind) => void;
}): ReactElement {
  const [metrics, setMetrics] = useState<UnitSpriteMetrics | null>(null);
  const kind = runCardUnitImageKind(cell, unit, index);
  const source = pieceSpritePath(unit, PLAYER_CARD_PALETTE, PLAYER_CARD_FACING);
  const visibleWidth = metrics ? metrics.opaqueWidthPerHeight * tuning.unitHeight : 0;
  const canvasWidth = metrics ? metrics.canvasWidthPerHeight * tuning.unitHeight : 0;
  const canvasLeft = metrics ? -metrics.opaqueLeftPerHeight * tuning.unitHeight : 0;
  const seatLeft = runCardUnitStackSeatLeft(
    stackIndex,
    stackCount,
    visibleWidth,
    tuning.unitNaturalGap,
  );
  const markerSeatLeft = runCardUnitStackSeatLeft(
    stackIndex + 1,
    stackCount,
    visibleWidth,
    tuning.unitNaturalGap,
  );
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
      <span
        className={`run-card-prototype-unit-icon-seat${plagued ? ' is-plagued' : ''}`}
        data-stack-index={stackIndex}
        style={{
          '--run-card-unit-canvas-left': `${canvasLeft.toFixed(4)}cqw`,
          '--run-card-unit-canvas-width': `${canvasWidth.toFixed(4)}cqw`,
          '--run-card-unit-seat-left': seatLeft,
          '--run-card-unit-seat-width': `${visibleWidth.toFixed(4)}cqw`,
          zIndex: stackIndex + 1,
        } as CSSProperties}
      >
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
      </span>
      {plagued ? (
        <span
          className="run-card-prototype-unit-icon-seat run-card-prototype-unit-marker-seat"
          data-stack-index={stackIndex + 1}
          data-target-unit-index={index}
          style={{
            '--run-card-unit-seat-left': markerSeatLeft,
            '--run-card-unit-seat-width': `${visibleWidth.toFixed(4)}cqw`,
            zIndex: stackIndex + 2,
          } as CSSProperties}
        >
          {plaguedIconUrl ? (
            <img
              aria-hidden="true"
              className="run-card-prototype-unit-marker"
              src={plaguedIconUrl}
              alt=""
              draggable={false}
              onLoad={() => onReady('unit-state:plagued')}
              onError={() => onError('unit-state:plagued')}
            />
          ) : (
            <span
              aria-hidden="true"
              className="run-card-prototype-unit-marker is-placeholder"
              data-live-media-slot={RUN_CARD_PLAGUED_ICON_SLOT}
            >
              {RUN_CARD_PLAGUED_ICON_PLACEHOLDER}
            </span>
          )}
        </span>
      ) : null}
      {ability && abilitySeatLeft !== null && abilityStackIndex !== undefined ? (
        <span
          className="run-card-prototype-unit-icon-seat run-card-prototype-unit-marker-seat"
          data-stack-index={abilityStackIndex}
          data-unit-state={ability}
          style={{
            '--run-card-unit-seat-left': abilitySeatLeft,
            '--run-card-unit-seat-width': `${visibleWidth.toFixed(4)}cqw`,
            zIndex: abilityStackIndex + 1,
          } as CSSProperties}
        >
          <RunAbilityIcon
            ability={ability}
            className="run-card-prototype-unit-marker is-ability"
            src={abilityIconUrl}
            onLoad={(event) => {
              void acknowledgeDecodedImage(
                event.currentTarget,
                runCardUnitStateImageKind(ability),
                onReady,
                onError,
              );
            }}
            onError={() => onError(runCardUnitStateImageKind(ability))}
          />
        </span>
      ) : null}
    </>
  );
}

function grantLabel({
  count,
  unit,
  plaguedIndices = [],
  ability,
}: RunCardFaceContent['grants'][number]): string {
  const units = `${count} ${unit}${count === 1 ? '' : 's'}`;
  const plagued = plaguedIndices.length
    ? count === 1 ? `1 ${CACOCHYMIC_DISPLAY_NAME} ${unit}` : `${units}, one ${CACOCHYMIC_DISPLAY_NAME}`
    : units;
  return ability ? `${plagued} with ${runAbilityDisplayName(ability)}` : plagued;
}

function grantsLabel(grants: RunCardFaceContent['grants']): string {
  return grants.map(grantLabel).join(', ');
}

function propertiesLabel(properties: RunCardFaceContent['properties']): string {
  return properties?.map(({ name, target }) => `${name}: ${target}`).join('. ') ?? '';
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
  showFrameBoxes,
  propertyTooltipFocusable,
  onImageLoad,
  onImageError,
}: {
  presentation: RunCardPresentation;
  pending: boolean;
  explicitContentsTuning: RunCardContentsTuning | null;
  faceTuning: RunCardFaceTuning;
  showFrameBoxes: boolean;
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
        '--run-card-effect-size': `${contentsTuning.effectSize}cqw`,
        '--run-card-effect-gap': `${contentsTuning.effectGap}cqw`,
        '--run-card-contents-padding-block-start': `${contentsTuning.paddingBlockStart}cqw`,
        '--run-card-contents-padding-block-end': `${contentsTuning.paddingBlockEnd}cqw`,
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
      <strong className="run-card-prototype-cost" aria-label={`${card.cost} gold`}>{card.cost}</strong>
      <span className="run-card-prototype-type">
        <span className="run-card-prototype-type-label">{card.typeLine}</span>
        {card.cardProperty && iconMedia.propertyUrl ? (
          <Tooltip
            className="run-card-prototype-property-tooltip"
            triggerClassName="run-card-prototype-property-trigger"
            popupClassName="run-card-prototype-property-popup"
            focusable={propertyTooltipFocusable && !pending}
            label={`${card.cardProperty.name} card property`}
            trigger={(
              <img
                className="run-card-prototype-property-icon"
                src={iconMedia.propertyUrl}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  void acknowledgeDecodedImage(event.currentTarget, 'property-icon', acknowledgeLoad, acknowledgeError);
                }}
                onError={() => acknowledgeError('property-icon')}
              />
            )}
          >
            <strong>{card.cardProperty.name}</strong> · {card.cardProperty.effect}
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
            const plaguedIndices = grant.plaguedIndices ?? [];
            const stackCount = grant.count + plaguedIndices.length + (grant.ability ? 1 : 0);
            const abilityStackIndex = grant.ability ? stackCount - 1 : undefined;
            return (
              <span
                className="run-card-prototype-ledger-row"
                aria-label={grantLabel(grant)}
                key={grant.unit}
              >
                <strong className="run-card-prototype-ledger-count" aria-hidden="true">{grant.count}</strong>
                <span className="run-card-prototype-unit-stack" aria-hidden="true">
                  {Array.from({ length: grant.count }, (_, index) => (
                    <UnitStackSprite
                      ability={index === grant.count - 1 ? grant.ability : undefined}
                      abilityIconUrl={index === grant.count - 1 && grant.ability
                        ? iconMedia.unitStateUrls?.[grant.ability]
                        : undefined}
                      abilityStackIndex={index === grant.count - 1 ? abilityStackIndex : undefined}
                      cell={cell}
                      index={index}
                      key={`${grant.unit}-${index}`}
                      unit={grant.unit}
                      plagued={plaguedIndices.includes(index)}
                      plaguedIconUrl={iconMedia.unitStateUrls?.plagued}
                      stackCount={stackCount}
                      stackIndex={index + plaguedIndices.filter((plaguedIndex) => plaguedIndex < index).length}
                      tuning={contentsTuning}
                      onReady={acknowledgeLoad}
                      onError={acknowledgeError}
                    />
                  ))}
                </span>
              </span>
            );
          })}
        </span>
        {card.rules ? <span className="run-card-prototype-effect">{card.rules}</span> : null}
        {card.properties?.length ? (
          <span className="run-card-prototype-properties" aria-label="Card properties">
            {card.properties.map((property) => (
              <span className="run-card-prototype-property" key={property.name}>
                <strong>{property.name}</strong>
                <span>{property.target}</span>
              </span>
            ))}
          </span>
        ) : null}
        <span className="run-card-prototype-flavor">{card.flavor}</span>
      </span>
      {showFrameBoxes ? (
        <span className="run-card-frame-box-overlay" aria-hidden="true">
          {RUN_CARD_FRAME_BOX_NAMES.map((name) => (
            <span className={`run-card-frame-box is-${name}`} key={name}>{name}</span>
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
  iconTuning = RUN_CARD_ICON_TUNING_BASELINE,
  width = '100%',
  tuning = RUN_CARD_APPROVED_TUNING,
  contentsTuning = null,
  frameGeometry = RUN_CARD_STANDARD_FRAME_GEOMETRY,
  showFrameBoxes = false,
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
  iconTuning?: RunCardIconTuning;
  width?: string;
  tuning?: RunCardFaceTuning;
  contentsTuning?: RunCardContentsTuning | null;
  frameGeometry?: RunCardFrameGeometry;
  showFrameBoxes?: boolean;
  onImageLoad?: (kind: RunCardImageKind) => void;
  onImageError?: (kind: RunCardImageKind) => void;
  ariaHidden?: boolean;
  propertyTooltipFocusable?: boolean;
}): ReactElement {
  const requestedSignature = runCardPresentationSignature(card, frameUrl, artUrl, frameGeometry, coinSourceUrl, iconMedia);
  // The signature contains every presentation field, so equal signatures are
  // equivalent even when a host recreates its card object on another render.
  const requested = useMemo<RunCardPresentation>(() => ({
    signature: requestedSignature,
    card,
    frameUrl,
    coinSourceUrl,
    artUrl,
    frameGeometry,
    iconMedia,
  }), [requestedSignature]);
  const [displayed, setDisplayed] = useState<RunCardPresentation>(requested);
  const [pending, setPending] = useState<RunCardPresentation | null>(null);
  const [pendingSettled, setPendingSettled] = useState<ReadonlySet<RunCardImageKind>>(() => new Set());
  const displayedRef = useRef(displayed);
  const pendingRef = useRef(pending);
  const promotionFramesRef = useRef<number[]>([]);
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
      setPending(null);
      setPendingSettled(new Set());
      return;
    }
    setPending(requested);
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
    if (!pending) return undefined;
    if (!runCardPresentationCanPromote(
      pending.signature,
      pendingRef.current?.signature ?? null,
      pending.card,
      pendingSettled,
      pending.iconMedia,
    )) return undefined;
    const signature = pending.signature;
    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        promotionFramesRef.current = [];
        const ready = pendingRef.current;
        if (!ready || ready.signature !== signature) return;
        setDisplayed(ready);
        setPending(null);
        setPendingSettled(new Set());
      });
      promotionFramesRef.current = [secondFrame];
    });
    promotionFramesRef.current = [firstFrame];
    return cancelPromotion;
  }, [cancelPromotion, pending, pendingSettled]);

  const layers = pending
    ? [
        { presentation: displayed, pending: false },
        { presentation: pending, pending: true },
      ]
    : [{ presentation: displayed, pending: false }];

  return (
    <span
      className="run-card-prototype run-card-face"
      style={{
        '--run-card-prototype-width': width,
        '--run-card-cost-x': `${tuning.costX}cqw`,
        '--run-card-cost-y': `${tuning.costY}cqw`,
        '--run-card-cost-size': `${tuning.costSize}cqw`,
        '--run-card-title-x': `${tuning.titleX}cqw`,
        '--run-card-title-y': `${tuning.titleY}cqw`,
        '--run-card-title-size': `${tuning.titleSize}cqw`,
        '--run-card-type-x': `${tuning.typeX}cqw`,
        '--run-card-type-y': `${tuning.typeY}cqw`,
        '--run-card-type-size': `${tuning.typeSize}cqw`,
        '--run-card-property-icon-x': `${iconTuning.property.x}cqw`,
        '--run-card-property-icon-y': `${iconTuning.property.y}cqw`,
        '--run-card-property-icon-scale': iconTuning.property.scale,
        '--run-card-unit-state-icon-x': `${iconTuning.unitState.x}cqw`,
        '--run-card-unit-state-icon-y': `${iconTuning.unitState.y}cqw`,
        '--run-card-unit-state-icon-scale': iconTuning.unitState.scale,
      } as CSSProperties}
      aria-hidden={ariaHidden || undefined}
      aria-busy={pending ? true : undefined}
      data-frame-geometry={displayed.frameGeometry.id}
      aria-label={ariaHidden ? undefined : `${displayed.card.name}. ${displayed.card.typeLine}${displayed.card.cardProperty ? `, ${displayed.card.cardProperty.name}: ${displayed.card.cardProperty.effect}` : ''}. Costs ${displayed.card.cost} gold. Grants ${grantsLabel(displayed.card.grants)}.${displayed.card.properties?.length ? ` ${propertiesLabel(displayed.card.properties)}.` : ''}`}
    >
      {layers.map((layer) => (
        <RunCardFaceLayer
          key={layer.presentation.signature}
          presentation={layer.presentation}
          pending={layer.pending}
          explicitContentsTuning={contentsTuning}
          faceTuning={tuning}
          showFrameBoxes={showFrameBoxes}
          propertyTooltipFocusable={propertyTooltipFocusable}
          onImageLoad={handleImageLoad}
          onImageError={handleImageError}
        />
      ))}
    </span>
  );
}
