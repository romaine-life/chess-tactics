import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { paletteForSide, pieceSpritePath, type PlayablePieceType } from '../core/pieces';
import type { RunCardFaceContent, RunCardFormationPiece, RunCardGrant } from './runCardFaceContent';
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

export { RUN_CARD_FRAME_SLOT } from './runCardFrameGeometry';
export const RUN_CARD_COST_COIN_SOURCE_SLOT = 'ui/run/card-prototypes/cost-coin-source-v1.png';
export const RUN_CARD_REFERENCE_WIDTH = 360;

const PLAYER_CARD_PALETTE = paletteForSide('player');
const PLAYER_CARD_FACING = 'south';

export type RunCardUnitHighlight = Readonly<{
  unit: PlayablePieceType;
  index: number;
}>;

export type RunCardUnitSelection = Readonly<{
  id: (unit: PlayablePieceType, index: number) => string | null;
  label: (unit: PlayablePieceType, index: number) => string | null;
  onSelect: (unit: PlayablePieceType, index: number) => void;
}>;

export type RunCardImageKind =
  | 'frame'
  | 'coin'
  | 'art'
  | `unit:${number}:${PlayablePieceType}:${number}`;

export type { RunCardFaceContent, RunCardGrant } from './runCardFaceContent';

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

export const RUN_CARD_APPROVED_TUNING: RunCardFaceTuning = Object.freeze({
  titleSize: 6.85,
  typeSize: 5.3,
  costSize: 6.2,
  flavorSize: 5,
  textInset: RUN_CARD_TEXT_PLACEMENT.insetInline,
  textInkCentre: RUN_CARD_TEXT_PLACEMENT.inkCentreEm,
});

export const RUN_CARD_DEFAULT_CONTENTS_TUNING: RunCardContentsTuning = Object.freeze({
  unitHeight: 18,
  unitNaturalGap: .8,
  countSize: 6,
  countColumn: 7,
  columnGap: 1,
  rowGap: 1.5,
  flavorScale: 1,
  paddingBlockStart: 2,
  paddingBlockEnd: 2,
});

export type RunCardContentsDensity = 'roomy' | 'standard' | 'compact' | 'dense';
export type RunCardContentsDensityStep = Readonly<{
  density: RunCardContentsDensity;
  tuning: RunCardContentsTuning;
}>;

export const RUN_CARD_CONTENTS_DENSITY_LADDER: readonly RunCardContentsDensityStep[] = Object.freeze([
  Object.freeze({ density: 'roomy', tuning: Object.freeze({ ...RUN_CARD_DEFAULT_CONTENTS_TUNING, unitHeight: 21 }) }),
  Object.freeze({ density: 'standard', tuning: RUN_CARD_DEFAULT_CONTENTS_TUNING }),
  Object.freeze({ density: 'compact', tuning: Object.freeze({ ...RUN_CARD_DEFAULT_CONTENTS_TUNING, unitHeight: 14, flavorScale: .98 }) }),
  Object.freeze({ density: 'dense', tuning: Object.freeze({ ...RUN_CARD_DEFAULT_CONTENTS_TUNING, unitHeight: 12, flavorScale: .96 }) }),
]);

export const runCardUnitImageKind = (
  cell: number,
  unit: PlayablePieceType,
  index: number,
): RunCardImageKind => `unit:${cell}:${unit}:${index}`;

export function requiredRunCardImageKinds(card: RunCardFaceContent): readonly RunCardImageKind[] {
  return [
    'frame',
    'coin',
    'art',
    ...card.formation.flatMap((piece) => (
      piece.empty ? [] : [runCardUnitImageKind(piece.pieceIndex, piece.unit, piece.occurrenceIndex)]
    )),
  ];
}

