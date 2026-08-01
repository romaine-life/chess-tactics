import { useState, type CSSProperties, type ReactElement } from 'react';
import { paletteForSide, pieceSpritePath, type PlayablePieceType } from '../core/pieces';

export const RUN_CARD_FRAME_SLOT = 'ui/run/card-prototypes/frame-v1.png';
export const RUN_CARD_PESTIFEROUS_FRAME_SLOT = 'ui/run/card-prototypes/pestiferous-frame-v1.png';
export const RUN_CARD_PLAGUED_ICON_SLOT = 'ui/run/card-status/plagued-v1.png';
export const RUN_CARD_PLAGUED_ICON_PLACEHOLDER = '◇';
export const RUN_CARD_REFERENCE_WIDTH = 360;

const PLAYER_CARD_PALETTE = paletteForSide('player');
const PLAYER_CARD_FACING = 'south';

export type RunCardImageKind = 'frame' | 'art' | `unit:${number}:${PlayablePieceType}:${number}`;

export type RunCardFaceContent = Readonly<{
  name: string;
  cost: number;
  typeLine: string;
  grants: readonly Readonly<{
    count: number;
    unit: PlayablePieceType;
    plaguedIndices?: readonly number[];
  }>[];
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
  typeY: .65,
  costSize: 6.2,
  costX: 0,
  costY: .3,
  flavorSize: 5,
});

/** The accepted fixed Contents Box treatment. Experiments opt in through the Studio only. */
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

export const runCardUnitImageKind = (
  cell: number,
  unit: PlayablePieceType,
  index: number,
): RunCardImageKind => `unit:${cell}:${unit}:${index}`;

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
          <span
            aria-hidden="true"
            className="run-card-prototype-unit-marker is-placeholder"
            data-live-media-slot={RUN_CARD_PLAGUED_ICON_SLOT}
          >
            {RUN_CARD_PLAGUED_ICON_PLACEHOLDER}
          </span>
        </span>
      ) : null}
    </>
  );
}

function grantLabel({
  count,
  unit,
  plaguedIndices = [],
}: RunCardFaceContent['grants'][number]): string {
  const units = `${count} ${unit}${count === 1 ? '' : 's'}`;
  if (!plaguedIndices.length) return units;
  return count === 1 ? `1 Plagued ${unit}` : `${units}, one Plagued`;
}

function grantsLabel(grants: RunCardFaceContent['grants']): string {
  return grants.map(grantLabel).join(', ');
}

/**
 * The one Run trading-card face used by both the Studio instrument and live play.
 * Hosts choose only the immutable frame/art URLs and interaction around the face.
 */
export function RunCardFace({
  card,
  frameUrl,
  artUrl,
  width = '100%',
  tuning = RUN_CARD_APPROVED_TUNING,
  contentsTuning = RUN_CARD_DEFAULT_CONTENTS_TUNING,
  onImageLoad = () => undefined,
  onImageError = () => undefined,
  ariaHidden = false,
}: {
  card: RunCardFaceContent;
  frameUrl: string;
  artUrl: string;
  width?: string;
  tuning?: RunCardFaceTuning;
  contentsTuning?: RunCardContentsTuning;
  onImageLoad?: (kind: RunCardImageKind) => void;
  onImageError?: (kind: RunCardImageKind) => void;
  ariaHidden?: boolean;
}): ReactElement {
  const ledgerRows = card.grants.length <= 2
    ? card.grants.length
    : Math.ceil(card.grants.length / 2);

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
        '--run-card-flavor-size': `${(tuning.flavorSize * contentsTuning.flavorScale).toFixed(4)}cqw`,
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
      aria-hidden={ariaHidden || undefined}
      aria-label={ariaHidden ? undefined : `${card.name}. ${card.typeLine}. Costs ${card.cost} gold. Grants ${grantsLabel(card.grants)}.`}
    >
      <img
        className="run-card-prototype-frame"
        src={frameUrl}
        alt=""
        draggable={false}
        onLoad={() => onImageLoad('frame')}
        onError={() => onImageError('frame')}
      />
      <img
        className="run-card-prototype-art"
        src={artUrl}
        alt=""
        draggable={false}
        onLoad={() => onImageLoad('art')}
        onError={() => onImageError('art')}
      />
      <span className="run-card-prototype-name">{card.name}</span>
      <strong className="run-card-prototype-cost" aria-label={`${card.cost} gold`}>{card.cost}</strong>
      <span className="run-card-prototype-type">{card.typeLine}</span>
      <span className={`run-card-prototype-contents is-ledger-${ledgerRows}-rows`}>
        <span
          className={`run-card-prototype-ledger is-${card.grants.length}-cells`}
          data-cell-count={card.grants.length}
          aria-label="Card contents"
        >
          {card.grants.map((grant, cell) => (
            <span
              className="run-card-prototype-ledger-row"
              aria-label={grantLabel(grant)}
              key={grant.unit}
            >
              <strong className="run-card-prototype-ledger-count" aria-hidden="true">{grant.count}</strong>
              <span className="run-card-prototype-unit-stack" aria-hidden="true">
                {Array.from({ length: grant.count }, (_, index) => (
                  <UnitStackSprite
                    cell={cell}
                    index={index}
                    key={`${grant.unit}-${index}`}
                    unit={grant.unit}
                    plagued={grant.plaguedIndices?.includes(index) === true}
                    stackCount={grant.count + (grant.plaguedIndices?.length ?? 0)}
                    stackIndex={index + (grant.plaguedIndices?.filter((plaguedIndex) => plaguedIndex < index).length ?? 0)}
                    tuning={contentsTuning}
                    onReady={onImageLoad}
                    onError={onImageError}
                  />
                ))}
              </span>
            </span>
          ))}
        </span>
        {card.rules ? <span className="run-card-prototype-effect">{card.rules}</span> : null}
        <span className="run-card-prototype-flavor">{card.flavor}</span>
      </span>
    </span>
  );
}
