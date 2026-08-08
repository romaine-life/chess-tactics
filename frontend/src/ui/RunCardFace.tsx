import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import { projectBoardPoint, resolvedLiveMediaUrl, TILE_TEMPLATE } from '@chess-tactics/board-render';
import { defaultFacingForSide, paletteForSide, pieceSpritePath, type PlayablePieceType, type UnitPalette } from '../core/pieces';
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

// Read per render, not once at import: the player's color is a setting, and a value frozen into a
// module constant would keep the old set on every card until a reload.
const playerCardPalette = (): UnitPalette => paletteForSide('player');
const PLAYER_CARD_FACING = defaultFacingForSide('player');

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

export const RUN_CARD_FORMATION_ISO_TILE = Object.freeze({
  scale: .12,
  width: TILE_TEMPLATE.topWidth * .12,
  height: TILE_TEMPLATE.topHeight * .12,
});

export type RunCardFormationEdge = 'north' | 'east' | 'south' | 'west';

export type RunCardFormationBoardCell = Readonly<{
  x: number;
  y: number;
  dark: boolean;
  /** The sides of this seat that face off the footprint. They carry the cluster silhouette. */
  edges: readonly RunCardFormationEdge[];
}>;

export const RUN_CARD_FORMATION_EDGE_NAMES: readonly RunCardFormationEdge[] = Object.freeze([
  'north',
  'east',
  'south',
  'west',
]);

const RUN_CARD_FORMATION_EDGE_STEP: Readonly<Record<RunCardFormationEdge, Readonly<{ x: number; y: number }>>> =
  Object.freeze({
    north: Object.freeze({ x: 0, y: -1 }),
    east: Object.freeze({ x: 1, y: 0 }),
    south: Object.freeze({ x: 0, y: 1 }),
    west: Object.freeze({ x: -1, y: 0 }),
  });

/** Each edge of the seat's own 96x54 diamond, named for the board neighbor it faces. */
export const RUN_CARD_FORMATION_EDGE_LINE: Readonly<
  Record<RunCardFormationEdge, readonly [number, number, number, number]>
> = Object.freeze({
  north: Object.freeze([48, 1, 95, 27]),
  east: Object.freeze([95, 27, 48, 53]),
  south: Object.freeze([48, 53, 1, 27]),
  west: Object.freeze([1, 27, 48, 1]),
} as Record<RunCardFormationEdge, readonly [number, number, number, number]>);

/** The card uses the same two-axis projection as the battlefield, scaled into card units. */
export function runCardFormationIsoPoint(x: number, y: number): Readonly<{
  left: number;
  top: number;
  depth: number;
}> {
  const boardPoint = projectBoardPoint({ x, y });
  return {
    left: boardPoint.left * RUN_CARD_FORMATION_ISO_TILE.scale,
    top: boardPoint.top * RUN_CARD_FORMATION_ISO_TILE.scale,
    depth: x + y,
  };
}

/**
 * Print the card's own footprint and nothing else. A vacant board square is not part of what the
 * card grants, and drawing the whole enclosing rectangle turned every card into the same grid;
 * the occupied seats ARE the shape, so only they are printed and their outer edges are drawn heavy.
 */
export function runCardFormationBoardCells(
  seats: readonly Readonly<{ x: number; y: number }>[],
): RunCardFormationBoardCell[] {
  const occupied = new Set(seats.map((seat) => `${seat.x}:${seat.y}`));
  return [...occupied]
    .map((key) => {
      const [x, y] = key.split(':').map(Number);
      return {
        x,
        y,
        dark: (x + y) % 2 === 1,
        edges: RUN_CARD_FORMATION_EDGE_NAMES.filter((edge) => {
          const step = RUN_CARD_FORMATION_EDGE_STEP[edge];
          return !occupied.has(`${x + step.x}:${y + step.y}`);
        }),
      };
    })
    // Paint back-to-front so a seat's silhouette never lands under the seat in front of it.
    .sort((left, right) => (left.x + left.y) - (right.x + right.y) || left.x - right.x);
}

function runCardFormationBoardMetrics(columns: number, rows: number): Readonly<{
  width: number;
  height: number;
  minLeft: number;
  minTop: number;
}> {
  const corners = [
    runCardFormationIsoPoint(0, 0),
    runCardFormationIsoPoint(columns - 1, 0),
    runCardFormationIsoPoint(0, rows - 1),
    runCardFormationIsoPoint(columns - 1, rows - 1),
  ];
  const minLeft = Math.min(...corners.map((point) => point.left));
  const maxLeft = Math.max(...corners.map((point) => point.left));
  const minTop = Math.min(...corners.map((point) => point.top));
  const maxTop = Math.max(...corners.map((point) => point.top));
  return {
    width: maxLeft - minLeft + RUN_CARD_FORMATION_ISO_TILE.width,
    height: maxTop - minTop + RUN_CARD_FORMATION_ISO_TILE.height,
    minLeft,
    minTop,
  };
}

