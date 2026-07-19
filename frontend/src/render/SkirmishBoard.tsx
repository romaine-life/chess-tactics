import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { tileFrameSrc, tileAssets, tileFamilies, edgeTiles, muralTiles, type TileAsset } from '../art/tileset';
import { countIllegalEdges, solveSocketBoard, type SocketBoardCell, type SocketBoardResult } from '../core/tileBoardGenerator';
import { densityFieldAt, resolveGroundCover } from '../core/groundCover';
import type { GameState, Move, Piece, Side, TerrainType, UnitFacing, Vec } from '../core/types';
import { attackedSquares, blockedCandidateSquares, enemyThreats, legalMoves, livingPieces } from '../core/rules';
import { PIECE_LABEL, PIECE_MARK, PLAYABLE_PIECE_TYPES, defaultFacingForSide, paletteForSide, pieceSpritePath, type PlayablePieceType } from '../core/pieces';
import { familyIdForAsset, tileSocketsForAsset, type TileFamilyId } from '../core/tileSockets';
import { useSkirmish } from '../game/store';
import { useSkirmishView } from '../game/skirmishView';
import { provisionalBoard, premoveArrows, premoveGhosts, premoveTargets, type PremoveArrow } from '../game/premoves';
import { clientSide, opponentSide } from '../game/clientPerspective';
import { BoardLabBoard, boardLabCellPosition, immutableBoardLabTerrainSrc } from './BoardLabBoard';
import { terrainSideSrc, terrainTopSrc } from './BoardTerrainLayer';
import { boundsForOps, drawBoardOps, isAnimatedGroundCoverOp, loadCanvasImage } from './BoardCanvasLayer';
import { objectBaseZIndex } from './sceneDepth';
import { ViewPane } from '../ui/shared/ViewPane';
import { useBoardArtReveal } from './boardArtReady';
import { groundCoverSet } from '../core/groundCover';
import { featureFrameSrc, fenceFrameSrc, fencePostSrc, wallFrameSrc } from '../art/tileset';
import { resolveFeatureOverlays, resolveFenceOverlays, resolveFencePosts, resolveWallOverlays, type FeatureKind, type FeatureMaterial, type ResolvedFeatureOverlay, type ResolvedFenceOverlay, type ResolvedFencePost, type ResolvedWallOverlay } from '../core/featureAutotile';
import { wallArtSrcs } from '../core/wallArt';
import { decodeBoard, type EditorBoard } from '../ui/boardCode';
import { unitAnchorFraction, unitAssetById } from '../ui/unitCatalog';
import {
  predrawnBoardCoverPolygon,
  runtimePredrawnBoardPlate,
  type PredrawnBoardCornerRegistration,
  type PredrawnBoardPlate,
} from './PredrawnBoardLayer';
import {
  TERRAIN_SIDE_FACES,
  UNIT_IMG_MAX_H,
  UNIT_IMG_MAX_W,
  boardBounds,
  boardDrawOps,
  mirrorFacingPlan,
  mirrorSurfacesForPlacements,
  predrawnOcclusionMaskOps,
  reflectedOpsForSubjects,
  unprojectBoardPoint,
  type BakeBounds,
  type BoardDrawOp,
  type MirrorReflectionSubject,
  withoutBoardDrawLayers,
} from '@chess-tactics/board-render';

const TERRAIN_TO_FAMILY: Record<Exclude<TerrainType, 'void'>, TileFamilyId> = {
  grass: 'grass',
  road: 'stone',
  stone: 'stone',
  bridge: 'stone',
  cliff: 'stone',
  rock: 'stone',
  water: 'water',
  dirt: 'dirt',
  pebble: 'pebble',
  sand: 'sand',
};

function terrainFamilyForGame(terrain: TerrainType | undefined): TileFamilyId | null {
  if (!terrain || terrain === 'void') return null;
  return TERRAIN_TO_FAMILY[terrain];
}

const tileAssetById = new Map(tileAssets.map((asset) => [asset.id, asset]));

function isPlayablePieceType(type: Piece['type']): type is PlayablePieceType {
  return (PLAYABLE_PIECE_TYPES as readonly Piece['type'][]).includes(type);
}

type DirectionalPieceAppearance = {
  facing: UnitFacing;
  spriteForFacing: (facing: UnitFacing) => string;
};

/** Resolve the canonical eight-way appearance shared by the physical unit and every mirror face.
 * Nondirectional obstacles are deliberately excluded from the mirror subject set. */
function directionalPieceAppearance(piece: Piece): DirectionalPieceAppearance | null {
  if (isPropCollider(piece) || piece.side === 'neutral' || !isPlayablePieceType(piece.type)) return null;
  const palette = paletteForSide(piece.side, piece.palette);
  return {
    facing: piece.facing ?? defaultFacingForSide(piece.side),
    spriteForFacing: (facing) => pieceSpritePath(piece.type as PlayablePieceType, palette, facing),
  };
}

/** Exact alternate directional assets a live canvas frame can request for the active mirror faces.
 * These must be loaded before the first paint; loading only the physical-facing sprite leaves the
 * corrected reflection absent until some unrelated later redraw. */
export function mirrorSpriteSourcesForPiece(
  piece: Piece,
  faces: readonly ('west' | 'north')[],
): string[] {
  const appearance = directionalPieceAppearance(piece);
  if (!appearance) return [];
  return faces.map((face) => appearance.spriteForFacing(
    mirrorFacingPlan(face, appearance.facing).sourceFacing,
  ));
}

// Neutral rocks: two boulder variants x 8 rotations. Pick deterministically from the
// piece id so each rock on the board looks distinct (no repeated-blob feel) yet stays
// stable across re-renders.
const ROCK_VARIANTS = ['boulder', 'granite'] as const;
const ROCK_DIRECTIONS = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'] as const;
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rockSpritePath(piece: Piece): string {
  const h = hashId(piece.id);
  const variant = ROCK_VARIANTS[h % ROCK_VARIANTS.length];
  const dir = ROCK_DIRECTIONS[(h >>> 5) % ROCK_DIRECTIONS.length];
  return `/assets/units/rock/${variant}/${dir}.png`;
}

// Prop colliders are neutral `rock` pieces stamped under a multi-cell prop (id `prop-…`); their
// VISUAL is the one tall PropSprite, so the collider itself must draw nothing — without this
// guard the rock branch below would paint a phantom boulder on every footprint cell.
const isPropCollider = (piece: Piece): boolean => piece.id.startsWith('prop-');

function pieceImageSrc(piece: Piece): string | null {
  if (isPropCollider(piece)) return null;
  if (piece.type === 'rock' || piece.type === 'random-rock') return rockSpritePath(piece);
  const appearance = directionalPieceAppearance(piece);
  return appearance?.spriteForFacing(appearance.facing) ?? null;
}

export type SkirmishTileClickIntent =
  | { kind: 'move' }
  | { kind: 'select'; pieceId: string }
  | { kind: 'focus'; pieceId: string }
  | { kind: 'clear-selection' };

/**
 * Resolve a live-board click before applying store actions. A legal destination still
 * wins over the occupant at that square (captures), and friendly pieces remain directly
 * selectable. Empty and neutral squares dismiss the current movement selection, while an
 * opponent remains an independent inspection focus.
 */
export function skirmishTileClickIntent(
  x: number,
  y: number,
  selectedMoves: readonly Pick<Move, 'x' | 'y'>[],
  occupant: Pick<Piece, 'id' | 'side'> | undefined,
  localSide: Side,
): SkirmishTileClickIntent {
  if (selectedMoves.some((move) => move.x === x && move.y === y)) return { kind: 'move' };
  if (occupant?.side === localSide) return { kind: 'select', pieceId: occupant.id };
  if (occupant && occupant.side !== 'neutral') return { kind: 'focus', pieceId: occupant.id };
  return { kind: 'clear-selection' };
}

/** Union one simulation side's overlay cells. The caller chooses sides through client perspective. */
export function skirmishArmyOverlaySet(
  pieces: readonly Piece[],
  side: Side,
  tilesFor: (piece: Piece) => readonly Vec[],
): Set<string> {
  const out = new Set<string>();
  for (const piece of livingPieces(pieces, side)) {
    for (const tile of tilesFor(piece)) out.add(`${tile.x},${tile.y}`);
  }
  return out;
}

