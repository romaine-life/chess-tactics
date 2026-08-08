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

import {
  RUN_CARD_COIN_DIAMETER_CQW,
  RUN_CARD_COIN_MARK_FILL,
  runCardCostCrownUrl,
} from './shared/runCardCostCrown';

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
  crownUrl: string | null = null,
  markFill: number = RUN_CARD_COIN_MARK_FILL,
): string {
  return JSON.stringify([
    frameUrl,
    coinSourceUrl,
    crownUrl,
    markFill,
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

export const RUN_CARD_FORMATION_ISO_TILE = Object.freeze({
  scale: .12,
  width: TILE_TEMPLATE.topWidth * .12,
  height: TILE_TEMPLATE.topHeight * .12,
});

/** One seat's block extent as a share of its inline extent — the board's own tile proportion. */
const RUN_CARD_FORMATION_TILE_ASPECT =
  RUN_CARD_FORMATION_ISO_TILE.height / RUN_CARD_FORMATION_ISO_TILE.width;

/**
 * The figure that stands on a seat, stated against the seat it stands on.
 *
 * These are the committed sizes the card has always drawn — a 13.46 x 16.08 anchor box carrying a
 * 14.58 x 17.2 figure, pulled 78% of the box up off the seat centre so the feet land on it —
 * divided by the tile they sit on. Expressed that way they survive the diagram being drawn at any
 * size: the whole drawing scales by changing ONE length, and the figures keep their proportion to
 * the board under them.
 */
export const RUN_CARD_FORMATION_FIGURE = Object.freeze({
  cellWidth: 13.46 / RUN_CARD_FORMATION_ISO_TILE.width,
  cellHeight: 16.08 / RUN_CARD_FORMATION_ISO_TILE.width,
  width: 14.58 / RUN_CARD_FORMATION_ISO_TILE.width,
  height: 17.2 / RUN_CARD_FORMATION_ISO_TILE.width,
  anchorY: .78,
});

/** How far a figure at full scale reaches from the seat centre it stands on, in tiles. */
export const RUN_CARD_FORMATION_FIGURE_RISE = RUN_CARD_FORMATION_FIGURE.anchorY * RUN_CARD_FORMATION_FIGURE.cellHeight
  + (RUN_CARD_FORMATION_FIGURE.height - RUN_CARD_FORMATION_FIGURE.cellHeight) / 2;
export const RUN_CARD_FORMATION_FIGURE_DROP = (1 - RUN_CARD_FORMATION_FIGURE.anchorY) * RUN_CARD_FORMATION_FIGURE.cellHeight
  + (RUN_CARD_FORMATION_FIGURE.height - RUN_CARD_FORMATION_FIGURE.cellHeight) / 2;
export const RUN_CARD_FORMATION_FIGURE_REACH = RUN_CARD_FORMATION_FIGURE.width / 2;

export type RunCardFormationEdge = 'north' | 'east' | 'south' | 'west';

export type RunCardFormationBoardCell = Readonly<{
  x: number;
  y: number;
  dark: boolean;
  /** The sides of this seat that face off the footprint. The line is drawn on these only. */
  edges: readonly RunCardFormationEdge[];
}>;

const RUN_CARD_FORMATION_EDGE_NAMES: readonly RunCardFormationEdge[] = Object.freeze([
  'north', 'east', 'south', 'west',
]);

const RUN_CARD_FORMATION_EDGE_STEP: Readonly<Record<RunCardFormationEdge, Readonly<{ x: number; y: number }>>> =
  Object.freeze({
    north: Object.freeze({ x: 0, y: -1 }),
    east: Object.freeze({ x: 1, y: 0 }),
    south: Object.freeze({ x: 0, y: 1 }),
    west: Object.freeze({ x: -1, y: 0 }),
  });

/**
 * The seat's diamond, spanning its whole 96x54 cell.
 *
 * These are the tile's real corners: TILE_TOP_WIDTH is 96, TILE_TOP_HEIGHT is 54, and neighbouring
 * seats step by exactly half of each, so a diamond drawn corner to corner tiles edge to edge with
 * no seam. Insetting it — as this did, by a unit on every side — both narrows the shape off the
 * board's own tile proportion and leaves a two-unit gutter between neighbours. That gutter was
 * invisible while every seat stroked its own outline over it, and became a ragged edge the moment
 * the line moved to the footprint's boundary.
 */
const TILE_MID_X = TILE_TEMPLATE.topWidth / 2;
const TILE_MID_Y = TILE_TEMPLATE.topHeight / 2;
const TILE_TOP = Object.freeze([TILE_MID_X, 0] as const);
const TILE_RIGHT = Object.freeze([TILE_TEMPLATE.topWidth, TILE_MID_Y] as const);
const TILE_BOTTOM = Object.freeze([TILE_MID_X, TILE_TEMPLATE.topHeight] as const);
const TILE_LEFT = Object.freeze([0, TILE_MID_Y] as const);

export const RUN_CARD_FORMATION_TILE_VIEW_BOX =
  `0 0 ${TILE_TEMPLATE.topWidth} ${TILE_TEMPLATE.topHeight}`;
export const RUN_CARD_FORMATION_TILE_POINTS =
  [TILE_TOP, TILE_RIGHT, TILE_BOTTOM, TILE_LEFT].map(([x, y]) => `${x},${y}`).join(' ');

/** Each edge of that diamond, named for the board neighbour it faces. */
export const RUN_CARD_FORMATION_EDGE_LINE: Readonly<
  Record<RunCardFormationEdge, readonly [number, number, number, number]>
> = Object.freeze({
  north: [...TILE_TOP, ...TILE_RIGHT],
  east: [...TILE_RIGHT, ...TILE_BOTTOM],
  south: [...TILE_BOTTOM, ...TILE_LEFT],
  west: [...TILE_LEFT, ...TILE_TOP],
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
 * card grants, and drawing the whole enclosing rectangle turned every card into the same grid.
 *
 * The line the seats carry is unchanged — same colour, same weight — but it is drawn only on the
 * edges that face off the footprint. A line BETWEEN two occupied seats divides them, which is the
 * grid reading again in miniature: a two-by-two card printed as four squares with a cross through
 * it rather than as one block. Wrapping the shape instead is what makes the seats read as the
 * single cluster the card grants. Every dealt formation is orthogonally connected, so this is
 * always one closed outline.
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
    .sort((left, right) => (left.x + left.y) - (right.x + right.y) || left.x - right.x);
}

export type RunCardFormationMetrics = Readonly<{
  /** The whole drawing, figures included, in tiles. This is what gets centred and scaled. */
  width: number;
  height: number;
  /** Where the seats' own box sits inside that drawing, in tiles. */
  boardLeft: number;
  boardTop: number;
  boardWidth: number;
  boardHeight: number;
  /** The footprint's origin in the projection's own units, for the outline path. */
  minLeft: number;
  minTop: number;
}>;

/**
 * Measure the drawing the card actually prints — the occupied seats and the figures on them.
 *
 * This used to measure the enclosing COLUMNS x ROWS rectangle instead, on the reasoning that a
 * band spanning both deployment ranks kept a front-rank singleton distinguishable from a back-rank
 * one. Two things make that a cost with nothing bought. The empty part of the rectangle is not
 * drawn, so the only thing a reader sees is the drawn shape sitting off to one side of a centred
 * box — every footprint that left a cell of its rectangle vacant printed half a tile off centre.
 * And the offer deck collapses cards by rotation and translation (rotationalFormationId), so the
 * front-rank and back-rank singletons it was preserving are ONE card: the deck deals a straight
 * run authored entirely on the back rank and has no front-rank twin of it. Rank is not card
 * identity, and the player rotates the formation at Deployment anyway.
 *
 * Measuring the footprint centres every card on what it draws.
 */
export function runCardFormationMetrics(
  cells: readonly Readonly<{ x: number; y: number }>[],
): RunCardFormationMetrics {
  const points = (cells.length ? cells : [{ x: 0, y: 0 }])
    .map((cell) => runCardFormationIsoPoint(cell.x, cell.y));
  const minLeft = Math.min(...points.map((point) => point.left));
  const maxLeft = Math.max(...points.map((point) => point.left));
  const minTop = Math.min(...points.map((point) => point.top));
  const maxTop = Math.max(...points.map((point) => point.top));
  const tile = RUN_CARD_FORMATION_ISO_TILE.width;
  const boardWidth = (maxLeft - minLeft) / tile + 1;
  const boardHeight = (maxTop - minTop) / tile + RUN_CARD_FORMATION_TILE_ASPECT;
  // How far a figure reaches past the seats it stands on. Measured at full unit scale rather than
  // at each piece's own: the tile is the board, and a card's board must not change size according
  // to which piece happens to be standing on it.
  const overhangTop = RUN_CARD_FORMATION_FIGURE_RISE - RUN_CARD_FORMATION_TILE_ASPECT / 2;
  const overhangBottom = RUN_CARD_FORMATION_FIGURE_DROP - RUN_CARD_FORMATION_TILE_ASPECT / 2;
  const overhangSide = RUN_CARD_FORMATION_FIGURE_REACH - .5;
  return {
    width: boardWidth + Math.max(0, overhangSide) * 2,
    height: boardHeight + Math.max(0, overhangTop) + Math.max(0, overhangBottom),
    boardLeft: Math.max(0, overhangSide),
    boardTop: Math.max(0, overhangTop),
    boardWidth,
    boardHeight,
    minLeft,
    minTop,
  };
}

export type RunCardFormationInkExtent = Readonly<{
  left: string;
  right: string;
  top: string;
  bottom: string;
}>;

/**
 * The edges of what is actually INKED, as CSS expressions in the drawing's own tile units.
 *
 * The drawing is sized against a full-scale figure so that a card's board does not change size
 * with the piece standing on it — but a pawn is drawn at 0.66 and a rook at 0.73, and every figure
 * is authored on a canvas taller than itself, so on a card of short pieces a good part of that
 * reserved height is never painted. Centring the reserved box would leave the pawns sitting low in
 * it, which is the same mistake the columns-by-rows rectangle made across: centring a box on space
 * nothing is drawn in.
 *
 * Both corrections come from live settings rather than build-time numbers — unitSizeTuning writes
 * --unit-scale-<piece> and unitInkBounds writes --unit-ink-<edge>-<piece> onto the root — so these
 * come out as `min()` / `max()` over per-piece terms and CSS resolves them against whatever is
 * currently published. Retuning a piece's size, or accepting new art for it, re-centres every card
 * that carries it with no subscription on this face. Both fall back to the whole sprite box.
 */
export function runCardFormationInkExtent(
  seats: readonly Readonly<{ left: number; top: number; unit?: string }>[],
): RunCardFormationInkExtent {
  const half = RUN_CARD_FORMATION_TILE_ASPECT / 2;
  const number = (value: number): string => value.toFixed(4);
  const figures = seats.filter((seat) => seat.unit);
  /**
   * One figure's painted edge, measured from the seat it stands on. `share` is where that edge
   * falls inside the sprite (0 is the sprite's own top or left edge, 1 the far one); `span` is the
   * sprite's extent in tiles, and `origin` the distance from the seat centre to its near edge.
   */
  const painted = (
    seat: Readonly<{ unit?: string }>,
    edge: 'top' | 'bottom' | 'left' | 'right',
    fallback: 0 | 1,
    span: number,
    origin: number,
  ): string => (
    `calc(var(--unit-scale-${seat.unit}, 1)`
    + ` * (var(--unit-ink-${edge}-${seat.unit}, ${fallback}) * ${number(span)} - ${number(origin)}))`
  );
  const edge = (
    pick: 'min' | 'max',
    seatEdge: number,
    term: (seat: Readonly<{ left: number; top: number; unit?: string }>) => string,
  ): string => (
    figures.length ? `${pick}(${number(seatEdge)}, ${figures.map(term).join(', ')})` : number(seatEdge)
  );
  const seatEdges = {
    left: Math.min(...seats.map((seat) => seat.left)) - .5,
    right: Math.max(...seats.map((seat) => seat.left)) + .5,
    top: Math.min(...seats.map((seat) => seat.top)) - half,
    bottom: Math.max(...seats.map((seat) => seat.top)) + half,
  };
  const across = RUN_CARD_FORMATION_FIGURE.width;
  const down = RUN_CARD_FORMATION_FIGURE.height;
  return {
    left: edge('min', seatEdges.left, (seat) => (
      `calc(${number(seat.left)} + ${painted(seat, 'left', 0, across, RUN_CARD_FORMATION_FIGURE_REACH)})`
    )),
    right: edge('max', seatEdges.right, (seat) => (
      `calc(${number(seat.left)} + ${painted(seat, 'right', 1, across, RUN_CARD_FORMATION_FIGURE_REACH)})`
    )),
    top: edge('min', seatEdges.top, (seat) => (
      `calc(${number(seat.top)} + ${painted(seat, 'top', 0, down, RUN_CARD_FORMATION_FIGURE_RISE)})`
    )),
    bottom: edge('max', seatEdges.bottom, (seat) => (
      `calc(${number(seat.top)} + ${painted(seat, 'bottom', 1, down, RUN_CARD_FORMATION_FIGURE_RISE)})`
    )),
  };
}

/**
 * How the footprint's outline is rasterized. `soft` is what the game prints; `crisp` turns
 * antialiasing off so every pixel is fully on or fully off. Review-only, like the frame boxes:
 * the Card Outline studio mounts both so the choice is made by looking rather than by describing.
 */
export type RunCardOutlineRendering = 'soft' | 'crisp';

export type RunCardFormationOutlinePoint = Readonly<{ x: number; y: number }>;

/**
 * Trace the footprint's boundary as closed rings, in the diagram's own coordinate space.
 *
 * The outline used to be eight separate line segments living inside four separate per-seat SVGs.
 * Each of those rasterizes on its own sub-pixel grid, so segments that meet in geometry do not
 * meet in pixels: the corners jog, and each edge antialiases to a different apparent weight. At a
 * ninety-by-fifty-pixel diagram that reads as a stepped, broken line.
 *
 * One path in one coordinate space removes the problem at the source — the corners are joins the
 * rasterizer can see rather than a coincidence it has to reproduce, and mitred joints close them.
 *
 * Seat edges are emitted clockwise around their own diamond, which makes them clockwise around the
 * whole shape, so following each end to the edge that starts there walks the boundary. A footprint
 * is a connected polyomino with no holes, so that is normally one ring; the loop still drains any
 * remainder rather than assuming it.
 */
export function runCardFormationOutlineRings(
  cells: readonly RunCardFormationBoardCell[],
  origin: Readonly<{ minLeft: number; minTop: number }>,
): RunCardFormationOutlinePoint[][] {
  const halfWidth = RUN_CARD_FORMATION_ISO_TILE.width / 2;
  const halfHeight = RUN_CARD_FORMATION_ISO_TILE.height / 2;
  const corners = (x: number, y: number): Record<'top' | 'right' | 'bottom' | 'left', RunCardFormationOutlinePoint> => {
    const point = runCardFormationIsoPoint(x, y);
    const centreX = point.left - origin.minLeft + halfWidth;
    const centreY = point.top - origin.minTop + halfHeight;
    return {
      top: { x: centreX, y: centreY - halfHeight },
      right: { x: centreX + halfWidth, y: centreY },
      bottom: { x: centreX, y: centreY + halfHeight },
      left: { x: centreX - halfWidth, y: centreY },
    };
  };
  const ENDS = {
    north: ['top', 'right'],
    east: ['right', 'bottom'],
    south: ['bottom', 'left'],
    west: ['left', 'top'],
  } as const;
  // Neighbouring seats share corners exactly, but only after the same float arithmetic; quantise
  // so a shared corner is one vertex rather than two that merely round to the same pixel.
  const key = (point: RunCardFormationOutlinePoint): string => `${point.x.toFixed(4)}:${point.y.toFixed(4)}`;
  const fromVertex = new Map<string, { to: RunCardFormationOutlinePoint; used: boolean }[]>();
  for (const cell of cells) {
    const corner = corners(cell.x, cell.y);
    for (const edge of cell.edges) {
      const [start, end] = ENDS[edge];
      const outgoing = fromVertex.get(key(corner[start])) ?? [];
      outgoing.push({ to: corner[end], used: false });
      fromVertex.set(key(corner[start]), outgoing);
    }
  }
  const rings: RunCardFormationOutlinePoint[][] = [];
  for (const [startKey, outgoing] of fromVertex) {
    for (const first of outgoing) {
      if (first.used) continue;
      first.used = true;
      const ring: RunCardFormationOutlinePoint[] = [first.to];
      let cursor = first.to;
      while (key(cursor) !== startKey) {
        const next = (fromVertex.get(key(cursor)) ?? []).find((edge) => !edge.used);
        if (!next) break;
        next.used = true;
        ring.push(next.to);
        cursor = next.to;
      }
      rings.push(ring);
    }
  }
  return rings;
}

export function runCardFormationOutlinePath(ring: readonly RunCardFormationOutlinePoint[]): string {
  return `${ring.map((point, index) => (
    `${index === 0 ? 'M' : 'L'}${point.x.toFixed(3)},${point.y.toFixed(3)}`
  )).join('')}Z`;
}

function FormationDiagram({
  pieces,
  pending,
  outlineRendering,
  onReady,
  onError,
}: {
  pieces: readonly RunCardFormationPiece[];
  pending: boolean;
  outlineRendering: RunCardOutlineRendering;
  onReady: (kind: RunCardImageKind) => void;
  onError: (kind: RunCardImageKind) => void;
}): ReactElement {
  const boardCells = runCardFormationBoardCells(pieces);
  const metrics = runCardFormationMetrics(boardCells);
  const tile = RUN_CARD_FORMATION_ISO_TILE.width;
  // Every coordinate below is a count of TILES, not a card length. The tile's own length is what
  // the panel sizes (see .run-card-formation-fit), so the same numbers draw the same diagram at
  // whatever size the card has room for.
  const seat = (x: number, y: number): Readonly<{ left: number; top: number; depth: number }> => {
    const point = runCardFormationIsoPoint(x, y);
    return {
      left: metrics.boardLeft + (point.left - metrics.minLeft) / tile + .5,
      top: metrics.boardTop + (point.top - metrics.minTop) / tile + RUN_CARD_FORMATION_TILE_ASPECT / 2,
      depth: point.depth,
    };
  };
  const position = (x: number, y: number): CSSProperties => {
    const placed = seat(x, y);
    return {
      '--run-card-formation-left': placed.left,
      '--run-card-formation-top': placed.top,
      '--run-card-formation-depth': placed.depth,
    } as CSSProperties;
  };
  // What is inked, against what was reserved: the drawing is placed so the INK lands in the middle
  // of the space, not the reserve. A vacant seat marks its own tile and carries no figure.
  const ink = runCardFormationInkExtent(boardCells.map((cell) => {
    const placed = seat(cell.x, cell.y);
    const standing = pieces.find((piece) => !piece.empty && piece.x === cell.x && piece.y === cell.y);
    return { left: placed.left, top: placed.top, unit: standing?.unit };
  }));
  return (
    <span
      className="run-card-formation-fit"
      style={{
        '--run-card-formation-natural-width': metrics.width,
        '--run-card-formation-natural-height': metrics.height,
        // Stated here, outside the diagram's own size container, so the cap keeps meaning
        // "times the size the card used to print" rather than a share of this box.
        '--run-card-formation-committed-tile': `${tile}cqw`,
      } as CSSProperties}
    >
      <span
        className="run-card-formation"
        data-formation-cells={boardCells.length}
        style={{
          '--run-card-formation-board-left': metrics.boardLeft,
          '--run-card-formation-board-top': metrics.boardTop,
          '--run-card-formation-board-width': metrics.boardWidth,
          '--run-card-formation-board-height': metrics.boardHeight,
          '--run-card-formation-tile-aspect': RUN_CARD_FORMATION_TILE_ASPECT,
          '--run-card-formation-figure-cell-width': RUN_CARD_FORMATION_FIGURE.cellWidth,
          '--run-card-formation-figure-cell-height': RUN_CARD_FORMATION_FIGURE.cellHeight,
          '--run-card-formation-figure-width': RUN_CARD_FORMATION_FIGURE.width,
          '--run-card-formation-figure-height': RUN_CARD_FORMATION_FIGURE.height,
          '--run-card-formation-ink-left': ink.left,
          '--run-card-formation-ink-right': ink.right,
          '--run-card-formation-ink-top': ink.top,
          '--run-card-formation-ink-bottom': ink.bottom,
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
            <svg preserveAspectRatio="none" viewBox={RUN_CARD_FORMATION_TILE_VIEW_BOX}>
              <polygon points={RUN_CARD_FORMATION_TILE_POINTS} />
            </svg>
          </span>
        ))}
        {/* One path over all the seats, so every corner is a join the rasterizer draws rather than
            two segments from two coordinate systems asked to land on the same pixel. */}
        <svg
          className="run-card-formation-outline"
          data-outline-rendering={outlineRendering}
          viewBox={`0 0 ${metrics.boardWidth * tile} ${metrics.boardHeight * tile}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {runCardFormationOutlineRings(boardCells, metrics).map((ring) => (
            <path d={runCardFormationOutlinePath(ring)} key={runCardFormationOutlinePath(ring)}
              vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
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
  crownUrl: string | null;
  markFill: number;
}>;

function runCardPresentationCanUpdateInPlace(
  current: RunCardPresentation,
  requested: RunCardPresentation,
): boolean {
  return requested.frameUrl === current.frameUrl
    && requested.coinSourceUrl === current.coinSourceUrl
    && requested.artUrl === current.artUrl
    && requested.crownUrl === current.crownUrl
    && requested.markFill === current.markFill
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
  outlineRendering,
  onImageLoad,
  onImageError,
}: {
  presentation: RunCardPresentation;
  pending: boolean;
  contentsTuning: RunCardContentsTuning;
  faceTuning: RunCardFaceTuning;
  frameBoxStyle: RunCardFrameBoxStyle;
  selectedFrameBox: RunCardFrameBoxName | null;
  outlineRendering: RunCardOutlineRendering;
  onImageLoad: (signature: string, pending: boolean, kind: RunCardImageKind) => void;
  onImageError: (signature: string, pending: boolean, kind: RunCardImageKind) => void;
}): ReactElement {
  const { signature, card, frameUrl, coinSourceUrl, artUrl, frameGeometry, crownUrl, markFill } = presentation;
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
        '--run-card-coin-mark': `${(RUN_CARD_COIN_DIAMETER_CQW * (markFill / 100)).toFixed(4)}cqw`,
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
      {/* The mark a priceless card is struck with, in the numeral's own seat (ADR-0530). It is
          deliberately outside the readiness protocol above: an ornament that has not been
          promoted yet must not be able to hold a whole card face unpresented. */}
      {!card.showsCost && crownUrl ? (
        <img className="run-card-prototype-cost-crown" src={crownUrl} alt="" aria-hidden="true" draggable={false} />
      ) : null}
      <span className="run-card-prototype-type"><span className="run-card-prototype-type-label">{card.typeLine}</span></span>
      <span className="run-card-prototype-contents is-ledger-1-rows">
        <FormationDiagram pieces={card.formation} pending={pending} outlineRendering={outlineRendering} onReady={ready} onError={error} />
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
  crownUrl = runCardCostCrownUrl(),
  markFill = RUN_CARD_COIN_MARK_FILL,
  width = '100%',
  tuning = RUN_CARD_APPROVED_TUNING,
  contentsTuning = RUN_CARD_DEFAULT_CONTENTS_TUNING,
  frameGeometry = RUN_CARD_STANDARD_FRAME_GEOMETRY,
  frameBoxStyle = 'off',
  selectedFrameBox = null,
  outlineRendering = 'soft',
  onImageLoad = () => undefined,
  onImageError = () => undefined,
  ariaHidden = false,
}: {
  card: RunCardFaceContent;
  frameUrl: string;
  artUrl: string;
  coinSourceUrl?: string;
  /** The mark struck where a price would be. Null prints the coin bare, as before. */
  crownUrl?: string | null;
  /** The mark's share of the drawn coin, in whole percent. Owned by the Studio instrument. */
  markFill?: number;
  width?: string;
  tuning?: RunCardFaceTuning;
  contentsTuning?: RunCardContentsTuning;
  frameGeometry?: RunCardFrameGeometry;
  frameBoxStyle?: RunCardFrameBoxStyle;
  selectedFrameBox?: RunCardFrameBoxName | null;
  /** Review-only: how the footprint outline rasterizes. The game prints `soft`. */
  outlineRendering?: RunCardOutlineRendering;
  onImageLoad?: (kind: RunCardImageKind) => void;
  onImageError?: (kind: RunCardImageKind) => void;
  ariaHidden?: boolean;
}): ReactElement {
  const requestedSignature = runCardPresentationSignature(
    card, frameUrl, artUrl, frameGeometry, coinSourceUrl, crownUrl, markFill,
  );
  const requested = useMemo<RunCardPresentation>(() => ({
    signature: requestedSignature,
    card,
    frameUrl,
    coinSourceUrl,
    artUrl,
    frameGeometry,
    crownUrl,
    markFill,
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
          outlineRendering={outlineRendering}
          onImageLoad={settle}
          onImageError={(signature, isPending, kind) => {
            onImageError(kind);
            settle(signature, isPending, kind);
          }} />
      ))}
    </span>
  );
}