function FormationDiagram({
  pieces,
  pending,
  onReady,
  onError,
}: {
  pieces: readonly RunCardFormationPiece[];
  pending: boolean;
  onReady: (kind: RunCardImageKind) => void;
  onError: (kind: RunCardImageKind) => void;
}): ReactElement {
  const columns = Math.max(1, ...pieces.map((piece) => piece.x + 1));
  // The formation's empty front/back row is rules information. Cropping a singleton
  // to its occupied cell made "Queen in front" and "Queen in back" print identically.
  const rows = runCardFormationRows(pieces);
  const boardCells = runCardFormationBoardCells(pieces);
  // The box still spans the whole two-rank band even though only the footprint is drawn, so a
  // front-rank singleton and a back-rank singleton keep the different seats they are placed on.
  const metrics = runCardFormationBoardMetrics(columns, rows);
  const position = (x: number, y: number): CSSProperties => {
    const point = runCardFormationIsoPoint(x, y);
    return {
      '--run-card-formation-left': `${point.left - metrics.minLeft + RUN_CARD_FORMATION_ISO_TILE.width / 2}cqw`,
      '--run-card-formation-top': `${point.top - metrics.minTop + RUN_CARD_FORMATION_ISO_TILE.height / 2}cqw`,
      '--run-card-formation-depth': point.depth,
    } as CSSProperties;
  };
  return (
    <span
      className="run-card-formation"
      data-formation-columns={columns}
      data-formation-rows={rows}
      style={{
        '--run-card-formation-width': `${metrics.width}cqw`,
        '--run-card-formation-height': `${metrics.height}cqw`,
        '--run-card-formation-tile-width': `${RUN_CARD_FORMATION_ISO_TILE.width}cqw`,
        '--run-card-formation-tile-height': `${RUN_CARD_FORMATION_ISO_TILE.height}cqw`,
      } as CSSProperties}
      aria-label="Authored deployment formation"
    >
      {boardCells.map((cell) => (
        <span
          aria-hidden="true"
          className={`run-card-formation-square${cell.dark ? ' is-dark' : ''}`}
          data-formation-grid-x={cell.x}
          data-formation-grid-y={cell.y}
          data-formation-edges={cell.edges.join(' ')}
          key={`grid:${cell.x}:${cell.y}`}
          style={position(cell.x, cell.y)}
        >
          <svg preserveAspectRatio="none" viewBox="0 0 96 54">
            <polygon points="48,1 95,27 48,53 1,27" vectorEffect="non-scaling-stroke" />
            {cell.edges.map((edge) => {
              const [x1, y1, x2, y2] = RUN_CARD_FORMATION_EDGE_LINE[edge];
              return (
                <line className="run-card-formation-silhouette" key={edge}
                  x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
              );
            })}
          </svg>
        </span>
      ))}
      {pieces.map((piece) => {
        const kind = runCardUnitImageKind(piece.pieceIndex, piece.unit, piece.occurrenceIndex);
        const palette = playerCardPalette();
        const sprite = piece.empty ? null : (
          <img
            className="run-card-formation-unit"
            data-unit-facing={PLAYER_CARD_FACING}
            data-unit-palette={palette}
            src={pieceSpritePath(piece.unit, palette, PLAYER_CARD_FACING)}
            alt=""
            draggable={false}
            onLoad={() => onReady(kind)}
            onError={() => onError(kind)}
          />
        );
        return (
          <span
            className={`run-card-formation-cell${piece.empty ? ' is-empty' : ''}`}
            data-piece-index={piece.pieceIndex}
            data-formation-row={piece.y === 0 ? 'front' : 'back'}
            key={piece.pieceIndex}
            style={{
              ...position(piece.x, piece.y),
              '--run-card-unit-scale': `var(--unit-scale-${piece.unit}, 1)`,
              '--run-card-unit-anchor-x': `var(--unit-anchor-x-${piece.unit}, -50%)`,
              '--run-card-unit-anchor-y': `var(--unit-anchor-y-${piece.unit}, -78%)`,
            } as CSSProperties}
          >
            {sprite}
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
  onImageLoad,
  onImageError,
}: {
  presentation: RunCardPresentation;
  pending: boolean;
  contentsTuning: RunCardContentsTuning;
  faceTuning: RunCardFaceTuning;
  frameBoxStyle: RunCardFrameBoxStyle;
  selectedFrameBox: RunCardFrameBoxName | null;
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
        <FormationDiagram pieces={card.formation} pending={pending} onReady={ready} onError={error} />
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
          onImageLoad={settle}
          onImageError={(signature, isPending, kind) => {
            onImageError(kind);
            settle(signature, isPending, kind);
          }} />
      ))}
    </span>
  );
}