function terrainMapForGame(game: GameState): TileFamilyId[] {
  const byKey = new Map((game.terrain ?? []).map((cell) => [`${cell.x},${cell.y}`, terrainFamilyForGame(cell.terrain)]));
  const map: TileFamilyId[] = [];
  for (let y = 0; y < game.size.rows; y += 1) {
    for (let x = 0; x < game.size.cols; x += 1) {
      map.push(byKey.get(`${x},${y}`) ?? 'grass');
    }
  }
  return map;
}

function voidTerrainKeys(game: GameState): Set<string> {
  return new Set((game.terrain ?? []).filter((cell) => cell.terrain === 'void').map((cell) => `${cell.x},${cell.y}`));
}

function legacyFeatureMapForGame(game: GameState): Map<string, { kind: FeatureKind; material: FeatureMaterial }> | undefined {
  const map = new Map<string, { kind: FeatureKind; material: FeatureMaterial }>();
  for (const cell of game.terrain ?? []) {
    if (cell.terrain === 'road') map.set(`${cell.x},${cell.y}`, { kind: 'road', material: 'cobble' });
  }
  return map.size ? map : undefined;
}

function featureOverlaysForBoard(board: EditorBoard): Record<string, ResolvedFeatureOverlay> {
  const isSevered = (edge: string): boolean => board.featureCuts[edge] === true;
  const isExit = (edge: string): boolean => board.featureExits[edge] === true;
  return resolveFeatureOverlays(board.features, isSevered, isExit);
}

function resolveBoardCode(game: GameState): EditorBoard | null {
  if (!game.boardCode) return null;
  const board = decodeBoard(game.boardCode);
  if (!board || board.cols !== game.size.cols || board.rows !== game.size.rows) return null;
  return board;
}

function coverMapForGame(game: GameState, exactBoard: EditorBoard | null): Map<string, 'sparse' | 'filled'> {
  if (exactBoard) return new Map(Object.entries(exactBoard.cover));
  return new Map((game.terrain ?? []).filter((cell) => cell.cover).map((cell) => [`${cell.x},${cell.y}`, cell.cover!.density]));
}

function resolveSkirmishGroundCover(
  result: SocketBoardResult<TileAsset>,
  game: GameState,
  seed: number,
  exactBoard: EditorBoard | null,
): SocketBoardResult<TileAsset> {
  // Resolve ambient ground cover ONCE here (placement/build time), not per render.
  // Painted cover (level data) is authoritative; a level with NO cover painted at all
  // falls back to a low-frequency density field so generated/legacy boards still grow grass.
  const painted = coverMapForGame(game, exactBoard);
  const hasPainted = exactBoard ? true : painted.size > 0;
  resolveGroundCover(result.cells, seed, (cell) =>
    painted.get(`${cell.x},${cell.y}`) ?? (hasPainted ? null : densityFieldAt(cell.x, cell.y, seed)),
  );
  const voids = voidTerrainKeys(game);
  if (voids.size > 0) {
    for (const cell of result.cells) {
      if (!voids.has(`${cell.x},${cell.y}`)) continue;
      cell.asset = undefined;
      cell.sideAssets = undefined;
      cell.feature = undefined;
      cell.groundCover = undefined;
      cell.missing = undefined;
    }
  }
  return result;
}

function coverMapRecordForGame(game: GameState, exactBoard: EditorBoard | null): Record<string, 'sparse' | 'filled'> {
  if (exactBoard) return { ...exactBoard.cover };
  const cover: Record<string, 'sparse' | 'filled'> = {};
  for (const cell of game.terrain ?? []) {
    if (cell.cover) cover[`${cell.x},${cell.y}`] = cell.cover.density;
  }
  return cover;
}

function sceneBoardForSkirmish(
  game: GameState,
  board: SocketBoardResult<TileAsset>,
  exactBoard: EditorBoard | null,
): EditorBoard {
  const predrawn = exactBoard?.surface?.kind === 'predrawn';
  const cells: Record<string, string> = {};
  const coverTypes: Record<string, TileFamilyId> = {};
  for (const cell of board.cells) {
    const key = `${cell.x},${cell.y}`;
    if (cell.asset) cells[key] = cell.asset.id;
    if (cell.terrain) coverTypes[key] = cell.terrain;
  }

  return {
    cols: game.size.cols,
    rows: game.size.rows,
    playerFaction: exactBoard?.playerFaction,
    factionDirections: exactBoard?.factionDirections ?? {},
    cells,
    surface: exactBoard?.surface,
    macroTiles: exactBoard?.macroTiles,
    units: {},
    doodads: {},
    props: Object.fromEntries((game.props ?? []).map((prop) => [`${prop.x},${prop.y}`, { propId: prop.propId }])),
    cover: coverMapRecordForGame(game, exactBoard),
    coverTypes: exactBoard?.coverTypes ?? coverTypes,
    features: exactBoard?.features ?? {},
    fences: predrawn ? {} : exactBoard?.fences ?? {},
    fencePosts: predrawn ? {} : exactBoard?.fencePosts ?? {},
    walls: predrawn ? {} : exactBoard?.walls ?? {},
    wallArt: predrawn ? {} : exactBoard?.wallArt ?? {},
    featureCuts: exactBoard?.featureCuts ?? {},
    featureExits: exactBoard?.featureExits ?? {},
    zoneEntries: exactBoard?.zoneEntries ?? [],
    zones: exactBoard?.zones ?? {},
    generatedRegions: exactBoard?.generatedRegions ?? [],
  };
}

function sceneArtUrls(sceneBoard: EditorBoard, seed: number, ambientCover: boolean): string[] {
  return [...new Set(skirmishStaticSceneOps(sceneBoard, seed, ambientCover).map((op) => op.src))];
}

function skirmishStaticSceneOps(sceneBoard: EditorBoard, seed: number, ambientCover: boolean): BoardDrawOp[] {
  return withoutBoardDrawLayers(
    boardDrawOps(sceneBoard, { coverSeed: seed, ambientCover }),
    'terrain',
    'linear-feature',
  );
}

function generatedSkirmishBoard(game: GameState, seed: number): SocketBoardResult<TileAsset> {
  return solveSocketBoard({
    assets: tileAssets,
    terrainMap: terrainMapForGame(game),
    seed,
    columns: game.size.cols,
    rows: game.size.rows,
    familyAssets: tileFamilies,
    featureMap: legacyFeatureMapForGame(game),
    edgeAssets: edgeTiles,
    muralEdges: muralTiles,
  });
}

function exactSkirmishBoard(
  game: GameState,
  seed: number,
  exactBoard: EditorBoard,
  base: SocketBoardResult<TileAsset>,
): SocketBoardResult<TileAsset> {
  const featureOverlays = featureOverlaysForBoard(exactBoard);
  const cells: SocketBoardCell<TileAsset>[] = base.cells.map((cell) => {
    const key = `${cell.x},${cell.y}`;
    const exactAsset = tileAssetById.get(exactBoard.cells[key]);
    const feature = featureOverlays[key] ?? undefined;
    if (!exactAsset) return { ...cell, feature };

    const terrain = familyIdForAsset(exactAsset, tileFamilies);
    return {
      ...cell,
      asset: exactAsset,
      sideAssets: undefined,
      terrain,
      sockets: tileSocketsForAsset(exactAsset, tileFamilies),
      feature,
      missing: undefined,
    };
  });

  return resolveSkirmishGroundCover({
    cells,
    fallbacks: base.fallbacks,
    stats: {
      placed: cells.length,
      missingPlacements: cells.filter((cell) => !cell.asset).length,
      illegalEdges: countIllegalEdges(cells, tileFamilies),
      candidateAssets: base.stats.candidateAssets,
    },
  }, game, seed, exactBoard);
}

export function buildSkirmishBoard(game: GameState, seed: number): SocketBoardResult<TileAsset> {
  const base = generatedSkirmishBoard(game, seed);
  const exactBoard = resolveBoardCode(game);
  if (!exactBoard) return resolveSkirmishGroundCover(base, game, seed, null);
  return exactSkirmishBoard(game, seed, exactBoard, base);
}