export function runCardPresentationSignature(
  card: RunCardFaceContent,
  frameUrl: string,
  artUrl: string,
  frameGeometry: RunCardFrameGeometry = RUN_CARD_STANDARD_FRAME_GEOMETRY,
  coinSourceUrl = RUN_CARD_COST_COIN_SOURCE_SLOT,
): string {
  return JSON.stringify([
    frameUrl,
    coinSourceUrl,
    artUrl,
    frameGeometry.id,
    frameGeometry.frameSha256s,
    card.name,
    card.rarity,
    card.cost,
    card.showsCost,
    card.typeLine,
    card.grants.map(({ count, unit, emptyIndices }) => [count, unit, emptyIndices ?? []]),
    card.formation.map(({ pieceIndex, unit, occurrenceIndex, x, y, empty }) => (
      [pieceIndex, unit, occurrenceIndex, x, y, empty]
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

/** A removal-only face update needs no new pixels and may commit in the current frame. */
export function runCardContentCanUpdateWithoutMediaLoad(
  current: RunCardFaceContent,
  requested: RunCardFaceContent,
): boolean {
  const currentKinds = new Set(requiredRunCardImageKinds(current));
  return requiredRunCardImageKinds(requested).every((kind) => currentKinds.has(kind));
}

function grantsLabel(grants: readonly RunCardGrant[]): string {
  const visible = grants
    .map((grant) => ({ ...grant, count: grant.count - (grant.emptyIndices?.length ?? 0) }))
    .filter((grant) => grant.count > 0)
    .map((grant) => `${grant.count} ${grant.unit}${grant.count === 1 ? '' : 's'}`);
  return visible.length ? visible.join(', ') : 'no units';
}

export function runCardFormationRows(pieces: readonly Pick<RunCardFormationPiece, 'y'>[]): number {
  return Math.max(2, ...pieces.map((piece) => piece.y + 1));
}

export type RunCardFormationGridCell = Readonly<{
  x: number;
  y: number;
  dark: boolean;
}>;

/** The printed diagram uses the player's board orientation: formation row zero is the
 * front rank and therefore prints above row one. */
export function runCardFormationDisplayRow(y: number): number {
  return Math.max(0, Math.floor(y));
}

export function runCardFormationGridCells(columns: number, rows: number): RunCardFormationGridCell[] {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeRows = Math.max(1, Math.floor(rows));
  return Array.from({ length: safeColumns * safeRows }, (_, index) => {
    const x = index % safeColumns;
    const y = Math.floor(index / safeColumns);
    return {
      x,
      y,
      dark: (x + y) % 2 === 1,
    };
  });
}

function FormationGridExtension({ side }: { side: 'left' | 'right' }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className={`run-card-formation-extension is-${side}`}
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {[0, 1, 2, 3].map((segment) => {
        const start = segment * 25;
        const end = start + 25;
        return (
          <path
            d={`M ${start} 1 H ${end} M ${start} 50 H ${end} M ${start} 99 H ${end}`}
            key={segment}
            opacity={(segment + 1) * .2}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function FormationDiagram({
  pieces,
  pending,
  unitHighlight,
  unitSelection,
  onReady,
  onError,
}: {
  pieces: readonly RunCardFormationPiece[];
  pending: boolean;
  unitHighlight?: RunCardUnitHighlight | null;
  unitSelection?: RunCardUnitSelection | null;
  onReady: (kind: RunCardImageKind) => void;
  onError: (kind: RunCardImageKind) => void;
}): ReactElement {
  const columns = Math.max(1, ...pieces.map((piece) => piece.x + 1));
  // The formation's empty front/back row is rules information. Cropping a singleton
  // to its occupied cell made "Queen in front" and "Queen in back" print identically.
  const rows = runCardFormationRows(pieces);
  const gridCells = runCardFormationGridCells(columns, rows);
  return (
    <span
      className="run-card-formation"
      data-formation-columns={columns}
      data-formation-rows={rows}
      style={{
        '--run-card-formation-columns': columns,
        '--run-card-formation-rows': rows,
      } as CSSProperties}
      aria-label="Authored deployment formation"
    >
      <FormationGridExtension side="left" />
      <FormationGridExtension side="right" />
      {gridCells.map((cell) => (
        <span
          aria-hidden="true"
          className={`run-card-formation-square${cell.dark ? ' is-dark' : ''}`}
          data-formation-grid-x={cell.x}
          data-formation-grid-y={cell.y}
          key={`grid:${cell.x}:${cell.y}`}
          style={{
            '--run-card-formation-x': cell.x,
            '--run-card-formation-y': cell.y,
          } as CSSProperties}
        />
      ))}
      {pieces.map((piece) => {
        const kind = runCardUnitImageKind(piece.pieceIndex, piece.unit, piece.occurrenceIndex);
        const selectionLabel = pending || piece.empty
          ? null
          : unitSelection?.label(piece.unit, piece.occurrenceIndex) ?? null;
        const sprite = piece.empty ? null : (
          <img
            className="run-card-formation-unit"
            data-unit-facing={PLAYER_CARD_FACING}
            data-unit-palette={PLAYER_CARD_PALETTE}
            src={pieceSpritePath(piece.unit, PLAYER_CARD_PALETTE, PLAYER_CARD_FACING)}
            alt=""
            draggable={false}
            onLoad={() => onReady(kind)}
            onError={() => onError(kind)}
          />
        );
        const content = selectionLabel ? (
          <button
            type="button"
            className="run-card-formation-cell-button"
            aria-label={selectionLabel}
            data-selection-id={unitSelection?.id(piece.unit, piece.occurrenceIndex) ?? undefined}
            onClick={() => unitSelection?.onSelect(piece.unit, piece.occurrenceIndex)}
          >
            {sprite}
          </button>
        ) : sprite;
        return (
          <span
            className={`run-card-formation-cell${piece.empty ? ' is-empty' : ''}${unitHighlight?.unit === piece.unit && unitHighlight.index === piece.occurrenceIndex ? ' is-highlighted' : ''}`}
            data-piece-index={piece.pieceIndex}
            data-formation-row={piece.y === 0 ? 'front' : 'back'}
            key={piece.pieceIndex}
            style={{
              '--run-card-formation-x': piece.x,
              '--run-card-formation-y': runCardFormationDisplayRow(piece.y),
            } as CSSProperties}
          >
            {content}
          </span>
        );
      })}
    </span>
  );
}

type RunCardPresentation = Readonly<{
  signature: string;
  card: RunCardFaceContent;
  frameUrl: string;
  coinSourceUrl: string;
  artUrl: string;
  frameGeometry: RunCardFrameGeometry;
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
    && runCardContentCanUpdateWithoutMediaLoad(current.card, requested.card);
}

async function acknowledgeDecodedImage(
  image: HTMLImageElement,
  kind: 'frame' | 'coin' | 'art',
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
  contentsTuning,
  faceTuning,
  frameBoxStyle,
  selectedFrameBox,
  unitHighlight,
  unitSelection,
  onImageLoad,
  onImageError,
}: {
  presentation: RunCardPresentation;
  pending: boolean;
  contentsTuning: RunCardContentsTuning;
  faceTuning: RunCardFaceTuning;
  frameBoxStyle: RunCardFrameBoxStyle;
  selectedFrameBox: RunCardFrameBoxName | null;
  unitHighlight: RunCardUnitHighlight | null;
  unitSelection: RunCardUnitSelection | null;
  onImageLoad: (signature: string, pending: boolean, kind: RunCardImageKind) => void;
  onImageError: (signature: string, pending: boolean, kind: RunCardImageKind) => void;
}): ReactElement {
  const { signature, card, frameUrl, coinSourceUrl, artUrl, frameGeometry } = presentation;
  const ready = (kind: RunCardImageKind): void => onImageLoad(signature, pending, kind);
  const error = (kind: RunCardImageKind): void => onImageError(signature, pending, kind);
  return (
    <span
      className={`run-card-face-layer${pending ? ' is-pending' : ' is-presented'}`}
      data-card-presentation={signature}
      data-card-rarity={card.rarity}
      data-frame-geometry={frameGeometry.id}
      style={{
        ...runCardFrameGeometryVariables(frameGeometry),
        '--run-card-flavor-size': `${faceTuning.flavorSize * contentsTuning.flavorScale}cqw`,
        '--run-card-unit-height': `${contentsTuning.unitHeight}cqw`,
        '--run-card-ledger-count-size': `${contentsTuning.countSize}cqw`,
        '--run-card-ledger-count-column': `${contentsTuning.countColumn}cqw`,
        '--run-card-ledger-column-gap': `${contentsTuning.columnGap}cqw`,
        '--run-card-ledger-row-gap': `${contentsTuning.rowGap}cqw`,
        '--run-card-contents-padding-block-start': `${contentsTuning.paddingBlockStart}cqw`,
        '--run-card-contents-padding-block-end': `${contentsTuning.paddingBlockEnd}cqw`,
      } as CSSProperties}
      aria-hidden={pending || undefined}
    >
      <img className="run-card-prototype-frame" src={frameUrl} alt="" draggable={false}
        onLoad={(event) => { void acknowledgeDecodedImage(event.currentTarget, 'frame', ready, error); }}
        onError={() => error('frame')} />
      <img className="run-card-prototype-cost-coin-source" src={coinSourceUrl} alt="" draggable={false}
        onLoad={(event) => { void acknowledgeDecodedImage(event.currentTarget, 'coin', ready, error); }}
        onError={() => error('coin')} />
      <img className="run-card-prototype-art" src={artUrl} alt="" draggable={false}
        onLoad={(event) => { void acknowledgeDecodedImage(event.currentTarget, 'art', ready, error); }}
        onError={() => error('art')} />
      <span className="run-card-prototype-name">{card.name}</span>
      {card.showsCost ? (
        <strong className={`run-card-prototype-cost${card.cost >= 10 ? ' is-multi-digit' : ''}`} aria-label={`${card.cost} gold`}>
          {card.cost}
        </strong>
      ) : null}
      <span className="run-card-prototype-type"><span className="run-card-prototype-type-label">{card.typeLine}</span></span>
      <span className="run-card-prototype-contents is-ledger-1-rows">
        <FormationDiagram pieces={card.formation} pending={pending} unitHighlight={unitHighlight}
          unitSelection={unitSelection} onReady={ready} onError={error} />
        <span className="run-card-prototype-flavor">{card.flavor}</span>
      </span>
      {frameBoxStyle !== 'off' ? (
        <span className={`run-card-frame-box-overlay is-${frameBoxStyle}`} aria-hidden="true">
          {RUN_CARD_FRAME_BOX_NAMES.map((name) => (
            <span className={`run-card-frame-box is-${name}${selectedFrameBox === name ? ' is-selected' : ''}`}
              data-frame-box={name} key={name}>
              <span className="run-card-frame-box-tag">{name}</span>
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export function RunCardFace({
  card,
  frameUrl,
  artUrl,
  coinSourceUrl = resolvedLiveMediaUrl(RUN_CARD_COST_COIN_SOURCE_SLOT),
  width = '100%',
  tuning = RUN_CARD_APPROVED_TUNING,
  contentsTuning = RUN_CARD_DEFAULT_CONTENTS_TUNING,
  frameGeometry = RUN_CARD_STANDARD_FRAME_GEOMETRY,
  frameBoxStyle = 'off',
  selectedFrameBox = null,
  unitHighlight = null,
  unitSelection = null,
  onImageLoad = () => undefined,
  onImageError = () => undefined,
  ariaHidden = false,
}: {
  card: RunCardFaceContent;
  frameUrl: string;
  artUrl: string;
  coinSourceUrl?: string;
  width?: string;
  tuning?: RunCardFaceTuning;
  contentsTuning?: RunCardContentsTuning;
  frameGeometry?: RunCardFrameGeometry;
  frameBoxStyle?: RunCardFrameBoxStyle;
  selectedFrameBox?: RunCardFrameBoxName | null;
  unitHighlight?: RunCardUnitHighlight | null;
  unitSelection?: RunCardUnitSelection | null;
  onImageLoad?: (kind: RunCardImageKind) => void;
  onImageError?: (kind: RunCardImageKind) => void;
  ariaHidden?: boolean;
}): ReactElement {
  const requestedSignature = runCardPresentationSignature(card, frameUrl, artUrl, frameGeometry, coinSourceUrl);
  const requested = useMemo<RunCardPresentation>(() => ({
    signature: requestedSignature,
    card,
    frameUrl,
    coinSourceUrl,
    artUrl,
    frameGeometry,
  // The signature is a complete serialization of the visual presentation. Keeping
  // this object stable prevents equivalent parent renders from restarting the
  // media-settling transition.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [requestedSignature]);
  const [displayed, setDisplayed] = useState<RunCardPresentation>(requested);
  const [pending, setPending] = useState<RunCardPresentation | null>(null);
  const [settled, setSettled] = useState<ReadonlySet<RunCardImageKind>>(() => new Set());
  const pendingRef = useRef<RunCardPresentation | null>(null);
  pendingRef.current = pending;

  useEffect(() => {
    if (requested.signature === displayed.signature) {
      setDisplayed(requested);
      setPending(null);
      setSettled(new Set());
    } else if (runCardPresentationCanUpdateInPlace(displayed, requested)) {
      setDisplayed(requested);
      setPending(null);
      setSettled(new Set());
    } else {
      setPending(requested);
      setSettled(new Set());
    }
  }, [displayed, requested]);

  const settle = useCallback((signature: string, isPending: boolean, kind: RunCardImageKind): void => {
    if (isPending) {
      if (pendingRef.current?.signature !== signature) return;
      setSettled((current) => current.has(kind) ? current : new Set([...current, kind]));
    }
    onImageLoad(kind);
  }, [onImageLoad]);

  useEffect(() => {
    if (!pending || !runCardPresentationCanPromote(pending.signature, pendingRef.current?.signature ?? null, pending.card, settled)) return;
    const frame = requestAnimationFrame(() => {
      const current = pendingRef.current;
      if (!current || current.signature !== pending.signature) return;
      setDisplayed(current);
      setPending(null);
      setSettled(new Set());
    });
    return () => cancelAnimationFrame(frame);
  }, [pending, settled]);

  const layers = pending
    ? [{ presentation: displayed, pending: false }, { presentation: pending, pending: true }]
    : [{ presentation: displayed, pending: false }];
  return (
    <span
      className="run-card-prototype run-card-face"
      style={{
        '--run-card-prototype-width': width,
        '--run-card-cost-size': `${runCardCostSizeCqw(displayed.card.cost, tuning.costSize)}cqw`,
        '--run-card-title-size': `${tuning.titleSize}cqw`,
        '--run-card-type-size': `${tuning.typeSize}cqw`,
        '--run-card-text-inset': `${tuning.textInset}cqw`,
        '--run-card-text-ink-centre': tuning.textInkCentre,
      } as CSSProperties}
      aria-hidden={ariaHidden || undefined}
      aria-busy={pending ? true : undefined}
      data-card-rarity={displayed.card.rarity}
      aria-label={ariaHidden ? undefined : `${displayed.card.name}. ${displayed.card.rarity} ${displayed.card.typeLine}.${displayed.card.showsCost ? ` Costs ${displayed.card.cost} gold.` : ''} Grants ${grantsLabel(displayed.card.grants)} in the shown formation.`}
    >
      {layers.map((layer) => (
        <RunCardFaceLayer key={`${layer.presentation.signature}:${layer.pending ? 'pending' : 'shown'}`}
          presentation={layer.presentation} pending={layer.pending} contentsTuning={contentsTuning}
          faceTuning={tuning} frameBoxStyle={frameBoxStyle} selectedFrameBox={selectedFrameBox}
          unitHighlight={unitHighlight} unitSelection={unitSelection} onImageLoad={settle}
          onImageError={(signature, isPending, kind) => {
            onImageError(kind);
            settle(signature, isPending, kind);
          }} />
      ))}
    </span>
  );
}