// Every image URL the board will draw, split into the STABLE tile set (terrain/seed —
// unchanged by play) and the live unit set (changes on capture). The reveal arms on the
// tile signature so it fires once per board, not once per move; the full list is what we
// preload so units don't popcorn in on the first paint either. Terrain URLs match the
// sources BoardTerrainLayer consumes: split top/side frames plus feature and edge art.
function collectBoardArt(
  board: SocketBoardResult<TileAsset>,
  livePieces: readonly Piece[],
  fenceOverlays: ReadonlyMap<string, ResolvedFenceOverlay>,
  fencePosts: ReadonlyMap<string, ResolvedFencePost>,
  wallOverlays: ReadonlyMap<string, ResolvedWallOverlay>,
  wallArtUrls: readonly string[],
  sceneUrls: readonly string[],
  occlusionUrls: readonly string[],
  predrawnSrc?: string,
): { urls: string[]; signature: string } {
  const tiles = new Set<string>();
  for (const url of sceneUrls) tiles.add(url);
  for (const url of occlusionUrls) tiles.add(url);
  if (predrawnSrc) {
    tiles.add(predrawnSrc);
  } else {
    for (const fence of fenceOverlays.values()) tiles.add(fenceFrameSrc(fence.material, fence.mask));
    for (const post of fencePosts.values()) tiles.add(fencePostSrc(post.material));
    for (const wall of wallOverlays.values()) tiles.add(wallFrameSrc(wall.material, wall.mask));
    for (const url of wallArtUrls) tiles.add(url);
    for (const cell of board.cells) {
      if (cell.asset) {
        const top = tileFrameSrc(cell.asset);
        tiles.add(immutableBoardLabTerrainSrc(terrainTopSrc(top, cell.asset.topAnimFrames)));
        for (const face of TERRAIN_SIDE_FACES) {
          const side = tileFrameSrc(cell.sideAssets?.[face] ?? cell.asset);
          tiles.add(immutableBoardLabTerrainSrc(terrainSideSrc(side)));
        }
      }
      if (cell.feature) tiles.add(featureFrameSrc(cell.feature.kind, cell.feature.material, cell.feature.mask));
      const cover = cell.groundCover;
      if (cover) {
        const set = groundCoverSet(cell.terrain);
        if (set) for (const tuft of cover.tufts) {
          const variant = set.variants.find((entry) => entry.id === tuft.variant);
          if (variant) tiles.add(variant.src);
        }
      }
    }
  }
  const units = new Set<string>();
  for (const piece of livePieces) {
    const src = pieceImageSrc(piece);
    if (src) units.add(src);
  }
  return {
    urls: [...new Set([...tiles, ...units])],
    signature: [...tiles].sort().join('|'),
  };
}

// Deploy choreography: when the board first reveals, the armies arrive in a staggered
// wave rather than all popping in at once (see ADR — board-start unit arrival). Order is
// communication: the PLAYER force lands first (back row → forward), then the ENEMY answers
// from its edge, each wave ending on its royal piece (king/queen) as a focal accent — so the
// motion alone teaches mine-vs-theirs and turn-taking before turn 1. Neutral rocks are
// scenery, not deploying units, so they get no drop (null delay → they just appear with the
// board). Timing is bounded (~1.2s total) and presentation-only — board state and input are
// live immediately, so the sequence never gates play.
const ARRIVAL_BASE_MS = 400; // first unit lands AFTER the board reveal (veil/board fade) has finished
const ARRIVAL_WAVE_GAP_MS = 240; // the enemy wave answers this long after the player wave starts
const ARRIVAL_STEP_MS = 50; // per-unit stagger within a wave
// The spawn→drop keyframe (unit-arrival) is ~620ms; the land impact is at ~85% of it —
// that fraction is where the per-unit sound cue + landing effect will hook in (see style.css).
export const ARRIVAL_TOTAL_MS = 1700; // upper bound: hold `is-arriving` at least this long

// Drag-to-move tuning. The threshold keeps a small wobble on a tap from becoming a drag, so
// click-select → click-move is untouched; the ghost defaults are only a fallback size for when
// the on-screen sprite can't be measured at pick-up.
const DRAG_THRESHOLD_PX = 6;
const DEFAULT_GHOST_W = 72;
const DEFAULT_GHOST_H = 86;

const isRoyal = (type: Piece['type']): boolean => type === 'king' || type === 'queen';

function computeArrivalDelays(pieces: readonly Piece[]): Map<string, number> {
  const delays = new Map<string, number>();
  (['player', 'enemy'] as const).forEach((side, wave) => {
    const group = pieces.filter((p) => p.side === side && p.type !== 'rock' && p.type !== 'random-rock');
    // Order within the wave: by rows out from the home edge (startY), royals last.
    group.sort((a, b) => {
      if (isRoyal(a.type) !== isRoyal(b.type)) return isRoyal(a.type) ? 1 : -1;
      const da = Math.abs(a.y - (a.startY ?? a.y));
      const db = Math.abs(b.y - (b.startY ?? b.y));
      return da !== db ? da - db : a.x - b.x;
    });
    const waveBase = ARRIVAL_BASE_MS + wave * ARRIVAL_WAVE_GAP_MS;
    group.forEach((p, i) => delays.set(p.id, waveBase + i * ARRIVAL_STEP_MS));
  });
  return delays;
}

// The queued premove chain, drawn chess.com-style: one arrow per step, from the piece's
// provisional square to its destination. Rendered inside the board's transformed space
// (the same board projection as the scene canvas) so it tracks zoom/pan for free.
// Placeholder art — a flat stroked line + arrowhead — pending a richer treatment.
function PremoveArrowLayer({ arrows }: { arrows: PremoveArrow[] }) {
  if (!arrows.length) return null;
  return (
    <svg
      className="premove-arrow-layer"
      style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: 32000 }}
      aria-hidden="true"
    >
      <defs>
        <marker id="premove-arrowhead" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 Z" className="premove-arrowhead-fill" />
        </marker>
      </defs>
      {arrows.map((arrow, i) => {
        const from = boardLabCellPosition(arrow.from);
        const to = boardLabCellPosition(arrow.to);
        return (
          <line
            key={`${arrow.from.x},${arrow.from.y}->${arrow.to.x},${arrow.to.y}-${i}`}
            x1={from.left}
            y1={from.top}
            x2={to.left}
            y2={to.top}
            className="premove-arrow"
            markerEnd="url(#premove-arrowhead)"
          />
        );
      })}
    </svg>
  );
}

// When more than one unit plans the same tile, the tile is SPLIT between them (up to 4) —
// symmetric board-space offsets (px) from the tile centre + a scale so they fit side by side.
const GHOST_SLOTS: Record<number, ReadonlyArray<{ dx: number; dy: number }>> = {
  1: [{ dx: 0, dy: 0 }],
  2: [{ dx: -18, dy: 0 }, { dx: 18, dy: 0 }],
  3: [{ dx: 0, dy: -11 }, { dx: -18, dy: 9 }, { dx: 18, dy: 9 }],
  4: [{ dx: -17, dy: -10 }, { dx: 17, dy: -10 }, { dx: -17, dy: 10 }, { dx: 17, dy: 10 }],
};
const ghostScaleFor = (count: number): number => (count >= 3 ? 0.5 : count === 2 ? 0.62 : 1);

const UNIT_SEAT_W = 72;
const UNIT_SEAT_H = 86;
// Neutral rocks are local obstacle art, not one of the six live-catalog chess families.
// Keep the legacy board-seat contact point that positioned them before live unit anchors.
const ROCK_ANCHOR_X = 0.5;
const ROCK_ANCHOR_Y = 0.78;
const SCENE_BOUNDS_PAD = 96;
const ARRIVAL_ANIM_MS = 620;

type PieceMotion = {
  gridX: number;
  gridY: number;
  startLeft: number;
  startTop: number;
  targetLeft: number;
  targetTop: number;
  startTime: number;
  duration: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function easeInQuad(t: number): number {
  const v = clamp01(t);
  return v * v;
}

function motionSeat(motion: PieceMotion, timeMs: number): { left: number; top: number; progress: number; active: boolean } {
  if (motion.duration <= 0) return { left: motion.targetLeft, top: motion.targetTop, progress: 1, active: false };
  const progress = clamp01((timeMs - motion.startTime) / motion.duration);
  const eased = easeOutCubic(progress);
  return {
    left: lerp(motion.startLeft, motion.targetLeft, eased),
    top: lerp(motion.startTop, motion.targetTop, eased),
    progress,
    active: progress < 1,
  };
}

/** Build a live mirror subject from the animated seat itself, so corridor membership changes at
 * the exact point where a moving piece crosses a grid-axis boundary rather than at move commit. */
export function mirrorSubjectForSeat(
  op: BoardDrawOp,
  seat: { left: number; top: number },
  piece: Piece,
): MirrorReflectionSubject | null {
  const appearance = directionalPieceAppearance(piece);
  if (!appearance) return null;
  return {
    op,
    grid: unprojectBoardPoint(seat),
    seat,
    ...appearance,
  };
}

function moveHopOffset(progress: number, side: Piece['side']): number {
  const peak = side === 'enemy' ? -12 : -16;
  if (progress <= 0 || progress >= 1) return 0;
  return Math.sin(progress * Math.PI) * peak;
}

function arrivalOffset(timeMs: number, startMs: number | null, delayMs: number | undefined): { dy: number; opacity: number } {
  if (startMs == null || delayMs == null) return { dy: 0, opacity: 1 };
  const elapsed = timeMs - startMs - delayMs;
  if (elapsed < 0) return { dy: -60, opacity: 0 };
  const progress = clamp01(elapsed / ARRIVAL_ANIM_MS);
  if (progress < 0.26) return { dy: -60, opacity: progress / 0.26 };
  if (progress < 0.46) return { dy: -60, opacity: 1 };
  if (progress < 0.82) {
    const fall = easeInQuad((progress - 0.46) / 0.36);
    return { dy: lerp(-60, 0, fall), opacity: 1 };
  }
  return { dy: 0, opacity: 1 };
}

export function pieceOp(
  piece: Piece,
  seat: { left: number; top: number },
  options: { dy?: number; opacity?: number; scale?: number } = {},
): BoardDrawOp | null {
  const src = pieceImageSrc(piece);
  if (!src) return null;
  const instanceScale = options.scale ?? 1;
  const unit = unitAssetById(piece.type);
  const isRock = piece.type === 'rock' || piece.type === 'random-rock';
  if (!unit && !isRock) throw new Error(`live unit metadata is missing: ${piece.type}`);
  if (isRock) {
    const dw = UNIT_SEAT_W * instanceScale;
    const dh = UNIT_SEAT_H * instanceScale;
    return {
      layer: 'scene',
      src,
      dx: seat.left - dw * ROCK_ANCHOR_X,
      dy: seat.top - dh * ROCK_ANCHOR_Y + (options.dy ?? 0),
      dw,
      dh,
      z: objectBaseZIndex(piece),
      contain: true,
      opacity: options.opacity,
    };
  }
  const logicalScale = instanceScale * (unit!.defaultScale / 100);
  const seatScale = logicalScale * (unit!.nativeScalePercent / 100);
  const seatW = UNIT_SEAT_W * seatScale;
  const seatH = UNIT_SEAT_H * seatScale;
  const imageW = Math.min(UNIT_IMG_MAX_W, unit!.footprint.sourceCanvasPx) * logicalScale;
  const imageH = Math.min(UNIT_IMG_MAX_H, unit!.footprint.sourceCanvasHeightPx) * logicalScale;
  const seatLeft = seat.left - seatW * unitAnchorFraction(unit!.unitAnchorX);
  const seatTop = seat.top - seatH * unitAnchorFraction(unit!.unitAnchorY);
  return {
    layer: 'scene',
    src,
    dx: seatLeft + (seatW - imageW) / 2,
    dy: seatTop + (seatH - imageH) / 2 + (options.dy ?? 0),
    dw: imageW,
    dh: imageH,
    z: objectBaseZIndex(piece),
    contain: true,
    opacity: options.opacity,
  };
}

function padBounds(bounds: BakeBounds): BakeBounds {
  return {
    minX: bounds.minX - SCENE_BOUNDS_PAD,
    minY: bounds.minY - SCENE_BOUNDS_PAD,
    width: bounds.width + SCENE_BOUNDS_PAD * 2,
    height: bounds.height + SCENE_BOUNDS_PAD * 2,
  };
}

function targetPieceOps(livePieces: readonly Piece[], afterGhosts: ReturnType<typeof premoveGhosts>): BoardDrawOp[] {
  const ops: BoardDrawOp[] = [];
  for (const piece of livePieces) {
    const op = pieceOp(piece, boardLabCellPosition(piece));
    if (op) ops.push(op);
  }
  for (const group of afterGhosts) {
    group.pieces.forEach((piece, i) => {
      const off = (GHOST_SLOTS[group.pieces.length] ?? GHOST_SLOTS[1])[i] ?? { dx: 0, dy: 0 };
      const { left, top } = boardLabCellPosition(piece);
      const op = pieceOp(piece, { left: left + off.dx, top: top + off.dy }, { scale: ghostScaleFor(group.pieces.length) });
      if (op) ops.push(op);
    });
  }
  return ops;
}

function SkirmishSceneLayer({
  sceneBoard,
  seed,
  ambientCover,
  livePieces,
  arriving,
  arrivalDelays,
  draggingId,
  noHopId,
  premovedIds,
  afterGhosts,
  occlusionMasks,
}: {
  sceneBoard: EditorBoard;
  seed: number;
  ambientCover: boolean;
  livePieces: readonly Piece[];
  arriving: boolean;
  arrivalDelays: ReadonlyMap<string, number>;
  draggingId: string | null;
  noHopId: string | null;
  premovedIds: ReadonlySet<string>;
  afterGhosts: ReturnType<typeof premoveGhosts>;
  occlusionMasks: readonly BoardDrawOp[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionRef = useRef<Map<string, PieceMotion>>(new Map());
  const arrivalStartRef = useRef<number | null>(null);
  const staticOps = useMemo(() => skirmishStaticSceneOps(sceneBoard, seed, ambientCover), [ambientCover, sceneBoard, seed]);
  const mirrorSurfaces = useMemo(
    () => mirrorSurfacesForPlacements(sceneBoard.wallArt, { cols: sceneBoard.cols, rows: sceneBoard.rows })
      .filter((surface) => surface.segments.every((segment) => !segment.edge || Boolean(sceneBoard.walls?.[segment.edge]))),
    [sceneBoard],
  );
  const bounds = useMemo(() => {
    const fallback = boardBounds(sceneBoard, { coverSeed: seed, ambientCover });
    return padBounds(boundsForOps([...staticOps, ...targetPieceOps(livePieces, afterGhosts)], fallback));
  }, [afterGhosts, ambientCover, livePieces, sceneBoard, seed, staticOps]);

  useEffect(() => {
    arrivalStartRef.current = arriving ? performance.now() : null;
  }, [arriving]);

  useEffect(() => {
    const now = performance.now();
    const nextIds = new Set(livePieces.map((piece) => piece.id));
    for (const piece of livePieces) {
      const target = boardLabCellPosition(piece);
      const existing = motionRef.current.get(piece.id);
      if (!existing) {
        motionRef.current.set(piece.id, {
          gridX: piece.x,
          gridY: piece.y,
          startLeft: target.left,
          startTop: target.top,
          targetLeft: target.left,
          targetTop: target.top,
          startTime: now,
          duration: 0,
        });
        continue;
      }
      if (existing.gridX === piece.x && existing.gridY === piece.y) continue;
      const current = motionSeat(existing, now);
      const snap = noHopId === piece.id;
      motionRef.current.set(piece.id, {
        gridX: piece.x,
        gridY: piece.y,
        startLeft: snap ? target.left : current.left,
        startTop: snap ? target.top : current.top,
        targetLeft: target.left,
        targetTop: target.top,
        startTime: now,
        duration: snap ? 0 : piece.side === 'enemy' ? 460 : 360,
      });
    }
    for (const id of motionRef.current.keys()) {
      if (!nextIds.has(id)) motionRef.current.delete(id);
    }
  }, [livePieces, noHopId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    let cancelled = false;
    let raf = 0;
    const unitSources = [
      ...livePieces.map(pieceImageSrc),
      ...afterGhosts.flatMap((group) => group.pieces.map(pieceImageSrc)),
    ].filter((src): src is string => !!src);
    const mirrorFaces = [...new Set(mirrorSurfaces.map((surface) => surface.face))];
    const reflectedUnitSources = livePieces.flatMap((piece) => mirrorSpriteSourcesForPiece(piece, mirrorFaces));
    const sources = [...new Set([
      ...staticOps.map((op) => op.src),
      ...occlusionMasks.map((op) => op.src),
      ...unitSources,
      ...reflectedUnitSources,
    ])];
    const hasAnimatedGroundCover = staticOps.some(isAnimatedGroundCoverOp);

    const frameOps = (timeMs: number): BoardDrawOp[] => {
      const ops: BoardDrawOp[] = [...staticOps];
      const physicalPieceOps: BoardDrawOp[] = [];
      const reflectionSubjects: MirrorReflectionSubject[] = [];
      for (const piece of livePieces) {
        const target = boardLabCellPosition(piece);
        const motion = motionRef.current.get(piece.id) ?? {
          gridX: piece.x,
          gridY: piece.y,
          startLeft: target.left,
          startTop: target.top,
          targetLeft: target.left,
          targetTop: target.top,
          startTime: timeMs,
          duration: 0,
        };
        const seat = motionSeat(motion, timeMs);
        const arrival = arrivalOffset(timeMs, arrivalStartRef.current, arrivalDelays.get(piece.id));
        const baseOpacity = draggingId === piece.id ? 0.3 : premovedIds.has(piece.id) ? 0.4 : 1;
        const op = pieceOp(piece, seat, {
          dy: moveHopOffset(seat.progress, piece.side) + arrival.dy,
          opacity: baseOpacity * arrival.opacity,
        });
        if (op) {
          physicalPieceOps.push(op);
          const reflectionSubject = mirrorSubjectForSeat(op, seat, piece);
          if (reflectionSubject) reflectionSubjects.push(reflectionSubject);
        }
      }
      ops.push(...reflectedOpsForSubjects(mirrorSurfaces, reflectionSubjects));
      ops.push(...physicalPieceOps);
      for (const group of afterGhosts) {
        group.pieces.forEach((piece, i) => {
          const off = (GHOST_SLOTS[group.pieces.length] ?? GHOST_SLOTS[1])[i] ?? { dx: 0, dy: 0 };
          const { left, top } = boardLabCellPosition(piece);
          const op = pieceOp(piece, { left: left + off.dx, top: top + off.dy }, {
            opacity: 0.55,
            scale: ghostScaleFor(group.pieces.length),
          });
          if (op) ops.push(op);
        });
      }
      return ops.sort((a, b) => a.z - b.z);
    };

    const hasActiveMotion = (timeMs: number): boolean => {
      for (const motion of motionRef.current.values()) {
        if (motionSeat(motion, timeMs).active) return true;
      }
      return false;
    };

    void Promise.all(sources.map(async (src): Promise<[string, HTMLImageElement]> => [src, await loadCanvasImage(src)])).then((entries) => {
      const images = new Map(entries);
      const tick = (timeMs: number): void => {
        if (cancelled) return;
        drawBoardOps(ctx, frameOps(timeMs), bounds, images, timeMs, undefined, occlusionMasks);
        if (hasAnimatedGroundCover || arriving || hasActiveMotion(timeMs)) {
          raf = window.requestAnimationFrame(tick);
        }
      };
      tick(performance.now());
    });

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [afterGhosts, arrivalDelays, arriving, bounds, draggingId, livePieces, mirrorSurfaces, occlusionMasks, premovedIds, staticOps]);

  return (
    <canvas
      ref={canvasRef}
      className="tileset-scene-layer"
      width={bounds.width}
      height={bounds.height}
      style={{ left: `${bounds.minX}px`, top: `${bounds.minY}px`, width: `${bounds.width}px`, height: `${bounds.height}px` }}
      aria-hidden="true"
    />
  );
}

export function SkirmishBoard({
  interactive = true,
  predrawnReview,
}: {
  interactive?: boolean;
  predrawnReview?: {
    src: string;
    registration?: PredrawnBoardCornerRegistration;
  };
} = {}) {
  // Board-view state lives in the shared view store so the HUD's "View" tab owns
  // the controls and the playfield stays clean of floating buttons.
  const showMoves = useSkirmishView((s) => s.showMoves);
  const showEnemyAttacks = useSkirmishView((s) => s.showEnemyAttacks);
  const showBlocked = useSkirmishView((s) => s.showBlocked);
  const showEnemyMoves = useSkirmishView((s) => s.showEnemyMoves);
  const showPlayerAttacks = useSkirmishView((s) => s.showPlayerAttacks);
  const showPlayerMoves = useSkirmishView((s) => s.showPlayerMoves);
  const showPromotionZones = useSkirmishView((s) => s.showPromotionZones);
  const showGrid = useSkirmishView((s) => s.showGrid);
  const boardZoom = useSkirmishView((s) => s.zoom);
  const boardMaxZoom = useSkirmishView((s) => s.maxZoom);
  const boardPan = useSkirmishView((s) => s.pan);
  const setZoom = useSkirmishView((s) => s.setZoom);
  const setMinZoom = useSkirmishView((s) => s.setMinZoom);
  const setBoardPan = useSkirmishView((s) => s.setPan);
  const game = useSkirmish((s) => s.game);
  const env = useSkirmish((s) => s.env);
  const selectedId = useSkirmish((s) => s.selectedId);
  const focusedId = useSkirmish((s) => s.focusedId);
  const pendingPromotion = useSkirmish((s) => s.pendingPromotion);
  const seed = useSkirmish((s) => s.seed);
  const select = useSkirmish((s) => s.select);
  const focus = useSkirmish((s) => s.focus);
  const tryMoveTo = useSkirmish((s) => s.tryMoveTo);
  const premoves = useSkirmish((s) => s.premoves);
  const premoveInputOpen = useSkirmish((s) => s.premoveInputOpen);
  const queueMove = useSkirmish((s) => s.queueMove);
  const clearPremoves = useSkirmish((s) => s.clearPremoves);
  // Premove building: which provisional-board piece the player is queueing from. This stays
  // component-local because queued pieces can be rendered at ghost destinations, but clicks also
  // mirror into the store selection so the chosen unit survives the async enemy-reply boundary.
  const [premoveSelectedId, setPremoveSelectedId] = useState<string | null>(null);
  const net = useSkirmish((s) => s.net);
  // The side THIS client controls: 'player' in single-player, or its lobby seat in
  // netplay (host='player', guest='enemy'). Interaction (selecting, move highlights,
  // committing) is gated to this side, not the literal 'player'.
  const localSide = clientSide(net);
  const remoteSide = opponentSide(localSide);
  const netMovePending = !!net?.pendingMove;
  // Selection can also be cleared outside this component (for example, the HUD's R shortcut).
  // Mirror that into the provisional premove selection so "Deselect all" removes every ring and
  // target set without discarding premove steps that are already queued.
  useEffect(() => { if (selectedId === null) setPremoveSelectedId(null); }, [selectedId]);
  // Drag-to-move (coexists with click-select → click-move). The live gesture is tracked in a
  // ref (mutated freely without re-rendering the board every pointer frame); `drag` state only
  // flips on/off at pick-up/drop so the ghost mounts and the origin piece fades. Only ONE drag
  // runs at a time — a second concurrent pointer (multi-touch) is ignored while dragRef is set,
  // so it can't hijack the single slot. The ghost follows the cursor imperatively (per frame);
  // the drop-target cell is React state (dropHoverKey) so a re-render can't clobber it.
  const dragRef = useRef<{
    pointerId: number;
    pieceId: string;
    startX: number;
    startY: number;
    active: boolean;
    targets: Set<string>;
    src: string | null;
    side: Piece['side'];
    /** True when this drag is queuing a PREMOVE (opponent's turn) rather than moving now. */
    premove: boolean;
  } | null>(null);
  const ghostRef = useRef<HTMLImageElement | null>(null);
  const lastCursorRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);
  const [drag, setDrag] = useState<{
    pieceId: string;
    src: string | null;
    side: Piece['side'];
    w: number;
    h: number;
  } | null>(null);
  const [dropHoverKey, setDropHoverKey] = useState<string | null>(null);
  const [dropAimKey, setDropAimKey] = useState<string | null>(null);
  useEffect(() => {
    if (interactive) return;
    dragRef.current = null;
    setDrag(null);
    setDropAimKey(null);
    setDropHoverKey(null);
    setPremoveSelectedId(null);
  }, [interactive]);
  const [noHopId, setNoHopId] = useState<string | null>(null);
  // Premove input is open while the opposing seat owns the turn and for the short
  // post-reply landing beat before live control resumes. This is client input in both
  // solo and lobby play; the authoritative move still commits through the store/relay.
  const premoveMode = (game.turn === remoteSide || premoveInputOpen) && !game.winner;
  // The ghost rides the cursor imperatively (per frame, no board re-render). When a drag-related
  // re-render DOES happen (pick-up, or the drop-target cell changing), React would otherwise
  // reset the ghost's inline position — so re-apply the last cursor after each such commit,
  // synchronously before paint, so the ghost never flicks back to its mount point.
  useLayoutEffect(() => {
    const ghost = ghostRef.current;
    if (drag && ghost) {
      ghost.style.left = `${lastCursorRef.current.x}px`;
      ghost.style.top = `${lastCursorRef.current.y}px`;
    }
  }, [drag, dropHoverKey, dropAimKey]);
  const selectedMoves = useMemo(() => {
    if (premoveMode || pendingPromotion || netMovePending || game.turn !== localSide || game.winner) return [];
    const piece = game.pieces.find((candidate) => candidate.id === selectedId && candidate.alive && candidate.side === localSide);
    return piece ? legalMoves(piece, game.pieces, game.size, env) : [];
  }, [env, game.pieces, game.size, game.turn, game.winner, netMovePending, pendingPromotion, premoveMode, selectedId, localSide]);
  const board = useMemo(() => buildSkirmishBoard(game, seed), [game, seed]);
  const exactBoard = useMemo(() => resolveBoardCode(game), [game.boardCode, game.size.cols, game.size.rows]);
  const predrawnOcclusionMasks = useMemo(
    () => exactBoard?.surface?.kind === 'predrawn'
      ? predrawnOcclusionMaskOps(exactBoard)
      : [],
    [exactBoard],
  );
  const predrawnPlate = useMemo<PredrawnBoardPlate | undefined>(() => {
    const surface = exactBoard?.surface;
    if (!surface) return undefined;
    return predrawnReview
      ? { surface, src: predrawnReview.src, registration: predrawnReview.registration }
      : runtimePredrawnBoardPlate(surface);
  }, [exactBoard, predrawnReview]);
  const predrawnCoverPolygon = useMemo(
    () => predrawnPlate ? predrawnBoardCoverPolygon(predrawnPlate, board.cells) : undefined,
    [board.cells, predrawnPlate],
  );
  const ambientSceneCover = !exactBoard;
  const sceneBoard = useMemo(() => sceneBoardForSkirmish(game, board, exactBoard), [board, exactBoard, game.props, game.size.cols, game.size.rows, game.terrain]);
  // Edge fences resolve from the authored board code (each shared edge → its upper-left cell's
  // E/S rail). Keyed "x,y" to match resolveFenceOverlays; empty for a generated/fence-free board.
  const fenceOverlays = useMemo<ReadonlyMap<string, ResolvedFenceOverlay>>(() => {
    return exactBoard ? resolveFenceOverlays(exactBoard.fences ?? {}) : new Map();
  }, [exactBoard]);
  const fencePosts = useMemo<ReadonlyMap<string, ResolvedFencePost>>(() => {
    return exactBoard ? resolveFencePosts(exactBoard.fences ?? {}, exactBoard.fencePosts ?? {}) : new Map();
  }, [exactBoard]);
  const wallOverlays = useMemo<ReadonlyMap<string, ResolvedWallOverlay>>(() => {
    return exactBoard ? resolveWallOverlays(exactBoard.walls ?? {}, { cols: game.size.cols, rows: game.size.rows }) : new Map();
  }, [exactBoard, game.size.cols, game.size.rows]);
  const wallArtUrls = useMemo(
    () => exactBoard ? wallArtSrcs(exactBoard.wallArt, { cols: game.size.cols, rows: game.size.rows }) : [],
    [exactBoard, game.size.cols, game.size.rows],
  );
  const livePieces = useMemo(
    // Prop colliders (`prop-…`) block movement but render as the tall PropSprite, not a unit
    // seat — exclude them so they don't paint an empty/phantom seat over their footprint cells.
    () => game.pieces.filter((piece) => piece.alive && !isPropCollider(piece)).sort((a, b) => a.x + a.y - (b.x + b.y)),
    [game.pieces],
  );
  const sceneUrls = useMemo(() => sceneArtUrls(sceneBoard, seed, ambientSceneCover), [ambientSceneCover, sceneBoard, seed]);
  // Hold the board hidden until its whole art set has decoded, then fade it in as one
  // unit — no per-tile popcorn (see render/boardArtReady). The signature is the tile set
  // (stable across moves), so this arms once per board/seed, not on every move.
  const boardArt = useMemo(
    () => collectBoardArt(
      board,
      livePieces,
      fenceOverlays,
      fencePosts,
      wallOverlays,
      wallArtUrls,
      sceneUrls,
      predrawnOcclusionMasks.map((op) => op.src),
      predrawnPlate?.src,
    ),
    [board, fenceOverlays, fencePosts, livePieces, predrawnOcclusionMasks, predrawnPlate?.src, sceneUrls, wallArtUrls, wallOverlays],
  );
  const boardReady = useBoardArtReveal(boardArt.urls, boardArt.signature);
  // Deploy arrival: once the board reveals, play the staggered drop ONCE per board. Keyed off
  // the tile signature so a new skirmish/replay re-arms it, but moves (signature stable) don't.
  const arrivalDelays = useMemo(() => computeArrivalDelays(livePieces), [livePieces]);
  // `arriving` is derived DURING render (not pushed from an effect) so `is-arriving` lands in
  // the SAME commit the board first reveals. If it lagged a commit, there'd be one painted
  // frame where units sit at their seats (the old "just appear" look) before the drop's
  // fill-mode hides them — reading as units appearing, vanishing, then dropping in. A timer
  // flips arrivalDone when the whole wave is done so the class comes off for normal play.
  const [arrivalDone, setArrivalDone] = useState(false);
  useEffect(() => { setArrivalDone(false); }, [boardArt.signature]);
  useEffect(() => {
    if (!boardReady || arrivalDone) return undefined;
    const done = window.setTimeout(() => setArrivalDone(true), ARRIVAL_TOTAL_MS);
    return () => window.clearTimeout(done);
  }, [boardReady, arrivalDone]);
  const arriving = boardReady && !arrivalDone;
  const focusPiece = useMemo(
    () => livePieces.find((piece) => piece.id === focusedId) ?? livePieces.find((piece) => piece.id === selectedId) ?? null,
    [focusedId, livePieces, selectedId],
  );
  const focusedMoves: Move[] = useMemo(
    () => (focusPiece ? legalMoves(focusPiece, game.pieces, game.size, env) : []),
    [env, focusPiece, game.pieces, game.size],
  );
  const overlayMoves = focusPiece ? focusedMoves : selectedMoves;
  const moveSet = useMemo(() => new Set((showMoves ? overlayMoves : []).map((move) => `${move.x},${move.y}`)), [overlayMoves, showMoves]);
  // Army-wide display layers driven by the in-match shortcut grid. Canonical sides stay
  // fixed on the board; only which side means "your" or "opponent" changes per client.
  const armyLayer = (enabled: boolean, tilesFor: (piece: Piece) => readonly Vec[], side: Side) => (
    enabled ? skirmishArmyOverlaySet(game.pieces, side, tilesFor) : new Set<string>()
  );
  const threatSet = useMemo(() => {
    if (!showEnemyAttacks) return new Set<string>();
    if (focusPiece?.side === remoteSide) {
      return new Set(attackedSquares(focusPiece, game.pieces, game.size, env).map((tile) => `${tile.x},${tile.y}`));
    }
    return armyLayer(true, (piece) => attackedSquares(piece, game.pieces, game.size, env), remoteSide);
  }, [env, focusPiece, game.pieces, game.size, remoteSide, showEnemyAttacks]);
  const blockedSet = useMemo(() => {
    if (!showBlocked || !focusPiece) return new Set<string>();
    const legal = new Set(overlayMoves.map((move) => `${move.x},${move.y}`));
    return new Set(blockedCandidateSquares(focusPiece, game.pieces, game.size, env).filter((tile) => !legal.has(`${tile.x},${tile.y}`)).map((tile) => `${tile.x},${tile.y}`));
  }, [env, focusPiece, game.pieces, game.size, overlayMoves, showBlocked]);
  const opponentMoveSet = useMemo(
    () => armyLayer(showEnemyMoves, (piece) => legalMoves(piece, game.pieces, game.size, env), remoteSide),
    [env, game.pieces, game.size, remoteSide, showEnemyMoves],
  );
  const localAttackSet = useMemo(
    () => armyLayer(showPlayerAttacks, (piece) => attackedSquares(piece, game.pieces, game.size, env), localSide),
    [env, game.pieces, game.size, localSide, showPlayerAttacks],
  );
  const localMoveSet = useMemo(
    () => armyLayer(showPlayerMoves, (piece) => legalMoves(piece, game.pieces, game.size, env), localSide),
    [env, game.pieces, game.size, localSide, showPlayerMoves],
  );
  const promotionZoneSet = useMemo(
    () => new Set((showPromotionZones ? game.promotionZones ?? [] : []).map((cell) => `${cell.x},${cell.y}`)),
    [game.promotionZones, showPromotionZones],
  );

  // Premoves: while the opponent is thinking or visibly landing a reply, the board accepts
  // a queued chain that fires one-per-turn as live control returns. The chain is built on the
  // PROVISIONAL board (current board + the moves already queued), so a later step sees the
  // piece where its earlier steps left it. See game/premoves. Projection is scoped to the
  // side this client commands, whether that canonical side is `player` or `enemy`.
  const provGame = useMemo(() => provisionalBoard(game, premoves, localSide), [game, localSide, premoves]);
  const premoveChain = useMemo(() => premoveArrows(game, premoves, localSide), [game, localSide, premoves]);
  const premoveTargetSet = useMemo(
    () => (premoveMode ? new Set(premoveTargets(game, premoves, premoveSelectedId, localSide).map((move) => `${move.x},${move.y}`)) : new Set<string>()),
    [premoveMode, game, localSide, premoves, premoveSelectedId],
  );
  const premoveDestSet = useMemo(() => new Set(premoveChain.map((a) => `${a.to.x},${a.to.y}`)), [premoveChain]);
  const premoveSelKey = useMemo(() => {
    if (!premoveMode || !premoveSelectedId) return null;
    const p = provGame.pieces.find((piece) => piece.id === premoveSelectedId && piece.alive && piece.side === localSide);
    return p ? `${p.x},${p.y}` : null;
  }, [localSide, premoveMode, premoveSelectedId, provGame.pieces]);
  const showStoreSelection = !premoveMode || !premoveSelectedId;
  // Pieces with a queued premove get TWO ghosts: the real piece dimmed in place (before) and a
  // translucent copy on its planned square (after). The before/origin square is also a precise
  // handle for continuing that unit's premove when several after-ghosts share one tile.
  const premovedIds = useMemo(() => {
    const owned = new Set(game.pieces.filter((piece) => piece.alive && piece.side === localSide).map((piece) => piece.id));
    return new Set(premoves.filter((step) => owned.has(step.pieceId)).map((step) => step.pieceId));
  }, [game.pieces, localSide, premoves]);
  const premovedOriginPieceAt = (x: number, y: number): Piece | null =>
    game.pieces.find((piece) => piece.alive && piece.side === localSide && premovedIds.has(piece.id) && piece.x === x && piece.y === y) ?? null;
  // Ghost units grouped by the square they land on — a ghost on every square each premoved unit
  // passes through, and when several units plan the same square they SHARE it (the tile splits
  // between them, up to 4) rather than one hiding the others.
  const afterGhosts = useMemo(() => premoveGhosts(game, premoves, localSide), [game, localSide, premoves]);
  const sharedPremoveGhostKeys = useMemo(
    () => new Set(afterGhosts.filter((group) => group.pieces.length > 1).map((group) => group.key)),
    [afterGhosts],
  );
  const provisionalLocalPieceAt = (x: number, y: number): Piece | null => {
    const key = `${x},${y}`;
    if (sharedPremoveGhostKeys.has(key)) return null;
    return provGame.pieces.find((piece) => piece.alive && piece.side === localSide && piece.x === x && piece.y === y) ?? null;
  };
  const premoveDraggablePieceAt = (x: number, y: number): Piece | null =>
    premovedOriginPieceAt(x, y) ?? provisionalLocalPieceAt(x, y);

  // The chain-building selection is only meaningful during the opponent's turn; when it
  // ends (a premove fires, or the player regains a live turn) drop it so the next enemy
  // turn starts clean.
  useEffect(() => { if (!premoveMode) setPremoveSelectedId(null); }, [premoveMode]);
  // Escape clears the whole queued chain (spec: chess-style cancel).
  useEffect(() => {
    if (!premoves.length && !premoveSelectedId) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { clearPremoves(); setPremoveSelectedId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [premoves.length, premoveSelectedId, clearPremoves]);

  // While a drag is live, the selected piece's legal squares always glow (even if the
  // View→moves overlay is off) so the player can see where the drop will land.
  const dragTargetSet = useMemo(
    () => new Set(drag ? selectedMoves.map((move) => `${move.x},${move.y}`) : []),
    [drag, selectedMoves],
  );

  const handleTile = (x: number, y: number) => {
    if (!interactive) {
      // A secondary same-seat tab remains useful for inspection, but cannot build a
      // selection, drag, premove, promotion, or move gesture.
      const inspected = game.pieces.find((piece) => piece.alive && piece.x === x && piece.y === y);
      if (inspected) focus(inspected.id);
      return;
    }
    // Opponent's turn: clicks build the premove chain instead of being ignored.
    if (pendingPromotion) return;
    if (premoveMode) {
      const key = `${x},${y}`;
      // A premoved unit's real/origin square is always a precise selection handle.
      // Treat it before legal-target clicks so tapping the dimmed original never
      // accidentally adds a return-to-origin step.
      const originalHere = premovedOriginPieceAt(x, y);
      if (originalHere) {
        setPremoveSelectedId(originalHere.id);
        select(originalHere.id);
        return;
      }
      // A legal target for the selected piece → queue the step.
      if (premoveSelectedId && premoveTargetSet.has(key)) { queueMove(premoveSelectedId, x, y); return; }
      // A single unshared provisional ghost selects that unit to continue premoving.
      // Shared ghost stacks are intentionally not picked from the stack; use the
      // original piece square to choose the exact unit.
      const here = provisionalLocalPieceAt(x, y);
      if (here) {
        setPremoveSelectedId(here.id);
        select(here.id);
        return;
      }
      // Clicking away from a unit or one of its legal premove targets dismisses the
      // active premove selection without throwing away moves that are already queued.
      setPremoveSelectedId(null);
      select(null);
      return;
    }
    const here = game.pieces.find((piece) => piece.alive && piece.x === x && piece.y === y);
    const intent = skirmishTileClickIntent(x, y, selectedMoves, here, localSide);
    switch (intent.kind) {
      case 'move':
        tryMoveTo(x, y);
        break;
      case 'select':
        // A piece THIS client commands — select it (own side; 'player' in single-player).
        select(intent.pieceId);
        break;
      case 'focus':
        // The opponent's living piece is an inspection focus; the player's movement
        // selection remains independent so returning focus can restore that context.
        focus(intent.pieceId);
        break;
      case 'clear-selection':
        // Chess-style cancellation: an invalid/empty destination removes the move dots and
        // focus instead of leaving the player locked onto a unit they no longer care about.
        select(null);
        break;
    }
  };

  // Map a viewport point to the board cell under it by testing the actual on-screen diamond
  // geometry. `elementFromPoint` is too sensitive to overlapping isometric hit boxes: near a
  // seam it can report a visually-front cell rather than the cell whose diamond contains the
  // cursor. Picking the most central containing diamond makes the highlight and drop target
  // stable under zoom, pan, and per-cell z-index.
  const cellFromPoint = (clientX: number, clientY: number): { x: number; y: number; btn: HTMLElement } | null => {
    let best: { x: number; y: number; btn: HTMLElement; score: number } | null = null;
    const cells = document.querySelectorAll<HTMLElement>('[data-testid="skirmish-board"] .skirmish-board-cell-hit');
    for (const btn of cells) {
      if (btn.dataset.cx === undefined || btn.dataset.cy === undefined) continue;
      const rect = btn.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const dx = Math.abs(clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const dy = Math.abs(clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      const score = dx + dy;
      if (score > 1.08) continue;
      if (best && score >= best.score) continue;
      const x = Number(btn.dataset.cx);
      const y = Number(btn.dataset.cy);
      if (Number.isFinite(x) && Number.isFinite(y)) best = { x, y, btn, score };
    }
    return best ? { x: best.x, y: best.y, btn: best.btn } : null;
  };
  const setDropKeys = (aimKey: string | null, hoverKey: string | null): void => {
    setDropAimKey((prev) => (prev === aimKey ? prev : aimKey));
    setDropHoverKey((prev) => (prev === hoverKey ? prev : hoverKey));
  };

  const onCellPointerDown = (cx: number, cy: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    // Right-click-and-hold always pans the board (ViewPane) — never swallow it, even on a unit.
    if (event.button === 2) return;
    if (!interactive) return;
    // Left press stays on the cell: stop it bubbling so ViewPane doesn't start a pan.
    event.stopPropagation();
    // One drag at a time: while a gesture is armed, ignore any second concurrent pointer (a
    // second finger) so it can't overwrite the single drag slot and strand the first drag.
    if (dragRef.current) return;
    // Don't let a press start a drag before the board is even visible (cold load = opacity:0
    // but still hit-testable) — you'd be dragging a piece you can't see.
    if (pendingPromotion || game.winner || !boardReady) return;
    // On your turn a drag MOVES from the live board; on the opponent's turn it queues a
    // PREMOVE from the provisional board. That makes a queued
    // after-ghost draggable from the square the player already moved it to.
    const canMove = game.turn === localSide && !premoveMode && !netMovePending;
    if (!canMove && !premoveMode) return;
    const piece = premoveMode
      ? premoveDraggablePieceAt(cx, cy)
      : livePieces.find((p) => p.x === cx && p.y === cy && p.side === localSide);
    if (!piece) return;
    // Pick it up: select (so the ring shows) and arm a potential drag. It only becomes a real
    // drag once the pointer crosses the threshold, so a plain tap still falls through to the
    // click handler unchanged. Targets are this move's legal squares, or — for a premove —
    // the provisional-board squares the piece could be queued to.
    if (canMove) {
      select(piece.id);
    } else {
      setPremoveSelectedId(piece.id);
      select(piece.id);
    }
    dragRef.current = {
      pointerId: event.pointerId,
      pieceId: piece.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      targets: new Set(
        (canMove ? legalMoves(piece, game.pieces, game.size, env) : premoveTargets(game, premoves, piece.id, localSide))
          .map((m) => `${m.x},${m.y}`),
      ),
      src: pieceImageSrc(piece),
      side: piece.side,
      premove: premoveMode,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture can fail if the pointer already ended; the gesture just no-ops */
    }
  };

  const updateDragPointer = (event: { pointerId: number; clientX: number; clientY: number }) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    lastCursorRef.current = { x: event.clientX, y: event.clientY };
    if (!d.active) {
      if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      // Board-space units now paint into the scene canvas; size the screen-space drag ghost
      // from the same seat dimensions, scaled by the current board zoom.
      setDrag({
        pieceId: d.pieceId,
        src: d.src,
        side: d.side,
        w: DEFAULT_GHOST_W * boardZoom,
        h: DEFAULT_GHOST_H * boardZoom,
      });
    }
    // Follow the cursor imperatively (no board re-render per frame).
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
    }
    // Show the interpreted cell even when it is not a legal drop; the green drop ring then
    // layers on top only for targets that will actually commit.
    const hit = cellFromPoint(event.clientX, event.clientY);
    const aimKey = hit ? `${hit.x},${hit.y}` : null;
    const dropKey = aimKey && d.targets.has(aimKey) ? aimKey : null;
    setDropKeys(aimKey, dropKey);
  };

  const finishDragPointer = (event: { pointerId: number; clientX: number; clientY: number }) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const releaseHit = cellFromPoint(event.clientX, event.clientY);
    const releaseAimKey = releaseHit ? `${releaseHit.x},${releaseHit.y}` : null;
    const releaseDropKey = releaseAimKey && d.targets.has(releaseAimKey) ? releaseAimKey : null;
    setDropKeys(null, null);
    if (!d.active) return; // a tap, not a drag — let the native click handle select/move
    // A completed drag emits a trailing click; swallow it so it doesn't re-select the piece.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    if (releaseHit && releaseDropKey) {
      if (d.premove) {
        // Opponent's turn: the drop queues a premove step (no board move now).
        queueMove(d.pieceId, releaseHit.x, releaseHit.y);
      } else {
        // Legal drop: land with no hop (the drag already showed the travel). noHopId is set in
        // the same handler as tryMoveTo so the destination render carries the suppress flag.
        setNoHopId(d.pieceId);
        window.setTimeout(() => setNoHopId(null), 0);
        select(d.pieceId);
        tryMoveTo(releaseHit.x, releaseHit.y);
      }
    }
    // Illegal drop (or released off the board): keep the piece selected so its move dots
    // stay up and the player can click a destination instead — just release the ghost.
    setDrag(null);
  };

  const cancelDragPointer = (event: { pointerId: number }) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDropKeys(null, null);
    if (d.active) setDrag(null);
  };

  const onCellPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    updateDragPointer(event);
  };

  const onCellPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    finishDragPointer(event);
  };

  const onCellPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    cancelDragPointer(event);
  };

  return (
    <div
      data-testid="skirmish-board"
      data-interactive={interactive ? 'true' : 'false'}
      className={`skirmish-board-lab ${boardReady ? '' : 'is-board-loading'} ${drag ? 'is-dragging' : ''} ${interactive ? '' : 'is-read-only'}`.trim()}
    >
      <ViewPane
        kind="board"
        ariaLabel="Skirmish board viewport"
        zoom={boardZoom}
        pan={boardPan}
        minZoom={0.55}
        maxZoom={boardMaxZoom}
        onZoomChange={setZoom}
        onPanChange={setBoardPan}
        coverPolygon={predrawnCoverPolygon}
        onMinimumZoomChange={setMinZoom}
      >
        <BoardLabBoard
          board={board}
          assetFrameSrc={tileFrameSrc}
          macroTiles={exactBoard?.macroTiles}
          boardZoom={boardZoom}
          boardPan={boardPan}
          className="skirmish-board-surface"
          ariaLabel="Skirmish board"
          showGrid={showGrid}
          predrawnPlate={predrawnPlate}
          sceneLayer={(
            <SkirmishSceneLayer
              sceneBoard={sceneBoard}
              seed={seed}
              ambientCover={ambientSceneCover}
              livePieces={livePieces}
              arriving={arriving}
              arrivalDelays={arrivalDelays}
              draggingId={drag?.pieceId ?? null}
              noHopId={noHopId}
              premovedIds={premovedIds}
              afterGhosts={afterGhosts}
              occlusionMasks={predrawnOcclusionMasks}
            />
          )}
          renderCellOverlay={({ cell }) => {
            if (!cell.asset && !cell.missing) return null;
            const key = `${cell.x},${cell.y}`;
            const state = [
              localMoveSet.has(key) ? 'is-player-move' : '',
              promotionZoneSet.has(key) ? 'is-promotion-zone' : '',
              opponentMoveSet.has(key) ? 'is-enemy-move' : '',
              localAttackSet.has(key) ? 'is-player-attack' : '',
              moveSet.has(key) || dragTargetSet.has(key) ? 'is-move' : '',
              threatSet.has(key) ? 'is-threat' : '',
              blockedSet.has(key) ? 'is-blocked-candidate' : '',
              premoveTargetSet.has(key) ? 'is-premove-target' : '',
              premoveDestSet.has(key) ? 'is-premove' : '',
              dropAimKey === key ? 'is-drop-aim' : '',
              dropHoverKey === key ? 'is-drop-hover' : '',
              showStoreSelection && game.pieces.some((piece) => piece.id === selectedId && piece.alive && piece.x === cell.x && piece.y === cell.y) ? 'is-selected' : '',
              premoveSelKey === key ? 'is-selected' : '',
              showStoreSelection && focusPiece && focusPiece.x === cell.x && focusPiece.y === cell.y ? 'is-focused-piece' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                type="button"
                className={`skirmish-board-cell-hit ${state}`}
                aria-label={`Tile ${cell.x},${cell.y}`}
                data-cx={cell.x}
                data-cy={cell.y}
                onPointerDown={(event) => onCellPointerDown(cell.x, cell.y, event)}
                onPointerMove={onCellPointerMove}
                onPointerUp={onCellPointerUp}
                onPointerCancel={onCellPointerCancel}
                onClick={() => {
                  // A drag emits a trailing click on release; the handler swallows it so the
                  // drop doesn't immediately re-select the piece it just moved. dragRef guards
                  // against a stray second-finger tap firing a move while a drag is in flight.
                  if (suppressClickRef.current || dragRef.current) return;
                  handleTile(cell.x, cell.y);
                }}
              />
            );
          }}
        >
          <PremoveArrowLayer arrows={premoveChain} />
        </BoardLabBoard>
      </ViewPane>
      {/* The picked-up piece rides the cursor in screen space. Portaled to <body> so the board's
          own CSS transform can't become its containing block and misplace the fixed positioning;
          pointer-events:none so drop hit-testing sees the cells underneath (see cellFromPoint).
          left/top are owned imperatively (per-frame move + the useLayoutEffect reconcile), never
          in JSX — so a mid-drag re-render can't reset the ghost to a stale mount position. */}
      {drag
        ? createPortal(
            <img
              ref={ghostRef}
              className={`skirmish-drag-ghost is-${drag.side}`}
              src={drag.src ?? undefined}
              alt=""
              draggable={false}
              style={{ width: drag.w, height: drag.h }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
